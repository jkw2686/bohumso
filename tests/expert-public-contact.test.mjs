import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {setupCare,ids} from './appointment-care-fixture.mjs';
test('public contact requires explicit owner consent, never publishes auth/private phones or changes eligibility',async()=>{
 const f=await setupCare();try{
  await f.db.exec('reset role');const before=(await f.db.query('select user_id,phone,available,verified_at from private.planner_directory order by user_id')).rows;
  const sql=await readFile('supabase/068_expert_public_contact.sql','utf8');await f.db.exec(sql);await f.db.exec(sql);
  const own=(op='get',payload={})=>f.rpc('expert_public_contact',[op,payload]),publicPhone=id=>f.rpc('expert_public_phone',[id]);
  await f.login(ids.planner);assert.deepEqual(await own(),{phone:'',public:false});
  await f.login(null,'anon');assert.equal(await publicPhone(ids.planner),null);await assert.rejects(own(),/permission denied/);
  await f.login(ids.customer);await assert.rejects(own('set',{phone:'01000000001',public:true,consent:true,consent_version:'expert-public-phone-v1'}),/expert_required/);
  await f.login(ids.planner);await assert.rejects(own('set',{phone:'01000000001',public:true,consent:false}),/public_contact_consent_required/);
  await assert.rejects(own('set',{phone:'javascript:alert(1)',public:true,consent:true,consent_version:'expert-public-phone-v1'}),/invalid_phone/);
  await own('set',{phone:'010-0000-0001',public:false});await f.login(null,'anon');assert.equal(await publicPhone(ids.planner),null);
  const consent={phone:'010-0000-0001',public:true,consent:true,consent_version:'expert-public-phone-v1',user_id:ids.next};
  await f.login(ids.planner);await own('set',consent);await f.db.exec('reset role');await f.db.exec(sql);
  await f.login(null,'anon');assert.deepEqual(await publicPhone(ids.planner),{id:ids.planner,phone:'01000000001'});assert.equal(await publicPhone(ids.next),null);
  await f.login(ids.next);assert.deepEqual(await own(),{phone:'',public:false});await assert.rejects(f.db.query('select * from private.expert_public_contacts'),/permission denied/);
  await f.login(ids.planner);await own('set',{phone:'01000000001',public:false});await f.login(null,'anon');assert.equal(await publicPhone(ids.planner),null);
  await f.login(ids.planner);await own('set',consent);await f.db.exec('reset role');await f.db.query("update public.partner_applications set status='suspended' where user_id=$1",[ids.planner]);await f.login(null,'anon');assert.equal(await publicPhone(ids.planner),null);
  await f.db.exec('reset role');assert.deepEqual((await f.db.query('select user_id,phone,available,verified_at from private.planner_directory order by user_id')).rows,before);
  await f.db.exec(await readFile('supabase/068_expert_public_contact_rollback.sql','utf8'));await f.login(null,'anon');await assert.rejects(publicPhone(ids.planner),/permission denied/);await f.login(ids.planner);await assert.rejects(own(),/permission denied/);await f.db.exec('reset role');await f.db.exec(sql);await f.login(ids.planner);assert.equal((await own()).public,true);
  console.log('PASS no copy/backfill, explicit opt-in/revoke, owner isolation, same public visibility as catalog, rerun preserves consent, no changes to private phones/availability/verification');
 }finally{await f.db.close();}
});
