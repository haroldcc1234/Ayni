import { sharedMode } from '../sync/mode';
import { boardCommand } from './territory';
import Dexie, { type Table } from 'dexie';
import { db } from '../db/db';
import type { Alert } from '../db/types';
import { authorize, logDecision, readRecord, sectorOf, sendSectorNotice, writeRecord } from './territory';

export interface AttendanceSignature {
  profileId: string; name: string; signedAt: string; publicKey: JsonWebKey; signature: string;
}
export interface Meeting {
  alertId: string; sectorId: string; scheduled: string; venue: string; kind: 'virtual' | 'presencial';
  organizer: string; minutes: string; attendees: string[]; signatures: AttendanceSignature[];
}

class SigningKeys extends Dexie {
  keys!: Table<{ profileId: string; pair: CryptoKeyPair }, string>;
  constructor() { super('vecino360-meeting-keys'); this.version(1).stores({ keys: 'profileId' }); }
}
const keys = new SigningKeys();
const algorithm = { name: 'ECDSA', namedCurve: 'P-256' };
const signatureAlgorithm = { name: 'ECDSA', hash: 'SHA-256' };
const meetingKey = (id: string) => 'meeting/' + id;

export function meetingFor(id: string) { return readRecord<Meeting>(meetingKey(id)); }

export async function callMeeting(actorId: string, alertId: string, kind: Meeting['kind'], scheduled: string, venue: string) {
  if(sharedMode)return boardCommand({type:'meeting',alertId,kind,scheduled,venue});
  const when = new Date(scheduled);
  if (!Number.isFinite(when.valueOf()) || when.valueOf() <= Date.now()) throw new Error('Elige una fecha y hora futuras.');
  if (venue.trim().length < 5) throw new Error('Escribe el punto de encuentro o el enlace de la reunión.');
  if (kind === 'virtual') {
    let url: URL;
    try { url = new URL(venue); } catch { throw new Error('Indica el enlace HTTPS de la sala.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Indica el enlace HTTPS de la sala.');
  }
  await db.transaction('rw', [db.settings, db.profiles, db.alerts, db.notifications], async () => {
    const alert: Alert | undefined = await db.alerts.get(alertId);
    if (!alert || ['resolved', 'cancelled'].includes(alert.status)) throw new Error('La alerta ya no está activa.');
    const sectorId = sectorOf(alert).id;
    const actor = await authorize(actorId, ['presidente', 'vocal'], sectorId);
    if (await meetingFor(alertId)) throw new Error('Ya existe una asamblea para esta alerta.');
    await writeRecord(meetingKey(alertId), {
      alertId, sectorId, scheduled: when.toISOString(), kind, venue: venue.trim(), organizer: actor.name,
      minutes: '', attendees: [], signatures: [],
    } satisfies Meeting);
    await sendSectorNotice(actor, 'Asamblea de emergencia', alert.title + ' · ' + when.toLocaleString('es-PE'), '/alertas/' + alertId);
    await logDecision(actor, 'Asamblea convocada · ' + alert.title);
  });
}

async function requiredMeeting(id: string) {
  const meeting = await meetingFor(id);
  if (!meeting) throw new Error('No encontramos la convocatoria.');
  return meeting;
}

export async function attendMeeting(actorId: string, alertId: string) {
  if(sharedMode)return boardCommand({type:'attend',alertId});
  await db.transaction('rw', db.settings, db.profiles, async () => {
    const meeting = await requiredMeeting(alertId);
    await authorize(actorId, ['vecino','vocal','presidente','tesorero'], meeting.sectorId);
    if (meeting.minutes) throw new Error('La lista de asistentes está cerrada.');
    if (!meeting.attendees.includes(actorId)) meeting.attendees.push(actorId);
    await writeRecord(meetingKey(alertId), meeting);
  });
}

export async function publishMinutes(actorId: string, alertId: string, minutes: string) {
  if(sharedMode)return boardCommand({type:'minutes',alertId,minutes});
  if (minutes.trim().length < 10 || minutes.length > 6000) throw new Error('Resume los acuerdos entre 10 y 6000 caracteres.');
  await db.transaction('rw', db.settings, db.profiles, async () => {
    const meeting = await requiredMeeting(alertId);
    const actor = await authorize(actorId, ['presidente','vocal'], meeting.sectorId);
    if (meeting.minutes || !meeting.attendees.length) throw new Error('El acta debe tener asistentes registrados y estar pendiente.');
    if (Date.parse(meeting.scheduled) > Date.now()) throw new Error('Espera hasta la hora de la asamblea antes de publicar los acuerdos.');
    meeting.minutes = minutes.trim();
    await writeRecord(meetingKey(alertId), meeting);
    await logDecision(actor, 'Acta publicada · ' + alertId);
  });
}

function signedPayload(meeting: Meeting, signer: Pick<AttendanceSignature, 'profileId' | 'name' | 'signedAt'>) {
  return new TextEncoder().encode(JSON.stringify([
    'vecino360-acta-v1', meeting.alertId, meeting.sectorId, meeting.scheduled, meeting.kind, meeting.venue,
    meeting.organizer, meeting.minutes, [...meeting.attendees].sort(), signer.profileId, signer.name, signer.signedAt,
  ]));
}

export async function verifySignature(meeting: Meeting, signature: AttendanceSignature) {
  try {
    if (!meeting.attendees.includes(signature.profileId) || !meeting.minutes) return false;
    const pub = await crypto.subtle.importKey('jwk', signature.publicKey, algorithm, false, ['verify']);
    const bytes = Uint8Array.from(atob(signature.signature), char => char.charCodeAt(0));
    return crypto.subtle.verify(signatureAlgorithm, pub, bytes, signedPayload(meeting, signature));
  } catch { return false; }
}

async function getKeyPair(profileId: string) {
  const entry = await keys.keys.get(profileId);
  if (entry) return entry.pair;
  const pair = await crypto.subtle.generateKey(algorithm, false, ['sign', 'verify']) as CryptoKeyPair;
  return keys.transaction('rw', keys.keys, async () => {
    const current = await keys.keys.get(profileId);
    if (current) return current.pair;
    await keys.keys.add({ profileId, pair });
    return pair;
  });
}

export async function signMinutes(actorId: string, alertId: string) {
  if (!globalThis.crypto?.subtle) throw new Error('Abre la app con HTTPS o en localhost para firmar.');
  const meeting = await requiredMeeting(alertId);
  const actor = await authorize(actorId, ['vecino','vocal','tesorero','presidente'], meeting.sectorId);
  if (!meeting.minutes || !meeting.attendees.includes(actorId)) throw new Error('Solo los asistentes pueden firmar el acta publicada.');
  if (meeting.signatures.some(signer => signer.profileId === actorId)) return;
  const pair = await getKeyPair(actorId);
  const signer = { profileId: actor.id, name: actor.name, signedAt: new Date().toISOString() };
  const signature = await crypto.subtle.sign(signatureAlgorithm, pair.privateKey, signedPayload(meeting, signer));
  const evidence = {
    ...signer, publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey),
    signature: btoa(String.fromCharCode(...new Uint8Array(signature))),
  };
  if(sharedMode)return boardCommand({type:'sign',alertId,signature:evidence});
  await db.transaction('rw', db.settings, db.profiles, async () => {
    const current = await requiredMeeting(alertId);
    await authorize(actorId, ['vecino','vocal','tesorero','presidente'], current.sectorId);
    if (String(signedPayload(current, signer)) !== String(signedPayload(meeting, signer))) throw new Error('El acta cambió. Vuelve a revisarla.');
    if (current.signatures.some(item => item.profileId === actorId)) return;
    current.signatures.push(evidence);
    await writeRecord(meetingKey(alertId), current);
    await logDecision(actor, 'Acta firmada · ' + alertId);
  });
}
