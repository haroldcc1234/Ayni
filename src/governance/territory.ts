import { sharedMode } from '../sync/mode';
import { remotePost, updateMembership } from '../sync/remote';
import { db } from '../db/db';
import type { AppNotification, Profile } from '../db/types';
import { DISTRICTS, type LatLng } from '../lib/geo';

export type BoardRole = 'presidente' | 'vocal' | 'tesorero' | 'vecino';
type Adjacent = {id:string; name:string};
type Place = LatLng & { district:string; sectorId?:string; sectorName?:string; adjacentSectors?:Adjacent[] };
export interface Sector { id: string; district: string; row: number; column: number; name: string; adjacent?:Adjacent[] }
export interface Disaster { active: boolean; title: string; since: string }
export interface Federation { from: string; to: string; until: string; reason: string }
export interface Audit { actor: string; action: string; at: string }

// Operational quadrants for the local dataset. Row 0, column 0 surrounds each district's reference point.
const degreeSpan = 0.006;
export function sectorOf(point: Place): Sector {
  if(point.sectorId)return {id:point.sectorId,name:point.sectorName || point.sectorId,district:point.district,row:0,column:0,adjacent:point.adjacentSectors ?? []};
  const origin = DISTRICTS.find(item => item.name === point.district) ?? { lat: 0, lng: 0 };
  const row = Math.floor((point.lat - origin.lat) / degreeSpan + 0.5);
  const column = Math.floor((point.lng - origin.lng) / degreeSpan + 0.5);
  return sectorAt(point.district, row, column);
}

function sectorAt(district: string, row: number, column: number): Sector {
  const name = row === 0 && column === 0 ? 'Sector central' : `Sector ${row >= 0 ? 'N' : 'S'}${Math.abs(row)} · ${column >= 0 ? 'E' : 'O'}${Math.abs(column)}`;
  return { id: `${encodeURIComponent(district)}/${row}/${column}`, district, row, column, name };
}

export function neighbors(sector: Sector) {
  if(sector.adjacent)return sector.adjacent.map(a=>({...a,district:sector.district,row:0,column:0,adjacent:[]}));
  return [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dy, dx]) => sectorAt(sector.district, sector.row + dy, sector.column + dx));
}

export async function readRecord<T>(key: string): Promise<T | undefined> {
  const record = await db.settings.get('junta/' + key);
  return record ? JSON.parse(record.value) as T : undefined;
}

export function writeRecord<T>(key: string, record: T) {
  return db.settings.put({ key: 'junta/' + key, value: JSON.stringify(record) });
}

export async function records<T>(prefix: string): Promise<T[]> {
  const rows = await db.settings.where('key').startsWith('junta/' + prefix + '/').toArray();
  return rows.map(row => JSON.parse(row.value) as T);
}

export async function getBoardRole(profile: Profile): Promise<BoardRole> {
  if (!profile.verified) return 'vecino';
  const sector = sectorOf(profile);
  const assigned = await readRecord<BoardRole>(`role/${sector.id}/${profile.id}`);
  if (assigned) return assigned;
  return profile.roles.includes('coordinador') ? 'presidente' : 'vecino';
}

export async function authorize(id: string, roles: BoardRole[], requiredSector?: string) {
  const actor = await db.profiles.get(id);
  if (!actor?.verified || (requiredSector && sectorOf(actor).id !== requiredSector) || !roles.includes(await getBoardRole(actor))) {
    throw new Error('Tu perfil requiere verificación y el cargo correspondiente en este sector.');
  }
  return actor;
}

export async function logDecision(actor: Profile, action: string) {
  const at = new Date().toISOString();
  await writeRecord(`log/${sectorOf(actor).id}/${at}/${crypto.randomUUID()}`, { at, action, actor: actor.name } satisfies Audit);
}

export async function sectorMembers(actor: Place) {
  const sectorId = sectorOf(actor).id;
  const districtMembers = await db.profiles.where('district').equals(actor.district).toArray();
  return districtMembers.filter(member => sectorOf(member).id === sectorId);
}

export async function sendSectorNotice(actor: Profile, title: string, body: string, link: string) {
  const createdAt = new Date().toISOString();
  await db.notifications.bulkAdd((await sectorMembers(actor)).map(member => ({
    id: crypto.randomUUID(), profileId: member.id, read: 0, type: 'broadcast', title, body, link, createdAt,
  } satisfies AppNotification)));
}

export function getSectorDisaster(point: Place) {
  return readRecord<Disaster>('disaster/' + sectorOf(point).id);
}

export async function isSectorInDisaster(point: Place) {
  return (await getSectorDisaster(point))?.active === true;
}

export async function setSectorDisaster(actorId: string, active: boolean, title?: string) {
  if(sharedMode) await remotePost('/crisis',{active,title:title || 'Emergencia vecinal'});
  await db.transaction('rw', db.settings, db.profiles, db.notifications, async () => {
    const actor = await authorize(actorId, ['presidente']);
    const sector = sectorOf(actor);
    const current = await getSectorDisaster(actor);
    if (Boolean(current?.active) === active) return;
    const description = title?.trim().slice(0, 130) || 'Emergencia en ' + sector.name;
    await writeRecord('disaster/' + sector.id, {
      active, title: description, since: new Date().toISOString(),
    } satisfies Disaster);
    if (!active) {
      const outgoing = (await records<Federation>('federation')).filter(link => link.from === sector.id);
      for (const link of outgoing) await db.settings.delete('junta/federation/' + link.from + ':' + link.to);
    }
    const message = active ? 'Modo desastre activado' : 'Modo desastre finalizado';
    await logDecision(actor, active ? message + ' · ' + description : message);
    await sendSectorNotice(actor, message, active ? description : sector.name, '/emergencia');
  });
}

export async function boardCommand(body:Record<string,unknown>){
  const {settings}=await remotePost<{settings:{key:string;value:string}[]}>('/governance',{commandId:crypto.randomUUID(),...body});
  await db.settings.bulkPut(settings);
}
export async function setFederation(actorId: string, neighborId: string, hours: number, reason: string) {
  if(sharedMode)return boardCommand({type:'federate',to:neighborId,hours,reason});
  return db.transaction('rw', db.profiles, db.settings, async () => {
    const actor = await authorize(actorId, ['presidente']);
    if(point.sectorId)return {id:point.sectorId,name:point.sectorName || point.sectorId,district:point.district,row:0,column:0,adjacent:point.adjacentSectors ?? []};
  const origin = sectorOf(actor);
    const target = neighbors(origin).find(item => item.id === neighborId);
    if (!target) throw new Error('Elige un sector colindante del mismo distrito.');
    const key = 'federation/' + origin.id + ':' + target.id;
    if (hours === 0) {
      await db.settings.delete('junta/' + key);
      await logDecision(actor, 'Canal cerrado con ' + target.name);
      return;
    }
    if (!(await isSectorInDisaster(actor))) throw new Error('Activa el modo desastre para conectar sectores.');
    if (![2, 6, 12, 24].includes(hours) || reason.trim().length < 5) throw new Error('Indica el motivo y la duración del enlace.');
    const until = new Date(Date.now() + hours * 3600000).toISOString();
    await writeRecord(key, { from: origin.id, to: target.id, until, reason: reason.trim().slice(0, 200) } satisfies Federation);
    await logDecision(actor, `Canal con ${target.name} durante ${hours} h · ${reason.trim()}`);
  });
}

export async function visibleSectorIds(point: Place, now = Date.now()): Promise<string[]> {
  const own = sectorOf(point).id;
  const allowed = new Set([own]);
  for (const link of await records<Federation>('federation')) {
    if (Date.parse(link.until) <= now) continue;
    if (link.from === own) allowed.add(link.to);
    if (link.to === own) allowed.add(link.from);
  }
  return [...allowed];
}

export async function appoint(actorId: string, memberId: string, role: 'vocal' | 'tesorero' | 'vecino') {
  if(sharedMode)return boardCommand({type:'appoint',memberId,role});
  await db.transaction('rw', db.profiles, db.settings, async () => {
    const actor = await authorize(actorId, ['presidente']);
    const member = await db.profiles.get(memberId);
    if (!member?.verified || sectorOf(member).id !== sectorOf(actor).id || await getBoardRole(member) === 'presidente')
      throw new Error('Elige un vecino verificado de tu sector.');
    await writeRecord(`role/${sectorOf(actor).id}/${memberId}`, role);
    await logDecision(actor, `${member.name} · cargo asignado: ${role}`);
  });
}

export async function verifyNeighbor(actorId: string, memberId: string) {
  if(sharedMode){await updateMembership(memberId,{verified:true});return;}
  await db.transaction('rw', db.profiles, db.settings, db.notifications, async () => {
    const member = await db.profiles.get(memberId);
    if (!member || actorId === member.id) throw new Error('Selecciona otro vecino.');
    const actor = await authorize(actorId, ['presidente', 'vocal'], sectorOf(member).id);
    if (member.verified) return;
    await db.profiles.update(member.id, { verified: 1, updatedAt: new Date().toISOString() });
    await logDecision(actor, 'Identidad verificada en persona · ' + member.name);
    await db.notifications.add({ id: crypto.randomUUID(), profileId: member.id, type: 'system', read: 0,
      title: 'Identidad verificada', body: actor.name + ' verificó tu incorporación a la junta.', link: '/junta', createdAt: new Date().toISOString() });
  });
}
