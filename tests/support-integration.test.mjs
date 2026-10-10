import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setupSupport,ids} from './support-integration-fixture.mjs';

test('isolated production support RPC: ownership, conversations, operator control and mock AI',async t=>{
 const f=await setupSupport();let consumer,expert;
 const as=async(id,op,p={})=>{await f.login(id);return f.command(op,p);};
 const mutate=async(id,op,p={})=>as(id,op,{request_key:crypto.randomUUID(),...p});
 const detail=id=>as(ids.admin,'admin_detail',{id});
 const aiStart=async(id,job=crypto.randomUUID())=>{await f.owner('update private.support_threads set ai_enabled=true where request_id=$1',[id]);await f.owner('select private.support_ai_start($1,$2)',[id,job]);return job;};
 const aiFinish=async(job,failed=false)=>(await f.owner('select private.support_ai_finish($1,$2,$3,$4) result',[job,'가상 안내: 문의 화면에서 내용을 확인할 수 있습니다.','가상 요약 · 예약 화면 문의',failed]))[0].result;
 try{
 await t.test('consumer and expert inquiries persist; original conversation is returned',async()=>{
  consumer=(await mutate(ids.customer,'create',{body:'가상 소비자 문의: 화면 이용이 어려워요.'})).id;
  expert=(await mutate(ids.planner,'create',{body:'가상 전문가 문의: 프로필 저장 확인'})).id;
  assert.equal((await as(ids.customer,'mine')).length,1);assert.equal((await as(ids.planner,'mine')).length,1);
  assert.equal((await as(ids.customer,'detail',{id:consumer})).messages[0].sender,'customer');
  assert.equal((await as(ids.admin,'admin_list')).length,2);
 });
 await t.test('failed validation has no false receipt; duplicate key executes once and rejects changed content',async()=>{
  await assert.rejects(mutate(ids.customer,'create',{body:'x'}),/invalid_support_message/);
  const data={body:'가상 중복 전송 확인',request_key:crypto.randomUUID()};const a=await as(ids.customer,'create',data),b=await as(ids.customer,'create',data);assert.equal(a.id,b.id);
  await assert.rejects(as(ids.customer,'create',{...data,body:'바뀐 문의 내용'}),/request_key_conflict/);
  assert.equal((await as(ids.customer,'mine')).length,2);
 });
 await t.test('other customer, expert, anonymous and direct-table access are denied',async()=>{
  for(const id of [ids.other,ids.planner]){await assert.rejects(as(id,'detail',{id:consumer}),/request_forbidden/);await assert.rejects(mutate(id,'message',{id:consumer,body:'접근 불가'}),/request_forbidden/);await assert.rejects(as(id,'admin_list'),/admin_required/);await assert.rejects(as(id,'metrics'),/admin_required/);}
  await f.login(null,'anon');await assert.rejects(f.command('mine'),/permission denied/);
  await f.login(ids.customer);for(const table of ['support_threads','support_messages','support_receipts','support_ai_runs'])await assert.rejects(f.db.query('select * from private.'+table),/permission denied/);
  await assert.rejects(f.db.query('select private.support_ai_start($1,$2)',[consumer,crypto.randomUUID()]),/permission denied/);
 });
 await t.test('follow-ups stay on the same ticket and old unanswered inquiries stay first',async()=>{
  const prior=await detail(consumer);await mutate(ids.customer,'message',{id:consumer,body:'검토 중 추가로 남기는 가상 메시지'});
  const after=await detail(consumer);assert.equal(after.messages.length,2);assert.equal(after.waiting_since,prior.waiting_since);assert.equal((await as(ids.admin,'admin_list'))[0].id,consumer);
 });
 await t.test('operator ownership required; notes private; replies visible on fresh session; silence does not resolve',async()=>{
  let r=await detail(consumer);await assert.rejects(mutate(ids.admin,'reply',{id:consumer,revision:r.revision,body:'가상 답변'}),/support_take_required/);
  await mutate(ids.admin,'take',{id:consumer,revision:r.revision});r=await detail(consumer);
  await mutate(ids.admin,'note',{id:consumer,revision:r.revision,body:'운영자 전용 가상 메모'});r=await detail(consumer);
  const p={id:consumer,revision:r.revision,body:'가상 운영자 답변: 내용을 확인했습니다.',request_key:crypto.randomUUID()};await as(ids.admin,'reply',p);await as(ids.admin,'reply',p);
  const mine=await as(ids.customer,'detail',{id:consumer});assert.equal(mine.messages.filter(m=>m.sender==='operator').length,1);assert(!JSON.stringify(mine).includes('운영자 전용'));assert(!('review_reason' in mine));assert.equal(mine.confirmed,false);
  assert.equal((await detail(consumer)).messages.filter(m=>m.sender==='note').length,1);
 });
 await t.test('stale revision cannot overwrite an operator reply and drafts can be retried after refresh',async()=>{
  const r=await detail(consumer);await mutate(ids.customer,'message',{id:consumer,body:'답변을 쓰는 동안의 추가 메시지'});
  await assert.rejects(mutate(ids.admin,'reply',{id:consumer,revision:r.revision,body:'오래된 화면의 답변'}),/stale_request/);
 });
 await t.test('only customer confirms resolution; new follow-up reopens the original inquiry',async()=>{
  let r=await as(ids.customer,'detail',{id:consumer});await mutate(ids.customer,'resolve',{id:consumer,revision:r.revision});assert.equal((await detail(consumer)).confirmed,true);
  await mutate(ids.customer,'message',{id:consumer,body:'해결 후 다시 확인할 내용'});r=await detail(consumer);assert.equal(r.confirmed,false);assert.equal(r.reopened_count,1);
 });
 await t.test('takeover invalidates an in-flight mock AI response, even after operator reply and release',async()=>{
  const job=await aiStart(expert);let r=await detail(expert);await mutate(ids.admin,'take',{id:expert,revision:r.revision});r=await detail(expert);
  await mutate(ids.admin,'reply',{id:expert,revision:r.revision,body:'가상 운영자 응답'});r=await detail(expert);
  await assert.rejects(mutate(ids.admin,'release',{id:expert,revision:r.revision}),/confirmation_required/);
  await mutate(ids.admin,'release',{id:expert,revision:r.revision,confirmed:true});assert.equal((await aiFinish(job)).state,'discarded');assert.equal((await aiFinish(job)).state,'discarded');
  assert.equal((await detail(expert)).messages.filter(m=>m.sender==='automatic').length,0);
 });
 await t.test('a different ticket continues; mock response posted once; AI resolution requires customer confirmation',async()=>{
  const job=await aiStart(expert);assert.equal((await aiFinish(job)).state,'published');assert.equal((await aiFinish(job)).state,'published');assert.equal((await detail(expert)).messages.filter(m=>m.sender==='automatic').length,1);
  assert.equal((await as(ids.admin,'metrics')).customerConfirmedAI,0);
  const r=await as(ids.planner,'detail',{id:expert});await mutate(ids.planner,'resolve',{id:expert,revision:r.revision});const metrics=await as(ids.admin,'metrics');assert.equal(metrics.customerConfirmedAI,1);assert.equal(metrics.knownCostUSD,null);assert.equal(metrics.operatorActiveSeconds,null);assert(metrics.unknownCostRuns>0);
 });
 await t.test('AI failure preserves intake/history and transitions to operator review without invented success',async()=>{
  const job=await aiStart(consumer).catch(async()=>{let r=await detail(consumer);await mutate(ids.admin,'release',{id:consumer,revision:r.revision,confirmed:true});return aiStart(consumer);});
  assert.equal((await aiFinish(job,true)).state,'failed');const r=await detail(consumer);assert.match(r.review_reason,/오류/);assert(r.messages.length>0);
  await mutate(ids.customer,'message',{id:consumer,body:'자동안내 장애 중 남기는 가상 문의'});assert((await as(ids.customer,'detail',{id:consumer})).messages.some(m=>m.body.includes('장애 중')));
  await assert.rejects(mutate(ids.admin,'change_booking',{id:consumer}),/invalid_operation/);
 });
 await t.test('legacy inquiry, operator response and repeated migration remain compatible',async()=>{
  await f.login(ids.other);const legacy=await f.rpc('member_rights',['INQUIRY',{detail:'기존 화면에서 가상 문의'}]);assert.equal((await as(ids.other,'detail',{id:legacy.id})).detail,'기존 화면에서 가상 문의');
  const job=await aiStart(legacy.id);await f.login(ids.admin);await f.rpc('admin_member_rights',['respond',{id:legacy.id,status:'IN_PROGRESS',response:'이전 관리자 화면의 답변입니다.'}]);assert.equal((await aiFinish(job)).state,'discarded');assert.equal((await as(ids.other,'detail',{id:legacy.id})).messages[0].sender,'operator');
  const before=(await detail(consumer)).messages;await f.owner('select 1');await f.db.exec(await readFile('supabase/057_support_conversations.sql','utf8'));assert.deepEqual((await detail(consumer)).messages,before);
 });
 await t.test('related reservations are read-only and only an involved customer or expert can attach one',async()=>{
  const booking=(await f.owner("insert into private.consultations(customer_id,planner_id,purpose,region,method,preferred_at) values($1,$2,'claim','경기 분당','phone',now()+interval '2 days') returning *",[ids.customer,ids.planner]))[0];
  assert.equal((await as(ids.other,'reservations')).length,0);assert.equal((await as(ids.customer,'reservations'))[0].id,booking.id);assert.equal((await as(ids.planner,'reservations'))[0].id,booking.id);
  await assert.rejects(mutate(ids.other,'create',{body:'다른 사람 예약 번호로 가상 문의',consultation_id:booking.id}),/request_forbidden/);
  const inquiry=(await mutate(ids.planner,'create',{body:'본인에게 온 예약 관련 가상 문의',consultation_id:booking.id})).id;
  const r=await detail(inquiry);assert.equal(r.related.id,booking.id);assert(!('related' in await as(ids.planner,'detail',{id:inquiry})));
  const after=(await f.owner('select * from private.consultations where id=$1',[booking.id]))[0];assert.deepEqual(after,booking);
 });
 await t.test('simultaneous retries share a receipt; withdrawal is not repeated; no implicit completion',async()=>{
  await f.login(ids.next);const p={request_key:crypto.randomUUID(),body:'가상 탈퇴 요청',kind:'WITHDRAW',confirmed:true};
  const [a,b]=await Promise.all([f.command('create',p),f.command('create',p)]);assert.equal(a.id,b.id);
  assert.equal((await f.owner("select count(*)::integer n from private.consent_records where user_id=$1 and source='account_withdrawal'",[ids.next]))[0].n,1);
  assert.equal((await detail(a.id)).confirmed,false);
 });
 await t.test('old unanswered tickets remain visible beyond a full page of new inquiries',async()=>{
  const old=(await f.owner("insert into private.member_rights_requests(user_id,kind,detail,created_at) values($1,'INQUIRY','오래된 가상 미답변',now()-interval '40 days') returning id",[ids.other]))[0].id;
  await f.owner("insert into private.member_rights_requests(user_id,kind,detail) select $1,'INQUIRY','페이지 확인용 가상 문의 '||n from generate_series(1,55) n",[ids.other]);
  const first=await as(ids.admin,'admin_list');assert.equal(first.length,50);assert.equal(first[0].id,old);assert((await as(ids.admin,'admin_list',{offset:50})).length>0);assert.equal((await detail(old)).confirmed,false);
 });
 await t.test('an operator correction after customer confirmation requires a new confirmation',async()=>{
  let r=await detail(expert);assert.equal(r.confirmed,true);await mutate(ids.admin,'take',{id:expert,revision:r.revision});r=await detail(expert);assert.equal(r.confirmed,true);
  await mutate(ids.admin,'reply',{id:expert,revision:r.revision,body:'가상 추가 확인 답변입니다.'});assert.equal((await detail(expert)).confirmed,false);
 });
 await t.test('rollback disables the new API without erasing conversations; reapply restores them',async()=>{
  const before=(await detail(consumer)).messages;await f.owner('select 1');await f.db.exec(await readFile('supabase/057_support_conversations_rollback.sql','utf8'));
  await f.login(ids.customer);await assert.rejects(f.command('mine'),/does not exist/);assert((await f.rpc('member_rights',['list'])).requests.length>0);
  await f.owner('select 1');await f.db.exec(await readFile('supabase/057_support_conversations.sql','utf8'));assert.deepEqual((await detail(consumer)).messages,before);
 });
 }finally{await f.db.close();}
});
