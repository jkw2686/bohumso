import {el,kst} from './consultation-ui.js';
import {PROFESSIONS,documentRequest,PLEDGES} from './expert-shared.js';
const labels={pending:'심사 대기',approved:'승인',needs_changes:'보완 요청',rejected:'거절',withdrawn:'철회',warning:'경고',suspended:'노출 정지',banned:'제명',submitted:'신청 제출',document_uploaded:'서류 첨부',document_viewed:'서류 열람',document_deleted:'서류 삭제'};
export async function renderExpertAdmin({client,host,message}){
 host.replaceChildren();const {data,error}=await client.rpc('expert_admin_list');
 if(error){el('p','새 심사 기능의 서버 연결이 준비되지 않았습니다. 기존 신청은 보존되며 이 화면에서 승인하지 않습니다.',host);return;}
 el('p','지인 테스트용 심사 · 가상 자료 사용. 승인은 실명·자격·등록기관 확인 근거를 각각 확인한 뒤 처리하세요. 서약은 노출 순위에 사용하지 않습니다.',host);
 if(!data.length){el('p','새 가입 절차로 접수된 신청이 없습니다.',host);return;}
 for(const row of data){
  const card=el('section',undefined,host);card.className='card expert-review-card';
  el('h2',(PROFESSIONS[row.profession]?.name||row.profession)+' · '+row.full_name,card);
  el('p',row.region+' · 신청 '+kst(row.submitted_at),card);el('p',(labels[row.status]||row.status)+(row.sanction?' · '+labels[row.sanction]:'')+(row.sanction_until?' · '+kst(row.sanction_until)+'까지':''),card);
  if(row.legacy){el('p','이전 양식의 신청입니다. 기존 기록은 보존됩니다. 새 서류·서약 절차로 다시 신청한 뒤 심사하세요.',card);continue;}
  const detail=el('details',undefined,card);el('summary','서류·신고·심사 상세 보기',detail);
  el('p','소속: '+row.organization+' · 연락처: '+row.phone,detail);el('p',(PROFESSIONS[row.profession]?.registry||'등록번호')+': '+row.registration_number,detail);
  el('p','휴대폰 소유 확인: '+kst(row.phone_verified_at)+' · 실명 확인과 별개',detail);
  el('p','서약 '+row.agreement_version+' · '+kst(row.agreed_at),detail);
  const terms=el('details',undefined,detail);el('summary','동의한 서약 3항목',terms);PLEDGES.forEach(text=>el('p',text,terms));
  const local=el('p','',detail);local.setAttribute('role','status');let busy=false;const urls=[];
  const run=async fn=>{if(busy)return;busy=true;const controls=[...card.querySelectorAll('button,input,textarea')];controls.forEach(b=>b.disabled=true);try{await fn();}catch(e){const known={self_review_forbidden:'본인 신청은 다른 관리자가 심사해야 합니다.',stale_application:'신청 내용이 변경되었습니다. 새로고침 후 확인해 주세요.',verification_required:'서류·자격·등록기관 확인을 모두 완료해야 승인할 수 있습니다.'};local.textContent=known[e.message]||e.message||'처리하지 못했습니다.';}finally{busy=false;controls.forEach(b=>b.disabled=false);}};
  for(const doc of row.documents||[]){const box=el('div',undefined,detail);el('p',(doc.kind==='identity'?'신분증':PROFESSIONS[row.profession]?.qualification)+' · '+doc.filename+(doc.deleting?' · 삭제 대기':''),box);
   const view=el('button','비공개 서류 열람',box);view.type='button';view.className='btn ghost';view.onclick=()=>run(async()=>{const blob=await documentRequest(client,{action:'read',id:doc.id});const url=URL.createObjectURL(blob);urls.push(url);box.querySelector('.document-preview')?.remove();const preview=el('div',undefined,box);preview.className='document-preview';if(doc.mime.startsWith('image/')){const img=el('img',undefined,preview);img.src=url;img.alt=doc.filename;img.className='document-thumbnail';}else{const link=el('a','PDF 내려받아 확인',preview);link.href=url;link.download=doc.filename;}local.textContent='열람 기록을 남겼습니다.';});
   const remove=el('button','서류 삭제',box);remove.type='button';remove.className='btn ghost';remove.onclick=()=>run(async()=>{await documentRequest(client,{action:'delete',id:doc.id});urls.forEach(URL.revokeObjectURL);await renderExpertAdmin({client,host,message});message('비공개 서류를 삭제했습니다.');});
  }
  el('h3','소비자 신고',detail);if(!row.reports?.length)el('p','접수된 신고 없음',detail);for(const report of row.reports||[]){el('p',kst(report.created_at)+' · '+(report.resolved?'처리 완료':'확인 필요')+' · '+report.category+' · '+report.reason,detail);}
  const checks={};if(['pending','needs_changes'].includes(row.status)){for(const [key,text]of [['identity','가려진 신분증과 신청자 신원을 대조했습니다.'],['qualification','직군에 맞는 자격 서류를 확인했습니다.'],['registry','해당 기관의 등록번호와 유효 자격을 별도로 확인했습니다.']]){const label=el('label',undefined,detail);const input=el('input',undefined,label);input.type='checkbox';checks[key]=input;label.append(document.createTextNode(text));}}
  const reasonLabel=el('label','심사·제재 사유 및 확인 근거 (5~1,000자)',detail);const reason=el('textarea',undefined,reasonLabel);reason.maxLength=1000;reason.rows=3;reason.placeholder='확인 기관·확인 내용 또는 보완이 필요한 사항';
  const untilLabel=el('label','노출 정지 종료 일시 (한국 시간)',detail);const until=el('input',undefined,untilLabel);until.type='datetime-local';untilLabel.hidden=row.status!=='approved'||row.sanction!=='warning';
  const options=['pending','needs_changes'].includes(row.status)?['approved','needs_changes','rejected']:row.status==='approved'?(row.sanction==='banned'?[]:row.sanction==='suspended'?['banned']:row.sanction==='warning'?['suspended']:['warning']):[];
  for(const decision of options){const b=el('button',labels[decision],detail);b.type='button';b.className=decision==='approved'?'btn':'btn ghost';b.onclick=()=>run(async()=>{
   if(reason.value.trim().length<5)throw Error('근거와 사유를 5자 이상 입력해 주세요.');
   if(decision==='approved'&&!Object.values(checks).every(i=>i.checked))throw Error('신원·자격·등록기관 확인을 모두 완료해 주세요.');
   const stamp=decision==='suspended'&&until.value?new Date(until.value+':00+09:00').toISOString():null;if(decision==='suspended'&&!stamp)throw Error('정지 종료 일시를 지정해 주세요.');
   const result=await client.rpc('expert_review',{target_user:row.user_id,decision,reason:reason.value.trim(),expected_revision:row.revision,checks:Object.fromEntries(Object.entries(checks).map(([k,v])=>[k,v.checked])),until_at:stamp});if(result.error)throw result.error;
   urls.forEach(URL.revokeObjectURL);await renderExpertAdmin({client,host,message});message('심사 결과와 담당자·시각을 기록했습니다.');
  });}
  const audit=el('details',undefined,detail);el('summary','처리 이력',audit);for(const event of row.events||[])el('p',kst(event.created_at)+' · '+(labels[event.action]||event.action)+' · 담당자 '+(event.actor||'시스템')+(event.reason?' · '+event.reason:''),audit);
  window.addEventListener('pagehide',()=>urls.forEach(URL.revokeObjectURL),{once:true});
 }
}
