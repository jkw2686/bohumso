import {purposes,states,payments,kst,won,el,input,select,link} from './consultation-ui.js';
export async function renderWorkflow({client,membership,workspace,message,action}){
 const host=document.getElementById('requestList'),content=document.getElementById('accountContent');let snapshot;
 if(!membership.member||(workspace==='admin'&&!membership.admin)){content.hidden=true;message('가입 완료 또는 관리자 권한이 필요합니다.');return;}
 const rpc=async(name,args)=>{const {data,error}=await client.rpc(name,args);if(error)throw error;return data;};
 const command=async(operation,payload)=>rpc('consultation_command',{operation,payload});
 async function pay(body){const {data}=await client.auth.getSession();const response=await fetch('/api/payment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw Error(result.error);return result;}
 async function checkout(row,stage){const data=await pay({action:'checkout',bookingId:row.id,stage});if(!data.testOnly||!data.clientKey.startsWith('test_ck_'))throw Error('live_payments_blocked');
  if(!window.TossPayments)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://js.tosspayments.com/v2/standard';script.onload=resolve;script.onerror=reject;document.head.append(script);});
  // 결제위젯: 카드 + 상점에서 켠 모든 간편결제를 한 화면에서 선택. 금액은 서버가 주문에 고정하고 승인 시 재검증한다.
  const widgets=window.TossPayments(data.clientKey).widgets({customerKey:data.order.customer_key});
  await widgets.setAmount({currency:'KRW',value:data.order.amount});
  const overlay=el('div',undefined,document.body);overlay.className='sheet-overlay show pay-overlay';
  const sheet=el('div',undefined,overlay);sheet.className='sheet';
  el('h3','상담 연결 '+stage+'차 · '+won(data.order.amount)+' (테스트 결제)',sheet);
  el('p','카드 또는 간편결제를 선택하세요. 테스트 상점 결제이며 실제 청구되지 않습니다.',sheet);
  const methodBox=el('div',undefined,sheet);methodBox.id='payment-method';
  const agreementBox=el('div',undefined,sheet);agreementBox.id='agreement';
  const actions=el('div',undefined,sheet);actions.style.cssText='display:flex;gap:8px;margin-top:12px';
  const payBtn=el('button','결제하기',actions);payBtn.type='button';payBtn.className='btn';
  const cancelBtn=el('button','닫기',actions);cancelBtn.type='button';cancelBtn.className='btn ghost';
  const close=()=>overlay.remove();cancelBtn.onclick=close;overlay.onclick=e=>{if(e.target===overlay)close();};
  await Promise.all([widgets.renderPaymentMethods({selector:'#payment-method',variantKey:'DEFAULT'}),widgets.renderAgreement({selector:'#agreement',variantKey:'AGREEMENT'})]);
  payBtn.onclick=async()=>{payBtn.disabled=true;try{await widgets.requestPayment({orderId:data.order.id,orderName:'보험소 상담 연결 '+stage+'차 (테스트)',successUrl:data.successUrl,failUrl:data.failUrl});}catch(e){payBtn.disabled=false;message('결제를 시작하지 못했습니다: '+(e&&e.message?e.message:e));}};
 }
 function submit(form,fn){form.onsubmit=e=>{e.preventDefault();action(form,async()=>{await fn(new FormData(form));await refresh();message('저장했습니다.');});};}
 function check(form,label,name){const node=input(form,label,name,'checkbox');node.value='on';return node;}
 function btn(parent,title,fn){const button=el('button',title,parent);button.type='button';button.onclick=()=>action(parent,async()=>{await fn();await refresh();});return button;}
 function scheduleForm(parent,row){const form=el('form',undefined,parent);form.className='inline-form';el('h3','다른 일정 제안 · 같은 예약 유지',form);const date=input(form,'희망 날짜 (KST)','date','date');date.required=true;const time=input(form,'희망 시간 (KST, 30분 단위)','time','time');time.step=1800;time.required=true;el('button','일정 제안',form).type='submit';submit(form,d=>command('propose',{id:row.id,revision:row.revision,preferred_at:new Date(d.get('date')+'T'+d.get('time')+':00+09:00').toISOString()}));}
 async function refresh(){
  snapshot=await rpc('consultation_workspace',{workspace});host.replaceChildren();const summary=document.getElementById('workflowSummary');summary.replaceChildren();
  if(workspace==='partner'){
   el('p','무료 잔여 '+snapshot.free_remaining+'건 · 임시 배정 '+snapshot.free_reserved+'건 · 사용 '+snapshot.free_used+'건',summary);
   el('p','첫 완료 미팅 '+snapshot.policy.free_meetings+'건 무료. 이후 총 '+won(snapshot.policy.total_won)+'(부가세 포함), '+won(snapshot.policy.total_won/2)+'씩 직접 2회 결제합니다. 무료 체험에 카드 등록은 필요 없으며 자동 결제되지 않습니다.',summary);
  }
  if(workspace==='admin'){
   const counts={};snapshot.bookings.forEach(b=>counts[b.state]=(counts[b.state]||0)+1);
   const metrics=await rpc('consultation_metrics',{});el('p','오늘 방문 세션 '+metrics.visit_sessions+' · 오늘 요청 '+metrics.today_requests+' · 활성 설계사 '+metrics.active_planners+' · 신규 설계사 '+metrics.new_planners+' · 유료 예상 '+metrics.expected_paid+'건',summary);el('p','방문은 익명 세션 기준이며 사람 수와 다를 수 있습니다. 집계 설정이 꺼져 있으면 수집하지 않습니다. 테스트 승인 합계 '+won(metrics.test_paid_won)+' (실매출 아님)',summary);
   const performance=el('details',undefined,summary);el('summary','설계사별 상담·무료 이용 현황',performance);for(const p of metrics.planner_summary)el('p',(p.sample?'[샘플] ':'')+p.name+' · 완료 '+p.completed+'건 · 무료 잔여 '+p.free_remaining+'건',performance);
   el('p',Object.entries(counts).map(([s,n])=>states[s]+' '+n+'건').join(' / ')||'상담 접수 없음',summary);
   el('p','고객 미응답 확인 대상 '+snapshot.bookings.filter(b=>b.needs_admin_review).length+'건 · 미응답만으로 완료·잔금 처리하지 않습니다.',summary);
   const verify=el('details',undefined,summary);verify.id='plannerVerification';el('summary','설계사 등록 확인 · 테스트/운영 구분',verify);
   for(const p of snapshot.planner_profiles||[]){const form=el('form',undefined,verify);el('p','프로필 '+p.user_id+(p.verified_at?' · 확인 이력 있음':' · 미확인'),form);input(form,'등록기관 + 등록번호 (주민등록번호 금지)','identity_key').required=true;const evidence=input(form,'실제로 확인한 자격·소속·공개 정보 및 근거','evidence');evidence.minLength=5;evidence.required=true;check(form,'확인 근거를 실제로 검토했습니다. 가상 계정이면 반드시 샘플로 표시합니다.','checked').required=true;const sample=check(form,'샘플·가상 설계사입니다 (운영 승인이 아님)','is_sample');sample.checked=p.is_sample!==false;el('button','등록 확인 기록',form).type='submit';submit(form,d=>command('verify_planner',{planner_id:p.user_id,identity_key:d.get('identity_key'),evidence:d.get('evidence'),checked:d.get('checked')==='on',is_sample:d.get('is_sample')==='on'}));}
   const pf=el('form',undefined,summary);pf.id='pricingPolicy';el('h3','신규 예약 가격 정책',pf);input(pf,'무료 완료 미팅 수','free_meetings','number',snapshot.policy.free_meetings).min=0;input(pf,'총 금액 (VAT 포함, 짝수 원)','total_won','number',snapshot.policy.total_won).step=2;const why=input(pf,'변경 사유','reason');why.required=true;why.minLength=3;el('button','신규 정책 저장',pf).type='submit';submit(pf,d=>command('policy',Object.fromEntries(d)));
  }
  const filters=document.getElementById('workflowFilters');const filterData=filters?new FormData(filters):null;
  const rows=snapshot.bookings.filter(b=>(!filterData?.get('state')||b.state===filterData.get('state'))&&(!filterData?.get('purpose')||b.purpose===filterData.get('purpose'))&&(!filterData?.get('region')||b.region.includes(filterData.get('region')))&&(!filterData?.get('planner')||(b.planner_name||'').includes(filterData.get('planner')))&&(!filterData?.get('date')||new Date(b.preferred_at).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})===filterData.get('date')));
  if(!rows.length)el('p','표시할 상담이 없습니다.',host);
  for(const row of rows){
   const card=el('article',undefined,host);card.className='card booking-card';card.dataset.bookingId=row.id;
   el('h2',purposes[row.purpose]+' · '+row.region,card);el('p',states[row.state],card).className='request-status';
   el('p',kst(row.preferred_at)+' KST · '+({phone:'통화 요청',nearby:'근처에서 만나기',scheduled:'시간 약속하기'}[row.method]),card);
   el('p',row.planner_name?(row.planner_sample?'테스트 설계사: ':'선택한 설계사: ')+row.planner_name+' · '+row.organization:'전문가 모집 중',card);
   el('p','결제: '+payments[row.payment_state]+(row.is_free===null?' · 확정 시 무료 여부 결정':row.is_free?' · 무료 예약':(' · 총 '+won(row.total_won)+' / 정책 '+row.policy_id)),card).className='payment-status';
   if(row.contact)el('p','예약자 '+row.contact.name+' · '+row.contact.phone,card);
   if(workspace==='customer'&&row.planner_phone)link(card,'설계사에게 전화하기','tel:'+row.planner_phone);
   if(row.is_free===false&&!row.first_paid)el('p','일정 확정과 결제는 별도입니다. 설계사의 1차 결제 전에는 미팅 예정으로 처리되지 않습니다.',card);
   if(row.state==='dispute'||row.state==='no_show')el('p','관리자 확인 중입니다. 분쟁 중 잔금 청구는 보류합니다.',card);
   if(row.needs_admin_review)el('p','고객 완료 확인 미응답 · 관리자 확인 대상',card);
   const controls=el('div',undefined,card);controls.className='review-actions';const run=operation=>command(operation,{id:row.id,revision:row.revision});
   if(workspace==='partner'&&['requested','coordinating'].includes(row.state)){
    const form=el('form',undefined,card);el('p','상담 목적과 희망 시간을 확인한 뒤 수락해 주세요.',form);
    if(row.is_free===null){const consent=check(form,'무료 이용권이 없거나 다른 예약에 배정되면 총 '+won(snapshot.policy.total_won)+'(VAT 포함)을 2회 직접 결제하는 데 동의합니다. 원하지 않으면 선택하지 마세요.','paid_consent');el('p','현재 무료 잔여 '+snapshot.free_remaining+'건. 확정 시점에 최종 배정됩니다.',form);}
    el('button','상담 목적 확인·수락',form).type='submit';submit(form,d=>command('accept',{id:row.id,revision:row.revision,policy_id:snapshot.policy.id,paid_consent:d.get('paid_consent')==='on'}));
    if(row.state==='requested')btn(controls,'이번 상담 패스',()=>run('pass'));
   }
   if(workspace==='customer'&&row.state==='coordinating'&&row.planner_ok){
    const form=el('form',undefined,card),name=input(form,'예약자 이름','name'),phone=input(form,'연락처','phone','tel');name.required=phone.required=true;name.minLength=2;name.maxLength=60;phone.pattern='0[0-9 -]{8,13}';
    check(form,'선택한 '+row.planner_name+'에게 이름·연락처를 상담 일정 연락 목적으로 제공하는 데 동의합니다.','share_consent').required=true;link(form,'제공 항목·보유 기간 확인','/privacy.html');
    el('p','소비자 이용은 무료이며 보험 가입 의무가 없습니다. 연결 서비스 이용료는 설계사가 부담합니다.',form);el('button','동의하고 일정 확정',form).type='submit';submit(form,d=>command('confirm',{id:row.id,revision:row.revision,...Object.fromEntries(d),share_consent:d.get('share_consent')==='on'}));
   }
   if(['customer','partner'].includes(workspace)&&['requested','coordinating','confirmed','scheduled'].includes(row.state))scheduleForm(card,row);
   if(['requested','coordinating','confirmed','scheduled','unmatched'].includes(row.state))btn(controls,'예약 취소',async()=>{if(confirm('이 예약을 취소할까요? 결제된 건은 환불 검토 상태가 됩니다.'))await run('cancel');});
   if(workspace==='customer'&&row.automatic&&['requested','unmatched'].includes(row.state)&&(row.state==='unmatched'||new Date(row.response_deadline)<=new Date()))btn(controls,'다음 후보 찾기',()=>run('rematch'));
   if(workspace==='partner'&&row.state==='scheduled'&&new Date(row.preferred_at)<=new Date())btn(controls,'미팅 완료 확인 요청',()=>run('complete_request'));
   if(workspace==='customer'&&row.state==='awaiting_completion'){el('p','보험 가입 여부와 관계없이 실제 미팅이 이루어졌을 때만 확인해 주세요.',card);btn(controls,'실제 미팅 완료 확인',()=>run('complete_confirm'));}
   if(workspace==='partner'&&row.payment_state!=='confirming'&&!row.is_free&&((row.state==='confirmed'&&!row.first_paid)||(row.state==='completed'&&!row.second_paid))){const stage=row.first_paid?2:1;btn(controls,stage+'차 '+won(row.total_won/2)+' 테스트 결제 (카드·간편결제)',()=>checkout(row,stage));el('p','테스트 PG 설정 전에는 결제되지 않습니다. 자동 청구·구독·카드 등록은 없습니다.',card);}
   if(workspace==='customer'&&row.state==='completed'&&!row.review){const form=el('form',undefined,card);el('h3','완료한 미팅 후기',form);select(form,'평점','rating',{'5':'5점','4':'4점','3':'3점','2':'2점','1':'1점'});const body=input(form,'후기 (병명·개인정보·보험계약 내용 입력 금지)','body');body.minLength=2;body.maxLength=500;body.required=true;check(form,'후기와 평점 공개에 동의합니다. 검토 후 공개됩니다.','public_consent').required=true;el('button','후기 제출',form).type='submit';submit(form,d=>command('review',{id:row.id,revision:row.revision,rating:Number(d.get('rating')),body:d.get('body'),public_consent:d.get('public_consent')==='on'}));}
   if(row.review){el('p','후기 '+row.review.rating+'점 · '+row.review.body+' · '+(row.review.visible?'공개':'검토 대기'),card);if(workspace==='admin'){const form=el('form',undefined,card);const reason=input(form,'개인정보·민감정보 검토 결과','reason');reason.minLength=5;reason.required=true;const visible=check(form,'후기 공개','visible');visible.checked=row.review.visible;el('button','후기 검토 저장',form).type='submit';submit(form,d=>command('publish_review',{id:row.id,revision:row.revision,reason:d.get('reason'),visible:d.get('visible')==='on'}));}}
   if(row.state==='completed'&&workspace!=='admin'){
    const f=el('form',undefined,card);el('h3','같은 상담의 후속 미팅 · 추가 과금 없음',f);input(f,'후속 날짜 (KST)','date','date').required=true;const t=input(f,'후속 시간 (KST)','time','time');t.step=1800;t.required=true;el('button','후속 일정 제안',f).type='submit';submit(f,d=>command('followup_propose',{id:row.id,revision:row.revision,preferred_at:new Date(d.get('date')+'T'+d.get('time')+':00+09:00').toISOString()}));
   }
   for(const f of row.followups||[]){const section=el('section',undefined,card);el('p','후속 미팅 · '+kst(f.preferred_at)+' KST · '+({proposed:'상대방 확인 대기',confirmed:'확정',cancelled:'취소'}[f.state])+' · 추가 과금 없음',section);if(workspace!=='admin'&&f.state==='proposed'&&f.can_confirm)btn(section,'후속 일정 확인',()=>command('followup_confirm',{id:row.id,revision:row.revision,followup_id:f.id}));if(workspace!=='admin'&&f.state!=='cancelled')btn(section,'후속 일정 취소',()=>command('followup_cancel',{id:row.id,revision:row.revision,followup_id:f.id}));}
   const issue=el('details',undefined,card);el('summary','문의·문제 신고',issue);const issueForm=el('form',undefined,issue);select(issueForm,'종류','category',{question:'문의',no_show:'노쇼 신고',dispute:'분쟁 신고',refund:'환불 문의'});const reason=input(issueForm,'내용 (병명·증권번호·건강정보·주민등록번호는 적지 마세요)','reason');reason.required=true;reason.minLength=3;reason.maxLength=1000;el('button','접수',issueForm).type='submit';submit(issueForm,d=>command('issue',{id:row.id,...Object.fromEntries(d)}));
   for(const i of row.issues||[])el('p',(i.resolved?'처리 완료: ':'확인 중: ')+i.reason+(i.resolution?' / '+i.resolution:''),issue);
   if(workspace==='admin'&&['dispute','no_show'].includes(row.state)){const form=el('form',undefined,card);select(form,'확인 결과','outcome',{cancelled:'미완료 취소·무료 이용권 복원',scheduled:'미팅 재개 (고객 완료 확인 필요)'});const reason=input(form,'확인 근거·사유','reason');reason.required=true;reason.minLength=5;el('button','예외 처리 기록',form).type='submit';submit(form,d=>command('resolve_issue',{id:row.id,...Object.fromEntries(d)}));}
   if(workspace==='admin'){const audit=el('details',undefined,card);el('summary','처리 이력·확인 근거',audit);for(const e of row.events||[])el('p',kst(e.created_at)+' KST · '+e.event+' · 담당자 '+(e.actor||'시스템')+(e.reason?' · '+e.reason:''),audit);}
   for(const o of row.orders||[]){const section=el('section',undefined,card);if(workspace!=='customer')btn(section,'결제 상태 다시 확인',()=>pay({action:'status',orderId:o.id}));el('p',o.stage+'차 · '+won(o.amount)+' · '+(payments[o.state]||o.state),section);if(o.receipt_url){try{const url=new URL(o.receipt_url);if(url.protocol==='https:'&&(url.hostname==='tosspayments.com'||url.hostname.endsWith('.tosspayments.com'))){const a=link(section,'영수증',url.href);a.target='_blank';a.rel='noopener';}}catch{}}
    if(workspace==='admin'&&['paid','refund_failed','refunding'].includes(o.state)&&['cancelled','dispute','no_show'].includes(row.state)){const form=el('form',undefined,section),reason=input(form,'전액 환불 근거','reason');reason.required=true;reason.minLength=5;el('button','테스트 환불 처리',form).type='submit';submit(form,d=>pay({action:'refund',orderId:o.id,reason:d.get('reason')}));}
   }
  }
 }
 document.getElementById('refreshRequests').onclick=()=>action(content,refresh);
 const form=document.getElementById('requestForm');
 if(form){
  form.replaceChildren();form.hidden=false;el('h2','상담 희망 일정 제출',form);el('p','소비자 무료 · 보험 가입 의무 없음 · 유료 연결료는 설계사가 부담합니다. 민감정보는 입력받지 않습니다.',form);
  const params=new URLSearchParams(location.search);const catalog=await rpc('planner_catalog',{area:'',wanted:''});
  const choices=Object.fromEntries(catalog.planners.map(p=>[p.id,(p.is_sample?'[테스트] ':'')+p.name+' · '+p.region]));
  select(form,'설계사 직접 선택','planner_id',{'':'자동매칭 선택 시 비워두세요',...choices},params.get('planner'));
  const auto=check(form,'직접 선택하지 않고 규칙 기반 자동매칭에 동의합니다. 패스·기한 경과 시 다음 후보에게 요청이 전달됩니다.','automatic');
  select(form,'상담 목적','purpose',purposes,params.get('purpose')||'claim');const area=input(form,'희망 지역','region','text',params.get('region')||'서울 마포구');area.required=true;area.maxLength=120;
  select(form,'상담 방식','method',{phone:'통화 요청 (설계사 확인 후)',nearby:'근처에서 만나기',scheduled:'시간 약속하기'},params.get('method')||'scheduled');
  input(form,'희망 날짜 (KST)','date','date').required=true;const time=input(form,'희망 시간 (KST, 30분 단위)','time','time');time.required=true;time.step=1800;
  el('p','통화 요청도 설계사 수락 후 진행합니다. 긴급 대응이나 즉시 연결을 보장하지 않습니다.',form);el('button','상담 요청 (무료)',form).type='submit';
  submit(form,d=>command('request',{purpose:d.get('purpose'),region:d.get('region'),method:d.get('method'),planner_id:auto.checked?null:d.get('planner_id')||null,automatic:auto.checked,preferred_at:new Date(d.get('date')+'T'+d.get('time')+':00+09:00').toISOString()}));
 }
 document.getElementById('workflowFilters')?.addEventListener('submit',e=>{e.preventDefault();action(content,refresh);});
 await refresh();
 // Read-only access to requests created before the new workflow. No old completion or payment actions.
 const legacy=document.getElementById('legacyRequests');if(legacy){try{const rows=await rpc('list_service_requests',{workspace});for(const r of rows)el('p','이전 예약 · '+r.region+' · '+kst(r.requested_at)+' KST · '+r.status,legacy);}catch{el('p','이전 예약을 불러오지 못했습니다.',legacy);}}
}
export async function renderPaymentResult(client,message){
 const query=new URLSearchParams(location.search);if(query.has('failed')){message('결제가 완료되지 않았습니다. 예약 화면에서 결제 상태를 확인하고 다시 시도해 주세요.');return;}
 const orderId=query.get('orderId'),paymentKey=query.get('paymentKey'),amount=Number(query.get('amount'));
 if(!orderId||!paymentKey||!Number.isSafeInteger(amount)){message('결제 결과 정보가 없습니다.');return;}
 const {data}=await client.auth.getSession();const response=await fetch('/api/payment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({action:'confirm',orderId,paymentKey,amount})});const result=await response.json();
 message(response.ok&&result.status==='DONE'?'서버에서 테스트 결제 승인을 확인했습니다.':'결제 승인이 확인되지 않았습니다. 예약 화면에서 상태를 다시 확인해 주세요.');
 if(response.ok&&result.status==='DONE')history.replaceState(null,'','/payment-result.html');
}
