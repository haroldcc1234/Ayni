/**
 * Datos FICTICIOS para la SQLite local de Ayni.
 * Uso: node --experimental-strip-types scripts/seed-sqlite.mjs [--preview|--apply]
 * No toca miembros ni registros existentes; los IDs son deterministas.
 * Nunca ejecutar en producción.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { openStore } from '../server/store.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dbPath = resolve(root, process.env.VECINO_DB || 'server/data/vecino360.sqlite');
const credentialsPath = resolve(root, 'server/data/ayni-test-credentials.json');
const markerKey = 'ayni-test-seed-v1';
const prefix = 'aynitest-v1';
const apply = process.argv.includes('--apply');
const preview = process.argv.includes('--preview') || !apply;
const allowedArgs = new Set(['--preview', '--apply']);
if (process.argv.slice(2).some(arg => !allowedArgs.has(arg)) || (apply && process.argv.includes('--preview'))) {
  throw Error('Uso: node --experimental-strip-types scripts/seed-sqlite.mjs [--preview | --apply]');
}
if (process.env.DATABASE_URL) throw Error('Este cargador solo admite SQLite local (sin DATABASE_URL).');
if (!dbPath.endsWith('.sqlite')) throw Error('VECINO_DB debe apuntar a un archivo SQLite.');
if (!existsSync(dbPath)) throw Error('No existe la base de datos: ' + dbPath + '. Inicia npm run server una vez, detenlo y repite.');
const readDb = new DatabaseSync(dbPath, {readOnly:true});
const tables = readDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
if (!['members','records','secrets','territories','board_records'].every(t=>tables.includes(t))) {
  readDb.close();
  throw Error('Esquema incompleto. Inicia npm run server una vez para inicializar las tablas.');
}
const existingMarker = readDb.prepare('SELECT value FROM secrets WHERE name=?').get(markerKey);
const peopleBefore = Number(readDb.prepare('SELECT COUNT(*) AS n FROM members').get().n);
const recordsBefore = Number(readDb.prepare('SELECT COUNT(*) AS n FROM records').get().n);
const real = readDb.prepare("SELECT profile FROM members WHERE email NOT LIKE '%@ayni.test' ORDER BY rowid LIMIT 1").get();
const first = real && JSON.parse(real.profile);
const base = existingMarker ? JSON.parse(existingMarker.value) :
  (first && typeof first.lat==='number' && typeof first.lng==='number' && first.district
    ? {district:first.district,lat:first.lat,lng:first.lng}
    : {district:'Jesús María',lat:-12.083,lng:-77.051});
const district = base.district;
const origins = {'Jesús María':[-12.083,-77.051],'Pueblo Libre':[-12.076,-77.063],'Breña':[-12.058,-77.05],
  'Magdalena del Mar':[-12.09,-77.07],'San Miguel':[-12.077,-77.085],'Lince':[-12.085,-77.035],'San Isidro':[-12.097,-77.036]};
const origin = origins[district] || [0,0];
function sectorOf(lat,lng) {
  return encodeURIComponent(district)+'/'+Math.floor((lat-origin[0])/.006+.5)+'/'+Math.floor((lng-origin[1])/.006+.5);
}
const sector = sectorOf(base.lat,base.lng);
const registered = readDb.prepare('SELECT profile FROM members WHERE district=?').all(district).map(x=>JSON.parse(x.profile));
const alreadyChair = registered.some(p=>p.verified===1 && p.roles.includes('coordinador') && sectorOf(p.lat,p.lng)===sector);
const seedChair = existingMarker ? Boolean(base.seedChair) : !alreadyChair;
const before = {members:peopleBefore,records:recordsBefore};
readDb.close();

const sampleNames = [
  'Coordinación Ayni (PRUEBA)', 'Lucía Quispe (PRUEBA)', 'Marco Huamán (PRUEBA)', 'Rosa Palacios (PRUEBA)',
  'Javier Ramos (PRUEBA)', 'Elena Soto (PRUEBA)', 'Daniel Castro (PRUEBA)', 'Patricia Vega (PRUEBA)',
  'Andrés Mendoza (PRUEBA)', 'Sonia Flores (PRUEBA)', 'Martín Chávez (PRUEBA)', 'Teresa Romero (PRUEBA)',
  'Ana Rojas (PRUEBA)', 'Carlos Medina (PRUEBA)', 'Julia Paredes (PRUEBA)', 'Miguel Torres (PRUEBA)',
  'María León (PRUEBA)', 'Ricardo Campos (PRUEBA)', 'Gloria Salazar (PRUEBA)', 'Vecino Pendiente (PRUEBA)'
];
const trades = [
  'Gasfitería','Electricidad','Carpintería','Cerrajería','Soporte técnico','Costura',
  'Pintura','Jardinería','Reparación de bicicletas','Limpieza','Clases particulares','Transporte'
];
const descriptions = [
  'Reparación de fugas, griferías y tuberías a domicilio.',
  'Instalaciones de iluminación y revisión de tomacorrientes.',
  'Reparación de puertas, muebles y estantes de madera.',
  'Apertura y mantenimiento preventivo de cerraduras.',
  'Mantenimiento de laptops, redes WiFi e impresoras.',
  'Arreglos de ropa, uniformes y pequeños confecciones.',
  'Pintura de habitaciones y mantenimiento de paredes.',
  'Cuidado de jardines, macetas y áreas comunes.',
  'Mantenimiento de bicicletas y ajuste de frenos.',
  'Limpieza programada de viviendas y zonas compartidas.',
  'Apoyo escolar en matemáticas e informática.',
  'Traslados programados para compras y entregas vecinales.'
];
const listingTemplates = [
  ['loan','Taladro eléctrico para préstamo','Herramientas'],
  ['donation','Paquete de víveres para una familia','Alimentos'],
  ['favor','Apoyo para cargar muebles','Hogar'],
  ['time_bank','Clases de Excel para principiantes','Educación'],
  ['mobility','Viaje compartido al mercado','Transporte'],
  ['service','Reparación rápida de computadoras','Tecnología'],
  ['promotion','Venta de productos artesanales','Hogar'],
  ['recommendation','¿Alguien recomienda un electricista?','Tecnología'],
  ['loan','Escalera plegable disponible','Herramientas'],
  ['donation','Útiles escolares en buen estado','Educación'],
  ['favor','Acompañamiento para compras','Hogar'],
  ['time_bank','Ayuda con tareas de matemática','Educación'],
  ['mobility','Traslado solidario a clínica','Transporte'],
  ['service','Mantenimiento de jardines','Hogar'],
  ['promotion','Pan artesanal por encargo','Alimentos'],
  ['recommendation','Busco técnico de celulares','Tecnología'],
  ['loan','Proyector para reuniones vecinales','Tecnología'],
  ['donation','Ropa de abrigo para donar','Ropa'],
  ['favor','Cuidado temporal de mascotas','Mascotas'],
  ['time_bank','Sesión de conversación en inglés','Educación'],
  ['mobility','Movilidad al centro de la ciudad','Transporte'],
  ['service','Costura y reparación de uniformes','Ropa'],
  ['promotion','Frutas de temporada por pedido','Alimentos'],
  ['recommendation','Recomienden un gasfitero cercano','Hogar'],
  ['loan','Caja de herramientas disponible','Herramientas'],
  ['donation','Libros para jóvenes estudiantes','Educación'],
  ['service','Pintura de paredes y rejas','Hogar'],
  ['promotion','Accesorios para mascotas','Mascotas'],
  ['loan','Silla de ruedas para préstamo','Salud'],
  ['donation','Mantas limpias para familias','Hogar']
];
const alertsTemplates = [
  ['Agua','Corte de agua en varias viviendas','medium'],
  ['Estructura','Grieta visible en pared comunal','high'],
  ['Salud','Apoyo de primeros auxilios solicitado','high'],
  ['Gas','Olor a gas reportado por un vecino','critical'],
  ['Alimentos','Familias necesitan alimentos','medium'],
  ['Rescate','Persona requiere evacuación asistida','high'],
  ['Agua','Falta de agua para adulto mayor','medium'],
  ['Estructura','Poste inclinado cerca de viviendas','high'],
  ['Salud','Solicitud de traslado para atención médica','medium'],
  ['Otro','Obstáculo peligroso en la vía','medium']
];
const two = n => String(n).padStart(2,'0');
const iso = new Date().toISOString();
const future = new Date(Date.now()+14*86400_000).toISOString();
const futureMonth = new Date(Date.now()+40*86400_000).toISOString();
const longFuture = '9999-12-31T23:59:59.000Z';
const id = (type,i) => prefix+'-'+type+'-'+two(i+1);
function position(i) {
  const delta = ((i%5)-2)*0.00012;
  const lat = Number((base.lat+delta).toFixed(6));
  const lng = Number((base.lng+((Math.floor(i/5)%5)-2)*0.00012).toFixed(6));
  return sectorOf(lat,lng)===sector ? {lat,lng} : {lat:base.lat,lng:base.lng};
}
const memberProfiles = sampleNames.map((name,i)=>{
  const roles=['vecino'];
  if(i===0 && seedChair) roles.push('coordinador');
  if(i>=1 && i<=12) roles.push('prestador');
  if(i>=12 && i<=17) roles.push('brigadista');
  const verified = i===19 ? 0 : 1;
  return {id:id('member',i),name,phone:'',district,...position(i),roles,verified,
    dniRegistered:true,emailVerified:true,residencyVerifiedAt:verified?iso:'',
    zone:'SIMULACIÓN · '+district,avatarColor:'bg-slate-900',
    testData:true,createdAt:iso,updatedAt:iso};
});
const memberEmails = memberProfiles.map((_,i)=>'prueba'+two(i+1)+'@ayni.test');
const providers = trades.map((trade,i)=>{
  const p=memberProfiles[i+1];
  return {id:id('provider',i),profileId:p.id,trade,description:descriptions[i],district,
    lat:p.lat,lng:p.lng,coverageRadiusM:800,schedule:'Lun-Sáb 09:00-18:00',
    status:'active',score:0,endorsementCount:0,verified:1};
});
const endorsements = Array.from({length:36},(_,i)=>{
  const provider=providers[i%providers.length];
  let voter=memberProfiles[(i*3+4)%19];
  if(voter.id===provider.profileId) voter=memberProfiles[(i*3+5)%19];
  return {id:id('endorsement',i),providerId:provider.id,endorserId:voter.id,
    weight:[1,0.75,0.5][i%3],comment:'Recomendación ficticia para comprobar la confianza vecinal.'};
});
for(const p of providers){
  const e=endorsements.filter(x=>x.providerId===p.id);
  p.score=Number(e.reduce((s,x)=>s+x.weight,0).toFixed(2));
  p.endorsementCount=e.length;
}
const listings=listingTemplates.map(([type,title,category],i)=>{
  const author=memberProfiles[(i+1)%19];
  let meta={};
  if(type==='loan')meta={condition:'Buen estado',hourlyRate:0,returnBy:futureMonth,highValue:false};
  if(type==='donation')meta={quantity:'1 lote',condition:'Buen estado',expiresAt:futureMonth};
  if(type==='favor')meta={deadline:future,coverageRadiusM:800,pointsCost:15};
  if(type==='time_bank')meta={hours:2,pointsCost:15,skill:'Apoyo vecinal',modality:'Presencial'};
  if(type==='mobility')meta={origin:district,destination:'Centro del distrito',departureAt:future,seats:2};
  if(type==='service')meta={trade:'Soporte técnico',schedule:'Lun-Sáb 09:00-18:00',coverageRadiusM:800};
  if(type==='promotion')meta={price:20,durationHours:undefined};
  return {id:id('listing',i),type,category,title:title+' [PRUEBA]',
    description:'Registro ficticio creado para explorar las funciones comunitarias de Ayni. No corresponde a una oferta real.',
    authorId:author.id,district,lat:author.lat,lng:author.lng,status:'open',
    expiresAt:type==='promotion'?longFuture:future,meta,hidden:0};
});
// Solicitudes solo sobre publicaciones compatibles: no se simulan pagos ni reservas de puntos.
const requestIndices=[0,5,8,12,13,14,16,20,21,22,26,28];
const statuses=['pending','pending','accepted','in_progress','completed','rejected',
  'accepted','completed','in_progress','completed','pending','completed'];
const requests=requestIndices.map((listingIdx,i)=>{
  const l=listings[listingIdx], status=statuses[i];
  const requester=memberProfiles[(i+9)%19];
  const actor=requester.id===l.authorId?memberProfiles[(i+10)%19]:requester;
  if(status==='accepted')l.status='reserved';
  if(status==='in_progress')l.status='in_progress';
  if(status==='completed')l.status='completed';
  return {id:id('request',i),listingId:l.id,requesterId:actor.id,ownerId:l.authorId,status,
    message:'Solicitud de ejemplo: deseo coordinar el servicio con mi vecino.',meta:{}};
});
const brigades=memberProfiles.slice(12,18).map((p,i)=>({
  id:id('brigade',i),profileId:p.id,skills:[['Primeros auxilios','Salud'],['Transporte','Logística'],
    ['Comunicaciones'],['Rescate','Evacuación'],['Remoción'],['Estructuras']][i],
  resources:[['Botiquín'],['Camioneta'],['Radio'],['Linterna'],['Herramientas'],['Extintor']][i],
  certifications:'Experiencia ficticia de demostración',availability:i===4?'busy':'available',
  district,lat:p.lat,lng:p.lng
}));
const alerts=alertsTemplates.map(([category,title,severity],i)=>{
  const author=memberProfiles[(i+3)%19];
  const status=['pending','assigned','in_progress','resolved'][i%4];
  const brigade=brigades[i%brigades.length];
  return {id:id('alert',i),category,title:title+' [PRUEBA]',severity,
    description:'Incidencia ficticia; usar únicamente para demostrar la respuesta vecinal.',
    authorId:author.id,district,lat:author.lat,lng:author.lng,status,
    ...(status!=='pending'?{brigadeProfileId:brigade.id,assignedAt:iso}:{}),
    ...(status==='resolved'?{resolvedAt:iso}:{})};
});
const reports=listings.slice(0,6).map((l,i)=>({
  id:id('report',i),targetType:'listing',targetId:l.id,
  reporterId:memberProfiles[(i+7)%19].id,
  reason:'Reporte ficticio para ensayar el proceso de moderación.',status:i%3===0?'resolved':'open'
}));
const baseEntities=[
  ['providers',providers],['endorsements',endorsements],['listings',listings],
  ['requests',requests],['alerts',alerts],['brigadeProfiles',brigades],['reports',reports]
];
function createdRecord(d,i){
  return {...d,createdAt:iso,updatedAt:iso,version:1,syncStatus:'synced'};
}
const counts=Object.fromEntries(baseEntities.map(([type,rows])=>[type,rows.length]));
console.log('Base SQLite:',dbPath);
console.log('Distrito:',district,'| sector:',sector,'| origen:',existingMarker?'carga previa':'perfil registrado o distrito demo');
console.log('Actual:',before.members,'usuarios y',before.records,'registros');
console.log('Carga propuesta:',memberProfiles.length,'usuarios y',counts);
console.log('Primera cuenta de prueba con coordinación:',seedChair?'sí, porque no existía presidencia en el sector':'no (ya existía presidencia o se conserva el estado anterior)');
console.log('Las cuentas usan el dominio reservado @ayni.test y NO reciben correo.');
if(preview){
  console.log('SOLO VISTA PREVIA: no se escribió nada. Para aplicar: node --experimental-strip-types scripts/seed-sqlite.mjs --apply');
  process.exit(0);
}
if(existsSync(dbPath+'-journal')) throw Error('Detectado archivo journal activo. Detén npm run server y vuelve a intentar.');
mkdirSync(dirname(credentialsPath),{recursive:true});
const present = new DatabaseSync(dbPath,{readOnly:true});
const seededExisting = present.prepare("SELECT COUNT(*) AS n FROM members WHERE id LIKE ?").get(prefix+'-%').n;
present.close();
if(seededExisting && !existsSync(credentialsPath))
  throw Error('Las cuentas de muestra ya existen pero falta '+credentialsPath+'. No se cambiarán sus contraseñas.');
if(!existsSync(credentialsPath)){
  const generated={warning:'SOLO PRUEBAS LOCALES: cuentas ficticias con permisos; no publicar ni compartir',
    createdAt:iso,district,accounts:memberProfiles.map((p,i)=>({
      id:p.id,email:memberEmails[i],password:randomBytes(18).toString('base64url'),role:p.roles.join(', '),name:p.name
    }))};
  writeFileSync(credentialsPath,JSON.stringify(generated,null,2),{flag:'wx',mode:0o600});
}
const credentials=JSON.parse(readFileSync(credentialsPath,'utf8'));
if(!Array.isArray(credentials.accounts) || credentials.accounts.length!==memberProfiles.length ||
   credentials.accounts.some((a,i)=>a.id!==memberProfiles[i].id || a.email!==memberEmails[i] || typeof a.password!=='string'))
  throw Error('El archivo de credenciales no coincide con esta versión del cargador; no se modificó la base.');
// Respaldo consistente de SQLite, incluyendo cambios presentes en el WAL.
const snapshot = new DatabaseSync(dbPath,{readOnly:true});
const backupPath=resolve(dirname(dbPath),'ayni-antes-carga-'+Date.now()+'.sqlite');
try{
  // VACUUM INTO ofrece una copia SQLite coherente, compatible con Node.js 22.14.0.
  snapshot.prepare('VACUUM INTO ?').run(backupPath);
}finally{snapshot.close();}
console.log('Respaldo creado:',backupPath);
const store=await openStore({filename:dbPath});
try{
  const hashes=await Promise.all(credentials.accounts.map(a=>bcrypt.hash(a.password,12)));
  const added=await store.transaction(async sql=>{
    const marker=(await sql('SELECT value FROM secrets WHERE name=?',[markerKey]))[0];
    if(marker){
      const m=JSON.parse(marker.value);
      if(m.district!==district || m.lat!==base.lat || m.lng!==base.lng)
        throw Error('La carga anterior pertenece a otro sector; no se cambiarán sus registros.');
    }
    await sql('INSERT INTO territories(district) VALUES (?) ON CONFLICT(district) DO NOTHING',[district]);
    const increments={members:0};
    for(let i=0;i<memberProfiles.length;i++){
      const p=memberProfiles[i],email=memberEmails[i];
      const existing=(await sql('SELECT id,email FROM members WHERE id=? OR email=?',[p.id,email]));
      if(existing.length){
        if(existing.length!==1 || existing[0].id!==p.id || existing[0].email!==email)
          throw Error('Colisión con cuenta ajena: '+email);
        continue;
      }
      // Identificador documental de simulación; NO es un DNI auténtico.
      const fakeDni='simulado:'+p.id;
      await sql('INSERT INTO members(id,email,dni_hash,password_hash,district,profile) VALUES(?,?,?,?,?,?)',
        [p.id,email,fakeDni,hashes[i],district,JSON.stringify(p)]);
      increments.members++;
    }
    for(const [entity,items] of baseEntities){
      increments[entity]=0;
      for(let i=0;i<items.length;i++){
        const item=createdRecord(items[i],i);
        const found=await sql('SELECT body FROM records WHERE district=? AND entity=? AND id=?',[district,entity,item.id]);
        if(found.length){
          if(JSON.parse(found[0].body).testData!==true) throw Error('Colisión con registro ajeno: '+item.id);
          continue;
        }
        await sql('INSERT INTO records(district,entity,id,version,body) VALUES(?,?,?,?,?)',
          [district,entity,item.id,1,JSON.stringify({...item,testData:true})]);
        increments[entity]++;
      }
    }
    const boardRows=[
      ['campaign/'+sector+'/'+id('campaign',0),{
        id:id('campaign',0),sectorId:sector,title:'Recolección de víveres [PRUEBA]',
        unit:'paquetes',target:40,entries:[],closedAt:null
      }],
      ['campaign/'+sector+'/'+id('campaign',1),{
        id:id('campaign',1),sectorId:sector,title:'Campaña de abrigo [PRUEBA]',
        unit:'mantas',target:30,entries:[],closedAt:null
      }],
      ['log/'+sector+'/2000-01-01T00:00:00.000Z/'+id('audit',0),{
        actor:'Carga local de Ayni',action:'Se añadieron datos exclusivamente ficticios de prueba',at:iso
      }]
    ];
    increments.board=0;
    for(const [key,body] of boardRows){
      const found=await sql('SELECT body FROM board_records WHERE district=? AND record_key=?',[district,key]);
      if(found.length)continue;
      await sql('INSERT INTO board_records(district,record_key,body) VALUES(?,?,?)',[district,key,JSON.stringify(body)]);
      increments.board++;
    }
    if(!marker)await sql('INSERT INTO secrets(name,value) VALUES(?,?)',[markerKey,JSON.stringify({...base,seedChair})]);
    return increments;
  });
  console.log('CARGA COMPLETADA (solo inserciones):',added);
  console.log('Usuarios y contraseñas de prueba en:',credentialsPath);
  console.log('NO compartas ese archivo ni lo subas a GitHub. Inicia npm run server y luego npm run dev.');
}catch(error){
  console.error('La operación se revirtió; no se borraron cuentas ni registros:',error.message);
  process.exitCode=1;
}finally{await store.close();}
