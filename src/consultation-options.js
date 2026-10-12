import {el,input,select} from './consultation-ui.js';
export const MEETING_MODES={expert_office:'전문가 사무실 방문',insurance_office:'보험소에서 만나기',expert_visit:'전문가 방문'};
export function feeText(fee){
 if(!fee)return '';
 const status=fee.status==='free'?'무료':fee.status==='paid'?Number(fee.amount).toLocaleString('ko-KR')+'원':'사전 확인 필요';
 return ['세무 상담료 · '+status,'60분',fee.scope,fee.extra&&'추가 비용 조건: '+fee.extra,fee.tax_note].filter(Boolean).join(' · ');
}
export async function renderConsultationOptions(client,host){
 const cap=await client.rpc('expert_integration_capabilities');if(cap.error||!cap.data?.unifiedBooking)return;
 const result=await client.rpc('expert_consultation_settings',{operation:'get'});if(result.error)return;
 let data=result.data,busy=false;const box=el('details',undefined,host);box.className='expert-settings';el('summary','만남 방식·상담 조건',box);
 const form=el('form',undefined,box),modes={};
 for(const [key,name] of Object.entries(MEETING_MODES)){if(key==='insurance_office'&&!data.offices.some(o=>o.available))continue;const i=input(form,name,key,'checkbox');i.checked=data.modes.includes(key);modes[key]=i;}
 const address=input(form,'공개할 사무실 주소 (사무실 방문 시)','office_address');address.value=data.office_address||'';address.maxLength=200;
 let status,amount,scope,extra,taxNote;
 if(data.profession==='tax'){
  el('h3','세무 상담료',form);el('p','플랫폼 이용료와 별개입니다. 실제 제공하는 조건만 등록하세요. 자동 결제는 없습니다.',form);
  status=select(form,'비용 안내','fee_status',{check:'사전 확인 필요',free:'무료',paid:'유료'});status.value=data.fee?.status||'check';
  amount=input(form,'상담료 (원 · 60분)','amount','number',data.fee?.amount||'');amount.min=1;amount.max=99999999;amount.step=1;
  scope=input(form,'포함 범위','scope','text',data.fee?.scope||'');scope.maxLength=300;
  extra=input(form,'추가 비용 조건','extra','text',data.fee?.extra||'');extra.maxLength=300;
  taxNote=input(form,'부가세 포함 여부 등 금액 안내','tax_note','text',data.fee?.tax_note||'');taxNote.maxLength=120;
  const update=()=>{for(const n of [amount,scope,extra,taxNote])n.required=status.value==='paid';amount.disabled=status.value!=='paid';};status.onchange=update;update();
 }
 const message=el('p','',form);message.setAttribute('role','status');const save=el('button','저장하기',form);save.className='btn';save.type='submit';
 form.onsubmit=async e=>{e.preventDefault();if(busy||!form.reportValidity())return;busy=true;save.disabled=true;message.textContent='저장 중…';
  const payload={revision:data.revision,modes:Object.keys(modes).filter(k=>modes[k].checked),office_address:address.value,fee:status?{status:status.value,amount:amount.value,scope:scope.value,extra:extra.value,tax_note:taxNote.value}:null};
  const controls=[...form.querySelectorAll('input,select')],old=controls.map(n=>n.disabled);controls.forEach(n=>n.disabled=true);
  try{const r=await client.rpc('expert_consultation_settings',{operation:'save',payload});if(r.error)throw r.error;data=r.data;message.textContent='저장 완료 · 다음 예약 신청부터 반영됩니다.';}
  catch(e){message.textContent=e.message==='stale_record'?'다른 화면에서 조건이 바뀌었습니다. 입력을 보관한 뒤 새로고침해 주세요.':'저장 실패 · 입력은 유지됩니다. 제공 방식과 주소·비용 조건을 확인해 주세요.';}
  finally{busy=false;save.disabled=false;controls.forEach((n,i)=>n.disabled=old[i]);}
 };
}
