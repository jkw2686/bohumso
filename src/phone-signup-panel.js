import {renderPhoneVerification} from './phone-verification-ui.js';
import {mountMemberContact} from './member-contact.js';

// Outside the profile form so SMS buttons never submit or reset a profile draft.
export async function renderPhoneSignupPanel({client,config,before}){
 document.getElementById('phoneSignupPanel')?.remove();
 const panel=document.createElement('section');panel.id='phoneSignupPanel';panel.className='phone-signup-panel';
 const title=document.createElement('h2');title.id='phoneSignupTitle';title.textContent='휴대전화 인증';
 panel.setAttribute('aria-labelledby',title.id);panel.append(title);
 const help=document.createElement('p');help.textContent='전문가 지도 공개 전 꼭 필요해요. 아래에서 인증번호를 받아 입력해주세요.';panel.append(help);
 const body=document.createElement('div');panel.append(body);before.before(panel);
 try{const contact=await mountMemberContact({client,host:body,initialType:'expert'});if(contact.available){title.hidden=true;help.textContent='자격 확인은 연락처 입력과 별도로 진행합니다.';return;}}catch{body.textContent='연락처를 불러오지 못했어요. 새로고침해 주세요.';return;}
 const done=()=>{body.replaceChildren();const p=document.createElement('p');p.className='phone-verified';p.setAttribute('role','status');p.textContent='✓ 휴대전화 인증 완료';body.append(p);help.textContent='이제 아래에서 프로필 작성을 이어가세요. 지도 공개는 자격·소속 확인 후 진행됩니다.';};
 try{await renderPhoneVerification({client,config,root:body,onVerified:done});}catch{body.textContent='인증 상태를 불러오지 못했어요. 새로고침 후 다시 확인해주세요.';}
}
