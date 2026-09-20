import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,ids} from './commerce-fixture.mjs';
test('No expiry reassignment, slot conflict, followup no-charge, refund isolation and stale revisions',async()=>{
 const {db,rpc,login,cmd,row,slot}=await fixture();try{
 await login(ids.customer);const create=async(n,automatic=false)=>(await cmd('request',{purpose:'claim',region:'서울 마포구',method:'scheduled',preferred_at:slot(n),planner_id:automatic?null:ids.planner,automatic})).id;
 const direct=await create(0);
 await db.exec('reset role');
 await db.query("update private.consultations set response_deadline=now()-interval '1 minute' where id=$1",[direct]);
 assert.equal((await db.query("select count(*)::int n from pg_proc where proname in ('rank_planners','offer_next','expire_consultation_offers')")).rows[0].n,0);
 await login(ids.customer);assert.equal((await row(direct)).planner_id,ids.planner);
 const first=await create(1),same=await create(1);
 for(const id of [first,same]){await login(ids.planner);await cmd('accept',{id,revision:1});}
 await login(ids.customer);const confirm=id=>cmd('confirm',{id,revision:2,name:'가상 고객',phone:'01011112222',share_consent:true});await confirm(first);await assert.rejects(()=>confirm(same),/consultation_slot/);
 await login(ids.planner);
 await assert.rejects(()=>cmd('propose',{id:first,revision:1,preferred_at:slot(4)}),/stale_request/);
 await db.exec('reset role');await db.query("update private.consultations set preferred_at=now()-interval '1 hour' where id=$1",[first]);
 await login(ids.planner);await cmd('complete_request',{id:first,revision:(await row(first,'partner')).revision});
 await db.exec('reset role');await db.query("update private.consultations set completion_requested_at=now()-interval '3 days' where id=$1",[first]);
 await login(ids.admin);assert.equal((await rpc('consultation_workspace',['admin'])).bookings.find(b=>b.id===first).needs_admin_review,true);
 await assert.rejects(async()=>cmd('complete_confirm',{id:first,revision:(await row(first,'admin')).revision}),/invalid_transition/);
 await login(ids.customer);await cmd('complete_confirm',{id:first,revision:(await row(first)).revision});await cmd('review',{id:first,revision:(await row(first)).revision,rating:5,body:'가상 상담 체험 후기',public_consent:true});await login(ids.admin);await cmd('publish_review',{id:first,revision:(await row(first,'admin')).revision,reason:'민감정보 없는 가상 후기 확인',visible:true});await login(ids.customer);assert.equal((await rpc('planner_catalog',['서울','claim'])).planners.find(p=>p.id===ids.planner).reviews.length,1);await cmd('followup_propose',{id:first,revision:(await row(first)).revision,preferred_at:slot(5)});let booking=await row(first);assert.equal(booking.followups.length,1);
 await login(ids.planner);await cmd('followup_confirm',{id:first,revision:(await row(first,'partner')).revision,followup_id:booking.followups[0].id});assert.equal((await row(first,'partner')).orders,undefined);
 await login(ids.customer);await cmd('issue',{id:first,category:'dispute',reason:'가상 이의 제기'});await login(ids.planner);assert.equal((await row(first,'partner')).state,'dispute');
 await login(ids.admin);await rpc('review_partner',[ids.planner,'suspended','검토 중 테스트']);await login(ids.planner);assert.ok((await rpc('consultation_workspace',['partner'])).bookings.length>0);assert.equal((await row(first,'partner')).contact,null);
 }finally{await db.close();}
});
