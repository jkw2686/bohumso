import test from 'node:test';import assert from 'node:assert/strict';import {createPushHandler} from '../netlify/functions/reservation-push.mjs';import {dispatchReservationPush} from '../netlify/functions/reservation-push-dispatch.mjs';import {validSubscription} from '../netlify/functions/_shared/reservation-push.mjs';
import {genericBody,genericTitle} from '../netlify/functions/_shared/reservation-push.mjs';
const id='40000000-0000-4000-8000-000000000001',device='50000000-0000-4000-8000-000000000001',binding='60000000-0000-4000-8000-000000000001',notification='70000000-0000-4000-8000-000000000001';
const sub={endpoint:'https://fcm.googleapis.com/fcm/send/fixture',keys:{auth:Buffer.alloc(16,1).toString('base64url'),p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64,2)]).toString('base64url')}};
const env=k=>({RESERVATION_PUSH_ENABLED:'true',APP_ORIGIN:'https://bohumso.netlify.app',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-fixture',WEB_PUSH_VAPID_PUBLIC_KEY:'public-fixture',WEB_PUSH_VAPID_PRIVATE_KEY:'private-fixture',WEB_PUSH_SUBJECT:'mailto:test@example.test'}[k]);
test('push endpoint requires same origin, current member and saved subscription; rejects SSRF and forged subject',async()=>{
 const calls=[];const handler=createPushHandler({env,makeClient:()=>({auth:{getUser:async token=>token==='fixture'?{data:{user:{id}}}:{error:true}},rpc:async(name,args)=>{calls.push(args);return {data:{saved:true,active:true,binding}};}})});
 const post=(body,origin='https://bohumso.netlify.app',token='fixture')=>handler(new Request('https://bohumso.netlify.app/api/reservation-push',{method:'POST',headers:{origin,authorization:'Bearer '+token},body:JSON.stringify(body)}));
 const body={operation:'register',device_id:device,device_secret:'a'.repeat(64),binding,subscription:sub,subject:'someone-else'};
 assert.equal((await post(body,'https://evil.example')).status,403);assert.equal((await post(body,undefined,'bad')).status,401);assert.equal((await post({...body,subscription:{...sub,endpoint:'https://127.0.0.1/private'}})).status,400);assert.equal((await post(body)).status,200);assert.equal(calls[0].subject,id);assert.notEqual(calls[0].payload.device_hash,body.device_secret);assert.equal(calls.length,1);
 assert.equal(validSubscription({...sub,endpoint:'https://fcm.googleapis.com.evil.example/a'}),false);assert.equal(validSubscription({...sub,endpoint:'http://fcm.googleapis.com/a'}),false);
 const disabled=createPushHandler({env:()=>'',makeClient:()=>{throw Error('must not call');}});assert.equal((await disabled(new Request('https://fixture/api'))).status,200);
});
test('explicit stage copy and one finish failure do not stop another recipient',async()=>{
 for(const type of ['REQUESTED','ACCEPTED','PROPOSED','CHANGED','CONFIRMED','REJECTED','CANCELLED','COMPLETION_REQUESTED','COMPLETED','DEPARTED','ARRIVED','REMINDER']){assert.notEqual(genericTitle('BOOKING_'+type),'보험소 예약 알림');assert.ok(genericBody('BOOKING_'+type));}
 assert.match(genericBody('BOOKING_REQUESTED'),/확정 전/);assert.doesNotMatch(genericBody('BOOKING_ACCEPTED'),/예약이 확정/);
 let sent=0,finished=0;const data=await dispatchReservationPush({env,makeClient:()=>({rpc:async(_,{operation,payload})=>{
 if(operation==='claim')return {data:[{id,lease:device},{id:device,lease:id}]};
 if(operation==='authorize')return {data:{subscription:sub,binding,notificationId:notification,reservationId:device,type:'BOOKING_COMPLETED',body:'민감한 상담 내용'}};
 if(payload.id===id)return {error:true};finished++;return {data:{saved:true}};
 }}),send:async(_,payload)=>{assert.equal(payload.includes('민감한'),false);sent++;}});
 assert.equal(sent,2);assert.equal(finished,1);assert.equal(data.unrecorded,1);
});
test('worker separates saved booking from delivery; dedupe job leases, generic content and unknown outcomes',async()=>{
 for(const result of ['sent','gone','retry','unknown']){const calls=[],payloads=[];const r=await dispatchReservationPush({env,makeClient:()=>({rpc:async(name,args)=>{calls.push(args);return {data:args.operation==='claim'?[{id,lease:device}]:args.operation==='authorize'?{subscription:sub,binding,notificationId:notification,reservationId:device,type:'RESERVATION_REQUESTED',title:'do not leak private text'}:{saved:true}};}}),send:async(s,p)=>{payloads.push(JSON.parse(p));if(result==='gone')throw {statusCode:410};if(result==='retry')throw {statusCode:503};if(result==='unknown')throw Error('timeout');}});
 const finish=calls.find(x=>x.operation==='finish');assert.equal(finish.payload.state,{sent:'SENT',gone:'FAILED',retry:'RETRY',unknown:'UNKNOWN'}[result]);assert.equal(r.sent,result==='sent'?1:0);assert.equal(payloads[0].binding,binding);assert.equal(JSON.stringify(payloads).includes('private text'),false);assert.equal(calls.some(x=>x.operation==='request'),false);
 }
 const result=await dispatchReservationPush({env:()=>'',makeClient:()=>{throw Error('disabled');}});assert.equal(result.enabled,false);
});
