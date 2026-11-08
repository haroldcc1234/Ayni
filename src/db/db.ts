import { activeDatabase } from '../sync/mode';
import Dexie, { type Table } from 'dexie';
import type {
  Alert,
  AppNotification,
  BrigadeProfile,
  Endorsement,
  Listing,
  Profile,
  Provider,
  QueueItem,
  Report,
  ReputationEvent,
  RequestEntity,
  Setting,
} from './types';

export class Vecino360DB extends Dexie {
  profiles!: Table<Profile, string>;
  providers!: Table<Provider, string>;
  endorsements!: Table<Endorsement, string>;
  listings!: Table<Listing, string>;
  requests!: Table<RequestEntity, string>;
  alerts!: Table<Alert, string>;
  brigadeProfiles!: Table<BrigadeProfile, string>;
  notifications!: Table<AppNotification, string>;
  reputationEvents!: Table<ReputationEvent, string>;
  reports!: Table<Report, string>;
  syncQueue!: Table<QueueItem, string>;
  settings!: Table<Setting, string>;

  constructor() {
    super(activeDatabase());

    this.version(1).stores({
      profiles: 'id, name, district, verified, createdAt, updatedAt',
      providers:
        'id, profileId, trade, district, status, score, updatedAt, syncStatus, [district+status], [trade+district]',
      endorsements:
        'id, providerId, endorserId, weight, createdAt, syncStatus, [providerId+endorserId]',
      listings:
        'id, type, category, authorId, district, status, createdAt, expiresAt, updatedAt, syncStatus, [type+status], [district+status], [authorId+createdAt]',
      requests:
        'id, listingId, requesterId, ownerId, status, createdAt, updatedAt, syncStatus, [listingId+status], [requesterId+status]',
      alerts:
        'id, severity, category, authorId, status, brigadeProfileId, district, createdAt, updatedAt, syncStatus, [status+severity], [brigadeProfileId+status]',
      brigadeProfiles:
        'id, profileId, availability, district, updatedAt, syncStatus, [availability+district]',
      notifications: 'id, profileId, read, createdAt, [profileId+read]',
      reputationEvents:
        'id, profileId, type, points, createdAt, [profileId+createdAt]',
      reports:
        'id, targetType, targetId, reporterId, status, createdAt, [status+createdAt]',
      syncQueue:
        'id, entity, entityId, operation, status, nextAttemptAt, createdAt, [status+nextAttemptAt]',
      settings: 'key',
    });
    this.version(2).stores({}).upgrade(tx => tx.table('profiles').toCollection().modify(row => { delete row.bio; }));
  }
}

export const db = new Vecino360DB();

