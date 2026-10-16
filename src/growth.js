import {memberService,authURL} from './member-access.js';
import {openMenuDestination} from './menu-destinations.js';
import {el} from './consultation-ui.js';
import {button,statusNode,attemptKey} from './support-ui.js';
import {categories,privacyReminder,dayKST,weekEnd,taskGroup,safeSource,growthRPC,growthError} from './growth-model.mjs';

function anchor(parent,text,href){const a=el('a',text,parent);a.href=href;a.className='btn ghost';return a;}
function field(parent,label,type='input'){const l=el('label',label,parent);l.className='field';return el(type,undefined,l);}
export function contentBody(host,doc){
 el('p',categories[doc.category]||'자료',host).className='growth-eyebrow';el('h2',doc.title,host);
 if(doc.book_title)el('p',doc.book_title+' · '+(doc.author||''),host);
 el('div',doc.body,host).className='growth-body';el('h3','작게 시작해 보세요',host);el('p',doc.practice,host);
 el('p',doc.origin==='bohumso'?'보험소 자체 작성 운영 팁':doc.method==='ai'?'AI 작성 초안 · 운영자 검토 후 게시':'운영자 작성',host).className='growth-meta';
 if(doc.category==='book')el('p','책 정보와 보험소의 실천 제안을 구분해 읽어 주세요. 출판사 소개를 바탕으로 작성한 안내는 전체 내용을 읽은 서평이 아닙니다.',host);
 if(doc.category==='tools'){anchor(host,'병원·보험사 공식 자료 찾기','/claim-resources.html');anchor(host,'상황별 청구 도움 · 대화·만화','/claim-resources.html#claimScripts');}
 if(doc.sources?.length){el('h3','출처',host);for(const s of doc.sources){const href=safeSource(s.url);if(!href)continue;const a=anchor(host,s.title||'공식 자료',href);a.target='_blank';a.rel='noopener noreferrer';if(s.published_date)el('small','원문 게시일 '+s.published_date,host);}}
 if(doc.base_date)el('p','자료 기준일 '+doc.base_date,host).className='growth-meta';
 if(doc.checked_date)el('p','운영자 확인일 '+doc.checked_date,host).className='growth-meta';
}

export async function mountGrowth({client,host,userId}){
 host.classList.add('growth-workspace');host.replaceChildren();let tasks=[],docs=[],activeCategory='weekly',busy=false,dirty=false,editing=null,source=null;
 const notice=statusNode(host);notice.id='growthStatus';const main=el('section',undefined,host);main.className='card';main.id='growthPractice';
 const heading=el('div',undefined,main);heading.className='growth-heading';el('h2','나의 실천',heading);button(heading,'＋ 직접 추가',()=>edit());
 el('p','내가 정한 일과 날짜를 챙기는 개인 공간이에요.',main);const groups=el('div',undefined,main);
 const editor=el('section',undefined,main);editor.className='growth-editor';editor.hidden=true;const editHeading=el('h3','실천 추가',editor);
 const form=el('form',undefined,editor),title=field(form,'할 일'),date=field(form,'날짜 (선택)'),memo=field(form,'메모 (선택)','textarea');title.required=true;title.maxLength=100;date.type='date';memo.rows=3;memo.maxLength=300;
 const count=el('small','',form);el('p',privacyReminder,form).className='growth-reminder';
 const shortcuts=el('div',undefined,form);shortcuts.className='growth-actions';for(const [label,get] of [['오늘',dayKST],['이번 주',weekEnd],['날짜 미정',()=> '']])button(shortcuts,label,()=>{if(busy)return;date.value=get();form.dispatchEvent(new Event('input'));},true);
 const sourceInfo=el('p','',form);const actions=el('div',undefined,form);actions.className='growth-actions';const save=button(actions,'저장하기');save.type='submit';button(actions,'취소',()=>{if(!busy&&(!dirty||confirm('작성한 내용을 저장하지 않고 닫을까요?'))){editor.hidden=true;dirty=false;}},true);const saveStatus=statusNode(form);
 const attempt=attemptKey('growth:task:'+userId);
 function edit(row=null,doc=null){if(busy||dirty&&!confirm('작성 중인 내용을 버리고 이동할까요?'))return;editing=row;source=doc;title.value=row?.title||doc?.practice||'';date.value=row?.due_date||'';memo.value=row?.memo||'';editHeading.textContent=row?'실천 수정':'실천 추가';sourceInfo.textContent=(row?.source_title||doc?.title)?'담아온 자료 · '+(row?.source_title||doc.title):'';saveStatus.textContent='';editor.hidden=false;dirty=!!doc;save.disabled=false;count.textContent=title.value.length+'/100 · 메모 '+memo.value.length+'/300';title.focus();editor.scrollIntoView({block:'nearest'});}
 form.oninput=()=>{dirty=true;count.textContent=title.value.length+'/100 · 메모 '+memo.value.length+'/300';};
 form.onsubmit=async e=>{e.preventDefault();if(busy||!form.reportValidity())return;busy=true;save.disabled=true;for(const i of form.querySelectorAll('input,textarea'))i.readOnly=true;saveStatus.textContent='저장 중…';
  try{await growthRPC(client,'task_save',await attempt.prepare({...(editing?{id:editing.id,revision:editing.revision}:{}),title:title.value.trim(),memo:memo.value,due_date:date.value||null,...(!editing&&source?{source_id:source.id}:{})}));attempt.clear();dirty=false;editor.hidden=true;notice.textContent='실천을 저장했습니다.';await refreshTasks();}catch(e){saveStatus.textContent=growthError(e);}finally{busy=false;save.disabled=false;for(const i of form.querySelectorAll('input,textarea'))i.readOnly=false;}}
 function drawTasks(){groups.replaceChildren();const labels={today:'오늘 할 일',later:'이번 주·이후',undated:'날짜 미정',overdue:'일정이 바뀌었나요?',completed:'완료한 실천'};
  for(const [key,label]of Object.entries(labels)){const rows=tasks.filter(t=>taskGroup(t)===key).sort((a,b)=>(a.due_date||'').localeCompare(b.due_date||''));if(!rows.length&&key!=='today')continue;
   const section=el(['overdue','completed'].includes(key)?'details':'section',undefined,groups);section.className='growth-group';el(section.tagName==='DETAILS'?'summary':'h3',label+(rows.length?' · '+rows.length:''),section);
   if(!rows.length)el('p','오늘 나를 위해 해볼 일, 하나만 적어보세요. 고객과의 약속도, 잠깐의 휴식도 좋습니다.',section);
   for(const row of rows){const item=el('div',undefined,section);item.className='growth-task';item.dataset.taskId=row.id;const check=button(item,row.completed_at?'✓':'○',async()=>{if(busy)return;busy=true;check.disabled=true;const a=attemptKey('growth:complete:'+userId+':'+row.id);try{await growthRPC(client,'task_complete',await a.prepare({id:row.id,revision:row.revision,completed:!row.completed_at}));a.clear();await refreshTasks();notice.textContent=row.completed_at?'완료 표시를 취소했습니다.':'완료로 저장했습니다.';}catch(e){notice.textContent=growthError(e);check.disabled=false;}finally{busy=false;}},true);check.setAttribute('aria-label',row.title+(row.completed_at?' 완료 취소':' 완료하기'));check.setAttribute('aria-pressed',String(!!row.completed_at));
    const details=el('div',undefined,item);const open=button(details,row.title,()=>edit(row),true);open.className='growth-task-open';if(row.due_date)el('small',row.due_date+' · 한국 시간',details);if(row.memo)el('p',row.memo,details).className='growth-memo';
    if(row.source_title){if(row.source_available){const a=anchor(details,'자료 · '+row.source_title,'#');a.onclick=e=>{e.preventDefault();openContent(row.source_id);};}else el('small','담아온 자료 · 현재 공개되지 않음',details);}
    const remove=button(details,'삭제',async()=>{if(busy||!confirm('이 실천 기록을 삭제할까요?'))return;busy=true;remove.disabled=true;const a=attemptKey('growth:delete:'+userId+':'+row.id);try{await growthRPC(client,'task_delete',await a.prepare({id:row.id,revision:row.revision}));a.clear();await refreshTasks();notice.textContent='실천을 삭제했습니다.';}catch(e){notice.textContent=growthError(e);remove.disabled=false;}finally{busy=false;}},true);remove.setAttribute('aria-label',row.title+' 삭제');
   }
  }
 }
 async function refreshTasks(){try{tasks=await growthRPC(client,'mine');drawTasks();}catch{notice.textContent='저장된 실천을 불러오지 못했습니다. 새로고침해 주세요.';}}
 const library=el('section',undefined,host);library.className='card';library.id='growthLibrary';el('h2','나를 위한 자료',library);const nav=el('div',undefined,library);nav.className='growth-categories';nav.setAttribute('aria-label','자료 분류');const cards=el('div',undefined,library);cards.className='growth-library';
 for(const [key,label] of Object.entries(categories)){const b=button(nav,label,()=>{activeCategory=key;drawLibrary();},true);b.dataset.category=key;}
 const dialog=el('dialog',undefined,host);dialog.className='growth-dialog card';const close=button(dialog,'닫기',()=>dialog.close(),true);close.className+=' growth-close';const body=el('div',undefined,dialog);dialog.setAttribute('aria-label','자료 상세');
 async function openContent(id){try{const doc=await growthRPC(client,'content',{id});body.replaceChildren();contentBody(body,doc);button(body,'＋ 내 실천에 추가',()=>{dialog.close();edit(null,doc);});dialog.showModal();close.focus();}catch(e){notice.textContent=growthError(e);}}
 function drawLibrary(){nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===activeCategory)));cards.replaceChildren();const selected=docs.filter(d=>d.category===activeCategory);if(!selected.length)el('p','공개된 자료가 아직 없습니다.',cards);for(const doc of selected){const card=el('article',undefined,cards);el('h3',doc.title,card);el('p',doc.practice,card);button(card,'자료 읽기',()=>openContent(doc.id),true);}if(activeCategory==='tools'){anchor(cards,'병원·보험사 자료실 열기','/claim-resources.html');anchor(cards,'상황별 청구 도움 · 대화·만화','/claim-resources.html#claimScripts');}}
 button(host,'새로고침',async()=>{if(busy||dirty&&!confirm('입력 내용을 유지한 채 목록을 새로고침할까요?'))return;await load();},true);
 const unload=e=>{if(dirty&&host.isConnected){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',unload);
 async function load(){await refreshTasks();try{docs=await growthRPC(client,'library');drawLibrary();}catch{cards.textContent='자료를 불러오지 못했습니다. 새로고침해 주세요.';}}
 await load();const id=new URLSearchParams(location.search).get('content');if(id)await openContent(id);else openMenuDestination();
 return ()=>window.removeEventListener('beforeunload',unload);
}

const host=document.getElementById('growthContent');
if(host)start();
async function start(){try{const {client}=await memberService(),{data,error}=await client.auth.getUser();if(error)throw error;if(!data.user){host.replaceChildren();el('p','로그인 후 나의 실천을 확인하세요.',host);anchor(host,'로그인',authURL('/growth.html','login'));return;}const access=await growthRPC(client,'capabilities');if(!access.expert){host.replaceChildren();el('p','전문가 등록 후 이용할 수 있습니다.',host);anchor(host,'전문가 화면','/partner.html');return;}await mountGrowth({client,host,userId:data.user.id});}catch(e){host.textContent=['42883','PGRST202'].includes(e.code)?'성장·실천 연결 설정을 확인하고 있습니다. 잠시 후 다시 방문해 주세요.':growthError(e);}}
