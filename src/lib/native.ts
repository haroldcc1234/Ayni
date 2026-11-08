interface Reply { id:string; token?:string; lat?:number; lng?:number; error?:string }
type HostWindow = Window & {ReactNativeWebView?:{postMessage(message:string):void}};
export const mobileBridge=()=> (window as HostWindow).ReactNativeWebView;
export function nativeRequest(type:'push'|'location'):Promise<Reply>{
  return new Promise((resolve,reject)=>{
    const host=mobileBridge();
    if(!host){reject(new Error('Abre la aplicación móvil.'));return;}
    const id=crypto.randomUUID();
    function finish(reply:Reply){
      clearTimeout(timer);window.removeEventListener('ayni-native',receive);
      if(reply.error)reject(new Error(reply.error));else resolve(reply);
    }
    function receive(event:Event){const reply=(event as CustomEvent<Reply>).detail;if(reply?.id===id)finish(reply);}
    const timer=window.setTimeout(()=>finish({id,error:'No recibimos respuesta del teléfono. Reintenta.'}),60000);
    window.addEventListener('ayni-native',receive);
    host.postMessage(JSON.stringify({type,id}));
  });
}
