const labels={pending:'접수 완료',assigned:'담당자 배정 · 고객 확정 대기',confirmed:'예약 확정',completed:'상담 완료',cancelled:'취소'};
const professions={planner:'보험설계사',adjuster:'손해사정사',lawyer:'변호사',corporate:'기업보험 컨설턴트',tax:'세무사',office:'보험대리점·거점'};
const time=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
function node(tag,text,parent){const el=document.createElement(tag);if(text)el.textContent=text;if(parent)parent.append(el);return el;}
function field(parent,title,name,type='text'){const label=node('label',title,parent);const input=node('input','',label);input.name=name;input.type=type;input.required=true;return input;}
export async function renderRequests({client,membership,workspace,message,action}){
 const $=id=>document.getElementById(id),host=$('requestList');
 if(workspace==='admin'&&!membership.admin||workspace==='partner'&&membership.partner_status!=='approved'||workspace==='customer'&&!membership.member){$('accountContent').hidden=true;message('이 화면을 이용할 수 있는 계정으로 로그인하거나 가입·승인을 완료해 주세요.');return;}
 async function rpc(name,params){const {data,error}=await client.rpc(name,params);if(error)throw error;return data;}
 async function refresh(){
  const rows=await rpc('list_service_requests',{workspace});
  const partners=workspace==='admin'?await rpc('list_assignable_partners'):[];
  host.replaceChildren();
  if(!rows.length)node('p',workspace==='partner'?'배정된 상담이 없습니다.':'등록된 요청이 없습니다.',host);
  for(const row of rows){
   const card=node('section','',host);card.className='card';
   node('h2',(row.kind==='visit'?'방문예약':'상담')+' · '+professions[row.profession],card);
   node('p',labels[row.status],card).className='request-status';node('p',row.region+' · '+time(row.requested_at)+' (한국 시간, 30분)',card);
   if(row.partner_name)node('p','담당: '+row.partner_name+' · '+row.organization,card);
   if(row.partner_status&&row.partner_status!=='approved')node('p','담당자가 현재 활동 중이 아닙니다. 운영자에게 재배정을 문의해 주세요.',card);
   if(row.meeting_address)node('p','방문 장소: '+row.meeting_address,card);
   if(row.contact_phone)node('p','예약자: '+row.contact_name+' · '+row.contact_phone,card);
   else if(workspace==='partner')node('p','고객이 예약 확정과 연락처 제공 동의를 완료한 경우에만 연락처가 표시됩니다.',card);
   const controls=node('div','',card);controls.className='review-actions';
   function button(title,run){const b=node('button',title,controls);b.type='button';b.onclick=()=>action(card,async()=>{await run();await refresh();message('저장했습니다.');});}
   if(workspace==='admin'&&['pending','assigned'].includes(row.status)){
    const form=node('form','',card),label=node('label','담당자 선택',form),select=node('select','',label);select.required=true;
    const empty=node('option','승인된 담당자를 선택하세요',select);empty.value='';
    for(const p of partners.filter(p=>p.profession===row.profession)){const opt=node('option',p.full_name+' · '+p.organization+' · '+p.region,select);opt.value=p.user_id;}
    let address;if(row.kind==='visit'){address=field(form,'확인된 방문 주소','address');address.minLength=5;address.maxLength=300;address.value=row.meeting_address;}
    node('button','담당자 배정',form).type='submit';
    form.onsubmit=e=>{e.preventDefault();action(form,async()=>{await rpc('assign_service_request',{request_id:row.id,target_partner:select.value,visit_address:address?.value.trim()||''});await refresh();message('배정했습니다. 고객이 확인하면 예약이 확정됩니다.');});};
   }
   if(workspace==='customer'&&row.status==='assigned'&&row.partner_status==='approved'){
    const form=node('form','',card);const name=field(form,'예약자 이름','full_name');name.minLength=2;name.maxLength=60;name.autocomplete='name';
    const phone=field(form,'연락처','phone','tel');phone.pattern='0[0-9 -]{8,13}';phone.autocomplete='tel';phone.maxLength=14;
    node('p','위 담당자·일정'+(row.kind==='visit'?'·방문 장소':'')+'를 확인해 주세요. 다른 일정을 원하면 취소 후 다시 신청할 수 있습니다.',form);
    const consentLabel=node('label','',form),consent=node('input','',consentLabel);consent.type='checkbox';consent.required=true;
    consentLabel.append(document.createTextNode('[필수] '+row.partner_name+' ('+row.organization+')에게 상담·예약 연락을 위해 이름과 연락처를 제공하는 데 동의합니다. '));
    const policy=node('a','보유 기간·상세 안내',consentLabel);policy.href='/privacy.html';policy.target='_blank';policy.rel='noopener';
    node('button','동의하고 예약 확정',form).type='submit';form.onsubmit=e=>{e.preventDefault();action(form,async()=>{await rpc('confirm_service_request',{request_id:row.id,expected_partner:row.partner_id,contact_name:name.value.trim(),contact_phone:phone.value.trim(),share_consent:consent.checked});await refresh();message('예약이 확정되었습니다.');});};
   }
   if(['customer','admin'].includes(workspace)&&['pending','assigned','confirmed'].includes(row.status))button('요청 취소',async()=>{if(!window.confirm('이 상담·예약을 취소할까요?'))return;await rpc('change_service_request',{request_id:row.id,decision:'cancelled'});});
   if(workspace==='partner'&&row.status==='confirmed'&&new Date(row.requested_at)<=new Date())button('상담 완료 처리',()=>rpc('change_service_request',{request_id:row.id,decision:'completed'}));
  }
 }
 $('refreshRequests').onclick=()=>action($('accountContent'),refresh);
 const form=$('requestForm');
 if(form){
  form.hidden=false;const kind=form.elements.kind,profession=form.elements.profession;
  kind.onchange=()=>{if(kind.value==='visit'){profession.value='office';profession.disabled=true;}else profession.disabled=false;};
  form.onsubmit=e=>{e.preventDefault();action(form,async()=>{
   const date=form.elements.date.value,slot=form.elements.time.value;
   await rpc('create_service_request',{request_kind:kind.value,requested_profession:profession.value,request_region:form.elements.region.value.trim(),preferred_at:new Date(date+'T'+slot+':00+09:00').toISOString()});
   form.reset();profession.disabled=false;await refresh();message('희망 일정이 접수되었습니다. 담당자 배정 후 내 요청에서 확정해 주세요.');
  });};
 }
 await refresh();
}
