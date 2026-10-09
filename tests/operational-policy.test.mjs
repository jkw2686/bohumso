import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setupUrgent} from './urgent-fixture.mjs';
import {ids} from './commerce-fixture.mjs';
import config from '../netlify/functions/public-config.mjs';
test('production policy migration preserves data, is rerunnable and runs real SQL request/accept/confirm/cancel with isolation',async()=>{
 const f=await setupUrgent(false);try{
 await f.db.exec('reset role');
 for(const name of ['026_release_controls.sql','027_private_rls.sql','030_public_early_access.sql','031_expert_early_access.sql','032_expert_verification.sql','033_reservation_integrity.sql','034_organization_roster.sql','035_operational_metrics.sql','036_member_rights_admin.sql'])await f.db.exec(await readFile('supabase/'+name,'utf8'));
 const before=await f.db.query('select * from public.member_profiles order by user_id');
 const sql=await readFile('supabase/044_operational_policy.sql','utf8');await f.db.exec(sql);await f.db.exec(sql);
 assert.deepEqual((await f.db.query('select * from public.member_profiles order by user_id')).rows,before.rows);
 assert.equal((await f.db.query('select count(*)::int n from private.operational_policy_backup')).rows[0].n,1);
 const fresh='40000000-0000-4000-8000-000000000044';await f.db.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[fresh]);await f.login(fresh);
 await assert.rejects(f.rpc('complete_membership',[false,true,true,false]),/consent_required/);
 await f.rpc('complete_membership',[true,true,true,false]);
 assert.ok((await f.rpc('member_rights',['list'])).consents.every(c=>c.version==='2026-10-09-v1'));
 const release=await f.rpc('release_status');assert.equal(release.serviceStage,'PRODUCTION');assert.equal(release.policiesApproved,true);
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(Date.now()+2*86400000));const preferred_at=new Date(date+'T10:00:00+09:00').toISOString();
 await assert.rejects(f.cmd('request',{office_assignment:true,request_key:crypto.randomUUID(),purpose:'claim',region:'경기 분당',method:'phone',preferred_at}),/phone_verification_required/);
 await f.db.exec("reset role;update auth.users set phone='+821000000001',phone_confirmed_at=now();insert into private.expert_profiles(user_id,display_name,primary_area,specialties,weekdays,start_hour,end_hour,status,registration_status,map_visible) select user_id,'격리 테스트 전문가','경기 분당',array['claim'],array[0,1,2,3,4,5,6],0,23,'APPROVED','VERIFIED',true from private.planner_directory;");
 await f.login(ids.customer);const payload={planner_id:ids.planner,request_key:crypto.randomUUID(),purpose:'claim',region:'경기 분당',method:'phone',preferred_at};const requested=await f.cmd('request',payload);
 assert.equal((await f.cmd('request',payload)).id,requested.id);
 let row=await f.row(requested.id);assert.equal(row.state,'requested');assert.equal(row.planner_id,ids.planner);
 await f.db.exec('reset role');const raw=(await f.db.query('select * from private.consultations where id=$1',[requested.id])).rows[0];assert.equal(raw.customer_id,ids.customer);assert.ok(raw.created_at);assert.ok(raw.preferred_at);
 await f.login(ids.other);assert.equal((await f.rpc('consultation_workspace',['customer'])).bookings.some(x=>x.id===requested.id),false);await assert.rejects(f.cmd('request',{...payload,request_key:crypto.randomUUID()}),/slot_unavailable/);
 await f.login(ids.planner);row=await f.row(requested.id,'partner');assert.equal(row.contact,null);await f.cmd('accept',{id:row.id,revision:row.revision});
 await f.login(ids.customer);row=await f.row(requested.id);assert.equal(row.state,'coordinating');await assert.rejects(f.cmd('confirm',{id:row.id,revision:row.revision,name:'격리 고객',share_consent:false}),/consent_required/);await f.cmd('confirm',{id:row.id,revision:row.revision,name:'격리 고객',share_consent:true});
 row=await f.row(requested.id);assert.equal(row.state,'scheduled');await f.cmd('cancel',{id:row.id,revision:row.revision});assert.equal((await f.row(requested.id)).state,'cancelled');
 const general=await f.cmd('request',{...payload,planner_id:null,office_assignment:true,request_key:crypto.randomUUID()});assert.equal((await f.row(general.id)).state,'requested');
 await assert.rejects(f.cmd('request',{...payload,office_id:'nonexistent',request_key:crypto.randomUUID()}),/office_not_active/);
 await f.db.exec('reset role');await f.db.exec(await readFile('supabase/rollback_operational_policy.sql','utf8'));assert.equal((await f.db.query('select policies_approved from private.release_controls')).rows[0].policies_approved,false);assert.ok((await f.db.query('select id from private.consultations where id=$1',[requested.id])).rows.length);
 }finally{await f.db.close();}
});
test('PRODUCTION retains public signup/expert UI and uses DB flags',async()=>{
 const before={...process.env},original=globalThis.fetch;
 try{Object.assign(process.env,{ACCOUNTS_ENABLED:'true',OPERATOR_NAME:'보험소',PRIVACY_CONTACT:'test@example.test',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'});globalThis.fetch=async()=>Response.json({serviceStage:'PRODUCTION',signupEnabled:true,expertApplicationsEnabled:true,closedBeta:false,policiesApproved:true});const c=await(await config()).json();assert.equal(c.serviceStage,'PRODUCTION');assert.equal(c.earlyAccess,true);assert.equal(c.signupEnabled,true);assert.equal(c.closedBeta,false);assert.equal(c.betaInvitesEnabled,false);}finally{globalThis.fetch=original;for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);}
});
