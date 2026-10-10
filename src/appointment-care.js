const outcomes={expert_absent:'전문가 불참 확인',consumer_absent:'소비자 불참 확인',agreement:'합의 취소·시간 또는 장소 착오',unverifiable:'확인 불가',withdrawn:'신고 철회'};
const roles={consumer:'소비자',expert:'전문가',admin:'운영자'};
const methods={phone:'전화상담',nearby:'전문가 방문',scheduled:'대면 상담',visit:'전문가 방문'};
const eventNames={late:'지각 안내',keep:'일정 유지',propose:'변경 제안',change_accept:'변경 수락',change_decline:'변경 거절·철회',cancel:'취소',agree:'장소·시간 확인',report:'불참 신고 접수',explain:'상황 설명',appeal:'이의제기',decide:'사실 확인 결과',resume:'이용 재개 확인',review_cancellations:'취소 이력 검토'};
export const careErrors={new_appointments_restricted:'새 약속은 잠시 제한됩니다. 기존 약속 관리와 운영자 문의는 이용할 수 있어요.',appointment_not_confirmed:'양쪽이 확정한 약속 시간이 지난 뒤 접수할 수 있어요.',appointment_place_required:'상대방과 확인할 만날 장소를 입력해 주세요.',report_already_received:'이미 접수된 약속이에요. 상황 설명을 추가해 주세요.',advance_contact_recorded:'약속 전 지각·취소 기록이 있습니다. 무단 불참과 구분해 검토해 주세요.',review_required:'양쪽 설명·약속 기록·예외 사정을 확인해 주세요.',stale_request:'약속 상태가 바뀌었습니다. 새로고침 후 확인해 주세요.',schedule_pending:'진행 중인 변경 제안을 먼저 확인해 주세요.',invalid_transition:'지금은 이 동작을 할 수 없습니다. 최신 약속 상태를 확인해 주세요.',slot_unavailable:'다른 약속과 겹칩니다. 다른 시간을 제안해 주세요.'};
const el=(tag,text,parent,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;parent?.append(n);return n;};
const stamp=t=>t?new Date(t).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}):'시간 확인 필요';
const link=(root,label,href)=>{const n=el('a',label,root,'btn ghost');n.href=href;return n;};
export async function careRpc(client,operation,payload={}){const {data,error}=await client.rpc('appointment_care',{operation,payload});if(error)throw error;return data;}
const capabilities=new WeakMap();
export async function careStatus(client){if(!capabilities.has(client))capabilities.set(client,careRpc(client,'status').then(x=>x?.enabled?x:null).catch(e=>{capabilities.delete(client);if(e.code==='PGRST202'||e.code==='42883')return null;throw e;}));return capabilities.get(client);}
export async function getCare(client,kind,id){return await careStatus(client)?careRpc(client,'get',{kind,id}):null;}
export function carePolicy(root,role,data){
 const d=el('details',null,root,'appointment-policy');el('summary',role==='expert'?'고객과의 약속을 지켜주세요':'서로의 시간을 지켜주세요',d);
 el('p','참석이 어렵다면 미리 변경·취소해 주세요.',d);
 if(data?.policyActive&&!(role==='expert'&&data?.paidHold))el('p',role==='expert'?'최근 90일 내 확인된 무단 노쇼는 1회 경고, 2회 신규 예약 7일 제한, 3회 30일 제한 및 재개 전 운영자 확인이 적용됩니다.':'최근 90일 내 확인된 무단 노쇼는 1회 경고, 2회 신규 예약 3일 제한, 3회 7일 제한이 적용됩니다.',d);
 else if(role==='expert'&&data?.paidHold)el('p','신고는 양쪽의 설명을 확인한 후 판단합니다. 유료 전문가의 신규 예약 제한은 시행 보류 중입니다.',d);
 else el('p','신고만으로 불참이 확정되지는 않습니다. 새 이용 제한 정책은 아직 시행하지 않습니다.',d);
}
function field(root,label,name,type='text',value=''){
 const l=el('label',label,root,'field'),n=el(type==='textarea'?'textarea':'input',null,l);n.name=name;if(type!=='textarea')n.type=type;if(type==='checkbox')l.prepend(n);n.value=value;return n;
}
function choice(root,label,name,items,value){const l=el('label',label,root,'field'),n=el('select',null,l);n.name=name;for(const [v,t]of Object.entries(items)){const o=el('option',t,n);o.value=v;}n.value=value;return n;}
function measure(root,m){if(!m||m.status==='none')return;
 el('h3',m.blocked?'새 약속 이용 제한':m.status==='warning'?'약속 이행 안내':m.status==='held_paid'?'사실 확인 완료 · 유료 전문가 제한 보류':m.status==='held_policy'?'사실 확인 완료 · 제한 미시행':m.status==='manual_review'?'운영자 개별 검토':'이용 제한 기간 종료',root);
 el('p',(roles[m.role]||'')+' · 최근 90일 내 확인된 불참 '+(m.recent_count??m.confirmed_count)+'회',root);
 if(m.blocked){el('p','제한 기간 · '+stamp(m.starts_at)+' ~ '+stamp(m.ends_at),root);el('p',m.role==='expert'?'새 예약 접수·수락이 제한됩니다.':'새 예약 신청이 제한됩니다.',root);el('p','기존 예약 확인·연락·변경·취소·이행과 운영자 문의는 계속 이용할 수 있어요.',root);if(m.resume_required)el('p','기간 종료 후 운영자의 이용 재개 확인이 필요합니다.',root);}
 if(m.review_required)el('p','추가 사건은 운영자가 별도로 검토합니다. 제한 기간은 자동 연장하지 않습니다.',root);
}
export function renderCare({client,root,data:a,refresh=()=>{},admin=false}){
 const section=el('section',null,root,'appointment-care');section.dataset.appointmentId=a.id;
 if(new URLSearchParams(location.search).get('request')===a.id&&!document.documentElement.dataset.careFocused){document.documentElement.dataset.careFocused='true';section.tabIndex=-1;requestAnimationFrame(()=>{section.focus({preventScroll:true});section.scrollIntoView({block:'center'});});}
 const feedback=el('p',null,section,'review-feedback');feedback.setAttribute('role','status');
 const run=async(op,payload,key)=>{const result=await careRpc(client,op,{kind:a.kind,id:a.id,revision:a.revision,request_key:key,...payload});await refresh();return result;};
 const button=(parent,title,op,payload={},confirmText)=>{const b=el('button',title,parent,'btn ghost');b.type='button';const key=crypto.randomUUID();b.onclick=async()=>{if(confirmText&&!window.confirm(confirmText))return;b.disabled=true;try{await run(op,payload,key);}catch(e){feedback.textContent=careErrors[e.message]||'처리하지 못했어요. 입력과 연결 상태를 확인해 주세요.';feedback.scrollIntoView({block:'nearest'});}finally{b.disabled=false;}};return b;};
 const form=(title,op,fields,extra={},confirmText)=>{
  const d=el('details',null,section);el('summary',title,d);const f=el('form',null,d),key=crypto.randomUUID();fields(f);const b=el('button',title,f,'btn');b.type='submit';
  f.onsubmit=async e=>{e.preventDefault();if(confirmText&&!window.confirm(confirmText))return;b.disabled=true;const body=Object.fromEntries(new FormData(f));for(const n of f.querySelectorAll('[type=checkbox]'))body[n.name]=n.checked;try{await run(op,{...body,...extra},key);}catch(e){feedback.textContent=careErrors[e.message]||'처리하지 못했어요. 입력과 연결 상태를 확인해 주세요.';feedback.scrollIntoView({block:'nearest'});}finally{b.disabled=false;}};
  return f;
 };
 el('h3',a.state==='cancelled'?'취소된 약속':a.state==='completed'?'완료한 약속':a.confirmed?'확정된 약속':'서로 시간·장소를 확인해 주세요',section);
 el('p',stamp(a.terms.at)+' · '+(a.terms.office?'고객이 보험소 방문':methods[a.terms.method]||'상담'),section);
 if(a.terms.place)el('p',a.terms.place,section);
 if(!a.confirmed&&a.customerAgreed)el('p','고객이 장소 제공에 동의했습니다. 전문가가 같은 시간·장소를 확인하면 확정돼요.',section);
 measure(section,a.measure);
 if(a.otherPhone&&!admin)link(section,'상대방에게 연락','tel:'+a.otherPhone.replace(/[^+0-9]/g,''));
 if(a.canAgree){carePolicy(section,'expert',a);button(section,'시간·방식·장소 확인하고 확정','agree');}
 if(!admin&&a.state==='active'){
  if(a.confirmed){form('늦어요','late',f=>{const n=field(f,'예상 지연시간 (분)','minutes','number','10');n.required=true;n.min=1;n.max=240;el('p','지각 안내를 보내도 원래 약속 시간은 바뀌지 않습니다.',f);});
   if(a.events?.some(e=>e.event==='late'))button(section,'기존 일정 유지','keep');}
  if(a.proposal){const p=el('div',null,section,'appointment-proposal');el('strong','변경 제안',p);el('p','수락 전까지 기존 약속은 유지돼요.',p);el('p',stamp(a.proposal.terms.at)+' · '+methods[a.proposal.terms.method]+' · '+a.proposal.terms.place,p);if(!a.proposal.mine)button(p,'변경 수락','change_accept');button(p,a.proposal.mine?'제안 철회':'기존 일정 유지·변경 거절','change_decline');}
  else if(a.expertId)form('일정 변경 요청','propose',f=>{
   const date=new Date(a.terms.at);date.setMinutes(date.getMinutes()+540);const n=field(f,'희망 날짜·시간 (한국 시간)','at','datetime-local',date.toISOString().slice(0,16));n.required=true;n.step=1800;
   const m=choice(f,'방문 방식','method',a.kind==='visit'?{visit:'전문가 방문'}:a.terms.office?{scheduled:'고객이 보험소 방문'}:{phone:'전화상담',nearby:'전문가 방문',scheduled:'대면 상담'},a.terms.method);
   const place=field(f,'만날 장소 · 전화상담이면 전화상담 입력','place','text',a.terms.place||'');place.required=true;place.maxLength=160;if(a.terms.office)place.readOnly=true;m.onchange=()=>{if(m.value==='phone')place.value='전화상담';};
   f.addEventListener('formdata',e=>{const t=e.formData.get('at');if(t)e.formData.set('at',t+(t.length===16?':00':'')+'+09:00');});el('p','상대방이 수락하기 전에는 기존 약속을 지켜 주세요. 참석이 어렵다면 별도로 취소해 주세요.',f);
  });
  form('예약 취소','cancel',f=>{const n=field(f,'취소 사유 (선택)','reason');n.maxLength=300;el('p','상대방 승인 없이 취소됩니다. 자세한 사정은 적지 않아도 됩니다.',f);},{},'이 약속을 취소할까요? 상대방에게 취소 사실을 알립니다.');
 }
 const cs=a.case;
 if(cs){const c=el('div',null,section,'appointment-case');el('h3',cs.outcome?outcomes[cs.outcome]:'불참 확인 중',c);el('p',cs.reason||'아직 노쇼로 확정된 것은 아닙니다. 당시 상황을 알려주세요.',c);if(cs.appeal_pending)el('p','이의제기 확인 중',c);
  const history=el('details',null,c);el('summary','양쪽 설명·처리 기록',history);for(const s of cs.statements||[])el('p',roles[s.who]+' · '+stamp(s.created_at)+' · '+s.body,history);for(const d of cs.decisions||[])el('p',stamp(d.created_at)+' · '+outcomes[d.outcome]+' · '+d.reason,history);
  if(!admin&&!cs.outcome)button(c,'신고 철회 요청','explain',{body:'신고 철회를 요청합니다. 상대방의 설명과 함께 확인해 주세요.'});
  if(!admin)form(cs.outcome?'이의제기':'상황 설명하기',cs.outcome?'appeal':'explain',f=>{const n=field(f,'당시 상황 (민감한 정보는 적지 마세요)','body','textarea');n.required=true;n.minLength=3;n.maxLength=1000;});
 }
 if(!admin&&a.confirmed&&new Date(a.terms.at)<=new Date()&&!cs)form('약속 문제 신고','report',f=>{
  el('p',a.mine?(a.terms.office?'약속한 전문가를 만날 수 없었어요':'전문가가 오지 않았어요 · 연락이 안 돼요'):(a.terms.office?'고객님이 오지 않았어요':'고객님을 만날 수 없었어요 · 연락이 안 돼요'),f);
  el('p','신고와 약속 상태는 별도로 관리됩니다. 단순 지각·당일 취소는 무단 불참으로 계산하지 않습니다.',f);const n=field(f,'어떤 일이 있었나요? (민감한 정보는 제외)','body','textarea');n.required=true;n.minLength=3;n.maxLength=1000;
 });
 if(admin&&cs){for(const m of a.measures||[])measure(section,m);
  form('사실 확인 결과 저장','decide',f=>{
   choice(f,'확인 결과','outcome',outcomes,cs.outcome||'unverifiable');const reason=field(f,'판정 근거 · 양쪽 설명과 예외 사정','reason','textarea');reason.required=true;reason.minLength=5;reason.maxLength=1000;
   for(const [n,t]of Object.entries({records_reviewed:'예약·변경·취소 기록을 검토했습니다',both_sides_reviewed:'양쪽 설명 또는 설명 요청 이력을 확인했습니다',exceptions_reviewed:'응급상황·합의 변경·앱 오류를 검토했습니다',absence_verified:'확정된 약속의 실제 불참을 확인했습니다',no_advance_contact_verified:'사전 연락이 없었음을 확인했습니다',not_silence_only:'상대방 무응답만을 근거로 판단하지 않았습니다'}))field(f,t,n,'checkbox');
   el('p','불참 확인에는 모든 확인 항목이 필요합니다. 사실이 불분명하면 확인 불가를 선택하세요.',f);
  });
  if(a.measures?.some(m=>m.role==='expert'&&m.resume_required&&!m.resumed_at&&new Date(m.ends_at)<=new Date()))form('전문가 이용 재개 확인','resume',f=>{const n=field(f,'재개 확인 근거','reason','textarea');n.minLength=5;n.required=true;});
 }
 if(admin&&a.state==='cancelled'){
  form('반복 취소 별도 검토 기록','review_cancellations',f=>{const n=field(f,'검토 사유 (노쇼 횟수와 별도)','reason','textarea');n.minLength=5;n.required=true;});
 }
 const log=el('details',null,section);el('summary','예약 기록 보기',log);for(const e of [...(a.priorEvents||[]),...(a.events||[])])el('p',stamp(e.created_at)+' · '+roles[e.who]+' · '+(eventNames[e.event]||'약속 기록')+(e.detail?.minutes?' · 약 '+e.detail.minutes+'분 지연':'')+(e.detail?.reason?' · '+e.detail.reason:''),log);
 if(!admin&&(cs||a.state==='cancelled')){
  el('p',a.state==='active'?'기존 약속은 유지 중입니다. 다른 약속을 정하기 전 변경·취소 여부를 확인해 주세요.':'새 약속은 직접 선택하고 다시 동의한 뒤 요청합니다.',section);
  if(a.mine){const q=new URLSearchParams({region:a.terms.region||'',purpose:a.terms.purpose||'claim'});link(section,'다른 전문가 찾기','/map.html?view=experts&'+q);link(section,'방문할 보험소 찾기','/map.html?view=offices&'+q);if(a.state!=='active'&&a.expertId)link(section,'같은 전문가 재예약','/requests.html?'+q+'&planner='+encodeURIComponent(a.expertId));}
 }
 link(section,'운영자 문의','/support.html');return section;
}
export async function renderCareAdmin(client,host){if(!await careStatus(client))return;let section=host.querySelector('[data-care-admin]');if(!section){section=el('section',null,host,'appointment-care');section.dataset.careAdmin='';}
 const load=async()=>{const rows=await careRpc(client,'admin_list');section.replaceChildren();el('h2','약속 문제 확인',section);el('p','신고 접수와 예약 상태는 별도입니다. 사실 확인만으로 일정이 취소되지는 않습니다.',section);if(!rows.length)el('p','확인할 신고가 없습니다.',section);for(const a of rows){const d=el('details',null,section,'card');el('summary',(a.case?.outcome?outcomes[a.case.outcome]:a.case?'불참 확인 중':'취소 기록 · 별도 검토')+' · '+stamp(a.terms.at)+(a.case?.appeal_pending?' · 이의제기':''),d);renderCare({client,root:d,data:a,refresh:load,admin:true});}};await load();
}
export async function renderCareCases(client,host,workspace){
 if(!await careStatus(client))return;const section=el('section',null,host);
 const load=async()=>{section.replaceChildren();const rows=await careRpc(client,'my_cases',{workspace});for(const a of rows){if(document.querySelector('[data-appointment-id="'+a.id+'"]'))continue;const card=el('article',null,section,'card');el('h2','지난 약속 · 사실 확인',card);renderCare({client,root:card,data:a,refresh:load});}};await load();
}
export async function renderCareInbox(client,host){if(!await careStatus(client))return;const d=el('details',null,host,'appointment-care'),title=el('summary','내 알림',d),list=el('div',null,d);const load=async()=>{const rows=await careRpc(client,'inbox');list.replaceChildren();title.textContent='내 알림'+(rows.some(n=>!n.read_at)?' · 새 알림':'');if(!rows.length)el('p','새로운 알림이 없습니다.',list);for(const n of rows){const c=el('article',null,list,'card');el('strong',n.title,c);el('p',n.body,c);const safe=/^\/(requests|partner-work)\.html\?request=[0-9a-f-]{36}$/.test(n.deep_link)?n.deep_link:'/requests.html';link(c,'예약 확인 · 늦어요 · 변경·취소',safe);const b=el('button','읽음 표시',c,'btn ghost');b.type='button';b.disabled=!!n.read_at;b.onclick=async()=>{await careRpc(client,'read',{id:n.id});await load();};}};await load();const timer=setInterval(()=>{if(!host.isConnected){clearInterval(timer);return;}if(!document.hidden&&!document.activeElement?.closest('form'))load().catch(()=>{});},60000);}
