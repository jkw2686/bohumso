import {el,kst,states} from './consultation-ui.js';
export async function mountOfficeManagement({client,host,isCurrent=()=>true}){
 const panel=el('section',undefined,host);panel.dataset.officeManagement='';
 const note=el('p','보험소 운영정보를 확인하고 있습니다.',panel);note.setAttribute('role','status');
 const body=el('div',undefined,panel);
 const rpc=async(operation,payload={})=>{const {data,error}=await client.rpc('office_management',{operation,payload});if(error)throw error;return data;};
 const load=async()=>{const data=await rpc('get');if(!isCurrent())return;render(data);};
 const render=data=>{body.replaceChildren();note.textContent='';const o=data.office;
 el('h3',o.name,body);el('p',o.address+' · 고정 사업장',body);
 el('strong',o.accepting_reservations?'신규 방문예약 접수 중':'신규 방문예약 접수 중지',body);
 el('p','기존 예약은 접수 상태와 관계없이 유지됩니다.',body);
 const details=el('details',undefined,body);el('summary','운영시간·예약 접수 변경',details);const form=el('form',undefined,details);
 const days=[];for(const [v,label]of ['일','월','화','수','목','금','토'].entries()){const l=el('label',label+'요일',form),i=el('input',undefined,l);i.type='checkbox';i.checked=o.weekdays.includes(v);days.push(i);}
 const fields={};for(const [name,label,value]of [['first_start_hour','첫 예약 시작 시각',o.first_start_hour],['last_start_hour','마지막 예약 시작 시각',o.last_start_hour]]){const l=el('label',label,form),i=el('input',undefined,l);i.type='number';i.min=9;i.max=17;i.required=true;i.value=value;fields[name]=i;}
 const l=el('label','신규 방문예약 받기',form),accept=el('input',undefined,l);accept.type='checkbox';accept.checked=o.accepting_reservations;
 const save=el('button','운영 설정 저장',form);save.className='btn';save.type='submit';
 form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{const next=await rpc('save',{revision:o.revision,first_start_hour:Number(fields.first_start_hour.value),last_start_hour:Number(fields.last_start_hour.value),weekdays:days.flatMap((i,n)=>i.checked?[n]:[]),accepting_reservations:accept.checked});if(isCurrent()){render(next);note.textContent='운영 설정을 저장했습니다. 기존 예약은 유지됩니다.';}}catch(e){note.textContent=e.message==='stale_request'?'다른 화면에서 설정이 바뀌었습니다. 다시 조회한 뒤 변경해 주세요.':'설정을 저장하지 못했습니다. 입력값을 확인하고 다시 시도해 주세요.';}finally{save.disabled=false;}};
 el('h3','방문예약 관리',body);if(!data.bookings.length)el('p','접수된 방문예약이 없습니다.',body);
 const archived=new Set(['completed','cancelled','unmatched','no_show']);const previous=el('details',undefined,body);el('summary','지난 예약·종료 내역',previous);previous.hidden=!data.bookings.some(r=>archived.has(r.state));
 for(const r of data.bookings){const row=el('div',undefined,archived.has(r.state)?previous:body);row.className='management-task-row';row.dataset.officeBooking=r.id;el('p',(r.state==='requested'?'요청 접수 · 확정 전':r.state==='coordinating'?'일정 조율 중':states[r.state]||'상태 확인 필요')+' · '+(['confirmed','scheduled','awaiting_completion','completed'].includes(r.state)?'확정 일정 ':'희망 일정 ')+kst(r.preferred_at)+' · 보험소 방문',row);
 if(r.mine){const a=el('a','담당 예약 처리',row);a.href='/notifications.html?reservation='+encodeURIComponent(r.id);a.className='btn ghost';}
 else el('p',r.assigned?(r.expert_name||'담당 전문가')+' · 기존 예약 화면에서 처리합니다.':'담당 전문가 배정이 필요합니다.',row);
 if(!r.assigned&&['requested','coordinating'].includes(r.state)){const choose=el('button','담당 전문가 선택',row);choose.className='btn ghost';choose.type='button';choose.onclick=async()=>{choose.disabled=true;try{const {data,error}=await client.rpc('planner_catalog',{area:'',wanted:''});if(error)throw error;if(!isCurrent())return;const label=el('label','배정할 전문가',row),select=el('select',undefined,label);for(const p of (data.planners||[]).filter(p=>p.available&&!p.is_sample)){const option=el('option',p.name+' · '+(p.profession_name||'전문가'),select);option.value=p.id;}if(!select.options.length){el('p','배정할 수 있는 전문가가 없습니다.',row);return;}const assign=el('button','선택한 전문가에게 배정',row);assign.type='button';assign.className='btn';assign.onclick=async()=>{if(!confirm('선택한 전문가에게 이 예약 요청을 배정할까요? 아직 예약 확정은 아닙니다.'))return;assign.disabled=true;try{const next=await rpc('assign',{id:r.id,revision:r.revision,planner_id:select.value});if(isCurrent()){render(next);note.textContent='배정했습니다. 전문가의 수락을 기다려 주세요.';}}catch{note.textContent='배정하지 못했습니다. 예약 상태와 전문가의 가능 시간을 다시 확인해 주세요.';assign.disabled=false;}};}catch{note.textContent='전문가 목록을 불러오지 못했습니다.';choose.disabled=false;}};}
 }
 body.append(previous);
 const selected=new URLSearchParams(location.search).get('request');if(selected){const selectedRow=[...body.querySelectorAll('[data-office-booking]')].find(n=>n.dataset.officeBooking===selected);if(selectedRow){const fold=selectedRow.closest('details');if(fold)fold.open=true;selectedRow.tabIndex=-1;requestAnimationFrame(()=>{selectedRow.focus({preventScroll:true});selectedRow.scrollIntoView({block:'center'});});}else note.textContent='이 보험소에서 확인할 수 없는 예약입니다.';}
 };
 const retry=el('button','운영정보 다시 조회',panel);retry.type='button';retry.className='btn ghost';retry.onclick=async()=>{retry.disabled=true;try{await load();}catch{note.textContent='운영정보를 불러오지 못했습니다. 설정과 예약은 변경되지 않았습니다.';}finally{retry.disabled=false;}};
 try{await load();}catch(e){note.textContent=/office_approval_required/.test(e.message)?'보험소 운영 승인이 필요합니다. 등록·심사 상태를 확인해 주세요.':'보험소 운영 관리 연결이 필요합니다. 서버 적용 여부를 확인해 주세요.';}
}
