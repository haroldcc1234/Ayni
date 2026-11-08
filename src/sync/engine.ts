import { sharedIdentity, sharedMode } from './mode';
import { listenRemote, pullRemote, pushRemote } from './remote';
import { db } from '../db/db';
import { notify } from '../db/repositories';
import type {
  Alert,
  BrigadeProfile,
  Endorsement,
  Listing,
  Provider,
  QueueItem,
  Report,
  RequestEntity,
  ServerRecord,
} from '../db/types';
import { useAppStore } from '../store/useAppStore';
import { broadcastSyncStats, onSyncRequest } from './bus';
import { sendToServer } from './mock-server';

let started = false;
let running = false;
let intervalId: number | undefined;
let cleanups: Array<() => void> = [];

const ENTITY_STATUS_TABLES = {
  providers: db.providers,
  endorsements: db.endorsements,
  listings: db.listings,
  requests: db.requests,
  alerts: db.alerts,
  brigadeProfiles: db.brigadeProfiles,
  reports: db.reports,
} as const;

async function refreshStats(lastSyncAt?: string): Promise<void> {
  const [pending, conflicts] = await Promise.all([
    db.syncQueue
      .where('status')
      .anyOf(['pending', 'error', 'syncing'])
      .count(),
    db.syncQueue.where('status').equals('conflict').count(),
  ]);

  const at = lastSyncAt ?? useAppStore.getState().lastSyncAt;
  useAppStore.getState().setSyncPending(pending);
  useAppStore.getState().setSyncConflicts(conflicts);
  broadcastSyncStats({ pending, conflicts, lastSyncAt: at });
}

async function markEntitySyncStatus(
  item: QueueItem,
  syncStatus: 'synced' | 'conflict',
): Promise<void> {
  const table = ENTITY_STATUS_TABLES[item.entity];
  if (!table) return;
  const record = await (table as { get: (id: string) => Promise<unknown> }).get(
    item.entityId,
  );
  if (!record) return;
  await (table as { update: (id: string, changes: object) => Promise<number> }).update(
    item.entityId,
    { syncStatus },
  );
}

async function applyServerRecord(
  item: QueueItem,
  record: ServerRecord | undefined,
  mode: 'synced' | 'conflict',
): Promise<void> {
  if (item.operation === 'delete') {
    const table = ENTITY_STATUS_TABLES[item.entity];
    if (table) {
      await (table as { delete: (id: string) => Promise<void> }).delete(item.entityId);
    }
    return;
  }

  if (!record?.data) {
    await markEntitySyncStatus(item, mode);
    return;
  }

  const incoming = record.data as Record<string, unknown>;

  switch (item.entity) {
    case 'providers': {
      const local = await db.providers.get(item.entityId);
      if (local && local.version > item.baseVersion + 1) return;
      await db.providers.put({
        ...(incoming as unknown as Provider),
        syncStatus: mode,
      });
      break;
    }
    case 'endorsements': {
      const local = await db.endorsements.get(item.entityId);
      if (local && local.version > item.baseVersion + 1) return;
      await db.endorsements.put({
        ...(incoming as unknown as Endorsement),
        syncStatus: mode,
      });
      break;
    }
    case 'listings': {
      const local = await db.listings.get(item.entityId);
      if (local && local.version > item.baseVersion + 1) return;
      await db.listings.put({
        ...(incoming as unknown as Listing),
        syncStatus: mode,
      });
      break;
    }
    case 'requests': {
      const local = await db.requests.get(item.entityId);
      if (local && local.version > item.baseVersion + 1) return;
      await db.requests.put({
        ...(incoming as unknown as RequestEntity),
        syncStatus: mode,
      });
      break;
    }
    case 'alerts': {
      const local = await db.alerts.get(item.entityId);
      if (local && local.version > item.baseVersion + 1) return;
      await db.alerts.put({
        ...(incoming as unknown as Alert),
        syncStatus: mode,
      });
      break;
    }
    case 'brigadeProfiles': {
      const local = await db.brigadeProfiles.get(item.entityId);
      if (local && local.version > item.baseVersion + 1) return;
      await db.brigadeProfiles.put({
        ...(incoming as unknown as BrigadeProfile),
        syncStatus: mode,
      });
      break;
    }
    case 'reports': {
      const local = await db.reports.get(item.entityId);
      if (local && local.version > item.baseVersion + 1) return;
      await db.reports.put({
        ...(incoming as unknown as Report),
        syncStatus: mode,
      });
      break;
    }
    default:
      break;
  }
}

async function handleConflict(item: QueueItem, record: ServerRecord): Promise<void> {
  await db.syncQueue.update(item.id, {
    status: 'conflict',
    lastError: 'conflict: server version is newer',
  });

  await applyServerRecord(item, record, 'conflict');

  const current = useAppStore.getState().currentProfileId;
  await notify(current, {
    type: 'sync_conflict',
    title: 'Conflicto de sincronización',
    body: 'Otro dispositivo modificó este registro. Se conservó la versión del servidor.',
    link: '/demo',
  });
  useAppStore.getState().toast({
    tone: 'warning',
    title: 'Conflicto detectado',
    description: 'Ganó la versión del servidor. Revisa la versión actualizada.',
  });
}

async function recoverStuckQueueItems(): Promise<void> {
  const stuck = await db.syncQueue.where('status').equals('syncing').toArray();
  if (stuck.length === 0) return;
  const now = new Date().toISOString();
  await Promise.all(
    stuck.map((item) =>
      db.syncQueue.update(item.id, { status: 'pending', nextAttemptAt: now }),
    ),
  );
}

async function drain(): Promise<boolean> {
  const now = new Date().toISOString();
  const candidates = await db.syncQueue
    .where('status')
    .anyOf(['pending', 'error'])
    .toArray();

  const due = candidates
    .filter((item) => item.nextAttemptAt <= now)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, 20);

  let failed = false;

  for (const item of due) {
    await db.syncQueue.update(item.id, { status: 'syncing' });
    const current = (await db.syncQueue.get(item.id)) ?? item;

    let result;
    try {
      result = sharedMode ? await pushRemote(current) : await sendToServer(current);
    } catch (error) {
      if(sharedMode && [400,403,404,409,422].includes((error as {status?:number}).status ?? 0)){
        const reason=error instanceof Error?error.message:'Operación rechazada';
        await db.syncQueue.update(current.id,{status:'conflict',lastError:reason});
        await notify(useAppStore.getState().currentProfileId,{type:'sync_conflict',title:'Revisa un cambio que no se pudo confirmar',body:reason,link:'/configuracion'});
        continue;
      }
      result = {
        ok: false as const,
        error: error instanceof Error ? error.message : 'unknown_error',
      };
    }

    if (result.ok) {
      await applyServerRecord(current, result.record, 'synced');
      await db.syncQueue.delete(current.id);
      continue;
    }

    if (result.conflict) {
      await handleConflict(current, result.serverRecord);
      continue;
    }

    failed = true;
    const attempts = current.attempts + 1;
    const delaySeconds = Math.min(10 * 2 ** (attempts - 1), 300);
    await db.syncQueue.update(current.id, {
      status: 'error',
      attempts,
      lastError: result.error,
      nextAttemptAt: new Date(Date.now() + delaySeconds * 1000).toISOString(),
    });
    break;
  }

  return failed;
}

export async function kickSync(): Promise<void> {
  if (running) return;
  if (!navigator.onLine) {
    await refreshStats();
    return;
  }

  const state = useAppStore.getState();
  state.refreshOnline();
  if (!useAppStore.getState().online) {
    await refreshStats();
    return;
  }

  if (sharedMode && !sharedIdentity()) return;

  if (running) return;
  running = true;
  try {
    await recoverStuckQueueItems();
    let failed = false;
    for (let round = 0; round < 3; round += 1) {
      failed = await drain();
      if (failed) break;
      const remaining = await db.syncQueue
        .where('status')
        .anyOf(['pending', 'error'])
        .count();
      if (remaining === 0) break;
    }

    if (sharedMode) await pullRemote();
    if (failed) { await refreshStats(); return; }
    const synced = !failed;
    const at = new Date().toISOString();
    useAppStore.getState().setLastSyncAt(at);
    await db.settings.put({ key: 'lastSyncAt', value: at });
    await refreshStats(at);

    if (synced) {
      const pending = await db.syncQueue.count();
      if (pending === 0) {
        window.setTimeout(() => {
          refreshStats(at);
        }, 300);
      }
    }
  } catch (error) {
    await refreshStats();
    if (!sharedMode) throw error;
  } finally {
    running = false;
  }
}

export async function retryFailed(): Promise<void> {
  const failed = await db.syncQueue.where('status').equals('error').toArray();
  await Promise.all(
    failed.map((item) =>
      db.syncQueue.update(item.id, {
        status: 'pending',
        nextAttemptAt: new Date().toISOString(),
      }),
    ),
  );
  await kickSync();
}

export function startSyncEngine(): void {
  if (started) return;
  started = true;

  if (sharedMode && sharedIdentity()) cleanups.push(listenRemote(() => { void kickSync(); }));
  const handleOnline = () => {
    useAppStore.getState().refreshOnline();
    void kickSync();
  };
  const handleOffline = () => {
    useAppStore.getState().refreshOnline();
    void refreshStats();
  };
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      useAppStore.getState().refreshOnline();
      void kickSync();
    }
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  document.addEventListener('visibilitychange', handleVisibility);
  cleanups.push(() => window.removeEventListener('online', handleOnline));
  cleanups.push(() => window.removeEventListener('offline', handleOffline));
  cleanups.push(() => document.removeEventListener('visibilitychange', handleVisibility));

  cleanups.push(
    onSyncRequest(() => {
      window.setTimeout(() => {
        void kickSync();
      }, 250);
    }),
  );

  intervalId = window.setInterval(() => {
    if (document.visibilityState === 'visible') void kickSync();
  }, 30_000);

  void refreshStats();
  window.setTimeout(() => {
    void kickSync();
  }, 800);
}

export function stopSyncEngine(): void {
  if (!started) return;
  started = false;
  if (intervalId) window.clearInterval(intervalId);
  intervalId = undefined;
  cleanups.forEach((cleanup) => cleanup());
  cleanups = [];
}

