import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {setupUrgent} from './urgent-fixture.mjs';import {ids} from './commerce-fixture.mjs';
test('phone-only membership: OTP, consent, existing records, access, rerun and rollback',async()=>{
 const f=await setupUrgent(false);try{
  await f.db.exec('reset role');
  for(const name of ['026_release_controls.sql','027_private_rls.sql','030_public_early_access.sql','031_expert_early_access.sql','032_expert_verification.sql','033_reservation_integrity.sql','034_organization_roster.sql','035_operational_metrics.sql','036_member_rights_admin.sql','044_operational_policy.sql'])await f.db.exec(await readFile('supabase/'+name,'utf8'));
  await f.db.exec('create table private.phone_contacts(user_id uuid primary key,phone_e164 text,phone_verification_status text,phone_verified_at timestamptz)');
  await f.db.exec(await readFile('supabase/043_auth_phone_status_bridge.sql','utf8'));
  const before=(await f.db.query('select * from public.member_profiles order by user_id')).rows;
  const acl=(await f.db.query("select oid::regprocedure::text as name,proacl from pg_proc where oid in ('private.is_active_member()'::regprocedure,'public.complete_membership(boolean,boolean,boolean,boolean)'::regprocedure,'public.early_document_service(uuid,text,jsonb)'::regprocedure) order by 1")).rows;
  const sql=await readFile('supabase/051_phone_signup.sql','utf8');await f.db.exec(sql);await f.db.exec(sql);
  assert.equal((await f.db.query('select count(*)::int n from private.phone_signup_backup')).rows[0].n,4);
  assert.deepEqual((await f.db.query('select * from public.member_profiles order by user_id')).rows,before);
  assert.deepEqual((await f.db.query("select oid::regprocedure::text as name,proacl from pg_proc where oid in ('private.is_active_member()'::regprocedure,'public.complete_membership(boolean,boolean,boolean,boolean)'::regprocedure,'public.early_document_service(uuid,text,jsonb)'::regprocedure) order by 1")).rows,acl);
  const subject='40000000-0000-4000-8000-000000000051';await f.db.query('insert into auth.users(id,phone) values($1,$2)',[subject,'821000000000']);await f.login(subject);
  await assert.rejects(f.rpc('complete_membership',[true,true,true,false]),/verified_account_required/);
  await f.db.exec('reset role');await f.db.query('update auth.users set phone_confirmed_at=now() where id=$1',[subject]);await f.login(subject);
  await assert.rejects(f.rpc('complete_membership',[false,true,true,false]),/consent_required/);
  await f.rpc('complete_membership',[true,true,true,false]);assert.equal((await f.rpc('my_membership')).member,true);
  await f.rpc('complete_membership',[true,true,true,false]);assert.equal((await f.rpc('member_rights',['list'])).consents.length,3);
  assert.equal((await f.rpc('release_status')).phoneSignupEnabled,true);
  const profile=await f.rpc('expert_profile_command',['save',{display_name:'격리 전문가',primary_area:'경기 분당',secondary_areas:[],specialties:['claim'],weekdays:[1,2,3],start_hour:9,end_hour:18,consent:true}]);assert.equal(profile.profile.map_visible,false);
  await assert.rejects(f.rpc('early_document_service',[subject,'save',{}]),/permission denied/);
  await f.db.exec('reset role;set role service_role');
  const document=await f.rpc('early_document_service',[subject,'save',{path:subject+'/proof.pdf',kind:'registration',filename:'proof.pdf',mime:'application/pdf',bytes:100}]);assert.ok(document.document.id);
  await assert.rejects(f.rpc('early_document_service',[subject,'read',{id:document.document.id}]),/request_forbidden/);
  await f.login(subject);
  await assert.rejects(f.db.query('select * from private.phone_signup_backup'),/permission denied/);
  const visible=(await f.db.query('select user_id from public.member_profiles')).rows;assert.ok(visible.every(x=>x.user_id===subject));
  await f.db.exec('reset role');await f.db.query("insert into private.phone_contacts values($1,'+821000000000','REVERIFY_REQUIRED',null)",[subject]);await f.login(subject);assert.equal((await f.rpc('my_membership')).member,false);
  await f.db.exec('reset role');await f.db.query("update private.phone_contacts set phone_verification_status='OTP_VERIFIED',phone_verified_at=now() where user_id=$1",[subject]);await f.login(subject);assert.equal((await f.rpc('my_membership')).member,true);
  await f.db.exec('reset role');await f.db.query("update private.account_lifecycle set status='SUSPENDED' where user_id=$1",[subject]);await f.login(subject);assert.equal((await f.rpc('my_membership')).member,false);
  await f.login(ids.customer);assert.equal((await f.rpc('my_membership')).member,true);
  await f.db.exec('reset role');await f.db.query("update private.account_lifecycle set status='ACTIVE' where user_id=$1",[subject]);await f.db.exec(await readFile('supabase/rollback_phone_signup.sql','utf8'));await f.login(subject);assert.equal((await f.rpc('my_membership')).member,false);
  await f.db.exec('reset role');assert.equal((await f.db.query('select count(*)::int n from public.member_profiles where user_id=$1',[subject])).rows[0].n,1);await f.db.exec(sql);await f.login(subject);assert.equal((await f.rpc('my_membership')).member,true);
 }finally{await f.db.close();}
});
