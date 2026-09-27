// Obtain improving fixes without persisting or sending coordinates to a geocoding service.
export function locateDevice(geo,{signal,timeout=20000,onProgress=()=>{}}={}){
 return new Promise((resolve,reject)=>{let watch,timer,best,done=false;const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);if(watch!==undefined)geo.clearWatch(watch);signal?.removeEventListener('abort',cancel);error?reject(error):resolve(value);};const cancel=()=>finish({code:0,cancelled:true});if(signal?.aborted){cancel();return;}signal?.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>best?finish(null,best):finish({code:3}),timeout);
 try{watch=geo.watchPosition(p=>{const c=p.coords;if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||!Number.isFinite(c.accuracy)||c.accuracy<0)return;if(!best||c.accuracy<best.coords.accuracy)best=p;if(c.accuracy<=500)finish(null,best);else onProgress(c.accuracy);},e=>{if(e.code===1)finish(e);else onProgress(null);},{enableHighAccuracy:true,maximumAge:0,timeout:15000});if(done)geo.clearWatch(watch);}catch(e){finish(e);}
 });
}
