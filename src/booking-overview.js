import {el,kst} from './consultation-ui.js';
const archived=new Set(['completed','cancelled','unmatched']);
const labels={requested:'상담 요청 중',coordinating:'일정 조율 중',confirmed:'예약 확정',scheduled:'예약 확정',awaiting_completion:'상담 완료 확인 대기',completed:'상담 완료',cancelled:'예약 취소',unmatched:'요청 종료',dispute:'문제 확인 중',no_show:'문제 확인 중'};
function nextAction(row,workspace){
 if(row.schedule_proposal?.can_accept)return '제안된 변경 일정을 확인해 주세요.';
 if(row.state==='requested')return workspace==='partner'?'요청 내용을 확인하고 수락 여부를 선택해 주세요.':'전문가 확인을 기다려 주세요. 아직 확정 전입니다.';
 if(row.state==='coordinating')return row.planner_ok?(workspace==='partner'?'고객의 일정 확정을 기다려 주세요.':'일정을 확인한 뒤 확정해 주세요.'):'상담 일정을 확인해 주세요. 아직 확정 전입니다.';
 if(['confirmed','scheduled'].includes(row.state))return '아래 일정과 상담 방식을 확인해 주세요.';
 if(row.state==='awaiting_completion')return '상담 완료 내역을 확인해 주세요.';
 if(['completed','cancelled','unmatched'].includes(row.state))return '필요한 경우 예약 상세에서 처리 내역을 확인하세요.';
 return '예약 상세에서 현재 처리 내용을 확인해 주세요.';
}
export function bookingOverview({host,workspace,viewerId,refresh}){
 if(workspace==='admin')return {filter:rows=>rows,before(){},after(){},decorate(){},select(){}};
 const key=viewerId?'bohumso-booking-view:'+viewerId+':'+workspace:null,filters=document.getElementById('workflowFilters');
 let stored={};try{stored=key?JSON.parse(sessionStorage.getItem(key)||'{}'):{};}catch{}
 const target=new URLSearchParams(location.search).get('request');
 let view=stored.view==='past'?'past':'current',selected=target||null,open=new Set(target?[target]:(stored.open||[]).slice(-1)),anchor=null,first=true;
 if(!target&&filters)for(const [name,value]of Object.entries(stored.filters||{})){const field=filters.elements.namedItem(name);if(field)field.value=value;}
 const nav=el('nav',undefined,host.parentElement);nav.className='booking-views';nav.setAttribute('aria-label','예약 보기');host.before(nav);
 const task=el('p',undefined,nav.parentElement);task.className='booking-task-count';task.setAttribute('aria-live','polite');nav.before(task);
 const more=el('button','예약 더 보기',host.parentElement);more.type='button';more.hidden=true;more.className='btn ghost booking-more';host.after(more);let limit=10;more.onclick=()=>{if(host.querySelector('form[data-dirty]')&&!confirm('작성 중인 내용을 닫고 더 불러올까요?'))return;limit+=10;refresh();};
 const buttons=[];for(const [id,text]of [['current','현재 예약'],['past','지난 예약']]){const b=el('button',text,nav);b.type='button';b.onclick=()=>{if(host.querySelector('form[data-dirty]')&&!confirm('작성 중인 내용을 닫고 예약 보기를 바꿀까요?'))return;view=id;limit=10;selected=null;open.clear();save();refresh();};buttons.push([id,b]);}
 function save(){if(!key)return;try{sessionStorage.setItem(key,JSON.stringify({view,open:[...open],scroll:window.scrollY,filters:filters?Object.fromEntries(new FormData(filters)):{}}));}catch{}}
 window.addEventListener('pagehide',save);host.addEventListener('input',e=>{const f=e.target.closest('form');if(f)f.dataset.dirty='true';});
 filters?.addEventListener('submit',()=>{const state=filters.elements.namedItem('state')?.value;if(state)view=archived.has(state)?'past':'current';selected=null;save();});
 function before(){const card=[...host.querySelectorAll('[data-booking-id]')].find(n=>n.getBoundingClientRect().bottom>0);anchor=card?{id:card.dataset.bookingId,top:card.getBoundingClientRect().top}:null;}
 function filter(rows,authorized=rows){if(selected&&!rows.some(r=>r.id===selected)){const row=authorized.find(r=>r.id===selected);if(row)rows=[row,...rows];}if(target&&first){const row=rows.find(r=>r.id===target);if(row)view=archived.has(row.state)?'past':'current';}for(const [id,b]of buttons)b.setAttribute('aria-pressed',String(id===view));nav.dataset.bookingView=view;window.dispatchEvent(new Event('bohumso-booking-view'));const actionable=authorized.filter(r=>r.schedule_proposal?.can_accept||(workspace==='partner'&&!r.planner_ok&&['requested','coordinating'].includes(r.state))||(workspace==='customer'&&((r.state==='coordinating'&&r.planner_ok)||r.state==='awaiting_completion')));task.textContent=actionable.length?'확인할 '+(workspace==='partner'?'요청':'일정')+' '+actionable.length+'건':'예약을 확인해 주세요.';const visible=rows.filter(r=>r.id===selected||(archived.has(r.state)?view==='past':view==='current'));const hiddenTasks=actionable.filter(r=>!visible.some(v=>v.id===r.id)).length;if(hiddenTasks)task.textContent+=' · 현재 조건 밖 확인 필요 '+hiddenTasks+'건';if(authorized.length>=200)task.textContent+=' · 최근 200건 조회 범위';const targetIndex=visible.findIndex(r=>r.id===selected);if(targetIndex>=limit)limit=targetIndex+1;more.hidden=visible.length<=limit;more.textContent='예약 더 보기 ('+Math.min(limit,visible.length)+' / '+visible.length+')';return visible.slice(0,limit);}
 function decorate(card,row,context={}){
  const details=document.createElement('details');details.className='booking-detail';details.dataset.bookingDetail=row.id;details.id='booking-detail-'+row.id;const summary=el('summary','요청 내용·처리·이력',details);summary.hidden=true;const body=el('div',undefined,details);body.className='booking-detail-body';while(card.firstChild)body.append(card.firstChild);card.append(details);
  const header=document.createElement('header');header.className='booking-card-summary';card.prepend(header);
  el('h2',workspace==='customer'?(row.planner_name||row.office_name||'담당자 확인 중'):(row.contact?.name||'상담 요청 고객'),header);
  el('p',labels[row.state]||'상태 확인 필요',header).className='request-status';
  const method=row.office_id?'보험소 방문':({phone:'전화상담',nearby:'전문가가 고객에게 방문',scheduled:'방문상담'}[row.method]||'방식 확인 필요');
  el('p',(['confirmed','scheduled','awaiting_completion','completed'].includes(row.state)?'확정 · ':'희망 · ')+kst(row.preferred_at)+' · '+method,header).className='booking-summary-time';
  const guidance=el('p',nextAction(row,workspace),body);guidance.className='booking-next-action';body.prepend(guidance);
  if(context.place||(row.region&&workspace!=='partner'))el('p',context.place?'장소 · '+context.place:'상담 지역 · '+row.region,body).className='booking-summary-place';
  const title=row.schedule_proposal?.can_accept?'일정 확인':workspace==='partner'&&row.state==='requested'?'요청 확인':workspace==='customer'&&row.state==='coordinating'&&row.planner_ok?'일정 확인':row.state==='awaiting_completion'?'완료 확인':row.state==='requested'?'요청 상세':row.state==='coordinating'?'일정 확인':'예약 보기';
  const action=el('button',title,header);action.type='button';action.className='btn ghost';action.setAttribute('aria-controls',details.id);action.setAttribute('aria-expanded','false');action.onclick=()=>{details.open=!details.open;if(details.open){for(const other of document.querySelectorAll('details[data-booking-detail][open],details.booking-visit-detail[open]'))if(other!==details)other.open=false;open.clear();selected=row.id;open.add(row.id);save();details.scrollIntoView({block:'nearest'});}else{open.delete(row.id);selected=null;save();}};
  details.open=open.has(row.id);action.setAttribute('aria-expanded',String(details.open));details.addEventListener('toggle',()=>{action.setAttribute('aria-expanded',String(details.open));if(details.open){for(const other of document.querySelectorAll('details[data-booking-detail][open],details.booking-visit-detail[open]'))if(other!==details)other.open=false;open.clear();open.add(row.id);selected=row.id;}else{open.delete(row.id);if(selected===row.id)selected=null;}save();});
  const extra=document.createElement(workspace==='partner'?'details':'section');extra.className='booking-secondary-actions';el(workspace==='partner'?'summary':'h3','취소·기타 처리',extra);for(const b of body.querySelectorAll('.review-actions button')){if(/취소|패스/.test(b.textContent))extra.append(b);else b.classList.add('booking-primary-action');}if(extra.children.length>1)body.append(extra);
  for(const b of body.querySelectorAll('.booking-primary-action'))b.classList.remove('booking-primary-action');
  const primary=[...body.querySelectorAll('button')].find(b=>b.textContent==='변경 일정 수락')||[...body.querySelectorAll('button')].find(b=>/^(상담 목적 확인·수락|동의하고 일정 확정|미팅 완료 확인 요청|실제 미팅 완료 확인|출발 알리기|도착 알리기)$/.test(b.textContent));primary?.classList.add('booking-primary-action');
  const back=el('button','목록으로',body);back.type='button';back.className='btn ghost';back.onclick=()=>{details.open=false;open.delete(row.id);selected=null;save();if(view==='current'&&archived.has(row.state)){refresh();buttons[0][1].focus();}else{action.focus({preventScroll:true});card.scrollIntoView({block:'nearest'});}};
 }
 function after(){if(first){first=false;if(!target&&stored.scroll)requestAnimationFrame(()=>window.scrollTo({top:stored.scroll,behavior:'instant'}));}else if(anchor){const same=[...host.querySelectorAll('[data-booking-id]')].find(n=>n.dataset.bookingId===anchor.id);if(same)window.scrollBy(0,same.getBoundingClientRect().top-anchor.top);}save();}
 return {filter,before,after,decorate,select:id=>{if(id){selected=id;open.clear();open.add(id);}}};
}
