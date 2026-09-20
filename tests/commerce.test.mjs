import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {fixture,ids} from './commerce-fixture.mjs';
export async function plan(f,code='basic'){
 await f.login(ids.admin);
 const p=await f.rpc('ad_admin_command',['plan',{code,amount:12000,period_days:30,guaranteed_impressions:100,enabled:true,reason:'TEST ONLY fixture conditions'}]);
 const s=await f.rpc('ad_admin_command',['slot',{code,region:'서울 마포구',enabled:true,reason:'TEST ONLY fixture slot'}]);
 return {plan:p.id,slot:s.id};
}
test('Unconfigured plans cannot be bought; snapshot, ownership and idempotency protect prepaid subscriptions',async()=>{
 const f=await fixture();try{
 await f.login(ids.planner);const initial=await f.rpc('ad_workspace');assert.equal(initial.plans.length,3);assert.ok(initial.plans.every(p=>p.amount===null&&!p.enabled));
 const {plan:p,slot}=await plan(f);await f.login(ids.planner);const key=randomUUID();
 const o=await f.rpc('ad_checkout',[p,slot,key,true]);assert.equal(o.amount,12000);
 assert.equal((await f.rpc('ad_checkout',[p,slot,key,true])).id,o.id);
 await assert.rejects(()=>f.rpc('ad_checkout',[p,slot,randomUUID(),false]),/consent_required/);
 await assert.rejects(()=>f.rpc('ad_checkout',[p,slot,randomUUID(),true]),/slot_unavailable/);
 await assert.rejects(()=>f.rpc('ad_checkout',[initial.plans[0].id,slot,key,true]),/request_key_conflict/);
 await assert.rejects(()=>f.rpc('ad_begin_confirm',[o.id,'fixture',1]),/payment_mismatch/);
 await f.rpc('ad_begin_confirm',[o.id,'fixture',12000]);
 await assert.rejects(()=>f.rpc('ad_begin_confirm',[o.id,'different',12000]),/payment_key_conflict/);
 await assert.rejects(()=>f.rpc('ad_reconcile',[o.id,'fixture',12000,'DONE']),/permission denied/);
 await f.login(ids.other);await assert.rejects(()=>f.rpc('ad_user_order',[o.id]),/request_forbidden/);await assert.rejects(()=>f.rpc('ad_begin_confirm',[o.id,'fixture',12000]),/request_forbidden/);
 await f.login('','service_role');await f.rpc('ad_reconcile',[o.id,'fixture',12000,'DONE']);
 await f.login(ids.planner);const first=await f.rpc('ad_user_order',[o.id]);
 await f.login('','service_role');await f.rpc('ad_reconcile',[o.id,'fixture',12000,'DONE']);await f.rpc('ad_reconcile',[o.id,'fixture',12000,'EXPIRED']);
 await f.login(ids.planner);const again=await f.rpc('ad_user_order',[o.id]);assert.equal(again.state,'active');assert.equal(first.ends_at,again.ends_at);
 await f.login(ids.admin);await f.rpc('ad_admin_command',['plan',{code:'basic',amount:90000,period_days:60,guaranteed_impressions:900,enabled:true,reason:'TEST ONLY version change'}]);
 await f.login(ids.planner);assert.equal((await f.rpc('ad_user_order',[o.id])).amount,12000);
 await f.login('','anon');await assert.rejects(()=>f.rpc('ad_workspace'),/permission denied/);
 }finally{await f.db.close();}
});
test('Consultations remain free of billing through accept, confirm, completion, cancellation and dispute',async()=>{
 const f=await fixture();try{
 const {plan:p,slot}=await plan(f);await f.login(ids.planner);const o=await f.rpc('ad_checkout',[p,slot,randomUUID(),true]);
 const before=await f.rpc('ad_user_order',[o.id]);
 for(let i=0;i<3;i++){
 await f.login(ids.customer);const id=(await f.cmd('request',{planner_id:ids.planner,purpose:'claim',region:'서울 마포구',method:'scheduled',preferred_at:f.slot(i)})).id;
 await f.login(ids.planner);await f.cmd('accept',{id,revision:1});
 await f.login(ids.customer);await f.cmd('confirm',{id,revision:2,name:'가상 고객',phone:'01011112222',share_consent:true});
 assert.equal((await f.row(id)).state,'scheduled');assert.equal((await f.row(id)).payment_state,undefined);
 if(i===0){await f.db.exec('reset role');await f.db.query("update private.consultations set preferred_at=now()-interval '1 hour' where id=$1",[id]);
 await f.login(ids.planner);await f.cmd('complete_request',{id,revision:3});await assert.rejects(()=>f.cmd('complete_confirm',{id,revision:4}),/invalid_transition/);
 await f.login(ids.customer);await f.cmd('complete_confirm',{id,revision:4});}
 if(i===1)await f.cmd('cancel',{id,revision:3});
 if(i===2)await f.cmd('issue',{id,category:'dispute',reason:'테스트 문제 신고'});
 }
 await f.login(ids.planner);assert.deepEqual(await f.rpc('ad_user_order',[o.id]),before);
 await f.db.exec('reset role');assert.equal((await f.db.query("select count(*)::int n from pg_proc where proname like 'connection_%'")).rows[0].n,0);
 assert.equal((await f.db.query("select count(*)::int n from information_schema.columns where table_schema='private' and table_name='ad_subscriptions' and column_name in ('consultation_id','stage')")).rows[0].n,0);
 }finally{await f.db.close();}
});
test('Direct selection only, no reassignment, no-show resolution and identity uniqueness',async()=>{
 const f=await fixture();try{
 await f.login(ids.customer);const request={purpose:'claim',region:'서울 마포구',method:'phone',preferred_at:f.slot()};
 await assert.rejects(()=>f.cmd('request',{...request,automatic:true}),/select_planner/);
 await assert.rejects(()=>f.cmd('request',{...request,planner_id:ids.planner,automatic:true}),/automatic_not_allowed/);
 const id=(await f.cmd('request',{...request,planner_id:ids.planner})).id;await f.login(ids.planner);await f.cmd('pass',{id,revision:1});
 await f.login(ids.customer);assert.equal((await f.row(id)).planner_id,null);await assert.rejects(()=>f.cmd('rematch',{id,revision:2}),/unknown_operation/);
 await f.login(ids.next);assert.equal((await f.rpc('consultation_workspace',['partner'])).bookings.length,0);
 await f.login(ids.admin);await assert.rejects(()=>f.cmd('verify_planner',{planner_id:ids.next,identity_key:'TEST-REGISTRY-planner',evidence:'중복 등록 테스트',checked:true,is_sample:true}),/duplicate key/);
 await f.login(ids.customer);const b=(await f.cmd('request',{...request,planner_id:ids.planner,preferred_at:f.slot(1)})).id;
 await f.login(ids.planner);await f.cmd('accept',{id:b,revision:1});await f.login(ids.customer);await f.cmd('confirm',{id:b,revision:2,name:'가상 고객',phone:'01011112222',share_consent:true});
 await f.db.exec('reset role');await f.db.query("update private.consultations set preferred_at=now()-interval '1 hour' where id=$1",[b]);
 await f.login(ids.planner);await f.cmd('issue',{id:b,category:'no_show',reason:'가상 일정 미진행'});
 await f.login(ids.admin);await f.cmd('resolve_issue',{id:b,outcome:'cancelled',reason:'양측 확인 후 미완료 처리'});assert.equal((await f.row(b,'admin')).state,'cancelled');
 }finally{await f.db.close();}
});
