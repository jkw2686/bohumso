import '../public/expert-profile-card.js';
import {el,input} from './consultation-ui.js';
import {prepareDocument} from './expert-shared.js';
export async function prepareProfilePhoto(file){
 if(!['image/jpeg','image/png'].includes(file.type))throw Error('JPG 또는 PNG 사진을 선택해 주세요.');
 const ready=await prepareDocument(file),bitmap=await createImageBitmap(ready);
 try{const canvas=document.createElement('canvas');canvas.width=canvas.height=192;const side=Math.min(bitmap.width,bitmap.height);canvas.getContext('2d').drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,192,192);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));if(!blob||blob.size>131072)throw Error('사진을 줄이지 못했습니다. 다른 사진을 선택해 주세요.');return blob;}finally{bitmap.close();}
}
export async function renderOptionalProfile(client,parent){
 const result=await client.rpc('expert_optional_profile',{operation:'get'});if(result.error||!result.data)return;let p=result.data;
 const details=el('details',undefined,parent);details.className='card optional-profile';el('summary','지도 프로필 꾸미기 · 선택',details);el('p','사진·취급 구분·도움 업무·소개는 모두 선택입니다. 나중에 수정하거나 비울 수 있어요.',details);
 const form=el('form',undefined,details),preview=el('div',undefined,form);const message=el('p','',details);message.setAttribute('role','status');let photo=null,removePhoto=false,previewURL='',introChanged=false;
 const photoLabel=el('label','사진 선택 · 중앙을 정사각형으로 자릅니다 (선택)',form),file=el('input',undefined,photoLabel);file.type='file';file.accept='image/jpeg,image/png';file.setAttribute('aria-label','프로필 사진 선택');
 const remove=el('button','사진 삭제',form);remove.type='button';remove.className='btn ghost';remove.disabled=!p.photo_url;
 const intro=input(form,'한 줄 소개 (선택 · 40자)','biography','text',Array.from(p.biography||'').length<=40?p.biography:'');intro.maxLength=40;intro.oninput=()=>{introChanged=true;draw();};
 if(Array.from(p.biography||'').length>40){el('p','기존 소개는 보관되어 있습니다. 새 한 줄 소개를 입력하면 변경됩니다.',form);const clearIntro=el('button','기존 소개 비우기',form);clearIntro.type='button';clearIntro.className='btn ghost';clearIntro.onclick=()=>{intro.value='';introChanged=true;draw();message.textContent='저장하면 기존 소개가 삭제됩니다.';};}
 function choices(title,name,values,selected){const set=el('fieldset',undefined,form);el('legend',title,set);for(const [key,label]of Object.entries(values)){if(key==='office_consultation'&&!p.offices?.length)continue;const c=input(set,label,name,'checkbox');c.value=key;c.checked=(selected||[]).includes(key);c.onchange=draw;}}
 choices('보험 취급 구분 (선택)','insurance_types',window.BohumsoProfile.types,p.insurance_types);el('p','직접 선택한 정보이며 자격 인증 표시가 아닙니다.',form);
 choices('도움 가능한 업무 (선택 · 최대 3개)','help_tasks',window.BohumsoProfile.tasks,p.help_tasks);
 const save=el('button','선택 프로필 저장',form);save.type='submit';save.className='btn';
 function values(){const data=new FormData(form);return {...p,insurance_types:data.getAll('insurance_types'),help_tasks:data.getAll('help_tasks'),biography:introChanged?intro.value:p.biography,photo_url:removePhoto?'':p.photo_url};}
 function draw(){preview.replaceChildren();window.BohumsoProfile.identity(preview,values());if(previewURL&&!removePhoto){const box=preview.querySelector('.expert-avatar');box.querySelector('img')?.remove();const img=el('img',undefined,box);img.src=previewURL;img.alt='';img.width=img.height=48;}}
 function releasePreview(){if(previewURL)URL.revokeObjectURL(previewURL);previewURL='';}
 file.onchange=async()=>{if(!file.files[0])return;file.disabled=save.disabled=true;try{photo=await prepareProfilePhoto(file.files[0]);releasePreview();previewURL=URL.createObjectURL(photo);removePhoto=false;remove.disabled=false;draw();message.textContent='사진을 확인한 뒤 저장해 주세요. 승인 후 공개됩니다.';}catch(e){message.textContent=e.message;}finally{file.disabled=save.disabled=false;file.value='';}};
 remove.onclick=()=>{photo=null;removePhoto=true;releasePreview();draw();remove.disabled=true;message.textContent='저장하면 사진이 삭제됩니다.';};
 async function photoRequest(method,body){const {data}=await client.auth.getSession();if(!data.session)throw Error('다시 로그인해 주세요.');const r=await fetch('/api/expert-photo',{method,headers:{Authorization:'Bearer '+data.session.access_token,...body?{'Content-Type':'image/jpeg'}:{}},body});const result=await r.json();if(!r.ok)throw Error('사진을 저장하지 못했습니다. 다시 시도해 주세요.');return result;}
 form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{const v=values(),payload={insurance_types:v.insurance_types,help_tasks:v.help_tasks,...introChanged?{biography:intro.value.trim()}:{}},saved=await client.rpc('expert_optional_profile',{operation:'save',payload});if(saved.error)throw Error('프로필을 저장하지 못했습니다. 입력을 확인해 주세요.');p=saved.data;let cleanup=false;if(photo||removePhoto){const uploaded=await photoRequest(removePhoto?'DELETE':'POST',photo||undefined);p.photo_url=uploaded.photo_url;cleanup=uploaded.cleanupPending;}photo=null;removePhoto=false;introChanged=false;remove.disabled=!p.photo_url;draw();message.textContent=cleanup?'프로필을 저장했습니다. 이전 사진 파일 정리가 지연되어 운영 확인이 필요합니다.':'저장했습니다. 지도 공개 여부와 상담 가능 상태는 기존 설정이 유지됩니다.';}catch(e){message.textContent=e.message;}finally{save.disabled=false;}};
 draw();window.addEventListener('pagehide',releasePreview,{once:true});
}
