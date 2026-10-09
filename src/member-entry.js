// Recover canonical email callbacks that arrive at the site root. Never log the code.
if(location.pathname==='/'&&new URLSearchParams(location.search).has('code'))location.replace('/account.html'+location.search+location.hash);
import {trackEvent,memberService,memberState,requireActiveMember,MEMBER,authURL} from './member-access.js';
const header=document.querySelector('[data-member-header]');
function expertEntry(){if(!header||header.querySelector('.expert-header-entry'))return;const a=document.createElement('a');a.href='/partner.html?roleIntent=expert';a.className='expert-header-entry';a.textContent='전문가로 참여하기';header.append(a);}
expertEntry();
let busy=false;
function notice(text){let n=document.getElementById('memberGateNotice');if(!n){n=document.createElement('p');n.id='memberGateNotice';n.setAttribute('role','alert');n.className='member-gate-notice';document.querySelector('main')?.prepend(n);}n.textContent=text;}
// Capture includes dynamically rendered map cards and the shared bottom navigation.
document.addEventListener('click',async event=>{
 const link=event.target.closest('a[href]');if(!link||event.defaultPrevented)return;const url=new URL(link.href,location.href);if(url.origin!==location.origin)return;
 if(!link.hasAttribute('data-member-action')&&!/^\/(requests|consult|account|partner-work|admin-requests|admin|partner)(\.html)?$/.test(url.pathname))return;
 event.preventDefault();if(busy)return;busy=true;link.setAttribute('aria-busy','true');
 try{const next=link.dataset.memberNext||url.pathname+url.search+url.hash;if(await requireActiveMember({next}))location.assign(next);}catch{notice('연결을 확인하지 못했어요. 잠시 후 다시 눌러 주세요.');}finally{busy=false;link.removeAttribute('aria-busy');}
});
if(header){(async()=>{try{const {client,config}=await memberService();const serviceNotice=document.querySelector('[data-home-service-status]');if(serviceNotice&&config.serviceStage==='PRODUCTION'&&config.bookingEnabled)serviceNotice.textContent='전문가 상담은 지금 이용할 수 있으며, 오프라인 보험소 거점은 순차적으로 준비하고 있습니다.';const show=async()=>{const result=await memberState(client);header.replaceChildren();const panel=document.querySelector("[data-membership-panel]");if(panel){const active=result.state===MEMBER.active,incomplete=result.state===MEMBER.incomplete;panel.querySelector("[data-membership-title]").textContent=active?"가입 완료 · 환영합니다":incomplete?"가입을 마무리해 주세요":"처음 오셨나요?";panel.querySelector("[data-membership-description]").textContent=active?"상담과 예약 내역을 내 정보에서 확인하세요.":incomplete?"필수 정보를 확인하면 상담·예약을 이용할 수 있어요.":"무료로 가입하고 상담·예약을 이용하세요.";const link=panel.querySelector("[data-membership-link]");link.textContent=active?"내 정보 →":incomplete?"가입 마무리 →":"무료 회원가입 →";link.href=active||incomplete?"/account.html":authURL("/account.html");}const add=(label,href,primary)=>{const a=document.createElement('a');a.textContent=label;a.href=href;if(primary)a.className='member-primary';header.append(a);};if(result.state===MEMBER.anonymous){add('로그인',authURL('/account.html','login'));add('무료 회원가입',authURL('/account.html'),true);}else if(result.state===MEMBER.incomplete){add('가입 마무리','/account.html',true);}else{const expert=result.membership.partner_status==='approved';add(expert?'예약·고객':'내 예약',expert?'/partner-work.html':'/requests.html');if(expert)add('전문가 정보','/partner.html');add('내 정보','/account.html');}expertEntry();};await show();client.auth.onAuthStateChange(()=>{setTimeout(()=>show().catch(()=>{}),0);});}catch{/* Keep the explicit login/signup links if the service is unavailable. */}})();}

window.bohumsoCatalog=async(area,wanted)=>{const {client}=await memberService();const {data,error}=await client.rpc('planner_catalog',{area,wanted});if(error)throw error;return data;};


window.bohumsoOffices=async()=>{const {client}=await memberService();const {data,error}=await client.rpc('office_catalog');if(error)throw error;return data;};
window.bohumsoSlots=async(office_id,planner_id,day,consultation_method='scheduled')=>{const {client}=await memberService();const {data,error}=await client.rpc('reservation_slots',{office_id,planner_id,day,consultation_method});if(error)throw error;return data;};

window.dispatchEvent(new Event('bohumso-member-ready'));

window.bohumsoTrack=trackEvent;if(location.pathname==='/'||location.pathname==='/index.html')trackEvent('home_view');
