import {el,kst,states as bookingStates} from './consultation-ui.js';
import {attemptKey,kinds,button,statusNode,messageField,supportError} from './support-ui.js';

export const chatStates={WAITING:'답변 대기',REVIEWING:'확인 중',WAITING_CUSTOMER:'고객 답변 대기',ANSWERED:'답변 완료',CLOSED:'종료'};
export const topics={usage:'이용 방법',booking:'예약·연결',profile:'프로필·지도',payment:'결제·이용권',error:'오류 신고',other:'기타'};
export const chatNotice='문의를 남겨주시면 내용을 검토한 후 이 대화창으로 답변드립니다. 실시간 상담이 아니므로 답변까지 시간이 걸릴 수 있습니다.';
export const sensitiveNotice='주민등록번호, 계좌 비밀번호, 진단서 등 민감한 정보는 보내지 마세요.';
const failedCopy='전송하지 못했습니다. 다시 시도해 주세요.';
const writes=new Set(['create','message','reply','note','take','release','resolve','state','read','admin_read']);
export async function chatRPC(client,operation,payload={}){
 const {data,error}=await client.rpc('support_command',{operation,payload});if(error)throw error;
 if(writes.has(operation)&&(!data?.saved||!data.id))throw Error('missing_receipt');return data;
}
export async function chatAvailable(client){const {data,error}=await client.rpc('support_command',{operation:'capabilities'});if(error){if(['PGRST202','42883'].includes(error.code))return false;throw error;}return data?.version>=2;}
// Never change the key after an uncertain outcome. Retrying the exact payload is serialized on the server.
export async function sendChat(client,operation,payload){
 try{return await chatRPC(client,operation,payload);}catch(error){
  if(error.code==='P0001'||['42501','23514','22P02'].includes(error.code))throw error;
  try{const receipt=await chatRPC(client,'receipt',{request_key:payload.request_key});if(receipt?.saved&&receipt.id)return receipt;}catch{}
  const failure=Error(failedCopy);failure.uncertain=true;throw failure;
 }
}
function choice(parent,label,values,value=''){const wrap=el('label',label,parent);wrap.className='field';const input=el('select',undefined,wrap);for(const [v,text]of Object.entries(values)){const o=el('option',text,input);o.value=v;}input.value=value;return input;}
function field(parent,label){const input=messageField(parent,label);input.minLength=1;input.setAttribute('aria-describedby','supportSensitiveNotice');return input;}
function announce(parent){const s=statusNode(parent);s.setAttribute('aria-live','polite');return s;}
function ticketTitle(r){return (topics[r.topic]||kinds[r.kind]||'문의')+' · '+r.id.slice(0,8);}
function errorText(e){if(e.message==='invalid_support_message')return '내용을 1~2,000자로 입력해 주세요.';return e.uncertain?failedCopy+' 입력 내용은 유지됩니다. 같은 내용으로 다시 보내세요.':supportError(e);}
const notifyRead=()=>window.dispatchEvent(new Event('bohumso:support-read'));
function warnUnsaved(host,dirty){const fn=e=>{if(host.isConnected&&dirty()){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',fn);return()=>window.removeEventListener('beforeunload',fn);}

// Poll only this visible conversation, at most once per minute. Navigation and explicit refresh fetch immediately.
function refreshOnReturn(host,refresh){let last=Date.now(),running=false;
 const tick=async()=>{if(!host.isConnected||document.hidden||running||Date.now()-last<60000)return;last=Date.now();running=true;try{await refresh();}finally{running=false;}};
 const timer=setInterval(tick,60000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);
 return()=>{clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick);};
}

const chatDate=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'long'});
const chatTime=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit',hour12:true});
function chatIcon(parent,symbol,label,action){const b=button(parent,symbol,action,true);b.classList.add('support-icon-button');b.setAttribute('aria-label',label);b.title=label;return b;}
function composerInput(input){
 input.rows=1;input.placeholder='메시지를 입력하세요';input.parentElement.classList.add('support-compose-field');
 const label=el('span',input.parentElement.firstChild.textContent);label.className='support-visually-hidden';input.parentElement.firstChild.replaceWith(label);
 const resize=()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight+input.offsetHeight-input.clientHeight,120)+'px';};input.addEventListener('input',resize);return resize;
}
function chatViewport(pane){
 const viewport=window.visualViewport;
 const fit=()=>{if(pane.hidden||!pane.isConnected)return;
  // Let browser pinch zoom pan normally; only follow the visual viewport for the keyboard.
  if(viewport&&Math.abs(viewport.scale-1)<.05){pane.style.setProperty('--support-height',viewport.height+'px');pane.style.setProperty('--support-top',viewport.offsetTop+'px');}
  else{pane.style.removeProperty('--support-height');pane.style.removeProperty('--support-top');}
 };
 viewport?.addEventListener('resize',fit);viewport?.addEventListener('scroll',fit);window.addEventListener('resize',fit);fit();
 return()=>{viewport?.removeEventListener('resize',fit);viewport?.removeEventListener('scroll',fit);window.removeEventListener('resize',fit);};
}

// Keep scroll position when the reader is looking at old messages. Read only a reply actually brought into view.
function transcript(parent,client,admin=false,onRead=()=>{}){
 const fresh=button(parent,'새 메시지 보기',()=>{scroll.scrollTop=scroll.scrollHeight;list.lastElementChild?.scrollIntoView({block:'nearest'});fresh.hidden=true;},true);fresh.hidden=true;
 fresh.classList.add('support-new-messages');
 const scroll=el('div',undefined,parent);scroll.className='support-scroll';scroll.tabIndex=0;scroll.setAttribute('aria-label','문의 대화');
 const list=el('ol',undefined,scroll);list.className='support-conversation';list.setAttribute('aria-label','문의 원문과 답변');
 let observer,signature='',lastRow,reading=false,seen=0;
 const mark=async()=>{if(reading||document.hidden||!lastRow||!parent.isConnected)return;const target=lastRow.messages.filter(m=>m.sender===(admin?'customer':'operator')).at(-1);if(!target||target.id<=seen)return;
  const node=list.querySelector('[data-message-id="'+target.id+'"] [data-message-end]');if(!node)return;const b=node.getBoundingClientRect(),s=scroll.getBoundingClientRect();if(b.bottom>s.bottom||b.top<s.top||b.bottom>innerHeight||b.top<0)return;
  reading=true;try{await chatRPC(client,admin?'admin_read':'read',{id:lastRow.id,message_id:target.id});seen=target.id;notifyRead();onRead(lastRow.id);}catch{/* A failed cursor write leaves the reply unread for retry. */}finally{reading=false;}
 };
 document.addEventListener('visibilitychange',mark);scroll.addEventListener('scroll',()=>{if(scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop<30)fresh.hidden=true;void mark();});
 return {draw(row){lastRow=row;const next=JSON.stringify(row.messages);if(signature===next){void mark();return;}const first=!signature,atEnd=scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop<30,top=scroll.scrollTop;signature=next;
  observer?.disconnect();list.replaceChildren();
  const messages=[...row.messages];if(!messages.some(m=>m.sender==='customer'&&m.body===row.detail))messages.unshift({sender:'customer',body:row.detail,created_at:row.created_at});
  if(row.response&&!messages.some(m=>m.sender==='operator'&&m.body===row.response))messages.push({sender:'operator',body:row.response,created_at:row.updated_at});
  let previousDate='';
  for(const m of messages){const date=chatDate.format(new Date(m.created_at));if(!admin&&date!==previousDate){el('li',date,list).className='support-date';previousDate=date;}
   const li=el('li',undefined,list);li.className='support-message '+m.sender;if(m.id)li.dataset.messageId=m.id;
   if(!admin&&m.sender==='operator'){const avatar=el('span','보',li);avatar.className='support-avatar';avatar.setAttribute('aria-hidden','true');}
   const content=el('div',undefined,li);content.className='support-message-content';
   el('strong',({customer:admin?'문의자':'나',operator:'보험소 운영자',automatic:'자동 안내',note:'내부 메모 · 고객에게 보이지 않음'})[m.sender],content);
   el('p',m.body,content).className='support-bubble';const stamp=el('small',admin?kst(m.created_at):chatTime.format(new Date(m.created_at)),li);stamp.title=kst(m.created_at);stamp.dataset.messageEnd='';
  }
  if(first||atEnd){scroll.scrollTop=scroll.scrollHeight;fresh.hidden=true;}else{scroll.scrollTop=top;fresh.hidden=false;}
  const target=row.messages.filter(m=>m.sender===(admin?'customer':'operator')).at(-1);
  if(target&&globalThis.IntersectionObserver){observer=new IntersectionObserver(()=>void mark(),{threshold:1});const end=list.querySelector('[data-message-id="'+target.id+'"] [data-message-end]');if(end)observer.observe(end);}
  void mark();
 },destroy(){observer?.disconnect();document.removeEventListener('visibilitychange',mark);}};
}

export async function mountSupportChat({client,host,userId,initialKind='INQUIRY',initialBody=''}){
 host.replaceChildren();host.classList.add('support-workspace');const guidance=el('details',undefined,host);guidance.className='support-entry-guidance';el('summary','이용 안내',guidance);el('p',chatNotice,guidance);
 const privacy=el('p',sensitiveNotice,guidance);privacy.id='supportSensitiveNotice';privacy.className='support-sensitive';
 el('p','보험소 이용 문의입니다. 보험사 청구 접수나 전문가 상담·예약 신청과는 별개예요.',guidance).className='support-context';
 const nav=el('div',undefined,host);nav.className='review-actions';
 const createPane=el('section',undefined,host),historyPane=el('section',undefined,host),detailPane=el('section',undefined,host);
 createPane.id='supportNew';historyPane.id='supportHistory';detailPane.id='supportThread';createPane.className=detailPane.className='support-chat-room';detailPane.hidden=true;createPane.hidden=true;
 const sync=announce(host),list=el('div',undefined,historyPane);sync.classList.add('support-sync');let busy=false,selected=null,current=null,viewer=null,generation=0,pendingCreate=null,stopViewport=null,syncFailed=false;
 const screen=pane=>{stopViewport?.();stopViewport=null;document.body.classList.toggle('support-chat-open',Boolean(pane));if(pane)stopViewport=chatViewport(pane);};
 const drafts=new Map(),offered=new Map();const createAttempt=attemptKey('support:create:'+userId);
 const newButton=button(nav,'1:1 문의',()=>show('new'));const historyButton=button(nav,'문의 내역',()=>show('history'),true);
 const refreshButton=button(nav,'새로고침',async()=>{const rows=await refreshList();if(selected)await updateThread();else await offerReply(rows);},true);
 historyButton.hidden=true;host.prepend(nav);refreshButton.classList.add('support-list-refresh');newButton.setAttribute('aria-controls',createPane.id);historyButton.setAttribute('aria-controls',historyPane.id);
 const newHeader=el('header',undefined,createPane);newHeader.className='support-chat-header';chatIcon(newHeader,'‹','문의 내역으로 돌아가기',()=>show('history'));
 const newIdentity=el('div',undefined,newHeader);const newTitle=el('h2','보험소 고객센터',newIdentity);newTitle.tabIndex=-1;el('p','1:1 문의',newIdentity);
 chatIcon(newHeader,'×','대화창 닫기',()=>show('history'));
 el('p','문의가 저장되면 대화창이 닫혀요.',createPane).className='support-chat-hint';
 const welcome=el('div',undefined,createPane);welcome.className='support-chat-welcome';
 el('h3','어떤 점이 불편하셨나요?',welcome);el('p','확인 후 이 대화창으로 답변드려요.',welcome);el('p',sensitiveNotice,welcome).id='supportNewSensitive';
 const newGuide=el('details',undefined,welcome);el('summary','문의 전 확인',newGuide);el('p',chatNotice,newGuide);el('p','보험소 이용 문의를 남겨 주세요. 전문가 상담·예약 신청과는 별개예요.',newGuide);
 const newFooter=el('div',undefined,createPane);newFooter.className='support-chat-footer';
 const form=el('form',undefined,newFooter);form.id='supportCreate';
 const options=el('details',undefined,form);options.className='support-chat-options';el('summary','문의 유형·개인정보 요청 (선택)',options);options.open=initialKind!=='INQUIRY';
 const topic=choice(options,'문의 유형 (선택)',{'':'선택 안 함',...topics});
 const special=el('details',undefined,options);el('summary','개인정보 열람·정정·삭제·탈퇴 요청',special);
 const kind=choice(special,'요청 종류',kinds,initialKind);special.open=initialKind!=='INQUIRY';
 const warning=el('p','삭제는 보관 의무와 처리 범위를 확인합니다. 탈퇴를 접수하면 회원 이용이 즉시 중지됩니다.',special);
 kind.onchange=()=>warning.hidden=!['WITHDRAW','DELETE'].includes(kind.value);kind.onchange();
 const text=field(form,'문의 내용');text.value=initialBody;text.setAttribute('aria-describedby','supportNewSensitive');const resizeNew=composerInput(text);
 const submit=button(form,'보내기');submit.type='submit';const notice=announce(form);
 const title=el('h2','문의 내역',historyPane);historyPane.prepend(title);title.tabIndex=-1;
 function show(pane,push=true){if(busy)return;generation++;viewer?.destroy();viewer=null;selected=null;current=null;screen(false);host.append(sync);detailPane.hidden=true;createPane.hidden=pane!=='new';historyPane.hidden=pane==='new';
  newButton.setAttribute('aria-pressed',String(pane==='new'));historyButton.setAttribute('aria-pressed',String(pane!=='new'));
  if(push){const u=new URL(location.href);u.searchParams.delete('thread');history.pushState({},'',u);}
  if(pane==='new'){newFooter.append(sync);screen(createPane);resizeNew();newTitle.focus({preventScroll:true});}else title.focus();
 }
 async function offerReply(rows){
  if(!rows||document.hidden||busy||selected||!createPane.hidden||text.value.trim()||[...drafts.values()].some(x=>x.trim()))return;
  const row=rows.find(r=>r.unread&&offered.get(r.id)!==r.last_id);if(row)await open(row.id);
 }
 async function refreshList(){refreshButton.disabled=true;try{const rows=await chatRPC(client,'mine');list.replaceChildren();if(!rows.length)el('p','아직 문의 내역이 없습니다. 새 문의를 남겨 주세요.',list);
  for(const row of rows){const b=button(list,'',()=>open(row.id),true);b.classList.add('support-ticket-link');b.dataset.inquiryId=row.id;
   el('strong',ticketTitle(row),b);el('span',chatStates[row.chat_state],b);el('small',kst(row.created_at),b);if(row.unread)el('span','새 답변',b).className='support-new';
  }if(syncFailed){sync.textContent='';syncFailed=false;}return rows;
 }catch{syncFailed=true;sync.textContent='문의 내역을 불러오지 못했습니다. 새로고침해 주세요. 작성 중인 내용은 유지됩니다.';}finally{refreshButton.disabled=false;}}
 async function open(id,push=true){if(busy)return;const ticket=++generation;try{const row=await chatRPC(client,'detail',{id});if(ticket!==generation)return;
  viewer?.destroy();selected=id;current=row;offered.set(id,row.last_id);createPane.hidden=true;historyPane.hidden=true;detailPane.hidden=false;detailPane.replaceChildren();
  if(push){const u=new URL(location.href);u.searchParams.set('thread',id);history.pushState({},'',u);}
  const header=el('header',undefined,detailPane);header.className='support-chat-header';
  chatIcon(header,'‹','문의 내역으로 돌아가기',()=>show('history'));
  const identity=el('div',undefined,header);const h=el('h2','보험소 고객센터',identity);h.tabIndex=-1;
  const state=el('p',chatStates[row.chat_state],identity);state.dataset.chatState='';
  const threadRefresh=chatIcon(header,'↻','새로고침',async()=>{threadRefresh.disabled=true;try{await refreshList();await updateThread();}finally{threadRefresh.disabled=false;}});
  chatIcon(header,'×','대화창 닫기',()=>show('history'));
  const guidance=el('details',undefined,detailPane);guidance.className='support-chat-guidance';el('summary','확인 후 답변드려요 · 이용 안내',guidance);
  const guidanceBody=el('div',undefined,guidance);el('p',chatNotice,guidanceBody);el('p',sensitiveNotice,guidanceBody).id='supportThreadSensitive';
  el('p','보험소 이용 문의입니다. 보험사 청구 접수나 전문가 상담·예약 신청과는 별개예요.',guidanceBody);
  el('small','문의 번호 '+row.id+' · '+(topics[row.topic]||kinds[row.kind]||'문의'),guidanceBody);
  const transcriptHost=el('div',undefined,detailPane);transcriptHost.className='support-chat-messages';viewer=transcript(transcriptHost,client,false,()=>void refreshList());
  const footer=el('div',undefined,detailPane);footer.className='support-chat-footer';
  const follow=el('form',undefined,footer);follow.id='supportFollow';const input=field(follow,'추가 메시지');input.setAttribute('aria-describedby','supportComposerNotice');input.value=drafts.get(id)||'';
  const resizeInput=composerInput(input);input.oninput=()=>drafts.set(id,input.value);
  const send=button(follow,row.chat_state==='CLOSED'?'추가 문의하기':'보내기');send.type='submit';const info=announce(follow),attempt=attemptKey('support:message:'+userId+':'+id);let pending=null;
  const resolveAttempt=attemptKey('support:resolve:'+userId+':'+id);
  const resolution=el('div',undefined,footer);resolution.className='support-resolution';footer.prepend(resolution);
  el('span','답변이 도움이 되었나요?',resolution);
  const resolve=button(resolution,'해결됐어요',async()=>{if(busy)return;busy=true;resolve.disabled=true;try{await sendChat(client,'resolve',await resolveAttempt.prepare({id,revision:current.revision}));resolveAttempt.clear();await updateThread();await refreshList();info.textContent='해결 확인을 저장했습니다.';}catch(e){if(e.message==='stale_request')resolveAttempt.clear();info.textContent=errorText(e);}finally{busy=false;resolve.disabled=false;}},true);resolve.dataset.chatResolve='';
  resolve.hidden=row.chat_state==='CLOSED'||!row.messages.some(m=>m.sender==='operator')&&!row.response;
  resolution.hidden=resolve.hidden;
  const composerNotice=el('p','민감한 정보는 보내지 마세요 · 실시간 상담이 아니에요',footer);composerNotice.id='supportComposerNotice';
  footer.append(sync);
  follow.onsubmit=async e=>{e.preventDefault();if(busy||!follow.reportValidity())return;busy=true;send.disabled=true;input.readOnly=true;info.textContent='전송 중…';
   try{pending||=await attempt.prepare({id,body:input.value.trim()});await sendChat(client,'message',pending);pending=null;attempt.clear();input.value='';resizeInput();drafts.delete(id);send.textContent='보내기';await refreshList();busy=false;show('history');sync.textContent='메시지를 보냈어요. 답변이 오면 이곳에서 대화창이 열립니다.';}
   catch(e){if(!e.uncertain)pending=null;info.textContent=errorText(e);send.textContent='다시 보내기';}finally{busy=false;send.disabled=false;input.readOnly=Boolean(pending);}};
  screen(detailPane);resizeInput();viewer.draw(row);h.focus({preventScroll:true});sync.textContent='';
 }catch(e){sync.textContent=errorText(e);}}
 async function updateThread(){if(!selected)return;const id=selected,epoch=generation;try{const row=await chatRPC(client,'detail',{id});if(id!==selected||epoch!==generation)return;current=row;const send=detailPane.querySelector('#supportFollow button[type=submit]');if(send.textContent!=='다시 보내기')send.textContent=row.chat_state==='CLOSED'?'추가 문의하기':'보내기';detailPane.querySelector('[data-chat-state]').textContent=chatStates[row.chat_state];const resolve=detailPane.querySelector('[data-chat-resolve]');resolve.hidden=row.chat_state==='CLOSED'||!row.messages.some(m=>m.sender==='operator')&&!row.response;resolve.parentElement.hidden=resolve.hidden;viewer.draw(row);}catch{sync.textContent='새 메시지를 확인하지 못했습니다. 기존 대화와 작성 내용은 유지됩니다.';}}
 form.onsubmit=async e=>{e.preventDefault();if(busy||!form.reportValidity())return;if(kind.value==='WITHDRAW'&&!pendingCreate&&!confirm('회원 이용을 중지하고 탈퇴를 접수할까요?'))return;
  busy=true;submit.disabled=true;text.readOnly=true;topic.disabled=kind.disabled=true;notice.textContent='전송 중…';
  try{pendingCreate||=await createAttempt.prepare({kind:kind.value,body:text.value.trim(),topic:topic.value||null,confirmed:kind.value==='WITHDRAW'});
   const result=await sendChat(client,'create',pendingCreate),withdraw=kind.value==='WITHDRAW';pendingCreate=null;createAttempt.clear();text.value='';notice.textContent='전송 완료';submit.textContent='보내기';
   if(withdraw){await client.auth.signOut({scope:'global'}).catch(()=>{});screen(false);host.replaceChildren();el('p','탈퇴 요청을 접수하고 회원 이용을 중지했습니다. 이후 처리 결과는 운영팀에 문의해 주세요.',host);return;}
   topic.value='';kind.value=initialKind;await refreshList();busy=false;show('history');sync.textContent='문의를 보냈어요. 답변이 오면 이곳에서 대화창이 열립니다.';
  }catch(e){if(!e.uncertain)pendingCreate=null;notice.textContent=errorText(e);submit.textContent='다시 보내기';}finally{busy=false;submit.disabled=false;text.readOnly=Boolean(pendingCreate);topic.disabled=kind.disabled=Boolean(pendingCreate);}};
 const cleanup=warnUnsaved(host,()=>text.value.trim()||[...drafts.values()].some(x=>x.trim()));
 const stop=refreshOnReturn(host,async()=>{if(busy)return;const rows=await refreshList();if(selected)await updateThread();else await offerReply(rows);});
 const pop=()=>{const id=new URLSearchParams(location.search).get('thread');if(id)void open(id,false);else show('history',false);};window.addEventListener('popstate',pop);
 const escape=e=>{if(e.key==='Escape'&&!e.isComposing&&document.body.classList.contains('support-chat-open')){e.preventDefault();show('history');}};document.addEventListener('keydown',escape);
 const initialRows=await refreshList();const thread=new URLSearchParams(location.search).get('thread');if(thread)await open(thread,false);else if(initialBody||initialKind!=='INQUIRY')show('new',false);else await offerReply(initialRows);
 return()=>{cleanup();stop();viewer?.destroy();screen(false);window.removeEventListener('popstate',pop);document.removeEventListener('keydown',escape);};
}

export async function mountChatInbox({client,host,userId='admin'}){
 host.classList.add('support-workspace');el('h2','고객센터 문의',host);el('p','미답변이 오래된 문의부터 확인하세요. 고객에게 보내는 답변과 내부 메모는 별도로 저장합니다.',host);
 const tools=el('div',undefined,host);tools.className='review-actions';const filter=choice(tools,'문의 상태',{'':'전체',...chatStates});const sync=announce(host),actionStatus=announce(host),rowsHost=el('div',undefined,host),detail=el('section',undefined,host);detail.setAttribute('aria-label','문의 처리');
 let offset=0,selected=null,current=null,busy=false,dirty=false,epoch=0,viewer=null,replyAttemptLive=null;const drafts=new Map(),pendingOps=new Map();
 const reload=button(tools,'문의함 새로고침',async()=>{await refresh();if(selected)await open(selected,true,true);},true);
 const more=button(tools,'다음 문의',()=>{offset+=50;void refresh();},true),first=button(tools,'처음으로',()=>{offset=0;void refresh();},true);
 filter.onchange=()=>{offset=0;void refresh();};
 async function refresh(){try{const rows=await chatRPC(client,'admin_list',{offset,state:filter.value});rowsHost.replaceChildren();more.disabled=rows.length<50;first.disabled=!offset;
  for(const r of rows){const b=button(rowsHost,'',()=>open(r.id),true);b.classList.add('support-ticket-link');b.dataset.inquiryId=r.id;
   el('strong',ticketTitle(r),b);el('span',(r.role==='planner'?'설계사':'소비자')+' · '+chatStates[r.chat_state],b);
   el('small','접수 '+kst(r.created_at)+' · 마지막 메시지 '+kst(r.last_message_at),b);if(r.unread)el('span','새 고객 메시지',b).className='support-new';
  }if(!rows.length)el('p','표시할 문의가 없습니다.',rowsHost);sync.textContent='';
 }catch{sync.textContent='문의함을 불러오지 못했습니다. 새로고침해 주세요.';}}
 async function open(id,refreshOnly=false,acknowledge=false){if(busy)return;const sequence=++epoch;try{const r=await chatRPC(client,'admin_detail',{id});if(sequence!==epoch)return;
  const previous=selected===id?current:null;
  const preserveRevision=previous&&!acknowledge&&Boolean(drafts.get(id)?.reply)&&previous.revision!==r.revision;
  const next={...r,revision:preserveRevision?previous.revision:r.revision};
  if(acknowledge&&selected===id&&!pendingOps.has(id+':reply'))replyAttemptLive?.clear();
  if(refreshOnly&&previous&&previous.handling===r.handling&&previous.can_reply===r.can_reply&&(previous.chat_state==='CLOSED')===(r.chat_state==='CLOSED')){
   current=next;viewer.draw(r);detail.querySelector('[data-chat-state]').textContent=chatStates[r.chat_state];
   if(preserveRevision)sync.textContent='작성 중 새 메시지나 변경이 있습니다. 대화 최신 내용 확인을 누른 뒤 답변해 주세요.';
   return;
  }
  viewer?.destroy();selected=id;current=next;detail.replaceChildren();detail.dataset.inquiryId=id;
  const h=el('h3',ticketTitle(r),detail);h.tabIndex=-1;el('p',chatStates[r.chat_state],detail).dataset.chatState='';el('p','확인 이유 · '+r.review_reason,detail);
  const sensitive=el('p',sensitiveNotice,detail);sensitive.id='supportSensitiveNotice';
  const transcriptHost=el('div',undefined,detail);viewer=transcript(transcriptHost,client,true,()=>void refresh());viewer.draw(r);
  if(r.related)el('p','관련 예약 '+r.related.id+' · '+(bookingStates[r.related.state]||'상태 확인')+' · '+kst(r.related.preferred_at),detail);
  const actions=el('div',undefined,detail);actions.className='review-actions';const info=announce(detail);
  const act=async(op,p={},attempt=attemptKey('support:admin:'+userId+':'+id+':'+op))=>{if(busy)return;busy=true;actionStatus.textContent='';detail.querySelectorAll('button').forEach(b=>b.disabled=true);detail.querySelectorAll('textarea,select').forEach(n=>n.disabled=true);info.textContent='전송 중…';
   try{const key=id+':'+op,payload=pendingOps.get(key)||await attempt.prepare({id,revision:current.revision,...p});pendingOps.set(key,payload);await sendChat(client,op,payload);pendingOps.delete(key);attempt.clear();if(op==='reply'||op==='note'){const d=drafts.get(id)||{};d[op]='';drafts.set(id,d);}busy=false;await open(id);await refresh();actionStatus.textContent=op==='note'?'내부 메모를 저장했습니다. 고객에게 보내지 않았습니다.':op==='reply'?'답변 전송 완료':'상태를 저장했습니다.';return true;}
   catch(e){if(!e.uncertain)pendingOps.delete(id+':'+op);if(e.message==='stale_request')attempt.clear();info.textContent=errorText(e);return false;}finally{busy=false;detail.querySelectorAll('button').forEach(b=>b.disabled=false);detail.querySelectorAll('textarea,select').forEach(n=>n.disabled=Boolean(pendingOps.get(id+':'+n.closest('form')?.dataset.operation)));}};
  button(actions,'대화 최신 내용 확인',()=>open(id,true,true),true);
  if(r.handling!=='operator')button(actions,'검토 시작 · 문의 맡기',()=>act('take'));
  else if(r.can_reply){
   button(actions,'인수 해제',()=>{if(confirm('문의 인수를 해제할까요? 자동 답변은 시작하지 않습니다.'))void act('release',{confirmed:true});},true);
   const draft=drafts.get(id)||{},replyForm=el('form',undefined,detail);replyForm.className='card support-reply';replyForm.dataset.operation='reply';el('h4','고객에게 보낼 답변',replyForm);
   const reply=field(replyForm,'답변 내용');reply.value=draft.reply||'';
   const state=choice(replyForm,'답변 후 상태',{ANSWERED:'답변 완료',WAITING_CUSTOMER:'추가 정보 요청'},draft.state||'ANSWERED');
   reply.oninput=()=>{draft.reply=reply.value;drafts.set(id,draft);dirty=true;};state.onchange=()=>{draft.state=state.value;drafts.set(id,draft);};
   const send=button(replyForm,'답변 전송');send.type='submit';const attempt=attemptKey('support:admin:'+userId+':'+id+':reply');replyAttemptLive=attempt;
   replyForm.onsubmit=async e=>{e.preventDefault();if(!replyForm.reportValidity())return;const ok=await act('reply',{body:reply.value.trim(),state:state.value},attempt);if(!ok){send.textContent='다시 보내기';}};
   const memoForm=el('form',undefined,detail);memoForm.className='card support-note';memoForm.dataset.operation='note';el('h4','내부 메모 · 고객에게 보이지 않음',memoForm);
   const note=field(memoForm,'내부 메모 내용');note.value=draft.note||'';note.oninput=()=>{draft.note=note.value;drafts.set(id,draft);dirty=true;};const save=button(memoForm,'내부 메모 저장',null,true);save.type='submit';
   const noteAttempt=attemptKey('support:admin:'+userId+':'+id+':note');memoForm.onsubmit=async e=>{e.preventDefault();if(memoForm.reportValidity()&&!await act('note',{body:note.value.trim()},noteAttempt))save.textContent='메모 다시 저장';};
   if(r.chat_state==='CLOSED')button(actions,'문의 재개',()=>act('state',{state:'REVIEWING'}),true);
   else button(actions,'문의 종료',()=>{if(confirm('이 문의를 종료할까요? 고객이 추가 문의를 보내면 같은 대화가 재개됩니다.'))void act('state',{state:'CLOSED'});},true);
  }else el('p','다른 운영자가 맡고 있습니다. 인수 해제 후 답변할 수 있습니다.',detail);
  el('p',r.chat_state==='CLOSED'?'다음 조치 · 추가 문의가 오면 다시 검토하세요.':r.can_reply?'다음 조치 · 원문을 확인하고 답변하거나 필요한 정보를 요청하세요.':'다음 조치 · 검토 시작을 눌러 문의를 맡으세요.',detail);
  detail.querySelectorAll('textarea,select').forEach(n=>n.disabled=Boolean(pendingOps.get(id+':'+n.closest('form')?.dataset.operation)));
  h.focus();dirty=[...drafts.values()].some(d=>d.reply||d.note);
 }catch(e){sync.textContent=errorText(e);}}
 const cleanup=warnUnsaved(host,()=>dirty);const stop=refreshOnReturn(host,async()=>{if(busy)return;await refresh();if(selected)await open(selected,true);});await refresh();
 return()=>{cleanup();stop();viewer?.destroy();};
}
