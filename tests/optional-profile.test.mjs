import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {setupVisits} from './expert-visits-fixture.mjs';import {ids} from './commerce-fixture.mjs';
test('optional profile ownership, clearing, publication, office scope, legacy preservation and rollback',async()=>{
 const f=await setupVisits();try{
  const before=(await f.db.query('select user_id,verified_at,verified_by,available,experience from private.planner_directory order by user_id')).rows;
  const sql=await readFile('supabase/052_optional_expert_profile.sql','utf8');await f.db.exec(sql);await f.db.exec(sql);
  assert.deepEqual((await f.db.query('select user_id,verified_at,verified_by,available,experience from private.planner_directory order by user_id')).rows,before);
  await f.login(ids.planner);const get=()=>f.rpc('expert_optional_profile',['get']);assert.deepEqual((await get()).insurance_types,[]);
  for(const types of [['life'],['nonlife'],['life','nonlife']]){const p=await f.rpc('expert_optional_profile',['save',{insurance_types:types,help_tasks:['claim_documents','policy_check'],biography:'함께 확인해요',user_id:ids.next,verified_at:'2026-01-01'}]);assert.deepEqual(p.insurance_types.sort(),types.sort());assert.equal(p.biography,'함께 확인해요');}
  await assert.rejects(f.rpc('expert_optional_profile',['save',{insurance_types:['invalid']}]),/invalid_options/);
  await assert.rejects(f.rpc('expert_optional_profile',['save',{help_tasks:['office_consultation']}]),/office_operator_required/);
  await assert.rejects(f.rpc('expert_optional_profile',['save',{biography:'가'.repeat(41)}]),/invalid_introduction/);
  await assert.rejects(f.rpc('expert_optional_profile',['save',{biography:'<img src=x>'}]),/invalid_introduction/);
  await f.db.exec('reset role');await f.db.query("insert into private.office_locations(id,name,region,status,address,latitude,longitude,operator_user_id) values('profile-office','확인 보험소','경기 분당','active','등록 사무실',37.3,127.1,$1)",[ids.planner]);await f.login(ids.planner);
  const p=await f.rpc('expert_optional_profile',['save',{insurance_types:['life','nonlife'],help_tasks:['claim_documents','policy_check','office_consultation'],biography:'가'.repeat(40)}]);assert.equal(p.offices[0].available,true);assert.equal(p.help_tasks.length,3);
  await f.db.exec('reset role;set role anon');let catalog=await f.rpc('planner_catalog',['','']);const visible=catalog.planners.find(p=>p.id===ids.planner);assert.equal(visible.insurance_types.length,2);assert.equal(visible.offices.length,1);assert.equal(visible.experience,undefined);
  await assert.rejects(f.rpc('expert_optional_profile',['get']),/permission denied/);await assert.rejects(f.rpc('expert_photo_service',[ids.planner,'save',{}]),/permission denied/);
  await f.login(ids.next);assert.deepEqual((await get()).insurance_types,[]);await f.rpc('expert_optional_profile',['save',{biography:'다른 전문가'}]);await f.login(ids.planner);assert.equal((await get()).biography,'가'.repeat(40));
  await f.db.exec('reset role');await f.db.query('update private.planner_directory set experience=12 where user_id=$1',[ids.planner]);await f.login(ids.planner);
  await f.rpc('consultation_command',['profile',{hours:'평일',phone:'01000000001',available:true,specialties:['claim'],latitude:37.3,longitude:127.1,experience:0}]);assert.equal((await get()).biography,'가'.repeat(40));
  await assert.rejects(f.rpc('consultation_command',['profile',{biography:'나'.repeat(41)}]),/invalid_introduction/);
  await assert.rejects(f.rpc('consultation_command',['profile',{photo_url:'https://example.test/large.jpg'}]),/use_photo_upload/);
  await f.db.exec('reset role');assert.equal((await f.db.query('select experience from private.planner_directory where user_id=$1',[ids.planner])).rows[0].experience,12);
  await f.db.exec('set role service_role');const saved=await f.rpc('expert_photo_service',[ids.planner,'save',{version:'00000000-0000-4000-8000-000000000052'}]);assert.match(saved.photo_url,/expert-photo/);await f.rpc('expert_photo_service',[ids.planner,'clear',{}]);
  await f.login(ids.planner);await f.rpc('expert_optional_profile',['save',{insurance_types:[],help_tasks:[],biography:''}]);assert.equal((await get()).biography,'');assert.equal((await get()).photo_url,'');assert.deepEqual((await get()).help_tasks,[]);
  await f.db.exec('reset role');await f.db.query("update private.office_locations set status='planned' where id='profile-office'");await f.login(ids.planner);assert.equal((await get()).offices[0].available,false);
  await f.db.exec('reset role');await f.db.query("update private.expert_profiles set status='SUSPENDED' where user_id=$1",[ids.planner]);await f.login(ids.planner);await assert.rejects(get(),/application_locked/);await f.db.exec('reset role;set role anon');catalog=await f.rpc('planner_catalog',['','']);assert.ok(!catalog.planners.some(p=>p.id===ids.planner));
  await f.db.exec('reset role');await f.db.exec(await readFile('supabase/rollback_optional_expert_profile.sql','utf8'));assert.equal((await f.db.query('select experience from private.planner_directory where user_id=$1',[ids.planner])).rows[0].experience,12);await f.db.exec(sql);
 }finally{await f.db.close();}
});
