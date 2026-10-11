import {memberService} from './member-access.js';
let last=0,running=false;
function display(count){
 for(const a of document.querySelectorAll('a[href="/support.html"],a[href="/support"]')){
  a.classList.add('support-entry-link');let badge=a.querySelector('[data-support-unread]');
  if(!badge){badge=document.createElement('span');badge.dataset.supportUnread='';badge.className='support-unread-badge';a.append(badge);}
  badge.hidden=!count;badge.textContent=count>99?'99+':String(count);badge.setAttribute('aria-label','안 읽은 답변 '+count+'건');
 }
}
async function refresh(force=false){
 if(document.hidden||running||(!force&&Date.now()-last<60000)||new URLSearchParams(location.search).has('code'))return;
 last=Date.now();running=true;try{
  const {client}=await memberService();const {data}=await client.auth.getSession();if(!data.session){display(0);return;}
  const result=await client.rpc('support_command',{operation:'unread'});if(!result.error&&Number.isInteger(result.data?.count))display(result.data.count);
 }catch{/* Keep the support link usable if count lookup fails. */}finally{running=false;}
}
window.addEventListener('focus',()=>void refresh());document.addEventListener('visibilitychange',()=>void refresh());
window.addEventListener('bohumso:support-read',()=>void refresh(true));void refresh();
