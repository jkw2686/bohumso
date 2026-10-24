import {connectionStatus} from './expert-connection.js';
import {el,kst,states} from './consultation-ui.js';
import {readRpc} from './read-rpc.js';
import {renderInstant,renderServiceArea} from './urgent.js';
import {renderOptionalProfile} from './optional-profile.js';
import {renderPublicContact} from './public-contact.js';
import {renderProfessionApplication} from './profession-onboarding.js';
import {renderEarlyDocuments} from './early-documents.js';
import {mountPromotionBenefit} from './promotion.js';
import {renderAds} from './ad-subscription.js';
import {mountNotificationSettings} from './notification-settings.js';
const url=s=>'/partner.html'+(s?'?screen='+s:'');
const link=(host,text,href)=>{const a=el('a',text,host);a.href=href;return a;};
const verified=p=>p?.status==='APPROVED'&&(p.profession==='tax'?p.registration_status==='VERIFIED'&&p.organization_status==='VERIFIED':p.registration_status==='VERIFIED'||p.organization_status==='VERIFIED');
export async function renderExpertHome({client,host,user,membership,config,message}){
 if(membership.profession==='office'||new URLSearchParams(location.search).get('profession')==='office')return false;
 const params=new URLSearchParams(location.search),legacy={'profile-editor':'profile','consult-settings':'schedule','activity-area':'area','instant-settings':'visit',partnerState:'qualification'};const screen=params.get('screen')||(params.get('edit')==='hours'?'schedule':legacy[location.hash.slice(1)])||'home';if(!params.has('screen')&&screen!=='home')history.replaceState(null,'',url(screen));
 const data=await readRpc(client,'expert_profile_command',{operation:'get'}),p=data.profile;
 
 document.body.classList.add('expert-simple');document.body.dataset.expertScreen=screen;
 const heading=document.querySelector('main>h1');if(heading)heading.hidden=true;
 document.querySelector('.expert-intro')?.remove();
 const saved=[...host.children];host.replaceChildren();
 const head=el('header',undefined,host);head.className='expert-page-heading';
 if(screen!=='home')link(head,'‹ 뒤로',url(screen==='settings'?'':'settings'));
 const titles={home:'전문가 홈',settings:'내 정보·설정',profile:'프로필 수정',schedule:'상담시간·방식',area:'활동지역',contact:'연락처·공개 설정',notifications:'알림 설정',qualification:'자격 확인',visit:'방문·위치 설정',subscription:'구독·무료혜택',registration:'등록정보 수정'};
 el('h1',titles[screen]||'전문가 홈',head);
 if(screen==='home'){const settings=link(head,'⚙',url('settings'));settings.setAttribute('aria-label','내 정보·설정');}
 const root=el('div',undefined,host);root.className='expert-screen-content';
 const status=el('p','',host);status.setAttribute('role','status');
 let current=true;client.auth.onAuthStateChange((event,session)=>{if(event!=='INITIAL_SESSION'&&session?.user?.id!==user.id){current=false;host.replaceChildren();el('p','계정이 변경되었습니다. 다시 로그인해 주세요.',host);}});
 if(screen==='settings'){
 const rows=[['프로필 수정','profile',p?.display_name||'입력 필요'],['상담시간·방식','schedule',p?`${p.start_hour??9}:00–${p.end_hour??18}:00`:'미설정'],['활동지역','area',p?.primary_area||'미설정'],['연락처·공개 설정','contact',''],['알림 설정','notifications',''],['자격 확인','qualification',verified(p)?'확인 완료':p?.status==='VERIFICATION_PENDING'?'심사 중':'확인 필요'],...(p?.profession==='tax'?[]:[['구독·무료혜택','subscription','']])];
 const values=new Map();for(const [name,route,value]of rows){const a=link(root,'',url(route));a.className='expert-setting-row';el('span',name,a);values.set(route,el('small',value+' ›',a));}if(p?.profession==='planner')link(root,'청구 자료실 ›','/claim-resources.html').className='expert-setting-row';const results=await Promise.allSettled([readRpc(client,'expert_public_contact',{operation:'get'}),readRpc(client,'reservation_notification_settings',{operation:'get',payload:{}})]);if(!current)return true;const contact=results[0],notification=results[1];values.get('contact').textContent=contact.status==='fulfilled'?(contact.value.public?'공개 중 ›':'비공개 ›'):'확인 필요 ›';values.get('notifications').textContent=notification.status==='fulfilled'?(notification.value.enabled?'켜짐 ›':'꺼짐 ›'):'확인 필요 ›';return true;
 }
 if(screen==='profile'||screen==='contact'){
 await (screen==='profile'?renderOptionalProfile:renderPublicContact)(client,root,{standalone:true});if(screen==='contact')link(root,'예약 연락처 변경','/phone-verification.html?next='+encodeURIComponent(url('contact'))).className='text-button';
 return true;
 }
 if(screen==='area'){await renderServiceArea(client,root,{standalone:true});for(const b of root.querySelectorAll('button[type=submit]'))b.textContent='저장하기';return true;}
 if(screen==='notifications'){await mountNotificationSettings({client,host:root,user,compact:true});return true;}
 if(screen==='visit'){await renderInstant(client,root,{settingsPage:true});return true;}
 if(screen==='subscription'){await mountPromotionBenefit(client,root);if(p?.profession==='tax'){el('p','세무 상담료는 상담시간·방식에서 안내할 수 있습니다.',root);link(root,'상담료 설정',url('schedule'));}else if(config.paymentsEnabled===false){el('p','현재 결제를 받지 않습니다.',root);el('p','이용료·무료혜택은 운영 안내에 따라 확인해 주세요.',root);link(root,'이용·결제 정책','/payment-policy.html');}else try{await renderAds({client,workspace:'partner',host:root,message,action:async(form,fn)=>{try{await fn();}catch{message('처리하지 못했습니다. 기존 내역을 확인한 뒤 다시 시도해 주세요.');}},compact:true});}catch{el('p','구독 내역을 불러오지 못했습니다. 다시 열어주세요.',root);link(root,'이용·결제 정책','/payment-policy.html');}return true;}
 if(screen==='qualification'){
 el('p',verified(p)?'자격 확인 완료':p?.status==='VERIFICATION_PENDING'?'심사 중':p?.status==='SUSPENDED'?'활동 정지 · 확인 필요':'자격 확인 필요',root);
 if(p){const docs=verified(p)?el('details',undefined,root):root;if(docs!==root)el('summary','제출자료 관리',docs);await renderEarlyDocuments(client,docs,config,message,p.profession);link(root,'등록정보 확인·수정',url('registration'));return true;}
 }
 if(screen==='schedule'||screen==='registration'||screen==='qualification'){
 for(const n of saved)root.append(n);
 if(screen==='schedule')history.replaceState(null,'',url('schedule')+'&edit=hours');
 await renderProfessionApplication({client,config,message});
 root.querySelector('[data-work-link]')?.remove();root.querySelector('[data-application-summary]')?.setAttribute('hidden','');root.querySelector('#partnerDetails')?.setAttribute('hidden','');return true;
 }
 const profile=el('section',undefined,root);profile.className='expert-home-profile';
 let optional=null;try{optional=await readRpc(client,'expert_optional_profile',{operation:'get'});}catch{}
 if(!current)return true;
 window.BohumsoProfile?.avatar(profile,optional||{});
 const identity=el('div',undefined,profile);el('h2',optional?.name||p?.display_name||'내 프로필',identity);el('p',p?.profession==='tax'?'세무사':p?.profession==='planner'?'보험설계사':'등록 전',identity);
 const preview=el('button','상세 보기',identity);preview.type='button';preview.className='text-button';profile.append(preview);preview.onclick=async()=>{preview.disabled=true;try{const catalog=await readRpc(client,'planner_catalog',{area:'',wanted:''});if(!current)return;const published=catalog.planners?.find(x=>x.id===user.id&&!x.is_sample);if(published)window.BohumsoProfile.openDetail(published,{ownProfile:true});else status.textContent='현재 고객 지도에 공개된 프로필이 없습니다. 자격 확인과 지도 표시 설정을 확인해 주세요.';}catch{status.textContent='프로필을 불러오지 못했습니다.';}finally{preview.disabled=false;}};
 profile.style.cursor='pointer';profile.onclick=e=>{if(!e.target.closest('button'))preview.click();};
 if(membership.partner_status!=='approved'){const pending=el('section',undefined,root);el('h2',p?.status==='VERIFICATION_PENDING'?'자격 확인 심사 중':p?.status==='SUSPENDED'?'활동 정지 · 확인 필요':'자격 확인이 필요해요',pending);link(pending,'진행 상태 확인',url('qualification')).className='btn';return true;}
 const activity=el('section',undefined,root);activity.className='expert-home-activity';el('h2','활동 상태',activity);
 const mapRow=el('div',undefined,activity);mapRow.className='expert-toggle-row';el('span','지도에 표시',mapRow);const toggle=el('button','확인 중',mapRow);toggle.type='button';toggle.setAttribute('role','switch');toggle.setAttribute('aria-label','지도에 표시');toggle.disabled=true;
 const mapStatus=el('small','',activity);mapStatus.setAttribute('role','status');let shown=false;
 const paint=v=>{shown=v;toggle.setAttribute('aria-checked',String(v));toggle.textContent=v?'ON':'OFF';};
 try{const v=await readRpc(client,'expert_map_visibility',{operation:'get',enabled:null});if(current){paint(v.enabled);toggle.disabled=!v.can_change;if(!v.can_change)link(activity,'자격 확인 필요 · 확인하기',url('qualification'));}}catch{toggle.textContent='확인 필요';link(activity,'지도 설정 확인하기',url('settings'));}
 toggle.onclick=async()=>{if(toggle.disabled)return;toggle.disabled=true;try{const result=await client.rpc('expert_map_visibility',{operation:'set',enabled:!shown});if(result.error)throw result.error;const v=result.data;if(current){paint(v.enabled);mapStatus.textContent='저장했습니다.';}}catch{mapStatus.textContent='저장하지 못했습니다. 기존 상태를 유지합니다.';}finally{if(current)toggle.disabled=false;}};
 if(membership.partner_status==='approved'&&p?.profession==='planner')await renderInstant(client,activity,{compact:true});
 const reservations=el('section',undefined,root);reservations.className='expert-home-reservations';el('h2','상담 요청',reservations);
 if(membership.partner_status==='approved')try{
 const w=await readRpc(client,'consultation_workspace',{workspace:'partner'});if(!current)return true;
 const rows=w.bookings||[],day=d=>new Date(d).toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'}),today=day(new Date());
 const pending=rows.filter(r=>!r.planner_ok&&['requested','coordinating'].includes(r.state));const upcoming=rows.filter(r=>['confirmed','scheduled'].includes(r.state)).sort((a,b)=>Date.parse(a.preferred_at)-Date.parse(b.preferred_at));
 el('p',`답변 대기 ${pending.length}건`,reservations);
 const next=pending[0]||upcoming.find(r=>Date.parse(r.preferred_at)>=Date.now());if(next){el('p',next.connection_only?connectionStatus(next)+' · 전화로 조율':(states[next.state]||'확인 필요')+' · '+kst(next.preferred_at),reservations);}else el('p','새로운 상담 요청이 없습니다',reservations);
 const all=link(reservations,'전체 보기','/partner-work.html'+(next?'?request='+encodeURIComponent(next.id):''));all.className='btn';
 }catch{el('p','예약을 불러오지 못했습니다.',reservations);link(reservations,'전체 보기','/partner-work.html');}
 else{el('p','새로운 상담 요청이 없습니다',reservations);link(reservations,'자격 확인',url('qualification'));}

 return true;
}
