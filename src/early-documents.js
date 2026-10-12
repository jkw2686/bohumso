import {prepareDocument,documentRequest} from './expert-shared.js';
import {PROFESSION_CONFIG} from './profession-config.js';
export async function renderEarlyDocuments(client,host,config,message,profession='planner'){
 const rules=PROFESSION_CONFIG[profession];if(!rules?.intake)return;
 const box=document.createElement('section');box.className='card';host.append(box);
 const el=(tag,text,parent=box)=>{const n=document.createElement(tag);n.textContent=text||'';parent.append(n);return n;};
 el('h2',profession==='office'?'공간·운영 권한 확인':'자격·소속 확인');
 if(!config.documentsEnabled){el('p','자료 제출 연결을 준비 중입니다. 프로필은 저장되어 있으며, 준비되면 이곳에서 이어서 제출할 수 있습니다.');return;}
 const {data:documents,error}=await client.rpc('early_expert_documents');if(error){el('p','자료 목록을 불러오지 못했습니다. 다시 열어주세요.');return;}
 el('p',rules.documentHint+' 신분증·주민등록번호·고객정보는 받지 않습니다.');
 el('p',(profession==='office'?'목적: 상담 공간·운영 권한 확인. 항목: 이름, 거점명, 주소, 사용·운영 권한. ':'목적: 자격·소속 확인. 항목: 이름, 소속, 등록번호, 유효기간. ')+'본인과 권한 있는 관리자만 자료를 열람합니다. 삭제를 요청하거나 자료를 삭제할 수 있습니다. 제출을 거부해도 신청은 유지되지만 승인 전 공개·예약은 제한됩니다.');
 const policy=el('a','자료 보관·삭제 안내');policy.href='/expert-terms.html#documents';policy.target='_blank';policy.rel='noopener';
 const consentLabel=el('label');consentLabel.className='consent-row';const consent=el('input',null,consentLabel);consent.type='checkbox';consentLabel.append('위 확인자료 수집·이용에 동의하며 불필요한 개인정보를 가렸습니다.');
 let busy=false;const run=async fn=>{if(busy)return;busy=true;box.querySelectorAll('button,input').forEach(n=>n.disabled=true);try{await fn();}catch(e){message(e.message||'자료를 처리하지 못했습니다.');}finally{busy=false;box.querySelectorAll('button,input').forEach(n=>n.disabled=false);}};
 for(const [kind,name] of Object.entries(rules.documents)){const section=el('div');el('h3',name,section);const doc=documents.find(d=>d.kind===kind&&(d.profession||'planner')===profession);
 if(doc){el('p',doc.filename,section);const view=el('button','제출자료 보기',section);view.type='button';view.className='btn secondary';view.onclick=()=>run(async()=>{const blob=await documentRequest(client,{action:'read',id:doc.id});const url=URL.createObjectURL(blob);const a=el('a','파일 열기',section);a.href=url;a.download=doc.filename;a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);});const remove=el('button','자료 삭제',section);remove.type='button';remove.className='btn secondary';remove.onclick=()=>run(async()=>{if(!confirm(profession==='office'?'이 자료를 삭제하면 거점 확인과 신규 방문예약이 중지됩니다. 개인 전문가 활동과 기존 예약은 유지됩니다. 삭제할까요?':'이 자료를 삭제하면 자격 확인과 지도 노출이 중지됩니다. 삭제할까요?'))return;await documentRequest(client,{action:'delete',id:doc.id});box.remove();await renderEarlyDocuments(client,host,config,message,profession);});}
 else{const file=el('input',null,section);file.type='file';file.accept='image/jpeg,image/png,application/pdf';file.setAttribute('aria-label',name);const upload=el('button','제출',section);upload.type='button';upload.className='btn';upload.onclick=()=>run(async()=>{if(!consent.checked){message('자료 처리 동의와 개인정보 가림을 확인해 주세요.');return;}if(!file.files[0]){message('자료 파일을 선택해 주세요.');return;}const ready=await prepareDocument(file.files[0]);if(ready.size>4194304)throw Error('파일 크기를 4MB 이하로 줄여주세요.');const body=new FormData();body.set('file',ready);body.set('kind',kind);body.set('profession',profession);body.set('consent','true');body.set('redacted','true');await documentRequest(client,body);message('제출했습니다. 검토 후 결과를 알려드립니다.');box.remove();await renderEarlyDocuments(client,host,config,message,profession);});}}
}
