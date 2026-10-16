import {el as baseEl,link as baseLink} from './consultation-ui.js';
import {readRpc as notificationRpc} from './read-rpc.js';
export {notificationRpc};
const el=(tag,text,parent,cls)=>{const n=baseEl(tag,text,parent);if(cls)n.className=cls;return n;};
const link=(parent,text,href)=>{const n=baseLink(parent,text,href);n.className='btn ghost';return n;};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function reservationId(value){try{const url=new URL(value,location.origin);if(url.origin!==location.origin||url.pathname!=='/notifications.html')return null;const id=url.searchParams.get('reservation');return uuid.test(id||'')?id:null;}catch{return null;}}
export async function reservationDestination(client,id){if(!uuid.test(id||''))throw Error('reservation_not_found');const row=await notificationRpc(client,'notification_reservation',{reservation_id:id});if(!['/requests.html','/partner-work.html','/admin-requests.html'].includes(row?.workspace))throw Error('reservation_not_found');return row.workspace+'?request='+encodeURIComponent(id);}
export async function renderNotificationPage({client,root}){
 root.hidden=false;const id=new URLSearchParams(location.search).get('reservation');
 if(id){const section=el('section',undefined,root,'card');el('h2','예약 확인',section);const status=el('p','예약 접근 권한을 확인하고 있습니다.',section);status.setAttribute('role','status');try{location.replace(await reservationDestination(client,id));}catch{status.textContent='이 계정에서 확인할 수 없는 예약이거나 조회하지 못했습니다.';link(section,'다시 확인',location.pathname+location.search);link(section,'내 예약 보기','/requests.html');}return;}
 await mountBookingNotifications({client,host:root,expanded:true});
}
export async function mountBookingNotifications({client,host,expanded=false}){
 if(host.querySelector('[data-booking-notifications]'))return;
 const section=el('section',undefined,host,'card booking-notifications');section.dataset.bookingNotifications='';
 const details=el('details',undefined,section);details.open=expanded;const title=el('summary','예약 알림',details),status=el('p','알림을 확인하고 있습니다.',details),list=el('div',undefined,details);status.setAttribute('role','status');
 const retry=el('button','재시도',details,'btn ghost');retry.type='button';retry.hidden=true;
 let busy=false,generation=0;
 const owner=(await client.auth.getUser()).data?.user?.id;
 client.auth.onAuthStateChange((event,session)=>{if(['SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(event)&&session?.user?.id!==owner){generation++;list.replaceChildren();title.textContent='예약 알림';status.textContent='계정이 변경되었습니다. 다시 확인합니다.';setTimeout(()=>location.reload(),0);}});
 const load=async()=>{if(busy)return;busy=true;retry.disabled=true;const version=++generation;
  try{const preference=notificationRpc(client,'reservation_notification_settings',{operation:'get',payload:{}}).catch(()=>null);const result=await notificationRpc(client,'notification_inbox',{operation:'list'});if(!section.isConnected||version!==generation)return;list.replaceChildren();retry.hidden=true;
   const rows=Array.isArray(result?.items)?result.items:[],caption='예약 알림'+(result?.unread?' · 새 알림 '+result.unread+'건':'');title.textContent=caption;void preference.then(pref=>{if(section.isConnected&&version===generation)title.textContent=pref?.enabled===false?'예약 알림 · 설정 OFF':caption;});status.textContent=rows.length?'조회하거나 예약으로 이동해도 읽음 처리되지 않습니다.':'새로운 알림이 없습니다.';
   for(const n of rows){const card=el('article',undefined,list,'notification-item');el('h3',n.title,card);el('p',n.body,card);if(n.created_at)el('p',new Date(n.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}),card,'muted');el('span',n.read_at?'읽음':'읽음 기록 없음',card);
    const id=reservationId(n.deep_link);if(id){const a=link(card,'해당 예약 확인','/notifications.html?reservation='+encodeURIComponent(id));a.dataset.memberAction='';}
   }
  }catch{if(section.isConnected){status.textContent='알림을 불러오지 못했습니다';retry.hidden=false;}}finally{busy=false;retry.disabled=false;}
 };
 retry.onclick=load;await load();
 const preferenceChanged=()=>{if(section.isConnected)void load();else window.removeEventListener('bohumso-notification-preference',preferenceChanged);};window.addEventListener('bohumso-notification-preference',preferenceChanged);
 const timer=setInterval(()=>{if(!section.isConnected){clearInterval(timer);return;}if(!document.hidden&&details.open)void load();},60000);
 return {refresh:load,section};
}
export function focusBooking(host){const id=new URLSearchParams(location.search).get('request');if(!uuid.test(id||''))return;const card=[...host.querySelectorAll('[data-booking-id]')].find(n=>n.dataset.bookingId===id);if(card){const details=card.querySelector('[data-booking-detail]');if(details)details.open=true;card.tabIndex=-1;requestAnimationFrame(()=>{card.focus({preventScroll:true});card.scrollIntoView({block:'center',behavior:'auto'});});}}
