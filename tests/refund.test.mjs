import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,ids} from './commerce-fixture.mjs';
test('Refund retry, delayed success, dispute holds and payment permissions',async()=>{
 const {db,rpc,login,cmd,row,slot}=await fixture();try{
 await login(ids.admin);await cmd('policy',{free_meetings:0,total_won:70000,reason:'환불 테스트'});
 await login(ids.customer);const id=(await cmd('request',{planner_id:ids.planner,purpose:'other',region:'서울 마포구',method:'scheduled',preferred_at:slot()})).id;
 await login(ids.planner);await cmd('accept',{id,revision:1,policy_id:2,paid_consent:true});await login(ids.customer);await cmd('confirm',{id,revision:2,name:'가상 고객',phone:'01011112222',share_consent:true});
 await login(ids.planner);const o=await rpc('connection_checkout',[id,1]);await rpc('connection_begin_confirm',[o.id,'refund_key',35000]);
 await login(ids.customer);await cmd('issue',{id,category:'dispute',reason:'승인 중 가상 문제 신고'});
 await login('','service_role');await rpc('connection_reconcile',[o.id,'refund_key',35000,'DONE',null,'first']);
 await login(ids.planner);assert.equal((await row(id,'partner')).state,'dispute');await assert.rejects(()=>rpc('connection_checkout',[id,2]));await assert.rejects(()=>rpc('connection_refund_request',[o.id,'비관리자 환불 요청']));
 await login(ids.admin);await rpc('connection_refund_request',[o.id,'테스트 분쟁 확인 후 전액 환불']);
 await login('','service_role');await rpc('connection_refund_failure',[o.id]);
 await login(ids.admin);assert.equal((await row(id,'admin')).payment_state,'refund_failed');await rpc('connection_refund_request',[o.id,'테스트 환불 재확인']);
 await login('','service_role');await rpc('connection_reconcile',[o.id,'refund_key',35000,'CANCELED',null,'cancel']);await rpc('connection_reconcile',[o.id,'refund_key',35000,'DONE',null,'late']);
 await login(ids.planner);assert.equal((await row(id,'partner')).payment_state,'refunded');assert.equal((await row(id,'partner')).orders[0].refunded_won,35000);
 await login(ids.other);await assert.rejects(()=>rpc('connection_begin_confirm',[o.id,'refund_key',35000]),/request_forbidden/);await assert.rejects(()=>rpc('connection_order_lookup',[o.id]),/permission denied/);await assert.rejects(()=>rpc('connection_user_order',[o.id]),/request_forbidden/);await login(ids.planner);assert.equal((await rpc('connection_user_order',[o.id])).state,'refunded');
 await login('', 'anon');const visitor='90000000-0000-4000-8000-000000000001';await rpc('record_visit_session',[visitor]);await rpc('record_visit_session',[visitor]);await assert.rejects(()=>rpc('consultation_metrics'),/permission denied/);
 await login(ids.admin);assert.equal((await rpc('consultation_metrics')).visit_sessions,1);
 }finally{await db.close();}
});
