import {availabilityLabels,availabilityOf} from './availability.js';
import {el,input,select,specialties} from './consultation-ui.js';
export async function renderProfileEditor(client,parent){
 const {data,error}=await client.rpc('consultation_workspace',{workspace:'partner'});if(error)return;const p=data.profile||{};
 const stateForm=el('form',undefined,parent);stateForm.className='card';el('h2','지금 도움 가능한가요?',stateForm);
 const state=select(stateForm,'상담 가능 상태','availability_status',availabilityLabels,availabilityOf(p));
 el('p','지금 가능은 1시간, 오늘 가능은 오늘 자정(KST)까지 유효합니다. 이후 예약 가능으로 표시됩니다. 등록 확인된 전문가만 변경할 수 있습니다.',stateForm);
 const stateButton=el('button','상태 저장',stateForm);stateButton.type='submit';const stateMessage=el('p','',stateForm);stateMessage.setAttribute('role','status');
 stateForm.onsubmit=async e=>{e.preventDefault();stateButton.disabled=true;try{const {error}=await client.rpc('set_planner_availability',{status:state.value});if(error)throw error;stateMessage.textContent='상담 가능 상태를 저장했습니다.';}catch{stateMessage.textContent='저장하지 못했습니다. 등록 확인 및 상담 가능 상태 기능 연결을 확인해 주세요.';}finally{stateButton.disabled=false;}};
 const details=el('details',undefined,parent);details.className='card';el('summary','설계사 프로필·상담가능 상태 관리',details);
 const form=el('form',undefined,details);input(form,'자기소개 (건강정보·고객정보 입력 금지)','biography','text',p.biography||'').maxLength=1000;
 input(form,'경력 (년)','experience','number',p.experience||0).min=0;input(form,'프로필 사진 HTTPS 주소 (사용 권한이 있는 사진)','photo_url','url',p.photo_url||'');
 input(form,'상담가능 시간 안내','hours','text',p.hours||'');input(form,'예약 확정 후 공개할 상담 연락처','phone','tel',p.phone||'');
 const available=input(form,'상담 요청 받기','available','checkbox');available.checked=!!p.available;
 input(form,'공개 상담 거점 위도 (선택)','latitude','number',p.latitude??'').step='any';input(form,'공개 상담 거점 경도 (선택)','longitude','number',p.longitude??'').step='any';el('p','거점 좌표만 입력하세요. 고객 위치·집 주소는 입력하지 마세요.',form);
 for(const [key,title] of Object.entries(specialties)){const c=input(form,title,'specialty','checkbox');c.value=key;c.checked=p.specialties?.includes(key)||false;}
 el('p',p.verified_at?(p.is_sample?'샘플 프로필 · 운영 검증을 의미하지 않습니다.':'관리자 등록 확인 이력이 있습니다.'):'프로필 저장만으로 상담을 수락할 수 없습니다. 관리자 확인이 필요합니다.',form);
 const button=el('button','프로필 저장',form);button.type='submit';const message=el('p','',details);message.setAttribute('role','status');
 form.onsubmit=async e=>{e.preventDefault();button.disabled=true;try{const d=new FormData(form);const payload={biography:d.get('biography'),experience:Number(d.get('experience')),photo_url:d.get('photo_url'),hours:d.get('hours'),phone:d.get('phone'),available:available.checked,specialties:d.getAll('specialty'),latitude:d.get('latitude')?Number(d.get('latitude')):null,longitude:d.get('longitude')?Number(d.get('longitude')):null};const {error}=await client.rpc('consultation_command',{operation:'profile',payload});if(error)throw error;message.textContent='프로필을 저장했습니다. 등록 확인 전에는 목록에 공개되지 않습니다.';}catch{message.textContent='프로필을 저장하지 못했습니다. 입력과 설계사 신청 상태를 확인하세요.';}finally{button.disabled=false;}};
}
