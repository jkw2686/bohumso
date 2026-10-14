import {PROFESSION_CONFIG} from './profession-config.js';
import {renderOptionalProfile} from './optional-profile.js';
import {availabilityLabels,availabilityOf} from './availability.js';
import {el,input,select,specialties} from './consultation-ui.js';
export async function renderProfileEditor(client,parent){
 const {data,error}=await client.rpc('consultation_workspace',{workspace:'partner'});if(error)return;const p=data.profile||{};
 await renderOptionalProfile(client,parent);
 // '주활동지역 · 지금 가능 설정 →' 링크 삭제. 지금 방문 ON/OFF 는 이 화면 맨 위 카드로 올라갔다.
 // ▶ 접힘 대신 '제목 + 요약 + 전체 폭 버튼' 카드. 저장 로직은 그대로 둔다.
 const details=el('section',undefined,parent);details.className='card consult-settings';
 el('h2','상담 요청·연락처',details);
 const summaryBox=el('div',undefined,details);summaryBox.className='profile-summary';
 const toggle=el('button','상담 설정 변경',details);toggle.type='button';toggle.className='btn profile-toggle';
 const body=el('div',undefined,details);body.id='consultSettingsBody';body.hidden=true;
 toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',body.id);
 const form=el('form',undefined,body);
 el('p','상담시간 · '+(p.hours||'위의 상담 가능 요일·시간에서 설정해 주세요.'),form);input(form,'예약 확정 후 공개할 상담 연락처','phone','tel',p.phone||'');
 const available=input(form,'상담 요청 받기','available','checkbox');available.checked=!!p.available;
 el('p','지도는 설정한 활동지역을 표시합니다. 현재 위치는 공개하지 않습니다.',form);
 el('p','상담 분야 · '+(p.specialties||[]).map(k=>PROFESSION_CONFIG[p.profession]?.specialties?.[k]||specialties[k]||k).join(' · '),form);el('p','상담 분야와 요일·시간은 위의 전문가 프로필에서 변경해 주세요.',form);
 el('p',p.verified_at?(p.is_sample?'샘플 프로필 · 운영 검증을 의미하지 않습니다.':'관리자 등록 확인 이력이 있습니다.'):'프로필 저장만으로 상담을 수락할 수 없습니다. 관리자 확인이 필요합니다.',form);
 const button=el('button','프로필 저장',form);button.type='submit';button.className='btn';const message=el('p','',details);message.className='profile-status';message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 // 요약은 서버에 저장된 값(p)만 보여준다. 연락처는 뒤 4자리만.
 // 뒤 4자리만. 휴대전화가 아닌 번호에 '010-' 을 붙여 잘못 보여주지 않도록 접두사는 실제 값에서 가져온다.
 const masked=v=>{const d=String(v||'').replace(/[^0-9]/g,'');if(d.length<4)return '아직 등록하지 않았어요';
  return (d.length===11?d.slice(0,3)+'-':'')+'****-'+d.slice(-4);};
 function drawSummary(){
  summaryBox.replaceChildren();
  el('p','상담 요청 받기 · '+(p.available?'켜짐 · 상담 가능':'꺼짐 · 상담 중지'),summaryBox);
  el('p','예약 확정 후 공개 연락처 · '+masked(p.phone),summaryBox);
  const open=!body.hidden;
  toggle.textContent=open?'설정 닫기':'상담 설정 변경';
  // 파란 버튼은 카드당 1개. 폼이 열려 있을 때의 주요 버튼은 '프로필 저장' 이다.
  toggle.className=open?'btn ghost profile-toggle':'btn profile-toggle';
  toggle.setAttribute('aria-expanded',String(open));
 }
 toggle.onclick=()=>{
  body.hidden=!body.hidden;drawSummary();
  if(!body.hidden)(form.querySelector('input,button')||body).focus({preventScroll:true});
 };
 form.onsubmit=async e=>{e.preventDefault();if(button.disabled)return;button.disabled=true;button.textContent='저장 중…';form.setAttribute('aria-busy','true');message.textContent='상담 설정을 저장하고 있습니다.';const controls=[...form.querySelectorAll('input,select,textarea')];const disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);toggle.disabled=true;try{const payload={hours:p.hours||'',phone:form.elements.phone.value,available:available.checked,specialties:p.specialties||[],latitude:p.latitude??null,longitude:p.longitude??null};const {error}=await client.rpc('consultation_command',{operation:'profile',payload});if(error)throw error;p.phone=payload.phone;p.available=payload.available;body.hidden=true;drawSummary();toggle.focus({preventScroll:true});message.textContent='프로필을 저장했습니다. 등록 확인 전에는 목록에 공개되지 않습니다.';}catch{available.checked=!!p.available;message.textContent='상담 요청 받기 상태는 이전 설정으로 복구했습니다. 프로필을 저장하지 못했습니다. 입력과 전문가 신청 상태를 확인하세요.';}finally{button.disabled=false;button.textContent='프로필 저장';toggle.disabled=false;form.setAttribute('aria-busy','false');controls.forEach((c,i)=>c.disabled=disabled[i]);if(body.hidden)toggle.focus({preventScroll:true});}};
 drawSummary();
}
