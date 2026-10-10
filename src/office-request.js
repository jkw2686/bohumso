import {el,kst} from './consultation-ui.js';
import {requestParams,stableRequestKey} from './request-intent.js';
const day=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(value);
const shortDate=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'short',day:'numeric',weekday:'short'}).format(value);
const purposeLabels={claim:'보험금 청구',coverage:'보장 확인',management:'내 보험 확인',new:'가입 상담',other:'기타 상담',corporate:'기업보험 상담'};
const methodLabels={phone:'전화상담 · 통화 시간 조율',nearby:'전문가가 고객에게 방문 · 장소·시간 조율',scheduled:'전문가와 상담 장소·시간 조율'};
export function renderOfficeRequest({form,command,refresh,message,selectedOffice=null,selectedPlanner=null,availability=null}){
 const params=requestParams(location.search),region=selectedOffice?.region||selectedPlanner?.region||params.get('region')||'';
 const purpose=Object.hasOwn(purposeLabels,params.get('purpose'))?params.get('purpose'):'claim';
 const method=selectedOffice?'scheduled':['phone','nearby','scheduled'].includes(params.get('method'))?params.get('method'):'scheduled';
 if(selectedOffice){params.set('office',selectedOffice.id);params.delete('planner');}else if(selectedPlanner){params.set('planner',selectedPlanner.id);params.delete('office');}
 params.set('method',method);params.set('purpose',purpose);
 let date='',time='',step=1,busy=false,checking=false;
 const chosenDate=params.get('date')||'',chosenTime=params.get('time')||'',chosenStamp=new Date(chosenDate+'T'+chosenTime+':00+09:00').getTime();
 if(region&&/^\d{4}-\d{2}-\d{2}$/.test(chosenDate)&&/^(09|1[0-7]):(00|30)$|^18:00$/.test(chosenTime)&&chosenStamp>=Date.now()+1800000&&chosenStamp<=Date.now()+90*86400000){date=chosenDate;time=chosenTime;step=2;}
 const situationLabels={death:'가족 사망',cancer:'암 진단',illness:'암·질병',hospitalization:'입원·수술',medical:'입원·수술',accident:'사고',claim:'보험금 청구',coverage:'내 보험 확인'};
 const situation=situationLabels[params.get('situation')]||'',name=selectedOffice?.name||selectedPlanner?.name||'';
 const direction=selectedOffice?'고객이 보험소에 방문 · '+(selectedOffice.address||selectedOffice.region):methodLabels[method];
 const mapURL=view=>'/map.html?'+new URLSearchParams({view,region,purpose,situation:params.get('situation')||''});
 function reselect(parent){const a=el('a',selectedOffice?'다른 보험소 선택':'다른 전문가 선택',parent);a.href=mapURL(selectedOffice?'offices':'experts');a.className='text-button';return a;}
 function remember(){params.set('region',region);for(const [key,value]of [['date',date],['time',time]])if(value)params.set(key,value);else params.delete(key);history.replaceState(null,'',location.pathname+'?'+params);}
 form.classList.add('request-wizard');form.hidden=false;form.onsubmit=e=>e.preventDefault();
 function button(parent,label,fn,cls=''){const b=el('button',label,parent);b.type='button';b.className=cls;b.onclick=fn;return b;}
 if(!selectedOffice&&!selectedPlanner){form.replaceChildren();el('h2','누구에게 도움받으실까요?',form);el('p','전문가나 방문할 보험소를 직접 선택해 주세요.',form);for(const [label,view]of [['가까운 전문가 선택','experts'],['방문할 보험소 선택','offices']]){const a=el('a',label,form);a.className='btn'+(view==='offices'?' ghost':'');a.href=mapURL(view);}return;}
 function render(){
  remember();checking=false;form.replaceChildren();el('p',step===1?'● ○ · 1 / 2':'● ● · 2 / 2',form).className='step-dots';
  el('p',name+' · '+region+' · '+(situation||purposeLabels[purpose]),form).className='wizard-context';
  el('p',direction,form).className='wizard-context';
  if(step===1){
   el('h2','어느 날이 편하세요?',form);el('p','보험사·상품명·서류를 몰라도 요청할 수 있어요. 연결 후 함께 확인하세요.',form);
   const choices=el('div',undefined,form);choices.className='choice-grid';
   for(let i=0;i<7;i++){const d=new Date(Date.now()+i*86400000),v=day(d);button(choices,(i===0?'오늘 · ':i===1?'내일 · ':'')+shortDate(d),()=>{date=v;time='';step=2;render();}).setAttribute('aria-pressed',String(date===v));}
   const more=el('details',undefined,form);el('summary','다른 날짜',more);const label=el('label','희망 날짜',more),input=el('input',undefined,label);input.type='date';input.min=day(new Date());input.max=day(new Date(Date.now()+90*86400000));const hint=el('p','',more);hint.setAttribute('role','alert');
   input.onchange=()=>{if(input.checkValidity()&&input.value){date=input.value;time='';step=2;render();}else{hint.textContent='오늘부터 90일 이내의 날짜를 선택해 주세요.';input.setAttribute('aria-invalid','true');input.focus();}};reselect(form);return;
  }
  el('h2','몇 시가 편하세요?',form);el('p',shortDate(new Date(date+'T12:00:00+09:00')),form);
  const choices=el('div',undefined,form);choices.className='choice-grid';
  const selection=el('p','',form);selection.className='wizard-context';selection.setAttribute('role','status');
  function summarize(){selection.textContent=time?name+' · '+(selectedOffice?'보험소 방문':method==='phone'?'전화상담':method==='nearby'?'전문가 방문':'상담 일정 조율')+' · 희망 '+date+' '+time+' (확정 전)':'희망 시간을 선택해 주세요.';}
  for(let minute=540;minute<=1080;minute+=(selectedOffice?60:30)){
   const value=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0'),stamp=new Date(date+'T'+value+':00+09:00');
   const b=button(choices,value,()=>{time=value;remember();summarize();choices.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));submit.disabled=checking;});b.setAttribute('aria-pressed',String(time===value));b.disabled=stamp.getTime()<Date.now()+1800000;
  }
  const notice=el('p','연락·일정을 조율하고 필요한 확인을 마친 뒤 확정됩니다.',form);notice.setAttribute('role','status');
  const recovery=el('div','',form);recovery.hidden=true;reselect(recovery);
  const submit=button(form,'이 시간으로 신청',async()=>{
   if(busy||checking||!time)return;
   const stamp=new Date(date+'T'+time+':00+09:00').getTime();if(!Number.isFinite(stamp)||stamp<Date.now()+1800000||stamp>Date.now()+90*86400000){notice.textContent='예약시간을 다시 선택해 주세요.';time='';remember();summarize();submit.disabled=true;return;}
   busy=true;const enabled=[...form.querySelectorAll('button')].filter(b=>!b.disabled);form.querySelectorAll('button').forEach(b=>b.disabled=true);notice.textContent='요청을 전달하고 있어요.';
   const when=new Date(stamp).toISOString(),payload={office_assignment:!!selectedOffice,...(selectedOffice?{office_id:selectedOffice.id}:{planner_id:selectedPlanner.id}),purpose,region,method,preferred_at:when};payload.request_key=stableRequestKey(payload);
   try{
    await command('request',payload);form.replaceChildren();el('h2','상담 요청이 접수되었습니다.',form);el('p',name+' · '+direction,form);el('p','희망시간 · '+kst(when)+' (확정 전)',form);el('p','전문가 수락과 필요한 확인 후 일정이 확정됩니다. 내 예약에서 진행 상태를 확인하세요.',form);
    button(form,'예약 확인',()=>document.getElementById('requestList').scrollIntoView({behavior:'smooth',block:'start'}),'primary');message('');
    try{await refresh();}catch{el('p','요청은 접수됐지만 내역을 불러오지 못했어요. 내 예약을 새로고침해 주세요.',form);}return;
   }catch(error){
    const unavailable=['new_appointments_restricted','invalid_partner','office_not_active','visit_not_available','select_planner'].includes(error.message);
    const messages={new_appointments_restricted:'새 약속은 잠시 제한됩니다. 기존 약속 관리와 운영자 문의는 이용할 수 있어요.',request_limit:'진행 중인 요청을 내 예약에서 먼저 확인해 주세요.',invalid_slot:'이 시간은 이용할 수 없습니다. 다른 시간을 선택해 주세요.',slot_unavailable:'이 시간은 이용할 수 없습니다. 다른 시간을 선택해 주세요.',membership_required:'회원가입을 완료한 후 이용할 수 있습니다.',phone_verification_required:'휴대전화 인증 후 같은 요청을 이어갈 수 있어요.',invalid_partner:'선택한 전문가가 현재 요청을 받을 수 없습니다. 다른 전문가를 직접 선택해 주세요.',office_not_active:'선택한 보험소는 현재 방문예약을 받을 수 없습니다.',visit_not_available:'현재 이 전문가에게 방문을 요청할 수 없습니다.',select_planner:'전문가를 다시 선택해 주세요.',request_key_conflict:'선택 정보가 바뀌었어요. 전문가와 시간을 다시 확인해 주세요.',request_closed:'이미 종료된 요청입니다. 내 예약을 확인하거나 다른 시간을 선택해 주세요.'};
    notice.textContent=messages[error.message]||(error.code==='23505'?'이미 예약된 시간입니다. 다른 시간을 선택해 주세요.':'연결을 확인한 뒤 다시 시도해 주세요. 같은 요청은 중복 접수되지 않습니다.');
    recovery.hidden=!unavailable;
    if(error.message==='phone_verification_required'){recovery.hidden=false;const a=el('a','휴대전화 인증 후 이어가기',recovery);a.href='/phone-verification.html?next='+encodeURIComponent(location.pathname+'?'+params);}
    // Recover controls using the current availability instead of enabling stale slots.
    enabled.forEach(b=>b.disabled=false);if(unavailable)submit.disabled=true;else submit.disabled=false;
    dateButton.disabled=false;
   }finally{busy=false;}
  },'primary');
  const dateButton=button(form,'날짜 변경',()=>{step=1;render();},'text-button');summarize();submit.disabled=!time;
  if(availability){
   const requestedDay=date;checking=true;submit.disabled=true;choices.querySelectorAll('button').forEach(b=>b.disabled=true);notice.textContent='가능한 시간을 확인하고 있어요.';
   queueMicrotask(async()=>{try{const slots=await availability(selectedOffice?.id||null,selectedPlanner?.id||null,requestedDay,method);if(date!==requestedDay||!choices.isConnected)return;checking=false;choices.querySelectorAll('button').forEach(b=>b.disabled=!slots.includes(b.textContent));if(!slots.includes(time)){time='';remember();summarize();}submit.disabled=!time;notice.textContent=slots.length?'희망시간을 요청하고 연락·일정 조율 후 확정해요.':'이 날짜에는 가능한 시간이 없습니다. 다른 날짜나 대상을 선택해 주세요.';recovery.hidden=slots.length>0;}catch{if(choices.isConnected){checking=false;time='';remember();summarize();submit.disabled=true;notice.textContent='가능한 시간을 확인하지 못했습니다. 날짜를 다시 선택해 주세요.';}}});
  }
 }render();
}
export function renderTimeline(card,row){const timeline=el('ol',undefined,card);timeline.className='booking-timeline';timeline.setAttribute('aria-label','예약 진행 상태');let current=['completed'].includes(row.state)?3:['confirmed','scheduled','awaiting_completion'].includes(row.state)?2:row.state==='requested'?0:1;const labels=['요청 접수','연락·일정 조율','예약 확정','상담 종료'];for(const [index,label]of labels.entries()){const li=el('li',undefined,timeline);li.className=index<current?'done':index===current?'current':'';if(index===current)li.setAttribute('aria-current','step');const symbol=el('span',undefined,li);symbol.className='step-symbol';symbol.innerHTML=window.uiIcon?.(index<current?'check':['send','person','calendar','check'][index])||'';el('span',label,li);}if(['cancelled','no_show','dispute','unmatched'].includes(row.state))timeline.remove();}
