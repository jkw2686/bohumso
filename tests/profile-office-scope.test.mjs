import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {setupVisits} from './expert-visits-fixture.mjs';import {ids} from './commerce-fixture.mjs';
test('office option requires an active operator with address and coordinates; old data preserved',async()=>{
 const f=await setupVisits();try{
  for(const file of ['052_optional_expert_profile.sql','053_connection_review.sql','054_profile_office_scope.sql','054_profile_office_scope.sql'])await f.db.exec(await readFile('supabase/'+file,'utf8'));
  await f.db.query("insert into private.office_locations(id,name,region,status,operator_user_id) values('scope-office','확인 보험소','경기 분당','planned',$1)",[ids.planner]);
  const save=()=>f.rpc('expert_optional_profile',['save',{help_tasks:['office_consultation'],insurance_types:['life'],biography:'함께 확인합니다'}]);
  await f.login(ids.planner);await assert.rejects(save(),/office_operator_required/);
  await f.db.exec("reset role;update private.office_locations set status='active' where id='scope-office'");await f.login(ids.planner);await assert.rejects(save(),/office_operator_required/);
  await f.db.exec("reset role;update private.office_locations set address='방문 사무실',latitude=37.3,longitude=127.1 where id='scope-office'");await f.login(ids.planner);assert.deepEqual((await save()).help_tasks,['office_consultation']);
  await f.login(ids.next);await assert.rejects(save(),/office_operator_required/);
  await f.db.exec("reset role;update private.office_locations set status='planned' where id='scope-office'");await f.login(ids.planner);assert.deepEqual((await f.rpc('expert_optional_profile',['get'])).help_tasks,[]);
  await f.db.exec('reset role;set role anon');const p=(await f.rpc('planner_catalog',['',''])).planners.find(p=>p.id===ids.planner);assert.deepEqual(p.help_tasks,[]);assert.equal(p.offices[0].available,false);assert.deepEqual(p.insurance_types,['life']);
  await f.db.exec('reset role');assert.deepEqual((await f.db.query('select help_tasks from private.planner_directory where user_id=$1',[ids.planner])).rows[0].help_tasks,['office_consultation']);await f.db.exec(await readFile('supabase/rollback_profile_office_scope.sql','utf8'));await f.db.exec(await readFile('supabase/054_profile_office_scope.sql','utf8'));
 }finally{await f.db.close();}
});
