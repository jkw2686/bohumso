import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,ids} from './commerce-fixture.mjs';
test('Free allocation, immutable paid quote, two-stage ledger, consent and customer completion',async()=>{
 const f=await fixture();const {db,rpc,login,cmd,row,slot}=f;try{
 async function request(n){await login(ids.customer);return (await cmd('request',{planner_id:ids.planner,purpose:'claim',region:'서울 마포구',method:'scheduled',preferred_at:slot(n)})).id;}
 async function accept(id,paid=false){await login(ids.planner);const b=await row(id,'partner'),w=await rpc('consultation_workspace',['partner']);return cmd('accept',{id,revision:b.revision,policy_id:w.policy.id,paid_consent:paid});}
 async function confirm(id){await login(ids.customer);const b=await row(id);return cmd('confirm',{id,revision:b.revision,name:'가상 고객',phone:'01011112222',share_consent:true});}
 const a=await request(0),b=await request(1),c=await request(2);
 await accept(a);await confirm(a);await accept(b);await confirm(b);
 await login(ids.planner);let w=await rpc('consultation_workspace',['partner']);assert.equal(w.free_remaining,0);assert.equal(w.free_reserved,2);
 await assert.rejects(()=>rpc('connection_checkout',[a,1]),/free_no_payment/);
 await accept(c);await assert.rejects(()=>confirm(c),/planner_price_consent_required/);await accept(c,true);await confirm(c);
 assert.equal((await row(c)).total_won,70000);assert.equal((await row(c)).state,'confirmed');
 const before=await row(a);await cmd('cancel',{id:a,revision:before.revision});assert.equal((await row(c)).is_free,false);
 await login(ids.planner);assert.equal((await rpc('consultation_workspace',['partner'])).free_remaining,1);
 const order=await rpc('connection_checkout',[c,1]);assert.equal(order.amount,35000);assert.equal((await rpc('connection_checkout',[c,1])).id,order.id);
 await assert.rejects(()=>rpc('connection_checkout',[c,2]),/invalid_stage/);
 await assert.rejects(()=>rpc('connection_begin_confirm',[order.id,'test_payment_key',1]),/payment_mismatch/);
 await rpc('connection_begin_confirm',[order.id,'test_payment_key',35000]);
 await login(ids.customer);await assert.rejects(async()=>cmd('cancel',{id:c,revision:(await row(c)).revision}),/payment_in_progress/);
 await login(ids.planner);await assert.rejects(()=>rpc('connection_reconcile',[order.id,'test_payment_key',35000,'DONE',null,null]),/permission denied/);
 await login('', 'service_role');await rpc('connection_reconcile',[order.id,'test_payment_key',35000,'DONE','https://dashboard.tosspayments.com/receipt','test-transaction']);await rpc('connection_reconcile',[order.id,'test_payment_key',35000,'DONE',null,'test-transaction']);
 await login(ids.planner);let paid=await row(c,'partner');assert.equal(paid.first_paid,true);assert.equal(paid.state,'scheduled');await assert.rejects(()=>cmd('complete_confirm',{id:c,revision:paid.revision}),/invalid_transition/);
 await db.exec('reset role');await db.query("update private.consultations set preferred_at=now()-interval '1 hour' where id=$1",[c]);
 await login(ids.planner);await cmd('complete_request',{id:c,revision:(await row(c,'partner')).revision});
 await assert.rejects(()=>rpc('connection_checkout',[c,2]),/invalid_stage/);
 await login(ids.customer);await cmd('complete_confirm',{id:c,revision:(await row(c)).revision});assert.equal((await row(c)).payment_state,'balance_due');
 const extra=await request(3);await assert.rejects(()=>accept(extra,true),/balance_outstanding/);
 await login(ids.planner);const second=await rpc('connection_checkout',[c,2]);assert.equal(second.amount,35000);assert.notEqual(second.id,order.id);
 await rpc('connection_begin_confirm',[second.id,'test_second',35000]);await login('', 'service_role');await rpc('connection_reconcile',[second.id,'test_second',35000,'DONE',null,'second-tx']);
 await login(ids.customer);assert.equal((await row(c)).payment_state,'paid');
 await login(ids.other);assert.equal((await rpc('consultation_workspace',['customer'])).bookings.length,0);await assert.rejects(()=>cmd('cancel',{id:c,revision:1}));
 await login(ids.admin);await cmd('policy',{free_meetings:4,total_won:80000,reason:'신규 정책 테스트'});await login(ids.customer);assert.equal((await row(c)).total_won,70000);
 await login('', 'anon');const cat=await rpc('planner_catalog',['서울','claim']);assert.equal(cat.planners.length,2);assert.ok(cat.planners.every(p=>p.is_sample));assert.ok(cat.planners.every(p=>!p.phone));await assert.rejects(()=>rpc('consultation_workspace',['admin']));
 }finally{await db.close();}
});
test('Automatic matching pass, explicit choice isolation, no-show restoration and identity uniqueness',async()=>{
 const {db,rpc,login,cmd,row,slot}=await fixture();try{
 await login(ids.customer);const auto=(await cmd('request',{purpose:'claim',region:'서울 마포구',method:'phone',preferred_at:slot(),automatic:true})).id;let a=await row(auto);const first=a.planner_id;
 await login(first);await cmd('pass',{id:auto,revision:a.revision});assert.equal((await rpc('consultation_workspace',['partner'])).bookings.length,0);
 await login(ids.customer);a=await row(auto);assert.notEqual(a.planner_id,first);
 await login(a.planner_id);await cmd('pass',{id:auto,revision:a.revision});await login(ids.customer);assert.equal((await row(auto)).state,'unmatched');
 const direct=(await cmd('request',{planner_id:ids.planner,purpose:'claim',region:'서울 마포구',method:'scheduled',preferred_at:slot(1)})).id;
 await login(ids.planner);await cmd('pass',{id:direct,revision:(await row(direct,'partner')).revision});await login(ids.customer);assert.equal((await row(direct)).planner_id,null);assert.equal((await row(direct)).automatic,false);
 await login(ids.admin);await assert.rejects(()=>cmd('verify_planner',{planner_id:ids.next,identity_key:'TEST-REGISTRY-planner',evidence:'중복 등록 테스트',checked:true,is_sample:true}),/duplicate key/);await assert.rejects(()=>cmd('verify_planner',{planner_id:ids.next,checked:true}),/verification_required/);
 await login(ids.customer);const free=(await cmd('request',{planner_id:ids.planner,purpose:'claim',region:'서울 마포구',method:'nearby',preferred_at:slot(2)})).id;
 await login(ids.planner);await cmd('accept',{id:free,revision:1,policy_id:1,paid_consent:false});await login(ids.customer);await cmd('confirm',{id:free,revision:2,name:'가상 고객',phone:'01011112222',share_consent:true});
 await db.exec('reset role');await db.query("update private.consultations set preferred_at=now()-interval '1 hour' where id=$1",[free]);
 await login(ids.planner);await cmd('issue',{id:free,category:'no_show',reason:'테스트 미팅 미진행'});assert.equal((await rpc('consultation_workspace',['partner'])).free_reserved,1);
 await login(ids.admin);await cmd('resolve_issue',{id:free,outcome:'cancelled',reason:'고객과 설계사 확인 후 미완료 처리'});
 await login(ids.planner);assert.equal((await rpc('consultation_workspace',['partner'])).free_reserved,0);assert.equal((await rpc('consultation_workspace',['partner'])).free_remaining,2);
 await assert.rejects(()=>rpc('change_service_request',[free,'completed']),/permission denied/);
 }finally{await db.close();}
});

