// Rearrange existing editors and actions without changing their persistence rules.
import {el} from './consultation-ui.js';
function icon(parent,name){const n=el('span',undefined,parent);n.setAttribute('aria-hidden','true');n.innerHTML=window.uiIcon?.(name)||'';return n;}
function row(parent,label,name,{href,action}={}){
 const n=el(href?'a':'button',undefined,parent);n.className='app-menu-row';if(href)n.href=href;else{n.type='button';n.onclick=action;}
 icon(n,name);el('span',label,n).className='app-menu-title';icon(n,'arrow');return n;
}
function disclosure(parent,title,node,open=false){
 const box=el('details',undefined,parent);box.className='expert-settings';box.open=open;el('summary',title,box);box.append(node);return box;
}
export function arrangeExpertHome(root,{summary,status}={}){
 const intro=document.getElementById('partnerState')?.closest('section');
 const identity=el('section',undefined,root);identity.className='expert-identity';
 el('h2',summary?.name||'내 전문가 프로필',identity);
 if(summary?.area)el('p',summary.area,identity);
 if(intro){const state=document.getElementById('partnerState');state.className='expert-state';identity.append(state);intro.remove();}
 const instant=root.querySelector('.instant-status'),consult=root.querySelector('.consult-settings');
 const statuses=el('section',undefined,root);statuses.className='expert-status-group';el('h2','상담 상태',statuses);
 if(consult)statuses.append(consult);if(instant)statuses.append(instant);
 if(!consult&&!instant){statuses.remove();}
 const booking=status==='approved'?row(root,'받은 요청·예약','calendar',{href:'/partner-work.html'}):null;
 root.querySelector('[data-work-link]')?.remove();
 const menu=el('nav',undefined,root);menu.className='app-menu';menu.setAttribute('aria-label','전문가 주요 메뉴');
 const profile=root.querySelector('.optional-profile');
 if(profile){profile.id='expertProfile';row(menu,'내 프로필','person',{action:()=>{if(profile.querySelector('#optionalProfileBody')?.hidden)profile.querySelector('.profile-toggle').click();profile.scrollIntoView({behavior:'smooth',block:'start'});}});}
 row(menu,'병원·보험사 자료실','document',{href:'/claim-resources.html'});
 if(summary?.name)row(menu,'성장·실천','check',{href:'/growth.html'});
 row(menu,'고객센터','support',{href:'/support.html'});
 const rest=[...root.children].filter(n=>![identity,statuses,booking,menu].includes(n));
 root.prepend(...[identity,statuses.children.length>1?statuses:null,booking,menu].filter(Boolean));
 for(const node of rest){
  if(node===profile){root.append(node);continue;}
  if(node.id==='partnerForm'&&status==='approved'){disclosure(root,'활동 정보·상담 시간',node);continue;}
  if(node.id==='partnerDetails'&&!node.hidden){disclosure(root,'자격·소속 자료',node);continue;}
  if(!node.children.length&&!node.textContent.trim())node.remove();
 }
 if(profile)root.append(profile);
}
