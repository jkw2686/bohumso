import {renderOptionalProfile} from './optional-profile.js';
import {availabilityLabels,availabilityOf} from './availability.js';
import {el,input,select,specialties} from './consultation-ui.js';
export async function renderProfileEditor(client,parent){
 const {data,error}=await client.rpc('consultation_workspace',{workspace:'partner'});
 if(error){const box=el('section',undefined,parent);box.className='card consult-settings';el('h2','상담 요청 받기',box);el('p','상담 설정을 불러오지 못했습니다. 다시 확인해 주세요.',box).setAttribute('role','alert');const retry=el('button','다시 확인',box);retry.type='button';retry.className='btn ghost';retry.onclick=()=>location.reload();return;}
 const p=data.profile||{};
 await renderOptionalProfile(client,parent);
 // '주활동지역 · 지금 가능 설정 →' 링크 삭제. 지금 방문 ON/OFF 는 이 화면 맨 위 카드로 올라갔다.
 // ▶ 접힘 대신 '제목 + 요약 + 전체 폭 버튼' 카드. 저장 로직은 그대로 둔다.
 const details=el('section',undefined,parent);details.className='card consult-settings';
 el('h2','상담 요청 받기',details);
 const summaryBox=el('div',undefined,details);summaryBox.className='profile-summary';
 const toggle=el('button','상담 설정 변경',details);toggle.type='button';toggle.className='btn profile-toggle';
 const body=el('div',undefined,details);body.id='consultSettingsBody';body.hidden=true;
 toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',body.id);
 const form=el('form',undefined,body);
 el('p','상담시간 · '+(p.hours||'위의 상담 가능 요일·시간에서 설정해 주세요.'),form);input(form,'예약 확정 후 공개할 상담 연락처','phone','tel',p.phone||'');
 const available=input(form,'상담 요청 받기','available','checkbox');available.checked=!!p.available;
 el('p','지도는 설정한 활동지역을 표시합니다. 현재 위치는 공개하지 않습니다.',form);
 el('p','상담 분야 · '+(p.specialties||[]).map(k=>specialties[k]||k).join(' · '),form);el('p','상담 분야와 요일·시간은 활동 정보·상담 시간에서 변경할 수 있습니다.',form);
 el('p',p.verified_at?(p.is_sample?'샘플 프로필 · 운영 검증을 의미하지 않습니다.':'관리자 등록 확인 이력이 있습니다.'):'프로필 저장만으로 상담을 수락할 수 없습니다. 관리자 확인이 필요합니다.',form);
 const button=el('button','저장하기',form);button.type='submit';button.className='btn';const message=el('p','',details);message.className='profile-status';message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 // 요약은 서버에 저장된 값(p)만 보여준다. 연락처는 뒤 4자리만.
 // 뒤 4자리만. 휴대전화가 아닌 번호에 '010-' 을 붙여 잘못 보여주지 않도록 접두사는 실제 값에서 가져온다.
 const masked=v=>{const d=String(v||'').replace(/[^0-9]/g,'');if(d.length<4)return '아직 등록하지 않았어요';
  return (d.length===11?d.slice(0,3)+'-':'')+'****-'+d.slice(-4);};
 function drawSummary(){
  summaryBox.replaceChildren();
  el('p',p.available?'요청 가능':'새 요청 쉬는 중',summaryBox);
  el('p','예약 확정 후 공개 연락처 · '+masked(p.phone),summaryBox);
  const open=!body.hidden;
  toggle.textContent=open?'설정 닫기':'상담 설정 변경';
  // 설정 변경은 보조 동작, 열린 폼의 저장하기가 주요 동작이다.
  toggle.className='btn ghost profile-toggle';
  toggle.setAttribute('aria-expanded',String(open));
 }
 toggle.onclick=()=>{
  body.hidden=!body.hidden;drawSummary();
  if(!body.hidden)(form.querySelector('input,button')||body).focus({preventScroll:true});
 };
 form.onsubmit=async e=>{
  e.preventDefault();if(button.disabled)return;
  const d=new FormData(form),payload={hours:p.hours||'',phone:d.get('phone'),available:available.checked,specialties:p.specialties||[],latitude:p.latitude??null,longitude:p.longitude??null};
  const controls=[toggle,...form.querySelectorAll('input,button')],disabled=controls.map(n=>n.disabled);
  controls.forEach(n=>n.disabled=true);form.setAttribute('aria-busy','true');message.textContent='저장 중…';
  try{const {error}=await client.rpc('consultation_command',{operation:'profile',payload});if(error)throw error;p.phone=payload.phone;p.available=payload.available;body.hidden=true;drawSummary();message.textContent='저장 완료 · 상담 설정을 반영했습니다.';}
  catch{message.textContent='저장 실패 · 입력 내용은 유지됩니다. 입력과 연결 상태를 확인해 주세요.';}
  finally{controls.forEach((n,i)=>n.disabled=disabled[i]);form.setAttribute('aria-busy','false');if(body.hidden)toggle.focus({preventScroll:true});}
 };
 drawSummary();
}
