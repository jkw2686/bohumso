import {test} from 'node:test';import assert from 'node:assert/strict';
import payment from '../artifacts/functions/payment.js';import webhook from '../artifacts/functions/payment-webhook.js';
test('Public payment endpoints reject disabled/live config, bad origins and anonymous users without contacting PG',async()=>{
 const before=globalThis.Netlify,oldFetch=globalThis.fetch;let calls=0;const values={};globalThis.Netlify={env:{get:key=>values[key]}};globalThis.fetch=async()=>{calls++;throw Error('network_not_allowed');};
 try{
  const request=(body={},origin='http://localhost:3100')=>new Request('http://localhost:3100/api/payment',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
  assert.equal((await payment(new Request('http://localhost:3100/api/payment'))).status,405);
  assert.equal((await payment(request())).status,503);
  Object.assign(values,{PAYMENTS_ENABLED:'true',TOSS_MODE:'live',TOSS_CLIENT_KEY:'live_ck_x',TOSS_SECRET_KEY:'live_sk_x',APP_ORIGIN:'http://localhost:3100'});assert.equal((await payment(request())).status,503);
  Object.assign(values,{TOSS_MODE:'test',TOSS_CLIENT_KEY:'test_gck_x',TOSS_SECRET_KEY:'test_gsk_x'});assert.equal((await payment(request({},'https://untrusted.example'))).status,403);assert.equal((await payment(request())).status,401);
  assert.equal((await webhook(new Request('http://localhost:3100/api/payment-webhook',{method:'POST',body:JSON.stringify({data:{orderId:'unknown',status:'DONE',totalAmount:70000}})}))).status,200);
  assert.equal(calls,0);
 }finally{globalThis.fetch=oldFetch;globalThis.Netlify=before;}
});
