import {sectorFields} from './sectors.mjs';
import { createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import {geographic} from './governance.mjs';
import bcrypt from 'bcryptjs';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
export const now = () => new Date().toISOString();
export const hash = text => createHash('sha256').update(text).digest('hex');
export function check(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
export const districts = {
  'Jesús María': [-12.083, -77.051], 'Pueblo Libre': [-12.076,-77.063],
  'Breña': [-12.058,-77.05], 'Magdalena del Mar': [-12.09,-77.07],
  'San Miguel': [-12.077,-77.085], 'Lince': [-12.085,-77.035], 'San Isidro': [-12.097,-77.036],
};
export const isCoordinator = p => p.verified === 1 && p.roles.includes('coordinador');

export async function dniDigest(sql, dni) {
  check(typeof dni==='string' && /^\d{8}$/.test(dni),'Ingresa los ocho dígitos del DNI.');
  await sql("INSERT INTO secrets(name,value) VALUES ('dni',?) ON CONFLICT(name) DO NOTHING", [randomBytes(32).toString('hex')]);
  const [secret] = await sql("SELECT value FROM secrets WHERE name='dni'");
  return createHmac('sha256',secret.value).update(dni).digest('hex');
}

export async function register(store, input, coordinatorSecret) {
  const { name, email, password, district, invitation } = input;
  check(typeof name === 'string' && name.trim().length >= 3 && name.length <= 150, 'Escribe tu nombre completo.');
  check(typeof email === 'string' && email.length <= 150 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Correo no válido.');
  check(typeof password === 'string' && password.length >= 10 && password.length <= 160, 'Usa una contraseña de 10 a 160 caracteres.');
  check(input.verifiedEmail === true, 'Verifica tu correo.');
  check(typeof district==='string' && district.length>0,'Distrito no detectado.');
  const chair = typeof invitation === 'string' && invitation.length > 0;
  if (chair) check(coordinatorSecret && timingSafeEqual(Buffer.from(hash(invitation)), Buffer.from(hash(coordinatorSecret))), 'Código de junta no válido.', 403);
  const pw = await bcrypt.hash(password, 12);
  const {lat,lng}=input;
  const profile = { id: randomUUID(), name: name.trim(), phone: '', district, lat, lng,
    roles: ['vecino'], verified: chair ? 1 : 0, dniRegistered: true, residencyVerifiedAt: '', emailVerified: true, zone: input.zone, avatarColor: 'bg-slate-900', createdAt: now(), updatedAt: now() };

  if (chair) profile.roles.push('coordinador');
  await store.transaction(async sql => {
    if(store.postgis)Object.assign(profile,await sectorFields(sql,profile));
    const digest=await dniDigest(sql,input.dni);
    const normalized = email.trim().toLowerCase();
    check(!(await sql('SELECT id FROM members WHERE email=? OR dni_hash=?', [normalized,digest])).length, 'El correo o DNI ya está registrado.', 409);
    await sql('INSERT INTO territories(district) VALUES (?) ON CONFLICT(district) DO NOTHING', [district]);
    if (chair) {
      const rows = await sql('SELECT profile FROM members WHERE district=?', [district]);
      check(!rows.some(r => isCoordinator(JSON.parse(r.profile)) && geographic(JSON.parse(r.profile)).id===geographic(profile).id), 'Este distrito ya tiene una presidencia habilitada.', 409);
    }
    await sql('INSERT INTO members(id,email,dni_hash,password_hash,district,profile) VALUES (?,?,?,?,?,?)',
      [profile.id,normalized,digest,pw,district,JSON.stringify(profile)]);
  });
  return profile;
}

export async function login(store, input) {
  check(typeof input.email === 'string' && typeof input.password === 'string' && input.password.length <= 160, 'Credenciales inválidas.', 401);
  const [user] = await store.transaction(sql => sql('SELECT profile,password_hash FROM members WHERE email=?', [input.email.trim().toLowerCase()]));
  if (user?.password_hash.startsWith('$2')) {
    check(await bcrypt.compare(input.password,user.password_hash),'Correo o contraseña incorrectos.',401); return JSON.parse(user.profile);
  }
  const [salt, key] = (user?.password_hash ?? ('0'.repeat(32) + '.' + '0'.repeat(128))).split('.');
  const actual = await derive(input.password, salt, 64);
  check(timingSafeEqual(actual, Buffer.from(key,'hex')) && user, 'Correo o contraseña incorrectos.', 401);
  const profile=JSON.parse(user.profile);
  check(profile.emailVerified===true,'Verifica tu correo para ingresar.',403);
  return profile;
}

export async function createSession(store, profile) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now()+7*86400_000).toISOString();
  await store.transaction(async sql => {
    await sql('DELETE FROM sessions WHERE expires < ?', [now()]);
    await sql('INSERT INTO sessions(token_hash,member_id,expires) VALUES (?,?,?)', [hash(token),profile.id,expires]);
  });
  return token;
}

export async function authenticate(sql, token) {
  const [member] = await sql('SELECT m.profile FROM sessions s JOIN members m ON m.id=s.member_id WHERE s.token_hash=? AND s.expires>?', [hash(token),now()]);
  check(member, 'Inicia sesión para sincronizar.', 401);
  return JSON.parse(member.profile);
}
