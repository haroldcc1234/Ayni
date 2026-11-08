import clsx, { type ClassValue } from 'clsx';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type {
  AlertSeverity,
  AlertStatus,
  ListingStatus,
  ListingType,
  ReputationType,
  RequestStatus,
  Role,
} from '../db/types';

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function uid(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addMinutesIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function addDaysIso(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: es });
  } catch {
    return '';
  }
}

export function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function formatPhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 15;
}

export const ROLE_LABEL: Record<Role, string> = {
  vecino: 'Vecino',
  prestador: 'Prestador',
  brigadista: 'Brigadista',
  coordinador: 'Coordinador',
};

export const ROLE_ICON: Record<Role, string> = {
  vecino: '🏠',
  prestador: '🔧',
  brigadista: '🚑',
  coordinador: '⭐',
};

export const LISTING_TYPE_LABEL: Record<ListingType, string> = {
  promotion: 'Comercio local',
  recommendation: 'Recomendación',
  service: 'Oficio',
  loan: 'Préstamo',
  donation: 'Donación',
  favor: 'Favor',
  time_bank: 'Banco de tiempo',
  mobility: 'Movilidad',
};

export const LISTING_TYPE_ICON: Record<ListingType, string> = {
  promotion: '🛍️',
  recommendation: '💬',
  service: '🔧',
  loan: '📦',
  donation: '🎁',
  favor: '🤝',
  time_bank: '⏱️',
  mobility: '🚗',
};

export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  open: 'Disponible',
  reserved: 'Reservado',
  in_progress: 'En curso',
  completed: 'Completado',
  expired: 'Vencido',
  hidden: 'Oculto',
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Media',
};

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  pending: 'Sin atender',
  assigned: 'Asignada',
  in_progress: 'En atención',
  resolved: 'Resuelta',
  cancelled: 'Cancelada',
};

export const REPUTATION_TYPE_LABEL: Record<ReputationType, string> = {
  donation_delivered: 'Donación entregada',
  loan_returned_owner: 'Préstamo devuelto',
  loan_returned_requester: 'Devolución confirmada',
  time_bank_hour: 'Hora de banco de tiempo',
  alert_resolved: 'Alerta resuelta',
  endorsement_given: 'Visto Bueno otorgado',
  manual: 'Aporte vecinal',
};

export const TRADES = [
  'Gasfitería',
  'Electricidad',
  'Carpintería',
  'Cerrajería',
  'Costura',
  'Soporte técnico',
  'Pintura',
  'Jardinería',
  'Otro',
];

export const LISTING_CATEGORIES = [
  'Herramientas',
  'Alimentos',
  'Hogar',
  'Mascotas',
  'Transporte',
  'Salud',
  'Educación',
  'Tecnología',
  'Ropa',
  'Otro',
];

export const BRIGADE_SKILLS = [
  'Primeros auxilios',
  'Rescate',
  'Evacuación',
  'Salud',
  'Transporte',
  'Movilidad',
  'Estructuras',
  'Remoción',
  'Comunicaciones',
  'Logística',
];

export function plural(count: number, singular: string, pluralWord: string) {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

export function formatPoints(points: number): string {
  return `${points} ${points === 1 ? 'punto' : 'puntos'}`;
}

export function truncate(text: string, max = 120): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function severityColor(severity: AlertSeverity): string {
  if (severity === 'critical') return 'bg-crisis-100 text-crisis-700 border-crisis-200';
  if (severity === 'high') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-sky-100 text-sky-800 border-sky-200';
}
