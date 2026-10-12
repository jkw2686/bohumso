import {renderEarlyDocuments} from './early-documents.js';
import {renderPhoneSignupPanel} from './phone-signup-panel.js';
import {PROFESSION_CONFIG,PROFESSION_VERSION,activeProfessions} from './profession-config.js';
import {validRealName,NAME_RULE_HINT} from './expert-shared.js';
const states={PROFILE_COMPLETE_VERIFICATION_REQUIRED:'저장 완료 · 확인자료 제출',VERIFICATION_PENDING:'확인자료 검토 중',APPROVED:'승인 완료',SUSPENDED:'활동 정지',REJECTED:'승인되지 않음'};
export async function renderProfessionApplication({client,config,message}) {
 const form=document.getElementById('partnerForm'),state=document.getElementById('partnerState'),details=document.getElementById('partnerDetails');
 if(!config.expertApplicationsEnabled){state.textContent='현재 전문가 신청을 접수하지 않습니다.';return;}
 const [workspace,catalog,rules]=await Promise.all([client.rpc('expert_profile_command',{operation:'get'}),client.rpc('service_area_catalog'),client.rpc('profession_catalog')]);
 if(workspace.error||catalog.error||rules.error||rules.data?.version!==PROFESSION_VERSION){state.textContent='가입 정보를 불러오지 못했습니다. 잠시 후 다시 열어주세요.';return;}
 let personal=workspace.data.profile,office=workspace.data.office_profile,profile=personal||office,step=1,busy=false;
 const initial=p=>({profession:p?.profession||'',display_name:p?.display_name||'',organization:p?.organization||'',registration_reference:p?.registration_reference||'',office_address:p?.office_address||'',office_name:p?.office_name||'',address:p?.address||'',phone:p?.phone||'',fee_mode:p?.fee_mode||'unknown',fee_basis:p?.fee_basis||'',primary_area:p?.primary_area||'',secondary_areas:p?.secondary_areas||[],specialties:p?.specialties||[],weekdays:p?.weekdays||[1,2,3,4,5],start_hour:p?.start_hour??9,end_hour:p?.end_hour??18,firstMeetingConfirmed:false,customerInitiatedConfirmed:false,consent:false,agreement_version:PROFESSION_VERSION});
 const drafts=new Map();let values=initial(profile);const chosen=new URLSearchParams(location.search).get('profession');if(PROFESSION_CONFIG[chosen]?.intake&&(!personal||chosen==='office')){profile=chosen==='office'?office:personal;values=initial(profile);values.profession=chosen;}
 state.textContent=states[profile?.status]||'직군을 선택하고 시작하세요';form.hidden=false;
 await renderPhoneSignupPanel({client,config,before:form});
 const el=(tag,text,parent=form)=>{const n=document.createElement(tag);if(text)n.textContent=text;parent.append(n);return n;};
 const definition=()=>PROFESSION_CONFIG[values.profession];
 function field(label,key,required=true,max=120){const l=el('label',label),i=el('input',null,l);i.value=values[key]||'';i.required=required;i.maxLength=max;i.oninput=()=>values[key]=i.value;return i;}
 function check(text,checked,change,parent=form){const l=el('label',null,parent);l.className='consent-row';const i=el('input',null,l);i.type='checkbox';i.checked=checked;l.append(document.createTextNode(text));i.onchange=()=>change(i.checked,i);return i;}
 function draw(){
  form.replaceChildren();el('p',step+' / 5');const h=el('h2',['어떤 활동을 하시나요?','기본 정보','상담 설정','이용 약속','신청 내용 확인'][step-1]);h.tabIndex=-1;const d=definition();details.hidden=true;
  if(step===1){
   for(const [key,value]of activeProfessions){const l=el('label');l.className='consent-row';const i=el('input',null,l);i.type='radio';i.name='expertProfession';i.value=key;i.checked=values.profession===key;i.required=true;l.append(document.createTextNode(value.name+' · '+value.purpose));i.onchange=()=>{drafts.set(values.profession,{...values});values=drafts.get(key)||initial(key==='office'?office:personal?.profession===key?personal:null);values.profession=key;};}
   el('p','보험소 운영은 개인 전문가 활동과 별도로 같은 계정에 신청할 수 있어요.');
   if(personal?.profession)el('p','등록된 개인 직군 변경은 고객센터에서 별도 확인이 필요합니다. 기존 승인·자료는 다른 직군으로 옮겨지지 않습니다.');
  }
  if(step===2){
   field('실명','display_name',true,60);el('p',NAME_RULE_HINT);const l=el('label','활동 지역'),s=el('select',null,l);s.required=true;s.setAttribute('aria-label','활동 지역');el('option','지역 선택',s).value='';for(const area of catalog.data)el('option',area.id,s).value=area.id;s.value=values.primary_area;s.onchange=()=>values.primary_area=s.value;
   if(values.profession==='office'){field('거점명','office_name');field('거점 주소','address',true,300);field('운영 연락처','phone',true,20).type='tel';el('p','거점 승인과 개인 전문가 자격은 별개입니다. 위치는 운영자가 주소를 확인한 뒤 등록합니다.');}
   else{field('소속 회사 또는 사무소','organization');field(d.registryLabel,'registration_reference',values.profession==='tax',60);if(values.profession==='tax')field('사무소 주소','office_address',true,300);}
   el('p','개인 연락처는 위 휴대전화 인증에서 확인합니다. 확인자료 승인 전에는 공개되거나 예약을 받지 않습니다.');
  }
  if(step===3){
   if(values.profession==='office')el('p','기본 운영 시간은 평일 09:00–18:00, 마지막 예약 시작은 17:00입니다. 거점 확인 후 방문예약을 받을 수 있어요.');
   else{
    el('h3','상담 분야 (선택 · 최대 3개)');for(const [key,name]of Object.entries(d.specialties))check(name,values.specialties.includes(key),(v,i)=>{if(v&&values.specialties.length>=3){i.checked=false;message('최대 3개까지 선택할 수 있어요.');return;}values.specialties=v?[...values.specialties,key]:values.specialties.filter(x=>x!==key);});
    el('h3','상담 가능한 요일·시간');['일','월','화','수','목','금','토'].forEach((day,index)=>check(day,values.weekdays.includes(index),v=>values.weekdays=v?[...values.weekdays,index]:values.weekdays.filter(x=>x!==index)));
    for(const [key,label]of [['start_hour','시작 시간'],['end_hour','종료 시간']]){const l=el('label',label),s=el('select',null,l);s.setAttribute('aria-label',label);for(let hour=key==='start_hour'?9:10;hour<=(key==='start_hour'?17:18);hour++)el('option',hour+':00',s).value=hour;if(![...s.options].some(x=>+x.value===values[key]))el('option',values[key]+':00 (기존 설정)',s).value=values[key];s.value=values[key];s.onchange=()=>values[key]=Number(s.value);}
    el('p','신규 예약은 1시간 단위이며, 17:00가 마지막 시작 시간입니다. 기존 예약은 유지됩니다.');
    if(values.profession==='tax'){const l=el('label','세무 상담료'),s=el('select',null,l);s.setAttribute('aria-label','세무 상담료');for(const [v,t]of [['unknown','상담 전 확인'],['free','무료'],['paid','유료']])el('option',t,s).value=v;s.value=values.fee_mode;s.onchange=()=>{values.fee_mode=s.value;draw();};if(values.fee_mode==='paid')field('상담료 또는 산정 기준','fee_basis',true,200);el('p','전문가 상담료이며 플랫폼 이용료와 별개입니다. 상담료 미정 시 방문 전 확인이 필요합니다. 고객 세무내용·서류는 여기에서 받지 않습니다.');}
   }
  }
  if(step===4){
   const a=el('a','전문가 이용약관 보기');a.href='/expert-terms.html#'+values.profession;a.target='_blank';a.rel='noopener';el('p','등록정보의 정확성, 승인 절차, 개인정보 보호, 예약 운영, 비용 사전 안내 및 신고·이의 신청 절차를 확인해 주세요.');
   if(values.profession==='planner'){const section=el('section');section.className='expert-meeting-notice';for(const [i,text]of d.pledges.entries()){el('strong',text,section);const key=i===0?'firstMeetingConfirmed':'customerInitiatedConfirmed';check(text+' (필수)',values[key],v=>values[key]=v,section).required=true;}el('p','사실관계 확인 후 1회 지도 노출 정지 1개월, 2회 3개월, 3회 영구 제명. 사유 안내 후 고객센터에서 설명·정정·이의를 접수합니다.',section);}
   check('해당 직군의 전문가 이용약관에 동의합니다 (필수)',values.consent,v=>values.consent=v).required=true;
  }
  if(step===5){el('p',d.name+' · '+values.display_name+' · '+values.primary_area);el('p',d.documentHint);el('p','신분증은 제출하지 마세요. 주민등록번호·고객정보 등 불필요한 개인정보는 가려 주세요. 자료 제출 전에도 저장할 수 있으며 승인 전 공개·예약은 제한됩니다.');}
  const actions=el('div');actions.className='form-actions';if(step>1){const b=el('button','이전',actions);b.type='button';b.className='btn secondary';b.onclick=()=>{step--;draw();};}const next=el('button',step===5?'저장하기':'다음',actions);next.type='submit';next.className='btn';h.focus();
 }
 form.onsubmit=async event=>{
  event.preventDefault();if(busy||!form.reportValidity())return;message('');
  if(step===1&&!definition()?.intake)return;
  if(step===1&&values.profession!=='office'&&personal?.profession&&personal.profession!==values.profession){message('직군 변경은 기존 승인과 자료를 확인해야 합니다. 고객센터로 요청해 주세요.');return;}
  if(step===2&&!validRealName(values.display_name)&&values.display_name!==profile?.display_name){message(NAME_RULE_HINT);return;}
  if(step===3&&values.profession!=='office'&&(!values.weekdays.length||values.start_hour>=values.end_hour)){message('가능 요일과 시간을 확인해 주세요.');return;}
  if(step<5){step++;draw();return;}
  busy=true;form.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{const result=await client.rpc('expert_profile_command',{operation:'save',payload:{...values,phone:values.phone.replace(/[^0-9]/g,'')}});if(result.error)throw result.error;personal=result.data.profile;office=result.data.office_profile;profile=values.profession==='office'?office:personal;state.textContent=states[profile.status];form.replaceChildren();el('h2','저장했어요');el('p',definition().name+' · '+profile.display_name);details.replaceChildren();details.hidden=false;await renderEarlyDocuments(client,details,config,message,values.profession);const edit=el('button','입력 내용 수정');edit.type='button';edit.className='btn secondary';edit.onclick=()=>{values=initial(profile);step=1;draw();};}
  catch(e){message(({profession_change_review_required:'직군 변경은 고객센터에서 별도 확인이 필요합니다.',office_review_required:'승인된 거점명·주소 변경은 고객센터에서 확인합니다.',organization_review_required:'등록번호·사무소 변경은 고객센터에서 확인합니다.',pledge_required:'보험설계사 이용 약속 두 항목에 동의해 주세요.',consent_required:'직군별 이용약관에 동의해 주세요.'})[e.message]||'저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 확인해 주세요.');form.querySelectorAll('button').forEach(b=>b.disabled=false);}
  finally{busy=false;}
 };
 draw();details.hidden=!profile;if(profile?.profession)await renderEarlyDocuments(client,details,config,message,profile.profession);
 return personal?.status==='APPROVED'?'approved':values.profession==='office'?'office':undefined;
}
