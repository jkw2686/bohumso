export const AGREEMENT_VERSION='consumer-protection-2026-09-25-v1';
export const PLEDGES=[
 '청구·상담 지원 과정에서 소비자에게 부당하거나 사전 고지되지 않은 금전을 요구하지 않는다. (자격자가 사전에 서면 고지한 정당한 보수는 허용)',
 '소비자가 먼저 요청하지 않는 한, 청구 상담 자리에서 신규 보험 가입을 먼저 권유하지 않는다.',
 '플랫폼 외부로 소비자를 유인해 위 규정을 회피하지 않는다.'
];
export const PROFESSIONS={planner:{name:'설계사',icon:'◈',qualification:'위촉증명서',registry:'보험모집 등록번호'},adjuster:{name:'손해사정사',icon:'▤',qualification:'손해사정사 자격증',registry:'금감원 등록번호'},lawyer:{name:'변호사',icon:'⚖',qualification:'변호사 등록증',registry:'변협 등록번호'}};
export function validRegistration(value){return /^[A-Za-z0-9][A-Za-z0-9 -]{2,39}$/.test(value)&&!/[0-9]{6}[ -]?[1-8][0-9]{6}/.test(value);}
export function koreanPhone(value){const digits=value.replace(/[^0-9]/g,'');return /^010[0-9]{8}$/.test(digits)?'+82'+digits.slice(1):/^8210[0-9]{8}$/.test(digits)?'+'+digits:null;}
export async function prepareDocument(file){
 if(!['image/jpeg','image/png','application/pdf'].includes(file.type)||file.size>10485760||file.size===0)throw Error('JPG·PNG·PDF, 10MB 이하 파일을 선택해 주세요.');
 if(file.type==='application/pdf')return file;
 const bitmap=await createImageBitmap(file);try{if(bitmap.width*bitmap.height>40000000)throw Error('이미지 해상도를 4천만 화소 이하로 줄여 주세요.');const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));if(!blob)throw Error('이미지를 처리하지 못했습니다.');return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'});}finally{bitmap.close();}
}
export async function documentRequest(client,body){const {data}=await client.auth.getSession();if(!data.session)throw Error('로그인이 필요합니다.');const isForm=body instanceof FormData;const r=await fetch('/api/expert-documents',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,...(isForm?{}:{'Content-Type':'application/json'})},body:isForm?body:JSON.stringify(body)});if(!r.ok){let code;try{code=(await r.json()).error}catch{}throw Error(code==='documents_not_configured'?'서류 저장 연결 준비 중입니다. 실제 서류를 올리지 마세요.':'서류를 처리하지 못했습니다. 다시 확인해 주세요.');}return body.action==='read'?r.blob():r.json();}
export function pledgeDialog(){const dialog=document.createElement('dialog');dialog.className='card pledge-dialog';const heading=document.createElement('h2');heading.textContent='소비자보호 서약';dialog.append(heading);const list=document.createElement('ol');for(const text of PLEDGES){const li=document.createElement('li');li.textContent=text;list.append(li);}dialog.append(list);const p=document.createElement('p');p.textContent='전문가가 이 서약에 동의했다는 표시입니다. 자격·서비스 결과를 보증하지 않습니다.';dialog.append(p);const close=document.createElement('button');close.className='btn';close.textContent='닫기';close.onclick=()=>dialog.close();dialog.append(close);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();}
