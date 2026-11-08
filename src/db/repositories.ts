import { sharedMode } from '../sync/mode';
import { remotePost, updateMembership } from '../sync/remote';
import { setSectorDisaster } from '../governance/territory';
import { db } from './db';
import { seedDatabase } from './seed';
import type {
  Alert,
  AlertSeverity,
  AppNotification,
  BrigadeProfile,
  Endorsement,
  EntityName,
  Listing,
  ListingMeta,
  ListingStatus,
  ListingType,
  NotificationType,
  Profile,
  Provider,
  QueueItem,
  Report,
  RequestEntity,
  RequestMeta,
  ReputationType,
  Role,
} from './types';
import { POINTS } from '../lib/reputation';
import { isAvailable, publicationExpiry } from '../lib/catalog';
import { nowIso, uid } from '../lib/utils';
import { distanceMeters, distanceWeight } from '../lib/geo';
import { requestSync } from '../sync/bus';
import { serverDb } from './server-db';
import { beneficiaryId, isExchange, needsReview, supplierId, validProof, type ProofInput } from '../economy/points';
import { canReview, confirmEligibility, reserveFor } from '../economy/wallet';
import { isSectorInDisaster, sectorOf } from '../governance/territory';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function queueItem(
  entity: EntityName,
  entityId: string,
  operation: QueueItem['operation'],
  payload: unknown,
  baseVersion: number,
): QueueItem {
  return {
    id: uid(),
    entity,
    entityId,
    operation,
    payload,
    baseVersion,
    idempotencyKey: uid(),
    status: 'pending',
    attempts: 0,
    nextAttemptAt: nowIso(),
    createdAt: nowIso(),
  };
}

export async function getSetting(
  key: string,
  fallback = '',
): Promise<string> {
  const setting = await db.settings.get(key);
  return setting?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}

/* ------------------------------------------------------------------ */
/* Profiles                                                            */
/* ------------------------------------------------------------------ */

export interface CreateProfileInput {
  name: string;
  phone: string;
  district: string;
  lat: number;
  lng: number;
  roles?: Role[];
}

export async function createProfile(
  input: CreateProfileInput,
): Promise<Profile> {
  const timestamp = nowIso();
  const profile: Profile = {
    id: uid(),
    name: input.name.trim(),
    phone: input.phone.trim(),
    district: input.district,
    lat: input.lat,
    lng: input.lng,
    roles: input.roles ?? ['vecino'],
    verified: 0,
    avatarColor: 'bg-slate-900',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.profiles.add(profile);
  await setSetting('currentProfileId', profile.id);
  await setSetting('onboarded', '1');
  return profile;
}

export async function updateProfile(
  id: string,
  patch: Partial<Omit<Profile, 'id' | 'createdAt'>>,
): Promise<void> {
  if(sharedMode && patch.roles){
    const current=await db.profiles.get(id);
    for(const role of patch.roles.filter(r=>!current?.roles.includes(r))){
      const {profile}=await remotePost<{profile:Profile}>('/community-role',{role});
      await db.profiles.put(profile);
    }
    return;
  }
  await db.profiles.update(id, { ...patch, updatedAt: nowIso() });
}

export async function verifyProfile(id: string, verified: boolean): Promise<void> {
  if(sharedMode){await updateMembership(id,{verified});return;}
  await db.profiles.update(id, {
    verified: verified ? 1 : 0,
    updatedAt: nowIso(),
  });
  await notify(id, {
    type: 'system',
    title: verified ? 'Vecino verificado' : 'Verificación retirada',
    body: verified
      ? 'Tu coordinador vecinal validó tu identidad. Ya tienes el sello de vecino verificado.'
      : 'Tu coordinador retiró el sello de verificación temporalmente.',
    link: '/perfil',
  });
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export async function notify(
  profileId: string,
  input: {
    type: NotificationType;
    title: string;
    body: string;
    link?: string;
  },
): Promise<AppNotification> {
  const notification: AppNotification = {
    id: uid(),
    profileId,
    type: input.type,
    title: input.title,
    body: input.body,
    read: 0,
    createdAt: nowIso(),
    link: input.link,
  };
  await db.notifications.add(notification);
  return notification;
}

export async function notifyMany(
  profileIds: string[],
  input: {
    type: NotificationType;
    title: string;
    body: string;
    link?: string;
  },
): Promise<void> {
  const unique = [...new Set(profileIds)];
  if (unique.length === 0) return;
  const timestamp = nowIso();
  await db.notifications.bulkAdd(
    unique.map((profileId) => ({
      id: uid(),
      profileId,
      type: input.type,
      title: input.title,
      body: input.body,
      read: 0 as const,
      createdAt: timestamp,
      link: input.link,
    })),
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  await db.notifications.update(id, { read: 1 });
}

export async function markAllNotificationsRead(profileId: string): Promise<void> {
  const unread = await db.notifications
    .where('[profileId+read]')
    .equals([profileId, 0])
    .toArray();
  await Promise.all(unread.map((item) => db.notifications.update(item.id, { read: 1 })));
}

/* ------------------------------------------------------------------ */
/* Reputation                                                          */
/* ------------------------------------------------------------------ */

export async function reputationPoints(profileId: string): Promise<number> {
  const events = await db.reputationEvents
    .where('profileId')
    .equals(profileId)
    .toArray();
  return events.reduce((sum, event) => sum + event.points, 0);
}

export async function awardPoints(
  profileId: string,
  type: ReputationType,
  description: string,
  points = POINTS[type],
): Promise<void> {
  if (points === 0) return;
  await db.reputationEvents.add({
    id: uid(),
    profileId,
    type,
    points,
    description,
    createdAt: nowIso(),
  });
}

/* ------------------------------------------------------------------ */
/* Providers & endorsements                                            */
/* ------------------------------------------------------------------ */

export interface ProviderInput {
  trade: string;
  description: string;
  district: string;
  lat: number;
  lng: number;
  coverageRadiusM: number;
  schedule: string;
}

export async function upsertMyProvider(
  profile: Profile,
  input: ProviderInput,
): Promise<Provider> {
  const existing = await db.providers.where('profileId').equals(profile.id).first();
  const timestamp = nowIso();

  if (existing) {
    const updated: Provider = {
      ...existing,
      ...input,
      status: 'active',
      updatedAt: timestamp,
      version: existing.version + 1,
      syncStatus: 'pending',
    };
    await db.transaction('rw', db.providers, db.syncQueue, async () => {
      await db.providers.put(updated);
      await db.syncQueue.add(
        queueItem('providers', updated.id, 'update', updated, existing.version),
      );
    });
    requestSync();
    return updated;
  }

  const provider: Provider = {
    id: uid(),
    profileId: profile.id,
    ...input,
    status: 'active',
    score: 0,
    endorsementCount: 0,
    verified: profile.verified,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    syncStatus: 'pending',
  };

  await db.transaction('rw', db.providers, db.syncQueue, async () => {
    await db.providers.add(provider);
    await db.syncQueue.add(queueItem('providers', provider.id, 'create', provider, 0));
  });
  requestSync();
  return provider;
}

export async function deactivateMyProvider(providerId: string): Promise<void> {
  const provider = await db.providers.get(providerId);
  if (!provider) return;
  const updated: Provider = {
    ...provider,
    status: 'inactive',
    updatedAt: nowIso(),
    version: provider.version + 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.providers, db.syncQueue, async () => {
    await db.providers.put(updated);
    await db.syncQueue.add(
      queueItem('providers', updated.id, 'update', updated, provider.version),
    );
  });
  requestSync();
}

export async function endorseProvider(
  providerId: string,
  endorser: Profile,
  weight: number,
  comment: string,
): Promise<{ ok: boolean; reason?: string }> {
  const provider = await db.providers.get(providerId);
  if (!provider) return { ok: false, reason: 'Prestador no encontrado.' };
  if (provider.profileId === endorser.id) {
    return { ok: false, reason: 'No puedes darte un Visto Bueno a ti mismo.' };
  }

  const existing = await db.endorsements
    .where('[providerId+endorserId]')
    .equals([providerId, endorser.id])
    .first();
  if (existing) {
    return { ok: false, reason: 'Ya diste tu Visto Bueno a este prestador.' };
  }

  const timestamp = nowIso();
  const endorsement: Endorsement = {
    id: uid(),
    providerId,
    endorserId: endorser.id,
    weight,
    comment: comment.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    syncStatus: 'pending',
  };

  const all = await db.endorsements.where('providerId').equals(providerId).toArray();
  const nextScore = [...all, endorsement].reduce((sum, item) => sum + item.weight, 0);

  const updatedProvider: Provider = {
    ...provider,
    score: Number(nextScore.toFixed(2)),
    endorsementCount: all.length + 1,
    updatedAt: timestamp,
    version: provider.version + 1,
    syncStatus: 'pending',
  };

  await db.transaction(
    'rw',
    db.endorsements,
    db.providers,
    db.syncQueue,
    db.reputationEvents,
    async () => {
      await db.endorsements.add(endorsement);
      await db.providers.put(updatedProvider);
      await db.syncQueue.add(
        queueItem('endorsements', endorsement.id, 'create', endorsement, 0),
      );
      await db.syncQueue.add(
        queueItem('providers', updatedProvider.id, 'update', updatedProvider, provider.version),
      );
      await db.reputationEvents.add({
        id: uid(),
        profileId: endorser.id,
        type: 'endorsement_given',
        points: POINTS.endorsement_given,
        description: `Visto Bueno a ${provider.trade}`,
        createdAt: timestamp,
      });
    },
  );

  await notify(provider.profileId, {
    type: 'endorsement_received',
    title: 'Nuevo Visto Bueno recibido',
    body: `${endorser.name} validó tu trabajo de ${provider.trade}.`,
    link: `/directorio/${provider.id}`,
  });
  requestSync();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Listings                                                            */
/* ------------------------------------------------------------------ */

export interface CreateListingInput {
  type: ListingType;
  category: string;
  title: string;
  description: string;
  authorId: string;
  district: string;
  lat: number;
  lng: number;
  meta: ListingMeta;
  expiresAt?: string;
  audio?: Blob;
  audioMime?: string;
  audioDuration?: number;
}

export async function createListing(
  input: CreateListingInput,
): Promise<Listing> {
  if(sharedMode && !(await db.profiles.get(input.authorId))?.verified)throw Error('La junta debe validar tu residencia antes de publicar.');
  const timestamp = nowIso();
  const listing: Listing = {
    id: uid(),
    type: input.type,
    category: input.category,
    title: input.title.trim(),
    description: input.description.trim(),
    authorId: input.authorId,
    district: input.district,
    lat: input.lat,
    lng: input.lng,
    status: 'open',
    expiresAt: publicationExpiry(input.type, input.meta, Date.parse(timestamp), input.expiresAt),
    meta: input.meta,
    audio: input.audio,
    audioMime: input.audioMime,
    audioDuration: input.audioDuration,
    hidden: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    syncStatus: 'pending',
  };

  await db.transaction('rw', [db.listings, db.requests, db.profiles, db.settings, db.syncQueue, db.notifications], async () => {
    if (isExchange(listing.type)) {
      const author = await db.profiles.get(listing.authorId);
      if (!author) throw new Error('No se encontró el perfil del vecino.');
      if (listing.type === 'favor') {
        listing.meta.wallet = await reserveFor(author, listing);
        const radius = Number(listing.meta.coverageRadiusM ?? 800);
        if (!(radius >= 200 && radius <= 3000)) throw new Error('Elige un radio entre 200 y 3000 metros.');
        const neighbors = await db.profiles.where('district').equals(listing.district).toArray();
        await notifyMany(neighbors.filter(person => person.id !== author.id && sectorOf(person).id === sectorOf(listing).id && distanceMeters(person, listing) <= radius).map(person => person.id), {
          type: 'system', title: 'Un vecino cercano necesita ayuda', body: listing.title, link: '/muro/' + listing.id,
        });
      } else {
        await confirmEligibility(author, listing);
      }
    }
    await db.listings.add(listing);
    await db.syncQueue.add(queueItem('listings', listing.id, 'create', listing, 0));
  });
  requestSync();
  return listing;
}

export async function updateListing(
  id: string,
  patch: Partial<Omit<Listing, 'id' | 'createdAt'>>,
): Promise<Listing | undefined> {
  const listing = await db.listings.get(id);
  if (!listing) return undefined;
  const updated: Listing = {
    ...listing,
    ...patch,
    updatedAt: nowIso(),
    version: listing.version + 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.listings, db.syncQueue, async () => {
    await db.listings.put(updated);
    await db.syncQueue.add(
      queueItem('listings', updated.id, 'update', updated, listing.version),
    );
  });
  requestSync();
  return updated;
}

export async function setListingStatus(
  id: string,
  status: ListingStatus,
): Promise<void> {
  const listing = await db.listings.get(id);
  if (listing && isExchange(listing.type) && ['open', 'completed'].includes(status)) {
    throw new Error('La entrega se confirma desde la solicitud. Para otra entrega, crea una publicación.');
  }
  await updateListing(id, { status });
}

export async function hideListing(id: string, actorId: string): Promise<void> {
  const listing = await db.listings.get(id);
  if (!listing) return;
  if (isExchange(listing.type) && ['reserved','in_progress'].includes(listing.status)) {
    throw new Error('Cierra la solicitud en curso antes de retirar la publicación.');
  }
  await updateListing(id, { status: 'hidden', hidden: 1 });
  await notify(listing.authorId, {
    type: 'moderation',
    title: 'Publicación oculta',
    body: `Tu publicación "${listing.title}" fue oculta por moderación.`,
    link: '/perfil/publicaciones',
  });
  await db.reports
    .where('targetId')
    .equals(id)
    .modify({ status: 'resolved', updatedAt: nowIso() });
  void actorId;
}

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

export interface CreateRequestInput {
  listingId: string;
  requester: Profile;
  message: string;
  meta?: RequestMeta;
}

export async function recommendProfessional(listingId: string, actor: Profile, name: string,
  providerId: string, comment: string, rating: number) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.trim().length < 5) {
    throw new Error('Califica de 1 a 5 y cuenta tu experiencia en al menos cinco caracteres.');
  }
  await db.transaction('rw', [db.requests, db.listings, db.profiles, db.providers, db.endorsements,
    db.syncQueue, db.notifications, db.reputationEvents], async () => {
    const listing = await db.listings.get(listingId);
    if (!listing || listing.type !== 'recommendation' || !isAvailable(listing)) throw new Error('El hilo está cerrado.');
    if (listing.authorId === actor.id) throw new Error('La recomendación debe venir de otro vecino.');
    const provider = providerId ? await db.providers.get(providerId) : undefined;
    if (providerId && (!provider || provider.status !== 'active' || provider.district !== listing.district ||
      provider.profileId === actor.id)) throw new Error('Elige otro profesional del distrito.');
    const recommendedName = provider ? (await db.profiles.get(provider.profileId))?.name : name.trim();
    if (!recommendedName || recommendedName.length < 2) throw new Error('Ingresa el nombre del profesional.');
    const id = 'rec-' + listing.id + '-' + actor.id;
    if (await db.requests.get(id)) throw new Error('Ya recomendaste a alguien en este hilo.');
    const timestamp = nowIso();
    const reply: RequestEntity = {
      id, listingId, requesterId: actor.id, ownerId: listing.authorId, message: comment.trim(),
      status: 'completed', meta: { recommendedName, recommendedProviderId: provider?.id, rating },
      createdAt: timestamp, updatedAt: timestamp, version: 1, syncStatus: 'pending',
    };
    await db.requests.add(reply);
    await db.syncQueue.add(queueItem('requests', id, 'create', reply, 0));
    if (provider && rating >= 4) {
      await endorseProvider(provider.id, actor, distanceWeight(distanceMeters(actor, provider)), reply.message);
    }
    await notify(listing.authorId, { type: 'system', title: 'Nueva recomendación',
      body: actor.name + ' respondió a tu pregunta.', link: '/muro/' + listing.id });
  });
  requestSync();
}

export async function createRequest(
  input: CreateRequestInput,
): Promise<{ ok: boolean; reason?: string; request?: RequestEntity }> {
  try {
    return await db.transaction('rw', [db.requests, db.listings, db.syncQueue, db.profiles, db.settings, db.reputationEvents, db.notifications], () => saveNewRequest(input));
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'No se pudo guardar la solicitud.' };
  }
}

async function saveNewRequest(input: CreateRequestInput) {
  if(sharedMode && !input.requester.verified)return {ok:false,reason:'La junta debe validar tu residencia antes de solicitar ayuda.'};
  const listing = await db.listings.get(input.listingId);
  if (!listing) return { ok: false, reason: 'La publicación ya no existe.' };
  if (listing.authorId === input.requester.id) {
    return { ok: false, reason: 'No puedes solicitar tu propia publicación.' };
  }
  if (!isAvailable(listing) || listing.type === 'recommendation') {
    return { ok: false, reason: 'Esta publicación ya no está disponible.' };
  }

  const openRequests = await db.requests
    .where('requesterId')
    .equals(input.requester.id)
    .filter((item) =>
      ['pending', 'accepted', 'in_progress'].includes(item.status),
    )
    .count();
  if (openRequests >= 3 && !(isExchange(listing.type) && await isSectorInDisaster(listing))) {
    return {
      ok: false,
      reason:
        'Tienes 3 solicitudes abiertas. Completa una antes de crear otra (regla anti-free-riding).',
    };
  }

  if (listing.meta.highValue) {
    const points = await reputationPoints(input.requester.id);
    if (points < 5) {
      return {
        ok: false,
        reason:
          'Los préstamos de alto valor requieren al menos 5 puntos de reputación.',
      };
    }
  }

  const existing = await db.requests
    .where('listingId')
    .equals(listing.id)
    .filter(
      (item) =>
        item.requesterId === input.requester.id &&
        ['pending', 'accepted', 'in_progress'].includes(item.status),
    )
    .first();
  if (existing) {
    return { ok: false, reason: 'Ya tienes una solicitud activa para esta publicación.' };
  }

  const timestamp = nowIso();
  const request: RequestEntity = {
    id: uid(),
    listingId: listing.id,
    requesterId: input.requester.id,
    ownerId: listing.authorId,
    status: 'pending',
    message: input.message.trim(),
    meta: { ...input.meta },
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    syncStatus: 'pending',
  };

  if (isExchange(listing.type)) {
    const requester = await db.profiles.get(input.requester.id);
    if (!requester) return { ok: false, reason: 'No se encontró tu perfil.' };
    delete request.meta.receipt;
    delete request.meta.review;
    delete request.meta.wallet;
    if (listing.type === 'time_bank') request.meta.wallet = await reserveFor(requester, listing);
    else await confirmEligibility(requester, listing);
  }
  await db.requests.add(request);
  await db.syncQueue.add(queueItem('requests', request.id, 'create', request, 0));

  await notify(listing.authorId, {
    type: 'request_received',
    title: 'Nueva solicitud recibida',
    body: `${input.requester.name} quiere "${listing.title}".`,
    link: '/perfil/solicitudes',
  });
  requestSync();
  return { ok: true, request };
}

export async function respondRequest(
  requestId: string,
  actor: Profile,
  decision: 'accepted' | 'rejected',
): Promise<{ ok: boolean; reason?: string }> {
  return db.transaction('rw', [db.requests,db.listings,db.syncQueue,db.notifications], () => saveResponse(requestId, actor, decision));
}

async function saveResponse(requestId: string, actor: Profile, decision: 'accepted' | 'rejected') {
  const request = await db.requests.get(requestId);
  if (!request) return { ok: false, reason: 'Solicitud no encontrada.' };
  if (request.ownerId !== actor.id) {
    return { ok: false, reason: 'Solo el dueño de la publicación puede responder.' };
  }
  if (request.status !== 'pending') {
    return { ok: false, reason: 'Esta solicitud ya fue respondida.' };
  }

  const listing = await db.listings.get(request.listingId);
  if (decision === 'accepted' && (!listing || !isAvailable(listing))) return { ok: false, reason: 'Esta publicación ya no está disponible.' };
  const timestamp = nowIso();
  const updated: RequestEntity = {
    ...request,
    status: decision,
    updatedAt: timestamp,
    version: request.version + 1,
    syncStatus: 'pending',
  };

  await db.transaction('rw', db.requests, db.syncQueue, db.listings, async () => {
    await db.requests.put(updated);
    await db.syncQueue.add(
      queueItem('requests', updated.id, 'update', updated, request.version),
    );
    if (decision === 'accepted' && listing) {
      const nextListing: Listing = {
        ...listing,
        status: 'reserved',
        updatedAt: timestamp,
        version: listing.version + 1,
        syncStatus: 'pending',
      };
      await db.listings.put(nextListing);
      await db.syncQueue.add(
        queueItem('listings', nextListing.id, 'update', nextListing, listing.version),
      );
      if (isExchange(listing.type)) {
        const pending = await db.requests.where('[listingId+status]').equals([listing.id, 'pending']).toArray();
        for (const other of pending) {
          await saveRequestChange(other, { status: 'rejected' });
          await notify(other.requesterId, { type: 'request_rejected', title: 'El intercambio se asignó a otro vecino', body: listing.title, link: '/perfil/solicitudes' });
        }
      }
    }
  });

  await notify(request.requesterId, {
    type: decision === 'accepted' ? 'request_accepted' : 'request_rejected',
    title:
      decision === 'accepted'
        ? '¡Solicitud aceptada!'
        : 'Solicitud no aceptada',
    body:
      decision === 'accepted'
        ? `${actor.name} aceptó tu solicitud${listing ? ` de "${listing.title}"` : ''}. Coordinen la entrega.`
        : `${actor.name} no pudo aceptar tu solicitud${listing ? ` de "${listing.title}"` : ''}.`,
    link: '/perfil/solicitudes',
  });
  requestSync();
  return { ok: true };
}

export async function completeRequest(
  requestId: string,
  actor: Profile,
): Promise<{ ok: boolean; reason?: string }> {
  const request = await db.requests.get(requestId);
  if (!request) return { ok: false, reason: 'Solicitud no encontrada.' };
  if (![request.ownerId, request.requesterId].includes(actor.id)) {
    return { ok: false, reason: 'No participas en esta solicitud.' };
  }
  if (!['accepted', 'in_progress'].includes(request.status)) {
    return { ok: false, reason: 'La solicitud todavía no está en curso.' };
  }

  const listing = await db.listings.get(request.listingId);
  if (listing && isExchange(listing.type)) {
    return { ok: false, reason: 'Registra la entrega y la valoración desde la solicitud.' };
  }
  const timestamp = nowIso();
  const updated: RequestEntity = {
    ...request,
    status: 'completed',
    updatedAt: timestamp,
    version: request.version + 1,
    syncStatus: 'pending',
  };

  await db.transaction('rw', db.requests, db.syncQueue, db.listings, async () => {
    await db.requests.put(updated);
    await db.syncQueue.add(
      queueItem('requests', updated.id, 'update', updated, request.version),
    );
    if (listing) {
      const nextListing: Listing = {
        ...listing,
        status: 'completed',
        updatedAt: timestamp,
        version: listing.version + 1,
        syncStatus: 'pending',
      };
      await db.listings.put(nextListing);
      await db.syncQueue.add(
        queueItem('listings', nextListing.id, 'update', nextListing, listing.version),
      );
    }
  });

  if (listing) {
    const label = listing.title;
    if (listing.type === 'donation') {
      await awardPoints(request.ownerId, 'donation_delivered', `Donación entregada: ${label}`);
    } else if (listing.type === 'loan') {
      await awardPoints(request.ownerId, 'loan_returned_owner', `Préstamo devuelto: ${label}`);
      await awardPoints(request.requesterId, 'loan_returned_requester', `Devolución confirmada: ${label}`);
    } else if (listing.type === 'time_bank') {
      await awardPoints(request.ownerId, 'time_bank_hour', `Hora de banco de tiempo: ${label}`);
      await awardPoints(request.requesterId, 'time_bank_hour', `Hora de banco de tiempo: ${label}`);
    } else {
      await awardPoints(request.ownerId, 'manual', `Servicio completado: ${label}`, 1);
      await awardPoints(request.requesterId, 'manual', `Servicio completado: ${label}`, 1);
    }
  }

  await notify(request.requesterId, {
    type: 'request_completed',
    title: 'Solicitud completada',
    body: `Se completó "${listing?.title ?? 'la solicitud'}". ¡Gracias por fortalecer el barrio!`,
    link: '/perfil/solicitudes',
  });
  await notify(request.ownerId, {
    type: 'request_completed',
    title: 'Solicitud completada',
    body: `Se completó "${listing?.title ?? 'la solicitud'}". Se sumaron puntos de reputación.`,
    link: '/perfil/solicitudes',
  });
  requestSync();
  return { ok: true };
}

export async function cancelRequest(
  requestId: string,
  actor: Profile,
): Promise<void> {
  return db.transaction('rw', [db.requests, db.listings, db.syncQueue, db.notifications], () => saveCancellation(requestId, actor));
}

async function saveCancellation(requestId: string, actor: Profile) {
  const request = await db.requests.get(requestId);
  if (!request) return;
  if (![request.ownerId, request.requesterId].includes(actor.id)) return;
  const listing = await db.listings.get(request.listingId);
  if (['completed', 'cancelled', 'rejected'].includes(request.status)) return;
  if (listing && isExchange(listing.type) && request.status === 'in_progress') return;

  const updated: RequestEntity = {
    ...request,
    status: 'cancelled',
    updatedAt: nowIso(),
    version: request.version + 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.requests, db.syncQueue, async () => {
    await db.requests.put(updated);
    await db.syncQueue.add(
      queueItem('requests', updated.id, 'update', updated, request.version),
    );
  });

  const other = request.requesterId === actor.id ? request.ownerId : request.requesterId;
  if (listing && request.status === 'accepted' && listing.status === 'reserved') {
    await updateListing(listing.id, { status: listing.expiresAt > nowIso() ? 'open' : 'expired' });
  }
  await notify(other, {
    type: 'system',
    title: 'Solicitud cancelada',
    body: `${actor.name} canceló una solicitud.`,
    link: '/perfil/solicitudes',
  });
  requestSync();
}

async function saveRequestChange(request: RequestEntity, patch: Partial<Pick<RequestEntity,'status'|'meta'>>) {
  const updated: RequestEntity = { ...request, ...patch, version: request.version + 1, updatedAt: nowIso(), syncStatus: 'pending' };
  await db.requests.put(updated);
  await db.syncQueue.add(queueItem('requests', updated.id, 'update', updated, request.version));
}

export async function advanceExchange(id: string, actor: Profile, proof?: ProofInput): Promise<void> {
  await db.transaction('rw', [db.requests, db.listings, db.profiles, db.settings, db.syncQueue, db.notifications], async () => {
    const request = await db.requests.get(id);
    const listing = request && await db.listings.get(request.listingId);
    if (!request || !listing || !isExchange(listing.type)) throw new Error('No se encontró el intercambio.');
    const supplier = supplierId(listing, request);
    const beneficiary = beneficiaryId(listing, request);
    if (supplier === beneficiary) throw new Error('El intercambio requiere dos vecinos distintos.');
    if (!proof) {
      if (actor.id !== supplier || request.status !== 'accepted') throw new Error('Solo quien brinda la ayuda puede registrar la entrega aceptada.');
      await saveRequestChange(request, { status: 'in_progress' });
      await notify(beneficiary, { type: 'system', title: 'Confirma la recepción', body: listing.title, link: '/muro/' + listing.id });
    } else {
      if (actor.id !== beneficiary || request.status !== 'in_progress') throw new Error('Solo el receptor puede valorar una entrega registrada.');
      if (!validProof(proof)) throw new Error('Califica los tres criterios y describe la entrega en 5 a 500 caracteres.');
      const crisis = Boolean((listing.meta.wallet ?? request.meta.wallet)?.crisis) || await isSectorInDisaster(listing);
      const receipt = { ...proof, comment: proof.comment.trim(), at: nowIso(), crisis };
      await saveRequestChange(request, { status: 'completed', meta: { ...request.meta, receipt } });
      await updateListing(listing.id, { status: 'completed' });
      await notify(supplier, { type: 'request_completed', title: needsReview(proof) ? 'Entrega enviada a revisión' : 'Recepción confirmada', body: listing.title, link: '/billetera' });
    }
  });
  requestSync();
}

export async function reviewExchange(id: string, actor: Profile, decision: 'valid'|'fraud', reason: string) {
  await db.transaction('rw', [db.requests,db.profiles,db.listings,db.settings,db.syncQueue,db.notifications], async () => {
    const request = await db.requests.get(id);
    const listing = request && await db.listings.get(request.listingId);
    if (!request?.meta.receipt || request.meta.review || !listing) throw new Error('Esta entrega ya fue revisada o aún no fue confirmada.');
    if ([request.ownerId,request.requesterId].includes(actor.id) || !await canReview(actor, listing)) throw new Error('La revisión requiere otro miembro de la junta del sector.');
    if (reason.trim().length < 5 || reason.length > 500) throw new Error('Explica tu decisión en 5 a 500 caracteres.');
    await saveRequestChange(request, { meta: { ...request.meta, review: { decision, reason: reason.trim(), moderatorId: actor.id, at: nowIso() } } });
    await notifyMany([request.ownerId,request.requesterId], { type:'moderation', title: decision === 'fraud' ? 'Entrega invalidada por la junta' : 'Entrega validada', body: reason.trim(), link:'/billetera' });
  });
  requestSync();
}

/* ------------------------------------------------------------------ */
/* Alerts                                                              */
/* ------------------------------------------------------------------ */

export interface CreateAlertInput {
  severity: AlertSeverity;
  category: string;
  title: string;
  description: string;
  author: Profile;
  district: string;
  lat: number;
  lng: number;
  audio?: Blob;
  audioMime?: string;
  audioDuration?: number;
}

export async function createAlert(input: CreateAlertInput): Promise<Alert> {
  if(sharedMode && !input.author.verified)throw Error('La junta debe validar tu residencia antes de emitir alertas.');
  const timestamp = nowIso();
  const alert: Alert = {
    id: uid(),
    severity: input.severity,
    category: input.category,
    title: input.title.trim(),
    description: input.description.trim(),
    authorId: input.author.id,
    district: input.district,
    lat: input.lat,
    lng: input.lng,
    status: 'pending',
    audio: input.audio,
    audioMime: input.audioMime,
    audioDuration: input.audioDuration,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    syncStatus: 'pending',
  };

  await db.transaction('rw', db.alerts, db.syncQueue, async () => {
    await db.alerts.add(alert);
    await db.syncQueue.add(queueItem('alerts', alert.id, 'create', alert, 0));
  });

  const responders = await db.profiles
    .filter((profile) => profile.roles.includes('brigadista') || profile.roles.includes('coordinador'))
    .toArray();
  await notifyMany(
    responders.map((profile) => profile.id),
    {
      type: 'alert_created',
      title: `Alerta ${input.severity === 'critical' ? 'crítica' : input.severity === 'high' ? 'alta' : 'media'}`,
      body: `${input.author.name}: ${alert.title}.`,
      link: `/alertas/${alert.id}`,
    },
  );
  requestSync();
  return alert;
}

export async function acceptAlert(
  alertId: string,
  actor: Profile,
): Promise<{ ok: boolean; reason?: string }> {
  const alert = await db.alerts.get(alertId);
  if (!alert) return { ok: false, reason: 'Alerta no encontrada.' };
  const brigade = await db.brigadeProfiles.where('profileId').equals(actor.id).first();
  if (!brigade) {
    return { ok: false, reason: 'Necesitas una ficha de brigadista para atender alertas.' };
  }
  if (alert.status !== 'pending') {
    return { ok: false, reason: 'Esta alerta ya tiene un responsable.' };
  }

  const timestamp = nowIso();
  const updated: Alert = {
    ...alert,
    status: 'assigned',
    brigadeProfileId: brigade.id,
    assignedAt: timestamp,
    updatedAt: timestamp,
    version: alert.version + 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.alerts, db.syncQueue, async () => {
    await db.alerts.put(updated);
    await db.syncQueue.add(queueItem('alerts', updated.id, 'update', updated, alert.version));
  });

  await notify(alert.authorId, {
    type: 'alert_assigned',
    title: 'Tu alerta tiene respuesta',
    body: `${actor.name} va en camino a "${alert.title}".`,
    link: `/alertas/${alert.id}`,
  });
  requestSync();
  return { ok: true };
}

export async function resolveAlert(
  alertId: string,
  actor: Profile,
): Promise<{ ok: boolean; reason?: string }> {
  const alert = await db.alerts.get(alertId);
  if (!alert) return { ok: false, reason: 'Alerta no encontrada.' };
  const brigade = await db.brigadeProfiles.where('profileId').equals(actor.id).first();
  const canResolve =
    alert.authorId === actor.id ||
    actor.roles.includes('coordinador') ||
    (brigade && alert.brigadeProfileId === brigade.id);
  if (!canResolve) {
    return { ok: false, reason: 'Solo el brigadista asignado, el autor o un coordinador pueden cerrar la alerta.' };
  }
  if (alert.status === 'resolved') return { ok: true };

  const timestamp = nowIso();
  const updated: Alert = {
    ...alert,
    status: 'resolved',
    resolvedAt: timestamp,
    updatedAt: timestamp,
    version: alert.version + 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.alerts, db.syncQueue, async () => {
    await db.alerts.put(updated);
    await db.syncQueue.add(queueItem('alerts', updated.id, 'update', updated, alert.version));
  });

  if (alert.brigadeProfileId) {
    const assigned = await db.brigadeProfiles.get(alert.brigadeProfileId);
    if (assigned) {
      await awardPoints(assigned.profileId, 'alert_resolved', `Alerta resuelta: ${alert.title}`);
    }
  }
  await notify(alert.authorId, {
    type: 'alert_resolved',
    title: 'Alerta resuelta',
    body: `"${alert.title}" fue marcada como resuelta. Gracias por avisar.`,
    link: `/alertas/${alert.id}`,
  });
  requestSync();
  return { ok: true };
}

export async function cancelAlert(alertId: string, actor: Profile): Promise<void> {
  const alert = await db.alerts.get(alertId);
  if (!alert) return;
  if (alert.authorId !== actor.id && !actor.roles.includes('coordinador')) return;
  const updated: Alert = {
    ...alert,
    status: 'cancelled',
    updatedAt: nowIso(),
    version: alert.version + 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.alerts, db.syncQueue, async () => {
    await db.alerts.put(updated);
    await db.syncQueue.add(queueItem('alerts', updated.id, 'update', updated, alert.version));
  });
  requestSync();
}

/* ------------------------------------------------------------------ */
/* Brigade                                                             */
/* ------------------------------------------------------------------ */

export interface BrigadeInput {
  skills: string[];
  resources: string[];
  certifications: string;
  district: string;
  lat: number;
  lng: number;
}

export async function upsertMyBrigadeProfile(
  profile: Profile,
  input: BrigadeInput,
): Promise<BrigadeProfile> {
  const existing = await db.brigadeProfiles.where('profileId').equals(profile.id).first();
  const timestamp = nowIso();

  if (existing) {
    const updated: BrigadeProfile = {
      ...existing,
      ...input,
      updatedAt: timestamp,
      version: existing.version + 1,
      syncStatus: 'pending',
    };
    await db.transaction('rw', db.brigadeProfiles, db.syncQueue, async () => {
      await db.brigadeProfiles.put(updated);
      await db.syncQueue.add(
        queueItem('brigadeProfiles', updated.id, 'update', updated, existing.version),
      );
    });
    requestSync();
    return updated;
  }

  const brigade: BrigadeProfile = {
    id: uid(),
    profileId: profile.id,
    ...input,
    availability: 'available',
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.brigadeProfiles, db.syncQueue, async () => {
    await db.brigadeProfiles.add(brigade);
    await db.syncQueue.add(
      queueItem('brigadeProfiles', brigade.id, 'create', brigade, 0),
    );
  });
  requestSync();
  return brigade;
}

export async function setBrigadeAvailability(
  brigadeId: string,
  availability: BrigadeProfile['availability'],
): Promise<void> {
  const brigade = await db.brigadeProfiles.get(brigadeId);
  if (!brigade) return;
  const updated: BrigadeProfile = {
    ...brigade,
    availability,
    updatedAt: nowIso(),
    version: brigade.version + 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.brigadeProfiles, db.syncQueue, async () => {
    await db.brigadeProfiles.put(updated);
    await db.syncQueue.add(
      queueItem('brigadeProfiles', updated.id, 'update', updated, brigade.version),
    );
  });
  requestSync();
}

/* ------------------------------------------------------------------ */
/* Reports & moderation                                                */
/* ------------------------------------------------------------------ */

export async function createReport(
  targetType: Report['targetType'],
  targetId: string,
  reporter: Profile,
  reason: string,
): Promise<void> {
  const timestamp = nowIso();
  const report: Report = {
    id: uid(),
    targetType,
    targetId,
    reporterId: reporter.id,
    reason: reason.trim(),
    status: 'open',
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.reports, db.syncQueue, async () => {
    await db.reports.add(report);
    await db.syncQueue.add(queueItem('reports', report.id, 'create', report, 0));
  });

  const coordinators = await db.profiles
    .filter((profile) => profile.roles.includes('coordinador'))
    .toArray();
  await notifyMany(
    coordinators.map((profile) => profile.id),
    {
      type: 'moderation',
      title: 'Nuevo reporte de moderación',
      body: `${reporter.name} reportó ${targetType === 'listing' ? 'una publicación' : targetType === 'provider' ? 'un prestador' : targetType === 'alert' ? 'una alerta' : 'un perfil'}.`,
      link: '/coordinador',
    },
  );
  requestSync();
}

export async function resolveReport(
  reportId: string,
  status: 'open' | 'resolved',
): Promise<void> {
  const report = await db.reports.get(reportId);
  if (!report) return;
  const updated: Report = {
    ...report,
    status,
    updatedAt: nowIso(),
    version: report.version + 1,
    syncStatus: 'pending',
  };
  await db.transaction('rw', db.reports, db.syncQueue, async () => {
    await db.reports.put(updated);
    await db.syncQueue.add(
      queueItem('reports', updated.id, 'update', updated, report.version),
    );
  });
  requestSync();
}

/* ------------------------------------------------------------------ */
/* Crisis, broadcasts & settings                                       */
/* ------------------------------------------------------------------ */

export async function setCrisisMode(
  enabled: boolean,
  actor: Profile,
): Promise<void> {
  await setSectorDisaster(actor.id,enabled);
}

export async function sendBroadcast(
  actor: Profile,
  title: string,
  body: string,
): Promise<void> {
  const profiles = await db.profiles.toArray();
  await notifyMany(
    profiles.map((profile) => profile.id),
    {
      type: 'broadcast',
      title: title.trim(),
      body: body.trim(),
      link: '/notificaciones',
    },
  );
  void actor;
}

/* ------------------------------------------------------------------ */
/* Backup, import & reset                                              */
/* ------------------------------------------------------------------ */

export interface BackupPayload {
  app: 'vecino360';
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function buildBackup(): Promise<BackupPayload> {
  const [
    profiles,
    providers,
    endorsements,
    listings,
    requests,
    alerts,
    brigadeProfiles,
    notifications,
    reputationEvents,
    reports,
    syncQueue,
    settings,
  ] = await Promise.all([
    db.profiles.toArray(),
    db.providers.toArray(),
    db.endorsements.toArray(),
    db.listings.toArray(),
    db.requests.toArray(),
    db.alerts.toArray(),
    db.brigadeProfiles.toArray(),
    db.notifications.toArray(),
    db.reputationEvents.toArray(),
    db.reports.toArray(),
    db.syncQueue.toArray(),
    db.settings.toArray(),
  ]);

  return {
    app: 'vecino360',
    exportedAt: nowIso(),
    tables: {
      profiles,
      providers,
      endorsements,
      listings,
      requests,
      alerts,
      brigadeProfiles,
      notifications,
      reputationEvents,
      reports,
      syncQueue,
      settings,
    },
  };
}

export async function downloadBackup(): Promise<void> {
  const payload = await buildBackup();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `vecino360-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function importBackup(json: string): Promise<void> {
  const parsed = JSON.parse(json) as BackupPayload;
  if (parsed.app !== 'vecino360' || !parsed.tables) {
    throw new Error('El archivo no es un respaldo válido de VECINO360.');
  }

  const tables = parsed.tables as Record<string, Array<Record<string, unknown>>>;
  const map: Array<[keyof typeof db, unknown[]]> = [
    ['profiles', tables.profiles ?? []],
    ['providers', tables.providers ?? []],
    ['endorsements', tables.endorsements ?? []],
    ['listings', tables.listings ?? []],
    ['requests', tables.requests ?? []],
    ['alerts', tables.alerts ?? []],
    ['brigadeProfiles', tables.brigadeProfiles ?? []],
    ['notifications', tables.notifications ?? []],
    ['reputationEvents', tables.reputationEvents ?? []],
    ['reports', tables.reports ?? []],
    ['syncQueue', tables.syncQueue ?? []],
    ['settings', tables.settings ?? []],
  ];

  await db.transaction(
    'rw',
    [
      db.profiles,
      db.providers,
      db.endorsements,
      db.listings,
      db.requests,
      db.alerts,
      db.brigadeProfiles,
      db.notifications,
      db.reputationEvents,
      db.reports,
      db.syncQueue,
      db.settings,
    ],
    async () => {
      for (const [tableName, rows] of map) {
        const table = db[tableName] as unknown as {
          clear: () => Promise<void>;
          bulkPut: (rows: unknown[]) => Promise<unknown>;
        };
        await table.clear();
        if (rows.length > 0) await table.bulkPut(rows);
      }
    },
  );
}

export async function resetDemo(): Promise<void> {
  await db.delete();
  await db.open();
  await serverDb.delete();
  await serverDb.open();
  await seedDatabase(true);
}

/** Precachea tiles del área demo para usar el mapa sin conexión. */
export async function prepareOfflineDemo(): Promise<number> {
  if ('storage' in navigator && 'persist' in navigator.storage) {
    try {
      await navigator.storage.persist();
    } catch {
      /* ignore */
    }
  }

  const center = { lat: -12.083, lng: -77.051 };
  const tiles: string[] = [];
  const toTile = (lat: number, lng: number, zoom: number) => {
    const n = 2 ** zoom;
    const x = Math.floor(((lng + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
    );
    return { x, y, z: zoom };
  };

  for (const zoom of [14, 15, 16]) {
    const base = toTile(center.lat, center.lng, zoom);
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dy = -2; dy <= 2; dy += 1) {
        tiles.push(
          `https://tile.openstreetmap.org/${zoom}/${base.x + dx}/${base.y + dy}.png`,
        );
      }
    }
  }

  let cached = 0;
  await Promise.all(
    tiles.map(async (url) => {
      try {
        const response = await fetch(url, { mode: 'cors' });
        if (response.ok) cached += 1;
      } catch {
        /* offline: ignore */
      }
    }),
  );

  await setSetting('demoPrepared', cached > 0 ? '1' : '0');
  return cached;
}

export async function storageEstimate(): Promise<{
  usage: number;
  quota: number;
}> {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0 };
  const estimate = await navigator.storage.estimate();
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
}

export async function queueSummary(): Promise<QueueItem[]> {
  return db.syncQueue.orderBy('createdAt').toArray();
}

export async function clearConflicts(): Promise<void> {
  await db.syncQueue.where('status').equals('conflict').delete();
  const conflicts = await db.providers.where('syncStatus').equals('conflict').toArray();
  for (const provider of conflicts) {
    await db.providers.update(provider.id, { syncStatus: 'synced' });
  }
  const listingConflicts = await db.listings.where('syncStatus').equals('conflict').toArray();
  for (const listing of listingConflicts) {
    await db.listings.update(listing.id, { syncStatus: 'synced' });
  }
  const alertConflicts = await db.alerts.where('syncStatus').equals('conflict').toArray();
  for (const alert of alertConflicts) {
    await db.alerts.update(alert.id, { syncStatus: 'synced' });
  }
}

/** Simula un conflicto de versión: el servidor queda con una versión más nueva. */
export async function simulateConflict(): Promise<void> {
  const listing = await db.listings.orderBy('createdAt').reverse().first();
  if (!listing) return;
  const serverVersion = listing.version + 2;
  await serverDb.records.put({
    key: `listings:${listing.id}`,
    entity: 'listings',
    id: listing.id,
    version: serverVersion,
    updatedAt: nowIso(),
    data: {
      ...listing,
      title: `${listing.title} (editado por otro dispositivo)`,
      version: serverVersion,
      syncStatus: 'synced',
      updatedAt: nowIso(),
    },
  });

  await updateListing(listing.id, { description: `${listing.description}\n\nAjuste local para demo.` });
  await db.settings.put({ key: 'demoConflictAt', value: nowIso() });
}
