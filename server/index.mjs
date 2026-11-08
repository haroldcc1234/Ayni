import {sectorFields} from './sectors.mjs';
import {enqueueAlert} from './push.mjs';
import {startJobs} from './jobs.mjs';
import {WebSocketServer,WebSocket} from 'ws';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { openStore } from './store.mjs';
import { authenticate, dniDigest, check, createSession, hash, isCoordinator, login, now, register } from './auth.mjs';
import { applyOperation, snapshot } from './sync.mjs';
import { applyGovernance, readGovernance, geographic, boardRole } from './governance.mjs';

import { secret, issue, verify, challenge, resetPassword, deliverEmail, locate } from './verification.mjs';
const prefix='/api/v1';
async function readBody(req) {
  check(req.headers['content-type']?.split(';')[0]==='application/json','Se requiere JSON.',415);
  const parts=[]; let bytes=0;
  for await (const chunk of req) {
    bytes+=chunk.length;
    check(bytes<=4_100_000,'Archivo demasiado grande.',413);
    parts.push(chunk);
  }
  let value;
  try { value=JSON.parse(Buffer.concat(parts).toString()); } catch { check(false,'JSON inválido.'); }
  check(value && typeof value==='object' && !Array.isArray(value),'Solicitud inválida.');
  return value;
}

export function apiServer(store,{coordinatorSecret,secureCookies=false,deliver=deliverEmail,geocode=locate,broadcast}={}) {
  const streams=new Set();
  const sockets=new WebSocketServer({noServer:true,maxPayload:128});
  const channels=new Map();
  const authAttempts=new Map();
  function changed(district){if(broadcast)broadcast(district);else localChange(district);}
  function localChange(district) {
    for(const [socket,zone] of channels)if(zone===district && socket.readyState===WebSocket.OPEN)socket.send('update');
    for (const stream of streams) if(stream.district===district) stream.res.write('data: update\n\n');
  }
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const route=url.pathname.slice(prefix.length);
    const token=String(req.headers.cookie||'').match(/(?:^|;\s*)vecino_sid=([a-f0-9]{64})(?:;|$)/)?.[1]||'';
    const access=String(req.headers.cookie||'').match(/(?:^|;\s*)ayni_access=([^;]+)/)?.[1];
    const cookie=(value,age)=>res.setHeader('Set-Cookie',['vecino_sid='+value+'; Path=/api/v1; HttpOnly; SameSite=Strict; Max-Age='+age+(secureCookies?'; Secure':''),...(res.getHeader('Set-Cookie')||[])]);
    const answer=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    try {
      check(url.pathname.startsWith(prefix+'/'),'Ruta no encontrada.',404);
      const post=req.method==='POST';
      check(post || req.method==='GET','Método no permitido.',405);
      if(post && req.headers.origin) check(new URL(req.headers.origin).host===req.headers.host,'Origen no autorizado.',403);
      const data=post ? await readBody(req) : {};
      const key=await secret(store);
      const accessCookie=id=>res.setHeader('Set-Cookie',['ayni_access='+issue(key,id,'access','15m')+'; Path=/api/v1; HttpOnly; SameSite=Strict; Max-Age=900'+(secureCookies?'; Secure':'')]);
      if(post && ['/auth/register','/auth/login','/auth/otp/send','/auth/otp/verify','/auth/reset'].includes(route)) {
        const address=req.socket.remoteAddress;
        const cutoff=Date.now()-60_000;
        for (const [k,a] of authAttempts) if (a.at<cutoff) authAttempts.delete(k);
        const bucket=authAttempts.get(address)??{at:Date.now(),count:0};
        check(bucket.count<30,'Espera un minuto para volver a intentarlo.',429);
        bucket.count++; authAttempts.set(address,bucket);
        if(route.includes('/otp/'))return answer(200,await challenge(store,key,route,data,deliver));
        if(route==='/auth/reset')return answer(200,await resetPassword(store,key,data));
        if(route==='/auth/register'){
          const email=verify(data.ticket,key,'register');
          check(email===String(data.email).trim().toLowerCase(),'Verifica este correo.');
          check(typeof data.password==='string' && Buffer.byteLength(data.password)<=72,'Contraseña demasiado larga.');
          Object.assign(data,await geocode(data.lat,data.lng),{email,verifiedEmail:true});
        }
        const profile=route==='/auth/register' ? await register(store,data,coordinatorSecret) : await login(store,data);
        accessCookie(profile.id);
        cookie(await createSession(store,profile),7*86400);
        if (route==='/auth/register') changed(profile.district);
        return answer(200,{profile});
      }
      const expected=req.headers['x-vecino-profile'] || url.searchParams.get('profile');
      const withSession=fn=>store.transaction(async sql=>{
        const p=await authenticate(sql,token);
        check(expected===p.id,'La sesión de este dispositivo cambió. Vuelve a ingresar.',401);
        if(route!=='/auth/refresh')check(verify(access,key,'access')===p.id,'Sesión vencida.',401);
        return fn(sql,p);
      });
      if(!post && route==='/events') {
        const p=await withSession((_,p)=>p);
        res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});
        res.write('retry: 5000\n\n');
        const stream={district:p.district,res};streams.add(stream);
        const heartbeat=setInterval(()=>res.write(': ping\n\n'),15_000);
        // Reauthenticate periodically when the browser reconnects.
        const expiry=setTimeout(()=>res.end(),5*60_000);
        res.on('close',()=>{streams.delete(stream);clearInterval(heartbeat);clearTimeout(expiry);});
        return;
      }
      const result=await withSession(async(sql,p)=>{
        if(post && route==='/auth/refresh'){accessCookie(p.id);return {ok:true};}
        if (!post && route==='/sync') {
          const snap=await snapshot(sql,p);
          return {...snap,governance:p.verified ? await readGovernance(sql,p) : []};
        }
        if (post && route==='/sync') {
          const result=await applyOperation(sql,p,data,store.postgis);
          if(result.ok && data.entity==='alerts' && data.operation==='create' && ['critical','high'].includes(result.record.data.severity))await enqueueAlert(sql,result.record.data);
          return result;
        }
        if(post && route==='/devices/push'){
          check(typeof data.token==='string' && /^(?:Expo|Exponent)PushToken\[[a-zA-Z0-9_-]{1,200}\]$/.test(data.token),'Identificador de dispositivo inválido.');
          if(data.enabled===false)await sql('DELETE FROM push_devices WHERE token=? AND session_hash=?',[data.token,hash(token)]);
          else {
            check(p.verified,'La junta debe validar tu residencia.',403);
            await sql('DELETE FROM push_devices WHERE token=? AND member_id<>?',[data.token,p.id]);
            await sql('INSERT INTO push_devices(token,member_id,session_hash) VALUES(?,?,?) ON CONFLICT(token) DO UPDATE SET session_hash=excluded.session_hash',[data.token,p.id,hash(token)]);
          }
          return {ok:true};
        }
        if (post && route==='/auth/logout') { await sql('DELETE FROM push_devices WHERE session_hash=?',[hash(token)]);await sql('DELETE FROM sessions WHERE token_hash=?',[hash(token)]);cookie('',0);return {ok:true}; }
        if (post && route==='/governance') {
          check(p.verified,'La junta debe verificar tu inscripción.',403);
          return applyGovernance(sql,p,data);
        }
        if(post && route==='/identity'){
          check(!p.dniRegistered,'Ya registraste tu documento.');
          const digest=await dniDigest(sql,data.dni);
          check(!(await sql('SELECT id FROM members WHERE dni_hash=?',[digest])).length,'Documento ya registrado.',409);
          p.dniRegistered=true;
          await sql('UPDATE members SET dni_hash=?,profile=? WHERE id=?',[digest,JSON.stringify(p),p.id]);
          return {profile:p};
        }
        if(post && route==='/community-role'){
          check(p.verified && ['prestador','brigadista'].includes(data.role),'Verifica tu residencia antes de inscribirte.',403);
          if(!p.roles.includes(data.role))p.roles.push(data.role);
          await sql('UPDATE members SET profile=? WHERE id=?',[JSON.stringify(p),p.id]);
          return {profile:p};
        }
        if (post && route==='/membership') {
          const actorRole=await boardRole(sql,p);
          check((actorRole==='presidente' || (actorRole==='vocal' && data.verified===true && Object.keys(data).every(k=>['id','verified'].includes(k)))) && p.id!==data.id,'Solo la presidencia puede validar a otro vecino.',403);
          const [row]=await sql('SELECT profile FROM members WHERE id=? AND district=?',[data.id,p.district]);
          check(row,'Integrante no encontrado.',404);
          const member=JSON.parse(row.profile);
          check(!isCoordinator(member),'Acción no permitida.',403);
          check(geographic(member).id===geographic(p).id,'El vecino pertenece a otra junta.',403);
          if (typeof data.verified==='boolean') {
            check(!data.verified || member.dniRegistered,'El vecino debe registrar su DNI antes de la revisión.');
            member.verified=data.verified?1:0;
            member.residencyVerifiedAt=data.verified?now():'';
          }
          if(data.walletReinstatedAt)member.walletReinstatedAt=now();
          if (Object.hasOwn(data,'protectionSince')) {
            check(!member.protectionSince && data.protectionSince && member.verified, 'La protección requiere un vecino verificado sin subsidio previo.');
            member.protectionSince=now();
          }
          member.updatedAt=now();
          await sql('UPDATE members SET profile=? WHERE id=?',[JSON.stringify(member),member.id]);
          await sql('INSERT INTO admin_audit(id,actor,target,action,created_at) VALUES(?,?,?,?,?)',[randomUUID(),p.id,member.id,'membership:'+JSON.stringify({verified:member.verified,protected:!!member.protectionSince}),now()]);
          return {profile:member};
        }
        if(post && route==='/location/resolve'){const place=await geocode(data.lat,data.lng);return store.postgis?{...place,...await sectorFields(sql,place)}:place;}
        if(post && route==='/location'){
          const zone=await geocode(data.lat,data.lng);
          if(store.postgis)Object.assign(zone,await sectorFields(sql,zone));
          check(zone.district===p.district || !isCoordinator(p),'La presidencia debe transferir su cargo antes de cambiar de distrito.');
          if(geographic(p).id!==geographic(zone).id){
            check(!isCoordinator(p),'Transfiere la presidencia antes de cambiar de sector.');
            p.verified=0;p.residencyVerifiedAt='';
          }
          if(zone.district!==p.district){
            const active=await sql("SELECT body FROM records WHERE district=? AND entity IN ('listings','requests')",[p.district]);
            check(!active.some(({body})=>{const x=JSON.parse(body);return [x.authorId,x.ownerId,x.requesterId].includes(p.id) && ['open','reserved','pending','accepted','in_progress'].includes(x.status);}), 'Cierra tus publicaciones y solicitudes antes de cambiar de distrito.');
          }
          delete p.sectorId;delete p.sectorName;delete p.adjacentSectors;
          Object.assign(p,zone,{updatedAt:now()});
          await sql('INSERT INTO territories(district) VALUES (?) ON CONFLICT(district) DO NOTHING',[zone.district]);
          await sql('UPDATE members SET profile=?,district=? WHERE id=?',[JSON.stringify(p),zone.district,p.id]);return {profile:p};
        }
        if(post && route==='/profile') {
          check(data.district===p.district && typeof data.name==='string' && data.name.trim().length>=3 && data.name.length<=150 && typeof data.phone==='string' && /^[\d\s()+-]{0,24}$/.test(data.phone),'Comprueba tu nombre, teléfono y distrito.');
          if(data.photo!==undefined){check(typeof data.photo==='string' && data.photo.length<=100000 && (!data.photo || /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data.photo)),'Foto inválida.');p.photo=data.photo;}
          Object.assign(p,{name:data.name.trim(),phone:data.phone.trim(),updatedAt:now()});
          await sql('UPDATE members SET profile=? WHERE id=?',[JSON.stringify(p),p.id]);return {profile:p};
        }
        if (post && route==='/crisis') {
          check(isCoordinator(p),'Se requiere la presidencia.',403);
          check(typeof data.active==='boolean' && typeof data.title==='string' && data.title.length<=160,'Estado de crisis inválido.');
          const key='disaster/'+geographic(p).id;
          await sql('INSERT INTO board_records(district,record_key,body) VALUES(?,?,?) ON CONFLICT(district,record_key) DO UPDATE SET body=excluded.body',[p.district,key,JSON.stringify({active:data.active,title:data.title,since:now()})]);
          if(!data.active)await sql('DELETE FROM board_records WHERE district=? AND record_key LIKE ?',[p.district,'federation/'+geographic(p).id+':%']);
          await sql('INSERT INTO admin_audit(id,actor,target,action,created_at) VALUES(?,?,?,?,?)',[randomUUID(),p.id,p.district,'crisis:'+data.title,now()]);
          return {ok:true};
        }
        check(false,'Ruta no encontrada.',404);
      });
      if (post && !['/auth/logout','/auth/refresh','/location/resolve'].includes(route) && result?.ok!==false) {
        const p=await withSession((_,p)=>p);
        changed(p.district);
      }
      return answer(200,result??{ok:true});
    } catch(e) {
      if (!e.status) console.error('Vecino360:',e.message);
      if(!res.headersSent) answer(e.status??500,{error:e.status?e.message:'El servidor no pudo completar la operación.'});
    }
  });
  server.on('upgrade',async(req,socket,head)=>{
    socket.on('error',()=>socket.destroy());
    try{
      const url=new URL(req.url,'http://localhost');
      check(url.pathname===prefix+'/live' && req.headers.origin && new URL(req.headers.origin).host===req.headers.host,'Origen inválido.',403);
      const cookies=Object.fromEntries((req.headers.cookie || '').split(/;\s*/).map(v=>v.split('=')));
      const key=await secret(store);
      const profile=await store.transaction(sql=>authenticate(sql,cookies.vecino_sid || ''));
      check(verify(cookies.ayni_access,key,'access')===profile.id && url.searchParams.get('profile')===profile.id,'Sesión inválida.',401);
      sockets.handleUpgrade(req,socket,head,ws=>{
        channels.set(ws,profile.district);
        const expiry=setTimeout(()=>ws.close(),300000);
        ws.on('error',()=>ws.terminate());
        ws.on('message',()=>ws.close(1008));
        ws.on('close',()=>{clearTimeout(expiry);channels.delete(ws);});
      });
    }catch{socket.destroy();}
  });
  server.on('district-change',localChange);
  server.on('close',()=>{for(const s of streams)s.res.end();for(const ws of channels.keys())ws.terminate();sockets.close();});
  return server;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const store=await openStore({databaseUrl:process.env.DATABASE_URL,filename:process.env.VECINO_DB || 'server/data/vecino360.sqlite'});
  const port=Number(process.env.PORT||4174);
  let jobs;
  const server=apiServer(store,{coordinatorSecret:process.env.VECINO_CHAIR_CODE,secureCookies:process.env.COOKIE_SECURE==='1',broadcast:district=>jobs.notify(district)});
  jobs=await startJobs(store,district=>server.emit('district-change',district));
  server.on('close',async()=>{await jobs.close();await store.close();});
  server.listen(port,process.env.HOST || '127.0.0.1',()=>console.log('Vecino360 API · puerto '+port+' · '+(store.postgis?'PostgreSQL/PostGIS':'SQLite')));
}
