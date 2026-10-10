import {el} from './consultation-ui.js';

export const locationErrors={location_denied:'위치 권한이 꺼져 있습니다. 브라우저에서 허용한 뒤 다시 확인해 주세요.',location_timeout:'위치 확인 시간이 초과됐습니다. 다시 시도해 주세요.',location_unavailable:'현재 위치를 확인하지 못했습니다. 등록한 활동지역은 유지됩니다.'};
export function currentExpertLocation(){return new Promise((resolve,reject)=>{
 if(!navigator.geolocation){reject(Error('location_unavailable'));return;}
 navigator.geolocation.getCurrentPosition(({coords:c})=>{if(!Number.isFinite(c.accuracy)||c.accuracy>3000){reject(Error('location_unavailable'));return;}resolve({latitude:c.latitude,longitude:c.longitude,accuracy:c.accuracy});},e=>reject(Error(e.code===1?'location_denied':e.code===3?'location_timeout':'location_unavailable')),{enableHighAccuracy:true,maximumAge:0,timeout:20000});
});}
export function settingsChanged(){try{localStorage.setItem('bohumso-profile-updated',String(Date.now()));}catch{}window.dispatchEvent(new Event('bohumso-profile-updated'));window.dispatchEvent(new Event('bohumso-settings-updated'));}
const failures={...locationErrors,stale_settings:'다른 화면에서 설정이 바뀌었습니다. 최신 상태를 확인한 뒤 다시 선택해 주세요.',map_hidden:'지도 표시를 먼저 켜 주세요.',expert_verification_required:'전문가 승인·휴대전화 확인·활동지역 설정을 확인해 주세요.',membership_required:'다시 로그인한 뒤 설정을 저장해 주세요.',availability_expired:'방문 가능 시간이 끝났습니다. 위치를 확인하고 다시 켜 주세요.',settings_unconfirmed:'저장 결과를 확인하지 못했습니다. 상태 다시 확인을 눌러 주세요.'};
export async function settingsCall(client,operation='get',payload={}){const r=await client.rpc('expert_settings',{operation,payload});if(r.error)throw r.error;if(!r.data||!Number.isInteger(r.data.revision)||(operation!=='get'&&r.data.saved!==true))throw Error('settings_unconfirmed');return r.data;}

export async function renderExpertSettings(client,parent){
 const card=el('section',undefined,parent);card.className='card expert-presence';card.id='expertPresence';
 el('h2','노출·상담 상태',card);let state=null,busy=false,checking=false,timer,dialog;
 function switchRow(title,on,off){const row=el('div',undefined,card);row.className='setting-row';const copy=el('div',undefined,row);el('strong',title,copy);const label=el('p',off,copy);label.className='setting-value';const b=el('button',undefined,row);b.type='button';b.className='ui-switch';b.setAttribute('role','switch');b.setAttribute('aria-label',title);b.setAttribute('aria-checked','false');b.disabled=true;const thumb=el('span',undefined,b);thumb.setAttribute('aria-hidden','true');return {b,label,on,off};}
 const map=switchRow('지도에 내 프로필 표시','노출 중','숨김'),visit=switchRow('지금 방문 상담 가능','요청 가능','지금 방문 쉬는 중');
 const location=el('p','',card);location.className='setting-help';
 const hint=el('p','지금 방문을 쉬어도 일반 일정 예약은 기존 설정을 따릅니다. 이미 접수한 요청·예약·대화는 유지됩니다.',card);hint.className='setting-help';
 const actions=el('div',undefined,card);actions.className='form-actions';
 const refresh=el('button','현재 위치 갱신',actions);refresh.type='button';refresh.className='btn ghost';
 const reload=el('button','상태 다시 확인',actions);reload.type='button';reload.className='btn ghost';
 const message=el('p','상태를 불러오고 있습니다.',card);message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 function draw(){
  for(const [item,value]of [[map,!!state?.mapVisible],[visit,!!state?.visitAvailable]]){item.b.setAttribute('aria-checked',String(value));item.label.textContent=value?item.on:item.off;}
  // 승인 전에는 본인 선택과 무관하게 지도에 표시되지 않는다(mapVisible=self_map_visible and planner_eligible).
  // 스위치를 누를 수 있게 두면 OFF로 보이는데 '숨길까요?' 확인창이 떠서 표시와 동작이 어긋난다.
  map.b.disabled=busy||checking||!state||!state.eligible;
  // 진행 중 방문이 있으면 새 요청을 받지 않으므로 켜고 끌 대상이 아니다.
  visit.b.disabled=busy||checking||!state||!state.mapVisible||!!state.visitInProgress;
  if(state&&!state.eligible)map.label.textContent='승인 후 지도에 표시됩니다';
  refresh.hidden=!state?.visitEnabled;refresh.disabled=busy||checking;reload.disabled=busy||checking;
  card.setAttribute('aria-busy',String(busy||checking));
  if(!state){location.textContent='';return;}
  const expired=state.locationState==='expired';
  location.textContent=expired?'위치 유효시간이 지났습니다. 현재 위치를 갱신해야 지금 방문 요청을 받을 수 있어요.':state.locationState==='fresh'?'현재 위치 확인 · '+new Date(state.locationUpdatedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})+' · 등록 활동지역과 별도입니다.':'현재 위치를 사용하려면 지금 방문을 켤 때 동의해 주세요.';
  // 같은 'OFF로 보이는' 상태라도 원인이 다르면 다르게 안내한다.
  if(state.visitInProgress)visit.label.textContent='진행 중인 방문이 있어 새 요청을 받지 않습니다';
  else if(state.visitEnabled&&expired)visit.label.textContent='지금 방문 쉬는 중 · 위치 유효시간 만료';
  else if(state.visitEnabled&&!state.visitAvailable)visit.label.textContent='지금 방문 쉬는 중 · 승인 상태 확인 필요';
 }
 async function load(announce=true){if(busy||checking)return;checking=true;draw();try{state=await settingsCall(client);if(announce)message.textContent='서버에 저장된 상태입니다.';}catch(e){state=null;message.textContent=failures[e.message]||'설정에 연결하지 못했습니다. 상태 다시 확인을 눌러 주세요.';}finally{checking=false;draw();}}
 async function change(op,payload){if(busy||!state)return false;busy=true;draw();message.textContent='저장 중…';const previous=state;
  try{state=await settingsCall(client,op,{...payload,revision:state.revision});message.textContent='저장했습니다.';settingsChanged();return true;}
  catch(e){state=previous;try{state=await settingsCall(client);}catch{}message.textContent=failures[e.message]||'저장하지 못했습니다. 현재 저장 상태를 확인하고 다시 시도해 주세요.';return false;}
  finally{busy=false;draw();}
 }
 map.b.onclick=async()=>{if(busy||!state||!state.eligible)return;const enabled=!state.mapEnabled;if(!enabled&&!confirm('지도에서 숨기면 새 요청을 받지 않고 지금 방문 상담도 꺼집니다. 이미 받은 요청·예약·대화는 그대로 진행됩니다.'))return;await change('map',{enabled,confirmed:!enabled});};
 visit.b.onclick=async()=>{
  if(busy||!state||dialog)return;
  if(state.visitInProgress){message.textContent='진행 중인 방문이 있어 새 요청을 받지 않습니다.';return;}
  // 스위치 표시는 visitAvailable 기준이다. visitEnabled 만 보고 분기하면, 위치 유효시간이
  // 끝나 OFF로 보이는 상태에서 누를 때 stop 이 호출돼 표시와 동작이 어긋난다.
  // OFF로 보이면 언제나 '켜기'(동의·위치 확인)로 간다.
  if(state.visitAvailable){await change('visit',{enabled:false});return;}
  dialog=el('dialog',undefined,document.body);dialog.className='card instant-dialog interaction-dialog';dialog.setAttribute('aria-labelledby','visitConsentTitle');el('h2','지금 방문 상담 켜기',dialog).id='visitConsentTitle';
  el('p','현재 위치를 기준으로 방문 요청을 받습니다. 정확한 위치·이동경로는 공개하지 않습니다.',dialog);
  const label=el('label','자동 종료',dialog);label.className='field';const duration=el('select',undefined,label);for(const v of [60,120,240]){const o=el('option',v/60+'시간 뒤',duration);o.value=v;}duration.value=String(state.visitConfig.availabilityMinutes);
  const agreement=el('label',undefined,dialog);agreement.className='consent-row';const consent=el('input',undefined,agreement);consent.type='checkbox';agreement.append('위치 사용 목적을 확인하고 동의합니다.');
  const note=el('p','',dialog);note.setAttribute('role','status');const controls=el('div',undefined,dialog);controls.className='form-actions';
  const close=el('button','취소',controls);close.type='button';close.className='btn ghost';const start=el('button','위치 확인하고 켜기',controls);start.type='button';start.className='btn';let locating=false;
  const finish=()=>{dialog?.close();dialog?.remove();dialog=null;visit.b.focus();};close.onclick=finish;dialog.addEventListener('cancel',e=>{if(locating){e.preventDefault();return;}e.preventDefault();finish();});
  start.onclick=async()=>{if(locating)return;if(!consent.checked){note.textContent='위치 사용에 동의해 주세요.';consent.focus();return;}locating=true;start.disabled=close.disabled=true;duration.disabled=consent.disabled=true;note.textContent='현재 위치를 확인하고 있습니다.';
   try{const point=await currentExpertLocation();if(await change('visit',{enabled:true,consent:true,duration:Number(duration.value),...point}))finish();else note.textContent=message.textContent;}catch(e){note.textContent=failures[e.message]||'위치를 확인하지 못했습니다.';}finally{locating=false;start.disabled=close.disabled=false;duration.disabled=consent.disabled=false;}
  };dialog.showModal();close.focus();
 };
 refresh.onclick=async()=>{if(busy||!state)return;busy=true;draw();message.textContent='현재 위치를 확인하고 있습니다.';try{const point=await currentExpertLocation();busy=false;await change('refresh',point);}catch(e){message.textContent=failures[e.message]||'위치를 확인하지 못했습니다.';}finally{busy=false;draw();}};
 reload.onclick=()=>load();const reloadVisible=()=>{if(card.isConnected&&document.visibilityState==='visible'&&!dialog)load(false);};
 window.addEventListener('focus',reloadVisible);window.addEventListener('bohumso-settings-updated',reloadVisible);document.addEventListener('visibilitychange',reloadVisible);
 timer=setInterval(()=>{if(!card.isConnected){clearInterval(timer);return;}reloadVisible();},30000);
 window.addEventListener('pagehide',()=>{clearInterval(timer);window.removeEventListener('focus',reloadVisible);window.removeEventListener('bohumso-settings-updated',reloadVisible);document.removeEventListener('visibilitychange',reloadVisible);},{once:true});
 await load();return card;
}
