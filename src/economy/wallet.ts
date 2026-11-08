import { mergeLedger } from './ledger';
import { db } from '../db/db';
import type { Listing, Profile } from '../db/types';
import { getBoardRole, isSectorInDisaster, sectorOf } from '../governance/territory';
import { projectWallet, reservePoints } from './points';

export async function readWallet(profile: Profile) {
  const [offers, outgoing, incoming] = await Promise.all([
    db.listings.where('authorId').equals(profile.id).toArray(),
    db.requests.where('requesterId').equals(profile.id).toArray(),
    db.requests.where('ownerId').equals(profile.id).toArray(),
  ]);
  const requests = [...outgoing, ...incoming];
  const listings = new Map(offers.map(item => [item.id, item]));
  const missing = [...new Set(outgoing.map(row => row.listingId).filter(id => !listings.has(id)))];
  for (const row of await db.listings.bulkGet(missing)) if (row) listings.set(row.id, row);
  const projected=projectWallet(profile.id, [...listings.values()], requests, profile.protectionSince, profile.walletReinstatedAt);
  const persisted=await db.settings.get('ledger/'+profile.id);
  const confirmed=mergeLedger(projected.entries,JSON.parse(persisted?.value ?? '[]'));
  return {...projected,...confirmed,available:confirmed.balance-projected.held};
}

export async function confirmEligibility(profile: Profile, location: Pick<Profile,'district'|'lat'|'lng'>) {
  const crisis = await isSectorInDisaster(location);
  const wallet = await readWallet(profile);
  if (wallet.frozen && !crisis) throw new Error('Tu cuenta solidaria está bajo revisión. Contacta a la junta.');
  return { crisis, wallet };
}

export async function reserveFor(profile: Profile, listing: Listing) {
  const {crisis, wallet} = await confirmEligibility(profile, listing);
  return reservePoints(listing.meta.pointsCost ?? 15, wallet.available, Boolean(profile.protectionSince), crisis);
}

export async function canReview(actor: Profile, target: Pick<Profile,'district'|'lat'|'lng'>) {
  const role = await getBoardRole(actor);
  return (role === 'presidente' || role === 'vocal') && sectorOf(actor).id === sectorOf(target).id;
}
