import {pushFailureMessage} from './push-feedback.js';
import {readRpc} from './read-rpc.js';
import {pushSupported,currentPushReady,enablePush,clearPushBinding,pushApi} from './reservation-push.js';
const add=(tag,text,parent,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;parent.append(n);return n;};
export const OFF_WARNING=['예약 알림을 끄시겠어요?','새 상담 요청과 예약 변경·취소 안내를 알림으로 받지 못합니다.','예약 진행 상황은 내 예약에서 직접 확인해야 합니다.'];
export const PUSH_OFF_WARNING=['이 기기의 예약 알림을 끄시겠어요?','기기 알림을 끄면 이 기기에서 예약 소식을 푸시로 받지 못합니다.','앱 내 알림과 예약 내역은 그대로 확인할 수 있습니다. 다른 기기의 알림 설정은 유지됩니다.'];
function confirmOff(lines=OFF_WARNING){return new Promise(resolve=>{const d=document.createElement('dialog');d.className='notification-off-dialog';d.setAttribute('aria-labelledby','notification-off-title');lines.forEach((text,i)=>{const n=add(i?'p':'h2',text,d);if(!i)n.id='notification-off-title';});const finish=value=>{d.close();d.remove();resolve(value);};const keep=add('button','알림 유지하기',d,'btn');keep.type='button';keep.onclick=()=>finish(false);const off=add('button','끄기',d,'btn ghost');off.type='button';off.onclick=()=>finish(true);d.oncancel=e=>{e.preventDefault();finish(false);};document.body.append(d);d.showModal();keep.focus();});}
export async function mountNotificationSettings({client,host,user}){
 if(host.querySelector('[data-notification-settings]'))return;
 const root=add('section','',host,'card notification-settings');root.id='notificationSettings';root.dataset.notificationSettings='';add('h2','예약 알림 설정',root);add('p','예약을 놓치지 않도록 알림을 켜주세요',root);
 const app=add('p','앱 내 예약 알림을 확인하고 있습니다.',root),status=add('p','기기 연결 상태를 확인하고 있습니다.',root);status.setAttribute('role','status');
 const toggle=add('button','예약 알림 끄기',root,'btn ghost'),enable=add('button','예약 알림 켜기',root,'btn'),retry=add('button','설정 다시 확인',root,'btn ghost');for(const b of [toggle,enable,retry])b.type='button';
 const test=add('button','이 기기로 시험 알림 받기',root,'btn ghost');test.type='button';test.disabled=true;
 const disconnect=add('button','이 기기 푸시만 끄기',root,'btn ghost');disconnect.type='button';disconnect.hidden=true;
 const note=add('p','알림을 꺼도 내 예약과 기존 알림 내역은 유지됩니다. 상담 가능 설정과 별개입니다.',root,'muted');
 add('p','예약 알림 끄기는 계정의 새 앱 내 알림과 푸시를 함께 끕니다. 이 기기 푸시만 끄기는 앱 내 알림을 유지하고 이 기기의 연결만 해제합니다.',root,'muted');
 const guide=add('details','',root,'supporting-details');add('summary','기기별 알림 설정 방법',guide);
 add('p','푸시는 지금 사용하는 기기에 연결됩니다. 휴대전화 알림은 해당 휴대전화에서 켜주세요.',guide,'muted');
 add('p','iPhone·iPad는 지원되는 iOS·iPadOS에서 홈 화면에 추가한 보험소를 열어 알림을 켜주세요.',guide,'muted');
 let enabled=true,saved=false,ready=false,busy=true,config={enabled:false},accountChanged=false;
 const rpc=async(operation,payload={})=>{if(operation==='get')return readRpc(client,'reservation_notification_settings',{operation,payload});const r=await client.rpc('reservation_notification_settings',{operation,payload});if(r.error)throw r.error;return r.data;};
 const updateControls=()=>{disconnect.hidden=!ready;disconnect.disabled=busy||accountChanged;test.disabled=busy||!ready||accountChanged;toggle.disabled=busy||!saved||accountChanged;enable.disabled=busy||ready||!saved||!enabled||!config.enabled||!pushSupported()||Notification.permission==='denied'||accountChanged;enable.textContent=ready?'이 기기 연결 완료':'예약 알림 켜기';retry.disabled=busy||accountChanged;toggle.textContent=enabled?'예약 알림 끄기':'앱 내 예약 알림 다시 켜기';};
 const load=async()=>{
  saved=false;ready=false;app.textContent='앱 내 예약 알림을 확인하고 있습니다.';status.textContent='기기 연결 상태를 확인하고 있습니다.';updateControls();
  try{const result=await rpc('get');if(accountChanged)return;enabled=result.enabled!==false;saved=result.saved===true;app.textContent='앱 내 예약 알림: '+(enabled?'켜짐':'OFF · 다시 켜면 새 예약 안내를 확인할 수 있어요.');}
  catch{if(accountChanged)return;saved=false;app.textContent='예약 알림 설정을 불러오지 못했습니다. 기존 설정은 유지됩니다. 설정 다시 확인을 눌러주세요.';status.textContent='알림 설정 미확인 · 푸시 수신 준비 상태를 확인하지 못했습니다.';updateControls();return;}
  try{const r=await fetch('/api/reservation-push',{cache:'no-store',signal:AbortSignal.timeout(8000)});config=r.ok?await r.json():{enabled:false};}catch{config={enabled:false};}
  if(accountChanged)return;
  ready=false;
  if(!enabled)status.textContent='예약 알림 설정 OFF · 푸시를 받지 않습니다.';
  else if(!pushSupported())status.textContent='기기 미지원 · 이 브라우저는 웹 푸시를 지원하지 않습니다. 내 예약과 앱 내 알림은 이용할 수 있어요.';
  else if(Notification.permission==='denied')status.textContent='권한 차단 · 브라우저 설정에서 알림을 허용한 뒤 다시 켜주세요.';
  else if(!config.enabled)status.textContent='푸시 서버 연결 전 · 아직 수신 준비 완료가 아닙니다.';
  else{try{ready=await currentPushReady(client,user.id);status.textContent=ready?'푸시 수신 준비 완료 · 로그인 계정과 이 기기의 구독 저장을 확인했습니다.':'휴대전화 알림 연결 필요 · 이 기기에서 예약 알림 켜기를 눌러 권한과 구독 저장을 완료해 주세요.';}catch{status.textContent='구독 저장 상태를 확인하지 못했습니다. 다시 확인해 주세요.';}}
  updateControls();
 };
 const run=async fn=>{if(busy||accountChanged)return;busy=true;updateControls();try{await fn();}catch(e){status.textContent=pushFailureMessage(e);}finally{busy=false;updateControls();}};
 toggle.onclick=()=>run(async()=>{if(enabled&&!await confirmOff())return;if(accountChanged)return;const next=!enabled;const result=await rpc('set',{enabled:next});if(result.enabled!==next)throw Error('save_failed');enabled=next;if(!next)await clearPushBinding(client);await load();window.dispatchEvent(new Event('bohumso-notification-preference'));});
 disconnect.onclick=()=>run(async()=>{if(!await confirmOff(PUSH_OFF_WARNING)||accountChanged)return;status.textContent='이 기기의 푸시 연결을 해제하고 있습니다.';await clearPushBinding(client);await load();if(!accountChanged)enable.focus();});
 enable.onclick=()=>run(async()=>{const permission=Notification.requestPermission();status.textContent='권한 확인 후 기기 구독을 저장하고 있습니다.';await enablePush(client,user.id,config.publicKey,permission);await load();});
 test.onclick=()=>run(async()=>{if(!confirm('현재 로그인 계정의 이 기기에만 시험 알림 1회를 보냅니다. 실제 예약은 생성하지 않습니다.'))return;const result=await pushApi(client,'test',{request_key:crypto.randomUUID()});if(!result.queued)throw Error('test_failed');status.textContent='시험 알림 발송 대기 · 실제 도착 여부를 기기에서 확인해 주세요.';});
 retry.onclick=()=>run(load);
 client.auth.onAuthStateChange((event,session)=>{if(['SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(event)&&session?.user?.id!==user.id){accountChanged=true;status.textContent='계정이 변경되었습니다. 다시 로그인해 알림 설정을 확인해 주세요.';updateControls();}});
 try{await load();}finally{busy=false;updateControls();}if(location.hash==='#notificationSettings'){root.tabIndex=-1;root.focus({preventScroll:true});root.scrollIntoView({block:'start'});}return root;
}
export async function mountNotificationSummary({client,host,user}){
 if(host.querySelector('[data-notification-summary]'))return;
 const root=add('section','',host,'notification-summary');root.dataset.notificationSummary='';
 const status=add('p','기기 알림 확인 필요 · 상태를 확인하고 있습니다.',root);status.setAttribute('role','status');
 const settings=add('a','알림 설정',root,'btn ghost');settings.href='/account.html#notificationSettings';
 let changed=false;client.auth.onAuthStateChange((event,session)=>{if(['SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(event)&&session?.user?.id!==user.id){changed=true;status.textContent='기기 알림 확인 필요 · 로그인 계정이 변경되었습니다.';}});
 try{const preference=await readRpc(client,'reservation_notification_settings',{operation:'get',payload:{}});if(changed)return;if(typeof preference?.enabled!=='boolean')throw Error('settings_unknown');
 if(preference?.enabled===false)status.textContent='기기 알림 꺼짐 · 예약 알림 설정이 OFF입니다. 내 예약과 기존 알림 내역은 확인할 수 있어요.';
 else if(!pushSupported())status.textContent='기기 알림 확인 필요 · 이 브라우저는 웹 푸시를 지원하지 않습니다.';
 else if(Notification.permission!=='granted')status.textContent='기기 알림 꺼짐 · 예약 소식을 놓칠 수 있어요. 앱 내 알림과 예약 내역에서 확인할 수 있습니다.';
 else {const ready=await currentPushReady(client,user.id);if(!changed)status.textContent=ready?'기기 알림 켜짐 · 이 계정과 기기의 구독 저장을 확인했습니다.':'기기 알림 꺼짐 · 예약 소식을 놓칠 수 있어요. 알림 설정에서 이 기기를 연결해 주세요.';}
 }catch{if(!changed)status.textContent='기기 알림 확인 필요 · 상태를 불러오지 못했습니다. 알림 설정에서 다시 확인해 주세요.';}
 return root;
}
