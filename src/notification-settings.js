import {pushFailureMessage} from './push-feedback.js';
import {readRpc} from './read-rpc.js';
import {pushSupported,currentPushReady,enablePush,clearPushBinding,pushApi} from './reservation-push.js';
const add=(tag,text,parent,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;parent.append(n);return n;};
export const OFF_WARNING=['예약 알림을 끄시겠어요?','새 상담 요청과 예약 변경·취소 안내를 알림으로 받지 못합니다.','예약 진행 상황은 내 예약에서 직접 확인해야 합니다.'];
export const PUSH_OFF_WARNING=['이 기기의 예약 알림을 끄시겠어요?','기기 알림을 끄면 이 기기에서 예약 소식을 푸시로 받지 못합니다.','앱 내 알림과 예약 내역은 그대로 확인할 수 있습니다. 다른 기기의 알림 설정은 유지됩니다.'];
function confirmOff(lines=OFF_WARNING){return new Promise(resolve=>{const d=document.createElement('dialog');d.className='notification-off-dialog';d.setAttribute('aria-labelledby','notification-off-title');lines.forEach((text,i)=>{const n=add(i?'p':'h2',text,d);if(!i)n.id='notification-off-title';});const finish=value=>{d.close();d.remove();resolve(value);};const keep=add('button','알림 유지하기',d,'btn');keep.type='button';keep.onclick=()=>finish(false);const off=add('button','끄기',d,'btn ghost');off.type='button';off.onclick=()=>finish(true);d.oncancel=e=>{e.preventDefault();finish(false);};document.body.append(d);d.showModal();keep.focus();});}
export async function mountNotificationSettings({client,host,user,compact=false}){
 if(host.querySelector('[data-notification-settings]'))return;
 const root=add('section','',host,'card notification-settings');root.id='notificationSettings';root.dataset.notificationSettings='';add('h2',compact?'휴대전화 알림':'예약 알림',root);if(compact)root.classList.add('notification-settings-inline');
 const app=add('p','앱 내 예약 알림을 확인하고 있습니다.',root),status=add('p','기기 연결 상태를 확인하고 있습니다.',root);status.setAttribute('role','status');
 const toggle=add('button','예약 알림 끄기',root,'btn ghost'),enable=add('button','예약 알림 켜기',root,'btn'),retry=add('button','설정 다시 확인',root,'btn ghost');for(const b of [toggle,enable,retry])b.type='button';
 const test=add('button','이 기기로 시험 알림 받기',root,'btn ghost');test.type='button';test.disabled=true;
 const disconnect=add('button','이 기기 푸시만 끄기',root,'btn ghost');disconnect.type='button';disconnect.hidden=true;
 const note=add('p','알림을 꺼도 내 예약과 기존 알림 내역은 유지됩니다. 상담 가능 설정과 별개입니다.',root,'muted');
 add('p','예약 알림 끄기는 계정의 새 앱 내 알림과 푸시를 함께 끕니다. 이 기기 푸시만 끄기는 앱 내 알림을 유지하고 이 기기의 연결만 해제합니다.',root,'muted');
 const guide=add('details','',root,'supporting-details');add('summary','기기별 알림 설정 방법',guide);
 add('p','푸시는 지금 사용하는 기기에 연결됩니다. 휴대전화 알림은 해당 휴대전화에서 켜주세요.',guide,'muted');
 add('p','iPhone·iPad는 지원되는 iOS·iPadOS에서 홈 화면에 추가한 보험소를 열어 알림을 켜주세요.',guide,'muted');
 guide.append(note);for(const n of [...root.children])if(n.tagName==='P'&&n!==app&&n!==status)guide.append(n);add('p','Android는 Chrome에서 사이트를 열고 로그인한 뒤 알림을 허용하세요. iPhone은 iOS 16.4 이상에서 Safari로 사이트를 열고 공유 → 홈 화면에 추가한 뒤 그 아이콘으로 다시 열어주세요.',guide);add('p','다른 브라우저에서는 같은 구글 계정으로 다시 로그인해야 합니다. 로그인 정보는 링크로 전달하지 않습니다.',guide);const address=add('a','보험소 열기',guide);address.href=location.origin+'/account.html#notificationSettings';add('p','알림이 차단됐다면 브라우저 사이트 설정과 휴대전화 알림 설정에서 허용한 뒤 설정 다시 확인을 눌러주세요.',guide);
 if(compact){guide.append(toggle,retry,disconnect);test.className='btn';}
 let enabled=true,saved=false,ready=false,busy=true,config={enabled:false},accountChanged=false;
 const rpc=async(operation,payload={})=>{if(operation==='get')return readRpc(client,'reservation_notification_settings',{operation,payload});const r=await client.rpc('reservation_notification_settings',{operation,payload});if(r.error)throw r.error;return r.data;};
 const updateControls=()=>{if(compact){if(enabled)guide.append(toggle);else root.insertBefore(toggle,enable);toggle.className=enabled?'btn ghost':'btn';test.hidden=!ready;}enable.hidden=(compact&&ready)||!pushSupported()||Notification.permission==='denied'||!enabled;guide.querySelector('summary').textContent=!pushSupported()?'지원 브라우저에서 여는 방법':Notification.permission==='denied'?'방법 보기':'알림 관리·도움말';disconnect.hidden=!ready;disconnect.disabled=busy||accountChanged;test.disabled=busy||!ready||accountChanged;toggle.disabled=busy||!saved||accountChanged;enable.disabled=busy||ready||!saved||!enabled||!config.enabled||!pushSupported()||Notification.permission==='denied'||accountChanged;enable.textContent=ready?'이 기기 연결 완료':'예약 알림 켜기';retry.disabled=busy||accountChanged;toggle.textContent=enabled?'예약 알림 끄기':'앱 내 예약 알림 다시 켜기';};
 const load=async()=>{
  saved=false;ready=false;app.textContent='앱 내 예약 알림을 확인하고 있습니다.';status.textContent='기기 연결 상태를 확인하고 있습니다.';updateControls();
  try{const result=await rpc('get');if(accountChanged)return;enabled=result.enabled!==false;saved=result.saved===true;app.textContent='앱 내 예약 알림: '+(enabled?'켜짐':'OFF · 다시 켜면 새 예약 안내를 확인할 수 있어요.');}
  catch{if(accountChanged)return;saved=false;app.textContent='예약 알림 설정을 불러오지 못했습니다. 기존 설정은 유지됩니다. 설정 다시 확인을 눌러주세요.';status.textContent='알림 설정 미확인 · 푸시 수신 준비 상태를 확인하지 못했습니다.';updateControls();return;}
  try{const r=await fetch('/api/reservation-push',{cache:'no-store',signal:AbortSignal.timeout(8000)});config=r.ok?await r.json():{enabled:false};}catch{config={enabled:false};}
  if(accountChanged)return;
  ready=false;
  if(!enabled)status.textContent='예약 알림 설정 OFF · 푸시를 받지 않습니다.';
  else if(!pushSupported())status.textContent='이 브라우저에서는 휴대전화 알림을 받을 수 없어요.';
  else if(Notification.permission==='denied')status.textContent='브라우저에서 알림 허용이 필요해요.';
  else if(!config.enabled)status.textContent='푸시 서버 연결 전 · 아직 수신 준비 완료가 아닙니다.';
  else{try{ready=await currentPushReady(client,user.id);status.textContent=ready?'이 기기에서 예약 알림을 받을 수 있어요. 구독 저장 확인 · 실제 도착은 별도 확인이 필요해요.':'예약 알림을 켜주세요.';}catch{status.textContent='구독 저장 상태를 확인하지 못했습니다. 다시 확인해 주세요.';}}
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
 const root=add('section','',host,'notification-summary');root.dataset.notificationSummary='';const heading=host.querySelector('.booking-list-heading,.work-heading');if(heading)heading.after(root);
 const status=add('span','예약 알림 확인 중',root);status.setAttribute('role','status');const settings=add('a','알림 설정',root);settings.href='/account.html#notificationSettings';let changed=false;
 client.auth.onAuthStateChange((_event,session)=>{if(session?.user?.id!==user.id){changed=true;status.textContent='로그인 계정 확인 필요';}});
 try{const pref=await readRpc(client,'reservation_notification_settings',{operation:'get',payload:{}});if(changed)return;if(typeof pref?.enabled!=='boolean')throw Error('unknown');status.textContent=pref.enabled?'앱 내 알림 켜짐':'예약 알림 꺼짐';if(!pushSupported())status.textContent+=' · 이 브라우저 푸시 미지원';else if(Notification.permission==='denied')status.textContent+=' · 기기 권한 차단';else if(pref.enabled){const ready=await currentPushReady(client,user.id);if(!changed)status.textContent+=ready?' · 기기 구독 저장됨':' · 기기 연결 필요';}}
 catch{if(!changed)status.textContent='알림 상태 확인 필요';}return root;
}
