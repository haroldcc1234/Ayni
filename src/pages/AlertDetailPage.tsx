import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  Siren,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { db } from '../db/db';
import { acceptAlert, cancelAlert, resolveAlert } from '../db/repositories';
import { useCurrentProfile } from '../hooks';
import { distanceMeters, formatCuadras, formatDistance } from '../lib/geo';
import {
  ALERT_STATUS_LABEL,
  SEVERITY_LABEL,
  formatDateTime,
  relativeTime,
  severityColor,
} from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { AudioPlayer } from '../components/AudioPlayer';
import { MeetingCard } from '../governance/MeetingCard';
import { MapView } from '../components/MapView';
import { Avatar, Badge, Button, Card, EmptyState } from '../components/ui';
import { PageHeading } from '../components/PageBits';

export function AlertDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useCurrentProfile();
  const toast = useAppStore((state) => state.toast);

  const alert = useLiveQuery(() => (id ? db.alerts.get(id) : undefined), [id]);
  const author = useLiveQuery(
    () => (alert ? db.profiles.get(alert.authorId) : undefined),
    [alert?.authorId],
  );
  const brigade = useLiveQuery(
    () => (alert?.brigadeProfileId ? db.brigadeProfiles.get(alert.brigadeProfileId) : undefined),
    [alert?.brigadeProfileId],
  );
  const brigadeOwner = useLiveQuery(
    () => (brigade ? db.profiles.get(brigade.profileId) : undefined),
    [brigade?.profileId],
  );
  const myBrigade = useLiveQuery(
    () => (profile ? db.brigadeProfiles.where('profileId').equals(profile.id).first() : undefined),
    [profile?.id],
  );

  if (!alert) {
    return (
      <div>
        <PageHeading title="Alerta" back={{ to: '/alertas', label: 'Alertas' }} />
        <EmptyState title="No encontramos esta alerta" description="Puede haber sido retirada." />
      </div>
    );
  }

  const coords = { lat: profile?.lat ?? -12.083, lng: profile?.lng ?? -77.051 };
  const distance = distanceMeters(coords, { lat: alert.lat, lng: alert.lng });
  const isCoordinator = profile?.roles.includes('coordinador') ?? false;
  const canAccept = Boolean(
    myBrigade && alert.status === 'pending' && myBrigade.id !== alert.brigadeProfileId,
  );
  const canResolve =
    alert.status !== 'resolved' &&
    alert.status !== 'cancelled' &&
    (alert.authorId === profile?.id || isCoordinator || (myBrigade && alert.brigadeProfileId === myBrigade.id));
  const canCancel =
    alert.status !== 'resolved' &&
    alert.status !== 'cancelled' &&
    (alert.authorId === profile?.id || isCoordinator);

  const steps = [
    { label: 'Reportada', time: alert.createdAt, done: true },
    { label: 'Asignada a brigada', time: alert.assignedAt, done: Boolean(alert.assignedAt) },
    {
      label: 'En atención',
      time: alert.status === 'in_progress' ? alert.updatedAt : undefined,
      done: alert.status === 'in_progress',
    },
    { label: 'Resuelta', time: alert.resolvedAt, done: alert.status === 'resolved' },
  ];

  const accept = async () => {
    if (!profile) return;
    const result = await acceptAlert(alert.id, profile);
    toast(
      result.ok
        ? {
            tone: 'success',
            title: 'Vas en camino',
            description: 'El vecino que reportó recibió tu confirmación.',
          }
        : { tone: 'error', title: 'No se pudo asignar', description: result.reason },
    );
  };

  const resolve = async () => {
    if (!profile) return;
    const result = await resolveAlert(alert.id, profile);
    toast(
      result.ok
        ? {
            tone: 'success',
            title: 'Alerta resuelta',
            description: 'Se notificó al autor y se sumaron puntos a la brigada.',
          }
        : { tone: 'error', title: 'No se pudo cerrar', description: result.reason },
    );
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: alert.title, text: alert.description, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ tone: 'info', title: 'Enlace copiado' });
      }
    } catch {
      /* cancelado por el usuario */
    }
  };

  return (
    <div className="space-y-4">
      <PageHeading title="Detalle de alerta" back={{ to: '/alertas', label: 'Alertas' }} />

      <Card className="overflow-hidden p-0">
        <div
          className={`border-b px-5 py-4 ${
            alert.severity === 'critical'
              ? 'border-crisis-200 bg-crisis-50 text-crisis-900'
              : alert.severity === 'high'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-sky-200 bg-sky-50 text-sky-900'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-700">
              <Siren size={12} />
              {SEVERITY_LABEL[alert.severity]}
            </span>
            <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">
              {ALERT_STATUS_LABEL[alert.status]}
            </span>
          </div>
          <h1 className="mt-2 text-xl font-semibold leading-tight tracking-tight">{alert.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-600">
            <span>{alert.category}</span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1">
              <MapPin size={11} />
              {alert.district} · {formatDistance(distance)} ({formatCuadras(distance)})
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1">
              <Clock size={11} />
              {relativeTime(alert.createdAt)}
            </span>
          </p>
        </div>

        <div className="space-y-3 p-4">
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
            {alert.description}
          </p>
          {alert.audio ? (
            <AudioPlayer blob={alert.audio} duration={alert.audioDuration} />
          ) : null}

          {alert.severity === 'critical' ? (
            <div className="flex items-start gap-2 rounded-lg border border-crisis-200 bg-crisis-50 px-3 py-2.5 text-[11px] font-medium text-crisis-800">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              Riesgo de vida. No ingreses a estructuras inestables sin evaluación de la brigada.
            </div>
          ) : null}

          <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
            <Avatar name={author?.name ?? 'Vecino'} color={author?.avatarColor} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-900">
                Reportada por {author?.name ?? 'un vecino'}
              </p>
              <p className="text-[10px] text-slate-500">{formatDateTime(alert.createdAt)}</p>
            </div>
          </div>
        </div>
      </Card>

      {profile && <MeetingCard incident={alert} profile={profile}/>}
      <MapView
        center={{ lat: alert.lat, lng: alert.lng }}
        points={[
          {
            id: alert.id,
            lat: alert.lat,
            lng: alert.lng,
            label: alert.title,
            description: `${alert.category} · ${SEVERITY_LABEL[alert.severity]}`,
            tone: 'alert',
          },
          ...(brigade
            ? [
                {
                  id: brigade.id,
                  lat: brigade.lat,
                  lng: brigade.lng,
                  label: `Brigada · ${brigade.skills[0] ?? 'Apoyo'}`,
                  description: brigade.certifications,
                  tone: 'brigade' as const,
                  link: `/brigada/${brigade.id}`,
                },
              ]
            : []),
        ]}
        radiusM={800}
        height="220px"
      />

      {brigade ? (
        <Card className="flex items-center gap-3">
          <Avatar
            name={brigadeOwner?.name ?? 'Brigadista'}
            color={brigadeOwner?.avatarColor}
            size="md"
            verified
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-900">
              {brigadeOwner?.name ?? 'Brigadista asignado'}
            </p>
            <p className="truncate text-[11px] text-slate-500">{brigade.certifications}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {brigade.skills.slice(0, 3).map((skill) => (
                <span
                  key={skill}
                  className="rounded border border-community-200 bg-community-50 px-2 py-0.5 text-[10px] font-medium text-community-700"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
          <ShieldCheck size={20} className="text-community-600" />
        </Card>
      ) : null}

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Línea de respuesta</h2>
        <div className="mt-3 space-y-3">
          {steps.map((step, index) => (
            <div key={step.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full ${
                    step.done ? 'bg-community-600 text-white' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {step.done ? <CheckCircle2 size={15} /> : <span className="text-[10px] font-semibold">{index + 1}</span>}
                </span>
                {index < steps.length - 1 ? (
                  <span className={`mt-1 h-5 w-0.5 ${step.done ? 'bg-community-200' : 'bg-slate-100'}`} />
                ) : null}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <p className={`text-xs font-semibold ${step.done ? 'text-slate-900' : 'text-slate-400'}`}>
                  {step.label}
                </p>
                <p className="text-[10px] text-slate-400">
                  {step.time ? formatDateTime(step.time) : 'Pendiente'}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {canAccept ? (
            <Button full variant="crisis" onClick={() => void accept()}>
              <UserCheck size={17} />
              Estoy en camino
            </Button>
          ) : null}
          {alert.status === 'pending' && profile?.roles.includes('brigadista') && !myBrigade ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              Necesitas una ficha de brigadista para aceptar alertas.{' '}
              <a href="/perfil/brigada" className="font-semibold underline">
                Crear ficha
              </a>
            </p>
          ) : null}
          {canResolve ? (
            <Button full variant="secondary" onClick={() => void resolve()}>
              <CheckCircle2 size={17} />
              Marcar como resuelta
            </Button>
          ) : null}
          <div className="flex gap-2">
            <Button variant="outline" full onClick={() => void share()}>
              Compartir
            </Button>
            {canCancel ? (
              <Button
                variant="ghost"
                full
                onClick={async () => {
                  if (!profile) return;
                  await cancelAlert(alert.id, profile);
                  toast({ tone: 'info', title: 'Alerta cancelada' });
                }}
              >
                <XCircle size={16} />
                Cancelar
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <div className={`rounded-lg border px-4 py-3 text-[11px] leading-relaxed ${severityColor(alert.severity)}`}>
        <p className="flex items-center gap-1.5 font-semibold">
          <ShieldAlert size={14} /> Recuerda
        </p>
        <p className="mt-1">
          Mantén despejado el acceso para la brigada. Si la situación empeora, actualiza la
          descripción o crea una nueva alerta.
        </p>
      </div>

      <Badge tone="neutral" className="mx-auto">
        ID {alert.id.slice(0, 8)} · {ALERT_STATUS_LABEL[alert.status]}
      </Badge>
    </div>
  );
}
