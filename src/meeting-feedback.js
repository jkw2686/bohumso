import {el} from './consultation-ui.js';
export const PUBLIC_FEEDBACK_VERSION='meeting-rating-public-2026-10-12-v1';
const tags={kind:'친절해요',clear:'설명이 쉬워요',helpful:'도움이 됐어요',punctual:'약속을 잘 지켜요'};
const topic={none:'없었어요',customer:'고객이 먼저 물었어요',expert:'설계사가 먼저 꺼냈어요',unknown:'잘 모르겠어요'};
const timings={during:'청구 도움 전·진행 중',after:'청구 도움을 마친 뒤',unknown:'잘 모르겠어요'};
const helps={done:'마쳤어요',ongoing:'진행 중이에요',not_done:'진행하지 못했어요'};
const errors={feedback_stale:'다른 화면에서 답변이 바뀌었습니다. 입력을 보관한 뒤 새로고침해 주세요.',meeting_not_completed:'실제 미팅 완료를 먼저 확인해 주세요.',feedback_timing_required:'가입 이야기가 나온 시점을 선택해 주세요.',feedback_empty:'답변할 항목을 선택하거나 ‘나중에’를 눌러 주세요.',feedback_forbidden:'이 만남에 답변할 수 없습니다.'};
async function call(client,operation,payload){const r=await client.rpc('meeting_feedback',{operation,payload});if(r.error)throw r.error;return r.data;}
function button(parent,label,action,secondary=false){const b=el('button',label,parent);b.type='button';b.className='btn'+(secondary?' ghost':'');b.onclick=action;return b;}
function choices(parent,title,name,options,value,onchange,stars=false){
 const group=el('fieldset',undefined,parent);el('legend',title,group);const list=el('div',undefined,group);list.className=stars?'feedback-stars':'feedback-options';
 for(const [key,text]of Object.entries(options)){const l=el('label',undefined,list);l.className='feedback-choice';const i=el('input',undefined,l);i.type='radio';i.name=name;i.value=key;i.checked=String(value)===key;i.setAttribute('aria-label',text);const s=el('span',stars?(Number(key)<=Number(value)?'★':'☆'):text,l);if(stars)s.setAttribute('aria-hidden','true');i.onchange=()=>{onchange(key);if(stars)list.querySelectorAll('label').forEach(n=>n.querySelector('span').textContent=Number(n.querySelector('input').value)<=Number(key)?'★':'☆');};}
 return group;
}
export function renderMeetingFeedback({client,root,data,onProblem,afterSave}){
 if(!data||data.role==='admin'||data.role==='expert'&&!data.protection)return;
 const host=el('section',undefined,root);host.className='meeting-feedback';host.setAttribute('aria-label','미팅 후 확인');let current=data,busy=false;
 function draw(){
  host.replaceChildren();
  if(!current.eligible){if(current.canConfirm){el('h3','실제 만남을 확인해 주세요.',host);el('p','전문가가 완료를 알렸습니다. 실제로 만났을 때만 확인해 주세요.',host);const status=el('p','',host);status.setAttribute('role','status');button(host,'실제로 만났어요',async()=>{if(busy)return;busy=true;try{current=await call(client,'confirm_visit',{kind:current.kind,id:current.id,met:true});draw();}catch(e){status.textContent=errors[e.message]||'확인을 저장하지 못했습니다. 다시 시도해 주세요.';}finally{busy=false;}});button(host,'만나지 않았어요 · 예약 문제 확인',onProblem,true);}else host.remove();return;}
  if(current.mine){el('h3','만남 확인을 저장했어요',host);el('p',current.role==='consumer'?(current.mine.public_consent?'별점·태그만 공개 집계됩니다. 운영 답변은 비공개입니다.':'답변은 비공개로 저장되었습니다.'):'답변은 운영자만 확인할 수 있어요.',host);button(host,'답변 수정',()=>form(),true);button(host,'문제 알리기',()=>form(true),true);}else form();
 }
 function later(){host.replaceChildren();el('p','나중에 이 예약에서 다시 답변할 수 있어요.',host);button(host,'만남 확인하기',()=>form(),true);}
 function form(report=false){
  host.replaceChildren();const consumer=current.role==='consumer';const value={rating:null,tags:[],public_consent:false,help_status:null,initiator:null,timing:null,problem:'',...current.mine};value.tags=[...value.tags];
  el('h3',consumer?'오늘 만남은 어떠셨나요?':'이번 만남을 확인해 주세요.',host);
  const f=el('form',undefined,host);let timingGroup;
  if(consumer){choices(f,'도움은 어떠셨나요?','feedback_rating',{'1':'1점','2':'2점','3':'3점','4':'4점','5':'5점'},value.rating,v=>value.rating=Number(v),true);button(f,'별점 선택 안 함',()=>{value.rating=null;f.querySelectorAll('[name=feedback_rating]').forEach(n=>{n.checked=false;n.nextElementSibling.textContent='☆';});f.dispatchEvent(new Event('change',{bubbles:true}));},true);}
  else choices(f,'청구 도움은 마쳤나요?','feedback_help',helps,value.help_status,v=>value.help_status=v);
  if(current.protection){
   choices(f,'새 보험 가입 이야기가 있었나요?','feedback_initiator',consumer?{...topic,customer:'내가 먼저 물었어요'}:{...topic,expert:'내가 먼저 꺼냈어요',unknown:'구분하기 어려워요'},value.initiator,v=>{value.initiator=v;timingGroup.hidden=!['customer','expert'].includes(v);if(timingGroup.hidden){value.timing=null;timingGroup.querySelectorAll('input').forEach(n=>n.checked=false);}for(const i of timingGroup.querySelectorAll('input'))i.required=!timingGroup.hidden;});
   el('p','기존 보험의 청구·보장 설명은 제외해 주세요.',f).className='feedback-note';
   timingGroup=choices(f,'언제였나요?','feedback_timing',consumer?timings:{...timings,unknown:'구분하기 어려워요'},value.timing,v=>value.timing=v);timingGroup.hidden=!['customer','expert'].includes(value.initiator);for(const i of timingGroup.querySelectorAll('input'))i.required=!timingGroup.hidden;
  }
  if(consumer){
   const group=el('fieldset',undefined,f);el('legend','칭찬 태그 (선택)',group);const list=el('div',undefined,group);list.className='feedback-options';
   for(const [key,title]of Object.entries(tags)){const l=el('label',undefined,list);l.className='feedback-choice';const i=el('input',undefined,l);i.type='checkbox';i.checked=value.tags.includes(key);el('span',title,l);i.onchange=()=>value.tags=i.checked?[...value.tags,key]:value.tags.filter(x=>x!==key);}
   const l=el('label',undefined,f);l.className='feedback-choice';const consent=el('input',undefined,l);consent.type='checkbox';consent.checked=!!value.public_consent;el('span','별점과 선택한 태그의 공개에 동의합니다.',l);consent.onchange=()=>value.public_consent=consent.checked;
   el('p','공개 동의 없이, 별점 없이도 운영 답변을 보낼 수 있어요. 이름과 예약 일시는 공개하지 않습니다.',f).className='feedback-note';
  }
  const problem=el('details',undefined,f);problem.open=report||!!value.problem;el('summary','문제 알리기 (선택)',problem);const label=el('label','운영자에게 알릴 내용 · 개인정보는 적지 마세요.',problem),text=el('textarea',undefined,label);text.maxLength=1000;text.value=value.problem;text.oninput=()=>value.problem=text.value;el('p','상대방에게 원문을 공개하지 않습니다. 답변만으로 제재하지 않습니다.',problem).className='feedback-note';
  const status=el('p','',f);status.setAttribute('role','status');const actions=el('div',undefined,f);actions.className='form-actions';const save=el('button','제출',actions);save.className='btn';save.type='submit';button(actions,'나중에',later,true);button(f,'실제로 만나지 않았어요 · 예약 문제 확인',onProblem,true);
  f.onsubmit=async e=>{e.preventDefault();if(busy||!f.reportValidity())return;busy=true;const controls=[...f.querySelectorAll('input,textarea,button')];controls.forEach(n=>n.disabled=true);status.textContent='저장 중…';
   try{current=await call(client,'save',{kind:current.kind,id:current.id,revision:current.mine?.revision||0,rating:value.rating,tags:value.tags,public_consent:value.public_consent,consent_version:PUBLIC_FEEDBACK_VERSION,help_status:value.help_status,initiator:value.initiator,timing:value.timing,problem:value.problem});
    try{localStorage.setItem('bohumso-profile-updated',String(Date.now()));}catch{}window.dispatchEvent(new Event('bohumso-profile-updated'));afterSave?.(f);draw();
   }catch(e){status.textContent=errors[e.message]||'저장하지 못했습니다. 입력은 그대로입니다. 다시 시도해 주세요.';}finally{busy=false;controls.forEach(n=>n.disabled=false);}
  };
 }
 draw();return host;
}
export async function getMeetingFeedback(client,kind,id){try{return await call(client,'get',{kind,id});}catch{return null;}}
export async function renderFeedbackAdmin(client,root,afterSave){
 let rows;try{rows=await call(client,'admin_list',{});}catch{el('p','미팅 확인 내역을 불러오지 못했습니다.',root).setAttribute('role','status');button(root,'다시 확인',()=>{root.replaceChildren();return renderFeedbackAdmin(client,root,afterSave);},true);return;}
 const host=el('details',undefined,root);host.className='meeting-feedback';el('summary','미팅 후 운영 확인 · '+rows.length+'건',host);
 el('p','양쪽 답변을 비교해 사실관계를 확인하세요. 미응답·모호한 답변·별점만으로 위반을 확정하지 않습니다. 제재와 노쇼 횟수는 변경되지 않습니다.',host);
 for(const data of rows){const card=el('section',undefined,host);card.className='feedback-admin-row';el('h3',data.kind==='visit'?'전문가 방문 만남':'완료한 상담 만남',card);el('p','예약 확인번호 · '+data.id,card);
  const reasons={expert_initiated:'설계사 선제안 확인 필요',mismatch:'응답 불일치',problem:'문제 알림'};el('strong',(data.check.flags.length?data.check.flags.map(k=>reasons[k]).join(' · '):'응답 수정됨 · 기존 확인 이력 검토'),card);
  for(const role of ['consumer','expert']){const r=data.responses?.[role];el('h4',role==='consumer'?'소비자 답변':'설계사 답변',card);if(!r){el('p','미응답',card);continue;}if(role==='consumer')el('p',r.rating?r.rating+'점 · '+(r.public_consent?'공개 집계 동의':'비공개'):'별점 선택 없음',card);if(r.help_status)el('p','청구 도움 · '+helps[r.help_status],card);el('p','가입 이야기 · '+(topic[r.initiator]||'미응답'),card);if(r.timing)el('p','시점 · '+timings[r.timing],card);if(r.problem)el('p','문제 알림 · '+r.problem,card);}
  const stateLabels={pending:'확인 대기',reviewing:'확인 중',reviewed:'운영 확인 기록됨'};const state=el('p',stateLabels[data.check.status],card);const f=el('form',undefined,card);const l=el('label','운영 확인 메모 · 고객에게 보내지 않습니다.',f),note=el('textarea',undefined,l);note.required=true;note.minLength=5;note.maxLength=1000;note.value=data.check.note||'';const status=el('p','',f);status.setAttribute('role','status');let busy=false;
  for(const [value,title]of [['reviewing','확인 중으로 저장'],['reviewed','운영 확인 기록']]){const b=button(f,title,async()=>{if(busy||!f.reportValidity())return;busy=true;f.querySelectorAll('button').forEach(n=>n.disabled=true);try{const updated=await call(client,'admin_review',{kind:data.kind,id:data.id,revision:data.check.revision,status:value,note:note.value});data.check=updated.check;state.textContent=stateLabels[data.check.status];afterSave?.(f);status.textContent='기록했습니다. 제재나 고객 알림은 실행하지 않았습니다.';}catch(e){status.textContent=errors[e.message]||'저장하지 못했습니다. 입력을 유지합니다.';}finally{busy=false;f.querySelectorAll('button').forEach(n=>n.disabled=false);}},value==='reviewed');}
 }
}
