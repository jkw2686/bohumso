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
 const rows=[];
 let busy=false;
 const run=async fn=>{if(busy)return;busy=true;box.querySelectorAll('button,input').forEach(n=>n.disabled=true);try{await fn();}catch(e){message(e.message||'자료를 처리하지 못했습니다.');}finally{busy=false;box.querySelectorAll('button,input').forEach(n=>n.disabled=false);}};
 for(const [kind,name] of Object.entries(rules.documents)){
  const section=el('div');section.dataset.documentKind=kind;
  section.style.cssText='display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2);padding-block:var(--space-3);border-bottom:1px solid var(--border);min-width:0';
  const label=el('label',name,section);label.style.cssText='flex:1 1 25%;min-width:0;overflow-wrap:anywhere';
  const file=el('input',null,label);file.type='file';file.accept='image/jpeg,image/png,application/pdf';file.setAttribute('aria-label',name);
  file.style.cssText='display:block;width:100%;min-width:0;max-width:100%;font:inherit';
  const filename=el('span','',section);filename.style.cssText='flex:1 1 25%;min-width:0;overflow-wrap:anywhere';
  const status=el('span','',section);status.setAttribute('role','status');
  const actions=el('div','',section);actions.style.cssText='display:flex;flex-wrap:wrap;gap:var(--space-2)';
  const row={kind,file,doc:(documents||[]).find(d=>d.kind===kind&&(d.profession||'planner')===profession),uncertain:false};
  row.refresh=()=>{file.hidden=!!row.doc;file.style.display=row.doc?'none':'block';filename.textContent=row.doc?.filename||'';filename.hidden=!row.doc;actions.hidden=!row.doc;actions.style.display=row.doc?'flex':'none';status.textContent=row.doc?'제출됨':file.files[0]?'선택됨':'미제출';};
  file.onchange=()=>row.refresh();
  const view=el('button','제출자료 보기',actions);view.type='button';view.className='btn secondary';
  view.onclick=()=>run(async()=>{const blob=await documentRequest(client,{action:'read',id:row.doc.id});const url=URL.createObjectURL(blob);const a=el('a','파일 열기',section);a.href=url;a.download=row.doc.filename;a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);});
  const remove=el('button','자료 삭제',actions);remove.type='button';remove.className='btn secondary';
  remove.onclick=()=>run(async()=>{if(!confirm(profession==='office'?'이 자료를 삭제하면 거점 확인과 신규 방문예약이 중지됩니다. 개인 전문가 활동과 기존 예약은 유지됩니다. 삭제할까요?':'이 자료를 삭제하면 자격 확인과 지도 노출이 중지됩니다. 삭제할까요?'))return;await documentRequest(client,{action:'delete',id:row.doc.id});row.doc=null;row.uncertain=false;file.value='';row.refresh();});
  row.refresh();rows.push(row);
 }
 const consentLabel=el('label');consentLabel.className='consent-row';const consent=el('input',null,consentLabel);consent.type='checkbox';consentLabel.append('확인자료 수집·이용에 동의하며 불필요한 개인정보를 가렸습니다.');
 const policy=el('a','개인정보 수집·보관·삭제 자세히 보기');policy.href='/expert-terms.html#documents';policy.target='_blank';policy.rel='noopener';
 const submit=el('button','제출하기');submit.type='button';submit.className='btn';submit.style.cssText='display:block;width:100%;margin-top:var(--space-3)';
 submit.onclick=()=>run(async()=>{
  if(!consent.checked){message('자료 처리 동의와 개인정보 가림을 확인해 주세요.');return;}
  // A lost response can follow a committed save. Reconcile before retrying that row.
  if(rows.some(row=>row.uncertain)){
   const result=await client.rpc('early_expert_documents');
   if(result.error)throw Error('제출 결과를 확인하지 못했습니다. 선택한 파일은 유지됩니다. 다시 시도해 주세요.');
   for(const row of rows.filter(row=>row.uncertain)){
    row.doc=(result.data||[]).find(d=>d.kind===row.kind&&(d.profession||'planner')===profession)||null;
    row.uncertain=false;row.refresh();
   }
  }
  const pending=rows.filter(row=>!row.doc&&row.file.files[0]);
  if(!pending.length){message(rows.some(row=>row.doc)?'선택한 자료는 이미 제출되었습니다.':'자료 파일을 선택해 주세요.');return;}
  for(const row of pending){
   const ready=await prepareDocument(row.file.files[0]);
   if(ready.size>4194304)throw Error('파일 크기를 4MB 이하로 줄여주세요.');
   const body=new FormData();body.set('file',ready);body.set('kind',row.kind);body.set('profession',profession);body.set('consent','true');body.set('redacted','true');
   row.uncertain=true;
   row.doc=await documentRequest(client,body);
   row.uncertain=false;row.refresh();
  }
  message('제출했습니다. 검토 후 결과를 알려드립니다.');
 });
}
