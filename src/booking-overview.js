import {el,kst} from './consultation-ui.js';
const archived=new Set(['completed','cancelled','unmatched']);
const labels={requested:'요청 중 · 전문가 확인 전',coordinating:'요청 중 · 일정 확인 필요',confirmed:'예약 확정',scheduled:'예약 확정',awaiting_completion:'상담 완료 확인 대기',completed:'상담 완료',cancelled:'예약 취소',unmatched:'요청 종료',dispute:'문제 확인 중',no_show:'문제 확인 중'};
export function bookingOverview({host,workspace,viewerId,refresh}){
 if(workspace==='admin')return {filter:rows=>rows,before(){},after(){},decorate(){},select(){}};
 const key=viewerId?'bohumso-booking-view:'+viewerId+':'+workspace:null,filters=document.getElementById('workflowFilters');
 let stored={};try{stored=key?JSON.parse(sessionStorage.getItem(key)||'{}'):{};}catch{}
 const target=new URLSearchParams(location.search).get('request');
 let view=stored.view==='past'?'past':'current',selected=target||null,open=new Set(target?[target]:stored.open||[]),anchor=null,first=true;
 if(!target&&filters)for(const [name,value]of Object.entries(stored.filters||{})){const field=filters.elements.namedItem(name);if(field)field.value=value;}
 const nav=el('nav',undefined,host.parentElement);nav.className='booking-views';nav.setAttribute('aria-label','예약 보기');host.before(nav);
 const buttons=[];for(const [id,text]of [['current','현재 예약'],['past','지난·취소 예약']]){const b=el('button',text,nav);b.type='button';b.onclick=()=>{if(host.querySelector('form[data-dirty]')&&!confirm('작성 중인 내용을 닫고 예약 보기를 바꿀까요?'))return;view=id;selected=null;open.clear();save();refresh();};buttons.push([id,b]);}
 function save(){if(!key)return;try{sessionStorage.setItem(key,JSON.stringify({view,open:[...open],scroll:window.scrollY,filters:filters?Object.fromEntries(new FormData(filters)):{}}));}catch{}}
 window.addEventListener('pagehide',save);host.addEventListener('input',e=>{const f=e.target.closest('form');if(f)f.dataset.dirty='true';});
 filters?.addEventListener('submit',()=>{const state=filters.elements.namedItem('state')?.value;if(state)view=archived.has(state)?'past':'current';selected=null;save();});
 function before(){const card=[...host.querySelectorAll('[data-booking-id]')].find(n=>n.getBoundingClientRect().bottom>0);anchor=card?{id:card.dataset.bookingId,top:card.getBoundingClientRect().top}:null;}
 function filter(rows,authorized=rows){if(selected&&!rows.some(r=>r.id===selected)){const row=authorized.find(r=>r.id===selected);if(row)rows=[row,...rows];}if(target&&first){const row=rows.find(r=>r.id===target);if(row)view=archived.has(row.state)?'past':'current';}for(const [id,b]of buttons)b.setAttribute('aria-pressed',String(id===view));nav.dataset.bookingView=view;window.dispatchEvent(new Event('bohumso-booking-view'));return rows.filter(r=>r.id===selected||(archived.has(r.state)?view==='past':view==='current'));}
 function decorate(card,row,context={}){
  const details=document.createElement('details');details.className='booking-detail';details.dataset.bookingDetail=row.id;details.id='booking-detail-'+row.id;const summary=el('summary','요청 내용·처리·이력',details);summary.hidden=true;const body=el('div',undefined,details);body.className='booking-detail-body';while(card.firstChild)body.append(card.firstChild);card.append(details);
  const header=document.createElement('header');header.className='booking-card-summary';card.prepend(header);
  el('h2',workspace==='customer'?(row.planner_name||row.office_name||'담당자 확인 중'):(row.contact?.name||'상담 요청 고객'),header);
  el('p',row.state==='coordinating'&&row.planner_ok?(workspace==='partner'?'고객 일정 확정 대기':'요청 중 · 일정 확인 필요'):labels[row.state]||'상태 확인 필요',header).className='request-status';
  el('p',row.office_id?'고객이 보험소에 방문 · '+(row.office_name||'선택한 보험소'):({phone:'전화 상담',nearby:'전문가가 고객에게 방문',scheduled:'전문가와 상담 장소 조율'}[row.method]||'상담 방식 확인 필요'),header);
  el('p',(['confirmed','scheduled','awaiting_completion','completed'].includes(row.state)?'확정 시간 · ':'희망 시간 · ')+kst(row.preferred_at)+' KST',header).className='booking-summary-time';
  if(context.place)el('p','장소 · '+context.place,header).className='booking-summary-place';else if(row.region)el('p','상담 지역 · '+row.region,header).className='booking-summary-place';if(row.fee_notice){const fee=[...body.children].find(n=>n.tagName==='P'&&n.textContent===row.fee_notice);if(fee)header.append(fee);else el('p',row.fee_notice,header);}
  const title=row.schedule_proposal?.can_accept?'변경 일정 상세 보기':workspace==='partner'&&!row.planner_ok&&['requested','coordinating'].includes(row.state)?'요청 상세 보기':workspace==='customer'&&row.state==='coordinating'&&row.planner_ok?'일정 상세 보기':row.state==='awaiting_completion'?'완료 내역 보기':'예약 상세';
  const action=el('button',title,header);action.type='button';action.className=title==='예약 상세'?'btn ghost':'btn';action.setAttribute('aria-controls',details.id);action.setAttribute('aria-expanded','false');action.onclick=()=>{details.open=!details.open;if(details.open){selected=row.id;open.add(row.id);save();details.scrollIntoView({block:'nearest'});}else{open.delete(row.id);selected=null;save();}};
  details.open=open.has(row.id);action.setAttribute('aria-expanded',String(details.open));details.addEventListener('toggle',()=>{action.setAttribute('aria-expanded',String(details.open));if(details.open){open.add(row.id);selected=row.id;}else{open.delete(row.id);if(selected===row.id)selected=null;}save();});
  const extra=document.createElement('section');extra.className='booking-secondary-actions';el('h3','취소·기타 처리',extra);for(const b of body.querySelectorAll('.review-actions button')){if(/취소|패스/.test(b.textContent))extra.append(b);else b.classList.add('booking-primary-action');}if(extra.children.length>1)body.append(extra);
  for(const b of body.querySelectorAll('.booking-primary-action'))b.classList.remove('booking-primary-action');
  const primary=[...body.querySelectorAll('button')].find(b=>b.textContent==='변경 일정 수락')||[...body.querySelectorAll('button')].find(b=>/^(상담 목적 확인·수락|동의하고 일정 확정|미팅 완료 확인 요청|실제 미팅 완료 확인|출발 알리기|도착 알리기)$/.test(b.textContent));primary?.classList.add('booking-primary-action');
  const back=el('button','목록으로',body);back.type='button';back.className='btn ghost';back.onclick=()=>{details.open=false;open.delete(row.id);selected=null;save();if(view==='current'&&archived.has(row.state)){refresh();buttons[0][1].focus();}else{action.focus({preventScroll:true});card.scrollIntoView({block:'nearest'});}};
 }
 function after(){if(first){first=false;if(!target&&stored.scroll)requestAnimationFrame(()=>window.scrollTo({top:stored.scroll,behavior:'instant'}));}else if(anchor){const same=[...host.querySelectorAll('[data-booking-id]')].find(n=>n.dataset.bookingId===anchor.id);if(same)window.scrollBy(0,same.getBoundingClientRect().top-anchor.top);}save();}
 return {filter,before,after,decorate,select:id=>{if(id){selected=id;open.add(id);}}};
}
