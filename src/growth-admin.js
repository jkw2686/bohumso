import {el} from './consultation-ui.js';
import {button,statusNode,attemptKey} from './support-ui.js';
import {contentBody} from './growth.js';
import {categories,growthRPC,growthError,dayKST,weekEnd,fromKSTInput,toKSTInput} from './growth-model.mjs';

const checkLabels={source_missing:'공식 출처 필요',book_details:'책 제목·저자 확인',check_required:'확인일 필요',check_expired:'확인일 90일 경과',source_not_allowed:'허용 목록 밖의 출처',source_check_required:'출처 연결 확인 필요',source_details:'출처명·수집일 확인',advertising_review:'홍보성 내용 검토',evidence_review:'근거 검토 필요',duplicate_title:'중복 제목 검토'};
function field(form,label,type='input'){const l=el('label',label,form);l.className='field';return el(type,undefined,l);}
export async function mountGrowthAdmin({client,host}){
 const cap=await growthRPC(client,'capabilities');if(!cap.admin)return;
 const panel=el('section',undefined,host);panel.className='card growth-workspace';panel.id='growthAdmin';el('h2','성장·실천 자료 운영',panel);
 el('p','원고와 출처를 함께 검토하세요. 승인 뒤 수정한 원고는 다시 승인해야 게시할 수 있습니다.',panel);
 const status=statusNode(panel),toolbar=el('div',undefined,panel);toolbar.className='growth-actions';let rows=[],selected=null,busy=false,dirty=false;
 const list=el('div',undefined,panel);list.className='growth-admin-list';const editor=el('section',undefined,panel);editor.hidden=true;
 const form=el('form',undefined,editor),fields={};
 fields.title=field(form,'자료 제목');fields.title.required=true;fields.title.maxLength=100;
 fields.category=field(form,'자료 분류','select');for(const [v,t]of Object.entries(categories))el('option',t,fields.category).value=v;
 fields.body=field(form,'본문 (일반 텍스트)','textarea');fields.body.rows=10;fields.body.required=true;fields.body.maxLength=12000;
 fields.practice=field(form,'실천 제안');fields.practice.maxLength=100;fields.practice.required=true;
 fields.book_title=field(form,'책 제목 (책 자료만)');fields.author=field(form,'저자 (책 자료만)');
 fields.origin=field(form,'원고 종류','select');el('option','보험소 자체 운영 팁',fields.origin).value='bohumso';el('option','공식 자료 기반 안내',fields.origin).value='external';
 fields.method=field(form,'작성 방식','select');el('option','운영자 작성',fields.method).value='operator';el('option','AI 초안',fields.method).value='ai';
 fields.base_date=field(form,'자료 기준일 (알 수 있을 때만)');fields.base_date.type='date';fields.checked_date=field(form,'운영자 확인일');fields.checked_date.type='date';
 const sources=field(form,'공식 출처: 이름 | HTTPS 주소 | 원문 게시일(선택) | 수집일 | ok 또는 확인 필요','textarea');sources.rows=4;
 el('p','예: 출판사 책 소개 | https://공식도메인/책 | 2026-10-01 | 2026-10-11 | ok. 실제로 연 페이지와 날짜만 적으세요. 주소의 정확한 도메인을 아래 허용 목록에 등록합니다.',form);
 const review=field(form,'본문·실천 제안·출처를 검토함');review.type='checkbox';
 const advertising=field(form,'홍보성 내용 추가 확인 필요');advertising.type='checkbox';
 const formActions=el('div',undefined,form);formActions.className='growth-actions';const save=button(formActions,'원고 저장');save.type='submit';button(formActions,'화면 미리보기',()=>preview(read()),true);button(formActions,'편집 닫기',()=>{if(!busy&&(!dirty||confirm('저장하지 않고 닫을까요?'))){editor.hidden=true;dirty=false;}},true);
 const editorStatus=statusNode(form);form.oninput=()=>{dirty=true;};const saveAttempt=attemptKey('growth:admin:draft');
 const dialog=el('dialog',undefined,panel);dialog.className='growth-dialog card';dialog.setAttribute('aria-label','전문가에게 보이는 자료 미리보기');button(dialog,'닫기',()=>dialog.close(),true);const previewHost=el('div',undefined,dialog);
 function preview(doc){previewHost.replaceChildren();el('p','미리보기 · 공개되지 않았습니다.',previewHost);contentBody(previewHost,doc);dialog.showModal();}
 function read(){return Object.fromEntries([...Object.entries(fields).map(([key,n])=>[key,n.value]),['evidence',review.checked?'reviewed':'pending'],['advertising',advertising.checked],['sources',sources.value.trim()?sources.value.trim().split('\n').filter(Boolean).map(line=>{const [title,url,published_date,collected_at,status]=line.split('|').map(x=>x.trim());return {title,url,published_date:published_date||null,collected_at:collected_at||null,status:status||'unchecked'};}):[]]]);}
 function edit(row){if(busy||dirty&&!confirm('작성 중인 내용을 버리고 이동할까요?'))return;selected=row;const doc=row?.draft||{category:'tools',method:'operator',origin:'bohumso'};for(const [k,n]of Object.entries(fields))n.value=doc[k]||'';review.checked=doc.evidence==='reviewed';advertising.checked=!!doc.advertising;sources.value=(doc.sources||[]).map(s=>[s.title,s.url,s.published_date,s.collected_at,s.status].join(' | ')).join('\n');editorStatus.textContent='';dirty=false;editor.hidden=false;fields.title.focus();}
 form.onsubmit=async e=>{e.preventDefault();if(busy||!form.reportValidity())return;busy=true;save.disabled=true;editorStatus.textContent='저장 중…';try{const result=await growthRPC(client,'admin_save',await saveAttempt.prepare({...(selected?{id:selected.id,revision:selected.revision}:{}),content:read()}));saveAttempt.clear();dirty=false;await refresh();selected=rows.find(r=>r.id===result.id);editorStatus.textContent='검토 대기로 저장했습니다. 공개된 이전 자료는 유지됩니다.';}catch(e){editorStatus.textContent=growthError(e);}finally{busy=false;save.disabled=false;}};
 const selectedIds=new Set();button(toolbar,'＋ 원고 작성',()=>edit(null));button(toolbar,'새로고침',refresh,true);
 const approveSelected=button(toolbar,'선택 원고 승인',async()=>{const targets=rows.filter(r=>selectedIds.has(r.id));if(!targets.length){status.textContent='검토한 원고를 먼저 선택하세요.';return;}if(!confirm('선택한 '+targets.length+'개의 현재 원고를 승인할까요?'))return;for(const row of targets){if(!await action(row,'admin_approve'))break;}},true);approveSelected.hidden=!cap.owner;
 async function action(row,op,extra={}){if(busy)return false;busy=true;const a=attemptKey('growth:admin:'+row.id+':'+op);try{await growthRPC(client,op,await a.prepare({id:row.id,revision:row.revision,...extra}));a.clear();await refresh();status.textContent=op==='admin_schedule'?'게시 시각을 저장했습니다. 자동 게시 연결은 아직 꺼져 있습니다.':op==='admin_publish'?'승인된 원고를 게시했습니다.':'자료 상태를 저장했습니다.';return true;}catch(e){status.textContent=growthError(e);return false;}finally{busy=false;}}
 async function refresh(){try{rows=await growthRPC(client,'admin_list');list.replaceChildren();if(!rows.length)el('p','검토할 원고가 없습니다. 승인되지 않은 자료는 전문가 화면에 표시되지 않습니다.',list);
  const batches=new Map();for(const row of rows){const week=weekEnd(new Date(row.created_at))+'까지의 주간';if(!batches.has(week)){const s=el('section',undefined,list);el('h3',week+' 원고',s);batches.set(week,s);}const card=el('article',undefined,batches.get(week));card.className='card';card.dataset.contentId=row.id;const choose=field(card,row.draft.title);choose.type='checkbox';choose.checked=selectedIds.has(row.id);choose.onchange=()=>choose.checked?selectedIds.add(row.id):selectedIds.delete(row.id);
   el('p',({review:'검토 대기',approved:'승인 완료',excluded:'제외'})[row.review_state]+' · '+(row.published_revision?'공개 버전 '+row.published_revision:'비공개')+' · 현재 원고 '+row.revision,card);
   el('p',row.checks.length?row.checks.map(c=>checkLabels[c]||c).join(' · '):'기본 점검 항목 없음 · 내용의 정확성은 운영자가 판단합니다.',card);
   if(row.publish_error)el('p','게시 보류 · 다시 검토해 주세요. 기존 공개 자료는 유지됩니다.',card);
   const actions=el('div',undefined,card);actions.className='growth-actions';button(actions,'원고·출처 보기',()=>preview(row.draft),true);button(actions,'수정',()=>edit(row),true);button(actions,'제외',()=>action(row,'admin_exclude'),true);
   if(cap.owner){button(actions,'승인',()=>action(row,'admin_approve'),true);button(actions,'지금 게시',()=>{if(confirm('승인된 현재 원고를 전문가에게 게시할까요?'))action(row,'admin_publish');});const date=field(card,'예약 게시 시각 (한국 시간)');date.type='datetime-local';date.value=toKSTInput(row.scheduled_at);button(card,'예약 시각 저장',()=>action(row,'admin_schedule',{scheduled_at:fromKSTInput(date.value)}),true);}
   if(row.published_revision)button(card,'게시 중단',()=>{if(confirm('전문가 자료실에서 내릴까요? 개인 실천 기록은 유지됩니다.'))action(row,'admin_unpublish');},true);
  }
 }catch(e){status.textContent=growthError(e);}}
 const automation=el('details',undefined,panel);el('summary','콘텐츠 준비 설정·연결 상태',automation);el('p','자동 수집 미연결 · AI 생성 미연결 · 자동 게시 꺼짐. 저장한 빈도는 준비 설정이며 실행 일정이 아닙니다.',automation);
 const settings=await growthRPC(client,'admin_settings');const sf=el('form',undefined,automation),weekly=field(sf,'주간 초안 수'),books=field(sf,'월간 책 안내 수'),hosts=field(sf,'허용한 공식 도메인 (한 줄에 하나)','textarea');weekly.type=books.type='number';weekly.min=books.min=0;weekly.max=4;books.max=2;weekly.value=settings.weekly_drafts;books.value=settings.monthly_books;hosts.value=settings.allowed_hosts.join('\n');
 const settingsSave=button(sf,'준비 설정 저장');settingsSave.type='submit';settingsSave.disabled=!cap.owner;const si=statusNode(sf),sa=attemptKey('growth:admin:settings');
 sf.onsubmit=async e=>{e.preventDefault();if(busy||!sf.reportValidity())return;busy=true;settingsSave.disabled=true;try{await growthRPC(client,'admin_settings_save',await sa.prepare({revision:settings.revision,weekly_drafts:Number(weekly.value),monthly_books:Number(books.value),allowed_hosts:hosts.value.split('\n').map(s=>s.trim().toLowerCase()).filter(Boolean)}));sa.clear();Object.assign(settings,await growthRPC(client,'admin_settings'));si.textContent='준비 설정을 저장했습니다. 자동화는 시작되지 않습니다.';await refresh();}catch(e){si.textContent=growthError(e);}finally{busy=false;settingsSave.disabled=false;}};
 const unload=e=>{if(dirty&&panel.isConnected){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',unload);
 await refresh();return ()=>window.removeEventListener('beforeunload',unload);
}
