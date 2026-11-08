import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BadgeCheck,
  Clock,
  Flag,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  ShieldCheck,
  Star,
  ThumbsUp,
} from 'lucide-react';
import { db } from '../db/db';
import { createReport, endorseProvider } from '../db/repositories';
import { useCurrentProfile } from '../hooks';
import { distanceMeters, distanceWeight, formatCuadras, formatDistance } from '../lib/geo';
import { formatPhone, relativeTime, truncate } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  SectionHeader,
  Sheet,
  Textarea,
} from '../components/ui';
import { PageHeading } from '../components/PageBits';
import { MapView } from '../components/MapView';

function weightLabel(weight: number): string {
  if (weight >= 1) return 'Vecino a menos de 2 cuadras';
  if (weight >= 0.75) return 'Vecino a menos de 5 cuadras';
  if (weight >= 0.5) return 'Vecino a menos de 8 cuadras';
  return 'Vecino del distrito';
}

export function ProviderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile, points } = useCurrentProfile();
  const toast = useAppStore((state) => state.toast);

  const provider = useLiveQuery(
    () => (id ? db.providers.get(id) : undefined),
    [id],
  );
  const owner = useLiveQuery(
    () => (provider ? db.profiles.get(provider.profileId) : undefined),
    [provider?.profileId],
  );
  const endorsements = useLiveQuery(async () => {
    if (!id) return [];
    const rows = await db.endorsements
      .where('providerId')
      .equals(id)
      .toArray();
    return Promise.all(
      rows
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(async (endorsement) => ({
          endorsement,
          profile: await db.profiles.get(endorsement.endorserId),
        })),
    );
  }, [id]);

  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');

  if (!provider) {
    return (
      <div>
        <PageHeading title="Prestador" back={{ to: '/directorio', label: 'Directorio' }} />
        <EmptyState title="No encontramos este prestador" description="Puede haber sido retirado." />
      </div>
    );
  }

  const coords = { lat: profile?.lat ?? -12.083, lng: profile?.lng ?? -77.051 };
  const distance = distanceMeters(coords, { lat: provider.lat, lng: provider.lng });
  const weight = distanceWeight(distance);
  const own = profile?.id === provider.profileId;
  const already = endorsements?.some((item) => item.endorsement.endorserId === profile?.id);
  const phone = owner?.phone ? formatPhone(owner.phone) : '';
  const mapLink = `https://www.openstreetmap.org/?mlat=${provider.lat}&mlon=${provider.lng}#map=17/${provider.lat}/${provider.lng}`;

  const endorse = async () => {
    if (!profile) return;
    setBusy(true);
    const result = await endorseProvider(provider.id, profile, weight, comment);
    setBusy(false);
    if (result.ok) {
      toast({
        tone: 'success',
        title: 'Visto Bueno registrado',
        description: `Peso ${weight.toFixed(2)} por tu cercanía. ¡Gracias por validar la red!`,
      });
      setComment('');
    } else {
      toast({ tone: 'error', title: 'No se pudo registrar', description: result.reason });
    }
  };

  const sendReport = async () => {
    if (!profile || reportReason.trim().length < 5) return;
    await createReport('provider', provider.id, profile, reportReason);
    setReportOpen(false);
    setReportReason('');
    toast({
      tone: 'info',
      title: 'Reporte enviado',
      description: 'Un coordinador revisará este perfil.',
    });
  };

  return (
    <div className="space-y-4">
      <PageHeading title="Ficha del prestador" back={{ to: '/directorio', label: 'Directorio' }} />

      <Card className="overflow-hidden p-0">
        <div className="p-5">
          <div className="flex items-start gap-3">
            <Avatar
              name={owner?.name ?? provider.trade}
              color={owner?.avatarColor}
              size="xl"
              verified={provider.verified === 1}
            />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold leading-tight tracking-tight text-slate-900">
                {owner?.name ?? 'Prestador'}
              </h1>
              <p className="text-xs font-medium text-slate-500">{provider.trade}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                  <Star size={11} className="fill-amber-500 text-amber-500" />
                  {provider.score.toFixed(1)} · {provider.endorsementCount} vistos buenos
                </span>
                {provider.verified === 1 ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                    <BadgeCheck size={11} />
                    Verificado
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-200 text-center">
            <div className="px-2 py-2.5">
              <p className="text-sm font-semibold text-slate-900">{formatDistance(distance)}</p>
              <p className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Distancia</p>
            </div>
            <div className="px-2 py-2.5">
              <p className="text-sm font-semibold text-slate-900">{provider.coverageRadiusM} m</p>
              <p className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Cobertura</p>
            </div>
            <div className="px-2 py-2.5">
              <p className="text-sm font-semibold text-slate-900">{provider.endorsementCount}</p>
              <p className="text-[9px] uppercase tracking-[0.1em] text-slate-400">Validaciones</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <p className="text-sm leading-relaxed text-slate-600">{provider.description}</p>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <MapPin size={13} className="text-slate-400" />
              {provider.district} · {formatCuadras(distance)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock size={13} className="text-slate-400" />
              {provider.schedule}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <a
              href={phone ? `tel:${phone}` : undefined}
              className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg bg-slate-900 text-white"
            >
              <Phone size={16} />
              <span className="text-[10px] font-semibold">Llamar</span>
            </a>
            <a
              href={phone ? `https://wa.me/51${phone.replace(/^51/, '')}` : undefined}
              target="_blank"
              rel="noreferrer"
              className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-300 bg-white text-slate-700"
            >
              <MessageCircle size={16} />
              <span className="text-[10px] font-semibold">WhatsApp</span>
            </a>
            <a
              href={mapLink}
              target="_blank"
              rel="noreferrer"
              className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-300 bg-white text-slate-700"
            >
              <Navigation size={16} />
              <span className="text-[10px] font-semibold">Ruta</span>
            </a>
          </div>
        </div>
      </Card>

      <div>
        <SectionHeader title="Ubicación referencial" description="Radio de cobertura del prestador" />
        <MapView
          center={{ lat: provider.lat, lng: provider.lng }}
          points={[
            {
              id: provider.id,
              lat: provider.lat,
              lng: provider.lng,
              label: provider.trade,
              description: owner?.name,
              tone: 'provider',
            },
          ]}
          radiusM={provider.coverageRadiusM}
          height="210px"
        />
      </div>

      <Card>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Visto Bueno vecinal</h2>
          <Badge tone="brand">{provider.endorsementCount} validaciones</Badge>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          Solo vecinos pueden validar, una vez por persona. El peso depende de la distancia:
          a menos cuadras, más peso.
        </p>

        {own ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700">
            Este es tu oficio. Comparte tu ficha con tus vecinos para recibir Vistos Buenos.
          </div>
        ) : already ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-800">
            <ShieldCheck size={15} />
            Ya validaste a este prestador. ¡Gracias!
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              <ThumbsUp size={14} className="text-slate-400" />
              Tu validación pesará <strong>{weight.toFixed(2)}</strong> · {weightLabel(weight)}
            </div>
            <Textarea
              placeholder="¿Cómo fue el trabajo? (opcional pero útil)"
              value={comment}
              maxLength={160}
              onChange={(event) => setComment(event.target.value)}
              className="min-h-[72px]"
            />
            <Button full onClick={() => void endorse()} loading={busy} disabled={Boolean(already)}>
              <ThumbsUp size={16} />
              Dar mi Visto Bueno
            </Button>
          </div>
        )}
      </Card>

      <div>
        <SectionHeader
          title="Lo que dicen los vecinos"
          description={`${endorsements?.length ?? 0} opiniones`}
        />
        <div className="space-y-2">
          {endorsements?.map(({ endorsement, profile: endorser }) => (
            <Card key={endorsement.id} className="flex items-start gap-3 p-3.5">
              <Avatar
                name={endorser?.name ?? 'Vecino'}
                color={endorser?.avatarColor}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-slate-900">
                    {endorser?.name ?? 'Vecino'}
                  </p>
                  <span className="shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    peso {endorsement.weight.toFixed(2)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {endorsement.comment || 'Sin comentario.'}
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  {relativeTime(endorsement.createdAt)} · {weightLabel(endorsement.weight)}
                </p>
              </div>
            </Card>
          ))}
          {endorsements && endorsements.length === 0 ? (
            <EmptyState title="Aún no hay Vistos Buenos" description="Sé el primero en validar." />
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setReportOpen(true)}
        className="mx-auto flex items-center gap-1.5 rounded-md px-4 py-2 text-[11px] font-semibold text-slate-400 hover:text-crisis-600"
      >
        <Flag size={13} />
        Reportar este perfil
      </button>

      <Sheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Reportar perfil"
        description="Un coordinador revisará el caso."
        footer={
          <Button
            full
            variant="danger"
            onClick={() => void sendReport()}
            disabled={reportReason.trim().length < 5}
          >
            Enviar reporte
          </Button>
        }
      >
        <Textarea
          label="Motivo"
          placeholder="Cuéntanos qué pasó…"
          value={reportReason}
          onChange={(event) => setReportReason(event.target.value)}
        />
        <p className="mt-2 text-[11px] text-slate-500">
          Tu reporte es anónimo para el prestador. Los coordinadores reciben una notificación.
        </p>
        {points < 0 ? <p className="mt-2 text-xs text-crisis-600">Reputación insuficiente.</p> : null}
      </Sheet>

      <p className="pb-2 text-center text-[10px] text-slate-400">
        {truncate('Los datos de contacto son provistos por el propio vecino.', 80)}
      </p>

      <Link to="/directorio" className="sr-only">
        Volver al directorio
      </Link>
    </div>
  );
}
