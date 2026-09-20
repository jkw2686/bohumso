import {el,kst} from './consultation-ui.js';
const statuses={pending:'심사 대기',approved:'승인 완료',rejected:'보완 후 재신청',suspended:'활동 정지',withdrawn:'신청 철회'};
export async function renderPartnerApplication({client,user,membership,message,action}){
 const state=document.getElementById('partnerState'),form=document.getElementById('partnerForm'),details=document.getElementById('partnerDetails');
 if(!membership.member){state.textContent='내 계정에서 필수 가입 동의를 먼저 완료해 주세요.';return;}
 const {data,error}=await client.from('partner_applications').select('*').eq('user_id',user.id).maybeSingle();if(error)throw error;
 state.textContent=data?statuses[data.status]:'1. 신청서 작성 → 2. 자격·소속 확인 → 3. 결과 확인';
 const editable=!data||['pending','rejected','withdrawn'].includes(data.status);form.hidden=!editable;
 if(data){details.hidden=false;details.replaceChildren();el('h2','신청 내용·심사 결과',details);el('p',data.full_name+' · '+data.organization+' · '+data.region,details);if(data.review_note)el('p','검토 안내: '+data.review_note,details);if(data.reviewed_at)el('p','검토일: '+kst(data.reviewed_at),details);
 el('p',data.status==='approved'?'자격 심사 승인 상태입니다. 설계사 목록 공개는 프로필 작성과 별도 등록 확인 후 가능합니다.':data.status==='suspended'?'활동 정지 상태에서는 직접 재신청할 수 없습니다. 운영 문의를 통해 재검토를 요청하세요.':'심사 대기 중에는 수정·철회할 수 있고, 반려된 신청은 보완해 다시 제출할 수 있습니다.',details);
 const history=await client.rpc('partner_application_history',{target_user:user.id});if(!history.error){const box=el('details',undefined,details);el('summary','신청·검토 이력',box);for(const h of history.data||[])el('p',kst(h.created_at)+' · '+(statuses[h.status]||h.action)+(h.reason?' · '+h.reason:''),box);}
 if(['pending','rejected'].includes(data.status)){const withdraw=el('button','신청 철회',details);withdraw.type='button';withdraw.className='btn secondary';withdraw.onclick=()=>action(details,async()=>{const r=await client.rpc('withdraw_partner_application',{expected_revision:data.revision});if(r.error)throw r.error;location.reload();});}
 }
 if(!editable)return;
 if(data)for(const name of ['full_name','profession','organization','region','credential_reference','credential_issuer','business_contact','career_years'])if(form.elements[name])form.elements[name].value=data[name]??'';
 for(const input of form.querySelectorAll('[name=consultation_modes]'))input.checked=!!data?.consultation_modes?.includes(input.value);
 form.querySelector('button[type=submit]').textContent=data?.status==='pending'?'신청 내용 수정·제출':data?'보완 후 재신청':'전문가 심사 신청';
 const hints={planner:'보험설계사 등록번호와 소속 보험회사·대리점을 확인할 경로를 입력하세요.',adjuster:'손해사정사 자격·등록을 확인할 번호와 발급기관을 입력하세요.',lawyer:'변호사 등록 및 소속 사무소를 확인할 경로를 입력하세요.',tax:'세무사 등록 및 소속 사무소를 확인할 경로를 입력하세요.',corporate:'기업보험 업무 경력·소속 확인 경로를 입력하세요. 별도 공인 자격으로 표시하지 않습니다.',office:'대리점·사무소 등록 및 운영 주체를 확인할 경로를 입력하세요.'};
 const updateHint=()=>document.getElementById('credentialHint').textContent=hints[form.elements.profession.value];form.elements.profession.onchange=updateHint;updateHint();
 form.onsubmit=e=>{e.preventDefault();action(form,async()=>{const d=new FormData(form);const payload=Object.fromEntries(['full_name','profession','organization','region','credential_reference','credential_issuer','business_contact'].map(k=>[k,String(d.get(k)||'').trim()]));payload.career_years=Number(d.get('career_years'));payload.consultation_modes=d.getAll('consultation_modes');payload.verification_consent=d.get('verification_consent')==='on';if(!payload.consultation_modes.length){message('상담 방식을 하나 이상 선택해 주세요.');return;}const r=await client.rpc('submit_partner_application',{payload,expected_revision:data?.revision||0});if(r.error)throw r.error;location.reload();});};
}
