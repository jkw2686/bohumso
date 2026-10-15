/* Push only. No fetch handler or page cache. Device binding survives closed tabs. */
const database=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('bohumso-reservation-push',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function state(action){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite'),s=tx.objectStore('state');let result;action(s,value=>result=value);tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
const read=key=>state((s,done)=>{const r=s.get(key);r.onsuccess=()=>done(r.result);});
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{event.waitUntil((async()=>{try{const client=event.source?.id?await self.clients.get(event.source.id):null;if(!client||new URL(client.url).origin!==self.location.origin)return;
 if(event.data?.type==='set-binding'){const value=event.data.binding;await state(s=>{s.put(typeof value==='string'?value:null,'binding');s.delete('receipt');});for(const n of await self.registration.getNotifications())if(!value||n.data?.binding!==value)n.close();event.ports[0]?.postMessage({saved:true});}
 else if(event.data?.type==='get-binding')event.ports[0]?.postMessage({binding:await read('binding')||null});
 else if(event.data?.type==='receipt')event.ports[0]?.postMessage({receipt:await read('receipt')||null});
 }catch{event.ports[0]?.postMessage({saved:false});}})());});
self.addEventListener('push',event=>event.waitUntil((async()=>{let data;try{data=event.data.json();}catch{return;}
 const binding=await read('binding');if(!binding||binding!==data.binding||!/^[0-9a-f-]{36}$/i.test(data.id||''))return;
 const fresh=await state((s,done)=>{const r=s.get('seen');r.onsuccess=()=>{const seen=r.result||[];if(seen.includes(data.id)){done(false);return;}s.put([...seen.slice(-127),data.id],'seen');done(true);};});if(!fresh)return;
 if(await read('binding')!==binding)return;
 const url=/^\/notifications\.html(?:\?reservation=[0-9a-f-]{36})?$/.test(data.url||'')?data.url:'/notifications.html';
 await self.registration.showNotification('보험소 예약 알림',{body:String(data.body||'예약 안내가 있어요.').slice(0,160),icon:'/brand/favicon-192.png',badge:'/brand/favicon-32.png',tag:'reservation-'+data.id,renotify:false,data:{id:data.id,binding,url}});
 await state(s=>s.put({id:data.id,at:Date.now()},'receipt'));
})()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{if(await read('binding')!==event.notification.data?.binding)return;const path=event.notification.data.url;if(!/^\/notifications\.html(?:\?reservation=[0-9a-f-]{36})?$/.test(path||''))return;await self.clients.openWindow(new URL(path,self.location.origin).href);})());});
