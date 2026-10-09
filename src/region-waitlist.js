import {purposes} from './urgent.js';
import {memberService} from './member-access.js';
import {normalizeKoreanPhone} from './phone-number.js';
const errors={consent_required:'필수 동의를 확인해 주세요.',invalid_contact:'연락 가능한 휴대전화 번호를 확인해 주세요.',rate_limited:'오늘 신청할 수 있는 지역 수를 초과했어요. 내일 다시 신청해 주세요.',admin_required:'관리자만 확인할 수 있습니다.'};
function el(tag,text,root,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;root?.append(n);return n;}
export function normalizeWaitlistPhone(value){return /^[+\d\s()-]+$/.test(value)?normalizeKoreanPhone(value).replace(/^\+82/,'0'):'';}
export function openRegionWaitlist({region,role='consumer',client}={}){
 if(!region||!['consumer','planner'].includes(role))return;
 const previous=document.activeElement,dialog=el('dialog','',document.body,'sheet-overlay show waitlist-overlay');dialog.setAttribute('aria-labelledby','waitlistTitle');dialog.addEventListener('keydown',e=>{if(e.key==='Escape')e.stopPropagation();});
 const sheet=el('div','',dialog,'sheet waitlist-sheet');
 const close=el('button','닫기',sheet,'btn ghost');close.type='button';
 const finish=()=>{dialog.close();dialog.remove();previous?.focus();};close.onclick=finish;dialog.addEventListener('cancel',e=>{e.preventDefault();finish();});
 el('h2',role==='planner'?'이 지역에서 활동하고 싶어요':region+'는 아직 준비 중이에요.',sheet).id='waitlistTitle';
 el('p',role==='planner'?region+' 오픈·활동 준비 관련 안내를 받아보세요.':'열리면 알려드릴까요?',sheet);
 const form=el('form','',sheet);form.noValidate=true;
 const helpLabel=el('label','어떤 도움이 필요하세요? (선택)',form,'field'),need=el('select','',helpLabel);need.name='need';el('option','선택 안 함',need).value='';for(const [value,label] of Object.entries(purposes))el('option',label,need).value=value;
 const contactLabel=el('label','연락 가능한 휴대전화',form,'field'),contact=el('input','',contactLabel);contact.type='tel';contact.name='contact';contact.autocomplete='tel';contact.inputMode='tel';contact.placeholder='010-0000-0000';contact.required=true;
 const consentLabel=el('label','',form,'waitlist-consent'),consent=el('input','',consentLabel);consent.type='checkbox';consent.name='consent';el('span',role==='planner'?'[필수] 해당 지역의 서비스 오픈·활동 준비 관련 안내 수신과 연락처 저장에 동의합니다.':'[필수] 해당 지역의 서비스 오픈·준비 관련 안내 수신과 연락처 저장에 동의합니다.',consentLabel);
 el('p','지역·휴대전화·선택한 도움 유형·동의 기록을 저장합니다. 신청일부터 최대 1년 보관하며 동의 철회 시 파기합니다. 다른 사용자에게 개인정보를 제공하지 않습니다.',form,'waitlist-note');
 const policy=el('a','개인정보처리방침',form);policy.href='/privacy.html';policy.target='_blank';policy.rel='noopener';
 const message=el('p','',form);message.setAttribute('role','alert');message.id='waitlistError';contact.setAttribute('aria-describedby',message.id);consent.setAttribute('aria-describedby',message.id);
 const submit=el('button','오픈 알림 신청',form,'btn');submit.type='submit';let busy=false;
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;message.textContent='';if(!consent.checked){message.textContent=errors.consent_required;consent.focus();return;}const phone=normalizeWaitlistPhone(contact.value);if(!/^0[0-9]{8,10}$/.test(phone)){message.textContent=errors.invalid_contact;contact.focus();return;}
  busy=true;submit.disabled=true;try{const service=client||((await memberService()).client);const {data,error}=await service.rpc('region_waitlist',{operation:'join',payload:{region,role,contact:phone,need:need.value||null,consent:true,consent_scope:'regional_updates'}});if(error)throw error;if(!Number.isSafeInteger(data?.position)||data.position<1)throw Error('invalid_response');
   form.replaceChildren();const success=el('p','현재 '+region+'에서 '+data.position+'번째로 기다리고 계세요',form);success.setAttribute('role','status');success.tabIndex=-1;success.focus();
  }catch(error){message.textContent=errors[error.message]||'신청하지 못했어요. 연결을 확인하고 다시 시도해 주세요.';}finally{busy=false;submit.disabled=false;}
 };dialog.showModal();contact.focus();return dialog;
}
export function waitlistActions(root,region,client){for(const role of ['consumer','planner']){const b=el('button',role==='consumer'?'오픈 알림 신청':'이 지역에서 활동하고 싶어요',root,'btn ghost');b.type='button';b.onclick=()=>openRegionWaitlist({region,role,client});}}
export async function renderWaitlistCounts(client,root){
 const section=el('section','',root,'card waitlist-admin');section.id='regionWaitlist';el('h2','지역별 오픈 알림 신청 현황',section);const body=el('div','',section,'waitlist-table');const status=el('p','',section);status.setAttribute('role','status');
 const load=async()=>{status.textContent='불러오는 중';const {data,error}=await client.rpc('region_waitlist',{operation:'counts',payload:{}});if(error){status.textContent=errors[error.message]||'현황을 불러오지 못했어요.';return;}body.replaceChildren();if(!data.length){status.textContent='아직 신청이 없습니다.';return;}status.textContent='개인정보 없이 지역별 인원만 표시합니다.';const table=el('table','',body),head=el('tr','',el('thead','',table));for(const title of ['지역','소비자','설계사','최근 신청일'])el('th',title,head).scope='col';const rows=el('tbody','',table);for(const row of [...data].sort((a,b)=>(b.consumers+b.planners)-(a.consumers+a.planners)||new Date(b.latest_at)-new Date(a.latest_at))){const tr=el('tr','',rows);for(const value of [row.region,row.consumers,row.planners,new Date(row.latest_at).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})])el('td',String(value),tr);}};
 const refresh=el('button','현황 새로고침',section,'btn ghost');refresh.type='button';refresh.onclick=()=>load().catch(()=>{status.textContent='연결을 확인해 주세요.';});await refresh.onclick();
}
