// Enhances only the already-authorized admin DOM. No credentials, RPCs or storage.
const byId=id=>document.getElementById(id);
const list=byId('requestList'),filters=byId('workflowFilters');
let view='all';
const cardState=card=>card.querySelector('.request-status')?.textContent.trim()||'';
const needsReview=card=>[...card.querySelectorAll('button')].some(b=>b.textContent==='후기 검토 저장')&&card.textContent.includes('검토 대기');
const needsAttention=card=>['분쟁','노쇼 신고'].includes(cardState(card))||card.textContent.includes('확인 중:')||card.textContent.includes('고객 완료 확인 미응답');
function update(){
 const cards=[...list.querySelectorAll('.booking-card')];
 for(const [id,count]of [['adminCountAll',cards.length],['adminCountWaiting',cards.filter(c=>cardState(c)==='완료 확인 대기').length],['adminCountIssues',cards.filter(needsAttention).length],['adminCountReviews',cards.filter(needsReview).length]])byId(id).textContent=String(count);
 const query=byId('adminListSearch').value.trim().toLocaleLowerCase('ko');let shown=0;
 for(const card of cards){const matches=(view==='all'||view==='issues'&&needsAttention(card)||view==='reviews'&&needsReview(card))&&(!query||(card.textContent+' '+card.dataset.bookingId).toLocaleLowerCase('ko').includes(query));card.hidden=!matches;if(matches)shown++;}
 byId('adminListCount').textContent='현재 목록 '+cards.length+'건 중 '+shown+'건 표시 · 검색과 보기는 현재 불러온 목록에 적용됩니다.';
 byId('adminEmptyView').hidden=!cards.length||shown!==0;
 for(const b of document.querySelectorAll('.admin-view-tabs [data-admin-view]'))b.setAttribute('aria-pressed',String(b.dataset.adminView===view));
}
function setView(value){view=value;update();}
for(const button of document.querySelectorAll('[data-admin-view]'))button.addEventListener('click',()=>setView(button.dataset.adminView));
for(const button of document.querySelectorAll('[data-quick-state]'))button.addEventListener('click',()=>{view='all';byId('adminListSearch').value='';filters.elements.state.value=button.dataset.quickState;filters.requestSubmit();byId('workflowFilters').scrollIntoView({block:'start',behavior:'auto'});});
byId('adminResetFilters').addEventListener('click',()=>{filters.reset();view='all';byId('adminListSearch').value='';filters.requestSubmit();});
byId('adminListSearch').addEventListener('input',update);
new MutationObserver(update).observe(list,{childList:true,subtree:true,characterData:true});
const toggle=byId('adminMenuToggle'),sidebar=byId('adminSidebar');
function closeMenu(){document.body.classList.remove('menu-open');toggle.setAttribute('aria-expanded','false');}
toggle.addEventListener('click',()=>{const opened=document.body.classList.toggle('menu-open');toggle.setAttribute('aria-expanded',String(opened));if(opened)sidebar.querySelector('a').focus();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('menu-open')){closeMenu();toggle.focus();}});
sidebar.addEventListener('click',e=>{const link=e.target.closest('a');if(!link)return;sidebar.querySelectorAll('a').forEach(a=>a.removeAttribute('aria-current'));link.setAttribute('aria-current','page');if(link.hash){const target=document.querySelector(link.hash);if(target){for(let node=target;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;}}closeMenu();});
