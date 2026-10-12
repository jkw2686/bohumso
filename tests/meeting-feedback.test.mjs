import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {setupFeedback,ids,consentVersion,taxId,day} from './meeting-feedback-fixture.mjs';
test('private two-sided answers, optional public scores, one meeting one aggregate and no sanctions',async()=>{
 const f=await setupFeedback();try{
  const id=await f.complete();await f.approvedTax();const previousOrder=(await f.summary()).legacy_rating_order;await f.login(ids.customer);
  assert.equal((await f.feedback('get',{id})).mine,null);
  let response=await f.save(id,{rating:5});assert.equal(response.mine.public_consent,false);assert.equal((await f.summary()).feedback_summary.count,0);
  await f.login(ids.customer);response=await f.save(id,{initiator:'expert',timing:'after'});assert.equal(response.mine.rating,null);
  await f.login(ids.planner);const peer=await f.feedback('get',{id});assert.equal(peer.mine,null);assert.equal(peer.responses,null);assert.equal(peer.check,null);assert.ok(!JSON.stringify(await f.row(id,'partner')).includes('expert_initiated'));
  await f.save(id,{help_status:'done',initiator:'none'});await assert.rejects(f.save(id,{rating:1}),/feedback_forbidden/);
  await f.login(ids.admin);let checks=await f.feedback('admin_list');assert.equal(checks.length,1);assert.deepEqual(checks[0].check.flags,['expert_initiated','mismatch']);assert.equal(checks[0].responses.consumer.timing,'after');
  await f.feedback('admin_review',{id,revision:checks[0].check.revision,status:'reviewed',note:'당사자 설명을 확인할 다음 조치를 기록합니다'});assert.equal((await f.feedback('admin_list')).length,0);
  await f.login(ids.customer);response=await f.save(id,{rating:5,tags:['kind','clear'],public_consent:true,initiator:'expert',timing:'after'});
  const payload={id,revision:response.mine.revision-1,rating:5,tags:['clear','kind'],public_consent:true,consent_version:consentVersion,initiator:'expert',timing:'after'};
  assert.equal((await f.feedback('save',payload)).mine.revision,response.mine.revision);await assert.rejects(f.feedback('save',{...payload,rating:4}),/feedback_stale/);
  let p=await f.summary();assert.equal(p.rating,null);assert.equal(p.legacy_rating_order,previousOrder);assert.deepEqual(p.reviews,[]);assert.deepEqual(p.feedback_summary,{count:1,average:null,state:'collecting',tags:{kind:1,clear:1}});assert.ok(!JSON.stringify(p).includes('initiator'));
  await f.login(ids.admin);checks=await f.feedback('admin_list');assert.equal(checks.length,1);assert.ok(checks[0].check.flags.includes('expert_initiated'));
  await f.login(ids.customer);await f.save(id,{rating:1,public_consent:false,initiator:'expert',timing:'after'});assert.equal((await f.summary()).feedback_summary.count,0);
  const event=(await f.owner("select detail from private.feedback_events where meeting_id=$1 and event='response_saved' order by id desc limit 1",[id]))[0].detail;assert.equal(event.public_consent,false);assert.equal(event.previous_public_consent,true);assert.equal(event.previous_consent_version,consentVersion);
  await f.login(ids.customer);await f.save(id,{initiator:'unknown'});await f.login(ids.planner);await f.save(id,{help_status:'ongoing',initiator:'customer',timing:'during'});await f.login(ids.admin);assert.deepEqual((await f.feedback('admin_list'))[0].check.flags,[]);
  await f.login(null,'anon');await assert.rejects(f.feedback('get',{id}),/permission denied/);
  await f.login(ids.other);await assert.rejects(f.feedback('get',{id}),/feedback_forbidden/);await assert.rejects(f.feedback('save',{id,revision:0,rating:5}),/feedback_forbidden/);await assert.rejects(f.feedback('admin_list'),/admin_required/);await assert.rejects(f.db.exec('select * from private.meeting_feedback'),/permission denied/);
  await f.owner('select 1');assert.equal((await f.db.query('select count(*)::int n from private.appointment_decisions')).rows[0].n,0);assert.equal((await f.db.query('select count(*)::int n from private.feedback_checks')).rows[0].n,1);
 }finally{await f.db.close();}
});
test('completion eligibility, legacy deduplication, threshold remains unset, edits and schedule changes do not create votes',async()=>{
 const f=await setupFeedback();try{
  const pending=await f.booking(3);await assert.rejects(f.save(pending,{rating:5}),/meeting_not_completed/);
  await f.owner("update private.consultations set state='completed',completed_at=now() where id=$1",[pending]);await f.login(ids.customer);await assert.rejects(f.save(pending,{rating:5}),/meeting_not_completed/);
  const id=await f.complete(4);await f.owner("insert into private.consultation_reviews(consultation_id,planner_id,rating,body,consent_version,visible) values($1,$2,2,'이전 공개 후기','review-public-v1',true)",[id,ids.planner]);
  let p=await f.summary();assert.equal(p.feedback_summary.count,1);assert.equal(p.feedback_summary.average,null);
  await f.login(ids.customer);await f.save(id,{rating:4,public_consent:true});assert.equal((await f.summary()).feedback_summary.count,1);
  await f.login(ids.customer);await assert.rejects(f.cmd('review',{id,revision:1,rating:5,body:'중복 후기',public_consent:true}),/use_meeting_feedback/);
  await f.save(id,{rating:1,public_consent:false});assert.equal((await f.summary()).feedback_summary.count,0);
  await f.login(ids.admin);for(const visible of [false,null,undefined])await assert.rejects(f.cmd('publish_review',{id,revision:(await f.row(id,'admin')).revision,visible,reason:'낮은 점수를 숨기기'}),/review_reason_required/);
  await f.login(ids.customer);await f.save(id,{rating:1,public_consent:true});const second=await f.complete(5);await f.save(second,{rating:5,public_consent:true,tags:['helpful']});
  p=await f.summary();assert.equal(p.feedback_summary.count,2);assert.equal(p.feedback_summary.average,null);
  await f.owner('update private.feedback_policy set minimum_public_count=2');p=await f.summary();assert.equal(p.feedback_summary.average,3);assert.equal(p.feedback_summary.state,'ready');
  await f.owner("update private.consultations set preferred_at=preferred_at+interval '1 day' where id=$1",[id]);assert.equal((await f.summary()).feedback_summary.count,2);
  await f.login(ids.customer);await f.save(id,{rating:5,public_consent:true});assert.equal((await f.summary()).feedback_summary.average,5);
  await f.owner(await readFile('supabase/065_meeting_feedback.sql','utf8'));assert.equal((await f.summary()).feedback_summary.count,2);
  await f.owner('select 1');await assert.rejects(f.db.exec(await readFile('supabase/rollback_meeting_feedback.sql','utf8')),/feedback_privacy_rollback_requires_review/);await f.db.exec('rollback');
  await f.login(ids.planner);await assert.rejects(f.feedback('save',{id,revision:0,rating:5,public_consent:true,consent_version:consentVersion}),/feedback_forbidden/);
  await assert.rejects(f.owner('update private.consultations set customer_id=planner_id where id=$1',[second]),/consultations_check/);
 }finally{await f.db.close();}
});
test('tax and non-claim scope, private problem text, visit completion requires consumer confirmation',async()=>{
 const f=await setupFeedback();try{
  const id=await f.complete();await f.owner("update private.consultations set purpose='coverage' where id=$1",[id]);await f.login(ids.customer);assert.equal((await f.feedback('get',{id})).protection,false);await assert.rejects(f.save(id,{initiator:'expert',timing:'after'}),/feedback_not_applicable/);await f.save(id,{rating:3,problem:'공유되면 안 되는 운영 확인 내용'});
  await f.login(ids.planner);await assert.rejects(f.save(id,{help_status:'done'}),/feedback_forbidden/);assert.ok(!JSON.stringify(await f.row(id,'partner')).includes('공유되면'));
  await f.approvedTax();await f.owner('update private.consultations set planner_id=$1 where id=$2',[taxId,id]);await f.login(ids.customer);assert.equal((await f.feedback('get',{id})).protection,false);
  const visit=crypto.randomUUID();await f.owner("insert into private.urgent_requests(id,customer_id,planner_id,request_key,area_id,purpose,place,phone,state,confirmed_at,preferred_at) values($1,$2,$3,gen_random_uuid(),'경기 분당','claim','격리 방문 장소','01000000000','COMPLETED',now()-interval '2 hours',now()-interval '1 hour')",[visit,ids.customer,ids.planner]);
  await f.login(ids.customer);assert.equal((await f.feedback('get',{kind:'visit',id:visit})).eligible,false);await assert.rejects(f.save(visit,{rating:5},'visit'),/meeting_not_completed/);await assert.rejects(f.feedback('confirm_visit',{kind:'visit',id:visit,met:false}),/feedback_forbidden/);
  await f.feedback('confirm_visit',{kind:'visit',id:visit,met:true});await f.save(visit,{rating:4,public_consent:true},'visit');assert.equal((await f.summary()).feedback_summary.count,1);
  await f.login(ids.other);await assert.rejects(f.feedback('get',{kind:'visit',id:visit}),/feedback_forbidden/);
  const rollback=await readFile('supabase/rollback_meeting_feedback.sql','utf8');await f.owner(rollback);await f.owner(rollback);await f.login(ids.customer);await assert.rejects(f.feedback('get',{kind:'visit',id:visit}),/permission denied/);await f.owner(await readFile('supabase/065_meeting_feedback.sql','utf8'));await f.login(ids.customer);assert.equal((await f.feedback('get',{kind:'visit',id:visit})).mine.rating,4);
 }finally{await f.db.close();}
});
