import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flag,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  ShieldOff,
  Sparkles,
  Users,
} from 'lucide-react';
import { db } from '../db/db';
import type { RequestMeta } from '../db/types';
import {
  cancelRequest,
  completeRequest,
  createReport,
  createRequest,
  hideListing,
  respondRequest,
  setListingStatus,
} from '../db/repositories';
import { useCurrentProfile } from '../hooks';
import { distanceMeters, formatCuadras, formatDistance } from '../lib/geo';
import {
  LISTING_STATUS_LABEL,
  LISTING_TYPE_ICON,
  LISTING_TYPE_LABEL,
  formatDateTime,
  formatPhone,
  relativeTime,
} from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { AudioPlayer } from '../components/AudioPlayer';
import { isExchange } from '../economy/points';
import { ExchangeActions } from '../economy/ExchangeActions';
import { MapView } from '../components/MapView';
import { RequestCard } from '../components/cards';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  SectionHeader,
  Sheet,
  Textarea,
} from '../components/ui';
import { PageHeading } from '../components/PageBits';

import { RecommendationThread } from '../components/RecommendationThread';
import { isExpired, soles } from '../lib/catalog';
import { inScope, useVisibleSectors, useCatalogClock } from '../hooks/territory';

export function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useCurrentProfile();
  const sectors = useVisibleSectors(profile);
  const now = useCatalogClock();
  const toast = useAppStore((state) => state.toast);

  const listing = useLiveQuery(() => (id ? db.listings.get(id) : undefined), [id]);
  const author = useLiveQuery(
    () => (listing ? db.profiles.get(listing.authorId) : undefined),
    [listing?.authorId],
  );

  const requests = useLiveQuery(async () => {
    if (!id) return [];
    const rows = await db.requests
      .where('listingId')
      .equals(id)
      .toArray();
    return Promise.all(
      rows
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(async (request) => ({
          request,
          requester: await db.profiles.get(request.requesterId),
        })),
    );
  }, [id]);

  const [requestOpen, setRequestOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [hours, setHours] = useState('1');
  const [seats, setSeats] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');

  if (!listing || (listing.authorId !== profile?.id && (listing.hidden || !inScope(sectors, listing)))) {
    return (
      <div>
        <PageHeading title="Publicación" back={{ to: '/muro', label: 'Muro' }} />
        <EmptyState title="No encontramos esta publicación" description="Quizá fue retirada." />
      </div>
    );
  }

  const own = profile?.id === listing.authorId;
  const myRequest = requests?.find((item) => item.request.requesterId === profile?.id)?.request;
  const acceptedRequest = myRequest && ['accepted', 'in_progress'].includes(myRequest.status) ? myRequest : undefined;
  const coords = { lat: profile?.lat ?? -12.083, lng: profile?.lng ?? -77.051 };
  const distance = distanceMeters(coords, { lat: listing.lat, lng: listing.lng });
  const phone = author?.phone ? formatPhone(author.phone) : '';

  const metaRows: Array<[string, string | undefined]> = [
    ['Puntos solidarios', listing.meta.wallet?.crisis ? 'Ayuda en emergencia, sin costo' : listing.meta.pointsCost ? String(listing.meta.pointsCost) : undefined],
    ['Precio', listing.meta.price !== undefined ? soles(listing.meta.price) : undefined],
    ['Catálogo', listing.type === 'promotion' ? (listing.expiresAt ? 'Hasta ' + formatDateTime(listing.expiresAt) : 'Permanente') : undefined],
    ['Alquiler por hora', listing.meta.hourlyRate ? soles(listing.meta.hourlyRate) : undefined],
    ['Condición', listing.meta.condition],
    ['Devolver antes de', listing.meta.returnBy ? formatDateTime(listing.meta.returnBy) : undefined],
    ['Cantidad', listing.meta.quantity],
    ['Vence', listing.meta.expiresAt ? formatDateTime(listing.meta.expiresAt) : undefined],
    ['Horas', listing.meta.hours ? `${listing.meta.hours} h` : undefined],
    ['Habilidad', listing.meta.skill],
    ['Modalidad', listing.meta.modality],
    ['Origen', listing.meta.origin],
    ['Destino', listing.meta.destination],
    ['Salida', listing.meta.departureAt ? formatDateTime(listing.meta.departureAt) : undefined],
    ['Cupos', listing.meta.seats ? String(listing.meta.seats) : undefined],
    ['Fecha límite', listing.meta.deadline ? formatDateTime(listing.meta.deadline) : undefined],
    ['Oficio', listing.meta.trade],
    ['Horario', listing.meta.schedule],
    ['Cobertura', listing.meta.coverageRadiusM ? `${listing.meta.coverageRadiusM} m` : undefined],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  const sendRequest = async () => {
    if (!profile) return;
    if (message.trim().length < 5) {
      toast({ tone: 'warning', title: 'Escribe un mensaje', description: 'Mínimo 5 caracteres.' });
      return;
    }
    const meta: RequestMeta = {
      note: note.trim() || undefined,
      hours: listing.type === 'time_bank' ? Math.max(1, Number(hours) || 1) : undefined,
      seats: listing.type === 'mobility' ? Math.max(1, Number(seats) || 1) : undefined,
    };
    setBusy(true);
    const result = await createRequest({
      listingId: listing.id,
      requester: profile,
      message,
      meta,
    });
    setBusy(false);
    if (result.ok) {
      setRequestOpen(false);
      setMessage('');
      setNote('');
      toast({
        tone: 'success',
        title: 'Solicitud enviada',
        description: `${author?.name ?? 'El vecino'} recibirá tu pedido. Te avisaremos si acepta.`,
      });
    } else {
      toast({ tone: 'error', title: 'No se pudo enviar', description: result.reason });
    }
  };

  const handleRespond = async (requestId: string, decision: 'accepted' | 'rejected') => {
    if (!profile) return;
    const result = await respondRequest(requestId, profile, decision);
    toast(
      result.ok
        ? {
            tone: 'success',
            title: decision === 'accepted' ? 'Solicitud aceptada' : 'Solicitud rechazada',
            description: 'Se notificó al vecino.',
          }
        : { tone: 'error', title: 'No se pudo responder', description: result.reason },
    );
  };

  const handleComplete = async (requestId: string) => {
    if (!profile) return;
    const result = await completeRequest(requestId, profile);
    toast(
      result.ok
        ? {
            tone: 'success',
            title: 'Intercambio completado',
            description: 'Se sumaron puntos de reputación a ambas partes.',
          }
        : { tone: 'error', title: 'No se pudo completar', description: result.reason },
    );
  };

  const sendReport = async () => {
    if (!profile || reportReason.trim().length < 5) return;
    await createReport('listing', listing.id, profile, reportReason);
    setReportOpen(false);
    setReportReason('');
    toast({ tone: 'info', title: 'Reporte enviado', description: 'Un coordinador lo revisará.' });
  };

  return (
    <div className="space-y-4">
      <PageHeading title="Publicación" back={{ to: '/muro', label: 'Muro solidario' }} />

      <Card className="p-0">
        <div className="border-b border-slate-100 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-2xl">
              {LISTING_TYPE_ICON[listing.type]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="brand">{LISTING_TYPE_LABEL[listing.type]}</Badge>
                <Badge tone={listing.status === 'open' ? 'success' : listing.status === 'completed' ? 'info' : 'warning'}>
                  {LISTING_STATUS_LABEL[listing.status === 'open' && isExpired(listing, now) ? 'expired' : listing.status]}
                </Badge>
                {listing.syncStatus === 'conflict' ? (
                  <Link to="/demo">
                    <Badge tone="danger">
                      <AlertTriangle size={11} /> conflicto
                    </Badge>
                  </Link>
                ) : null}
              </div>
              <h1 className="mt-1.5 text-lg font-semibold leading-tight text-slate-900">
                {listing.title}
              </h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                <span>{listing.category}</span>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin size={11} />
                  {listing.district} · {formatDistance(distance)} ({formatCuadras(distance)})
                </span>
                <span className="text-slate-300">·</span>
                <span>{relativeTime(listing.createdAt)}</span>
              </p>
            </div>
          </div>

          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">
            {listing.description}
          </p>

          {listing.audio ? (
            <AudioPlayer
              blob={listing.audio}
              duration={listing.audioDuration}
              className="mt-3"
            />
          ) : null}

          {metaRows.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {metaRows.map(([label, value]) => (
                <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {label}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-800">{value}</p>
                </div>
              ))}
            </div>
          ) : null}

          {listing.meta.highValue ? (
            <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
              <Sparkles size={14} />
              Bien de alto valor: se requieren al menos 5 puntos de reputación.
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3 p-4">
          <Avatar name={author?.name ?? 'Vecino'} color={author?.avatarColor} size="md" verified={author?.verified === 1} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{author?.name ?? 'Vecino'}</p>
            <p className="truncate text-[11px] text-slate-500">
              {author?.zone || author?.district}
            </p>
          </div>
          {own ? <Badge tone="brand">Tu publicación</Badge> : null}
        </div>
      </Card>

      <MapView
        center={{ lat: listing.lat, lng: listing.lng }}
        points={[
          {
            id: listing.id,
            lat: listing.lat,
            lng: listing.lng,
            label: listing.title,
            description: `${LISTING_TYPE_LABEL[listing.type]} · ${listing.district}`,
            tone: 'listing',
          },
        ]}
        radiusM={800}
        height="200px"
      />

      {own && (!isExchange(listing.type) || listing.status === 'open') ? (
        <Card>
          <h2 className="text-sm font-semibold text-slate-900">Gestionar publicación</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {listing.status === 'open'
              ? 'Puedes cerrarla cuando ya no esté disponible.'
              : `Estado actual: ${LISTING_STATUS_LABEL[listing.status]}.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {listing.status !== 'completed' && listing.status !== 'hidden' ? (
              <>
                {!isExchange(listing.type) && <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await setListingStatus(listing.id, 'completed');
                    toast({ tone: 'success', title: 'Publicación completada' });
                  }}
                >
                  <CheckCircle2 size={15} />
                  Marcar completada
                </Button>}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (!profile) return;
                    await hideListing(listing.id, profile.id);
                    toast({ tone: 'info', title: 'Publicación oculta' });
                  }}
                >
                  <ShieldOff size={15} />
                  Ocultar
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await setListingStatus(listing.id, 'open');
                  toast({ tone: 'success', title: 'Publicación reactivada' });
                }}
              >
                Reabrir publicación
              </Button>
            )}
          </div>
        </Card>
      ) : null}

      {listing.type === 'recommendation' && <RecommendationThread listing={listing} profile={profile} />}
      {!own && listing.type !== 'recommendation' && (acceptedRequest || (listing.status === 'open' && !isExpired(listing, now))) ? (
        <Card className="border-slate-300 bg-slate-50">
          {acceptedRequest ? (
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                <CheckCircle2 size={15} className="mr-1 inline" />
                Solicitud aceptada
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Coordinen la entrega con {author?.name ?? 'el vecino'}. Confirma el cierre cuando
                terminen.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a
                  href={phone ? `tel:${phone}` : undefined}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-xs font-semibold text-white"
                >
                  <Phone size={15} /> Llamar
                </a>
                <a
                  href={phone ? `https://wa.me/51${phone.replace(/^51/, '')}` : undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                >
                  <MessageCircle size={15} /> WhatsApp
                </a>
              </div>
              {isExchange(listing.type) ? <div className="mt-3"><ExchangeActions listing={listing} request={acceptedRequest} /></div> : <Button
                full
                variant="secondary"
                className="mt-2"
                onClick={() => void handleComplete(acceptedRequest.id)}
              >
                Confirmar devolución / cierre
              </Button>}
            </div>
          ) : myRequest ? (
            <div>
              <p className="text-sm font-semibold text-slate-900">Tu solicitud está {myRequest.status}</p>
              <p className="mt-1 text-xs text-slate-600">
                {myRequest.status === 'pending'
                  ? 'Espera la respuesta del vecino. Te notificaremos.'
                  : 'Esta solicitud ya fue respondida.'}
              </p>
              {myRequest.status === 'pending' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={async () => {
                    if (profile) await cancelRequest(myRequest.id, profile);
                    toast({ tone: 'info', title: 'Solicitud cancelada' });
                  }}
                >
                  Cancelar solicitud
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Users size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{listing.type === 'favor' ? '¿Puedes ayudar?' : '¿Te sirve?'}</p>
                <p className="text-[11px] text-slate-500">
                  Envía una solicitud. El vecino decide y se notifica al instante.
                </p>
              </div>
              <Button size="sm" onClick={() => setRequestOpen(true)}>
                {listing.type === 'favor' ? 'Ofrecer ayuda' : 'Solicitar'}
              </Button>
            </div>
          )}
        </Card>
      ) : null}

      {own && listing.type !== 'recommendation' && requests && requests.length > 0 ? (
        <section>
          <SectionHeader
            title="Solicitudes recibidas"
            description={`${requests.filter((item) => item.request.status === 'pending').length} pendientes`}
          />
          <div className="space-y-2.5">
            {requests.map(({ request, requester }) => (
              <RequestCard
                key={request.id}
                request={request}
                listing={listing}
                requester={requester}
                perspective="incoming"
                onAccept={() => void handleRespond(request.id, 'accepted')}
                onReject={() => void handleRespond(request.id, 'rejected')}
                onComplete={() => void handleComplete(request.id)}
                onCancel={async () => {
                  if (profile) await cancelRequest(request.id, profile);
                }}
              />
            ))}
          </div>
        </section>
      ) : null}

      {own && listing.status === 'open' && (!requests || requests.length === 0) ? (
        <p className="text-center text-[11px] text-slate-400">
          Aún no hay solicitudes. Comparte tu publicación con el barrio.
        </p>
      ) : null}

      <div className="flex items-center justify-center gap-4 text-[11px] font-semibold text-slate-400">
        <Link to="/muro" className="hover:text-slate-700">
          Volver al muro
        </Link>
        {!own ? (
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="inline-flex items-center gap-1 hover:text-crisis-600"
          >
            <Flag size={12} /> Reportar
          </button>
        ) : null}
      </div>

      <Sheet
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title="Enviar solicitud"
        description={`A ${author?.name ?? 'tu vecino'} · ${listing.title}`}
        footer={
          <Button full onClick={() => void sendRequest()} loading={busy}>
            Enviar solicitud
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            <Package size={14} className="text-slate-500" />
            {LISTING_TYPE_LABEL[listing.type]} · {listing.category}
          </div>

          {listing.type === 'time_bank' ? (
            <Input
              label="Horas que necesitas"
              type="number"
              min={1}
              max={8}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
          ) : null}

          {listing.type === 'mobility' ? (
            <Input
              label="Cupos que necesitas"
              type="number"
              min={1}
              max={listing.meta.seats ?? 3}
              value={seats}
              onChange={(event) => setSeats(event.target.value)}
            />
          ) : null}

          <Textarea
            label="Mensaje"
            placeholder="Hola, necesito… ¿podemos coordinar?"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />

          <Input
            label="Nota de coordinación (opcional)"
            placeholder="Ej. Puedo pasar a las 6 pm"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />

          <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            <Clock size={13} className="mt-0.5 shrink-0" />
            Reglas anti-free-riding: máximo 3 solicitudes abiertas y devolución obligatoria para
            préstamos.
          </p>
        </div>
      </Sheet>

      <Sheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Reportar publicación"
        description="Los coordinadores revisarán el caso."
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
          placeholder="Cuéntanos qué ocurre…"
          value={reportReason}
          onChange={(event) => setReportReason(event.target.value)}
        />
      </Sheet>
    </div>
  );
}
