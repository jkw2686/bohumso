import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {setupUrgent} from './urgent-fixture.mjs';import {ids} from './commerce-fixture.mjs';
const sql=n=>readFile('supabase/'+n,'utf8');
async function setup(){const f=await setupUrgent(false);await f.db.exec('reset role');for(const n of ['026_release_controls.sql','027_private_rls.sql','030_public_early_access.sql','031_expert_early_access.sql','032_expert_verification.sql','033_reservation_integrity.sql','034_organization_roster.sql','035_operational_metrics.sql','036_member_rights_admin.sql'])await f.db.exec(await sql(n));
 await f.db.exec('alter table auth.users add column email text');for(const [k,id] of Object.entries(ids))await f.db.query('update auth.users set email=$1 where id=$2',[k==='admin'?'jkw2686@gmail.com':k+'@example.test',id]);
 for(let i=0;i<2;i++)for(const n of ['040_owner_admin_access.sql','041_owner_self_review.sql'])await f.db.exec(await sql(n));return f;}

async function install(f){await f.db.exec('reset role');await f.db.exec(await readFile('scripts/admin-owner-logins.sql','utf8'));}
test('owner bindings deny unapproved memberships and allow only audited future operator grants',async()=>{
 const f=await setup();try{
  await install(f);await install(f);
  await f.login(ids.admin);assert.equal((await f.rpc('my_membership')).admin,true);
  await f.db.exec('reset role');await f.db.query('insert into private.admin_memberships(user_id) values($1) on conflict do nothing',[ids.other]);
  await f.db.exec("alter table auth.users add column if not exists raw_user_meta_data jsonb");await f.db.query("update auth.users set raw_user_meta_data='{\"admin\":true,\"role\":\"admin\"}' where id=$1",[ids.other]);
  await f.login(ids.other);assert.equal((await f.rpc('my_membership')).admin,false);
  await assert.rejects(f.rpc('admin_access_command',['list']),/owner_required/);
  await assert.rejects(f.rpc('early_expert_review',['list']),/admin_required/);
  await f.login(ids.admin);await f.rpc('admin_access_command',['add',{email:'other@example.test',reason:'Explicit future operator test'}]);
  await f.login(ids.other);assert.equal((await f.rpc('my_membership')).admin,true);
  await assert.rejects(f.rpc('admin_access_command',['add',{email:'customer@example.test',reason:'Delegation is owner only'}]),/owner_required/);
  await f.login(ids.admin);await f.rpc('admin_access_command',['remove',{email:'other@example.test',reason:'Revoke future operator test'}]);
  await f.db.exec('reset role');await f.db.query('insert into private.admin_memberships(user_id) values($1)',[ids.other]);
  await f.login(ids.other);assert.equal((await f.rpc('my_membership')).admin,false);
  await assert.rejects(f.db.query('select * from private.admin_owner_logins'),/permission denied/);
  await f.login(null,'anon');await assert.rejects(f.rpc('admin_access_command',['list']),/permission denied/);
 }finally{await f.db.close();}
});
test('verified phone owner is pinned to account and contact; both owners are protected; metadata cannot grant access',async()=>{
 const f=await setup();try{
  await install(f);await f.db.exec('reset role');
  await f.db.query("update auth.users set phone='821055550123',phone_confirmed_at=now() where id=$1",[ids.customer]);
  await f.db.query("insert into private.admin_owner_logins(user_id,kind,identifier) values($1,'phone','821055550123')",[ids.customer]);
  await f.db.query('insert into private.admin_memberships(user_id) values($1) on conflict do nothing',[ids.customer]);
  await f.login(ids.customer);assert.equal((await f.rpc('my_membership')).admin,true);
  const admins=await f.rpc('admin_access_command',['list']);assert.equal(admins.filter(x=>x.owner).length,2);
  await assert.rejects(f.rpc('admin_access_command',['remove',{email:'jkw2686@gmail.com',reason:'Never remove email owner'}]),/owner_protected/);
  await assert.rejects(f.rpc('admin_access_command',['remove',{email:'customer@example.test',reason:'Never remove phone owner'}]),/owner_protected/);
  await f.db.exec('reset role');await f.db.query('update auth.users set phone_confirmed_at=null where id=$1',[ids.customer]);
  await f.login(ids.customer);assert.equal((await f.rpc('my_membership')).admin,false);
  await f.db.exec('reset role');await f.db.query("update auth.users set phone='821055550124',phone_confirmed_at=now() where id=$1",[ids.customer]);
  await f.login(ids.customer);assert.equal((await f.rpc('my_membership')).admin,false);
  await f.db.exec('reset role');await f.db.query("update auth.users set phone='821055550123',phone_confirmed_at=now() where id=$1",[ids.other]);await f.db.query('insert into private.admin_memberships(user_id) values($1) on conflict do nothing',[ids.other]);
  await f.login(ids.other);assert.equal((await f.rpc('my_membership')).admin,false);
  await f.db.exec('reset role');await f.db.query('update auth.users set email_confirmed_at=null where id=$1',[ids.admin]);
  await f.login(ids.admin);assert.equal((await f.rpc('my_membership')).admin,false);
 }finally{await f.db.close();}
});
