import {bindingStore} from './push-binding.js';
export class PushProvider {
 constructor(client,config){this.client=client;this.config=config;}
 async call(operation,payload={}){const {data}=await this.client.auth.getSession();if(!data.session)throw Error('login_required');const r=await fetch('/api/push/device',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({operation,...payload})});if(!r.ok)throw Error('push_registration_failed');return r.json();}
 async registerDevice(){if(!this.config.pushNotificationsEnabled||!this.config.firebase)return {enabled:false,reason:'provider_not_configured'};const sdk=await import('/assets/firebase.js');if(!await sdk.isSupported())return {enabled:false,reason:'unsupported'};if(await Notification.requestPermission()!=='granted')return {enabled:false,reason:'denied'};const {data}=await this.client.auth.getUser();if(!data.user)throw Error('login_required');const registration=await navigator.serviceWorker.register('/notification-sw.js',{scope:'/'});await navigator.serviceWorker.ready;const messaging=sdk.messaging(this.config.firebase.web);const token=await sdk.getToken(messaging,{vapidKey:this.config.firebase.vapidKey,serviceWorkerRegistration:registration});if(!token)throw Error('push_token_missing');const deviceId=localStorage.getItem('bohumso-push-device')||crypto.randomUUID(),binding=crypto.randomUUID();await bindingStore(null);await this.call('register',{token,deviceId,binding});localStorage.setItem('bohumso-push-device',deviceId);localStorage.setItem('bohumso-push-user',data.user.id);localStorage.setItem('bohumso-push-refreshed',String(Date.now()));await bindingStore(binding);this.listen(sdk,messaging);return {enabled:true};}
 listen(sdk,messaging){if(this.unsubscribe)this.unsubscribe();this.unsubscribe=sdk.onMessage(messaging,async message=>{if(!message.data?.binding||message.data.binding!==await bindingStore())return;window.dispatchEvent(new Event('bohumso-push-received'));});}
 async refreshToken(){if(!('Notification' in window)||Notification.permission!=='granted')return {enabled:false};return this.registerDevice();}
 async sendPush(){return {sent:false,reason:'server_only'};}
 async disableToken(){return this.unregisterDevice();}
 async unregisterDevice(){
  const id=localStorage.getItem('bohumso-push-device');
  await bindingStore(null);
  this.unsubscribe?.();
  localStorage.removeItem('bohumso-push-user');
  if(!id)return;
  try {
   const registration=await navigator.serviceWorker?.getRegistration('/');
   for(const n of await registration?.getNotifications()||[])n.close();
   const subscription=await registration?.pushManager?.getSubscription();
   await subscription?.unsubscribe();
   if(this.config.firebase){const sdk=await import('/assets/firebase.js');await sdk.deleteToken(sdk.messaging(this.config.firebase.web));}
  }catch{/* Local binding was already cleared; no previous-account notification can display. */}
  try{await this.call('unregister',{deviceId:id});localStorage.removeItem('bohumso-push-device');}
  catch{/* Keep the device ID so next registration revokes the previous server binding. */}
 }
}
export async function setupPush(client,config){const provider=new PushProvider(client,config);const {data}=await client.auth.getUser();const owner=localStorage.getItem('bohumso-push-user');if(owner&&owner!==data.user?.id)await bindingStore(null);client.auth.onAuthStateChange((_event,session)=>{if(localStorage.getItem('bohumso-push-user')!==session?.user?.id)void bindingStore(null).catch(()=>{});});if(!config.pushNotificationsEnabled)return;if(owner===data.user?.id&&'Notification' in window&&Notification.permission==='granted'){const sdk=await import('/assets/firebase.js');if(await sdk.isSupported())provider.listen(sdk,sdk.messaging(config.firebase.web));if(Date.now()-Number(localStorage.getItem('bohumso-push-refreshed')||0)>86400000)void provider.refreshToken().catch(()=>{});}const show=()=>{if(document.querySelector('[data-push-prompt]'))return;const box=document.createElement('aside');box.dataset.pushPrompt='';box.className='card push-prompt';const title=document.createElement('p');title.textContent='예약 진행상황을 바로 알려드릴까요?';const yes=document.createElement('button');yes.textContent='알림 받기';const later=document.createElement('button');later.textContent='나중에';yes.onclick=async()=>{yes.disabled=true;try{const r=await provider.registerDevice();title.textContent=r.enabled?'예약 알림을 받을 준비가 됐어요.':'알림이 꺼져 있어요. 내 예약에서 진행상황을 확인할 수 있습니다.';}catch{title.textContent='알림을 연결하지 못했어요. 알림함은 계속 사용할 수 있습니다.';}finally{yes.disabled=false;}};later.onclick=()=>box.remove();box.append(title,yes,later);(document.querySelector('main')||document.body).append(box);};window.addEventListener('bohumso-reservation-created',show);if(document.querySelector('[data-notification-center]'))show();}
