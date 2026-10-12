import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {setupIntegration,ids,taxId,day} from './expert-integration-fixture.mjs';

test('isolated integration: consent, tax review, catalog, cost snapshot, calendar and permissions',async()=>{
 const f=await setupIntegration();const sql=async(s,a=[])=>{await f.db.exec('reset role');return (await f.db.query(s,a)).rows;};
 const request=(hour='09:00',extra={})=>({integration:true,planner_id:taxId,region:'경기 분당',purpose:'other',method:'scheduled',meeting_mode:'expert_office',preferred_at:day(3)+'T'+hour+':00+09:00',options_revision:2,fee_acknowledged:true,request_key:crypto.randomUUID(),...extra});
 try{
  await f.login(taxId);await assert.rejects(f.rpc('expert_profile_command',['save',{...f.profile,operating_consent:false}]),/operating_consent_required/);
  await assert.rejects(f.rpc('expert_profile_command',['save',f.profile]),/profession_not_open/);
  assert.equal((await sql('select count(*)::integer n from private.consent_records where user_id=$1 and source=$2',[taxId,'expert_operating_principles']))[0].n,0);
  await f.owner('update private.expert_integration_settings set tax_enabled=true,unified_booking=true;update private.service_features set expert_applications=true');
  await f.login(ids.customer);await assert.rejects(f.rpc('expert_profile_command',['save',{...f.profile,profession:'planner',policy_version:'planner-protection-2026-10-12-v2',operating_consent:false}]),/operating_consent_required/);
  await f.login(ids.planner);const old=(await f.rpc('expert_profile_command',['get'])).profile;
  await f.rpc('expert_profile_command',['save',{...old,consent:true}]);
  assert.equal((await f.rpc('expert_profile_command',['get'])).policyAccepted,false);
  await f.rpc('expert_profile_command',['consent',{operating_consent:true,policy_version:'planner-protection-2026-10-12-v2'}]);
  await f.rpc('expert_profile_command',['consent',{operating_consent:true,policy_version:'planner-protection-2026-10-12-v2'}]);
  assert.equal((await sql("select count(*)::integer n from private.consent_records where user_id=$1 and source='expert_operating_principles'",[ids.planner]))[0].n,1);
  await f.approvedTax();
  await assert.rejects(f.rpc('urgent_command',['start',{consent:true,latitude:37.3,longitude:127.1,accuracy:20,duration:60}]),/expert_verification_required/);
  await sql('update private.expert_integration_settings set tax_enabled=false');await f.login(ids.customer);
  assert.ok(!(await f.rpc('planner_catalog',['',''])).planners.some(p=>p.id===taxId));
  await assert.rejects(f.cmd('request',request()),/invalid_partner/);
  await sql('update private.expert_integration_settings set tax_enabled=true');await f.login(taxId);
  await assert.rejects(f.rpc('expert_photo_service',[taxId,'get']),/permission denied/);
  await f.login(taxId,'service_role');
  await assert.rejects(f.rpc('early_document_service',[taxId,'save',{profession:'tax',kind:'appointment',path:taxId+'/wrong.pdf',filename:'wrong.pdf',mime:'application/pdf',bytes:128}]),/invalid_document/);
  const photo=await f.rpc('expert_photo_service',[taxId,'save',{version:crypto.randomUUID()}]);assert.match(photo.photo_url,/api\/expert-photo/);
  await f.rpc('expert_photo_service',[taxId,'clear']);
  await f.login(taxId);const docs=await f.rpc('early_expert_documents');assert.equal(docs.length,1);assert.equal(docs[0].object_path,undefined);
  await f.login(ids.customer,'service_role');await assert.rejects(f.rpc('early_document_service',[ids.customer,'read',{id:docs[0].id}]),/request_forbidden/);
  await f.login(ids.admin,'service_role');assert.ok((await f.rpc('early_document_service',[ids.admin,'read',{id:docs[0].id}])).object_path);
  await f.login(taxId);
  await f.rpc('expert_optional_profile',['save',{insurance_types:[],help_tasks:['tax_consultation'],biography:'함께 확인합니다 😊'}]);
  await assert.rejects(f.rpc('expert_optional_profile',['save',{insurance_types:['life'],help_tasks:[]}]),/invalid_options/);
  await f.login(ids.customer);let p=(await f.rpc('planner_catalog',['',''])).planners.find(p=>p.id===taxId);assert.equal(p.profession,'tax');assert.equal(p.consultation_options.fee.amount,50000);assert.deepEqual(p.insurance_types,[]);
  await assert.rejects(f.rpc('expert_consultation_settings',['save',{revision:2,modes:[]}]),/expert_required/);
  await assert.rejects(f.rpc('early_expert_review',['approve',{user_id:taxId}]),/admin_required/);
  await assert.rejects(f.db.query('select * from private.verification_documents'),/permission denied/);
  await assert.rejects(f.db.query('select * from private.expert_integration_backup'),/permission denied/);
  const slots=await f.rpc('integration_slots',[taxId,null,'expert_office',day(3)]);assert.equal(slots[0],'09:00');assert.equal(slots.at(-1),'17:00');assert.equal(slots.length,9);
  await sql('update private.expert_profiles set start_hour=10,end_hour=16 where user_id=$1',[taxId]);await f.login(ids.customer);
  const restricted=await f.rpc('integration_slots',[taxId,null,'expert_office',day(3)]);assert.equal(restricted[0],'10:00');assert.equal(restricted.at(-1),'15:00');
  await sql('update private.expert_profiles set weekdays=array[(extract(dow from $2::date)::int+1)%7] where user_id=$1',[taxId,day(3)]);await f.login(ids.customer);
  assert.deepEqual(await f.rpc('integration_slots',[taxId,null,'expert_office',day(3)]),[]);
  await sql('update private.expert_profiles set weekdays=array[0,1,2,3,4,5,6],start_hour=9,end_hour=18 where user_id=$1',[taxId]);await f.login(ids.customer);
  await assert.rejects(f.cmd('request',request('18:00')),/invalid_slot/);
  await assert.rejects(f.cmd('request',request('09:30')),/invalid_slot/);
  await assert.rejects(f.cmd('request',request('09:00',{fee_acknowledged:false})),/fee_consent_required/);
  await assert.rejects(f.cmd('request',request('09:00',{options_revision:1})),/conditions_changed/);
  const payload=request(),created=await f.cmd('request',payload);assert.equal((await f.cmd('request',payload)).replay,true);
  let row=await f.row(created.id);assert.equal(row.duration_minutes,60);assert.equal(row.state,'requested');assert.equal(row.integration_details.fee.amount,50000);assert.equal(row.planner_id,taxId);
  await f.login(ids.other);assert.ok(!(await f.rpc('consultation_workspace',['customer'])).bookings.some(b=>b.id===created.id));
  await assert.rejects(f.cmd('request',request()),/reservation_slot_taken/);
  await f.login(taxId);await f.rpc('expert_consultation_settings',['save',{revision:2,modes:['expert_office'],office_address:'바뀐 사무실 주소',fee:{status:'check'}}]);
  await f.cmd('accept',{id:created.id,revision:(await f.row(created.id,'partner')).revision,place:'사무실'});
  await f.login(ids.customer);row=await f.row(created.id);assert.equal(row.integration_details.fee.amount,50000);assert.equal(row.integration_details.place,'격리 사무실 주소 101호');
  await f.cmd('confirm',{id:created.id,revision:row.revision,care_revision:(await f.get(created.id)).revision,name:'격리 고객',share_consent:true});
  await f.login(taxId);await f.cmd('profile',{available:false,phone:'01000000003'});
  await f.login(ids.customer);assert.equal((await f.row(created.id)).state,'scheduled');assert.equal((await f.rpc('planner_catalog',['',''])).planners.find(p=>p.id===taxId).available,false);
  await assert.rejects(f.cmd('request',request('17:00',{options_revision:3})),/invalid_partner/);
  await f.login(taxId);await f.cmd('profile',{available:true,phone:'01000000003'});
  await sql("insert into private.office_locations(id,name,region,status,address,latitude,longitude,weekdays,operator_user_id) values('integration-office','확인 보험소','경기 분당','active','확인 사무실',37.3,127.1,array[0,1,2,3,4,5,6],$1)",[taxId]);
  await f.login(taxId);await f.rpc('expert_consultation_settings',['save',{revision:3,modes:['insurance_office'],fee:{status:'free',scope:'기초 상담',extra:'추가 업무 별도 합의',tax_note:'추가 세금 없음'}}]);
  await f.login(ids.customer);await assert.rejects(f.cmd('request',request('17:00',{office_id:'unknown',meeting_mode:'insurance_office',options_revision:4})),/office_relation_required/);
  await sql("insert into private.office_calendar_exceptions(office_id,day,closed) values('integration-office',$1,true)",[day(3)]);await f.login(ids.customer);
  assert.deepEqual(await f.rpc('integration_slots',[taxId,'integration-office','insurance_office',day(3)]),[]);
  await sql("update private.office_calendar_exceptions set closed=false where office_id='integration-office'");await f.login(ids.customer);
  const atOffice=await f.cmd('request',request('17:00',{office_id:'integration-office',meeting_mode:'insurance_office',options_revision:4}));row=await f.row(atOffice.id);assert.equal(row.office_id,'integration-office');assert.equal(row.planner_id,taxId);assert.equal(row.duration_minutes,60);
  await f.login(ids.other);await assert.rejects(f.cmd('request',request('17:00',{office_id:'integration-office',meeting_mode:'insurance_office',options_revision:4})),/reservation_slot_taken/);
  // The pre-existing office flow still permits an 18:00 start.
  await sql("insert into private.office_locations(id,name,region,status,address,latitude,longitude,weekdays) values('legacy-office','기존 보험소','경기 분당','active','기존 사무실',37.3,127.1,array[0,1,2,3,4,5,6])");
  await f.login(ids.customer);const legacy=await f.cmd('request',{office_assignment:true,office_id:'legacy-office',purpose:'claim',region:'경기 분당',method:'scheduled',preferred_at:day(4)+'T18:00:00+09:00',request_key:crypto.randomUUID()});assert.equal((await f.row(legacy.id)).integration_details,null);
  await f.db.exec('reset role');const rollback=await readFile('supabase/rollback_expert_integration.sql','utf8');
  await assert.rejects(f.db.exec(rollback),/active_integration_bookings_require_review/);await f.db.exec('rollback');
  await f.login(ids.customer);await f.act('cancel',created.id);await f.act('cancel',atOffice.id);
  const records=await sql('select count(*)::integer n from private.consent_records');
  await f.db.exec(rollback);await f.db.exec(rollback);
  assert.deepEqual(await sql('select count(*)::integer n from private.consent_records'),records);
  await f.login(ids.customer);assert.equal((await f.row(legacy.id)).duration_minutes,60);await assert.rejects(f.rpc('expert_integration_capabilities'),/permission denied/);
  await f.db.exec('reset role');for(const name of ['062_expert_types_policy.sql','063_unified_expert_booking.sql','064_growth_summary.sql'])await f.db.exec(await readFile('supabase/'+name,'utf8'));
  await f.login(ids.customer);assert.equal((await f.rpc('expert_integration_capabilities')).unifiedBooking,false);
 }finally{await f.db.close();}
});

test('legacy expert submit also requires the new version; helper functions stay private',async()=>{
 const f=await setupIntegration({legacy:true});try{
  await f.login(ids.other);await assert.rejects(f.rpc('expert_submit',[{profession:'planner'},0]),/operating_consent_required/);
  await assert.rejects(f.rpc('expert_submit',[{profession:'planner',operating_consent:true,policy_version:'old-version'},0]),/operating_consent_required/);
  for(const [name,args]of [['submit_before_policy',[{},0]],['expert_profile_before_types',['save',{}]],['command_before_integration',['request',{}]],['catalog_before_integration',['','']]])await assert.rejects(f.rpc(name,args),/permission denied/);
  await assert.rejects(f.rpc('expert_submit',[{profession:'planner',operating_consent:true,policy_version:'planner-protection-2026-10-12-v2'},0]),/phone_verification_required/);
 }finally{await f.db.close();}
});

test('existing nonpublic first draft is edited in place; summary and hidden content remain protected',async()=>{
 const f=await setupIntegration(),seed=JSON.parse(await readFile('data/growth-first-draft.json','utf8'));
 const cmd=(op,p={})=>f.rpc('growth_command',[op,p]),write=(op,p={})=>cmd(op,{...p,request_key:crypto.randomUUID()});
 try{
  await f.login(ids.admin);const first=await write('admin_save',{source_key:seed.source_key,content:{...seed.content,title:'이전 비공개 첫 원고'}});
  assert.deepEqual(await f.rpc('growth_first_draft'),seed);
  let row=(await cmd('admin_list')).find(r=>r.source_key===seed.source_key);assert.equal(row.id,first.id);
  await write('admin_save',{id:row.id,revision:row.revision,content:seed.content});row=(await cmd('admin_list'))[0];assert.equal((await cmd('admin_list')).length,1);assert.equal(row.draft.title,seed.content.title);
  execFileSync(process.execPath,['scripts/build-expert-integration-candidate.mjs'],{stdio:'pipe'});
  const packageSQL=await readFile('artifacts/expert-integration-candidate.sql','utf8');
  await f.db.exec('reset role');await f.db.exec(packageSQL);await f.db.exec(packageSQL);
  await assert.rejects(f.db.exec(packageSQL.replace(/\ncommit;\s*$/,'\nupdate private.expert_integration_settings set tax_enabled=true;select 1/0;commit;')),/division by zero/);await f.db.exec('rollback');
  assert.equal((await f.db.query('select tax_enabled from private.expert_integration_settings')).rows[0].tax_enabled,false);
  await f.login(ids.admin);assert.equal((await cmd('admin_list')).length,1);assert.equal((await cmd('admin_list'))[0].draft.title,seed.content.title);
  await assert.rejects(write('admin_save',{id:row.id,revision:row.revision,content:{...seed.content,summary:'가'.repeat(201)}}),/invalid_content/);
  await f.login(ids.planner);assert.deepEqual(await cmd('library'),[]);await assert.rejects(f.rpc('growth_first_draft'),/admin_required/);await assert.rejects(cmd('content',{id:first.id}),/content_unavailable/);await assert.rejects(write('admin_publish',{id:first.id,revision:row.revision}),/admin_required/);
 }finally{await f.db.close();}
});
