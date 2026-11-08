import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDownLeft, ArrowUpRight, Inbox, RefreshCw } from 'lucide-react';
import { db } from '../db/db';
import type { RequestEntity, RequestStatus } from '../db/types';
import {
  cancelRequest,
  completeRequest,
  respondRequest,
} from '../db/repositories';
import { useCurrentProfile } from '../hooks';
import { REQUEST_STATUS_LABEL } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { RequestCard } from '../components/cards';
import { Button, Card, Chip, EmptyState, Spinner } from '../components/ui';
import { PageHeading, StatCard } from '../components/PageBits';

type Perspective = 'incoming' | 'outgoing';
type Filter = 'all' | 'pending' | 'active' | 'closed';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Todas' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'active', label: 'En curso' },
  { key: 'closed', label: 'Cerradas' },
];

function matches(filter: Filter, status: RequestStatus): boolean {
  if (filter === 'all') return true;
  if (filter === 'pending') return status === 'pending';
  if (filter === 'active') return status === 'accepted' || status === 'in_progress';
  return status === 'completed' || status === 'rejected' || status === 'cancelled';
}

export function MyRequestsPage() {
  const { profile, loading } = useCurrentProfile();
  const toast = useAppStore((state) => state.toast);
  const [perspective, setPerspective] = useState<Perspective>('incoming');
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState('');

  const data = useLiveQuery(async () => {
    if (!profile) return { incoming: [], outgoing: [] };

    const enrich = async (rows: RequestEntity[]) =>
      Promise.all(
        rows.filter(row => !row.meta.recommendedName)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(async (request) => ({
            request,
            listing: await db.listings.get(request.listingId),
            requester: await db.profiles.get(request.requesterId),
            owner: await db.profiles.get(request.ownerId),
          })),
      );

    const [incoming, outgoing] = await Promise.all([
      db.requests.where('ownerId').equals(profile.id).toArray(),
      db.requests.where('requesterId').equals(profile.id).toArray(),
    ]);

    return { incoming: await enrich(incoming), outgoing: await enrich(outgoing) };
  }, [profile?.id]);

  const current = perspective === 'incoming' ? data?.incoming ?? [] : data?.outgoing ?? [];

  const filtered = useMemo(
    () => current.filter(({ request }) => matches(filter, request.status)),
    [current, filter],
  );

  const counters = useMemo(() => {
    const incoming = data?.incoming ?? [];
    const outgoing = data?.outgoing ?? [];
    return {
      pending: incoming.filter((item) => item.request.status === 'pending').length,
      active: [...incoming, ...outgoing].filter(
        (item) => item.request.status === 'accepted' || item.request.status === 'in_progress',
      ).length,
      completed: [...incoming, ...outgoing].filter(
        (item) => item.request.status === 'completed',
      ).length,
      outgoing: outgoing.length,
    };
  }, [data]);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId('');
    }
  };

  const handleRespond = (id: string, decision: 'accepted' | 'rejected') =>
    run(id, async () => {
      if (!profile) return;
      const result = await respondRequest(id, profile, decision);
      toast(
        result.ok
          ? {
              tone: 'success',
              title: decision === 'accepted' ? 'Solicitud aceptada' : 'Solicitud rechazada',
              description:
                decision === 'accepted'
                  ? 'El vecino fue notificado. Coordinen la entrega.'
                  : 'El vecino fue notificado.',
            }
          : { tone: 'error', title: 'No se pudo responder', description: result.reason },
      );
    });

  const handleComplete = (id: string) =>
    run(id, async () => {
      if (!profile) return;
      const result = await completeRequest(id, profile);
      toast(
        result.ok
          ? {
              tone: 'success',
              title: 'Solicitud completada',
              description: 'Se sumaron puntos de reputación al barrio.',
            }
          : { tone: 'error', title: 'No se pudo completar', description: result.reason },
      );
    });

  const handleCancel = (id: string) =>
    run(id, async () => {
      if (!profile) return;
      await cancelRequest(id, profile);
      toast({ tone: 'info', title: 'Solicitud cancelada' });
    });

  if (loading) {
    return (
      <div>
        <PageHeading title="Mis solicitudes" back={{ to: '/perfil', label: 'Mi perfil' }} />
        <Card className="flex justify-center py-10">
          <Spinner />
        </Card>
      </div>
    );
  }

  if (!profile) {
    return (
      <div>
        <PageHeading title="Mis solicitudes" back={{ to: '/perfil', label: 'Mi perfil' }} />
        <EmptyState title="No hay un perfil activo" description="Crea un perfil para solicitar y ofrecer ayuda." />
      </div>
    );
  }

  return (
    <div>
      <PageHeading
        title="Mis solicitudes"
        subtitle="Coordina entregas, devoluciones y horas de banco de tiempo."
        back={{ to: '/perfil', label: 'Mi perfil' }}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFilter('all');
              setPerspective((value) => (value === 'incoming' ? 'outgoing' : 'incoming'));
            }}
          >
            <RefreshCw size={14} />
            {perspective === 'incoming' ? 'Ver enviadas' : 'Ver recibidas'}
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-4 gap-2">
        <StatCard value={counters.pending} label="Por responder" tone="brand" />
        <StatCard value={counters.active} label="En curso" />
        <StatCard value={counters.completed} label="Completadas" />
        <StatCard value={counters.outgoing} label="Enviadas" />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setPerspective('incoming')}
          className={
            perspective === 'incoming'
              ? 'flex h-10 items-center justify-center gap-1.5 rounded-md bg-slate-900 text-xs font-semibold text-white'
              : 'flex h-10 items-center justify-center gap-1.5 rounded-md text-xs font-semibold text-slate-500 hover:text-slate-900'
          }
        >
          <ArrowDownLeft size={15} />
          Recibidas
        </button>
        <button
          type="button"
          onClick={() => setPerspective('outgoing')}
          className={
            perspective === 'outgoing'
              ? 'flex h-10 items-center justify-center gap-1.5 rounded-md bg-slate-900 text-xs font-semibold text-white'
              : 'flex h-10 items-center justify-center gap-1.5 rounded-md text-xs font-semibold text-slate-500 hover:text-slate-900'
          }
        >
          <ArrowUpRight size={15} />
          Enviadas
        </button>
      </div>

      <div className="hide-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map((item) => (
          <Chip key={item.key} active={filter === item.key} onClick={() => setFilter(item.key)}>
            {item.label}
          </Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Inbox size={34} />}
          title={
            perspective === 'incoming'
              ? 'No hay solicitudes recibidas'
              : 'No has enviado solicitudes'
          }
          description={
            perspective === 'incoming'
              ? 'Cuando alguien pida tu publicación aparecerá aquí para que aceptes o rechaces.'
              : 'Explora el muro solidario y solicita lo que necesites. Máximo 3 solicitudes abiertas.'
          }
          action={
            <Link
              to={perspective === 'incoming' ? '/perfil/publicaciones' : '/muro'}
              className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white"
            >
              {perspective === 'incoming' ? 'Ver mis publicaciones' : 'Ir al muro'}
            </Link>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map(({ request, listing, requester, owner }) => (
            <div key={request.id} className={busyId === request.id ? 'opacity-60' : ''}>
              <RequestCard
                request={request}
                listing={listing}
                requester={requester}
                owner={owner}
                perspective={perspective}
                onAccept={() => void handleRespond(request.id, 'accepted')}
                onReject={() => void handleRespond(request.id, 'rejected')}
                onComplete={() => void handleComplete(request.id)}
                onCancel={() => void handleCancel(request.id)}
              />
              <p className="px-2 pt-1 text-[10px] text-slate-400">
                {perspective === 'incoming' ? 'Solicitante' : 'Publicación de'}:{' '}
                {perspective === 'incoming' ? requester?.name ?? 'Vecino' : owner?.name ?? 'Vecino'} ·{' '}
                {REQUEST_STATUS_LABEL[request.status]}
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 rounded-lg bg-white px-4 py-3 text-[11px] leading-relaxed text-slate-500 ">
        Regla anti-free-riding: puedes tener hasta 3 solicitudes abiertas. Los préstamos de alto
        valor requieren al menos 5 puntos de reputación.
      </p>
    </div>
  );
}
