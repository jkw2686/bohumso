import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {fixture,ids} from './commerce-fixture.mjs';
test('Admin test orders are isolated, idempotent, permissioned, and do not approve planners or activate ads',async()=>{
 const {db,rpc,login}=await fixture();try{
 await db.exec('reset role');await db.exec(await readFile('supabase/010_admin_test_payments.sql','utf8'));
 const key='40000000-0000-4000-8000-000000000001';
 await login(ids.customer);await assert.rejects(rpc('admin_test_checkout',[key]),/request_forbidden/);
 await login(ids.admin);const o=await rpc('admin_test_checkout',[key]);assert.equal(o.amount,1000);assert.equal(o.test_admin,true);assert.equal((await rpc('admin_test_checkout',[key])).id,o.id);
 await assert.rejects(rpc('admin_test_begin_confirm',[o.id,'test_key',1]),/payment_mismatch/);
 await login(ids.other);await assert.rejects(rpc('admin_test_user_order',[o.id]),/request_forbidden/);
 await login(ids.admin);await rpc('admin_test_begin_confirm',[o.id,'test_key',1000]);
 await assert.rejects(rpc('admin_test_reconcile',[o.id,'test_key',1000,'DONE']),/permission denied/);
 await assert.rejects(rpc('admin_test_begin_confirm',[o.id,'different_key',1000]),/payment_key_conflict/);
 await login(ids.admin,'service_role');await rpc('admin_test_reconcile',[o.id,'test_key',1000,'DONE']);await rpc('admin_test_reconcile',[o.id,'test_key',1000,'DONE']);
 await rpc('admin_test_reconcile',[o.id,'test_key',1000,'CANCELED']);await rpc('admin_test_reconcile',[o.id,'test_key',1000,'DONE']);
 await login(ids.admin);assert.equal((await rpc('admin_test_orders'))[0].state,'refunded');assert.ok(!JSON.stringify(await rpc('admin_test_orders')).includes('test_key'));
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from private.ad_subscriptions')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from private.planner_directory where user_id=$1',[ids.admin])).rows[0].n,0);
 assert.equal((await db.query("select count(*)::int n from private.admin_test_payment_events where event='test_provider_DONE'")).rows[0].n,1);
 }finally{await db.close();}
});
