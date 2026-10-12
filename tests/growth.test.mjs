import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {setupGrowth,ids} from './growth-fixture.mjs';
import {dayKST,weekEnd,taskGroup,safeSource} from '../src/growth-model.mjs';
import {contentJobKey,prepareContent} from '../src/growth-pipeline.mjs';
import {releaseSQL} from '../scripts/build-support-growth-release.mjs';
test('dormant automation never calls providers; idempotent adapter retries reuse draft',async()=>{
 let collects=0,generates=0;const collector={readOfficial:async()=>{collects++;return {title:'공식 자료',url:'https://example.test/source',text:'source text',collected_at:'2026-10-11'};}},generator={createDraft:async()=>{generates++;return {title:'검토용 원고'};}};
 const saved=new Map(),receipts={runOnce:async(k,fn)=>{if(!saved.has(k))saved.set(k,fn());return saved.get(k);}};
 const args={kind:'weekly',period:'2026-10-11',source:{id:'official-source'},collector,generator,receipts};
 assert.equal((await prepareContent(args)).executed,false);assert.equal(collects,0);
 const results=await Promise.all([prepareContent({...args,approved:true}),prepareContent({...args,approved:true})]);assert.deepEqual(results[0],results[1]);assert.equal(collects,1);assert.equal(generates,1);assert.equal(results[0].state,'review');assert.equal(results[0].source_key,contentJobKey('weekly','2026-10-11','official-source'));
});
test('KST dates, undated/completed groups, safe official URLs',()=>{
 const now=new Date('2026-10-11T15:01:00Z');assert.equal(dayKST(now),'2026-10-12');assert.equal(weekEnd(now),'2026-10-18');
 assert.equal(taskGroup({due_date:'2026-10-11'},now),'overdue');assert.equal(taskGroup({due_date:null},now),'undated');assert.equal(taskGroup({completed_at:now},now),'completed');assert.equal(safeSource('javascript:alert(1)'),null);assert.equal(safeSource('https://user:pass@example.com'),null);
});
test('private task and reviewed content lifecycle with real isolated SQL',async t=>{
 const f=await setupGrowth();try{
  const first=await f.first();assert.equal((await f.first()).id,first.id);let row=(await f.cmd('admin_list'))[0];assert.equal(row.review_state,'review');assert.equal(row.published_revision,null);
  await t.test('draft blocked for consumer, expert and anonymous; private tables denied',async()=>{
   await f.login(ids.customer);await assert.rejects(f.cmd('library'),/expert_required/);await assert.rejects(f.cmd('admin_list'),/admin_required/);
   await f.login(ids.planner);assert.deepEqual(await f.cmd('library'),[]);await assert.rejects(f.cmd('content',{id:first.id}),/content_unavailable/);
   await assert.rejects(f.db.query('select * from private.growth_tasks'),/permission denied/);
   await f.login(null,'anon');await assert.rejects(f.cmd('capabilities'),/permission denied/);
  });
  await t.test('owner review required; no auto checked date; exact approved snapshot',async()=>{
   await f.login(ids.admin);await assert.rejects(f.write('admin_approve',{id:first.id,revision:1}),/content_review_required/);
   await f.publish(first.id);row=(await f.cmd('admin_list'))[0];assert.equal(row.published_revision,2);
   await f.owner('insert into private.admin_memberships(user_id) values($1)',[ids.other]);await f.login(ids.other);await assert.rejects(f.write('admin_approve',{id:first.id,revision:2}),/owner_required/);
   await f.login(ids.admin);await f.write('admin_save',{id:first.id,revision:2,content:{...row.draft,practice:'수정된 실천 제안'}});row=(await f.cmd('admin_list'))[0];assert.equal(row.review_state,'review');assert.equal(row.approved_revision,null);assert.equal(row.draft.checked_date,dayKST());
   await f.login(ids.planner);assert.equal((await f.cmd('content',{id:first.id})).practice,'상담 마무리 확인사항 정리하기');
  });
  let task;
  await t.test('save, retry dedupe, explicit duplicate, edit, complete/undo and owner isolation',async()=>{
   await f.login(ids.planner);const payload={request_key:crypto.randomUUID(),title:'오늘 할 일',memo:'공식 안내 확인',due_date:null,source_id:first.id};const saved=await f.cmd('task_save',payload);assert.equal((await f.cmd('task_save',payload)).id,saved.id);assert.equal((await f.cmd('mine')).length,1);
   await f.write('task_save',{title:'오늘 할 일'});assert.equal((await f.cmd('mine')).length,2);task=(await f.cmd('mine')).find(r=>r.id===saved.id);
   await f.write('task_save',{id:task.id,revision:task.revision,title:'수정한 일',memo:'메모 수정',due_date:'2026-12-25'});
   await assert.rejects(f.write('task_complete',{id:task.id,revision:task.revision,completed:true}),/stale_record/);
   task=(await f.cmd('mine')).find(r=>r.id===task.id);await f.write('task_complete',{id:task.id,revision:task.revision,completed:true});task=(await f.cmd('mine')).find(r=>r.id===task.id);assert.ok(task.completed_at);
   await f.write('task_complete',{id:task.id,revision:task.revision,completed:false});task=(await f.cmd('mine')).find(r=>r.id===task.id);assert.equal(task.completed_at,null);
   await f.login(ids.next);assert.deepEqual(await f.cmd('mine'),[]);await assert.rejects(f.write('task_save',{id:task.id,revision:task.revision,title:'changed'}),/task_forbidden/);await assert.rejects(f.write('task_delete',{id:task.id,revision:task.revision}),/task_forbidden/);
   await f.login(ids.admin);await assert.rejects(f.cmd('mine'),/expert_required/);await assert.rejects(f.db.query('select memo from private.growth_tasks'),/permission denied/);
  });
  await t.test('unpublish retains personal task and source title without private content',async()=>{
   await f.login(ids.admin);await f.write('admin_unpublish',{id:first.id,revision:3});await f.login(ids.planner);task=(await f.cmd('mine')).find(r=>r.id===task.id);assert.equal(task.source_available,false);assert.ok(task.source_title);await assert.rejects(f.cmd('content',{id:first.id}),/content_unavailable/);
  });
  await t.test('approved scheduled version only, disabled by default, retry and expiry hold',async()=>{
   await f.login(ids.admin);await f.write('admin_approve',{id:first.id,revision:3});await f.write('admin_schedule',{id:first.id,revision:3,scheduled_at:'2099-01-01T09:00:00+09:00'});
   await assert.rejects(f.rpc('growth_publish_due'),/permission denied/);await f.login(null,'service_role');assert.equal((await f.rpc('growth_publish_due')).enabled,false);
   await f.owner("update private.growth_settings set publishing_enabled=true");await f.owner("update private.growth_contents set scheduled_at=now()-interval '1 minute'");await f.login(null,'service_role');assert.equal((await f.rpc('growth_publish_due')).published,1);assert.equal((await f.rpc('growth_publish_due')).published,0);
   await f.login(ids.admin);row=(await f.cmd('admin_list'))[0];const old=(await f.owner('select published from private.growth_contents where id=$1',[first.id]))[0].published;
   await f.write('admin_save',{id:first.id,revision:3,content:{...row.draft,checked_date:'2020-01-01'}});await assert.rejects(f.write('admin_approve',{id:first.id,revision:4}),/content_review_required/);
   await f.owner("update private.growth_contents set scheduled_at=now()-interval '1 minute'");await f.login(null,'service_role');assert.equal((await f.rpc('growth_publish_due')).held,1);assert.deepEqual((await f.owner('select published from private.growth_contents where id=$1',[first.id]))[0].published,old);
  });
  await t.test('withdrawal disables access; account deletion cascades only own personal records',async()=>{
   await f.login(ids.planner);await assert.rejects(f.write('task_save',{title:'x'.repeat(101)}),/invalid_task/);await assert.rejects(f.write('task_save',{title:'x',memo:'x'.repeat(301)}),/invalid_task/);
   await f.owner("insert into private.account_lifecycle(user_id,status) values($1,'WITHDRAWN')",[ids.planner]);await f.login(ids.planner);await assert.rejects(f.cmd('mine'),/membership_required/);
   const fk=await f.owner("select confdeltype from pg_constraint where conrelid='private.growth_tasks'::regclass and confrelid='auth.users'::regclass");assert.equal(fk[0].confdeltype,'c');
   await f.login(ids.next);const s=await f.write('task_save',{title:'지울 실천'});let own=(await f.cmd('mine'))[0];await f.write('task_delete',{id:s.id,revision:own.revision});assert.deepEqual(await f.cmd('mine'),[]);
  });
  await t.test('combined atomic package replay preserves tasks and published snapshots',async()=>{
   const before=await f.owner('select id,title,memo from private.growth_tasks order by id');const sql=await releaseSQL({includeFirstDraft:true});await f.db.exec(sql);await f.db.exec(sql);assert.deepEqual(await f.owner('select id,title,memo from private.growth_tasks order by id'),before);assert.equal((await f.owner('select count(*) from private.growth_contents'))[0].count,1);
  });
  await t.test('rollback preserves personal records, removes app and worker execution',async()=>{
   const before=await f.owner('select count(*) from private.growth_tasks');await f.db.exec(await readFile('supabase/rollback_expert_growth.sql','utf8'));assert.deepEqual(await f.owner('select count(*) from private.growth_tasks'),before);await f.login(ids.next);await assert.rejects(f.cmd('mine'),/permission denied/);
  });
 }finally{await f.db.close();}
});
