import { randomUUID, webcrypto } from 'node:crypto';
import { check, districts, isCoordinator, now } from './auth.mjs';

export function geographic(place) {
  if(place.sectorId)return {id:place.sectorId,adjacent:place.adjacentSectors.map(s=>s.id)};
  const [lat, lng] = districts[place.district] ?? [0,0];
  const row = Math.floor((place.lat - lat) / 0.006 + 0.5);
  const column = Math.floor((place.lng - lng) / 0.006 + 0.5);
  const prefix = encodeURIComponent(place.district) + '/';
  return { id: prefix + row + '/' + column, row, column, prefix };
}

async function get(sql, district, key) {
  const [record] = await sql('SELECT body FROM board_records WHERE district=? AND record_key=?', [district, key]);
  return record ? JSON.parse(record.body) : undefined;
}
function put(sql, district, key, record) {
  return sql('INSERT INTO board_records(district,record_key,body) VALUES (?,?,?) ON CONFLICT(district,record_key) DO UPDATE SET body=excluded.body', [district,key,JSON.stringify(record)]);
}
export async function boardRole(sql, profile) {
  if (!profile.verified) return 'vecino';
  if (isCoordinator(profile)) return 'presidente';
  return (await get(sql, profile.district, 'role/' + geographic(profile).id + '/' + profile.id)) ?? 'vecino';
}

export async function readGovernance(sql, profile) {
  if (!profile.verified) return [];
  const records = await sql('SELECT record_key,body FROM board_records WHERE district=?', [profile.district]);
  const sector = geographic(profile).id;
  return records.filter(({record_key: key, body}) => {
    if (key.startsWith('federation/')) {
      const link = JSON.parse(body);
      return link.from === sector || link.to === sector;
    }
    if (key === 'disaster/'+sector) return true;
    if (key.startsWith('meeting/')) return JSON.parse(body).sectorId === sector;
    return key.slice(key.indexOf('/') + 1).startsWith(sector + '/');
  }).map(row => ({ key: 'junta/' + row.record_key, value: row.body }));
}

export async function closeFederations(sql, profile) {
  const sector = geographic(profile).id;
  const records = await sql("SELECT record_key,body FROM board_records WHERE district=? AND record_key LIKE 'federation/%'", [profile.district]);
  for (const row of records) {
    const link = JSON.parse(row.body);
    if (link.from === sector && Date.parse(link.until) > Date.now()) await put(sql, profile.district, row.record_key, {...link, until: now()});
  }
}

function bounded(value, min, max) {
  check(typeof value === 'string' && value.trim().length >= min && value.length <= max, 'Texto incompleto o demasiado extenso.');
  return value.trim();
}
function units(value) { check(Number.isSafeInteger(value) && value > 0 && value <= 1000000, 'Cantidad inválida.'); }
function uuid(value) {
  check(typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value), 'Identificador inválido.');
  return value;
}

export async function applyGovernance(sql, profile, body) {
  check(profile.verified && body && typeof body === 'object', 'Se requiere un perfil verificado.', 403);
  const operation = uuid(body.commandId);
  const seen = await sql('SELECT command_id FROM board_receipts WHERE actor_id=? AND command_id=?',[profile.id, operation]);
  if (seen.length) return { settings: await readGovernance(sql, profile) };
  const district = profile.district;
  const sector = geographic(profile);
  const role = await boardRole(sql, profile);
  const requireRole = (...permitted) => check(permitted.includes(role), 'Tu cargo no permite esta operación.', 403);
  const audit = action => put(sql, district, 'log/' + sector.id + '/' + now() + '/' + operation, { actor: profile.name, at: now(), action });
  if (body.type === 'appoint') {
    requireRole('presidente');
    check(['tesorero','vocal','vecino'].includes(body.role), 'Cargo no válido.');
    const [member] = await sql('SELECT profile FROM members WHERE id=? AND district=?', [uuid(body.memberId), district]);
    const target = member && JSON.parse(member.profile);
    check(target?.verified && geographic(target).id === sector.id && !isCoordinator(target), 'Elige un vecino verificado del sector.');
    await put(sql, district, 'role/' + sector.id + '/' + target.id, body.role);
    await audit(target.name + ' · cargo asignado: ' + body.role);
  } else if (body.type === 'federate') {
    requireRole('presidente');
    const neighbors = sector.adjacent ?? [[1,0], [-1,0], [0,1], [0,-1]].map(([y,x]) => sector.prefix + (sector.row+y) + '/' + (sector.column+x));
    check(neighbors.includes(body.to), 'El sector debe ser colindante.');
    check([0,2,6,12,24].includes(body.hours), 'Duración no admitida.');
    const key = 'federation/' + sector.id + ':' + body.to;
    if (body.hours) {
      const state = await get(sql,district,'disaster/'+sector.id);
      check(state?.active, 'Activa el modo desastre en el sector.');
    }
    const reason = body.hours ? bounded(body.reason,5,200) : 'Canal cerrado';
    await put(sql, district, key, { from: sector.id, to: body.to, until: new Date(Date.now() + body.hours * 3600000).toISOString(), reason });
    await audit(body.hours ? 'Canal abierto · ' + reason : 'Canal cerrado');
  } else if (body.type === 'campaign') {
    requireRole('presidente','tesorero');
    const title = bounded(body.title,4,120);
    const unit = bounded(body.unit,1,32);
    units(body.target);
    const id = randomUUID();
    await put(sql,district,'campaign/' + sector.id + '/' + id, {id,sectorId:sector.id,title,unit,target:body.target,entries:[]});
    await audit('Campaña abierta · ' + title);
  } else if (body.type === 'contribute' || body.type === 'closeCampaign') {
    const key = 'campaign/' + sector.id + '/' + uuid(body.campaignId);
    const campaign = await get(sql,district,key);
    check(campaign && !campaign.closedAt, 'La campaña no está abierta.');
    if (body.type === 'contribute') {
      units(body.units);
      campaign.entries.push({ id: operation, actor: profile.name, units: body.units, at: now() });
      await audit(`Aporte declarado · ${body.units} ${campaign.unit} · ${campaign.title}`);
    } else {
      requireRole('presidente','tesorero');
      campaign.closedBy = profile.name; campaign.closedAt = now();
      await audit('Recuento validado y cerrado · ' + campaign.title);
    }
    await put(sql,district,key,campaign);
  } else if (['meeting','attend','minutes','sign'].includes(body.type)) {
    const alertId = uuid(body.alertId);
    const key = 'meeting/' + alertId;
    const meeting = await get(sql,district,key);
    if (body.type === 'meeting') {
      requireRole('presidente','vocal');
      const [row] = await sql("SELECT body FROM records WHERE district=? AND entity='alerts' AND id=?", [district,alertId]);
      const alert = row && JSON.parse(row.body);
      check(!meeting && alert && geographic(alert).id === sector.id && ['pending','assigned','in_progress'].includes(alert.status), 'La alerta debe estar activa en tu sector, sin convocatoria.');
      const when = new Date(body.scheduled);
      check(when.valueOf() > Date.now() && ['presencial','virtual'].includes(body.kind), 'Revisa la hora y modalidad.');
      const venue = bounded(body.venue,5,400);
      if (body.kind === 'virtual') {
        check(URL.canParse(venue) && new URL(venue).protocol === 'https:' && !new URL(venue).username && !new URL(venue).password, 'Ingresa el enlace HTTPS de la sala.');
      }
      await put(sql,district,key,{ alertId,sectorId:sector.id,scheduled:when.toISOString(),kind:body.kind,venue,organizer:profile.name,minutes:'',attendees:[],signatures:[] });
      await audit('Asamblea convocada · ' + alert.title);
    } else {
      check(meeting && meeting.sectorId === sector.id,'La convocatoria no corresponde a tu sector.',403);
      if (body.type === 'attend') {
        check(!meeting.minutes,'Se cerró el registro de asistentes.');
        if (!meeting.attendees.includes(profile.id)) meeting.attendees.push(profile.id);
      } else if (body.type === 'minutes') {
        requireRole('presidente','vocal');
        check(!meeting.minutes && meeting.attendees.length && Date.parse(meeting.scheduled)<=Date.now(),'La asamblea debe haber empezado, con asistentes registrados y acta pendiente.');
        meeting.minutes = bounded(body.minutes,10,6000);
        await audit('Acta publicada · ' + alertId);
      } else {
        check(meeting.minutes && meeting.attendees.includes(profile.id),'Debes constar en el acta.',403);
        const sig = body.signature;
        check(sig && sig.profileId === profile.id && sig.name === profile.name && typeof sig.signedAt==='string' && Number.isFinite(Date.parse(sig.signedAt)) && sig.publicKey && !sig.publicKey.d && typeof sig.signature === 'string' && sig.signature.length<=128,'Firma inválida.');
        const payload = JSON.stringify(['vecino360-acta-v1',meeting.alertId,meeting.sectorId,meeting.scheduled,meeting.kind,meeting.venue,meeting.organizer,meeting.minutes,[...meeting.attendees].sort(),profile.id,sig.name,sig.signedAt]);
        let valid = false;
        try {
          const pub = await webcrypto.subtle.importKey('jwk',sig.publicKey,{ name:'ECDSA',namedCurve:'P-256' },false,['verify']);
          valid = await webcrypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pub,Buffer.from(sig.signature,'base64'),Buffer.from(payload));
        } catch { /* Clave o firma inválida. */ }
        check(valid,'La firma no corresponde al acta publicada.');
        if (!meeting.signatures.some(item=>item.profileId===profile.id)) {
          meeting.signatures.push({profileId:profile.id,name:profile.name,signedAt:sig.signedAt,publicKey:sig.publicKey,signature:sig.signature});
          await audit('Acta firmada · ' + alertId);
        }
      }
      await put(sql,district,key,meeting);
    }
  } else check(false,'Operación de junta no reconocida.');
  await sql('INSERT INTO board_receipts(actor_id,command_id) VALUES (?,?)',[profile.id,operation]);
  return { settings: await readGovernance(sql,profile) };
}
