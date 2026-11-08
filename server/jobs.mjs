import {Queue,Worker} from 'bullmq';
import Redis from 'ioredis';
import {deliverPush} from './push.mjs';

export async function startJobs(store, onChange){
  const redis=process.env.REDIS_URL ? new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:null}) : null;
  const sub=redis?.duplicate();
  const queue=redis ? new Queue('ayni-push',{connection:redis}) : null;
  const worker=redis ? new Worker('ayni-push',job=>deliverPush(store,job.data.id),{connection:redis,concurrency:4}) : null;
  if(sub){
    sub.on('message',(_,district)=>onChange(district));
    await sub.subscribe('ayni-updates');
  }
  let running=false;
  async function poll(){
    if(running)return;running=true;
    try{
      const due=await store.transaction(sql=>sql("SELECT id FROM push_deliveries WHERE state IN ('pending','receipt') AND due<=? ORDER BY due LIMIT 50",[Date.now()]));
      for(const {id} of due){
        if(queue)await queue.add('deliver',{id},{jobId:id,removeOnComplete:true,removeOnFail:true});
        else await deliverPush(store,id);
      }
    }catch(e){console.error('Cola de avisos:',e.message);}finally{running=false;}
  }
  const timer=setInterval(poll,5000);timer.unref();void poll();
  return {
    notify(district){if(redis)void redis.publish('ayni-updates',district).catch(()=>onChange(district));else onChange(district);},
    async close(){clearInterval(timer);await worker?.close();await queue?.close();sub?.disconnect();redis?.disconnect();}
  };
}
