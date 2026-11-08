import type { LedgerEntry } from './points';

/** Each positive or negative contribution has a stable identity. Replaying an
 * already acknowledged contribution cannot change its value or count it twice. */
export function mergeLedger(local: LedgerEntry[], confirmed: LedgerEntry[]) {
  const byId = new Map(local.map(entry => [entry.id, entry]));
  for (const entry of confirmed) byId.set(entry.id, entry);
  const entries = [...byId.values()].sort((a,b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  return { entries, balance: entries.reduce((total, entry) => total + entry.delta, 0) };
}
