import Dexie, { type Table } from 'dexie';
import type { ProcessedOp, ServerRecord } from './types';

export class Vecino360ServerDB extends Dexie {
  records!: Table<ServerRecord, string>;
  processedOps!: Table<ProcessedOp, string>;

  constructor() {
    super('vecino360-server');
    this.version(1).stores({
      records: 'key, entity, id, version, updatedAt, [entity+id]',
      processedOps: 'idempotencyKey, createdAt',
    });
  }
}

export const serverDb = new Vecino360ServerDB();
