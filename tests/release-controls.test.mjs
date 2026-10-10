import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {setupUrgent} from './urgent-fixture.mjs';import {ids} from './commerce-fixture.mjs';
test('release controls preserve login/history, deny bypasses and require policy, invite and verified phone',async()=>{
 const f=await setupUrgent(false);try{
  await f.db.exec('reset role');await f.db.exec(await readFile('supabase/026_release_controls.sql','utf8'));await f.db.exec(await readFile('supabase/027_private_rls.sql','utf8'));
  assert.equal((await f.db.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relkind='r' and not c.relrowsecurity")).rows[0].n,0);
  await f.login(ids.customer);assert.equal((await f.rpc('my_membership')).member,true);assert.equal((await f.rpc('release_status')).policiesApproved,false);
  assert.equal((await f.rpc('consultation_workspace',['customer'])).bookings.length,0);
  const testDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(Date.now()+2*86400000));
  const payload={office_assignment:true,request_key:crypto.randomUUID(),region:'경기 분당',purpose:'claim',method:'scheduled',preferred_at:testDay+'T14:00:00+09:00'};
  await assert.rejects(f.cmd('request',payload),/policies_not_approved/);
  await assert.rejects(f.urgent('request',{}),/policies_not_approved/);
  await assert.rejects(f.rpc('consultation_command_before_release',['request',payload]),/permission denied/);
  await assert.rejects(f.rpc('complete_membership_before_release',[true,true,true,false]),/permission denied/);
  await assert.rejects(f.db.query('select * from private.beta_allowlist'),/permission denied/);
  await f.db.exec('reset role;update private.release_controls set policies_approved=true');await f.login(ids.customer);
  await assert.rejects(f.cmd('request',payload),/beta_invitation_required/);
  await f.db.exec('reset role');await f.db.query('insert into private.beta_allowlist(user_id) values($1)',[ids.customer]);await f.db.query('update auth.users set phone_confirmed_at=null where id=$1',[ids.customer]);await f.login(ids.customer);
  await assert.rejects(f.cmd('request',payload),/phone_verification_required/);
  await f.db.exec('reset role');await f.db.query('update auth.users set phone_confirmed_at=now() where id=$1',[ids.customer]);await f.login(ids.customer);
  const created=await f.cmd('request',payload);assert.ok(created.id);assert.equal((await f.cmd('request',payload)).id,created.id);
  await f.login(ids.other);assert.equal((await f.rpc('consultation_workspace',['customer'])).bookings.length,0);
  await f.login(null,'anon');assert.equal((await f.rpc('release_status')).betaAllowed,false);await assert.rejects(f.cmd('request',payload),/permission denied/);
 }finally{await f.db.close();}
});
