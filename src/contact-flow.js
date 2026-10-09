const errors={contact_consent_required:'연락처 공개 동의를 확인해 주세요.',both_contact_consents_required:'양쪽 모두 연락처 공개에 동의하면 전화할 수 있어요.',contact_first_required:'양쪽 모두 전화·연락 완료를 확인한 뒤 확정해 주세요.',contact_confirmation_required:'상대방과 연락한 내용을 확인해 주세요.',customer_name_required:'예약자 이름을 입력해 주세요.',phone_verification_required:'휴대전화 인증을 먼저 완료해 주세요.',reception_paused:'지금은 새 상담 접수를 쉬고 있어요.',office_not_active:'운영 장소와 일정을 먼저 등록해 주세요.',expert_verification_required:'전문가 승인과 휴대전화 확인이 필요해요.',stale_request:'예약이 변경됐어요. 새로고침 후 다시 확인해 주세요.'};
export const flowError=e=>errors[e?.message]||'처리하지 못했어요. 새로고침 후 다시 확인해 주세요.';
let revealedRequest='';
export function revealRequestedBooking(root){
 const id=new URLSearchParams(location.search).get('request');
 if(!id||id===revealedRequest||!/^[0-9a-f-]{36}$/i.test(id))return;
 const card=[...root.querySelectorAll('[data-booking-id]')].find(n=>n.dataset.bookingId===id);
 if(!card)return;revealedRequest=id;card.tabIndex=-1;card.classList.add('notification-target');card.scrollIntoView({block:'center'});card.focus({preventScroll:true});
}
function el(tag,text,parent,cls){const n=document.createElement(tag);n.textContent=text||'';if(cls)n.className=cls;parent.append(n);return n;}
function action(root,text,run,secondary=false){const b=el('button',text,root,'btn'+(secondary?' ghost':''));b.type='button';b.onclick=async()=>{b.disabled=true;try{await run();}catch(e){let m=root.querySelector('[role="alert"]');if(!m){m=el('p','',root);m.role='alert';}m.textContent=flowError(e);}finally{b.disabled=false;}};return b;}
function check(root,text){const l=el('label','',root,'contact-choice'),n=document.createElement('input');n.type='checkbox';l.append(n);el('span',text,l);return n;}
export function renderContactFlow(root,{exchange,recipient,isCustomer,visit=false,run,refresh}){
 if(!exchange?.active)return;
 const box=el('section','',root,'contact-flow');el('h3','연락하고 일정 확정',box);
 const steps=el('ol','',box,'contact-steps');for(const [text,done] of [['연락처 동의',exchange.myConsent&&exchange.otherConsent],['전화·연락',exchange.myContacted&&exchange.otherContacted],['일정 확정',false]]){const item=el('li',(done?'✓ ':'')+text,steps);if(done)item.className='is-complete';}
 if(!exchange.myConsent){
  el('p',(recipient||'이번 상담 상대방')+'에게 인증된 휴대전화 번호를 공개합니다. 양쪽 모두 동의하면 서로 전화할 수 있어요.',box);
  const more=el('details','',box);el('summary','연락처 제공 안내',more);el('p','받는 사람: '+(recipient||'이번 상담 상대방')+'. 목적: 요청한 상담의 일정·장소 연락. 항목: 인증된 휴대전화 번호. 상담 종료·취소 후에는 이 화면에서 번호를 공개하지 않습니다. 동의하지 않으면 번호는 공개되지 않으며 전화 연락과 예약 확정을 진행할 수 없습니다.',more);const privacy=el('a','개인정보처리방침',more);privacy.href='/privacy.html';
  const consent=check(box,'위 내용을 확인하고 이번 상담 상대방에게 연락처를 공개하는 데 동의합니다.');
  action(box,'동의하고 연락처 공개',async()=>{if(!consent.checked)throw Error('contact_consent_required');await run('share_contact',{consent:true});await refresh();});
 }else el('p','✓ 내 연락처 공개 동의 완료',box,'flow-note');
 if(exchange.myConsent&&!exchange.otherConsent)el('p','상대방의 연락처 공개 동의를 기다리고 있어요.',box);
 if(exchange.phone){
  const call=el('a','전화하기 · '+exchange.phone,box,'btn');call.href='tel:'+exchange.phone;
  el('p','전화 또는 다른 연락 방법으로 시간과 장소를 함께 확인해 주세요.',box);
  if(!exchange.myContacted){const confirm=check(box,'상대방과 연락하여 희망시간과 장소를 확인했습니다.');action(box,'연락 완료',async()=>{if(!confirm.checked)throw Error('contact_confirmation_required');await run('contacted',{confirmed:true});await refresh();});}
  else el('p',exchange.otherContacted?'✓ 양쪽 연락 확인 완료':'✓ 내 연락 확인 완료 · 상대방 확인 대기',box,'flow-note');
 }
 if(exchange.ready&&isCustomer){
  let name;if(!visit){const label=el('label','예약자 이름',box,'field');name=el('input','',label);name.autocomplete='name';name.maxLength=60;}
  const consent=check(box,visit?'연락한 일정으로 확정하고 담당 전문가에게 방문 주소·요청내용을 제공합니다.':'연락한 일정으로 예약을 확정합니다.');
  action(box,visit?'방문 일정 확정':'예약 확정',async()=>{if(!consent.checked)throw Error('contact_confirmation_required');if(name&&name.value.trim().length<2){name.focus();throw Error('customer_name_required');}await run(visit?'confirm_visit':'confirm',{confirmed:true,consent:true,name:name?.value.trim()});await refresh();});
 }else if(exchange.ready)el('p','고객이 최종 확정하면 양쪽에 알림이 표시돼요.',box);
}
export async function renderAvailability(client,root,{offices=false}={}){
 const card=el('section','',root,'card availability-panel');card.id='consultationAvailability';let data;
 const rpc=async(operation,payload={})=>{const r=await client.rpc('consultation_availability',{operation,payload});if(r.error)throw r.error;return r.data;};
 const load=async()=>{data=await rpc('list');card.replaceChildren();el('h2',offices?'보험소 상담 접수':'상담 접수',card);el('p','OFF로 바꾸면 새 요청만 멈춥니다. 접수한 예약은 계속 확인할 수 있어요.',card);
 function toggle(parent,title,enabled,ready,run){const row=el('div','',parent,'availability-row');const copy=el('div','',row);el('strong',title,copy);el('p',ready?(enabled?'상담 요청을 받고 있어요':'새 상담 접수 쉬는 중'):'운영 장소·일정 등록 후 사용할 수 있어요',copy,'flow-note');const b=action(row,enabled?'ON · 끄기':'OFF · 켜기',async()=>{await run();await load();window.dispatchEvent(new Event('availability-changed'));},!enabled);b.setAttribute('role','switch');b.setAttribute('aria-checked',String(enabled));b.setAttribute('aria-label',title+' 상담 접수');b.disabled=!ready;}
 if(offices){const ready=data.offices.filter(o=>o.ready),pending=data.offices.filter(o=>!o.ready);for(const o of ready)toggle(card,o.name,o.enabled,o.ready,()=>rpc('office',{office_id:o.id,enabled:!o.enabled}));if(!ready.length)el('p','현재 운영 등록을 마친 보험소가 없습니다.',card);if(pending.length){const d=el('details','',card);el('summary','개설 예정 보험소 '+pending.length+'곳',d);for(const o of pending)toggle(d,o.name,false,false,()=>{});}}
 else toggle(card,'전문가',data.expertEnabled,data.expertEligible,()=>rpc('expert',{enabled:!data.expertEnabled}));
 };
 try{await load();}catch(e){el('p','상담 접수 상태를 불러오지 못했어요.',card);action(card,'다시 확인',load);}
}
