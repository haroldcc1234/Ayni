import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Car,
  ChevronRight,
  Clock,
  Gift,
  Handshake,
  MapPin,
  Mic,
  Package,
  ShieldCheck,
  Star,
  Timer,
  Users,
  Wrench,
} from 'lucide-react';
import type {
  Alert,
  AlertSeverity,
  AppNotification,
  BrigadeProfile,
  Listing,
  Profile,
  Provider,
  RequestEntity,
} from '../db/types';
import {
  ALERT_STATUS_LABEL,
  LISTING_TYPE_ICON,
  LISTING_TYPE_LABEL,
  REQUEST_STATUS_LABEL,
  SEVERITY_LABEL,
  cn,
  formatDateTime,
  relativeTime,
  severityColor,
  truncate,
} from '../lib/utils';
import { formatCuadras, formatDistance } from '../lib/geo';
import { Avatar, Badge, Button, Card } from './ui';

export function DistancePill({ meters }: { meters: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
      <MapPin size={12} />
      {formatDistance(meters)}
      <span className="text-slate-300">·</span>
      {formatCuadras(meters)}
    </span>
  );
}

export function ProviderCard({
  provider,
  profile,
  distance,
}: {
  provider: Provider;
  profile?: Profile;
  distance?: number;
}) {
  return (
    <Link
      to={`/directorio/${provider.id}`}
      className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-400"
    >
      <Avatar
        name={profile?.name ?? provider.trade}
        color={profile?.avatarColor}
        size="md"
        verified={provider.verified === 1}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {profile?.name ?? 'Prestador vecinal'}
            </p>
            <p className="truncate text-xs font-medium text-slate-600">{provider.trade}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
              <Star size={11} className="fill-amber-500 text-amber-500" />
              {provider.score.toFixed(1)}
            </span>
            <span className="text-[10px] text-slate-400">
              {provider.endorsementCount} visto{provider.endorsementCount === 1 ? '' : 's'} bueno
              {provider.endorsementCount === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
          {provider.description}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {distance !== undefined ? <DistancePill meters={distance} /> : null}
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <Clock size={11} />
            {provider.schedule}
          </span>
        </div>
      </div>
      <ChevronRight size={16} className="mt-1 shrink-0 text-slate-300" />
    </Link>
  );
}

function metaSummary(listing: Listing): string | null {
  const meta = listing.meta;
  if (listing.type === 'promotion') return soles(meta.price ?? 0) + ' · ' +
    (listing.expiresAt ? 'Hasta ' + formatDateTime(listing.expiresAt) : 'Catálogo permanente');
  if (listing.type === 'loan' && meta.hourlyRate) return soles(meta.hourlyRate) + ' por hora';
  if (listing.type === 'loan') {
    const parts = [meta.condition, meta.returnBy ? `devolver ${formatDateTime(meta.returnBy)}` : null];
    return parts.filter(Boolean).join(' · ') || null;
  }
  if (listing.type === 'donation') {
    return [meta.quantity, meta.expiresAt ? `vence ${formatDateTime(meta.expiresAt)}` : null]
      .filter(Boolean)
      .join(' · ');
  }
  if (listing.type === 'favor') {
    return meta.deadline ? `antes del ${formatDateTime(meta.deadline)}` : null;
  }
  if (listing.type === 'time_bank') {
    return [meta.hours ? `${meta.hours} h` : null, meta.skill, meta.modality]
      .filter(Boolean)
      .join(' · ');
  }
  if (listing.type === 'mobility') {
    return [meta.origin, meta.destination, meta.departureAt ? formatDateTime(meta.departureAt) : null]
      .filter(Boolean)
      .join(' → ');
  }
  if (listing.type === 'service') {
    return [meta.trade, meta.schedule, meta.coverageRadiusM ? `${meta.coverageRadiusM} m` : null]
      .filter(Boolean)
      .join(' · ');
  }
  return null;
}

export function ListingCard({
  listing,
  author,
  distance,
}: {
  listing: Listing;
  author?: Profile;
  distance?: number;
}) {
  const summary = metaSummary(listing);
  return (
    <Link
      to={`/muro/${listing.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-400"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xl">
          {LISTING_TYPE_ICON[listing.type]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge tone="brand">{LISTING_TYPE_LABEL[listing.type]}</Badge>
            {listing.status !== 'open' ? (
              <Badge tone={listing.status === 'completed' ? 'success' : 'warning'}>
                {listing.status === 'reserved'
                  ? 'Reservado'
                  : listing.status === 'completed'
                    ? 'Completado'
                    : listing.status === 'hidden'
                      ? 'Oculto'
                      : 'En curso'}
              </Badge>
            ) : null}
            {listing.audio ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500">
                <Mic size={11} /> audio
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 text-sm font-semibold leading-snug text-slate-900">
            {listing.title}
          </h3>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
            {truncate(listing.description, 110)}
          </p>
          {summary ? (
            <p className="mt-1.5 line-clamp-1 text-[11px] font-medium text-slate-600">{summary}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Avatar
                name={author?.name ?? 'Vecino'}
                color={author?.avatarColor}
                size="sm"
                className="scale-[0.55]"
              />
              {author?.name ?? 'Vecino'}
            </span>
            {distance !== undefined ? <DistancePill meters={distance} /> : null}
            <span className="text-slate-400">{relativeTime(listing.createdAt)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function severityTone(severity: AlertSeverity) {
  return severity === 'critical' ? 'danger' : severity === 'high' ? 'warning' : 'info';
}

export function AlertCard({
  alert,
  author,
  distance,
}: {
  alert: Alert;
  author?: Profile;
  distance?: number;
}) {
  return (
    <Link
      to={`/alertas/${alert.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-400"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl',
            alert.severity === 'critical'
              ? 'bg-crisis-50'
              : alert.severity === 'high'
                ? 'bg-amber-50'
                : 'bg-sky-50',
          )}
        >
          {alert.severity === 'critical' ? '🚨' : alert.severity === 'high' ? '⚠️' : '🆘'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold',
                severityColor(alert.severity),
              )}
            >
              {SEVERITY_LABEL[alert.severity]}
            </span>
            <Badge tone={alert.status === 'resolved' ? 'success' : 'neutral'}>
              {ALERT_STATUS_LABEL[alert.status]}
            </Badge>
            <span className="text-[10px] font-medium text-slate-400">{alert.category}</span>
          </div>
          <h3 className="mt-1 text-sm font-semibold leading-snug text-slate-900">{alert.title}</h3>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
            {truncate(alert.description, 110)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span>{author?.name ?? 'Vecino'}</span>
            {distance !== undefined ? <DistancePill meters={distance} /> : null}
            <span className="text-slate-400">{relativeTime(alert.createdAt)}</span>
            {alert.audio ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500">
                <Mic size={11} /> audio
              </span>
            ) : null}
          </div>
        </div>
        <ChevronRight size={16} className="mt-1 shrink-0 text-slate-300" />
      </div>
    </Link>
  );
}

export function BrigadeCard({
  brigade,
  profile,
  distance,
}: {
  brigade: BrigadeProfile;
  profile?: Profile;
  distance?: number;
}) {
  const availability =
    brigade.availability === 'available'
      ? { label: 'Disponible', tone: 'success' as const }
      : brigade.availability === 'busy'
        ? { label: 'Ocupado', tone: 'warning' as const }
        : { label: 'Sin conexión', tone: 'neutral' as const };

  return (
    <Link
      to={`/brigada/${brigade.id}`}
      className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-400"
    >
      <Avatar
        name={profile?.name ?? 'Brigadista'}
        color={profile?.avatarColor}
        size="md"
        verified
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{profile?.name ?? 'Brigadista'}</p>
            <p className="truncate text-xs text-slate-500">{brigade.certifications}</p>
          </div>
          <Badge tone={availability.tone}>{availability.label}</Badge>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {brigade.skills.slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
            >
              {skill}
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
          {distance !== undefined ? <DistancePill meters={distance} /> : null}
          <span className="inline-flex items-center gap-1">
            <ShieldCheck size={11} />
            {brigade.resources.length} recursos
          </span>
        </div>
      </div>
      <ChevronRight size={16} className="mt-1 shrink-0 text-slate-300" />
    </Link>
  );
}

import { isExchange } from '../economy/points';
import { ExchangeActions } from '../economy/ExchangeActions';

export function RequestCard({
  request,
  listing,
  requester,
  owner,
  perspective,
  onAccept,
  onReject,
  onComplete,
  onCancel,
}: {
  request: RequestEntity;
  listing?: Listing;
  requester?: Profile;
  owner?: Profile;
  perspective: 'incoming' | 'outgoing';
  onAccept?: () => void;
  onReject?: () => void;
  onComplete?: () => void;
  onCancel?: () => void;
}) {
  const other = perspective === 'incoming' ? requester : owner;
  const statusTone =
    request.status === 'completed'
      ? 'success'
      : request.status === 'accepted'
        ? 'brand'
        : request.status === 'rejected' || request.status === 'cancelled'
          ? 'neutral'
          : 'warning';

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Avatar name={other?.name ?? 'Vecino'} color={other?.avatarColor} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-slate-900">
              {perspective === 'incoming' ? other?.name ?? 'Vecino' : other?.name ?? 'Vecino'}
            </p>
            <Badge tone={statusTone}>{REQUEST_STATUS_LABEL[request.status]}</Badge>
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs font-medium text-slate-600">
            {listing?.title ?? 'Publicación'}
          </p>
          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{request.message}</p>
          <p className="mt-1 text-[10px] text-slate-400">{relativeTime(request.createdAt)}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {perspective === 'incoming' && request.status === 'pending' ? (
          <>
            <Button size="sm" onClick={onAccept} className="flex-1">
              Aceptar
            </Button>
            <Button size="sm" variant="outline" onClick={onReject} className="flex-1">
              Rechazar
            </Button>
          </>
        ) : null}
        {request.status === 'accepted' || request.status === 'in_progress' ? (
          <>
            {listing && isExchange(listing.type) ? <ExchangeActions request={request} listing={listing} /> : perspective === 'incoming' ? (
              <Button size="sm" variant="secondary" onClick={onComplete} className="flex-1">
                Confirmar entrega
              </Button>
            ) : null}
            {perspective === 'outgoing' && !(listing && isExchange(listing.type)) ? (
              <Button size="sm" variant="secondary" onClick={onComplete} className="flex-1">
                Confirmar devolución / cierre
              </Button>
            ) : null}
            {!(listing && isExchange(listing.type) && request.status === 'in_progress') && <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>}
          </>
        ) : null}
      </div>
    </Card>
  );
}

export function NotificationCard({
  notification,
  onClick,
}: {
  notification: AppNotification;
  onClick: () => void;
}) {
  const icon =
    notification.type === 'alert_created' ||
    notification.type === 'alert_assigned' ||
    notification.type === 'alert_resolved'
      ? '🚨'
      : notification.type === 'request_received' ||
          notification.type === 'request_accepted' ||
          notification.type === 'request_rejected' ||
          notification.type === 'request_completed'
        ? '🤝'
        : notification.type === 'broadcast'
          ? '📣'
          : notification.type === 'moderation'
            ? '🛡️'
            : notification.type === 'sync_conflict'
              ? '🔄'
              : '🔔';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors',
        notification.read
          ? 'border-slate-200 bg-white'
          : 'border-slate-300 bg-slate-50',
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-slate-900">{notification.title}</span>
          {notification.read ? null : (
            <span className="h-2 w-2 shrink-0 rounded-full bg-slate-900" />
          )}
        </span>
        <span className="mt-0.5 block line-clamp-2 text-xs text-slate-600">{notification.body}</span>
        <span className="mt-1 block text-[10px] text-slate-400">
          {relativeTime(notification.createdAt)}
        </span>
      </span>
    </button>
  );
}

export function QuickAction({
  icon,
  label,
  hint,
  to,
  onClick,
  tone = 'brand',
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  to?: string;
  onClick?: () => void;
  tone?: 'brand' | 'crisis' | 'community' | 'amber';
}) {
  const tones = {
    brand: 'bg-slate-100 text-slate-700',
    crisis: 'bg-crisis-50 text-crisis-700',
    community: 'bg-emerald-50 text-emerald-800',
    amber: 'bg-amber-50 text-amber-800',
  };

  const inner = (
    <>
      <span className={cn('flex h-11 w-11 items-center justify-center rounded-lg', tones[tone])}>
        {icon}
      </span>
      <span className="mt-2 block text-xs font-semibold leading-tight text-slate-800">{label}</span>
      {hint ? <span className="mt-0.5 block text-[10px] text-slate-500">{hint}</span> : null}
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="flex min-h-[96px] flex-col items-start rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-slate-400"
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[96px] flex-col items-start rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-400"
    >
      {inner}
    </button>
  );
}

export function TypeMetaRow({ listing }: { listing: Listing }) {
  const summary = metaSummary(listing);
  if (!summary) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700">
      <Package size={15} className="mt-0.5 shrink-0" />
      <span>{summary}</span>
    </div>
  );
}

export const LISTING_ICONS = {
  promotion: Package,
  recommendation: Users,
  service: Wrench,
  loan: Package,
  donation: Gift,
  favor: Handshake,
  time_bank: Timer,
  mobility: Car,
} as const;

export { ArrowRight, Users, BadgeCheck };
import { soles } from '../lib/catalog';
