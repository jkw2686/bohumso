import {el,kst,states as bookingStates} from './consultation-ui.js';

export const kinds={INQUIRY:'이용 문의',REPORT:'오류·전문가 신고',ACCESS:'개인정보 열람',CORRECT:'개인정보 정정',DELETE:'개인정보 삭제',WITHDRAW:'회원탈퇴'};
const states={RECEIVED:'운영자 확인 대기',IN_PROGRESS:'대화 진행 중',COMPLETED:'처리 완료',DECLINED:'처리 사유 안내'};
const errorCopy={request_forbidden:'이 문의를 확인할 권한이 없습니다.',admin_required:'관리자 계정만 이용할 수 있습니다.',stale_request:'새 메시지나 변경이 있습니다. 대화를 새로고침한 뒤 다시 확인해 주세요.',request_limit:'잠시 후 새 문의를 접수해 주세요. 기존 문의에는 내용을 이어서 남길 수 있습니다.',invalid_support_message:'내용을 2~2,000자로 입력해 주세요.',support_take_required:'문의 맡기를 누른 뒤 답변해 주세요.',support_already_taken:'다른 운영자가 맡고 있는 문의입니다.',support_answer_required:'답변을 확인한 뒤 해결 여부를 알려 주세요.',request_key_conflict:'이전 전송 결과를 먼저 확인해 주세요. 같은 전송 번호로 다른 내용을 보낼 수 없습니다.'};
export function supportError(e){return errorCopy[e?.message]||'저장 여부를 확인하지 못했습니다. 입력을 유지했으니 새로고침으로 이력을 확인하거나 같은 내용으로 다시 전송해 주세요.';}
export async function callSupport(client,operation,payload={}){const r=await client.rpc('support_command',{operation,payload});if(r.error)throw r.error;if(['create','message','resolve','take','release','reply','note'].includes(operation)&&(!r.data?.saved||!r.data.id))throw Error('missing_receipt');return r.data;}
export async function supportAvailable(client){const r=await client.rpc('support_command',{operation:'capabilities'});if(!r.error)return true;if(['PGRST202','42883'].includes(r.error.code))return false;throw r.error;}
export function button(parent,text,action,ghost=false){const b=el('button',text,parent);b.type='button';b.className=ghost?'btn ghost':'btn';b.onclick=action;return b;}
export function statusNode(parent){const n=el('p','',parent);n.setAttribute('role','status');return n;}
export function messageField(parent,label){const wrap=el('label',label,parent);wrap.className='field';const input=el('textarea',undefined,wrap);input.rows=3;input.minLength=2;input.maxLength=2000;input.required=true;return input;}
export function drawConversation(parent,row){
 parent.replaceChildren();
 const messages=row.messages||[];
 const list=el('ol',undefined,parent);list.className='support-conversation';list.setAttribute('aria-label','문의 원문과 답변');
 const add=(sender,body,stamp)=>{const item=el('li',undefined,list);item.className='support-message '+sender;el('strong',({customer:'문의자',operator:'운영자 답변',automatic:'자동안내',note:'내부 메모 · 고객에게 보이지 않음'})[sender],item);el('p',body,item);if(stamp)el('small',kst(stamp),item);};
 if(!messages.length||messages[0].body!==row.detail||messages[0].sender!=='customer')add('customer',row.detail,row.created_at);
 for(const m of messages)add(m.sender,m.body,m.created_at);
 if(row.response&&!messages.some(m=>m.sender==='operator'&&m.body===row.response))add('operator',row.response,row.updated_at);
}
export function statusText(row){return row.confirmed?'고객이 해결을 확인했어요':row.status==='COMPLETED'?'운영 처리 완료 · 해결 여부 확인':states[row.status]||'처리 상태 확인';}

// One idempotency key per exact attempt survives reload; inquiry contents remain in memory only.
export function attemptKey(scope,storage=globalThis.sessionStorage){let saved;try{saved=JSON.parse(storage.getItem(scope));}catch{}let key=saved?.key||crypto.randomUUID(),fingerprint=saved?.fingerprint,revision=saved?.revision;
 return {async prepare(payload){const {revision:nextRevision,...content}=payload;const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(content)));const next=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');if(fingerprint!==next){key=crypto.randomUUID();revision=nextRevision;}fingerprint=next;try{storage.setItem(scope,JSON.stringify({key,fingerprint,revision}));}catch{}return {...content,...(revision===undefined?{}:{revision}),request_key:key};},clear(){try{storage.removeItem(scope);}catch{}fingerprint=null;revision=undefined;key=crypto.randomUUID();}};
}

export async function mountCustomerSupport({client,host,userId,initialKind='INQUIRY',initialBody=''}){
 host.replaceChildren();host.classList.add('support-workspace');
 el('h2','문의와 답변',host);el('p','운영자가 내용을 확인하고 이 대화에 답변합니다. 건강 상세정보·비밀번호·인증번호는 적지 마세요.',host);
 const create=el('details',undefined,host);create.open=true;el('summary','새 문의 작성',create);
 const form=el('form',undefined,create),label=el('label','문의 종류',form);label.className='field';const kind=el('select',undefined,label);for(const [value,text]of Object.entries(kinds)){const o=el('option',text,kind);o.value=value;}kind.value=initialKind;
 const text=messageField(form,'문의 내용');text.value=initialBody;
 const bookingLabel=el('label','관련 예약 (선택)',form);bookingLabel.className='field';bookingLabel.hidden=true;const booking=el('select',undefined,bookingLabel);el('option','예약과 관계없는 문의',booking).value='';const bookingInfo=statusNode(form);
 void callSupport(client,'reservations').then(rows=>{for(const row of rows){const option=el('option',kst(row.preferred_at)+' · '+(bookingStates[row.state]||'상태 확인'),booking);option.value=row.id;}bookingLabel.hidden=!rows.length;}).catch(()=>{bookingInfo.textContent='예약 목록을 불러오지 못했지만 문의는 남길 수 있습니다.';});
 const warning=el('p','개인정보 삭제는 보관 의무와 처리 범위를 확인합니다. 회원탈퇴를 접수하면 회원 이용이 중지됩니다.',form);
 const setWarning=()=>warning.hidden=!['DELETE','WITHDRAW'].includes(kind.value);kind.onchange=setWarning;setWarning();
 const submit=button(form,'문의 접수');submit.type='submit';const notice=statusNode(form);let busy=false;
 const attempt=attemptKey('support:create:'+userId);
 const toolbar=el('div',undefined,host);toolbar.className='review-actions';const reload=button(toolbar,'대화 새로고침',()=>refresh(),true);const syncStatus=statusNode(host);
 const list=el('div',undefined,host);list.className='support-threads';const cards=new Map();
 async function refresh(){reload.disabled=true;try{const rows=await callSupport(client,'mine');
  for(const row of rows){let entry=cards.get(row.id);if(!entry){const card=el('article',undefined,list);card.className='card support-ticket';card.dataset.inquiryId=row.id;const heading=el('h3',kinds[row.kind]||'문의',card),state=el('p','',card),transcript=el('div',undefined,card);const follow=el('form',undefined,card),input=messageField(follow,'추가 메시지');const send=button(follow,'이 문의에 이어서 보내기');send.type='submit';const info=statusNode(follow);const resolve=button(card,'해결됐어요',null,true);entry={card,heading,state,transcript,input,send,info,resolve,row,working:false,attempt:attemptKey('support:message:'+userId+':'+row.id),resolveAttempt:attemptKey('support:resolve:'+userId+':'+row.id)};cards.set(row.id,entry);
   follow.onsubmit=async e=>{e.preventDefault();if(entry.working||!follow.reportValidity())return;entry.working=true;send.disabled=true;input.readOnly=true;try{const data={id:row.id,body:input.value.trim()};await callSupport(client,'message',await entry.attempt.prepare(data));entry.attempt.clear();input.value='';info.textContent='메시지를 저장했습니다.';await refresh();}catch(e){info.textContent=supportError(e);}finally{entry.working=false;send.disabled=false;input.readOnly=false;}};
   resolve.onclick=async()=>{if(entry.working)return;entry.working=true;resolve.disabled=true;try{const data={id:row.id,revision:entry.row.revision};await callSupport(client,'resolve',await entry.resolveAttempt.prepare(data));entry.resolveAttempt.clear();await refresh();info.textContent='해결 확인을 저장했습니다. 추가 문의는 같은 대화에 남길 수 있어요.';}catch(e){if(e.message==='stale_request')entry.resolveAttempt.clear();info.textContent=supportError(e);}finally{entry.working=false;resolve.disabled=false;}};
  }
  entry.row=row;entry.state.textContent=statusText(row);drawConversation(entry.transcript,row);entry.resolve.hidden=row.confirmed||!(row.response||row.messages.some(m=>['operator','automatic'].includes(m.sender)));
 }
 syncStatus.textContent=rows.length?'답변은 새로고침하거나 다시 방문해도 이곳에서 확인할 수 있어요.':'아직 접수한 문의가 없습니다.';
 }catch(e){syncStatus.textContent='대화를 불러오지 못했습니다. 작성한 내용은 유지됩니다. 다시 새로고침해 주세요.';}finally{reload.disabled=false;}}
 form.onsubmit=async e=>{e.preventDefault();if(busy||!form.reportValidity())return;if(kind.value==='WITHDRAW'&&!confirm('회원 이용을 중지하고 탈퇴를 접수할까요?'))return;busy=true;submit.disabled=true;kind.disabled=true;booking.disabled=true;text.readOnly=true;
  const operation=kind.value;try{const data={kind:operation,body:text.value.trim(),confirmed:operation==='WITHDRAW',...(booking.value?{consultation_id:booking.value}:{})};const result=await callSupport(client,'create',await attempt.prepare(data));if(!result?.saved||!result.id)throw Error('missing_receipt');attempt.clear();text.value='';booking.value='';notice.textContent='문의가 저장됐습니다. 아래 대화에서 답변을 확인해 주세요.';
   if(operation==='WITHDRAW'){try{await client.auth.signOut({scope:'global'});}catch{}host.replaceChildren();el('p','탈퇴 요청을 접수하고 회원 이용을 중지했습니다. 자료 삭제 처리 결과는 운영자가 안내합니다.',host);return;}
   create.open=false;await refresh();cards.get(result.id)?.heading.scrollIntoView({block:'nearest'});
  }catch(e){notice.textContent=supportError(e);}finally{busy=false;submit.disabled=false;kind.disabled=false;booking.disabled=false;text.readOnly=false;}}
 const unload=e=>{if(host.isConnected&&(text.value.trim()||[...cards.values()].some(c=>c.input.value.trim()))){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',unload);
 await refresh();
 return ()=>window.removeEventListener('beforeunload',unload);
}

export async function mountSupportInbox({client,host}){
 host.classList.add('support-workspace');const toolbar=el('div',undefined,host);toolbar.className='review-actions';const sync=statusNode(host);const rowsHost=el('div',undefined,host),detail=el('section',undefined,host);detail.setAttribute('aria-label','문의 처리');let selected=null,dirty=false,busy=false,offset=0,loadGeneration=0;
 const reload=button(toolbar,'문의함 새로고침',()=>refresh(),true),more=button(toolbar,'다음 문의',()=>{offset+=50;refresh();},true),first=button(toolbar,'처음으로',()=>{offset=0;refresh();},true);
 async function refresh(){try{const rows=await callSupport(client,'admin_list',{offset});rowsHost.replaceChildren();more.disabled=rows.length<50;first.disabled=offset===0;el('p','미답변이 오래된 순서 · 고객의 해결 확인 전까지 미해결로 집계합니다.',rowsHost);for(const row of rows){const b=button(rowsHost,(kinds[row.kind]||'문의')+' · '+statusText(row)+' · '+kst(row.waiting_since||row.created_at),()=>open(row.id),true);b.dataset.inquiryId=row.id;}if(!rows.length)el('p','표시할 문의가 없습니다.',rowsHost);sync.textContent='문의함을 불러왔습니다.';}catch(e){sync.textContent=supportError(e);}}
 async function open(id,force=false,keepDraft=false){if(busy)return;if(dirty&&!force&&!confirm('작성 중인 답변이나 메모를 버리고 이동할까요?'))return;const drafts=keepDraft?Object.fromEntries([...detail.querySelectorAll('[data-support-draft]')].map(n=>[n.dataset.supportDraft,n.value])):{};const generation=++loadGeneration;try{const row=await callSupport(client,'admin_detail',{id});if(generation!==loadGeneration)return;selected=row;dirty=false;detail.replaceChildren();detail.dataset.inquiryId=id;el('h3',kinds[row.kind]||'문의',detail);el('p',statusText(row),detail);el('p','확인 이유 · '+row.review_reason,detail);el('p',row.handling==='operator'?'운영자가 맡은 문의 · 자동응대 중지':'운영자 확인 대기 · AI 미연동',detail);
   if(row.summary){const summary=el('details',undefined,detail);el('summary','AI 요약 · 원문과 함께 확인',summary);el('p',row.summary,summary);}else el('p','AI 요약 없음 · 아래 원문을 확인하세요.',detail);
   const transcript=el('div',undefined,detail);drawConversation(transcript,row);
   if(row.related){const related=el('div',undefined,detail);el('strong','관련 예약',related);el('p',(bookingStates[row.related.state]||'상태 확인')+' · '+kst(row.related.preferred_at),related);el('small','예약 번호 '+row.related.id,related);el('p','이 화면에서는 예약을 변경하지 않습니다.',related);}else el('p','연결된 예약 없음',detail);
   const actions=el('div',undefined,detail);actions.className='review-actions';const info=statusNode(detail);
   button(actions,'대화 최신 내용 확인',()=>open(id,true,true),true);
   const action=async(operation,payload={},attempt=attemptKey('support:admin:'+id+':'+operation))=>{if(busy)return;busy=true;for(const b of detail.querySelectorAll('button'))b.disabled=true;for(const f of detail.querySelectorAll('textarea'))f.readOnly=true;try{const data={id,revision:selected.revision,...payload};await callSupport(client,operation,await attempt.prepare(data));attempt.clear();const sent=detail.querySelector('[data-support-draft="'+operation+'"]');if(sent)sent.value='';dirty=false;info.textContent='저장했습니다.';busy=false;await open(id,true,true);await refresh();sync.textContent=operation==='note'?'내부 메모를 저장했습니다. 고객에게는 보이지 않습니다.':operation==='reply'?'답변을 저장했습니다. 고객이 같은 대화에서 확인할 수 있습니다.':'문의 담당 상태를 저장했습니다.';}catch(e){if(e.message==='stale_request')attempt.clear();info.textContent=supportError(e);}finally{busy=false;for(const b of detail.querySelectorAll('button'))b.disabled=false;for(const f of detail.querySelectorAll('textarea'))f.readOnly=false;}};
   if(row.handling!=='operator')button(actions,'문의 맡기',()=>action('take'));
   else {button(actions,'인수 해제',()=>{if(confirm((dirty?'작성 중인 답변·메모를 저장하지 않고 ':'')+'문의 인수를 해제할까요? 현재 AI는 연결되지 않아 운영자 확인 대기로 남습니다.'))action('release',{confirmed:true});},true);
    const replyForm=el('form',undefined,detail),reply=messageField(replyForm,'고객에게 보낼 답변');reply.dataset.supportDraft='reply';reply.value=drafts.reply||'';const send=button(replyForm,'답변 전송');send.type='submit';const replyAttempt=attemptKey('support:admin:'+id+':reply');replyForm.onsubmit=e=>{e.preventDefault();if(replyForm.reportValidity())action('reply',{body:reply.value.trim()},replyAttempt);};
    const memo=el('details',undefined,detail);el('summary','내부 메모 · 고객에게 보이지 않음',memo);const memoForm=el('form',undefined,memo),note=messageField(memoForm,'내부 메모 내용');note.dataset.supportDraft='note';note.value=drafts.note||'';memo.open=Boolean(note.value);const save=button(memoForm,'내부 메모 저장',null,true);save.type='submit';const noteAttempt=attemptKey('support:admin:'+id+':note');memoForm.onsubmit=e=>{e.preventDefault();if(memoForm.reportValidity())action('note',{body:note.value.trim()},noteAttempt);};
   }
   dirty=Object.values(drafts).some(Boolean);detail.oninput=()=>dirty=true;el('p',row.confirmed?'다음 조치 · 추가 메시지가 오면 다시 확인하세요.':row.handling==='operator'?'다음 조치 · 원문과 처리 결과를 확인하고 답변하세요. 답변만으로 해결 처리되지 않습니다.':'다음 조치 · 문의 맡기를 눌러 답변을 작성하세요.',detail);const heading=detail.querySelector('h3');heading.tabIndex=-1;heading.focus();
  }catch(e){sync.textContent=supportError(e);}}
 const unload=e=>{if(host.isConnected&&dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',unload);
 await refresh();
 const metrics=el('details',undefined,host);el('summary','문의 운영 집계',metrics);const counts=el('p','',metrics);const refreshCounts=async()=>{try{const m=await callSupport(client,'metrics');counts.textContent='전체 '+m.total+' · 고객이 확인한 AI 해결 '+m.customerConfirmedAI+' · 운영 검토 '+m.operatorReview+' · 재문의 '+m.reopened+' · 미해결 '+m.unresolved;}catch{counts.textContent='집계를 불러오지 못했습니다.';}};button(metrics,'집계 새로고침',refreshCounts,true);el('p','실제 처리시간: 미측정 · AI 사용량·비용: 미연동 (0원으로 집계하지 않음)',metrics);metrics.ontoggle=()=>{if(metrics.open)void refreshCounts();};await refreshCounts();
 return ()=>window.removeEventListener('beforeunload',unload);
}
