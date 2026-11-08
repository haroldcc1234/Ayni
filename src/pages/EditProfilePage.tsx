import { useState } from 'react';
import { useCurrentProfile } from '../hooks';
import { sharedMode } from '../sync/mode';
import { gpsPoint } from '../lib/geo';
import { remotePost } from '../sync/remote';
import { db } from '../db/db';
import type { Profile } from '../db/types';
import { Button, Input, Card } from '../components/ui';
import { PageHeading } from '../components/PageBits';
export function EditProfilePage(){
 const {profile}=useCurrentProfile();return profile?<Edit key={profile.id} profile={profile}/>:null;
}
function Edit({profile}:{profile:Profile}){
 const [dni,setDni]=useState('');
 const [name,setName]=useState(profile.name),[phone,setPhone]=useState(profile.phone),[photo,setPhoto]=useState(profile.photo || ''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function save(location:boolean){setBusy(true);try{
 if(!sharedMode){
   if(!location && name.trim().length<3)throw new Error('Escribe tu nombre completo.');
   await db.profiles.update(profile.id,location?{zone:profile.district}:{name:name.trim(),phone,photo});
   setMessage(location?'Ubicación del perfil de muestra.':'Cambios guardados en la demo.');
   return;
 }
 const {profile:updated}=await remotePost<{profile:Profile}>(location?'/location':'/profile',location?await gpsPoint():{name,phone,photo,district:profile.district});
 await db.profiles.put(updated);setMessage('Cambios guardados.');
 }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 return <><PageHeading title="Editar perfil" back={{to:'/perfil',label:'Perfil'}}/><Card className="space-y-4">{sharedMode && !profile.dniRegistered && <div><Input label="DNI" value={dni} maxLength={8} inputMode="numeric" onChange={e=>setDni(e.target.value)}/><Button disabled={busy || !/^\d{8}$/.test(dni)} onClick={async()=>{setBusy(true);try{const result=await remotePost<{profile:Profile}>('/identity',{dni});await db.profiles.put(result.profile);setDni('');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>Registrar documento</Button></div>}<label className="block">Foto de perfil<input className="mt-2 block w-full" type="file" accept="image/jpeg,image/png,image/webp" onChange={async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try {if(file.size>5_000_000)throw Error();const img=await createImageBitmap(file);const canvas=document.createElement('canvas');canvas.width=canvas.height=160;const side=Math.min(img.width,img.height);canvas.getContext('2d')!.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,160,160);img.close();setPhoto(canvas.toDataURL('image/jpeg',0.8));}catch{setMessage('Elige una imagen de hasta 5 MB.');}
 }}/></label>{photo&&<img src={photo} width="64" height="64" alt="Tu foto" className="rounded-full"/>}<Input label="Nombre completo"  value={name} onChange={e=>setName(e.target.value)}/><Input label="Teléfono" type="tel" value={phone} onChange={e=>setPhone(e.target.value)}/><p>{profile.zone||profile.district}</p><Button variant="outline" disabled={busy} onClick={()=>void save(true)}>Actualizar mi ubicación</Button><Button full disabled={busy} onClick={()=>void save(false)}>Guardar cambios</Button><p role="status">{message}</p></Card></>;
}
