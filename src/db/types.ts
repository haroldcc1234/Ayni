export type Role = 'vecino' | 'prestador' | 'brigadista' | 'coordinador';

export type ListingType =
  | 'promotion'
  | 'recommendation'
  | 'service'
  | 'loan'
  | 'donation'
  | 'favor'
  | 'time_bank'
  | 'mobility';

export type ListingStatus =
  | 'open'
  | 'reserved'
  | 'in_progress'
  | 'completed'
  | 'expired'
  | 'hidden';

export type RequestStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type AlertSeverity = 'critical' | 'high' | 'medium';

export type AlertStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'resolved'
  | 'cancelled';

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'conflict' | 'error';

export type Availability = 'available' | 'busy' | 'offline';

export type EntityName =
  | 'providers'
  | 'endorsements'
  | 'listings'
  | 'requests'
  | 'alerts'
  | 'brigadeProfiles'
  | 'reports';

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  syncStatus: SyncStatus;
}

export interface Profile {
  protectionSince?: string;
  walletReinstatedAt?: string;
  id: string;
  name: string;
  phone: string;
  district: string;
  lat: number;
  lng: number;
  roles: Role[];
  verified: 0 | 1;
  photo?: string;
  zone?: string;
  emailVerified?: boolean;
  dniRegistered?: boolean;
  residencyVerifiedAt?: string;
  avatarColor: string;
  createdAt: string;
  updatedAt: string;
}

export interface Provider extends BaseEntity {
  profileId: string;
  trade: string;
  description: string;
  district: string;
  lat: number;
  lng: number;
  coverageRadiusM: number;
  schedule: string;
  status: 'active' | 'inactive';
  score: number;
  endorsementCount: number;
  verified: 0 | 1;
}

export interface Endorsement extends BaseEntity {
  providerId: string;
  endorserId: string;
  weight: number;
  comment: string;
}

export interface ListingMeta {
  pointsCost?: 15 | 30 | 50;
  wallet?: PointReservation;
  price?: number;
  durationHours?: number;
  hourlyRate?: number;
  condition?: string;
  returnBy?: string;
  quantity?: string;
  expiresAt?: string;
  hours?: number;
  skill?: string;
  modality?: string;
  origin?: string;
  destination?: string;
  departureAt?: string;
  seats?: number;
  deadline?: string;
  highValue?: boolean;
  trade?: string;
  schedule?: string;
  coverageRadiusM?: number;
}

export interface Listing extends BaseEntity {
  type: ListingType;
  category: string;
  title: string;
  description: string;
  authorId: string;
  district: string;
  lat: number;
  lng: number;
  status: ListingStatus;
  expiresAt: string;
  meta: ListingMeta;
  audio?: Blob;
  audioMime?: string;
  audioDuration?: number;
  hidden?: 0 | 1;
}

export interface RequestMeta {
  wallet?: PointReservation;
  receipt?: DeliveryReceipt;
  review?: DeliveryReview;
  recommendedName?: string;
  recommendedProviderId?: string;
  rating?: number;
  hours?: number;
  seats?: number;
  startAt?: string;
  endAt?: string;
  note?: string;
}

export interface PointReservation {
  cost: 15 | 30 | 50;
  held: number;
  subsidy: number;
  crisis: boolean;
}

export interface DeliveryReceipt {
  accuracy: number;
  punctuality: number;
  quality: number;
  comment: string;
  flagged: boolean;
  at: string;
  crisis: boolean;
}

export interface DeliveryReview {
  decision: 'valid' | 'fraud';
  moderatorId: string;
  at: string;
  reason: string;
}

export interface RequestEntity extends BaseEntity {
  listingId: string;
  requesterId: string;
  ownerId: string;
  status: RequestStatus;
  message: string;
  meta: RequestMeta;
}

export interface Alert extends BaseEntity {
  severity: AlertSeverity;
  category: string;
  title: string;
  description: string;
  authorId: string;
  district: string;
  lat: number;
  lng: number;
  status: AlertStatus;
  brigadeProfileId?: string;
  assignedAt?: string;
  resolvedAt?: string;
  audio?: Blob;
  audioMime?: string;
  audioDuration?: number;
}

export interface BrigadeProfile extends BaseEntity {
  profileId: string;
  skills: string[];
  resources: string[];
  certifications: string;
  availability: Availability;
  district: string;
  lat: number;
  lng: number;
}

export type NotificationType =
  | 'endorsement_received'
  | 'request_received'
  | 'request_accepted'
  | 'request_rejected'
  | 'request_completed'
  | 'alert_created'
  | 'alert_assigned'
  | 'alert_resolved'
  | 'broadcast'
  | 'moderation'
  | 'sync_conflict'
  | 'system';

export interface AppNotification {
  id: string;
  profileId: string;
  type: NotificationType;
  title: string;
  body: string;
  read: 0 | 1;
  createdAt: string;
  link?: string;
}

export type ReputationType =
  | 'donation_delivered'
  | 'loan_returned_owner'
  | 'loan_returned_requester'
  | 'time_bank_hour'
  | 'alert_resolved'
  | 'endorsement_given'
  | 'manual';

export interface ReputationEvent {
  id: string;
  profileId: string;
  type: ReputationType;
  points: number;
  description: string;
  createdAt: string;
}

export interface Report {
  id: string;
  targetType: 'listing' | 'provider' | 'alert' | 'profile';
  targetId: string;
  reporterId: string;
  reason: string;
  status: 'open' | 'resolved';
  createdAt: string;
  updatedAt: string;
  version: number;
  syncStatus: SyncStatus;
}

export interface QueueItem {
  id: string;
  entity: EntityName;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload: unknown;
  baseVersion: number;
  idempotencyKey: string;
  status: 'pending' | 'syncing' | 'error' | 'conflict';
  attempts: number;
  nextAttemptAt: string;
  createdAt: string;
  lastError?: string;
}

export interface Setting {
  key: string;
  value: string;
}

export interface ServerRecord {
  key: string;
  entity: string;
  id: string;
  version: number;
  updatedAt: string;
  data: unknown;
}

export interface ProcessedOp {
  idempotencyKey: string;
  createdAt: string;
}

export type SyncResult =
  | { ok: true; record?: ServerRecord }
  | { ok: false; conflict: true; serverRecord: ServerRecord }
  | { ok: false; conflict?: false; error: string };

export interface ProviderView extends Provider {
  profile?: Profile;
}

export interface ListingView extends Listing {
  author?: Profile;
}

export interface AlertView extends Alert {
  author?: Profile;
  brigade?: BrigadeProfile;
  brigadeProfile?: Profile;
}

export interface BrigadeView extends BrigadeProfile {
  profile?: Profile;
}

export interface RequestView extends RequestEntity {
  listing?: Listing;
  requester?: Profile;
  owner?: Profile;
}
