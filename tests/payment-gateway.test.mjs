import {test} from 'node:test';import assert from 'node:assert/strict';
import {testPaymentConfig,createTossGateway,verifiedPayment,confirmAndReconcile} from '../netlify/functions/_shared/payments.mjs';
const order={id:'boh_test_1',amount:35000,payment_key:'test_payment_key'};
const payment={orderId:order.id,paymentKey:order.payment_key,totalAmount:35000,currency:'KRW',type:'NORMAL',method:'카드',card:{number:'NEVER_STORE'},status:'DONE',receipt:{url:'https://dashboard.tosspayments.com/receipt'},lastTransactionKey:'transaction'};
test('Payment config is test-only and disabled unless explicitly configured',()=>{
 const env={PAYMENTS_ENABLED:'true',TOSS_MODE:'test',TOSS_CLIENT_KEY:'test_ck_example',TOSS_SECRET_KEY:'test_sk_example',APP_ORIGIN:'http://localhost:3100'};assert.equal(testPaymentConfig(k=>env[k]).clientKey,'test_ck_example');
 for(const patch of [{PAYMENTS_ENABLED:'false'},{TOSS_MODE:'live'},{TOSS_SECRET_KEY:'live_sk_example'},{TOSS_CLIENT_KEY:'live_ck_example'}])assert.throws(()=>testPaymentConfig(k=>({...env,...patch})[k]));
 assert.throws(()=>createTossGateway('live_sk_example'));
});
test('Provider verification rejects wrong amount, order, currency, payment key and non-card payment',()=>{
 for(const patch of [{totalAmount:1},{orderId:'other'},{paymentKey:'other'},{currency:'USD'},{type:'BILLING'},{method:'계좌이체'},{card:null}])assert.throws(()=>verifiedPayment({...payment,...patch},order));
 const stored=verifiedPayment(payment,order);assert.ok(!JSON.stringify(stored).includes('NEVER_STORE'));assert.equal(verifiedPayment({...payment,receipt:{url:'javascript:alert(1)'}},order).receipt,null);
});
test('Duplicate confirmation reads successful provider result without another approval',async()=>{
 let approvals=0,writes=0;const g={lookup:async()=>payment,confirm:async()=>{approvals++;return payment;}};
 for(let n=0;n<3;n++)await confirmAndReconcile(order,g,async()=>{writes++;});assert.equal(approvals,0);assert.equal(writes,3);
});
test('Timed-out approval is reconciled by provider lookup',async()=>{
 let reads=0,approved=0;const g={lookup:async()=>++reads===1?{...payment,status:'IN_PROGRESS'}:payment,confirm:async()=>{approved++;throw Error('timeout');}};
 const stored=[];const result=await confirmAndReconcile(order,g,async p=>stored.push(p));assert.equal(result.status,'DONE');assert.equal(approved,1);assert.equal(stored.length,1);
});
test('Uncertain transaction is not falsely marked failed or paid',async()=>{
 let reads=0,writes=0;await assert.rejects(()=>confirmAndReconcile(order,{lookup:async()=>{if(++reads===1)return {...payment,status:'IN_PROGRESS'};throw Error('timeout');},confirm:async()=>{throw Error('timeout');}},async()=>{writes++;}),/payment_status_pending/);assert.equal(writes,0);
});
test('Approval and refund retries carry stable separate idempotency keys',async()=>{
 const requests=[];const g=createTossGateway('test_sk_example',async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>payment};});
 await g.confirm(order);await g.confirm(order);await g.cancel({...order,reason:'테스트 환불'});assert.equal(requests[0].options.headers['Idempotency-Key'],requests[1].options.headers['Idempotency-Key']);assert.notEqual(requests[0].options.headers['Idempotency-Key'],requests[2].options.headers['Idempotency-Key']);assert.equal(JSON.parse(requests[0].options.body).amount,35000);
});
