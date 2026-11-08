import {sectorFields} from './sectors.mjs';
import { confirmedWallet } from './ledger.mjs';
import { geographic, readGovernance, boardRole } from './governance.mjs';
import { check, isCoordinator, now } from './auth.mjs';
import { projectWallet, reservePoints, validProof } from '../src/economy/points.ts';

const entities = new Set(['listings','requests','providers','endorsements','alerts','brigadeProfiles','reports']);
const uuid = /^[a-zA-Z0-9_-]{1,90}$/;
const fields = {
  listings: ['type','category','title','description','authorId','district','lat','lng','status','expiresAt','meta','hidden','audio','audioMime','audioDuration'],
  requests: ['listingId','requesterId','ownerId','status','message','meta'],
  providers: ['profileId','trade','description','district','lat','lng','coverageRadiusM','schedule','status','score','endorsementCount','verified'],
  endorsements: ['providerId','endorserId','weight','comment'],
  alerts: ['severity','category','title','description','authorId','district','lat','lng','status','brigadeProfileId','assignedAt','resolvedAt','audio','audioMime','audioDuration'],
  brigadeProfiles: ['profileId','skills','resources','certifications','availability','district','lat','lng'],
  reports: ['targetType','targetId','reporterId','reason','status'],
};
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const guard = (allowed, message='Tu cuenta no puede realizar esta operación.') => check(allowed,message,403);
const score = value => Number.isInteger(value) && value>=1 && value<=5;
const entries = (records, type) => [...records.values()].filter(r=>r.entity===type).map(r=>r.data);
const isEconomic = l => ['donation','time_bank','favor'].includes(l?.type);
const beneficiary = (r,l) => l.type === 'favor' ? r.ownerId : r.requesterId;
const helper = (r,l) => l.type === 'favor' ? r.requesterId : r.ownerId;
const active = r => ['pending','accepted','in_progress'].includes(r.status);
function unchanged(old, next, allowed) {
  for (const key of new Set([...Object.keys(old),...Object.keys(next)])) {
    if (!allowed.includes(key) && !['id','createdAt','updatedAt','syncStatus','version'].includes(key)) {
      guard(same(next[key],old[key]));
    }
  }
}

export async function loadRecords(sql,district) {
  const rows = await sql('SELECT entity,id,version,body FROM records WHERE district=?',[district]);
  return new Map(rows.map(row => {
    const key = row.entity + ':' + row.id;
    const data = JSON.parse(row.body);
    return [key,{key,id:row.id,entity:row.entity,version:row.version,updatedAt:data.updatedAt,data}];
  }));
}

export async function snapshot(sql, profile) {
  const role=await boardRole(sql,profile);
  const chair = role==='presidente' || role==='vocal';
  const qualified = !!profile.verified;
  const profiles = qualified ? (await sql('SELECT profile FROM members WHERE district=?',[profile.district])).map(r=>JSON.parse(r.profile)) : [profile];
  const records = qualified ? await loadRecords(sql,profile.district) : new Map();
  const mine = records => records.filter(r=>r.ownerId===profile.id || r.requesterId===profile.id);
  const participants = new Set(mine(entries(records,'requests')).filter(r=>['accepted','in_progress'].includes(r.status)).flatMap(r=>[r.ownerId,r.requesterId]));
  const publicProfiles = profiles.filter(p=>p.id===profile.id || p.verified || chair).map(p=>{
    if (p.id===profile.id) return p;
    const copy = {...p,lat:Math.round(p.lat*1000)/1000,lng:Math.round(p.lng*1000)/1000,phone:participants.has(p.id) ? p.phone : ''};
    if (!chair) delete copy.protectionSince;
    return copy;
  });
  const visible = [...records.values()].filter(({entity,data})=>{
    if (entity==='reports') return chair || data.reporterId===profile.id;
    if (entity==='requests') return chair || mine([data]).length || records.get('listings:'+data.listingId)?.data.type==='recommendation';
    return true;
  }).map(record=>{
    const data={...record.data};
    if(Number.isFinite(data.lat)){data.lat=Math.round(data.lat*1000)/1000;data.lng=Math.round(data.lng*1000)/1000;}
    return {...record,data};
  });
  const [state]=await sql('SELECT body FROM board_records WHERE district=? AND record_key=?',[profile.district,'disaster/'+geographic(profile).id]);
  const own=geographic(profile).id, sectors=new Set([own]);
  for(const row of await readGovernance(sql,profile)) if(row.key.startsWith('junta/federation/')){
    const link=JSON.parse(row.value);if(Date.parse(link.until)>Date.now()){sectors.add(link.from);sectors.add(link.to);}
  }
  const scoped=visible.filter(({entity,data})=>{
    if(entity==='requests'){
      const listing=records.get('listings:'+data.listingId)?.data;
      return mine([data]).length>0 || (listing && sectors.has(geographic(listing).id));
    }
    if(entity==='endorsements'){const target=records.get('providers:'+data.providerId)?.data;return target && sectors.has(geographic(target).id);}
    return !Number.isFinite(data.lat) || sectors.has(geographic(data).id);
  });
  const wallet=await confirmedWallet(sql,profile,records);
  return {profile,ledger:wallet.entries,profiles:publicProfiles.filter(m=>m.id===profile.id || sectors.has(geographic(m).id)),records:scoped,crisis:state?JSON.parse(state.body):{active:false,title:'',since:''}};
}

function walletOf(profile,records) {
  return projectWallet(profile.id, entries(records,'listings'), entries(records,'requests'), profile.protectionSince, profile.walletReinstatedAt);
}

async function validateWallet(sql,w,profile,records,crisis) {
  check(w && [15,30,50].includes(w.cost), 'Selecciona la complejidad del favor.');
  const wallet = await confirmedWallet(sql,profile,records);
  let expected;
  try { expected = reservePoints(w.cost, wallet.available, !!profile.protectionSince, crisis); }
  catch(e) { check(false, e.message,422); }
  check(w.held===expected.held && w.subsidy===expected.subsidy && w.crisis===crisis, 'La reserva cambió. Revisa tu saldo y el modo de crisis.',422);
}
function validateShape(entity,d) {
  check(Object.getPrototypeOf(d)===Object.prototype && typeof d.id==='string', 'Formato de registro inválido.');
  for (const key of fields[entity]) {
    const v=d[key]; if (v===undefined) continue;
    if (key==='audio') {
      check(typeof v==='string' && /^data:audio\/[\w.+-]+(?:;[\w=.+-]+)*;base64,[\w+/=]+$/.test(v) && v.length<4_000_000,'Audio no válido.');
    } else if (typeof v==='string') check(v.length<=6000,'Texto demasiado largo.');
  }
  if (['listings','requests'].includes(entity)) check(d.meta && typeof d.meta==='object' && !Array.isArray(d.meta),'Faltan los detalles.');
  if (['listings','alerts','providers','brigadeProfiles'].includes(entity)) {
    check(Number.isFinite(d.lat) && Math.abs(d.lat)<=90 && Number.isFinite(d.lng) && Math.abs(d.lng)<=180, 'Coordenadas no válidas.');
  }
  if (['listings','alerts'].includes(entity)) check(typeof d.title==='string' && d.title.trim() && typeof d.description==='string' && typeof d.category==='string','Faltan el título, la categoría o la descripción.');
  if (entity==='listings') check(['promotion','recommendation','service','loan','donation','favor','time_bank','mobility'].includes(d.type) && typeof d.expiresAt==='string','Publicación inválida.');
  if (entity==='alerts') check(['critical','high','medium'].includes(d.severity),'Severidad inválida.');
  if (entity==='providers') check(typeof d.trade==='string' && typeof d.description==='string' && typeof d.schedule==='string','Ficha de oficio incompleta.');
  if (entity==='brigadeProfiles') check(Array.isArray(d.resources) && Array.isArray(d.skills) && [...d.resources,...d.skills].every(v=>typeof v==='string') && ['available','busy','offline'].includes(d.availability),'Ficha de brigadista incompleta.');
}

export async function applyOperation(sql,p,op,postgis) {
  guard(p.verified, 'La junta debe verificar tu inscripción antes de publicar.');
  check(op && entities.has(op.entity) && uuid.test(op.entityId) && uuid.test(op.idempotencyKey) && typeof op.entityId==='string' && typeof op.idempotencyKey==='string' && Number.isSafeInteger(op.baseVersion) && op.baseVersion>=0,'Operación inválida.');
  const [receipt] = await sql('SELECT result FROM sync_receipts WHERE member_id=? AND operation_id=?',[p.id,op.idempotencyKey]);
  if (receipt) return JSON.parse(receipt.result);
  check(['create','update'].includes(op.operation) && op.payload?.id===op.entityId,'Operación no admitida.');
  const records = await loadRecords(sql,p.district);
  const entity = op.entity, key = entity+':'+op.entityId, prior = records.get(key), old = prior?.data;
  const d = Object.fromEntries(Object.entries(op.payload).filter(([k])=>fields[entity].includes(k) || k==='id'));
  validateShape(entity,d);
  const create = op.operation==='create';
  if (d.district !== undefined) guard(d.district===p.district);
  if (postgis && d.lat!==undefined) {
    Object.assign(d,await sectorFields(sql,d));
    const [location] = await sql('SELECT boundary IS NULL OR ST_Covers(boundary,ST_SetSRID(ST_MakePoint(?,?),4326)) AS allowed FROM territories WHERE district=?',[d.lng,d.lat,p.district]);
    check(location?.allowed,'La ubicación está fuera del territorio.',422);
  }
  const get = (e,id) => records.get(e+':'+id)?.data;
  const sectors=new Set([geographic(p).id]);
  for(const setting of await readGovernance(sql,p)){
    if(setting.key.startsWith('junta/federation/')){
      const link=JSON.parse(setting.value);
      if(Date.parse(link.until)>Date.now()){sectors.add(link.from);sectors.add(link.to);}
    }
  }
  const inScope=place=>place && sectors.has(geographic(place).id);
  if(Number.isFinite(d.lat)){
    guard(inScope(d) && (!old || inScope(old)),'La ubicación pertenece a otro sector.');
  }
  if(entity==='requests' && (create || ![old?.ownerId,old?.requesterId].includes(p.id)))guard(inScope(get('listings',d.listingId)));
  if(entity==='endorsements')guard(inScope(get('providers',d.providerId)));
  const allowedToSee = !old || (entity!=='requests' && entity!=='reports') || isCoordinator(p) || [old.ownerId,old.requesterId,old.reporterId].includes(p.id) || (entity==='requests' && get('listings',old.listingId)?.type==='recommendation');
  guard(allowedToSee);
  const save = async (type, data, version) => {
    const stamp=now();
    data = {...data,version,createdAt:data.createdAt||stamp,updatedAt:stamp,syncStatus:'synced'};
    await sql('INSERT INTO records(district,entity,id,version,body) VALUES (?,?,?,?,?) ON CONFLICT(district,entity,id) DO UPDATE SET version=excluded.version,body=excluded.body',[p.district,type,data.id,version,JSON.stringify(data)]);
    const record={entity:type,id:data.id,key:type+':'+data.id,version,updatedAt:stamp,data};
    records.set(record.key,record);return record;
  };
  const ack = async record => {
    const result = {ok:true,record};
    await sql('INSERT INTO sync_receipts(member_id,operation_id,result) VALUES (?,?,?)',[p.id,op.idempotencyKey,JSON.stringify(result)]);
    return result;
  };
  // Client outbox can contain a companion listing/provider update for an already applied change.
  if (old && !create && prior.version===op.baseVersion+1 && Object.entries(d).every(([k,v])=>same(v,old[k]))) return ack(prior);
  if (prior && (create || prior.version!==op.baseVersion)) return {ok:false,conflict:true,serverRecord:prior};
  check(create ? op.baseVersion===0 : !!old, 'El registro original ya no está disponible.',422);
  const coordinator = isCoordinator(p);
  const [territory] = await sql('SELECT body FROM board_records WHERE district=? AND record_key=?',[p.district,'disaster/'+geographic(p).id]);
  const crisis = territory ? JSON.parse(territory.body).active : false;

  if (entity==='listings') {
    if (create) {
      if (isEconomic(d)) guard(crisis || !walletOf(p,records).frozen,'Tu cuenta solidaria está bajo revisión.');
      guard(d.authorId===p.id && d.status==='open' && !d.hidden);
      if (d.type==='favor') { check(d.meta.wallet?.cost===(d.meta.pointsCost??15),'Costo inválido.'); await validateWallet(sql,d.meta.wallet,p,records,crisis); }
      else check(!d.meta.wallet,'Reserva no permitida.');
    } else if (d.status==='hidden' && coordinator) {
      unchanged(old,d,['status','hidden']);
    } else {
      guard(old.authorId===p.id && d.authorId===old.authorId && d.type===old.type && same(old.meta.wallet,d.meta.wallet));
      guard(d.status===old.status || (old.status==='open' && ['expired','hidden'].includes(d.status)), 'El cambio de estado requiere una solicitud válida.');
    }
  }
  if (entity==='requests') {
    const l = get('listings',d.listingId);
    check(l && d.ownerId===l.authorId && d.ownerId!==d.requesterId,'Publicación o destinatario inválidos.');
    const related = entries(records,'requests').filter(r=>r.listingId===l.id);
    if (create) {
      guard(d.requesterId===p.id && (l.type==='recommendation' ? d.status==='completed' && score(d.meta.rating) && typeof d.meta.recommendedName==='string' && !related.some(r=>r.requesterId===p.id) : d.status==='pending') && l.status==='open');
      if (isEconomic(l)) guard(crisis || !walletOf(p,records).frozen,'Tu cuenta solidaria está bajo revisión.');
      check(!l.expiresAt || Date.parse(l.expiresAt)>Date.now() || l.expiresAt.startsWith('9999'), 'La publicación ha vencido.',422);
      check(!d.meta.receipt && !d.meta.review,'Confirmación inesperada.');
      if (l.type==='time_bank' && d.status==='pending') { check(d.meta.wallet?.cost===(d.meta.pointsCost??15),'Costo inválido.'); await validateWallet(sql,d.meta.wallet,p,records,crisis); }
      else check(!d.meta.wallet, 'Reserva no permitida.');
      if (l.type!=='recommendation') {
        check(!related.some(r=>r.requesterId===p.id && active(r)), 'Ya existe una solicitud abierta.',422);
        check(entries(records,'requests').filter(r=>r.requesterId===p.id && active(r) && get('listings',r.listingId)?.type!=='recommendation').length<3,'Ya tienes tres solicitudes abiertas.',422);
      }
    } else {
      unchanged(old,d,['status','meta']);
      const {receipt:oldReceipt,review:oldReview,...oldMeta} = old.meta;
      const {receipt,review,...newMeta} = d.meta;
      guard(same(oldMeta,newMeta));
      if (old.status==='completed' && d.status==='completed') {
        guard(coordinator && !oldReview && review && ['valid','fraud'].includes(review.decision) && review.moderatorId===p.id && same(receipt,oldReceipt) && ![d.ownerId,d.requesterId].includes(p.id));
        d.meta.review.at=now();
      } else {
        guard([d.ownerId,d.requesterId].includes(p.id) && !review);
        if(d.status==='accepted'){
          check(!l.expiresAt || Date.parse(l.expiresAt)>Date.now(),'La oferta venció.',422);
          if(l.type==='time_bank'){
            const [member]=await sql('SELECT profile FROM members WHERE id=?',[d.requesterId]);
            const otherRecords=new Map(records);otherRecords.delete(key);
            await validateWallet(sql,d.meta.wallet,JSON.parse(member.profile),otherRecords,crisis);
          }
        }
        if (['accepted','rejected'].includes(d.status)) guard(old.status==='pending' && d.ownerId===p.id && (d.status==='rejected' || l.status==='open'));
        else if (d.status==='cancelled') guard(active(old));
        else if (d.status==='in_progress') guard(old.status==='accepted' && (!isEconomic(l) || helper(d,l)===p.id));
        else if (d.status==='completed') {
          if (isEconomic(l)) {
            guard(old.status==='in_progress' && beneficiary(d,l)===p.id);
            check(receipt && [receipt.accuracy,receipt.punctuality,receipt.quality].every(score) && typeof receipt.flagged==='boolean' && typeof receipt.comment==='string' && validProof(receipt),'Completa la evaluación de entrega.');
            receipt.at=now(); receipt.crisis=crisis || !!(l.meta.wallet?.crisis || d.meta.wallet?.crisis);
          } else guard(['accepted','in_progress'].includes(old.status));
        } else guard(false);
        if (d.status!=='completed') guard(!receipt);
        const nextStatus = {accepted:'reserved',in_progress:'in_progress',completed:'completed',cancelled:'open'}[d.status];
        if (nextStatus && (d.status!=='cancelled' || old.status!=='pending')) await save('listings',{...l,status:nextStatus},l.version+1);
      }
    }
  }
  if (entity==='alerts') {
    if (create) guard(d.authorId===p.id && d.status==='pending' && !d.brigadeProfileId);
    else {
      unchanged(old,d,['status','brigadeProfileId','assignedAt','resolvedAt']);
      const brigade = get('brigadeProfiles',d.brigadeProfileId);
      if (d.status==='assigned') guard(old.status==='pending' && brigade?.profileId===p.id && p.roles.includes('brigadista'));
      else {
        guard(d.brigadeProfileId===old.brigadeProfileId && ['pending','assigned','in_progress'].includes(old.status));
        if (d.status==='resolved') guard(coordinator || old.authorId===p.id || brigade?.profileId===p.id);
        else guard(d.status==='cancelled' && (coordinator || old.authorId===p.id));
      }
    }
  }
  if (entity==='providers' || entity==='brigadeProfiles') {
    guard(d.profileId===p.id && (!old || old.profileId===p.id));
    if (create) check(!entries(records,entity).some(r=>r.profileId===p.id),'Este perfil ya tiene una ficha.',422);
    if (entity==='brigadeProfiles') guard(p.verified);
    else {
      guard(p.verified);
      d.verified=p.verified; d.score=old?.score??0; d.endorsementCount=old?.endorsementCount??0;
    }
  }
  if (entity==='endorsements') {
    const v = get('providers',d.providerId);
    guard(create && d.endorserId===p.id && v && v.profileId!==p.id);
    check([0.25,0.5,0.75,1].includes(d.weight) && typeof d.comment==='string','Visto bueno inválido.');
    check(!entries(records,entity).some(e=>e.providerId===v.id && e.endorserId===p.id),'Ya recomendaste este oficio.',422);
    await save('providers',{...v,endorsementCount:v.endorsementCount+1,score:v.score+d.weight},v.version+1);
  }
  if (entity==='reports') {
    if (create) {
      const targetTable = {listing:'listings',provider:'providers',alert:'alerts'}[d.targetType];
      const target = targetTable ? get(targetTable,d.targetId) : d.targetType==='profile' && (await sql('SELECT id FROM members WHERE id=? AND district=?',[d.targetId,p.district])).length;
      guard(d.reporterId===p.id && d.status==='open' && target && typeof d.reason==='string' && d.reason.trim());
    } else { guard(coordinator && ['open','resolved'].includes(d.status)); unchanged(old,d,['status']); }
  }
  d.createdAt=old?.createdAt || now();
  const saved=await save(entity,d,op.baseVersion+1);
  if(entity==='requests' && d.status==='completed'){
    for(const id of [d.ownerId,d.requesterId]){
      const [member]=await sql('SELECT profile FROM members WHERE id=?',[id]);
      if(member)await confirmedWallet(sql,JSON.parse(member.profile),records);
    }
  }
  return ack(saved);
}

