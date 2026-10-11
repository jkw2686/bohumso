import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setupSupport,ids} from './support-integration-fixture.mjs';

test('support chat: isolated persistence, access, states, receipts and read cursors',async t=>{
 const f=await setupSupport();
 const as=async(user,op,p={})=>{await f.login(user);return f.command(op,p);};
 const send=(user,op,p={})=>as(user,op,{request_key:crypto.randomUUID(),...p});
 const detail=id=>as(ids.admin,'admin_detail',{id});
 let customer,planner;
 try{
 await f.owner('select 1');await f.db.exec(await readFile('supabase/060_support_chat.sql','utf8'));
 await t.test('consumer and planner first message and single receipt; optional category; actor derived on server',async()=>{
  customer=(await send(ids.customer,'create',{body:'소비자 화면 문의',role:'planner',sender:'operator'})).id;
  planner=(await send(ids.planner,'create',{body:'프로필 화면 문의',topic:'profile'})).id;
  for(const [id,role]of [[customer,'consumer'],[planner,'planner']]){const r=await detail(id);assert.equal(r.role,role);assert.equal(r.chat_state,'WAITING');assert.equal(r.messages.length,2);assert.equal(r.messages[0].sender,'customer');assert.equal(r.messages[1].sender,'automatic');assert.equal(r.messages[1].receipt_notice,true);}
  assert.equal((await detail(customer)).topic,null);
 });
 await t.test('failed first message rolls back; retries and lost response return same receipt',async()=>{
  const before=await as(ids.customer,'mine');await assert.rejects(send(ids.customer,'create',{body:' ',topic:'error'}),/invalid_support_message/);
  await assert.rejects(send(ids.customer,'create',{body:'질문',topic:'unknown'}),/invalid_support_topic/);
  assert.equal((await as(ids.customer,'mine')).length,before.length);
  const p={body:'중복 문의 확인',request_key:crypto.randomUUID()};await f.login(ids.customer);
  const [a,b]=await Promise.all([f.command('create',p),f.command('create',p)]);assert.equal(a.id,b.id);
  assert.deepEqual(await f.command('receipt',{request_key:p.request_key}),a);
  assert.equal((await f.command('detail',{id:a.id})).messages.length,2);
  assert.equal(await as(ids.other,'receipt',{request_key:p.request_key}),null);
  await assert.rejects(as(ids.customer,'create',{...p,body:'다른 내용'}),/request_key_conflict/);
 });
 await t.test('cross-account ids, admin operations, direct tables and spoofed state are blocked',async()=>{
  for(const user of [ids.other,ids.planner]){
   await assert.rejects(as(user,'detail',{id:customer}),/request_forbidden/);
   await assert.rejects(send(user,'message',{id:customer,body:'차단 확인'}),/request_forbidden/);
   await assert.rejects(as(user,'read',{id:customer,message_id:1}),/request_forbidden/);
   for(const op of ['admin_list','admin_detail','take','reply','note','state','admin_read'])await assert.rejects(send(user,op,{id:customer}),/admin_required/);
  }
  await f.login(ids.customer);for(const table of ['support_threads','support_messages','support_reads','support_receipts','support_chat_backup'])await assert.rejects(f.db.query('select * from private.'+table),/permission denied/);
  await f.login(null,'anon');await assert.rejects(f.command('mine'),/permission denied/);
 });
 await t.test('opening does not claim review; taking does; internal notes are absent from customer payload',async()=>{
  let r=await detail(customer);assert.equal(r.chat_state,'WAITING');
  await send(ids.admin,'take',{id:customer,revision:r.revision});r=await detail(customer);assert.equal(r.chat_state,'REVIEWING');
  await send(ids.admin,'note',{id:customer,revision:r.revision,body:'내부전용메모'});
  const mine=await as(ids.customer,'detail',{id:customer});assert(!JSON.stringify(mine).includes('내부전용메모'));assert(!('review_reason'in mine));
  assert.equal((await as(ids.customer,'unread')).count,0);
 });
 await t.test('operator request for information and reply state differ from closure; additional questions reopen waiting',async()=>{
  let r=await detail(customer);await send(ids.admin,'reply',{id:customer,revision:r.revision,body:'어떤 화면인지 알려 주세요.',state:'WAITING_CUSTOMER'});
  r=await as(ids.customer,'detail',{id:customer});assert.equal(r.chat_state,'WAITING_CUSTOMER');assert.equal(r.confirmed,false);assert.equal(r.unread,true);
  await send(ids.customer,'message',{id:customer,body:'지도 화면입니다.',state:'CLOSED',sender:'operator'});
  r=await detail(customer);assert.equal(r.chat_state,'WAITING');assert.equal(r.messages.at(-1).sender,'customer');
  await send(ids.admin,'reply',{id:customer,revision:r.revision,body:'화면을 확인했습니다.',state:'ANSWERED'});
  assert.equal((await detail(customer)).chat_state,'ANSWERED');assert.equal((await detail(customer)).confirmed,false);
 });
 await t.test('read is separate from status and bounded to observed messages; newer replies stay unread',async()=>{
  let r=await as(ids.customer,'detail',{id:customer});const observed=r.last_id;
  assert.equal((await as(ids.customer,'unread')).count,1);
  await send(ids.admin,'reply',{id:customer,revision:r.revision,body:'추가로 확인한 내용입니다.'});
  await as(ids.customer,'read',{id:customer,message_id:observed});assert.equal((await as(ids.customer,'unread')).count,1);
  r=await as(ids.customer,'detail',{id:customer});await as(ids.customer,'read',{id:customer,message_id:r.last_id});
  assert.equal((await as(ids.customer,'unread')).count,0);assert.equal((await as(ids.customer,'detail',{id:customer})).chat_state,'ANSWERED');
  await as(ids.customer,'read',{id:customer,message_id:observed});assert.equal((await as(ids.customer,'unread')).count,0);
  const foreign=(await detail(planner)).last_id;await assert.rejects(as(ids.customer,'read',{id:customer,message_id:foreign}),/invalid_read_cursor/);
 });
 await t.test('concurrent ordering cannot mark a fresh question answered; same reply key posts once',async()=>{
  const r=await detail(customer);await send(ids.customer,'message',{id:customer,body:'새 질문입니다.'});
  await assert.rejects(send(ids.admin,'reply',{id:customer,revision:r.revision,body:'이전 화면 답변'}),/stale_request/);
  const latest=await detail(customer);const p={id:customer,revision:latest.revision,body:'최신 질문 확인 답변',request_key:crypto.randomUUID()};
  await as(ids.admin,'reply',p);await as(ids.admin,'reply',p);
  assert.equal((await detail(customer)).messages.filter(m=>m.body===p.body).length,1);
  await send(ids.customer,'message',{id:customer,body:'답변 뒤 추가 질문'});assert.equal((await detail(customer)).chat_state,'WAITING');
 });
 await t.test('customer solution confirmation, operator explicit close, and same-thread reopen',async()=>{
  let r=await as(ids.customer,'detail',{id:customer});await send(ids.customer,'resolve',{id:customer,revision:r.revision});assert.equal((await detail(customer)).chat_state,'CLOSED');
  await send(ids.customer,'message',{id:customer,body:'종료 뒤 추가 문의'});r=await detail(customer);assert.equal(r.chat_state,'WAITING');assert.equal(r.reopened_count,1);
  await send(ids.admin,'state',{id:customer,revision:r.revision,state:'CLOSED'});r=await detail(customer);assert.equal(r.chat_state,'CLOSED');assert.equal(r.confirmed,false);
  await send(ids.admin,'state',{id:customer,revision:r.revision,state:'REVIEWING'});assert.equal((await detail(customer)).chat_state,'REVIEWING');
  assert.equal((await detail(customer)).messages.filter(m=>m.receipt_notice).length,1);
  r=await as(ids.planner,'detail',{id:planner});await assert.rejects(send(ids.planner,'resolve',{id:planner,revision:r.revision}),/support_answer_required/);
 });
 await t.test('old unanswered inquiry priority, admin unread, filters and release',async()=>{
  let r=await detail(planner);assert.equal(r.unread,true);await as(ids.admin,'admin_read',{id:planner,message_id:r.last_id});r=await detail(planner);assert.equal(r.unread,false);assert.equal(r.chat_state,'WAITING');
  await f.owner("update private.support_threads set waiting_since=now()-interval '3 days' where request_id=$1",[planner]);
  const list=await as(ids.admin,'admin_list');assert.equal(list[0].id,planner);assert(!('messages'in list[0]));
  assert((await as(ids.admin,'admin_list',{state:'WAITING'})).every(x=>x.chat_state==='WAITING'));
  r=await detail(customer);await send(ids.admin,'release',{id:customer,revision:r.revision,confirmed:true});assert.equal((await detail(customer)).chat_state,'WAITING');
 });
 await t.test('only receipt automation, migration replay, rollback and replay preserve messages',async()=>{
  await f.owner('select 1');await assert.rejects(f.db.query('select private.support_ai_start($1,$2)',[customer,crypto.randomUUID()]),/automatic_response_paused/);
  const before=await detail(customer);await f.owner('select 1');await f.db.exec(await readFile('supabase/060_support_chat.sql','utf8'));
  assert.deepEqual((await detail(customer)).messages,before.messages);assert.equal((await detail(customer)).chat_state,before.chat_state);
  await f.owner('select 1');await f.db.exec(await readFile('supabase/rollback_support_chat.sql','utf8'));assert.equal((await as(ids.customer,'capabilities')).version,1);
  await f.owner('select 1');await f.db.exec(await readFile('supabase/060_support_chat.sql','utf8'));assert.equal((await as(ids.customer,'capabilities')).version,2);
  assert.deepEqual((await detail(customer)).messages,before.messages);
 });
 }finally{await f.db.close();}
});
