import {el,kst} from './consultation-ui.js';
import {requestParams,stableRequestKey} from './request-intent.js';
const day=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(value);
const shortDate=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'short',day:'numeric',weekday:'short'}).format(value);
const purposeLabels={claim:'보험금 청구',coverage:'보장 확인',management:'내 보험 확인',new:'가입 상담',other:'기타 상담',corporate:'기업보험 상담'};
const methodLabels={phone:'전화상담 · 통화 시간 조율',nearby:'전문가가 고객에게 방문 · 장소·시간 조율',scheduled:'전문가와 상담 장소·시간 조율'};
export function renderOfficeRequest({form,command,refresh,message,selectedOffice=null,selectedPlanner=null,availability=null,sameTimeConfirmation=false}){
 const params=requestParams(location.search),help=params.get('help')||'',region=selectedOffice?.region||selectedPlanner?.region||params.get('region')||'';
 const purpose=selectedPlanner?.profession==='tax'?'other':Object.hasOwn(purposeLabels,params.get('purpose'))?params.get('purpose'):'other';
 const method=selectedOffice?'scheduled':['phone','nearby','scheduled'].includes(params.get('method'))?params.get('method'):'scheduled';
 if(selectedOffice){params.set('office',selectedOffice.id);params.delete('planner');}else if(selectedPlanner){params.set('planner',selectedPlanner.id);params.delete('office');}
 params.set('method',method);params.set('purpose',purpose);
 let date='',time='',step=1,busy=false,checking=false;
 const chosenDate=params.get('date')||'',chosenTime=params.get('time')||'',chosenStamp=new Date(chosenDate+'T'+chosenTime+':00+09:00').getTime();
 if(region&&/^\d{4}-\d{2}-\d{2}$/.test(chosenDate)&&/^(09|1[0-7]):00$/.test(chosenTime)&&chosenStamp>=Date.now()+1800000&&chosenStamp<=Date.now()+90*86400000){date=chosenDate;time=chosenTime;step=2;}
 const situationLabels={death:'가족 사망',cancer:'암 진단',illness:'암·질병',hospitalization:'입원·수술',medical:'입원·수술',accident:'사고',claim:'보험금 청구',coverage:'내 보험 확인'};
 const situation=situationLabels[params.get('situation')]||'',name=selectedOffice?.name||selectedPlanner?.name||'';
 // 세무 상담은 고객이 세무사 사무실로 방문한다. 보험소 방문과 같은 장소 유형으로 묶지 않는다.
 const taxOfficeVisit=selectedPlanner?.profession==='tax'&&method!=='phone';
 const direction=selectedOffice?'고객이 보험소에 방문 · '+(selectedOffice.address||selectedOffice.region):taxOfficeVisit?'고객이 세무사 사무실에 방문 · 정확한 주소는 예약 확정 후 안내':methodLabels[method];
 const mapURL=view=>'/map.html?'+new URLSearchParams({view,region,purpose,...(help&&view==='experts'?{help,profession:help==='tax'?'tax':'planner'}:{}),situation:params.get('situation')||''});
 function reselect(parent){const a=el('a',selectedOffice?'다른 보험소 선택':'다른 전문가 선택',parent);a.href=mapURL(selectedOffice?'offices':'experts');a.className='text-button';return a;}
 function remember(){params.set('region',region);for(const [key,value]of [['date',date],['time',time]])if(value)params.set(key,value);else params.delete(key);history.replaceState(null,'',location.pathname+'?'+params);}
 if(help&&((help==='tax'&&(selectedOffice||selectedPlanner&&selectedPlanner.profession!=='tax'))||(help==='claim'&&selectedPlanner&&selectedPlanner.profession!=='planner'))){form.hidden=false;form.replaceChildren();el('p','선택한 도움 분야와 전문가가 다릅니다. 같은 분야의 전문가를 다시 선택해 주세요.',form);reselect(form);return;}
 form.classList.add('request-wizard');form.hidden=false;form.onsubmit=e=>e.preventDefault();
 function button(parent,label,fn,cls=''){const b=el('button',label,parent);b.type='button';b.className=cls;b.onclick=fn;return b;}
 if(!selectedOffice&&!selectedPlanner){form.replaceChildren();el('h2','누구에게 도움받으실까요?',form);el('p','전문가나 방문할 보험소를 직접 선택해 주세요.',form);for(const [label,view]of [['가까운 전문가 선택','experts'],['방문할 보험소 선택','offices']]){const a=el('a',label,form);a.className='btn'+(view==='offices'?' ghost':'');a.href=mapURL(view);}return;}
 function render(){
  remember();checking=false;form.replaceChildren();const progress=el('p',step===1?'1/3 날짜':'2/3 시간',form);progress.className='step-dots';progress.setAttribute('aria-label',step===1?'현재 단계: 날짜 선택':'현재 단계: 시간 선택');
  el('h2','상담 시간을 골라주세요',form);el('p',name+' · '+(selectedOffice?'보험소 방문':method==='phone'?'전화상담':'방문상담'),form).className='wizard-context';if(selectedPlanner?.profession==='tax')el('p',selectedPlanner.fee_notice||'방문 전 상담료 확인이 필요합니다',form);
  if(step===1){

   const choices=el('div',undefined,form);choices.className='choice-grid booking-date-chips';
   for(let i=0;i<7;i++){const d=new Date(Date.now()+i*86400000),v=day(d);button(choices,(i===0?'오늘 · ':i===1?'내일 · ':'')+shortDate(d),()=>{date=v;time='';step=2;render();}).setAttribute('aria-pressed',String(date===v));}
   const more=el('details',undefined,form);el('summary','다른 날짜',more);const label=el('label','희망 날짜',more),input=el('input',undefined,label);input.type='date';input.min=day(new Date());input.max=day(new Date(Date.now()+90*86400000));const hint=el('p','',more);hint.setAttribute('role','alert');
   input.onchange=()=>{if(input.checkValidity()&&input.value){date=input.value;time='';step=2;render();}else{hint.textContent='오늘부터 90일 이내의 날짜를 선택해 주세요.';input.setAttribute('aria-invalid','true');input.focus();}};reselect(form);return;
  }
  const schedule=el('section',undefined,form);
  el('h2','몇 시가 편하세요?',schedule);el('p',shortDate(new Date(date+'T12:00:00+09:00')),schedule);
  el('p','한국 시간(KST) · 1시간 단위 · 신청 후 일정 조율',schedule).className='wizard-context';
  const choices=el('div',undefined,schedule);choices.className='booking-time-groups';
  const periods=[['오전',0,12],['오후',12,24]].map(([label,start,end])=>{const group=el('section',undefined,choices);el('h3',label,group);const grid=el('div',undefined,group);grid.className='choice-grid';return {start,end,grid};});

  const selection=el('p','',schedule);selection.className='wizard-context';selection.setAttribute('role','status');
  function summarize(){selection.textContent=time?name+' · '+(selectedOffice?'보험소 방문':method==='phone'?'전화상담':taxOfficeVisit?'세무사 사무실 방문':method==='nearby'?'전문가 방문':'상담 일정 조율')+' · 희망 '+date+' '+time+' (확정 전)':'희망 시간을 선택해 주세요.';}
  for(let minute=540;minute<=1020;minute+=60){
   const value=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0'),stamp=new Date(date+'T'+value+':00+09:00');
   const grid=periods.find(p=>Number(value.slice(0,2))>=p.start&&Number(value.slice(0,2))<p.end).grid;
   const b=button(grid,value,()=>{time=value;review.hidden=true;submit.hidden=true;reviewButton.hidden=false;remember();summarize();choices.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));submit.disabled=checking;reviewButton.disabled=checking;});b.dataset.slot=value;b.setAttribute('aria-pressed',String(time===value));b.disabled=stamp.getTime()<Date.now()+1800000;
  }
  const notice=el('p',sameTimeConfirmation?'선택한 시간 그대로 전문가가 수락하면 확정됩니다.':'연락·일정을 조율하고 필요한 확인을 마친 뒤 확정됩니다.',form);notice.setAttribute('role','status');
  const recovery=el('div','',form);recovery.hidden=true;reselect(recovery);
  const review=el('section',undefined,form);review.className='booking-review';review.hidden=true;review.tabIndex=-1;
  const reviewButton=button(form,'선택한 일정 확인',()=>{
   if(checking||!time)return;review.replaceChildren();el('h2','신청 내용을 확인해 주세요',review);
   const details=el('dl',undefined,review);for(const [label,value]of [[selectedOffice?'선택한 보험소':'선택한 전문가',name],['희망 일정',shortDate(new Date(date+'T12:00:00+09:00'))+' '+time+' · 한국 시간(KST)'],['만나는 방법',direction],]){el('dt',label,details);el('dd',value,details);}
   if(selectedPlanner?.profession==='tax')el('p',selectedPlanner.fee_notice||'방문 전 상담료 확인이 필요합니다',review);
   el('p',sameTimeConfirmation?'전문가가 같은 시간으로 수락하면 예약이 확정됩니다. 변경 제안은 다시 확인합니다.':'아직 확정된 예약이 아닙니다. 선택한 대상에게 요청한 뒤 연락·일정을 조율합니다.',review);
   if(sameTimeConfirmation){const label=el('label','예약자 이름',review),n=el('input',undefined,label);n.name='bookingContactName';n.required=true;n.minLength=2;n.maxLength=60;n.autocomplete='name';const consent=el('label',undefined,review),c=el('input',undefined,consent);c.type='checkbox';c.name='bookingContactConsent';c.required=true;consent.append(document.createTextNode('예약 확정 후 '+(selectedOffice?'배정된 담당 전문가 1인':name)+'에게만 인증된 전화번호를 공개하는 데 동의합니다.'));const more=el('details',undefined,review);el('summary','연락처 제공 안내',more);el('p','제공 항목: 이름·인증된 전화번호. 목적: 예약 일정 연락과 요청한 상담. 상담 종료 또는 취소 시까지 이용하며, 예약 관련 문제가 접수되면 처리에 필요한 범위에서 종료 시까지 보관합니다. 동의를 거부하면 연락처를 제공하지 않으며 예약 신청이 제한됩니다.',more);const validate=()=>submit.disabled=!n.validity.valid||!c.checked;review.addEventListener('input',validate);validate();}
   button(review,'시간 다시 선택',()=>{schedule.hidden=false;progress.textContent='2/3 시간';progress.setAttribute('aria-label','현재 단계: 시간 선택');review.hidden=true;submit.hidden=true;reviewButton.hidden=false;choices.querySelector('[aria-pressed=true]')?.focus();},'text-button');
   schedule.hidden=true;progress.textContent='3/3 확인';progress.setAttribute('aria-label','현재 단계: 내용 확인');review.hidden=false;submit.hidden=false;reviewButton.hidden=true;review.focus();
  },'primary');
  const submit=button(form,'상담 요청 보내기',async()=>{
   if(busy||checking||!time||review.hidden)return;if(sameTimeConfirmation&&(!review.querySelector('[name=bookingContactName]')?.reportValidity()||!review.querySelector('[name=bookingContactConsent]')?.checked))return;
   const stamp=new Date(date+'T'+time+':00+09:00').getTime();if(!Number.isFinite(stamp)||stamp<Date.now()+1800000||stamp>Date.now()+90*86400000){notice.textContent='예약시간을 다시 선택해 주세요.';time='';remember();summarize();submit.disabled=true;return;}
   busy=true;const enabled=[...form.querySelectorAll('button')].filter(b=>!b.disabled);form.querySelectorAll('button').forEach(b=>b.disabled=true);notice.textContent='요청을 전달하고 있어요.';
   const when=new Date(stamp).toISOString(),payload={office_assignment:!!selectedOffice,...(selectedOffice?{office_id:selectedOffice.id}:{planner_id:selectedPlanner.id}),purpose,...(help?{help_intent:help}:{}),region,method,preferred_at:when};if(selectedPlanner?.profession==='tax')payload.fee_ack=selectedPlanner.fee_notice||'방문 전 상담료 확인이 필요합니다';payload.request_key=stableRequestKey(payload);if(sameTimeConfirmation)Object.assign(payload,{confirmation_version:'same-time-v1',name:review.querySelector('[name=bookingContactName]').value.trim(),share_consent:true});
   try{
    const result=await command('request',payload),savedId=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result?.id||'')?result.id:null;form.replaceChildren();el('h2','상담 요청이 접수되었습니다.',form);el('p',name+' · '+direction,form);if(selectedPlanner?.profession==='tax')el('p',selectedPlanner.fee_notice||'방문 전 상담료 확인이 필요합니다',form);el('p','희망시간 · '+kst(when)+' (확정 전)',form);el('p',sameTimeConfirmation?'전문가가 같은 시간으로 수락하면 확정됩니다. 확정 후에만 담당자에게 전화번호가 공개됩니다.':'전문가 수락과 필요한 확인 후 일정이 확정됩니다. 내 예약에서 진행 상태를 확인하세요.',form);
    const savedStatus=el('p','내 예약을 불러오고 있습니다.',form);savedStatus.setAttribute('role','status');
    let listReady=false;
    const view=button(form,'내 예약 보기',async()=>{if(view.disabled)return;if(!listReady){await reloadList();return;}document.getElementById('requestList').scrollIntoView({behavior:'smooth',block:'start'});},'primary');
    async function reloadList(){view.disabled=true;view.textContent='내 예약 확인 중';try{await refresh();listReady=true;savedStatus.textContent='내 예약에서 접수 내역을 확인할 수 있습니다. 휴대전화 푸시 도착 여부는 별도입니다.';view.textContent='내 예약 보기';if(savedId){view.hidden=true;const savedLink=el('a','내 예약 보기',form);savedLink.href='/notifications.html?reservation='+encodeURIComponent(savedId);savedLink.className='btn primary';}}catch{savedStatus.textContent='요청은 접수됐지만 내역을 불러오지 못했어요. 다시 불러와도 예약은 추가되지 않습니다.';view.textContent='내 예약 다시 불러오기';}finally{view.disabled=false;}}
    message('');await reloadList();return;
   }catch(error){
    const unavailable=['new_appointments_restricted','invalid_partner','office_not_active','visit_not_available','select_planner'].includes(error.message);
    const messages={help_profession_mismatch:'선택한 도움 분야와 전문가가 다릅니다. 해당 분야의 전문가를 다시 선택해 주세요.',help_purpose_mismatch:'상담 목적을 다시 선택해 주세요.',fee_confirmation_required:'상담료 안내가 변경됐습니다. 전문가 프로필을 다시 확인한 뒤 요청해 주세요.',new_appointments_restricted:'새 약속은 잠시 제한됩니다. 기존 약속 관리와 운영자 문의는 이용할 수 있어요.',request_limit:'진행 중인 요청을 내 예약에서 먼저 확인해 주세요.',invalid_slot:'이 시간은 이용할 수 없습니다. 다른 시간을 선택해 주세요.',reservation_slot_taken:'이 시간은 이용할 수 없습니다. 다른 시간을 선택해 주세요.',slot_unavailable:'이 시간은 이용할 수 없습니다. 다른 시간을 선택해 주세요.',membership_required:'회원가입을 완료한 후 이용할 수 있습니다.',phone_verification_required:'휴대전화 인증 후 같은 요청을 이어갈 수 있어요.',invalid_partner:'선택한 전문가가 현재 요청을 받을 수 없습니다. 다른 전문가를 직접 선택해 주세요.',office_not_active:'선택한 보험소는 현재 방문예약을 받을 수 없습니다.',visit_not_available:'현재 이 전문가에게 방문을 요청할 수 없습니다.',select_planner:'전문가를 다시 선택해 주세요.',request_key_conflict:'선택 정보가 바뀌었어요. 전문가와 시간을 다시 확인해 주세요.',request_closed:'이미 종료된 요청입니다. 내 예약을 확인하거나 다른 시간을 선택해 주세요.'};
    notice.textContent=messages[error.message]||(error.code==='23505'?'이미 예약된 시간입니다. 다른 시간을 선택해 주세요.':'연결을 확인한 뒤 다시 시도해 주세요. 같은 요청은 중복 접수되지 않습니다.');
    recovery.hidden=!unavailable;
    if(error.message==='phone_verification_required'){recovery.hidden=false;const a=el('a','휴대전화 인증 후 이어가기',recovery);a.href='/phone-verification.html?next='+encodeURIComponent(location.pathname+'?'+params);}
    // Recover controls using the current availability instead of enabling stale slots.
    enabled.forEach(b=>b.disabled=false);if(unavailable)submit.disabled=true;else submit.disabled=false;
    dateButton.disabled=false;
   }finally{busy=false;}
  },'primary');
  submit.hidden=true;
  const dateButton=button(form,'날짜 변경',()=>{step=1;render();},'text-button');summarize();submit.disabled=!time;reviewButton.disabled=!time;
  if(availability){
   const requestedDay=date;checking=true;submit.disabled=true;reviewButton.disabled=true;choices.querySelectorAll('button').forEach(b=>b.disabled=true);notice.textContent='가능한 시간을 확인하고 있어요.';
   queueMicrotask(async()=>{try{const slots=await availability(selectedOffice?.id||null,selectedPlanner?.id||null,requestedDay,method);if(date!==requestedDay||!choices.isConnected)return;checking=false;choices.querySelectorAll('button').forEach(b=>b.disabled=!slots.includes(b.dataset.slot)||new Date(requestedDay+'T'+b.dataset.slot+':00+09:00').getTime()<Date.now()+1800000);if(!slots.includes(time)||new Date(requestedDay+'T'+time+':00+09:00').getTime()<Date.now()+1800000){time='';remember();summarize();}submit.disabled=!time;reviewButton.disabled=!time;notice.textContent=slots.length?'희망시간을 요청하고 연락·일정 조율 후 확정해요.':'이 날짜에는 가능한 시간이 없습니다. 다른 날짜나 대상을 선택해 주세요.';recovery.hidden=slots.length>0;}catch{if(choices.isConnected){checking=false;time='';remember();summarize();submit.disabled=true;reviewButton.disabled=true;notice.textContent='가능한 시간을 확인하지 못했습니다. 날짜를 다시 선택해 주세요.';}}});
  }
 }render();
}
export function renderTimeline(card,row){const timeline=el('ol',undefined,card);timeline.className='booking-timeline';timeline.setAttribute('aria-label','예약 진행 상태');let current=['completed'].includes(row.state)?3:['confirmed','scheduled','awaiting_completion'].includes(row.state)?2:row.state==='requested'?0:1;const labels=['요청 접수','연락·일정 조율','예약 확정','상담 종료'];for(const [index,label]of labels.entries()){const li=el('li',undefined,timeline);li.className=index<current?'done':index===current?'current':'';if(index===current)li.setAttribute('aria-current','step');const symbol=el('span',undefined,li);symbol.className='step-symbol';symbol.innerHTML=window.uiIcon?.(index<current?'check':['send','person','calendar','check'][index])||'';el('span',label,li);}if(['cancelled','no_show','dispute','unmatched'].includes(row.state))timeline.remove();}
