import type { DeliveryReceipt, Listing, PointReservation, RequestEntity } from '../db/types';

export const COSTS = [15, 30, 50] as const;
export const COST_LABEL = { 15: 'Ligero', 30: 'Moderado', 50: 'Pesado' };
export const MONTHLY_SUPPORT = 50;
export const DONATION_REWARD = 20;
export const isExchange = (type: Listing['type']) => ['favor', 'time_bank', 'donation'].includes(type);
export const supplierId = (listing: Listing, request: RequestEntity) =>
  listing.type === 'favor' ? request.requesterId : request.ownerId;
export const beneficiaryId = (listing: Listing, request: RequestEntity) =>
  listing.type === 'favor' ? request.ownerId : request.requesterId;

export type ProofInput = Pick<DeliveryReceipt, 'accuracy' | 'punctuality' | 'quality' | 'comment' | 'flagged'>;

export function validProof(proof: ProofInput): boolean {
  return [proof.accuracy, proof.punctuality, proof.quality].every(
    score => Number.isInteger(score) && score >= 1 && score <= 5,
  ) && proof.comment.trim().length >= 5 && proof.comment.length <= 500;
}

export function needsReview(proof: ProofInput): boolean {
  return proof.flagged || Math.min(proof.accuracy, proof.punctuality, proof.quality) <= 2;
}

export function reservePoints(cost: PointReservation['cost'], available: number, protectedUser: boolean, crisis: boolean): PointReservation {
  if (!COSTS.includes(cost)) throw new Error('Elige un costo de 15, 30 o 50 puntos.');
  if (crisis) return { cost, held: 0, subsidy: 0, crisis };
  if (available < cost && !protectedUser) {
    throw new Error(`Necesitas ${cost} puntos disponibles. Puedes reunirlos al donar o ayudar a otro vecino.`);
  }
  const held = Math.min(cost, Math.max(0, available));
  return { cost, held, subsidy: cost - held, crisis };
}

export interface LedgerEntry {
  id: string;
  label: string;
  at: string;
  delta: number;
  listingId?: string;
}

/** Calcula cada asiento a partir de la identidad de la operación y su prueba.
 * Reintentar la sincronización o volver a abrir la billetera no genera abonos. */
export function projectWallet(
  profileId: string, listings: Listing[], requests: RequestEntity[],
  protectionSince = '', reinstatedAt = '', now = new Date(),
) {
  const entries: LedgerEntry[] = [];
  let held = 0;
  let karma = 50;
  let unresolved = 0;
  let frozen = false;
  const byId = new Map(listings.map(row => [row.id, row]));
  const completed = new Set(requests.filter(r => r.status === 'completed' && r.meta.receipt).map(r => r.listingId));
  const today = now.toISOString();
  if (protectionSince && protectionSince <= today) {
    const date = new Date(protectionSince);
    const month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    while (month <= now) {
      const at = month.toISOString();
      entries.push({ id: 'subsidio-' + at, label: 'Recarga mensual protegida', at: at < protectionSince ? protectionSince : at, delta: MONTHLY_SUPPORT });
      month.setUTCMonth(month.getUTCMonth() + 1);
    }
  }
  for (const item of listings) {
    if (item.authorId === profileId && item.type === 'favor' && item.meta.wallet && !completed.has(item.id)
      && ['open','reserved','in_progress'].includes(item.status)
      && (item.status !== 'open' || item.expiresAt > today)) held += item.meta.wallet.held;
  }
  for (const request of requests) {
    const listing = byId.get(request.listingId);
    if (!listing || !isExchange(listing.type)) continue;
    const supplier = supplierId(listing, request);
    const beneficiary = beneficiaryId(listing, request);
    if (profileId !== supplier && profileId !== beneficiary) continue;
    const terms = listing.type === 'favor' ? listing.meta.wallet : request.meta.wallet;
    const proof = request.meta.receipt;
    if (!proof || request.status !== 'completed') {
      if (listing.type === 'time_bank' && beneficiary === profileId && terms
        && ['pending','accepted','in_progress'].includes(request.status)
        && (request.status !== 'pending' || (listing.status === 'open' && listing.expiresAt > today))) held += terms.held;
      continue;
    }
    const flagged = needsReview(proof);
    const review = request.meta.review;
    if (supplier === profileId) {
      const average = (proof.accuracy + proof.punctuality + proof.quality) / 3;
      karma += review?.decision === 'fraud' ? -12 : flagged && review?.decision !== 'valid' ? -3 : average >= 4 ? 3 : 1;
      if (flagged && !review && proof.at > reinstatedAt) unresolved++;
      if (review?.decision === 'fraud' && review.at > reinstatedAt) frozen = true;
    }
    if (flagged && !review) {
      if (profileId === beneficiary && !proof.crisis) held += terms?.held ?? 0;
      continue;
    }
    if (flagged && review?.decision === 'fraud') continue;
    const crisis = proof.crisis || terms?.crisis;
    let delta = 0;
    if (!crisis) {
      if (listing.type === 'donation') delta = profileId === supplier ? DONATION_REWARD : 0;
      else delta = profileId === supplier ? terms?.cost ?? 0 : -(terms?.held ?? 0);
    }
    const at = flagged && review ? review.at : proof.at;
    const label = crisis ? 'Mérito cívico' : listing.type === 'donation' ? 'Donación confirmada' : 'Favor confirmado';
    entries.push({ id: request.id, label: `${label} · ${listing.title}`, at, delta, listingId: listing.id });
    if (review?.decision === 'fraud') {
      entries.push({ id: 'reversión-' + request.id, label: `Reversión por fraude · ${listing.title}`, at: review.at, delta: -delta, listingId: listing.id });
    }
  }
  entries.sort((a,b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  const balance = entries.reduce((sum, entry) => sum + entry.delta, 0);
  return { entries, balance, held, available: balance - held, karma: Math.max(0, Math.min(100, karma)), frozen: frozen || unresolved >= 2, unresolved };
}
