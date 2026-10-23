import {readRpc} from './read-rpc.js';
import {reservationId} from './booking-notifications.js';
// Foreground only. No permission prompt, read marking, push send, or reservation write.
export async function mountForegroundNotice({client,host,user}){
 if(!user?.id||host.querySelector('[data-foreground-notice]'))return;
 const root=document.createElement('aside');root.dataset.foregroundNotice='';root.className='foreground-notice';root.hidden=true;root.setAttribute('aria-live','polite');host.prepend(root);
 const key='bohumso-seen-notices:'+user.id;let seen=new Set();try{seen=new Set(JSON.parse(sessionStorage.getItem(key)||'[]'));}catch{}
 let busy=false,stopped=false,initialized=false,generation=0;const save=()=>{try{sessionStorage.setItem(key,JSON.stringify([...seen].slice(-300)));}catch{}};
 const poll=async()=>{if(busy||stopped||document.hidden||!root.isConnected)return;busy=true;const version=generation;try{
  const pref=await readRpc(client,'reservation_notification_settings',{operation:'get',payload:{}});if(stopped||version!==generation)return;if(pref?.enabled!==true){root.hidden=true;return;}
  const result=await readRpc(client,'notification_inbox',{operation:'list'});if(stopped||version!==generation)return;const rows=Array.isArray(result?.items)?result.items:[];
  const fresh=rows.filter(n=>n.id&&!seen.has(n.id)&&!n.read_at&&reservationId(n.deep_link));rows.forEach(n=>{if(n.id)seen.add(n.id);});save();
  // Old inbox history is not a new arrival when opening a page.
  if(!initialized){initialized=true;return;}if(!fresh.length)return;
  const n=fresh[0];root.replaceChildren();const text=document.createElement('span');text.textContent='새 예약 알림이 있어요.';const link=document.createElement('a');link.textContent='요청 확인';link.href='/notifications.html?reservation='+encodeURIComponent(reservationId(n.deep_link));const close=document.createElement('button');close.type='button';close.textContent='닫기';close.onclick=()=>root.hidden=true;root.append(text,link,close);root.hidden=false;
 }catch{/* An unavailable inbox does not alter reservations or settings. */}finally{busy=false;}};
 const timer=setInterval(poll,30000);const stop=()=>{stopped=true;clearInterval(timer);root.replaceChildren();root.hidden=true;};
 client.auth.onAuthStateChange((_event,session)=>{if(session?.user?.id!==user.id)stop();});
 const preference=()=>{generation++;root.hidden=true;void poll();};window.addEventListener('bohumso-notification-preference',preference);window.addEventListener('pagehide',stop,{once:true});document.addEventListener('visibilitychange',()=>void poll());await poll();return {poll,stop};
}
