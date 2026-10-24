import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {setupProfessions,ids,day} from './profession-fixture.mjs';
test('promotion on existing profession/booking schema preserves selected expert and customer final confirmation',async()=>{const f=await setupProfessions();try{
 await f.db.exec('reset role');await f.db.exec(await readFile('supabase/074_same_time_confirmation.sql','utf8'));await f.db.exec(await readFile('supabase/076_promotion_invites.sql','utf8'));await f.db.exec(await readFile('supabase/077_customer_final_confirmation.sql','utf8'));
 await f.login(ids.admin);const invite=await f.rpc('promotion_command',['create',{free_days:90,capacity:10,deadline:new Date(Date.now()+86400000).toISOString()}]);
 await f.login(ids.customer);const benefit=await f.rpc('promotion_command',['redeem',{token:invite.token}]);assert.equal(benefit.applied,true);
 // Same selected expert and original slot through request -> expert acceptance -> customer confirmed detail.
 const payload={planner_id:ids.planner,purpose:'claim',region:'경기 분당',method:'phone',preferred_at:day(3)+'T14:00:00+09:00',request_key:crypto.randomUUID(),confirmation_version:'same-time-v1',name:'격리 고객',share_consent:true};
 const {id}=await f.cmd('request',payload);assert.equal((await f.row(id)).planner_id,ids.planner);await f.login(ids.planner);assert.equal((await f.row(id,'partner')).contact,null);
 await f.cmd('accept',{id,revision:(await f.row(id,'partner')).revision});assert.equal((await f.row(id,'partner')).state,'coordinating');await f.login(ids.customer);await f.cmd('confirm',{id,revision:(await f.row(id)).revision,care_revision:(await f.get(id)).revision,name:'격리 고객',share_consent:true});
 await f.login(ids.customer);assert.equal((await f.row(id)).state,'scheduled');
 await f.login(ids.other);await assert.rejects(f.cmd('accept',{id,revision:1}));
 await f.login(ids.admin);const members=await f.rpc('promotion_command',['members',{id:invite.id}]);assert.equal(members.length,1);assert.equal(members[0].ends_at,benefit.ends_at);
 }finally{await f.db.close();}});
