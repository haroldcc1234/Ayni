import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, LocateFixed } from 'lucide-react';
import { api, enterShared } from '../sync/remote';
import { Button, Input } from '../components/ui';
import { gpsPoint } from '../lib/geo';

export function Logo({small=false}:{small?:boolean}) {
 return <span role="img" aria-label="Ayni. Hoy por mí, mañana por ti." className={'ayni-logo '+(small?'compact':'')} />;
}
export function AuthPage({mode}:{mode:'login'|'register'|'reset'}) {
 const [dni,setDni]=useState(''),[invitation,setInvitation]=useState('');
 const [step,next]=useState(1),[name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [visible,show]=useState(false),[code,setCode]=useState(''),[ticket,setTicket]=useState('');
 const [retryAt,setRetryAt]=useState(0);
 const [error,fail]=useState(''),[busy,wait]=useState(false),[sent,setSent]=useState(false);
 const purpose=mode==='reset'?'reset':'register';
 const send=async()=>{if(Date.now()<retryAt)throw Error('Espera '+Math.ceil((retryAt-Date.now())/1000)+' segundos para reenviar.');await api('/auth/otp/send','POST',{email,purpose});setRetryAt(Date.now()+60000);};
 async function submit(event:FormEvent){
  event.preventDefault();if(busy)return;wait(true);fail('');
  try{
   if(mode==='login')await enterShared('/auth/login',{email,password});
   else if(step===1){await send();next(2);}
   else if(step===2){const r=await api<{ticket:string}>('/auth/otp/verify','POST',{email,purpose,code});setTicket(r.ticket);next(3);}
   else if(mode==='reset'){await api('/auth/reset','POST',{ticket,password});setSent(true);}
   else {const coords=await gpsPoint();await enterShared('/auth/register',{email,password,name,ticket,dni,invitation,...coords});}
  }catch(e){fail(e instanceof Error?e.message:'No se pudo completar. Reintenta.');}finally{wait(false);}
 }
 const pass= <div className="relative"><Input required autoComplete={mode==='login'?'current-password':'new-password'} label="Contraseña" type={visible?'text':'password'} minLength={mode==='login'?1:10} value={password} onChange={e=>setPassword(e.target.value)} className="pr-14"/><button className="absolute bottom-0 right-0 grid place-items-center" type="button" aria-label={visible?'Ocultar contraseña':'Mostrar contraseña'} onClick={()=>show(!visible)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>;
 return <main className="auth-page"><div className="auth-panel"><Logo/><h1>{mode==='login'?'Bienvenido a Ayni':mode==='reset'?'Recuperar contraseña':'Crear cuenta'}</h1>
 {mode!=='login' && <p className="step-caption">Paso {step} de 3</p>}
 {sent?<p>Contraseña actualizada. <Link to="/login">Ingresar</Link></p>:<form onSubmit={submit} className="space-y-4">
 {step===1 && <>{mode==='register'&&<Input label="Nombre completo" autoComplete="name" required minLength={3} value={name} onChange={e=>setName(e.target.value)}/>}<Input label="Correo electrónico" type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/>{mode==='register' && <Input label="DNI" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required value={dni} onChange={e=>setDni(e.target.value)}/>} {mode!=='reset'&&pass}</>}
 {step===2 && <><p>Enviamos un código a {email}. Vence en 10 minutos.</p><Input label="Código de seis dígitos" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" required maxLength={6} value={code} onChange={e=>setCode(e.target.value)}/><button type="button" onClick={async()=>{try{await send();fail('Enviamos otro código.');}catch(e){fail((e as Error).message);}}}>Reenviar código</button></>}
 {step===3 && (mode==='reset'?pass:<p><LocateFixed className="mb-2"/>Usamos tu ubicación para conectarte con vecinos cercanos. Tu dirección exacta es privada.</p>)}
 {mode==='register' && step===3 && <details><summary>Tengo una invitación de presidencia</summary><Input label="Código de junta" type="password" value={invitation} onChange={e=>setInvitation(e.target.value)}/></details>}
 {error&&<p role="alert" className="text-crisis-800">{error}</p>}
 <Button type="submit" loading={busy} full>{mode==='login'?'Ingresar':step===1?'Enviar código':step===2?'Verificar código':mode==='reset'?'Guardar contraseña':'Detectar mi zona y entrar'}</Button></form>}
 {mode==='login'?<><Link to="/recuperar">¿Olvidaste tu contraseña?</Link><Link to="/registro">Crear cuenta</Link></>:<Link to="/login">Volver al ingreso</Link>}</div></main>;
}
