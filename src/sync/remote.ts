import { db } from '../db/db';
import type { EntityName, Profile, QueueItem, ServerRecord, Setting, SyncResult } from '../db/types';
import { requestSync } from './bus';
import { setSharedIdentity, sharedIdentity } from './mode';

const base='/api/v1';
const cachedIdentity=sharedIdentityIfAvailable();
function sharedIdentityIfAvailable() { return typeof localStorage === 'undefined' ? '' : sharedIdentity(); }

export async function api<T>(path: string, method='GET', body?: unknown, retry=true): Promise<T> {
  const headers: Record<string,string> = {};
  if (method==='POST') headers['Content-Type']='application/json';
  if (cachedIdentity) headers['X-Vecino-Profile']=cachedIdentity;
  const res=await fetch(base+path,{method,headers,body:body===undefined ? undefined : JSON.stringify(body),
    credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000)});
  const data=await res.json().catch(()=>({error:'No se pudo contactar al servidor vecinal.'}));
  if (!res.ok) {
    if (res.status===401 && cachedIdentity && !path.startsWith('/auth/')) {
      if(retry && (await fetch(base+'/auth/refresh',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'})).ok) return api<T>(path,method,body,false);
      if (sharedIdentity()===cachedIdentity) setSharedIdentity('');
      window.location.replace('/login');
    }
    throw Object.assign(new Error(data.error || 'No se pudo completar la operación.'),{status:res.status});
  }
  return data;
}

export async function remotePost<T=unknown>(path:string,body:unknown):Promise<T> {
  const data=await api<T>(path,'POST',body);
  requestSync(); return data;
}
export async function updateMembership(id:string, change:{verified?:boolean;protectionSince?:string;walletReinstatedAt?:string}) {
  const {profile}=await remotePost<{profile:Profile}>('/membership',{id,...change});
  await db.profiles.put(profile);
  return profile;
}
export async function setRemoteCrisis(active:boolean,title='') { await remotePost('/crisis',{active,title}); }

export async function sharedLogout() {
  // Keep the session usable if an offline device cannot revoke its server cookie.
  try { await api('/auth/logout','POST',{}); }
  catch(e) { if ((e as {status?:number}).status!==401) throw e; }
  setSharedIdentity('');
  window.location.replace('/login');
}

export async function enterShared(path:string,fields:Record<string,unknown>) {
  const {profile}=await api<{profile:Profile}>(path,'POST',fields);
  setSharedIdentity(profile.id);
  // A fresh page selects the authenticated neighbor's database before opening Dexie.
  window.location.replace('/');
}

export function listenRemote(signal:()=>void) {
  const query='?profile='+encodeURIComponent(cachedIdentity);
  let closed=false,source:EventSource|undefined;
  const fallback=()=>{if(!closed && !source){source=new EventSource(base+'/events'+query);source.onmessage=signal;}};
  let socket:WebSocket|undefined;
  try{
    const url=new URL(base+'/live'+query,location.href);
    url.protocol=location.protocol==='https:'?'wss:':'ws:';
    socket=new WebSocket(url);
    socket.onmessage=signal;
    socket.onclose=fallback;
  }catch{fallback();}

  const identityChanged=()=>{ if (sharedIdentity()!==cachedIdentity) window.location.reload(); };
  window.addEventListener('storage',identityChanged);
  return ()=>{closed=true;socket?.close();source?.close();window.removeEventListener('storage',identityChanged);};
}

const syncedTables:EntityName[]=['listings','requests','providers','endorsements','alerts','brigadeProfiles','reports'];
export async function pullRemote() {
  const result=await api<{profile:Profile;ledger:import('../economy/points').LedgerEntry[];profiles:Profile[];records:ServerRecord[];crisis:{active:boolean;title:string;since:string};governance:Setting[]}>('/sync');
  if (result.profile.id!==cachedIdentity) throw new Error('La cuenta del servidor cambió.');
  for (const r of result.records) await decodeAudio(r);
  await db.transaction('rw',db.tables,async()=>{
    const pending=await db.syncQueue.toArray();
    const dirty=new Set(pending.filter(q=>q.status!=='conflict').map(q=>q.entity+':'+q.entityId));
    const visible=new Map(result.records.map(r=>[r.key,r]));
    for (const entity of syncedTables) {
      const table=db.table(entity);
      const local=await table.toArray() as {id:string;version:number;syncStatus:string}[];
      for (const row of local) {
        const key=entity+':'+row.id;
        if (!visible.has(key) && !dirty.has(key)) await table.delete(row.id);
      }
    }
    for(const r of result.records) if(syncedTables.includes(r.entity as EntityName) && !dirty.has(r.key)) {
      if(r.entity==='alerts'){
        const alert=r.data as import('../db/types').Alert;
        const id='shared-alert-'+alert.id;
        if(alert.authorId!==cachedIdentity && alert.status==='pending' && !(await db.alerts.get(alert.id)) && !(await db.notifications.get(id))){
          await db.notifications.put({id,profileId:cachedIdentity,type:'alert_created',title:alert.title,body:'Nueva alerta de tu sector',createdAt:alert.createdAt,read:0,link:'/alertas/'+alert.id});
        }
      }
      await db.table(r.entity).put(r.data);
    }
    const ids=new Set(result.profiles.map(p=>p.id));
    for(const id of await db.profiles.toCollection().primaryKeys()) if(!ids.has(id)) await db.profiles.delete(id);
    await db.profiles.bulkPut(result.profiles);
    const governance=result.governance??[];
    const newKeys=new Set(governance.map(s=>s.key));
    const tracked=await db.settings.get('remoteGovernanceKeys');
    for(const key of JSON.parse(tracked?.value??'[]') as string[]) if(!newKeys.has(key)) await db.settings.delete(key);
    
    await db.settings.bulkPut([...governance,{key:'ledger/'+result.profile.id,value:JSON.stringify(result.ledger ?? [])},{key:'remoteGovernanceKeys',value:JSON.stringify([...newKeys])},
      {key:'currentProfileId',value:result.profile.id},{key:'onboarded',value:'1'},
      {key:'emergencyMode',value:result.crisis.active?'1':'0'},
      {key:'crisisTitle',value:result.crisis.title}]);
  });
}

async function decodeAudio(record?:ServerRecord) {
  const d=record?.data as {audio?: Blob|string} | undefined;
  if(typeof d?.audio==='string' && d.audio.startsWith('data:audio/')) {
    const comma=d.audio.indexOf(',');
    const bytes=Uint8Array.from(atob(d.audio.slice(comma+1)),ch=>ch.charCodeAt(0));
    d.audio=new Blob([bytes],{type:d.audio.slice(5,d.audio.indexOf(';'))});
  }
}
export async function pushRemote(item:QueueItem):Promise<SyncResult> {
  const payload={...(item.payload as Record<string,unknown>)};
  if (payload.audio instanceof Blob) {
    const audio=payload.audio;
    payload.audio=await new Promise<string>((resolve,reject)=>{
      const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);
      reader.readAsDataURL(audio);
    });
  }
  const result=await api<SyncResult>('/sync','POST',{operation:item.operation,entity:item.entity,entityId:item.entityId,
    payload,baseVersion:item.baseVersion,idempotencyKey:item.idempotencyKey});
  if(result.ok) await decodeAudio(result.record);
  else if(result.conflict) await decodeAudio(result.serverRecord);
  return result;
}
