import {renderAdminBookingMap} from './admin-booking-map.js';
import {renderOfficeRequest,renderTimeline} from './office-request.js';
import {renderAds} from './ad-subscription.js';
import {purposes,states,kst,won,el,input,select,link} from './consultation-ui.js';
export async function renderWorkflow({client,membership,workspace,message,action}){
 const host=document.getElementById('requestList'),content=document.getElementById('accountContent');let snapshot;
 if(!membership.member||(workspace==='admin'&&!membership.admin)||(workspace==='partner'&&membership.partner_status!=='approved')){content.hidden=true;message('가입 완료 또는 관리자 권한이 필요합니다.');return;}
 const rpc=async(name,args)=>{const {data,error}=await client.rpc(name,args);if(error)throw error;return data;};
 const command=async(operation,payload)=>rpc('consultation_command',{operation,payload});
 function submit(form,fn){form.onsubmit=e=>{e.preventDefault();action(form,async()=>{await fn(new FormData(form));await refresh();message('저장했습니다.');});};}
 function check(form,label,name){const node=input(form,label,name,'checkbox');node.value='on';return node;}
 function btn(parent,title,fn){const button=el('button',title,parent);button.type='button';button.onclick=()=>action(parent,async()=>{await fn();await refresh();});return button;}
 function scheduleForm(parent,row){const details=el('details',undefined,parent);el('summary','일정 변경',details);const form=el('form',undefined,details);form.className='inline-form';el('h3','다른 일정 제안 · 같은 예약 유지',form);const date=input(form,'희망 날짜 (KST)','date','date');date.required=true;const time=input(form,'희망 시간 (KST, 30분 단위)','time','time');time.step=1800;time.required=true;el('button','일정 제안',form).type='submit';submit(form,d=>command('propose',{id:row.id,revision:row.revision,preferred_at:new Date(d.get('date')+'T'+d.get('time')+':00+09:00').toISOString()}));}
 async function refresh(){
  snapshot=await rpc('consultation_workspace',{workspace});host.replaceChildren();const summary=document.getElementById('workflowSummary');summary.replaceChildren();
  if(['partner','admin'].includes(workspace)){const ads=el('section',undefined,summary);await renderAds({client,workspace,host:ads,message,action});}
  if(workspace==='admin'){
   const counts={};snapshot.bookings.forEach(b=>counts[b.state]=(counts[b.state]||0)+1);
   const metrics=await rpc('consultation_metrics',{});el('p','오늘 방문 세션 '+metrics.visit_sessions+' · 오늘 요청 '+metrics.today_requests+' · 활성 설계사 '+metrics.active_planners+' · 신규 설계사 '+metrics.new_planners,summary);el('p','방문은 익명 세션 기준이며 사람 수와 다를 수 있습니다. 집계 설정이 꺼져 있으면 수집하지 않습니다. 테스트 승인 합계 '+won(metrics.test_paid_won)+' (실매출 아님)',summary);
   const performance=el('details',undefined,summary);el('summary','설계사별 상담 현황 (참고용)',performance);for(const p of metrics.planner_summary)el('p',(p.sample?'[샘플] ':'')+p.name+' · 완료 '+p.completed+'건',performance);
   el('p',Object.entries(counts).map(([s,n])=>states[s]+' '+n+'건').join(' / ')||'상담 접수 없음',summary);
   el('p','고객 미응답 확인 대상 '+snapshot.bookings.filter(b=>b.needs_admin_review).length+'건 · 미응답만으로 완료 처리하지 않습니다.',summary);
   const verify=el('details',undefined,summary);verify.id='plannerVerification';el('summary','설계사 등록 확인 · 테스트/운영 구분',verify);
   for(const p of snapshot.planner_profiles||[]){const form=el('form',undefined,verify);el('p','프로필 '+p.user_id+(p.verified_at?' · 확인 이력 있음':' · 미확인'),form);input(form,'등록기관 + 등록번호 (주민등록번호 금지)','identity_key').required=true;const evidence=input(form,'실제로 확인한 자격·소속·공개 정보 및 근거','evidence');evidence.minLength=5;evidence.required=true;check(form,'확인 근거를 실제로 검토했습니다. 가상 계정이면 반드시 샘플로 표시합니다.','checked').required=true;const sample=check(form,'샘플·가상 설계사입니다 (운영 승인이 아님)','is_sample');sample.checked=p.is_sample!==false;el('button','등록 확인 기록',form).type='submit';submit(form,d=>command('verify_planner',{planner_id:p.user_id,identity_key:d.get('identity_key'),evidence:d.get('evidence'),checked:d.get('checked')==='on',is_sample:d.get('is_sample')==='on'}));}
  }
  const filters=document.getElementById('workflowFilters');const filterData=filters?new FormData(filters):null;
  const rows=snapshot.bookings.filter(b=>(!filterData?.get('state')||b.state===filterData.get('state'))&&(!filterData?.get('purpose')||b.purpose===filterData.get('purpose'))&&(!filterData?.get('region')||b.region.includes(filterData.get('region')))&&(!filterData?.get('planner')||(b.planner_name||'').includes(filterData.get('planner')))&&(!filterData?.get('date')||new Date(b.preferred_at).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})===filterData.get('date')));
  if(!rows.length){const empty=el('section',undefined,host);empty.className='card';el('h2','아직 예약이 없어요.',empty);el('p','편한 시간을 선택하면 보험소가 도와드릴게요.',empty);}
  for(const row of rows){
   const card=el('article',undefined,host);card.className='card booking-card';card.dataset.bookingId=row.id;
   el('h2',purposes[row.purpose]+' · '+row.region,card);el('p',workspace==='customer'&&row.allocation_mode==='office'?({requested:row.planner_id?'전문가가 확인하고 있어요.':'보험소에서 담당자를 배정하고 있어요.',scheduled:'예약이 확정됐어요.',completed:'상담이 잘 마무리됐어요.'}[row.state]||states[row.state]):states[row.state],card).className='request-status';if(workspace==='customer')renderTimeline(card,row);
   el('p',kst(row.preferred_at)+' KST · '+({phone:'통화 요청',nearby:'바로 만나기 (장소·일정 협의)',scheduled:'시간 예약'}[row.method]),card);
   el('p',row.planner_name?(row.planner_sample?'테스트 설계사: ':'담당 전문가: ')+row.planner_name+' · '+row.organization:(row.allocation_mode==='office'?'보험소 담당자 배정 대기':'전문가 모집 중'),card);
   if(row.contact)el('p','예약자 '+row.contact.name+' · '+row.contact.phone,card);
   if(workspace==='customer'&&row.planner_phone)link(card,'설계사에게 전화하기','tel:'+row.planner_phone);
   if(row.state==='dispute'||row.state==='no_show')el('p','관리자 확인 중입니다. 상담 문제 신고는 광고 구독 결제와 별도로 처리합니다.',card);
   if(row.needs_admin_review)el('p','고객 완료 확인 미응답 · 관리자 확인 대상',card);
   if(workspace==='admin'&&row.allocation_mode==='office'&&['requested','coordinating'].includes(row.state)){
    const assign=el('form',undefined,card),catalog=await rpc('planner_catalog',{area:'',wanted:row.purpose});
    select(assign,'담당자','target',{'':'담당자를 선택하세요',...Object.fromEntries(catalog.planners.filter(p=>p.available&&!p.is_sample).map(p=>[p.id,p.name+' · '+p.region]))}).required=true;
    el('button','담당자 배정',assign).type='submit';submit(assign,d=>command('office_assign',{id:row.id,revision:row.revision,planner_id:d.get('target')}));
   }
   if(row.journey_state&&row.state==='scheduled'&&row.method!=='phone'){const journey=el('p',row.journey_state==='arrived'?'전문가가 도착했어요.':'전문가가 이동을 시작했어요.',card);journey.className='journey-status';const icon=el('span',undefined,journey);icon.innerHTML=window.uiIcon?.(row.journey_state==='arrived'?'pin':'car')||'';el('small','전문가가 직접 알린 상태예요.',card);}
   const controls=el('div',undefined,card);controls.className='review-actions';const run=operation=>command(operation,{id:row.id,revision:row.revision});
   if(workspace==='partner'&&['requested','coordinating'].includes(row.state)){
    const form=el('form',undefined,card);el('p','상담 목적과 희망 시간을 확인한 뒤 수락해 주세요.',form);
    el('button','상담 목적 확인·수락',form).type='submit';submit(form,d=>command('accept',{id:row.id,revision:row.revision,}));
    if(row.state==='requested')btn(controls,'이번 상담 패스',()=>run('pass'));
   }
   if(workspace==='customer'&&row.allocation_mode==='office'&&row.state==='coordinating'&&row.planner_ok)btn(controls,'변경 시간 확인',()=>run('office_confirm'));
   if(workspace==='customer'&&row.allocation_mode!=='office'&&row.state==='coordinating'&&row.planner_ok){
    const form=el('form',undefined,card),name=input(form,'예약자 이름','name'),phone=input(form,'연락처','phone','tel');name.required=phone.required=true;name.minLength=2;name.maxLength=60;phone.pattern='0[0-9 -]{8,13}';
    check(form,'선택한 '+row.planner_name+'에게 이름·연락처를 상담 일정 연락 목적으로 제공하는 데 동의합니다.','share_consent').required=true;link(form,'제공 항목·보유 기간 확인','/privacy.html');
    el('p','소비자 이용은 무료이며 보험 가입 의무가 없습니다. 광고 구독은 상담 이용과 별도입니다.',form);el('button','동의하고 일정 확정',form).type='submit';submit(form,d=>command('confirm',{id:row.id,revision:row.revision,...Object.fromEntries(d),share_consent:d.get('share_consent')==='on'}));
   }
   if(['customer','partner'].includes(workspace)&&['requested','coordinating','confirmed','scheduled'].includes(row.state))scheduleForm(card,row);
   if(['requested','coordinating','confirmed','scheduled','unmatched'].includes(row.state))btn(controls,'예약 취소',async()=>{if(confirm('이 예약을 취소할까요? 광고 구독에는 영향을 주지 않습니다.'))await run('cancel');});
   if(workspace==='partner'&&row.state==='scheduled'&&row.method!=='phone'&&row.journey_state!=='arrived')btn(controls,row.journey_state==='departed'?'도착 알리기':'출발 알리기',()=>command('journey',{id:row.id,revision:row.revision,state:row.journey_state==='departed'?'arrived':'departed'}));
   if(workspace==='partner'&&row.state==='scheduled'&&new Date(row.preferred_at)<=new Date())btn(controls,'미팅 완료 확인 요청',()=>run('complete_request'));
   if(workspace==='customer'&&row.state==='awaiting_completion'){el('p','보험 가입 여부와 관계없이 실제 미팅이 이루어졌을 때만 확인해 주세요.',card);btn(controls,'실제 미팅 완료 확인',()=>run('complete_confirm'));}
   if(workspace==='customer'&&row.state==='completed'&&!row.review){const form=el('form',undefined,card);el('h3','완료한 미팅 후기',form);select(form,'평점','rating',{'5':'5점','4':'4점','3':'3점','2':'2점','1':'1점'});const body=input(form,'후기 (병명·개인정보·보험계약 내용 입력 금지)','body');body.minLength=2;body.maxLength=500;body.required=true;check(form,'후기와 평점 공개에 동의합니다. 검토 후 공개됩니다.','public_consent').required=true;el('button','후기 제출',form).type='submit';submit(form,d=>command('review',{id:row.id,revision:row.revision,rating:Number(d.get('rating')),body:d.get('body'),public_consent:d.get('public_consent')==='on'}));}
   if(row.review){el('p','후기 '+row.review.rating+'점 · '+row.review.body+' · '+(row.review.visible?'공개':'검토 대기'),card);if(workspace==='admin'){const form=el('form',undefined,card);const reason=input(form,'개인정보·민감정보 검토 결과','reason');reason.minLength=5;reason.required=true;const visible=check(form,'후기 공개','visible');visible.checked=row.review.visible;el('button','후기 검토 저장',form).type='submit';submit(form,d=>command('publish_review',{id:row.id,revision:row.revision,reason:d.get('reason'),visible:d.get('visible')==='on'}));}}
   if(row.state==='completed'&&workspace!=='admin'){
    const f=el('form',undefined,card);el('h3','같은 상담의 후속 미팅 · 추가 과금 없음',f);input(f,'후속 날짜 (KST)','date','date').required=true;const t=input(f,'후속 시간 (KST)','time','time');t.step=1800;t.required=true;el('button','후속 일정 제안',f).type='submit';submit(f,d=>command('followup_propose',{id:row.id,revision:row.revision,preferred_at:new Date(d.get('date')+'T'+d.get('time')+':00+09:00').toISOString()}));
   }
   for(const f of row.followups||[]){const section=el('section',undefined,card);el('p','후속 미팅 · '+kst(f.preferred_at)+' KST · '+({proposed:'상대방 확인 대기',confirmed:'확정',cancelled:'취소'}[f.state])+' · 추가 과금 없음',section);if(workspace!=='admin'&&f.state==='proposed'&&f.can_confirm)btn(section,'후속 일정 확인',()=>command('followup_confirm',{id:row.id,revision:row.revision,followup_id:f.id}));if(workspace!=='admin'&&f.state!=='cancelled')btn(section,'후속 일정 취소',()=>command('followup_cancel',{id:row.id,revision:row.revision,followup_id:f.id}));}
   const issue=el('details',undefined,card);el('summary','문의·문제 신고',issue);const issueForm=el('form',undefined,issue);select(issueForm,'종류','category',{question:'문의',no_show:'노쇼 신고',dispute:'분쟁 신고',refund:'환불 문의'});const reason=input(issueForm,'내용 (병명·증권번호·건강정보·주민등록번호는 적지 마세요)','reason');reason.required=true;reason.minLength=3;reason.maxLength=1000;el('button','접수',issueForm).type='submit';submit(issueForm,d=>command('issue',{id:row.id,...Object.fromEntries(d)}));
   for(const i of row.issues||[])el('p',(i.resolved?'처리 완료: ':'확인 중: ')+i.reason+(i.resolution?' / '+i.resolution:''),issue);
   if(workspace==='admin'&&['dispute','no_show'].includes(row.state)){const form=el('form',undefined,card);select(form,'확인 결과','outcome',{cancelled:'미완료 취소',scheduled:'미팅 재개 (고객 완료 확인 필요)'});const reason=input(form,'확인 근거·사유','reason');reason.required=true;reason.minLength=5;el('button','예외 처리 기록',form).type='submit';submit(form,d=>command('resolve_issue',{id:row.id,...Object.fromEntries(d)}));}
   if(workspace==='admin'){const audit=el('details',undefined,card);el('summary','처리 이력·확인 근거',audit);for(const e of row.events||[])el('p',kst(e.created_at)+' KST · '+e.event+' · 담당자 '+(e.actor||'시스템')+(e.reason?' · '+e.reason:''),audit);}
  }
  if(workspace==='admin')renderAdminBookingMap(rows);
 }
 document.getElementById('refreshRequests').onclick=()=>action(content,refresh);
 const form=document.getElementById('requestForm');
 if(form){
  const params=new URLSearchParams(location.search),officeId=params.get('office'),plannerId=params.get('planner');let selectedOffice=null,selectedPlanner=null;
  if(officeId){const offices=await rpc('office_catalog',{});selectedOffice=offices.find(o=>o.id===officeId&&o.status==='active');if(!selectedOffice){form.hidden=false;el('h2','개설 예정 보험소는 아직 예약할 수 없어요.',form);link(form,'지도 둘러보기','/map.html');}else renderOfficeRequest({form,command,refresh,message,selectedOffice});}
  else if(plannerId){const catalog=await rpc('planner_catalog',{area:'',wanted:params.get('purpose')||'claim'});selectedPlanner=catalog.planners.find(p=>p.id===plannerId&&p.available&&!p.is_sample);if(!selectedPlanner){form.hidden=false;el('h2','현재 요청할 수 없는 전문가예요.',form);link(form,'다른 전문가 보기','/map.html?view=experts');}else if(params.get('method')==='nearby'&&!(selectedPlanner.visitEnabled&&selectedPlanner.available_slots?.length)){form.hidden=false;el('h2','방문 요청을 준비하고 있어요.',form);link(form,'상담 예약하기','/requests.html?planner='+encodeURIComponent(plannerId)+'&region='+encodeURIComponent(selectedPlanner.region)+'&method=scheduled');}else renderOfficeRequest({form,command,refresh,message,selectedPlanner});}
  else renderOfficeRequest({form,command,refresh,message});
 }
 document.getElementById('workflowFilters')?.addEventListener('submit',e=>{e.preventDefault();action(content,refresh);});
 await refresh();
 const poll=setInterval(()=>{if(!document.hidden&&!document.activeElement?.closest('form'))refresh().catch(()=>{});},30000);window.addEventListener('pagehide',()=>clearInterval(poll),{once:true});
 // Read-only access to requests created before the new workflow. No old completion or payment actions.
 const legacy=document.getElementById('legacyRequests');if(legacy){try{const rows=await rpc('list_service_requests',{workspace});for(const r of rows)el('p','이전 예약 · '+r.region+' · '+kst(r.requested_at)+' KST · '+r.status,legacy);}catch{el('p','이전 예약을 불러오지 못했습니다.',legacy);}}
}
export async function renderPaymentResult(client,message){
 const query=new URLSearchParams(location.search);if(query.has('failed')){message('결제가 완료되지 않았습니다. 광고 구독 화면에서 결제 상태를 확인하고 다시 시도해 주세요.');return;}
 const orderId=query.get('orderId'),paymentKey=query.get('paymentKey'),amount=Number(query.get('amount'));
 if(!orderId||!paymentKey||!Number.isSafeInteger(amount)){message('결제 결과 정보가 없습니다.');return;}
 const {data}=await client.auth.getSession();const response=await fetch('/api/payment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({action:'confirm',orderId,paymentKey,amount})});const result=await response.json();
 message(response.ok&&result.status==='DONE'?'서버에서 테스트 결제 승인을 확인했습니다.':'결제 승인이 확인되지 않았습니다. 광고 구독 화면에서 상태를 다시 확인해 주세요.');
 if(response.ok&&result.status==='DONE')history.replaceState(null,'','/payment-result.html');
}
