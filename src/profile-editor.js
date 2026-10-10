import {renderOptionalProfile} from './optional-profile.js';
import {availabilityLabels,availabilityOf} from './availability.js';
import {el,input,select,specialties} from './consultation-ui.js';
export async function renderProfileEditor(client,parent){
 const {data,error}=await client.rpc('consultation_workspace',{workspace:'partner'});if(error)return;const p=data.profile||{};
 await renderOptionalProfile(client,parent);
 const instantLink=el('a','주활동지역 · 지금 가능 설정 →',parent);instantLink.href='/partner-work.html';
 const details=el('details',undefined,parent);details.className='card';el('summary','설계사 프로필·상담가능 상태 관리',details);
 const form=el('form',undefined,details);
 el('p','상담시간 · '+(p.hours||'위의 상담 가능 요일·시간에서 설정해 주세요.'),form);input(form,'예약 확정 후 공개할 상담 연락처','phone','tel',p.phone||'');
 const available=input(form,'상담 요청 받기','available','checkbox');available.checked=!!p.available;
 el('p','지도는 설정한 활동지역을 표시합니다. 현재 위치는 공개하지 않습니다.',form);
 el('p','상담 분야 · '+(p.specialties||[]).map(k=>specialties[k]||k).join(' · '),form);el('p','상담 분야와 요일·시간은 위의 전문가 프로필에서 변경해 주세요.',form);
 el('p',p.verified_at?(p.is_sample?'샘플 프로필 · 운영 검증을 의미하지 않습니다.':'관리자 등록 확인 이력이 있습니다.'):'프로필 저장만으로 상담을 수락할 수 없습니다. 관리자 확인이 필요합니다.',form);
 const button=el('button','프로필 저장',form);button.type='submit';const message=el('p','',details);message.setAttribute('role','status');
 form.onsubmit=async e=>{e.preventDefault();button.disabled=true;try{const d=new FormData(form);const payload={hours:p.hours||'',phone:d.get('phone'),available:available.checked,specialties:p.specialties||[],latitude:p.latitude??null,longitude:p.longitude??null};const {error}=await client.rpc('consultation_command',{operation:'profile',payload});if(error)throw error;message.textContent='프로필을 저장했습니다. 등록 확인 전에는 목록에 공개되지 않습니다.';}catch{message.textContent='프로필을 저장하지 못했습니다. 입력과 설계사 신청 상태를 확인하세요.';}finally{button.disabled=false;}};
}
