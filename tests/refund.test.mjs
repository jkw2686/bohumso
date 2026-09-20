import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {fixture,ids} from './commerce-fixture.mjs';
test('Refund requires expired exposure shortfall and platform evidence; stale callbacks never restore refunded ads',async()=>{
 const f=await fixture();try{
 await f.login(ids.admin);
 const p=(await f.rpc('ad_admin_command',['plan',{code:'regional_exclusive',amount:12000,period_days:1,guaranteed_impressions:2,enabled:true,reason:'TEST ONLY refund plan'}])).id;
 const slot=(await f.rpc('ad_admin_command',['slot',{code:'regional_exclusive',region:'서울',enabled:true,reason:'TEST ONLY refund slot'}])).id;
 await f.login(ids.planner);const o=await f.rpc('ad_checkout',[p,slot,randomUUID(),true]);await f.rpc('ad_begin_confirm',[o.id,'refund_key',12000]);
 await f.login(ids.next);await assert.rejects(()=>f.rpc('ad_checkout',[p,slot,randomUUID(),true]),/slot_unavailable/);
 await f.login('','service_role');await f.rpc('ad_reconcile',[o.id,'refund_key',12000,'DONE']);
 const sid=(await f.rpc('ad_public_slots',['서울']))[0].subscription_id,event=randomUUID();await f.rpc('ad_record_impression',[sid,event]);await f.rpc('ad_record_impression',[sid,event]);
 await f.login(ids.planner);assert.equal((await f.rpc('ad_workspace')).subscriptions[0].impressions,1);await assert.rejects(()=>f.rpc('ad_record_impression',[sid,randomUUID()]),/permission denied/);
 await assert.rejects(()=>f.rpc('ad_refund_request',[o.id,'fake fault claim',true]),/refund_evidence_required/);
 await f.login(ids.admin);await assert.rejects(()=>f.rpc('ad_refund_request',[o.id,'TEST platform shortfall',true]),/refund_not_eligible/);
 await f.db.exec('reset role');await f.db.query("update private.ad_subscriptions set starts_at=now()-interval '2 days',ends_at=now()-interval '1 day' where id=$1",[sid]);
 await f.login('','service_role');assert.equal((await f.rpc('ad_public_slots',['서울'])).length,0);await f.rpc('ad_record_impression',[sid,randomUUID()]);
 await f.login(ids.admin);assert.equal((await f.rpc('ad_workspace')).subscriptions[0].impressions,1);
 await assert.rejects(()=>f.rpc('ad_refund_request',[o.id,'TEST platform shortfall',false]),/refund_evidence_required/);
 await f.rpc('ad_refund_request',[o.id,'TEST verified platform shortfall',true]);await f.login('','service_role');await f.rpc('ad_refund_failure',[o.id]);
 await f.rpc('ad_reconcile',[o.id,'refund_key',12000,'DONE']);await f.rpc('ad_reconcile',[o.id,'refund_key',12000,'EXPIRED']);
 await f.login(ids.admin);assert.equal((await f.rpc('ad_user_order',[o.id])).state,'refund_failed');await f.rpc('ad_refund_request',[o.id,'TEST retry original refund',true]);
 await f.login('','service_role');await f.rpc('ad_reconcile',[o.id,'refund_key',12000,'CANCELED']);await f.rpc('ad_reconcile',[o.id,'refund_key',12000,'DONE']);
 await f.login(ids.planner);const refunded=await f.rpc('ad_user_order',[o.id]);assert.equal(refunded.state,'refunded');assert.equal(refunded.refunded_won,12000);
 await f.login('','anon');const visitor=randomUUID();await f.rpc('record_visit_session',[visitor]);await f.rpc('record_visit_session',[visitor]);await assert.rejects(()=>f.rpc('consultation_metrics'),/permission denied/);
 await f.login(ids.admin);assert.equal((await f.rpc('consultation_metrics')).visit_sessions,1);
 }finally{await f.db.close();}
});
test('Exposure target satisfied prevents shortfall refund; expired unpaid holds release exclusive slot',async()=>{
 const f=await fixture();try{
 await f.login(ids.admin);const p=(await f.rpc('ad_admin_command',['plan',{code:'regional_exclusive',amount:12000,period_days:1,guaranteed_impressions:1,enabled:true,reason:'TEST ONLY exposure'}])).id;
 const slot=(await f.rpc('ad_admin_command',['slot',{code:'regional_exclusive',region:'경기',enabled:true,reason:'TEST ONLY exposure'}])).id;
 await f.login(ids.planner);const abandoned=await f.rpc('ad_checkout',[p,slot,randomUUID(),true]);
 await f.db.exec('reset role');await f.db.query("update private.ad_subscriptions set hold_until=now()-interval '1 hour' where order_id=$1",[abandoned.id]);
 await f.login(ids.planner);await assert.rejects(()=>f.rpc('ad_begin_confirm',[abandoned.id,'expired',12000]),/order_expired/);
 await f.login(ids.next);const o=await f.rpc('ad_checkout',[p,slot,randomUUID(),true]);await f.rpc('ad_begin_confirm',[o.id,'satisfied',12000]);
 await f.login('','service_role');await f.rpc('ad_reconcile',[o.id,'satisfied',12000,'DONE']);const sid=(await f.rpc('ad_public_slots',['경기']))[0].subscription_id;await f.rpc('ad_record_impression',[sid,randomUUID()]);
 await f.db.exec('reset role');await f.db.query("update private.ad_subscriptions set ends_at=now()-interval '1 hour' where id=$1",[sid]);
 await f.login(ids.admin);await assert.rejects(()=>f.rpc('ad_refund_request',[o.id,'TEST platform responsibility',true]),/refund_not_eligible/);
 }finally{await f.db.close();}
});
