const identities=new WeakMap();
const scope='/reservation-push/',localKey='bohumso-reservation-device';
export function deviceState(){let s;try{s=JSON.parse(localStorage.getItem(localKey)||'null');}catch{}if(!s?.id||!s.secret){const bytes=crypto.getRandomValues(new Uint8Array(32));s={id:crypto.randomUUID(),secret:[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('')};saveDevice(s);}return s;}
function saveDevice(state){localStorage.setItem(localKey,JSON.stringify(state));}
export const pushSupported=()=>isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
export async function pushRegistration(){if(!('serviceWorker' in navigator))return null;return (await navigator.serviceWorker.getRegistrations()).find(r=>r.scope===location.origin+scope)||null;}
function message(worker,data){return new Promise((resolve,reject)=>{if(!worker)return reject(Error('worker_unavailable'));const channel=new MessageChannel(),timer=setTimeout(()=>reject(Error('worker_unavailable')),4000);channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data);channel.port1.close();};worker.postMessage(data,[channel.port2]);});}
async function activated(reg){if(reg.active)return reg;await new Promise((resolve,reject)=>{const worker=reg.installing||reg.waiting;if(!worker)return reject(Error('worker_unavailable'));const timer=setTimeout(()=>reject(Error('worker_unavailable')),8000);worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timer);resolve();}if(worker.state==='redundant'){clearTimeout(timer);reject(Error('worker_unavailable'));}});});return reg;}
export async function pushApi(client,operation,extra={}){const d=deviceState(),{data}=await client.auth.getSession(),token=data.session?.access_token;if(!token)throw Error('login_required');const response=await fetch('/api/reservation-push',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({operation,device_id:d.id,device_secret:d.secret,...extra}),signal:AbortSignal.timeout(8000)});const result=await response.json();if(!response.ok)throw Error(result.error||'push_save_failed');return result;}
export async function clearPushBinding(client,{remote=true}={}){const d=deviceState(),reg=await pushRegistration();let cleared=!reg;
 if(reg){try{cleared=(await message(reg.active,{type:'set-binding',binding:null})).saved===true;}catch{}try{const sub=await reg.pushManager.getSubscription();if(!sub||await sub.unsubscribe())cleared=true;}catch{}}
 d.binding=null;d.user=null;saveDevice(d);
 if(remote&&client)try{await pushApi(client,'unregister');}catch{/* Local disarm/unsubscribe protects the device even offline. */}
 if(!cleared)throw Error('push_disconnect_failed');
}
export function installPushIdentityGuard(client){const identity={user:null,epoch:0};identities.set(client,identity);
 const original=client.auth.signOut.bind(client.auth);client.auth.signOut=async(...args)=>{try{identity.epoch++;await clearPushBinding(client);}catch{return {error:Error('예약 알림 기기 연결을 해제하지 못했습니다. 다시 로그아웃해 주세요.')};}return original(...args);};
 client.auth.onAuthStateChange((_event,session)=>{const current=session?.user?.id||null;if(identity.user!==current){identity.epoch++;identity.user=current;}queueMicrotask(()=>{let saved;try{saved=deviceState();}catch{return;}if(saved.user&&saved.user!==identity.user)void clearPushBinding(client,{remote:false}).catch(()=>{});});});
}
export async function enablePush(client,userId,publicKey,permissionPromise){const epoch=identities.get(client)?.epoch;const unchanged=()=>{if(identities.get(client)?.epoch!==epoch)throw Error('account_changed');};const permission=await permissionPromise;unchanged();if(permission!=='granted')throw Error('permission_blocked');
 let pushStage='worker';
 try{
 const reg=await activated(await navigator.serviceWorker.register('/reservation-push-sw.js',{scope}));await message(reg.active,{type:'set-binding',binding:null});
 const raw=publicKey.replace(/-/g,'+').replace(/_/g,'/'),key=Uint8Array.from(atob(raw+'='.repeat((4-raw.length%4)%4)),c=>c.charCodeAt(0));
 pushStage='subscription';
 let subscription=await reg.pushManager.getSubscription();if(!subscription)subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 pushStage='save';
 const binding=crypto.randomUUID(),result=await pushApi(client,'register',{binding,subscription:subscription.toJSON()});if(!result.saved||!result.active||result.binding!==binding)throw Error('push_save_failed');
 const check=await pushApi(client,'status');if(!check.active||check.binding!==binding||!check.enabled)throw Error('push_save_failed');
 unchanged();const current=(await client.auth.getUser()).data?.user?.id;if(current!==userId)throw Error('account_changed');const ack=await message(reg.active,{type:'set-binding',binding});unchanged();if(!ack.saved)throw Error('worker_unavailable');const d=deviceState();d.binding=binding;d.user=userId;saveDevice(d);return check;
 }catch(error){const failure=new Error(error.message);failure.name=error.name;failure.pushStage=pushStage;await clearPushBinding(client).catch(()=>{});throw failure;}
}
export async function currentPushReady(client,userId){if(!pushSupported()||Notification.permission!=='granted')return false;const d=deviceState();if(d.user!==userId||!d.binding)return false;const reg=await pushRegistration();if(!reg||!await reg.pushManager.getSubscription())return false;const status=await pushApi(client,'status');const worker=await message(reg.active,{type:'get-binding'});return !!(status.active&&status.enabled&&status.binding===d.binding&&worker.binding===d.binding);}
