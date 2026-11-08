import {createHash} from 'node:crypto';
import { geographic } from './governance.mjs';

export async function enqueueAlert(sql, alert) {
  const devices=await sql('SELECT d.token,d.member_id,m.profile FROM push_devices d JOIN members m ON m.id=d.member_id JOIN sessions s ON s.token_hash=d.session_hash WHERE m.district=? AND s.expires>?',[alert.district,new Date().toISOString()]);
  for(const device of devices){
    const owner=JSON.parse(device.profile);
    if(!owner.verified || owner.id===alert.authorId || geographic(owner).id!==geographic(alert).id)continue;
    const id=createHash('sha256').update([alert.district,alert.id,owner.id,device.token].join('|')).digest('hex');
    await sql("INSERT INTO push_deliveries(id,token,district,alert_id,member_id,state,due) VALUES(?,?,?,?,?,'pending',?) ON CONFLICT(id) DO NOTHING",[id,device.token,alert.district,alert.id,owner.id,Date.now()]);
  }
}

async function expo(action,payload){
  const headers={'Content-Type':'application/json'};
  if(process.env.EXPO_ACCESS_TOKEN)headers.Authorization='Bearer '+process.env.EXPO_ACCESS_TOKEN;
  const res=await fetch('https://exp.host/--/api/v2/push/'+action,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw Error('Proveedor de avisos HTTP '+res.status);
  return (await res.json()).data;
}

export async function deliverPush(store,id,transport=expo){
  const item=await store.transaction(async sql=>{
    const [row]=await sql("SELECT * FROM push_deliveries WHERE id=? AND state IN ('pending','receipt') AND due<=?",[id,Date.now()]);
    if(!row)return;
    const [device]=await sql("SELECT m.profile,r.body FROM push_devices d JOIN sessions s ON s.token_hash=d.session_hash JOIN members m ON m.id=d.member_id JOIN records r ON r.district=m.district AND r.entity='alerts' AND r.id=? WHERE d.token=? AND m.id=? AND m.district=? AND s.expires>?",[row.alert_id,row.token,row.member_id,row.district,new Date().toISOString()]);
    const profile=device && JSON.parse(device.profile), alert=device && JSON.parse(device.body);
    if(!profile?.verified || geographic(profile).id!==geographic(alert).id || ['resolved','cancelled'].includes(alert.status)){
      await sql("UPDATE push_deliveries SET state='cancelled' WHERE id=?",[id]);return;
    }
    await sql('UPDATE push_deliveries SET due=?, attempts=attempts+1 WHERE id=?',[Date.now()+60000,id]);
    return row;
  });
  if(!item)return;
  const receipt=item.state==='receipt';
  try{
    const result=receipt ? (await transport('getReceipts',{ids:[item.ticket]}))[item.ticket] :
      await transport('send',{to:item.token,title:'Ayni · Alerta en tu sector',body:'Abre la aplicación para ver la incidencia.',data:{alertId:item.alert_id},channelId:'emergencias',priority:'high',ttl:3600});
    if(!result || (result.status==='error' && result.details?.error!=='DeviceNotRegistered'))throw Error('Entrega pendiente');
    await store.transaction(async sql=>{
      if(result.details?.error==='DeviceNotRegistered'){
        await sql('DELETE FROM push_devices WHERE token=? AND member_id=?',[item.token,item.member_id]);return;
      }
      if(!receipt && !result.id)throw Error('Falta el comprobante de envío');
      await sql('UPDATE push_deliveries SET state=?,ticket=?,due=?,attempts=0 WHERE id=?',[receipt?'delivered':'receipt',result.id??item.ticket,Date.now()+900000,id]);
    });
  }catch{
    await store.transaction(sql=>sql('UPDATE push_deliveries SET state=?,due=? WHERE id=?',[item.attempts>=9?'failed':item.state,Date.now()+Math.min(900000,5000*2**item.attempts),id]));
  }
}
