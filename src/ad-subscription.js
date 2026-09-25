import {el,input,select,link,won,kst} from './consultation-ui.js';
const names={unpaid:'결제 전',confirming:'승인 확인 중',active:'이용 중',failed:'결제 실패',cancelled:'만료',refunding:'환불 확인 중',refund_failed:'환불 재확인',refunded:'환불 완료'};
let loadingSdk;
async function sdk(){
 if(window.TossPayments)return;
 if(!loadingSdk)loadingSdk=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://js.tosspayments.com/v2/standard';s.onload=resolve;s.onerror=()=>{s.remove();loadingSdk=null;reject(Error('payment_sdk_unavailable'));};document.head.append(s);});
 await loadingSdk;
}
export async function renderAds({client,workspace,host,message,action}){
 const rpc=async(name,args={})=>{const {data,error}=await client.rpc(name,args);if(error)throw error;return data;};
 const pay=async body=>{const {data}=await client.auth.getSession();if(!data.session)throw Error('login_required');const r=await fetch('/api/payment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(body)});const result=await r.json();if(!r.ok)throw Error(result.error);return result;};
 const check=(form,label,name)=>{const i=input(form,label,name,'checkbox');i.value='on';return i;};
 const submit=(form,fn)=>{form.onsubmit=e=>{e.preventDefault();action(form,async()=>{await fn(new FormData(form));await refresh();message('저장했습니다.');});};};
 const button=(parent,label,fn)=>{const b=el('button',label,parent);b.type='button';b.className='btn ghost';b.onclick=()=>action(parent,async()=>{await fn();await refresh();});return b;};
 async function openPayment(data){
  if(document.querySelector('.pay-overlay'))return;
  if(!data.testOnly||!data.clientKey?.startsWith('test_gck_'))throw Error('live_payments_blocked');
  if(data.order.state!=='unpaid'){message('새 결제를 시작하지 말고 구독 주문의 상태를 확인해 주세요.');return;}
  await sdk();
  const previous=document.activeElement,overlay=el('div',undefined,document.body);overlay.className='sheet-overlay show pay-overlay';
  const sheet=el('div',undefined,overlay);sheet.className='sheet';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-labelledby','adPaymentTitle');sheet.tabIndex=-1;
  el('h2',data.order.test_admin?'관리자 전용 테스트 결제':data.order.plan_name+' 광고 구독',sheet).id='adPaymentTitle';
  el('h3',won(data.order.amount)+(data.order.test_admin?' (테스트 금액)':' · '+data.order.period_days+'일'),sheet);
  el('p',data.order.test_admin?'실제 청구 없음 · 전문가 승인·광고 노출·상담 권한에 영향 없음':'테스트 결제 · 약정 노출 '+data.order.guaranteed_impressions+'회 · 자동 갱신 없음',sheet);
  el('p','카드·간편결제의 실제 지원 범위는 테스트 상점 설정에 따라 달라집니다.',sheet);
  const methods=el('div',undefined,sheet);methods.id='ad-payment-methods';
  const agreement=el('div',undefined,sheet);agreement.id='ad-payment-agreement';
  const notice=el('p','결제수단을 불러오는 중입니다.',sheet);notice.setAttribute('role','status');
  const actions=el('div',undefined,sheet);actions.className='review-actions';
  const start=el('button','결제하기',actions);start.type='button';start.className='btn';start.disabled=true;
  const closeButton=el('button','닫기',actions);closeButton.type='button';closeButton.className='btn ghost';
  let rendered=[],busy=false,closed=false;
  const close=async()=>{if(busy)return;closed=true;overlay.remove();for(const r of rendered)await r?.destroy?.();previous?.focus();};
  closeButton.onclick=close;overlay.onclick=e=>{if(e.target===overlay)close();};
  sheet.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const nodes=[...sheet.querySelectorAll('button:not(:disabled),iframe,[tabindex="0"],a[href]')];const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===sheet)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};sheet.focus();
  try{
   const widgets=window.TossPayments(data.clientKey).widgets({customerKey:data.order.customer_key});
   await widgets.setAmount({currency:'KRW',value:data.order.amount});
   const r=await Promise.allSettled([widgets.renderPaymentMethods({selector:'#ad-payment-methods',variantKey:'DEFAULT'}),widgets.renderAgreement({selector:'#ad-payment-agreement',variantKey:'AGREEMENT'})]);
   rendered=r.filter(x=>x.status==='fulfilled').map(x=>x.value);
   if(closed){for(const x of rendered)await x?.destroy?.();return;}
   if(r.some(x=>x.status==='rejected'))throw Error('widget_unavailable');
   notice.textContent='결제수단과 필수 동의를 확인해 주세요.';start.disabled=false;
   start.onclick=async()=>{busy=true;start.disabled=true;closeButton.disabled=true;try{await widgets.requestPayment({orderId:data.order.id,orderName:'보험소 '+data.order.plan_name+' 광고 구독 (테스트)',successUrl:data.successUrl,failUrl:data.failUrl});}catch{notice.textContent='결제를 완료하지 못했습니다. 구독 주문의 상태를 확인하고 다시 시도해 주세요.';}finally{busy=false;start.disabled=false;closeButton.disabled=false;}};
  }catch{notice.textContent='결제수단을 불러오지 못했습니다. 닫은 뒤 다시 시도해 주세요.';for(const r of rendered)await r?.destroy?.();rendered=[];}
 }
 async function refresh(){
  const data=await rpc('ad_workspace');host.replaceChildren();host.id='adSubscriptions';
  el('h2','광고 노출 구독',host);el('p','상담 요청·완료 횟수와 무관한 기간제 선불 상품입니다. 기간이 끝나면 직접 다시 결제하며 자동 청구하지 않습니다.',host);
  if(workspace==='admin'){
   const testCard=el('section',undefined,host);testCard.className='card';
   el('h3','관리자 카드결제 점검',testCard);
   el('p','1,000원 테스트 주문입니다. 실제 청구·전문가 승인·광고 노출은 발생하지 않습니다.',testCard);
   try{
    const orders=await rpc('admin_test_orders');
    const key=crypto.randomUUID();
    button(testCard,'관리자 테스트 결제 시작',async()=>openPayment(await pay({action:'admin_test_checkout',requestKey:key})));
    for(const o of orders){const row=el('section',undefined,testCard);el('p',o.id+' · '+({unpaid:'결제 전',confirming:'승인 확인 중',paid:'테스트 승인 완료',failed:'실패',refunded:'테스트 취소 완료'}[o.state]||o.state),row);
     if(o.state==='unpaid'&&Date.now()-new Date(o.created_at).getTime()<1800000)button(row,'테스트 주문 이어하기',async()=>openPayment(await pay({action:'admin_test_checkout',requestKey:o.request_key})));
     button(row,'테스트 결제 상태 확인',()=>pay({action:'status',orderId:o.id}));
    }
   }catch{el('p','관리자 테스트 결제 연결 준비 중입니다. 운영 승인은 변경하지 않습니다.',testCard);}

   const details=el('details',undefined,host);el('summary','구독 조건·노출 슬롯 설정',details);
   const form=el('form',undefined,details);form.id='adPlanForm';
   select(form,'요금제','code',{basic:'베이직',premium:'프리미엄',regional_exclusive:'지역독점'});
   for(const [label,name]of [['기간 금액 (VAT 포함)','amount'],['이용 기간 (일)','period_days'],['약정 노출수','guaranteed_impressions']]){const i=input(form,label,name,'number');i.min=1;i.required=true;if(name==='period_days')i.max=366;}
   input(form,'확정 근거','reason').required=true;check(form,'조건을 확인하고 테스트 판매 허용','enabled');
   el('button','새 구독 조건 저장',form).type='submit';
   submit(form,d=>rpc('ad_admin_command',{operation:'plan',payload:{...Object.fromEntries(d),enabled:d.get('enabled')==='on'}}));
   const slot=el('form',undefined,details);slot.id='adSlotForm';select(slot,'슬롯 유형','code',{basic:'베이직',premium:'프리미엄',regional_exclusive:'지역독점'});
   input(slot,'광고 노출 지역','region').required=true;input(slot,'설정 근거','reason').required=true;check(slot,'슬롯 사용 허용','enabled');el('button','슬롯 저장',slot).type='submit';
   submit(slot,d=>rpc('ad_admin_command',{operation:'slot',payload:{...Object.fromEntries(d),enabled:d.get('enabled')==='on'}}));
  }
  for(const code of ['basic','premium','regional_exclusive']){
   const plans=data.plans.filter(p=>p.code===code),enabled=plans.filter(p=>p.enabled);
   const p=enabled[0]||plans[0];if(!p)continue;
   const card=el('section',undefined,host);card.className='card';card.dataset.planCode=code;
   el('h3',p.name,card);if(code==='regional_exclusive')el('p','해당 지역의 지역독점 광고 슬롯 1개에 적용됩니다. 일반 전문가 목록은 유지됩니다.',card);el('p',p.enabled?won(p.amount)+' / '+p.period_days+'일 · 약정 '+p.guaranteed_impressions+'회':'요금·기간·약정 노출수 확정 전',card);
   if(workspace!=='partner'||!p.enabled)continue;
   const slots=data.slots.filter(s=>s.code===code&&s.enabled);
   if(!slots.length){el('p','이용 가능한 노출 슬롯을 준비 중입니다.',card);continue;}
   const form=el('form',undefined,card);select(form,'광고 노출 지역','slot_id',Object.fromEntries(slots.map(s=>[s.id,s.region])));
   check(form,'표시된 기간·금액·약정 노출수와 수동 갱신 방식에 동의합니다.','consent').required=true;
   const key=crypto.randomUUID();el('button','광고 구독 테스트 결제',form).type='submit';
   submit(form,async d=>{const result=await pay({action:'checkout',planId:p.id,slotId:d.get('slot_id'),requestKey:key,consent:d.get('consent')==='on'});await openPayment(result);});
  }
  for(const s of data.subscriptions){
   const card=el('section',undefined,host);card.className='card';card.dataset.subscriptionId=s.id;
   el('h3',s.plan_name+' · '+won(s.amount),card);
   el('p',s.expired&&s.state==='active'?'이용 기간 종료':names[s.state],card).className='ad-status';
   el('p','노출 '+s.impressions+' / 약정 '+s.guaranteed_impressions+'회',card);
   if(s.starts_at)el('p',kst(s.starts_at)+' ~ '+kst(s.ends_at)+' KST',card);
   if(s.state==='unpaid'&&new Date(s.hold_until)>new Date()&&workspace==='partner')button(card,'이 주문 결제 계속하기',async()=>{
    const result=await pay({action:'checkout',planId:s.plan_id,slotId:s.slot_id,requestKey:s.resume_key,consent:true});await openPayment(result);
   });
   button(card,'구독 결제 상태 확인',()=>pay({action:'status',orderId:s.order_id}));
   if(s.receipt_url){try{const u=new URL(s.receipt_url);if(u.protocol==='https:'&&(u.hostname==='tosspayments.com'||u.hostname.endsWith('.tosspayments.com'))){const a=link(card,'구독 영수증',u.href);a.target='_blank';a.rel='noopener';}}catch{}}
   if(workspace==='admin'&&s.expired&&s.impressions<s.guaranteed_impressions&&['active','refunding','refund_failed'].includes(s.state)){
    const f=el('form',undefined,card);check(f,'약정 노출 미달의 플랫폼 귀책 근거를 확인했습니다.','platform_fault').required=true;
    const reason=input(f,'환불 확인 근거','reason');reason.required=true;reason.minLength=5;
    el('button','광고 구독 테스트 전액 환불',f).type='submit';
    submit(f,d=>pay({action:'refund',orderId:s.order_id,reason:d.get('reason'),platformFault:d.get('platform_fault')==='on'}));
   }
   for(const e of s.events||[])el('p',kst(e.created_at)+' · '+e.event+' · '+(e.actor||'서버')+' · '+e.reason,card);
  }
 }
 await refresh();
}
