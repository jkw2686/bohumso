import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {setupUrgent} from './urgent-fixture.mjs';import {ids} from './commerce-fixture.mjs';
const sql=n=>readFile('supabase/'+n,'utf8');
test('owner declaration publishes only self without forging document verification; suspension and rollback hide it',async()=>{const f=await setup();try{
 await f.db.exec('reset role');await f.db.exec(await sql('037_solapi_phone_otp.sql'));
 await f.db.exec('alter table private.planner_directory add column if not exists is_test boolean default true;alter table public.partner_applications add column if not exists is_test boolean default true;');
 for(let i=0;i<2;i++)await f.db.exec(await sql('042_owner_declaration.sql'));
 await f.login(ids.admin);await f.rpc('expert_profile_command',['save',{display_name:'대표 선언 테스트',primary_area:'경기 분당',secondary_areas:[],specialties:['claim'],weekdays:[1,2,3,4,5],start_hour:9,end_hour:18,consent:true}]);
 const p={user_id:ids.admin,organization:'테스트 소속',registration_reference:'OWNER_DECLARATION',reason:'대표자 본인이 자격 보유를 선언하고 공개 요청'};
 await assert.rejects(f.rpc('early_expert_review',['approve',p]),/phone_verification_required/);
 await f.db.exec('reset role');await f.db.query("insert into private.phone_contacts values($1,'+821000000000',now(),'OTP_VERIFIED') on conflict(user_id) do update set phone_verification_status='OTP_VERIFIED',phone_verified_at=now()",[ids.admin]);
 await f.login(ids.other);await assert.rejects(f.rpc('early_expert_review',['approve',{...p,user_id:ids.other}]),/owner_required/);
 await f.login(ids.admin);await assert.rejects(f.rpc('early_expert_review',['approve',{...p,user_id:ids.other}]),/owner_required/);
 await f.rpc('early_expert_review',['approve',p]);
 await f.db.exec('reset role');assert.equal((await f.db.query('select is_test from private.planner_directory where user_id=$1',[ids.admin])).rows[0].is_test,false);await f.login(ids.admin);
 const catalog=await f.rpc('planner_catalog',['','']);const owner=catalog.planners.find(x=>x.id===ids.admin);assert.ok(owner);assert.equal(owner.verified,false);
 await f.db.exec('reset role');let row=(await f.db.query('select registration_status,organization_status from private.expert_profiles where user_id=$1',[ids.admin])).rows[0];assert.equal(row.registration_status,'NOT_SUBMITTED');assert.equal(row.organization_status,'NOT_SUBMITTED');
 assert.equal((await f.db.query("select count(*)::int n from private.expert_verification_events where action='OWNER_DECLARED_PUBLICATION'")).rows[0].n,1);
 await f.login(ids.admin);await f.rpc('early_expert_review',['suspend',{...p,reason:'대표자 노출 정지 검증'}]);assert.ok(!(await f.rpc('planner_catalog',['',''])).planners.some(x=>x.id===ids.admin));await assert.rejects(f.rpc('early_expert_review',['approve',p]),/application_locked/);
 await f.db.exec('reset role');await f.db.query("update private.expert_profiles set status='PROFILE_COMPLETE_VERIFICATION_REQUIRED' where user_id=$1",[ids.admin]);await f.login(ids.admin);await f.rpc('early_expert_review',['approve',p]);await f.db.exec('reset role');await f.db.exec(await sql('rollback_owner_declaration.sql'));await f.login(ids.admin);assert.ok(!(await f.rpc('planner_catalog',['',''])).planners.some(x=>x.id===ids.admin));
 }finally{await f.db.close();}});
async function setup(){const f=await setupUrgent(false);await f.db.exec('reset role');for(const n of ['026_release_controls.sql','027_private_rls.sql','030_public_early_access.sql','031_expert_early_access.sql','032_expert_verification.sql','033_reservation_integrity.sql','034_organization_roster.sql','035_operational_metrics.sql','036_member_rights_admin.sql'])await f.db.exec(await sql(n));
 await f.db.exec('alter table auth.users add column email text');for(const [k,id] of Object.entries(ids))await f.db.query('update auth.users set email=$1 where id=$2',[k==='admin'?'jkw2686@gmail.com':k+'@example.test',id]);
 for(let i=0;i<2;i++)for(const n of ['040_owner_admin_access.sql','041_owner_self_review.sql'])await f.db.exec(await sql(n));return f;}
test('only owner manages allowlist; regular members and anonymous are denied; revoke preserves data',async()=>{const f=await setup();try{
 await f.login(null,'anon');await assert.rejects(f.rpc('admin_access_command',['list']),/permission denied/);
 await f.login(ids.other);assert.equal((await f.rpc('my_membership')).admin,false);await assert.rejects(f.rpc('early_expert_review',['list']),/admin_required/);await assert.rejects(f.rpc('consultation_workspace',['admin']),/admin_required/);await assert.rejects(f.rpc('admin_access_command',['add',{email:'other@example.test',reason:'임의 관리자 권한 탈취'}]),/owner_required/);
 await f.login(ids.admin);assert.equal((await f.rpc('admin_access_command',['list'])).length,1);
 await assert.rejects(f.rpc('admin_access_command',['remove',{email:'jkw2686@gmail.com',reason:'대표자 해제 차단 확인'}]),/owner_protected/);
 await f.rpc('admin_access_command',['add',{email:'other@example.test',reason:'담당 관리자 추가 검증'}]);
 await f.login(ids.other);assert.equal((await f.rpc('my_membership')).admin,true);await assert.rejects(f.rpc('admin_access_command',['list']),/owner_required/);
 await assert.rejects(f.rpc('early_expert_review',['approve',{user_id:ids.other,reason:'추가 관리자 자기승인 거절'}]),/self_review_forbidden/);
 await f.login(ids.admin);await f.rpc('admin_access_command',['remove',{email:'other@example.test',reason:'담당 관리자 해제 검증'}]);
 await f.login(ids.other);assert.equal((await f.rpc('my_membership')).admin,false);assert.equal((await f.rpc('my_membership')).member,true);await assert.rejects(f.rpc('early_expert_review',['list']),/admin_required/);
 await f.db.exec('reset role');assert.equal((await f.db.query('select count(*)::int n from private.admin_access_events')).rows[0].n,2);
 }finally{await f.db.close();}});
test('owner self-review still requires actual evidence and phone; records explicit audit; rollback restores restriction',async()=>{const f=await setup();try{
 await f.login(ids.admin);await f.rpc('expert_profile_command',['save',{display_name:'대표 테스트 전문가',primary_area:'경기 분당',secondary_areas:[],specialties:['claim'],weekdays:[1,2,3,4,5],start_hour:9,end_hour:18,consent:true}]);
 const p={user_id:ids.admin,reason:'가상 자료로 자격 확인 테스트',organization:'테스트 소속',registration_reference:'TEST-OWNER'};
 await assert.rejects(f.rpc('early_expert_review',['approve',p]),/verification_required/);
 await assert.rejects(f.rpc('early_expert_review',['verify',{...p,kind:'registration',decision:'VERIFIED'}]),/document_required/);
 await f.login(null,'service_role');await f.rpc('early_document_service',[ids.admin,'save',{kind:'registration',path:ids.admin+'/test.pdf',filename:'test.pdf',mime:'application/pdf',bytes:128}]);
 await f.login(ids.admin);await f.rpc('early_expert_review',['verify',{...p,kind:'registration',decision:'VERIFIED'}]);
 await f.db.exec('reset role');await f.db.query('update auth.users set phone=null where id=$1',[ids.admin]);await f.login(ids.admin);await assert.rejects(f.rpc('early_expert_review',['approve',p]),/phone_verification_required/);
 await f.db.exec('reset role');await f.db.query("update auth.users set phone='+821000000000',phone_confirmed_at=now() where id=$1",[ids.admin]);await f.login(ids.admin);await f.rpc('early_expert_review',['approve',p]);
 await f.db.exec('reset role');assert.equal((await f.db.query("select count(*)::int n from private.expert_verification_events where action='OWNER_SELF_APPROVE'")).rows[0].n,1);
 await f.db.exec(await sql('rollback_owner_self_review.sql'));await f.login(ids.admin);await assert.rejects(f.rpc('early_expert_review',['suspend',p]),/self_review_forbidden/);await assert.rejects(f.rpc('admin_access_command',['list']),/permission denied/);
 }finally{await f.db.close();}});
