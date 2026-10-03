import {memberService,memberState,requireActiveMember,MEMBER,authURL} from './member-access.js';
const header=document.querySelector('[data-member-header]');
let busy=false;
function notice(text){let n=document.getElementById('memberGateNotice');if(!n){n=document.createElement('p');n.id='memberGateNotice';n.setAttribute('role','alert');n.className='member-gate-notice';document.querySelector('main')?.prepend(n);}n.textContent=text;}
// Capture includes dynamically rendered map cards and the shared bottom navigation.
document.addEventListener('click',async event=>{
 const link=event.target.closest('a[href]');if(!link||event.defaultPrevented)return;const url=new URL(link.href,location.href);if(url.origin!==location.origin)return;
 if(!link.hasAttribute('data-member-action')&&!/^\/(requests|consult|account|partner-work|admin-requests|admin|partner)(\.html)?$/.test(url.pathname))return;
 event.preventDefault();if(busy)return;busy=true;link.setAttribute('aria-busy','true');
 try{const next=link.dataset.memberNext||url.pathname+url.search+url.hash;if(await requireActiveMember({next}))location.assign(next);}catch{notice('연결을 확인하지 못했어요. 잠시 후 다시 눌러 주세요.');}finally{busy=false;link.removeAttribute('aria-busy');}
});
if(header){(async()=>{try{const {client}=await memberService();const show=async()=>{const result=await memberState(client);header.replaceChildren();const add=(label,href,primary)=>{const a=document.createElement('a');a.textContent=label;a.href=href;if(primary)a.className='member-primary';header.append(a);};if(result.state===MEMBER.anonymous){add('로그인',authURL('/account.html','login'));add('무료 회원가입',authURL('/account.html'),true);}else if(result.state===MEMBER.incomplete){add('가입 마무리','/account.html',true);}else{const expert=result.membership.partner_status==='approved';add(expert?'예약·고객':'내 예약',expert?'/partner-work.html':'/requests.html');if(expert)add('전문가 정보','/partner.html');add('내 정보','/account.html');}};await show();client.auth.onAuthStateChange(()=>{setTimeout(()=>show().catch(()=>{}),0);});}catch{/* Keep the explicit login/signup links if the service is unavailable. */}})();}
