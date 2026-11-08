import assert from 'node:assert/strict';
import test from 'node:test';
import {openStore} from './store.mjs';
import {apiServer} from './index.mjs';
test('registro, OTP, GPS, login, lectura y recuperación',async()=>{
 const store=await openStore({filename:':memory:'});let code;
 const server=apiServer(store,{deliver:async(_,v)=>{code=v;},geocode:async()=>({lat:-12.083,lng:-77.051,district:'Jesús María',zone:'Jesús María, Lima'})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port+'/api/v1';
 const post=(path,data,headers={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)});
 try{
 const email='vecina@example.org',password='prueba-local-234',account={dni:'12345678',name:'Ana Pérez',email,password,lat:-12.083,lng:-77.051};
 assert.equal((await post('/auth/register',account)).status,401);
 const exhausted='intentos@example.org';
 assert.equal((await post('/auth/otp/send',{email:exhausted})).status,200);
 const exhaustedCode=code;
 for(let i=0;i<5;i++)assert.equal((await post('/auth/otp/verify',{email:exhausted,code:'invalido'})).status,400);
 assert.match((await(await post('/auth/otp/verify',{email:exhausted,code:exhaustedCode})).json()).error,/cinco/);
 assert.equal((await post('/auth/otp/send',{email})).status,200);
 assert.equal((await post('/auth/otp/send',{email})).status,429);
 assert.equal((await post('/auth/otp/verify',{email,code:'invalid'})).status,400);
 const {ticket}=await (await post('/auth/otp/verify',{email,code})).json();
 const registered=await post('/auth/register',{...account,ticket});assert.equal(registered.status,200);
 const login=await post('/auth/login',{email,password});assert.equal(login.status,200);
 const {profile}=await login.json();const headers={cookie:login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),'x-vecino-profile':profile.id};
 assert.equal((await fetch(base+'/sync',{headers})).status,200);
 assert.equal((await post('/auth/refresh',{},headers)).status,200);
 assert.equal((await post('/location',account,headers)).status,200);
 assert.equal((await post('/auth/otp/send',{email,purpose:'reset'})).status,200);
 const reset=await(await post('/auth/otp/verify',{email,purpose:'reset',code})).json();
 assert.equal((await post('/auth/reset',{ticket:reset.ticket,password:'nueva-clave-123'})).status,200);
 assert.equal((await post('/auth/login',{email,password})).status,401);
 }finally{await new Promise(r=>server.close(r));await store.close();}
});

test('dos sesiones, residencia, alertas, entrega, reintentos y reservas simultáneas',async()=>{
 const store=await openStore({filename:':memory:'});const codes=new Map();
 const zone={lat:-12.083,lng:-77.051,district:'Jesús María',zone:'Sector central'};
 const server=apiServer(store,{deliver:async(email,code)=>codes.set(email,code),geocode:async()=>zone,coordinatorSecret:'junta-de-prueba'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/api/v1';
 const post=(path,data,headers={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)});
 async function enroll(email,dni,invitation){
   assert.equal((await post('/auth/otp/send',{email})).status,200);
   const {ticket}=await (await post('/auth/otp/verify',{email,code:codes.get(email)})).json();
   const response=await post('/auth/register',{...zone,email,dni,invitation,ticket,name:'Vecino de prueba',password:'prueba-local-234'});
   const {profile}=await response.json();assert.equal(response.status,200);
   return {id:profile.id,cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),'x-vecino-profile':profile.id};
 }
 try{
   const chair=await enroll('junta@example.org','00000001','junta-de-prueba');
   const neighbor=await enroll('vecino@example.org','00000002');
   const op=(entity,payload)=>({entity,payload,entityId:payload.id,idempotencyKey:'alta-'+payload.id,baseVersion:0,operation:'create'});
   const alert=op('alerts',{...zone,id:'incidencia',authorId:neighbor.id,title:'Prueba vecinal',description:'Simulacro',category:'otro',severity:'high',status:'pending'});
   assert.equal((await post('/sync',alert,neighbor)).status,403);
   assert.equal((await post('/membership',{id:neighbor.id,verified:true},chair)).status,200);
   assert.equal((await post('/devices/push',{token:'ExpoPushToken[dispositivoPrueba]'},chair)).status,200);
   const result=await (await post('/sync',alert,neighbor)).json();assert.equal(result.ok,true);
   assert.deepEqual(await (await post('/sync',alert,neighbor)).json(),result);
   const snap=await (await fetch(base+'/sync',{headers:chair})).json();
   assert.equal(snap.records.filter(r=>r.entity==='alerts').length,1);
   const deliveries=await store.transaction(sql=>sql('SELECT id,state FROM push_deliveries'));assert.equal(deliveries.length,1);
   const {deliverPush}=await import('./push.mjs');
   await deliverPush(store,deliveries[0].id,async()=>({status:'ok',id:'ticket-prueba'}));
   assert.equal((await store.transaction(sql=>sql('SELECT state FROM push_deliveries')))[0].state,'receipt');
   await store.transaction(sql=>sql("INSERT INTO points_ledger(member_id,event_id,amount,label,recorded_at) VALUES(?, 'saldo-prueba',20,'Saldo de prueba',?)",[neighbor.id,new Date().toISOString()]));
   const favor=id=>op('listings',{...zone,id,type:'favor',authorId:neighbor.id,title:'Apoyo',description:'Favor de prueba',category:'apoyo',status:'open',expiresAt:'2099-01-01',meta:{pointsCost:15,wallet:{cost:15,held:15,subsidy:0,crisis:false}}});
   const credits=await Promise.all(['favor-1','favor-2'].map(id=>post('/sync',favor(id),neighbor)));
   assert.deepEqual(credits.map(r=>r.status).sort(),[200,422]);
   await assert.rejects(store.transaction(sql=>sql('UPDATE points_ledger SET amount=100')));
   assert.equal((await post('/auth/logout',{},chair)).status,200);
   assert.equal((await store.transaction(sql=>sql('SELECT token FROM push_devices'))).length,0);
 }finally{await new Promise(resolve=>server.close(resolve));await store.close();}
});
