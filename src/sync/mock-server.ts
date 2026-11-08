import { serverDb } from '../db/server-db';
import type { QueueItem, ServerRecord, SyncResult } from '../db/types';

function sameData(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * "Servidor" local simulado.
 * Vive en una segunda base Dexie para poder demostrar ACK, idempotencia,
 * reintentos y conflictos de versión sin backend real.
 */
export async function sendToServer(item: QueueItem): Promise<SyncResult> {
  // Latencia simulada de red.
  await new Promise((resolve) => window.setTimeout(resolve, 120));

  const key = `${item.entity}:${item.entityId}`;

  return serverDb.transaction(
    'rw',
    serverDb.records,
    serverDb.processedOps,
    async (): Promise<SyncResult> => {
      const processed = await serverDb.processedOps.get(item.idempotencyKey);
      if (processed) {
        const record = await serverDb.records.get(key);
        return { ok: true, record };
      }

      const existing = await serverDb.records.get(key);

      if (item.operation === 'delete') {
        if (existing) await serverDb.records.delete(key);
        await serverDb.processedOps.add({
          idempotencyKey: item.idempotencyKey,
          createdAt: new Date().toISOString(),
        });
        return { ok: true };
      }

      if (item.operation === 'create') {
        if (existing && !sameData(existing.data, item.payload)) {
          return { ok: false, conflict: true, serverRecord: existing };
        }
        const record: ServerRecord = {
          key,
          entity: item.entity,
          id: item.entityId,
          version: Math.max(existing?.version ?? 0, item.baseVersion + 1),
          updatedAt: new Date().toISOString(),
          data: item.payload,
        };
        await serverDb.records.put(record);
        await serverDb.processedOps.add({
          idempotencyKey: item.idempotencyKey,
          createdAt: new Date().toISOString(),
        });
        return { ok: true, record };
      }

      // update
      if (existing && item.baseVersion < existing.version) {
        return { ok: false, conflict: true, serverRecord: existing };
      }

      const record: ServerRecord = {
        key,
        entity: item.entity,
        id: item.entityId,
        version: item.baseVersion + 1,
        updatedAt: new Date().toISOString(),
        data: {
          ...(item.payload as Record<string, unknown>),
          version: item.baseVersion + 1,
          syncStatus: 'synced',
        },
      };
      await serverDb.records.put(record);
      await serverDb.processedOps.add({
        idempotencyKey: item.idempotencyKey,
        createdAt: new Date().toISOString(),
      });
      return { ok: true, record };
    },
  );
}

export async function serverRecordCount(): Promise<number> {
  return serverDb.records.count();
}
