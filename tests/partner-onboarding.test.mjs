import test from 'node:test';import assert from 'node:assert/strict';import {fixture,ids} from './commerce-fixture.mjs';
const application={full_name:'가상 신청자',profession:'planner',organization:'테스트 소속',region:'서울 마포구',credential_reference:'TEST-REGISTRY',credential_issuer:'테스트 확인 기관',business_contact:'01000000000',career_years:3,consultation_modes:['remote'],verification_consent:true};
test('Expert application revisions, reapplication, withdrawal and review history preserve role isolation',async()=>{
 const f=await fixture();try{
  await f.login(ids.customer);
  await assert.rejects(()=>f.rpc('submit_partner_application',[{...application,verification_consent:false},0]),/verification_consent_required/);
  await assert.rejects(()=>f.rpc('submit_partner_application',[{...application,consultation_modes:[]},0]),/invalid_application/);
  await assert.rejects(()=>f.rpc('submit_partner_application',[{...application,credential_reference:'900101-1234567'},0]),/invalid_application/);
  await f.rpc('submit_partner_application',[application,0]);
  await assert.rejects(()=>f.rpc('submit_partner_application',[application,0]),/stale_application/);
  await assert.rejects(()=>f.db.query("update public.partner_applications set status='approved' where user_id=$1",[ids.customer]));
  await f.login(ids.other);assert.equal((await f.db.query('select * from public.partner_applications')).rows.length,0);
  await assert.rejects(()=>f.rpc('partner_application_history',[ids.customer]),/application_forbidden/);
  await assert.rejects(()=>f.rpc('review_partner_application',[ids.customer,'approved','허위 승인',1]),/admin_required/);
  await f.login(ids.admin);await f.rpc('review_partner_application',[ids.customer,'rejected','등록 번호 보완 필요',1]);
  await f.login(ids.customer);await f.rpc('submit_partner_application',[{...application,credential_reference:'TEST-CORRECTED'},2]);
  let history=await f.rpc('partner_application_history');assert.equal(history.length,3);assert.equal(history[1].reason,'등록 번호 보완 필요');
  await f.login(ids.admin);await assert.rejects(()=>f.rpc('review_partner_application',[ids.customer,'approved','이전 화면으로 승인',2]),/stale_application/);
  await f.login(ids.customer);await f.rpc('withdraw_partner_application',[3]);await f.rpc('submit_partner_application',[application,4]);
  await f.login(ids.admin);await f.rpc('review_partner_application',[ids.customer,'approved','TEST ONLY 자격 확인',5]);
  await f.login(ids.customer);await assert.rejects(()=>f.rpc('submit_partner_application',[application,6]),/application_locked/);await assert.rejects(()=>f.rpc('withdraw_partner_application',[6]),/application_locked/);
  await assert.rejects(()=>f.db.query('select * from private.partner_application_events'));
  await f.login(null,'anon');await assert.rejects(()=>f.rpc('submit_partner_application',[application,0]));
 }finally{await f.db.close();}
});
