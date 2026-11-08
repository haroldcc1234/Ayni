import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CheckCircle2,
  Eye,
  Inbox,
  Package,
  Plus,
  RotateCcw,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import { db } from '../db/db';
import { hideListing, setListingStatus } from '../db/repositories';
import { useCurrentProfile } from '../hooks';
import { isExchange } from '../economy/points';
import { LISTING_STATUS_LABEL, LISTING_TYPE_ICON, LISTING_TYPE_LABEL, cn, relativeTime, truncate } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { Badge, Button, Card, Chip, EmptyState } from '../components/ui';
import { PageHeading, StatCard } from '../components/PageBits';

type Tab = 'active' | 'completed' | 'hidden' | 'all';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'active', label: 'Activas' },
  { key: 'completed', label: 'Completadas' },
  { key: 'hidden', label: 'Ocultas' },
  { key: 'all', label: 'Todas' },
];

function belongsToTab(status: string, hidden: number | undefined, tab: Tab): boolean {
  if (tab === 'all') return true;
  if (tab === 'hidden') return hidden === 1 || status === 'hidden';
  if (tab === 'completed') return status === 'completed' || status === 'expired';
  return ['open', 'reserved', 'in_progress'].includes(status) && hidden !== 1;
}

export function MyListingsPage() {
  const { profile } = useCurrentProfile();
  const toast = useAppStore((state) => state.toast);
  const openPublish = useAppStore((state) => state.openPublish);
  const [tab, setTab] = useState<Tab>('active');
  const [busyId, setBusyId] = useState('');

  const rows = useLiveQuery(async () => {
    if (!profile) return [];
    const listings = await db.listings.where('authorId').equals(profile.id).toArray();
    return Promise.all(
      listings
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(async (listing) => {
          const requests = await db.requests.where('listingId').equals(listing.id).toArray();
          return {
            listing,
            pending: requests.filter((item) => item.status === 'pending').length,
            total: requests.length,
          };
        }),
    );
  }, [profile?.id]);

  const filtered = useMemo(
    () => (rows ?? []).filter(({ listing }) => belongsToTab(listing.status, listing.hidden, tab)),
    [rows, tab],
  );

  const counters = useMemo(() => {
    const all = rows ?? [];
    return {
      active: all.filter(({ listing }) => belongsToTab(listing.status, listing.hidden, 'active')).length,
      completed: all.filter(({ listing }) =>
        belongsToTab(listing.status, listing.hidden, 'completed'),
      ).length,
      hidden: all.filter(({ listing }) => belongsToTab(listing.status, listing.hidden, 'hidden')).length,
      requests: all.reduce((sum, item) => sum + item.pending, 0),
    };
  }, [rows]);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId('');
    }
  };

  return (
    <div>
      <PageHeading
        title="Mis publicaciones"
        subtitle="Gestiona lo que ofreces y lo que necesitas del barrio."
        back={{ to: '/perfil', label: 'Mi perfil' }}
        action={
          <Button size="sm" onClick={() => openPublish('auto')}>
            <Plus size={15} />
            Publicar
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-4 gap-2">
        <StatCard value={counters.active} label="Activas" tone="brand" />
        <StatCard value={counters.completed} label="Cerradas" />
        <StatCard value={counters.hidden} label="Ocultas" />
        <StatCard value={counters.requests} label="Por responder" />
      </div>

      <div className="hide-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((item) => (
          <Chip key={item.key} active={tab === item.key} onClick={() => setTab(item.key)}>
            {item.label}
          </Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Package size={34} />}
          title={tab === 'active' ? 'No tienes publicaciones activas' : 'Nada por aquí'}
          description={
            tab === 'active'
              ? 'Publica un préstamo, una donación, un favor o un oficio. Todo se guarda en tu dispositivo.'
              : 'Cuando muevas publicaciones entre estados aparecerán en esta pestaña.'
          }
          action={
            <Button size="sm" onClick={() => openPublish('auto')}>
              <Plus size={15} />
              Crear publicación
            </Button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map(({ listing, pending, total }) => {
            const hidden = listing.hidden === 1 || listing.status === 'hidden';
            const closed = listing.status === 'completed' || listing.status === 'expired';
            return (
              <Card key={listing.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xl">
                    {LISTING_TYPE_ICON[listing.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="brand">{LISTING_TYPE_LABEL[listing.type]}</Badge>
                      <Badge
                        tone={hidden ? 'neutral' : closed ? 'success' : listing.status === 'reserved' ? 'warning' : 'info'}
                      >
                        {LISTING_STATUS_LABEL[listing.status]}
                      </Badge>
                      {pending > 0 ? (
                        <Badge tone="warning">
                          <Inbox size={11} />
                          {pending} nueva{pending === 1 ? '' : 's'}
                        </Badge>
                      ) : null}
                    </div>
                    <h2 className="mt-1 text-sm font-semibold leading-snug text-slate-900">
                      {listing.title}
                    </h2>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
                      {truncate(listing.description, 130)}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-400">
                      <span>{listing.district}</span>
                      <span>·</span>
                      <span>{relativeTime(listing.createdAt)}</span>
                      <span>·</span>
                      <span>
                        {total} solicitud{total === 1 ? '' : 'es'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to={`/muro/${listing.id}`}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <Eye size={14} />
                    Ver detalle
                  </Link>

                  {!hidden && !closed && !isExchange(listing.type) ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busyId === listing.id}
                      onClick={() =>
                        void run(listing.id, async () => {
                          await setListingStatus(listing.id, 'completed');
                          toast({
                            tone: 'success',
                            title: 'Publicación completada',
                            description: 'Ya no aparecerá como disponible en el muro.',
                          });
                        })
                      }
                    >
                      <CheckCircle2 size={14} />
                      Completar
                    </Button>
                  ) : null}

                  {closed && !hidden && !isExchange(listing.type) ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busyId === listing.id}
                      onClick={() =>
                        void run(listing.id, async () => {
                          await setListingStatus(listing.id, 'open');
                          toast({ tone: 'success', title: 'Publicación reabierta' });
                        })
                      }
                    >
                      <RotateCcw size={14} />
                      Reabrir
                    </Button>
                  ) : null}

                  {!hidden && (!isExchange(listing.type) || listing.status === 'open') ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busyId === listing.id}
                      onClick={() =>
                        void run(listing.id, async () => {
                          if (!profile) return;
                          await hideListing(listing.id, profile.id);
                          toast({ tone: 'info', title: 'Publicación oculta' });
                        })
                      }
                    >
                      <ShieldOff size={14} />
                      Ocultar
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className={cn('mt-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-[11px] leading-relaxed', 'border-slate-200 bg-white text-slate-500')}>
        <Trash2 size={14} className="mt-0.5 shrink-0 text-slate-400" />
        <span>
          Ocultar una publicación no la borra: deja de ser visible en el muro y conserva las
          solicitudes para tu historial.
        </span>
      </div>
    </div>
  );
}
