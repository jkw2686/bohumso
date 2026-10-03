import {el} from './consultation-ui.js';
// Provider operations must use authenticated server endpoints. Never collect card fields here.
export class PaymentProvider {
 constructor({enabled=false,savedCardsEnabled=false,transport}){this.enabled=enabled;this.savedCardsEnabled=savedCardsEnabled;this.transport=transport;}
 async call(action,payload={}){if(!this.enabled||typeof this.transport!=='function')throw Error('payments_not_ready');return this.transport(action,payload);}
 async savedMethods(){if(!this.savedCardsEnabled)return [];return this.call('saved_methods');}
 async registerCard(){if(!this.savedCardsEnabled)throw Error('saved_cards_not_ready');return this.call('register_card');}
 async pay(quoteId,methodId,requestKey){return this.call('pay',{quoteId,methodId,requestKey});}
}
export function renderBookingPayment(host,{enabled=false,quote,methods=[],onPay,onRegister}){
 if(!enabled||!quote||!Number.isSafeInteger(quote.amount)||quote.amount<=0)return;
 const section=el('section',undefined,host);section.className='card booking-payment';el('h2','예약 결제',section);el('p',quote.summary,section);
 const amount=quote.amount.toLocaleString('ko-KR')+'원';el('strong',amount,section);
 const details=el('details',undefined,section);el('summary','결제수단 선택',details);let selected='';
 for(const method of methods){const label=el('label',undefined,details),input=el('input',undefined,label);input.type='radio';input.name='saved-payment-method';input.value=method.id;input.onchange=()=>{selected=method.id;details.open=false;};el('span',method.brand+' •••• '+method.last4,label);}
 if(onRegister){const add=el('button','새 카드 등록',details);add.type='button';add.onclick=onRegister;}
 const status=el('p',undefined,section);status.setAttribute('role','status');const pay=el('button',amount+' 결제',section);pay.type='button';pay.className='btn';const key=crypto.randomUUID();
 pay.onclick=async()=>{pay.disabled=true;status.textContent='결제를 확인하고 있어요.';try{const result=await onPay(quote.id,selected,key);status.textContent=result?.status==='DONE'?'결제가 완료됐어요.':'결제 상태를 확인하고 있어요.';}catch{status.textContent='결제 상태를 확인한 후 다시 시도해 주세요.';}finally{pay.disabled=false;}};
 return section;
}
