export function testPaymentConfig(env){
 const clientKey=env('TOSS_CLIENT_KEY')||'',secretKey=env('TOSS_SECRET_KEY')||'';
 if(env('PAYMENTS_ENABLED')!=='true'||env('TOSS_MODE')!=='test'||!clientKey.startsWith('test_ck_')||!secretKey.startsWith('test_sk_'))throw new Error('test_payment_not_configured');
 const origin=new URL(env('APP_ORIGIN'));
 if(origin.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(origin.hostname))throw new Error('invalid_origin');
 return {clientKey,secretKey,origin:origin.origin};
}
export function createTossGateway(secretKey,fetcher=fetch){
 if(!secretKey?.startsWith('test_sk_'))throw Error('live_payments_blocked');
 async function call(path,body,idempotencyKey){
  const response=await fetcher('https://api.tosspayments.com/v1/payments'+path,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(secretKey+':').toString('base64'),'Content-Type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
  const data=await response.json();if(!response.ok){const error=new Error('provider_error');error.providerCode=String(data.code||'UNKNOWN');throw error;}return data;
 }
 return {lookup:orderId=>call('/orders/'+encodeURIComponent(orderId)),confirm:o=>call('/confirm',{paymentKey:o.payment_key,orderId:o.id,amount:o.amount},'confirm_'+o.id),cancel:o=>call('/'+encodeURIComponent(o.payment_key)+'/cancel',{cancelReason:o.reason},'refund_'+o.id)};
}
export function verifiedPayment(payment,order){
 if(payment.orderId!==order.id||payment.paymentKey!==order.payment_key||payment.totalAmount!==order.amount||payment.currency!=='KRW'||payment.type!=='NORMAL'||(['DONE','CANCELED','PARTIAL_CANCELED'].includes(payment.status)&&(!['카드','간편결제'].includes(payment.method)||!payment.card)))throw Error('provider_payment_mismatch');
 // Whitelist only the receipt. Card data and full provider responses never enter our DB/logs.
 let receipt=null;try{const url=new URL(payment.receipt?.url);if(url.protocol==='https:'&&(url.hostname==='tosspayments.com'||url.hostname.endsWith('.tosspayments.com')))receipt=url.href;}catch{}
 return {order_id:order.id,provided_key:order.payment_key,provided_amount:order.amount,provider_status:payment.status,receipt,transaction_id:payment.lastTransactionKey||null};
}
export async function confirmAndReconcile(order,gateway,reconcile){
 let payment;
 try{payment=await gateway.lookup(order.id);}catch(error){if(error.providerCode!=='NOT_FOUND_PAYMENT')throw error;}
 if(!payment||payment.status==='IN_PROGRESS'||payment.status==='READY'){
  try{payment=await gateway.confirm(order);}catch(error){
   // Timeout or duplicate approval: query the provider. Never label an uncertain charge as failed.
   try{payment=await gateway.lookup(order.id);}catch{throw Error('payment_status_pending');}
  }
 }
 const verified=verifiedPayment(payment,order);await reconcile(verified);
 return {status:payment.status,receipt:verified.receipt};
}
