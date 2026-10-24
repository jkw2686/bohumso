import {memberService,memberState} from './member-access.js';
import {isExpertMember,roleDestination} from './role-routing.js';
let revision=0,client,observedClient;
const lock=()=>{document.documentElement.dataset.roleCheck='pending';if(document.body&&!document.getElementById('roleLoading')){const n=document.createElement('section');n.id='roleLoading';n.setAttribute('role','status');n.textContent='회원 정보를 확인하고 있어요.';document.body.append(n);}};
const release=()=>{document.documentElement.dataset.roleCheck='ready';document.getElementById('roleLoading')?.remove();};
function menu(m){
 const expert=isExpertMember(m);window.bohumsoMemberRole=expert?'expert':'consumer';
 document.querySelectorAll('[data-customer-nav]').forEach(nav=>{
 if(!expert){nav.style.removeProperty('grid-template-columns');window.dispatchEvent(new Event('bohumso-role-menu'));return;}
 const links=[['home','홈','/partner.html'],['calendar','상담 요청',m.partner_status==='approved'?'/partner-work.html':'/partner.html'],['person','내 정보','/partner.html?screen=settings']];
 nav.style.gridTemplateColumns='repeat(3,minmax(0,1fr))';nav.replaceChildren();for(const [icon,label,href]of links){const a=document.createElement('a');a.href=href;a.innerHTML=window.uiIcon?.(icon)||'';const span=document.createElement('span');span.textContent=label;a.append(span);nav.append(a);}
 });
 if(expert)document.querySelectorAll('.expert-header-entry').forEach(n=>n.remove());
}
async function check(){
 const current=++revision;lock();
 try{
  const service=await memberService();client=service.client;if(observedClient!==client){observedClient=client;client.auth.onAuthStateChange(event=>{if(event==='INITIAL_SESSION')return;lock();setTimeout(check,0);});}const auth=await memberState(client);if(current!==revision)return;
  const preview=new URLSearchParams(location.search).get('preview')==='customer';
  const next=roleDestination(auth.membership,location.pathname+location.search,{preview});
  if(next){location.replace(next);return;}
  document.querySelectorAll('.role-preview-banner').forEach(n=>n.remove());menu(auth.membership);release();
  if(preview&&isExpertMember(auth.membership)){const b=document.createElement('a');b.textContent='고객 화면 미리보기 · 전문가 홈으로';b.href='/partner.html';b.className='role-preview-banner';document.querySelector('main')?.prepend(b);}
 }catch(error){
  if(current!==revision)return;if(error?.message==='account_changed'){setTimeout(check,0);return;}const root=document.getElementById('roleLoading');if(root){root.replaceChildren(document.createTextNode('회원 정보를 확인하지 못했어요.'));const retry=document.createElement('button');retry.textContent='다시 확인';retry.onclick=check;root.append(retry);}
 }
}
void check();
window.addEventListener('pageshow',e=>{if(e.persisted)check();});
window.addEventListener('bohumso-nav-ready',()=>{if(document.documentElement.dataset.roleCheck==='ready')check();});

window.addEventListener('storage',e=>{if(e.key==='woori-account'||e.key===null)check();});
