import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setupUrgent} from './urgent-fixture.mjs';
import {ids} from './commerce-fixture.mjs';
test('admin approval matches a later-added roster without applicant resave and preserves gates',async()=>{
 const f=await setupUrgent(false);
 try {
  await f.db.exec('reset role');
  for(const name of ['026_release_controls.sql','027_private_rls.sql','030_public_early_access.sql','031_expert_early_access.sql','032_expert_verification.sql','033_reservation_integrity.sql','034_organization_roster.sql']) await f.db.exec(await readFile('supabase/'+name,'utf8'));
  await f.db.exec("alter table auth.users add column email text");
  await f.db.query('update auth.users set email=$1,phone=$2 where id=$3',['roster@example.test','+821000000001',ids.customer]);
  await f.login(ids.customer);
  await f.rpc('expert_profile_command',['save',{display_name:'격리 검증 전문가',primary_area:'경기 분당',secondary_areas:[],specialties:['claim'],weekdays:[1,2,3,4,5],start_hour:9,end_hour:18,consent:true}]);
  const approval={user_id:ids.customer,reason:'격리 회사 소속 확인 근거'};
  await f.login(ids.admin);
  await assert.rejects(f.rpc('early_expert_review',['approve',approval]),/verification_required/);
  await f.db.exec('reset role');
  await f.db.exec("alter function public.early_expert_review(text,jsonb) rename to early_expert_review_before_owner_declaration; create function public.early_expert_review(operation text,payload jsonb default '{}') returns jsonb language sql security definer set search_path='' as $$select public.early_expert_review_before_owner_declaration(operation,payload)$$;revoke all on function public.early_expert_review_before_owner_declaration(text,jsonb),public.early_expert_review(text,jsonb) from public,anon,authenticated;grant execute on function public.early_expert_review(text,jsonb) to authenticated;");
  const migration=await readFile('supabase/045_review_roster_refresh.sql','utf8');await f.db.exec(migration);await f.db.exec(migration);
  await f.login(ids.admin);
  await assert.rejects(f.rpc('early_expert_review',['approve',approval]),/verification_required/);
  const roster=await f.rpc('expert_roster_command',['add',{organization:'격리 회사',email:'roster@example.test',expires_at:new Date(Date.now()+86400000).toISOString(),reason:'격리 소속 명단 확인'}]);
  await f.login(ids.customer);await assert.rejects(f.rpc('early_expert_review',['approve',approval]),/admin_required/);
  await f.db.exec('reset role');await f.db.query('update auth.users set phone_confirmed_at=null where id=$1',[ids.customer]);
  await f.login(ids.admin);await assert.rejects(f.rpc('early_expert_review',['approve',approval]),/phone_verification_required/);
  await f.db.exec('reset role');assert.equal((await f.db.query('select organization_status from private.expert_profiles where user_id=$1',[ids.customer])).rows[0].organization_status,'NOT_SUBMITTED');
  await f.db.query('update auth.users set phone_confirmed_at=now() where id=$1',[ids.customer]);
  await f.login(ids.admin);await f.rpc('early_expert_review',['approve',approval]);
  assert.equal((await f.rpc('planner_catalog',['',''])).planners.length,1);
  await f.db.exec('reset role');const profile=(await f.db.query('select * from private.expert_profiles where user_id=$1',[ids.customer])).rows[0];
  assert.equal(profile.status,'APPROVED');assert.equal(profile.registration_status,'NOT_SUBMITTED');assert.equal(profile.roster_id,roster.id);
  await f.login(ids.admin);await f.rpc('expert_roster_command',['revoke',{id:roster.id}]);
  assert.equal((await f.rpc('planner_catalog',['',''])).planners.length,0);
  await assert.rejects(f.rpc('early_expert_review',['approve',approval]),/verification_expired/);
 }finally {await f.db.close();}
});
