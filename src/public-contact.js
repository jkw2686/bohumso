import {el,input} from './consultation-ui.js';
export async function renderPublicContact(client,parent){
 const root=el('section',undefined,parent);root.className='card public-contact-settings';el('h2','공개 연락처 (선택)',root);
 const help=el('details',undefined,root);help.className='supporting-details';el('summary','공개 연락처 안내',help);el('p','공개에 동의한 번호만 전문가 상세의 전화하기에 표시합니다. 로그인·인증 번호와 별개이며, 등록하지 않아도 가입이나 지도 노출에 불이익이 없습니다.',help);
 const summary=el('p','연락처 설정을 확인하고 있습니다.',root),host=el('div',undefined,root),status=el('p','',root);status.setAttribute('role','status');
 const retry=el('button','다시 확인',root);retry.type='button';retry.className='btn ghost';retry.hidden=true;
 const rpc=async(operation,payload={})=>{const r=await client.rpc('expert_public_contact',{operation,payload});if(r.error)throw r.error;return r.data;};
 async function load(){retry.hidden=true;try{
  let saved=await rpc('get');summary.textContent=saved.public?'전화 버튼 공개 중 · '+saved.phone:'공개 연락처 없음 · 전화 버튼 숨김';host.replaceChildren();
  const form=el('form',undefined,host),phone=input(form,'공개할 전화번호 (선택)','public_phone','tel',saved.phone||'');phone.autocomplete='off';
  const consent=input(form,'이 번호를 전문가 상세에 공개하는 데 동의합니다.','public_phone_consent','checkbox');consent.checked=saved.public===true;
  phone.addEventListener('input',()=>{if(phone.value!==saved.phone)consent.checked=false;});
  const save=el('button','공개 연락처 저장',form);save.type='submit';save.className='btn';
  form.onsubmit=async e=>{e.preventDefault();if(save.disabled)return;save.disabled=phone.disabled=consent.disabled=true;status.textContent='저장 중입니다.';try{
   saved=await rpc('set',{phone:phone.value,public:consent.checked,consent:consent.checked,consent_version:'expert-public-phone-v1'});
   summary.textContent=saved.public?'전화 버튼 공개 중 · '+saved.phone:'공개 연락처 없음 · 전화 버튼 숨김';phone.value=saved.phone;consent.checked=saved.public===true;status.textContent='공개 연락처를 저장했습니다.';
   try{localStorage.setItem('bohumso-profile-updated',String(Date.now()));window.dispatchEvent(new Event('bohumso-profile-updated'));}catch{}
  }catch{status.textContent='저장하지 못했습니다. 번호와 공개 동의를 확인해 주세요. 기존 공개 설정은 유지됩니다.';}finally{save.disabled=phone.disabled=consent.disabled=false;}};
 }catch{summary.textContent='공개 연락처 설정을 불러오지 못했습니다.';retry.hidden=false;}}
 retry.onclick=load;await load();
}
