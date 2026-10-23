import {pushFailureMessage} from './push-feedback.js';
import {pushSupported,currentPushReady,enablePush} from './reservation-push.js';
const pending=new Map(),shown=new Set();
export function maybePromptReservationPush({client,user,context='app'}){
 const key='bohumso-push-prompt:'+context+':'+user?.id;if(!user?.id)return Promise.resolve();
 if(pending.has(key))return pending.get(key);
 const work=show({client,user,key}).catch(()=>{}).finally(()=>pending.delete(key));pending.set(key,work);return work;
}
async function show({client,user,key}){
 if(shown.has(key))return;try{if(sessionStorage.getItem(key))return;}catch{}
 const pref=await client.rpc('reservation_notification_settings',{operation:'get',payload:{}});if(pref.error||pref.data?.enabled===false)return;
 const response=await fetch('/api/reservation-push',{cache:'no-store'});if(!response.ok)return;const config=await response.json();if(!config.enabled)return;
 if(await currentPushReady(client,user.id))return;
 if((await client.auth.getUser()).data?.user?.id!==user.id||document.querySelector('dialog[open]'))return;
 const dialog=document.createElement('dialog');dialog.className='reservation-notification-dialog';dialog.dataset.reservationNotificationPrompt='';dialog.setAttribute('aria-labelledby','reservation-push-prompt-title');
 const add=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;dialog.append(n);return n;};
 const title=add('h2','예약 알림을 켜주세요');title.id='reservation-push-prompt-title';
 add('p','이 기기에서 새 요청과 일정 변경을 알려드려요.');

 const status=add('p','알림을 나중에 켜도 예약은 정상적으로 진행됩니다.');status.setAttribute('role','status');
 const enable=add('button','예약 알림 켜기'),later=add('button','나중에');enable.type=later.type='button';enable.className='btn';later.className='btn ghost';
 const close=()=>{dialog.close();dialog.remove();};later.onclick=close;dialog.oncancel=e=>{e.preventDefault();close();};
 if(!pushSupported()||Notification.permission==='denied'){
  status.textContent=pushSupported()?'브라우저에서 알림 허용이 필요해요.':'이 브라우저에서는 휴대전화 알림을 받을 수 없어요.';
  enable.textContent=pushSupported()?'방법 보기':'지원 브라우저에서 여는 방법';enable.onclick=()=>location.assign('/account.html#notificationSettings');
 }else enable.onclick=async()=>{
  enable.disabled=later.disabled=true;status.textContent='권한 확인 후 기기 연결을 저장하고 있습니다.';
  try{const permission=Notification.requestPermission();await enablePush(client,user.id,config.publicKey,permission);status.textContent='이 기기의 구독을 저장했어요. 실제 알림 도착은 아직 확인되지 않았어요.';enable.hidden=true;later.textContent='닫기';window.dispatchEvent(new Event('bohumso-push-ready'));}
  catch(e){status.textContent=pushFailureMessage(e)+' 예약은 계속 진행할 수 있습니다.';enable.disabled=false;}
  finally{later.disabled=false;}
 };
 client.auth.onAuthStateChange((_event,session)=>{if(session?.user?.id!==user.id&&dialog.isConnected)close();});
 shown.add(key);try{sessionStorage.setItem(key,'1');}catch{}document.body.append(dialog);dialog.showModal();enable.focus();
}
