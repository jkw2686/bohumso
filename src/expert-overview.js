import {mountOfficeManagement} from './office-management.js';
import {readRpc} from './read-rpc.js';
import {mountNotificationSummary} from './notification-settings.js';
import {el,kst,states} from './consultation-ui.js';
const link=(host,text,href)=>{const a=el('a',text,host);a.href=href;a.className='btn ghost';return a;};
export async function mountExpertOverview({client,host,user,membership}){
 if(host.querySelector('[data-expert-overview]'))return;
 const root=el('section',undefined);root.dataset.expertOverview='';root.className='expert-overview';host.prepend(root);
 let changed=false;client.auth.onAuthStateChange((event,session)=>{if(event!=='INITIAL_SESSION'&&session?.user?.id!==user.id){changed=true;root.replaceChildren();el('p','계정이 변경되었습니다. 다시 확인해 주세요.',root);}});
 try{
 const data=await readRpc(client,'expert_profile_command',{operation:'get'});if(changed)return;
 const personal=data.profile,office=data.office_profile,officeMode=new URLSearchParams(location.search).get('profession')==='office'||!personal&&!!office;
 if(personal?.status==='APPROVED'&&office?.status==='APPROVED'){
 const nav=el('nav',undefined,root);nav.className='management-switch';nav.setAttribute('aria-label','관리 업무 선택');
 for(const [text,href,selected]of [['개인 전문가','/partner.html',!officeMode],['보험소 운영','/partner.html?profession=office',officeMode]]){const a=link(nav,text,href);if(selected)a.setAttribute('aria-current','page');}
 }
 const p=officeMode?office:personal;if(!p&&membership.beta_role==='EXPERT'){el('h2','전문가 베타 관리',root);el('p','비공개 베타 참여 · 공개 자격 승인이 아닙니다.',root);}
 if(p){const status=el('section',undefined,root);status.className='management-status';el('h2',officeMode?'보험소 운영':p.profession==='tax'?'세무사 상담 관리':'개인 전문가 관리',status);
 el('p',membership.beta_role==='EXPERT'?'비공개 베타 참여 · 공개 자격 승인과 별개':p.status==='APPROVED'?(officeMode?'보험소 운영 승인 · 개인 전문가 자격과 별개':p.registration_status==='VERIFIED'?'활동 승인 · 등록 확인 완료':'활동 승인 · 등록자격 확인 범위는 등록정보에서 확인'):p.status==='SUSPENDED'?'활동 정지 · 보완사항을 확인해 주세요.':'자격 확인 중 · 등록정보에서 필요한 조치를 확인해 주세요.',status);
 if(officeMode||p.profession==='tax'){
 el('p',(officeMode?'보험소 주소: ':'사무소 주소: ')+(p.address||p.office_address||'확인 필요'),status);
 el('p',officeMode?'고정 사업장 기준 · 휴대전화 위치와 별개':p.office_coordinates_verified?'사무소 좌표 확인 완료 · '+kst(p.office_coordinates_checked_at):'사무소 좌표 확인 필요 · 지도에는 활동지역 중심점으로 표시됩니다.',status);
 if(!officeMode)el('p',`상담 시간: ${p.start_hour??'미설정'}${p.end_hour!=null?'–'+p.end_hour+'시':''}`,status);
 link(status,'주소·자격 확인','/partner.html'+(officeMode?'?profession=office':'')+'#partnerState');
 if(officeMode&&p.status==='APPROVED')await mountOfficeManagement({client,host:status,isCurrent:()=>!changed});
 }else {el('p','공개 활동지역: '+(p.primary_area||'설정 필요'),status);link(status,'활동지역·등록정보 확인','#partnerState');}
 }
 if(changed)return;
 const instant=host.querySelector('[data-instant-settings]');if(instant){if(officeMode){instant.hidden=true;}else if(p?.profession==='tax'){const visits=el('details',undefined,root);el('summary','출장 상담 설정 · 사무소 위치와 별개',visits);visits.append(instant);}else root.append(instant);}
 await mountNotificationSummary({client,host:root,user});if(changed)return;
 link(root,'앱 내 예약 알림','/notifications.html');
 const canWork=membership.partner_status==='approved'&&membership.profession!=='office'&&!officeMode;
 if(canWork){const tasks=el('section',undefined,root);tasks.className='management-tasks';
 try{const workspace=await readRpc(client,'consultation_workspace',{workspace:'partner'});if(changed)return;
 const bookings=workspace.bookings||[],today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'});
 for(const [heading,rows]of [['답변할 요청',bookings.filter(r=>r.state==='requested')],['오늘 예약',bookings.filter(r=>['confirmed','scheduled'].includes(r.state)&&new Date(r.preferred_at).toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'})===today)]]){
 el('h2',heading,tasks);if(!rows.length)el('p','해당 예약이 없습니다.',tasks);
 for(const row of rows){const item=el('div',undefined,tasks);item.className='management-task-row';el('p',(states[row.state]||'상태 확인 필요')+' · '+(row.preferred_at?kst(row.preferred_at):'일정 조율 필요'),item);link(item,'예약 확인','/notifications.html?reservation='+encodeURIComponent(row.id));}
 }
 link(tasks,'전체 요청·예약','/partner-work.html');
 }catch{el('p','요청·예약을 불러오지 못했습니다. 업무 화면에서 다시 확인해 주세요.',tasks);link(tasks,'요청·예약 확인','/partner-work.html');}
 }else if(!officeMode){el('p','업무 요청은 서버의 전문가 승인 조건을 충족한 계정만 확인할 수 있습니다.',root);link(root,'등록·심사 상태 확인','#partnerState');}
 }catch{if(!changed){el('p','관리 상태를 불러오지 못했습니다. 등록정보와 알림 설정에서 다시 확인해 주세요.',root);link(root,'알림 설정','/account.html#notificationSettings');}}
 if(!changed&&!root.querySelector('[data-notification-summary]')){try{await mountNotificationSummary({client,host:root,user});}catch{link(root,'예약 알림 설정','/account.html#notificationSettings');}}
 return root;
}
