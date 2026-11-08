export const SYNC_EVENT = 'vecino360:sync';
export const SYNC_STATS_EVENT = 'vecino360:sync-stats';

export interface SyncStatsDetail {
  pending: number;
  conflicts: number;
  lastSyncAt: string;
}

export function requestSync(): void {
  window.dispatchEvent(new Event(SYNC_EVENT));
}

export function broadcastSyncStats(detail: SyncStatsDetail): void {
  window.dispatchEvent(
    new CustomEvent<SyncStatsDetail>(SYNC_STATS_EVENT, { detail }),
  );
}

export function onSyncRequest(listener: () => void): () => void {
  window.addEventListener(SYNC_EVENT, listener);
  return () => window.removeEventListener(SYNC_EVENT, listener);
}

export function onSyncStats(
  listener: (detail: SyncStatsDetail) => void,
): () => void {
  const handler = (event: Event) => {
    listener((event as CustomEvent<SyncStatsDetail>).detail);
  };
  window.addEventListener(SYNC_STATS_EVENT, handler);
  return () => window.removeEventListener(SYNC_STATS_EVENT, handler);
}
