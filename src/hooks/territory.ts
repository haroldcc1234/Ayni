import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../db/db';
import type { Profile } from '../db/types';
import { sectorOf, visibleSectorIds } from '../governance/territory';

type Place = Pick<Profile, 'district' | 'lat' | 'lng'>;

export function useVisibleSectors(profile?: Profile) {
  return useLiveQuery(() => profile ? visibleSectorIds(profile) : [],
    [profile?.id, profile?.district, profile?.lat, profile?.lng]);
}

export function inScope(sectors: string[] | undefined, place: Place) {
  return sectors?.includes(sectorOf(place).id) ?? false;
}

export function useCatalogClock() {
  const [now, setNow] = useState(Date.now);
  const next = useLiveQuery(async () =>
    (await db.listings.where('expiresAt').above(new Date(now).toISOString()).first())?.expiresAt,
  [now]);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = next ? window.setTimeout(refresh, Math.min(2_147_483_647, Math.max(1, Date.parse(next) - Date.now() + 1))) : undefined;
    window.addEventListener('focus', refresh);
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', refresh); };
  }, [next, now]);
  return now;
}
