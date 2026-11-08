import type { Listing, ListingMeta, ListingType } from '../db/types';

export function publicationExpiry(type: ListingType, meta: ListingMeta, now: number, requested?: string) {
  if (type === 'promotion') {
    if (!Number.isFinite(meta.price) || meta.price! < 0) throw new Error('Ingresa un precio válido.');
    if (meta.durationHours === undefined) return '';
    if (!Number.isInteger(meta.durationHours) || meta.durationHours < 2 || meta.durationHours > 12) {
      throw new Error('Las ofertas del día duran entre 2 y 12 horas.');
    }
    return new Date(now + meta.durationHours * 3_600_000).toISOString();
  }
  if (type === 'loan' && meta.hourlyRate !== undefined &&
    (!Number.isFinite(meta.hourlyRate) || meta.hourlyRate < 0)) throw new Error('La tarifa por hora debe ser válida.');
  return requested ?? (type === 'donation' ? meta.expiresAt : undefined)
    ?? new Date(now + (type === 'service' ? 30 : 7) * 86_400_000).toISOString();
}

export function isExpired(listing: Pick<Listing, 'expiresAt'>, now = Date.now()) {
  return Boolean(listing.expiresAt) && Date.parse(listing.expiresAt) <= now;
}

export function isAvailable(listing: Listing, now = Date.now()) {
  return listing.status === 'open' && !listing.hidden && !isExpired(listing, now);
}

export function soles(value: number) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
}
