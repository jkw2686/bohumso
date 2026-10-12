import '../public/expert-profile-card.js';
import {el,input} from './consultation-ui.js';
import {createPhotoCrop} from './profile-photo-crop.js';
export {prepareProfilePhoto} from './profile-photo-crop.js';

export async function renderOptionalProfile(client,parent){
 const result=await client.rpc('expert_optional_profile',{operation:'get'});if(result.error||!result.data)return;let p=result.data;
 // ▶ 접힘 대신 '제목 + 한 줄 요약 + 전체 폭 버튼' 카드. 버튼을 누르면 같은 카드 안에서 폼이 펼쳐진다.
 // 폼 내부·사진 처리·초안 보존·저장 로직은 그대로 두고 바깥 껍데기만 바꾼다.
 const ui=window.BohumsoProfile,details=el('section',undefined,parent);details.className='card optional-profile';
 el('h2','지도 프로필',details);
 const summaryBox=el('div',undefined,details);summaryBox.className='profile-summary';
 const toggle=el('button','프로필 입력',details);toggle.type='button';toggle.className='btn profile-toggle';
 const body=el('div',undefined,details);body.id='optionalProfileBody';body.hidden=true;
 // 저장 성공 시 폼을 닫으므로 확인 문구는 접히는 영역 밖에 둔다. 닫혀도 보인다.
 const message=el('p','',details);message.className='profile-status';message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',body.id);
 el('p',p.profession==='tax'?'사진·소개는 선택입니다. 상담 분야는 상담 설정에서 수정하거나 비울 수 있어요.':'사진·취급 구분·도움 업무·소개는 모두 선택입니다. 나중에 수정하거나 비울 수 있어요.',body);
 const form=el('form',undefined,body),fields=el('fieldset',undefined,form);fields.className='profile-editor-fields';el('legend','프로필 입력',fields).className='sr-only';
 let photo=null,removePhoto=false,previewURL='',ownPhotoURL='',busy=false,crop=null,cropping=false,photoLoading=false,introInitial='';
 const photoSection=el('section',undefined,fields);photoSection.className='profile-photo-edit';
 el('h3','사진 (선택)',photoSection);
 const photoView=ui.avatar(photoSection,p),photoActions=el('div',undefined,photoSection);photoActions.className='profile-editor-actions';
 const file=el('input',undefined,photoSection);file.type='file';file.accept='image/jpeg,image/png';file.hidden=true;file.setAttribute('aria-label','프로필 사진 선택');
 const choose=el('button','사진 선택',photoActions);choose.type='button';choose.className='btn ghost';choose.onclick=()=>file.click();
 const remove=el('button','사진 삭제',photoActions);remove.type='button';remove.className='btn ghost';
 const cropHost=el('div',undefined,photoSection);
 function choices(title,name,values,selected){const set=el('fieldset',undefined,fields);el('legend',title,set);for(const [key,label]of Object.entries(values)){if(key==='office_consultation'&&!p.offices?.some(o=>o.available===true))continue;const c=input(set,label,name,'checkbox');c.value=key;c.checked=(selected||[]).includes(key);}}
 if(p.profession!=='tax')choices('보험 취급 구분 (선택)','insurance_types',ui.types,p.insurance_types);el('p','직접 선택한 정보이며 자격 인증 표시가 아닙니다.',fields).className='profile-editor-hint';
 if(p.profession!=='tax')choices('도움 가능한 업무 (선택 · 최대 3개)','help_tasks',ui.tasks,p.help_tasks);
 const introLabel=el('label','소개 인사말 (선택 · 40자)',fields),intro=el('textarea',undefined,introLabel);intro.name='biography';intro.rows=3;intro.value=p.biography||'';introInitial=intro.value;
 const counter=el('p','',fields);counter.className='profile-editor-hint';counter.id='profileIntroCount';intro.setAttribute('aria-describedby',counter.id);
 const legacy=el('p','',fields);legacy.className='profile-editor-hint';legacy.hidden=Array.from(p.biography||'').length<=40;
 legacy.textContent='기존 소개는 그대로 보관됩니다. 소개를 새로 바꿀 때만 40자 이내로 작성해 주세요.';
 // ▶ 접힘 대신 버튼(공통 규칙 §1 화면). 폼 안이지만 마지막으로 남아 있던 ▶ 라서 같이 맞춘다.
 // 미리보기 내용 생성(draw 안의 preview.replaceChildren)은 그대로 둔다.
 const previewBox=el('div',undefined,form);previewBox.className='profile-editor-preview';
 const previewToggle=el('button','지도에 보이는 프로필 미리보기',previewBox);previewToggle.type='button';previewToggle.className='btn ghost';
 const preview=el('div',undefined,previewBox);preview.id='profileEditorPreview';preview.hidden=true;
 previewToggle.setAttribute('aria-expanded','false');previewToggle.setAttribute('aria-controls',preview.id);
 previewToggle.onclick=()=>{preview.hidden=!preview.hidden;previewToggle.setAttribute('aria-expanded',String(!preview.hidden));previewToggle.textContent=preview.hidden?'지도에 보이는 프로필 미리보기':'미리보기 닫기';};
 const footer=el('div',undefined,form);footer.className='profile-editor-footer';
 const actions=el('div',undefined,footer);actions.className='profile-editor-actions';
 const cancel=el('button','취소',actions);cancel.type='button';cancel.className='btn ghost';
 const save=el('button','저장하기',actions);save.type='submit';save.className='btn';
 function selected(name){return [...form.querySelectorAll('input[name="'+name+'"]:checked')].map(c=>c.value);}
 function values(){return {...p,insurance_types:selected('insurance_types'),help_tasks:selected('help_tasks'),biography:intro.value===introInitial?p.biography:intro.value,photo_url:removePhoto?'':p.photo_url};}
 const same=(a,b)=>JSON.stringify([...(a||[])].sort())===JSON.stringify([...(b||[])].sort());
 function textDirty(){const v=values();return !same(v.insurance_types,p.insurance_types)||!same(v.help_tasks,(p.help_tasks||[]).filter(t=>t!=='office_consultation'||p.offices?.some(o=>o.available===true)))||v.biography!==p.biography;}
 function dirty(){return !!photo||(removePhoto&&!!p.photo_url)||textDirty();}
 function invalid(){return intro.value!==introInitial&&(Array.from(intro.value.trim()).length>40||/[<>]|[\u0000-\u001f]/.test(intro.value));}
 function imageURL(){return removePhoto?'':previewURL||ownPhotoURL||ui.photoURL(p.photo_url);}
 function draw(){
  preview.replaceChildren();ui.identity(preview,{...values(),photo_url:''});ui.setAvatar(photoView,imageURL());
  const box=preview.querySelector('.expert-avatar');if(box)ui.setAvatar(box,imageURL());
  const count=Array.from(intro.value).length;counter.textContent=count+' / 40자'+(invalid()?' · 줄바꿈 없이 40자 이내의 일반 문장으로 입력해 주세요.':'');
  intro.setAttribute('aria-invalid',invalid()?'true':'false');save.disabled=busy||cropping||photoLoading||!dirty()||invalid();save.textContent=busy?'저장 중…':'저장하기';
  cancel.disabled=busy||(!dirty()&&!cropping);remove.disabled=busy||cropping||!(photo||p.photo_url)&&!previewURL||removePhoto;
  choose.disabled=busy||cropping||photoLoading;choose.textContent=imageURL()?'사진 변경':'사진 선택';
  fields.disabled=busy;form.setAttribute('aria-busy',busy?'true':'false');
 }
 // 입력 전/후 요약. 사진은 인증이 필요해 loadOwnPhoto 가 받아온 URL 을 쓴다.
 function filled(){return !!(p.photo_url||(p.biography||'').trim()||(p.insurance_types||[]).length||(p.help_tasks||[]).length);}
 function drawSummary(){
  summaryBox.replaceChildren();
  if(filled()){
   const line=el('div',undefined,summaryBox);line.className='profile-summary-line';
   ui.setAvatar(ui.avatar(line,p),imageURL());
   el('p',(p.biography||'').split('\n')[0].trim()||'소개는 아직 비어 있어요',line);
  }else el('p','사진·소개를 넣으면 고객이 고르기 쉬워요 · 선택',summaryBox);
  const open=!body.hidden;
  toggle.textContent=open?'입력 닫기':filled()?'프로필 수정':'프로필 입력';
  // 파란 버튼은 카드당 1개. 폼이 열려 있을 때의 주요 버튼은 '저장하기' 이므로 토글은 보조로 낮춘다.
  toggle.className=open?'btn ghost profile-toggle':'btn profile-toggle';
  toggle.setAttribute('aria-expanded',String(open));
 }
 toggle.onclick=()=>{
  if(!body.hidden&&(dirty()||cropping)&&!confirm('입력한 내용을 두고 닫을까요? 저장하지 않은 변경은 다시 열면 그대로 있습니다.'))return;
  body.hidden=!body.hidden;drawSummary();
  if(!body.hidden)(form.querySelector('input,textarea,button')||body).focus({preventScroll:true});
 };
 function revokePreview(){if(previewURL)URL.revokeObjectURL(previewURL);previewURL='';}
 function closeCrop(){crop?.dispose();crop=null;cropping=false;}
 async function loadOwnPhoto(){
  if(ownPhotoURL)URL.revokeObjectURL(ownPhotoURL);ownPhotoURL='';
  const url=ui.photoURL(p.photo_url);if(!url)return;const version=p.photo_url;
  try{const {data}=await client.auth.getSession();if(!data.session)return;const u=new URL(url),response=await fetch(u.pathname+u.search,{headers:{Authorization:'Bearer '+data.session.access_token},cache:'no-store'});if(!response.ok)return;const blob=await response.blob();if(p.photo_url!==version||!details.isConnected)return;ownPhotoURL=URL.createObjectURL(blob);draw();}catch{}
 }
 form.addEventListener('input',()=>{draw();message.textContent=dirty()?'변경한 내용을 저장해 주세요.':'변경 사항이 없습니다.';});
 form.addEventListener('change',e=>{if(e.target!==file)draw();});
 file.onchange=async()=>{
  const chosen=file.files[0];file.value='';if(!chosen||busy||cropping||photoLoading)return;photoLoading=true;draw();
  try{crop=await createPhotoCrop(chosen,cropHost,{apply:blob=>{photo=blob;removePhoto=false;revokePreview();previewURL=URL.createObjectURL(blob);closeCrop();draw();message.textContent='사진을 확인한 뒤 저장하기를 눌러 주세요.';choose.focus();},cancel:()=>{closeCrop();draw();choose.focus();}});cropping=true;message.textContent='사진 위치와 크기를 조절한 뒤 ‘이 사진 사용’을 눌러 주세요.';}
  catch(e){message.textContent=e.message;}finally{photoLoading=false;draw();}
 };
 remove.onclick=()=>{photo=null;removePhoto=!!p.photo_url;revokePreview();draw();message.textContent='저장하면 사진이 삭제됩니다.';};
 cancel.onclick=()=>{
  if((dirty()||cropping)&&!confirm('변경한 내용을 취소할까요? 저장한 프로필은 그대로 유지됩니다.'))return;
  closeCrop();photo=null;removePhoto=false;revokePreview();intro.value=p.biography||'';introInitial=intro.value;
  for(const name of ['insurance_types','help_tasks'])for(const c of form.querySelectorAll('input[name="'+name+'"]'))c.checked=(p[name]||[]).includes(c.value);
  draw();message.textContent='저장한 프로필로 돌아왔습니다.';
 };
 async function photoRequest(method,body){
  const {data}=await client.auth.getSession();if(!data.session)throw Error('다시 로그인해 주세요.');
  const response=await fetch('/api/expert-photo',{method,headers:{Authorization:'Bearer '+data.session.access_token,...body?{'Content-Type':'image/jpeg'}:{}},body});
  const result=await response.json();if(!response.ok)throw Error('사진을 저장하지 못했습니다. 선택한 사진은 유지되니 다시 저장해 주세요.');return result;
 }
 function notifySaved(){try{localStorage.setItem('bohumso-profile-updated',String(Date.now()));}catch{}window.dispatchEvent(new Event('bohumso-profile-updated'));}
 form.onsubmit=async e=>{
  e.preventDefault();if(busy||cropping||!dirty()||invalid())return;busy=true;draw();message.textContent='저장하고 있습니다.';
  let textSaved=false;
  try{
   if(textDirty()){const v=values(),payload={insurance_types:v.insurance_types,help_tasks:v.help_tasks,...intro.value!==introInitial?{biography:intro.value.trim()}:{}};
    const saved=await client.rpc('expert_optional_profile',{operation:'save',payload});if(saved.error)throw Error('프로필을 저장하지 못했습니다. 입력은 유지되니 다시 시도해 주세요.');p=saved.data;textSaved=true;intro.value=p.biography||'';introInitial=intro.value;
   }
   let cleanup=false;
   if(photo||removePhoto){const uploaded=await photoRequest(removePhoto?'DELETE':'POST',photo||undefined);p.photo_url=uploaded.photo_url;cleanup=uploaded.cleanupPending;}
   photo=null;removePhoto=false;
   if(previewURL){if(ownPhotoURL)URL.revokeObjectURL(ownPhotoURL);ownPhotoURL=previewURL;previewURL='';}else if(!p.photo_url&&ownPhotoURL){URL.revokeObjectURL(ownPhotoURL);ownPhotoURL='';}
   message.textContent=cleanup?'저장했습니다. 이전 사진 파일 정리는 운영자가 확인합니다.':'저장했습니다. 지도 공개 여부와 상담 가능 상태는 기존 설정이 유지됩니다.';
   notifySaved();body.hidden=true;drawSummary();toggle.focus({preventScroll:true});
  }catch(e){if(textSaved)notifySaved();message.textContent=(textSaved?'소개·선택 항목은 저장했습니다. ':'')+(/[가-힣]/.test(e.message)?e.message:'저장하지 못했습니다. 입력은 유지되니 연결을 확인한 뒤 다시 시도해 주세요.');}
  finally{busy=false;draw();}
 };
 function warn(e){if(details.isConnected&&(dirty()||cropping||busy)){e.preventDefault();e.returnValue='';}}
 function navigate(e){const a=e.target.closest('a[href]');if(!a||!details.isConnected||e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.target==='_blank'||a.hasAttribute('download'))return;const u=new URL(a.href,location.href);if(u.pathname===location.pathname&&u.search===location.search)return;if((dirty()||cropping||busy)&&!confirm('저장하지 않은 변경이 있습니다. 이 화면을 나갈까요?')){e.preventDefault();e.stopImmediatePropagation();}}
 window.addEventListener('beforeunload',warn);document.addEventListener('click',navigate,true);
 window.addEventListener('pagehide',e=>{if(e.persisted)return;closeCrop();revokePreview();if(ownPhotoURL)URL.revokeObjectURL(ownPhotoURL);window.removeEventListener('beforeunload',warn);document.removeEventListener('click',navigate,true);},{once:true});
 function revealInput(){if(details.contains(document.activeElement)&&['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName))document.activeElement.scrollIntoView({block:'nearest'});}
 window.visualViewport?.addEventListener('resize',revealInput);
 window.addEventListener('pagehide',()=>window.visualViewport?.removeEventListener('resize',revealInput),{once:true});
 message.textContent='변경 사항이 없습니다.';draw();drawSummary();loadOwnPhoto().then(drawSummary,()=>{});
}
