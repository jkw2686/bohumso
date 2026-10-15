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
 const title=add('h2','예약을 놓치지 않도록 알림을 켜주세요');title.id='reservation-push-prompt-title';
 add('p','본인에게 해당하는 예약 요청과 일정 변경·확정·취소 안내를 휴대전화로 받을 수 있어요.');
 add('p','앱 내 예약 알림은 기본 켜짐입니다. 휴대전화 푸시는 권한 허용과 기기 연결이 필요합니다.');
 const status=add('p','알림을 나중에 켜도 예약은 정상적으로 진행됩니다.');status.setAttribute('role','status');
 const enable=add('button','예약 알림 켜기'),later=add('button','나중에');enable.type=later.type='button';enable.className='btn';later.className='btn ghost';
 const close=()=>{dialog.close();dialog.remove();};later.onclick=close;dialog.oncancel=e=>{e.preventDefault();close();};
 if(!pushSupported()||Notification.permission==='denied'){
  status.textContent=pushSupported()?'권한 차단 · 브라우저 설정에서 알림 허용이 필요합니다.':'기기 미지원 · 지원되는 브라우저에서 연결해 주세요.';
  enable.textContent='알림 설정 보기';enable.onclick=()=>location.assign('/notifications.html');
 }else enable.onclick=async()=>{
  enable.disabled=later.disabled=true;status.textContent='권한 확인 후 기기 연결을 저장하고 있습니다.';
  try{const permission=Notification.requestPermission();await enablePush(client,user.id,config.publicKey,permission);status.textContent='푸시 수신 준비 완료 · 이 기기의 구독 저장을 확인했습니다.';enable.hidden=true;later.textContent='닫기';window.dispatchEvent(new Event('bohumso-push-ready'));}
  catch(e){status.textContent=e.message==='permission_blocked'?'알림 권한이 허용되지 않았습니다. 예약은 계속 진행할 수 있습니다.':'기기 연결을 저장하지 못했습니다. 다시 시도하거나 나중에 설정해 주세요.';enable.disabled=false;}
  finally{later.disabled=false;}
 };
 client.auth.onAuthStateChange((_event,session)=>{if(session?.user?.id!==user.id&&dialog.isConnected)close();});
 shown.add(key);try{sessionStorage.setItem(key,'1');}catch{}document.body.append(dialog);dialog.showModal();enable.focus();
}
