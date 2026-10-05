import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {setupUrgent} from './urgent-fixture.mjs';import {ids} from './commerce-fixture.mjs';
async function setup(){const f=await setupUrgent(false);await f.db.exec('reset role');for(const name of ['026_release_controls.sql','027_private_rls.sql','030_public_early_access.sql','031_expert_early_access.sql','032_expert_verification.sql','033_reservation_integrity.sql','034_organization_roster.sql','035_operational_metrics.sql','036_member_rights_admin.sql'])await f.db.exec(await readFile('supabase/'+name,'utf8'));return f;}
test('public signup works independently of policy/phone/invite; no consent overwrite or resurrection',async()=>{const f=await setup();try{
 const fresh='40000000-0000-4000-8000-000000000001';await f.db.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[fresh]);await f.login(fresh);
 await assert.rejects(f.rpc('complete_membership',[false,true,true,false]),/consent_required/);
 assert.equal((await f.rpc('complete_membership',[true,true,true,false])).member,true);
 const release=await f.rpc('release_status');assert.equal(release.signupEnabled,true);assert.equal(release.policiesApproved,false);assert.equal(release.closedBeta,false);assert.equal(release.phoneVerified,false);
 await f.rpc('complete_membership',[true,true,true,true]);const records=(await f.rpc('member_rights',['list'])).consents;assert.equal(records.length,3);assert.equal(records.find(c=>c.type==='MARKETING').accepted,false);assert.equal(records[0].ip_address,null);
 await assert.rejects(f.db.exec('select * from private.consent_records'),/permission denied/);
 await f.rpc('member_rights',['WITHDRAW',{confirmed:true}]);assert.equal((await f.rpc('my_membership')).member,false);await assert.rejects(f.rpc('complete_membership',[true,true,true,true]),/account_inactive/);
 await f.db.exec('reset role');await assert.rejects(f.db.exec("update private.consent_records set accepted=false"),/append_only_consent/);
 }finally{await f.db.close();}});
test('expert draft needs no phone or document and cannot self-publish or spoof verification',async()=>{const f=await setup();try{
 await f.db.exec('update auth.users set phone_confirmed_at=null');await f.login(ids.customer);
 const payload={display_name:'시험 전문가',primary_area:'경기 분당',secondary_areas:['경기 판교'],specialties:['claim','coverage'],weekdays:[1,2,3,4,5],start_hour:9,end_hour:18,consent:true,status:'APPROVED',registration_status:'VERIFIED',map_visible:true};
 const saved=await f.rpc('expert_profile_command',['save',payload]);assert.equal(saved.profile.status,'PROFILE_COMPLETE_VERIFICATION_REQUIRED');assert.equal(saved.profile.registration_status,'NOT_SUBMITTED');assert.equal(saved.profile.map_visible,false);
 assert.deepEqual((await f.rpc('planner_catalog',['',''])).planners,[]);
 await assert.rejects(f.rpc('expert_profile_command',['save',{...payload,specialties:['claim','coverage','death','critical']}]),/invalid_specialties/);
 await assert.rejects(f.rpc('expert_profile_command',['save',{...payload,secondary_areas:['경기 분당']}]),/invalid_area/);
 await assert.rejects(f.rpc('expert_profile_command',['save',{...payload,weekdays:[]}]),/invalid_availability/);
 await f.login(ids.other);assert.equal((await f.rpc('expert_profile_command',['get'])).profile,null);await assert.rejects(f.db.exec('select * from private.expert_profiles'),/permission denied/);
 await f.login(null,'anon');await assert.rejects(f.rpc('expert_profile_command',['get']),/permission denied/);
 }finally{await f.db.close();}});

test('document service is server-only; approval requires verified evidence and phone; deletion hides profile',async()=>{const f=await setup();try{
 await f.login(ids.planner);await f.rpc('expert_profile_command',['save',{display_name:'검증용 전문가',primary_area:'경기 분당',secondary_areas:[],specialties:['claim'],weekdays:[1,2,3,4,5],start_hour:9,end_hour:18,consent:true}]);
 await assert.rejects(f.rpc('early_document_service',[ids.planner,'save',{}]),/permission denied/);
 await f.login(ids.admin);await assert.rejects(f.rpc('early_expert_review',['approve',{user_id:ids.planner,reason:'테스트 확인 근거'}]),/verification_required/);
 await f.login(null,'service_role');const doc=(await f.rpc('early_document_service',[ids.planner,'save',{kind:'registration',path:ids.planner+'/fixture.pdf',filename:'fixture.pdf',mime:'application/pdf',bytes:128}])).document;
 await assert.rejects(f.rpc('early_document_service',[ids.other,'read',{id:doc.id}]),/request_forbidden/);
 await assert.rejects(f.rpc('early_document_service',[ids.planner,'read',{id:doc.id}]),/request_forbidden/);assert.equal((await f.rpc('early_document_service',[ids.admin,'read',{id:doc.id}])).object_path,ids.planner+'/fixture.pdf');
 await f.login(ids.admin);await f.rpc('early_expert_review',['verify',{user_id:ids.planner,kind:'registration',decision:'VERIFIED',reason:'테스트 자료 확인 근거'}]);
 await f.db.exec('reset role');await f.db.query('update auth.users set phone=$1 where id=$2',['+821000000001',ids.planner]);await f.login(ids.admin);
 await f.rpc('early_expert_review',['approve',{user_id:ids.planner,organization:'테스트 소속',registration_reference:'TEST-0001',reason:'테스트 자격 소속 확인'}]);
 assert.equal((await f.rpc('planner_catalog',['',''])).planners.length,1);
 await f.login(null,'service_role');await f.rpc('early_document_service',[ids.planner,'delete',{id:doc.id}]);
 await f.login(ids.customer);assert.equal((await f.rpc('planner_catalog',['',''])).planners.length,0);
 }finally{await f.db.close();}});

test('ten isolated expert and office reservation round trips; duplicate/cross-customer access blocked (local DB clock fixture)',async()=>{const f=await setup();try{
 await f.db.exec("update private.release_controls set policies_approved=true;update auth.users set phone='+821000000001';insert into private.expert_profiles(user_id,display_name,primary_area,specialties,weekdays,start_hour,end_hour,status,registration_status,map_visible) select user_id,'테스트 전문가','경기 분당',array['claim'],array[0,1,2,3,4,5,6],0,23,'APPROVED','VERIFIED',true from private.planner_directory;insert into private.office_locations(id,name,region,status,address,latitude,longitude,weekdays) values('fixture-office','검증용 보험소','경기 분당','active','가상 테스트 주소',37.38,127.12,array[0,1,2,3,4,5,6]);");
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(Date.now()+2*86400000));const stamp=new Date(date+'T10:00:00+09:00').toISOString();
 for(const office of [false,true])for(let i=0;i<10;i++){
 await f.login(ids.customer);const request={purpose:'claim',region:'경기 분당',method:'scheduled',preferred_at:stamp,request_key:crypto.randomUUID(),...(office?{office_id:'fixture-office',office_assignment:true}:{planner_id:ids.planner})};
 const r=await f.cmd('request',request);assert.equal((await f.cmd('request',request)).id,r.id);
 await f.login(ids.other);await assert.rejects(f.cmd('request',{...request,request_key:crypto.randomUUID()}),/slot_unavailable/);assert.equal((await f.rpc('consultation_workspace',['customer'])).bookings.some(b=>b.id===r.id),false);
 if(office){await f.login(ids.admin);const row=await f.row(r.id,'admin');await f.cmd('office_assign',{id:r.id,revision:row.revision,planner_id:ids.planner});}
 await f.login(ids.planner);let row=await f.row(r.id,'partner');await f.cmd('accept',{id:r.id,revision:row.revision});
 await f.login(ids.customer);row=await f.row(r.id);assert.equal(row.state,'coordinating');await assert.rejects(f.cmd('confirm',{id:r.id,revision:row.revision,name:'시험 고객',share_consent:false}),/consent_required/);
 await f.cmd('confirm',{id:r.id,revision:row.revision,name:'시험 고객',phone:'01099999999',share_consent:true});row=await f.row(r.id);assert.equal(row.state,'scheduled');
 await f.db.exec('reset role');await f.db.query("update private.consultations set preferred_at=now()-interval '1 hour' where id=$1",[r.id]);
 await f.login(ids.planner);row=await f.row(r.id,'partner');assert.equal(row.contact.phone,'01000000001');await f.cmd('complete_request',{id:r.id,revision:row.revision});
 await f.login(ids.customer);row=await f.row(r.id);await f.cmd('complete_confirm',{id:r.id,revision:row.revision});assert.equal((await f.row(r.id)).state,'completed');
 }
 await f.login(ids.customer);const slots=await f.rpc('reservation_slots',['fixture-office',null,date]);assert.equal(slots.length,10);assert.equal(slots[0],'09:00');assert.equal(slots.at(-1),'18:00');
 }finally{await f.db.close();}});

test('verified roster matches only authenticated contact; expiry blocks publication; metrics reject arbitrary payload',async()=>{const f=await setup();try{
 await f.db.exec("alter table auth.users add column email text;update auth.users set email='fixture@company.example' where id='"+ids.customer+"'");await f.login(ids.admin);
 const roster=await f.rpc('expert_roster_command',['add',{organization:'가상 회사',email:'fixture@company.example',expires_at:new Date(Date.now()+86400000).toISOString(),reason:'가상 소속 명단 테스트'}]);await f.login(ids.customer);
 const profile=(await f.rpc('expert_profile_command',['save',{display_name:'가상 설계사',primary_area:'경기 분당',secondary_areas:[],specialties:['claim'],weekdays:[1,2,3,4,5],start_hour:9,end_hour:18,consent:true}])).profile;
 assert.equal(profile.organization_status,'VERIFIED');assert.equal(profile.status,'VERIFICATION_PENDING');assert.equal(profile.map_visible,false);
 await f.db.exec('reset role');await f.db.query('update auth.users set phone=$1 where id=$2',['+821000000002',ids.customer]);await f.login(ids.admin);
 await f.rpc('early_expert_review',['approve',{user_id:ids.customer,reason:'회사 명단 원본 확인 테스트'}]);assert.equal((await f.rpc('planner_catalog',['',''])).planners.length,1);
 await f.rpc('expert_roster_command',['revoke',{id:roster.id}]);assert.equal((await f.rpc('planner_catalog',['',''])).planners.length,0);await assert.rejects(f.rpc('early_expert_review',['approve',{user_id:ids.customer,reason:'만료 명단으로 승인 불가'}]),/verification_expired/);await f.login(ids.customer);
 await assert.rejects(f.rpc('expert_roster_command',['list']),/admin_required/);await assert.rejects(f.rpc('record_operational_event',['phone:01012345678']),/invalid_event/);await f.rpc('record_operational_event',['signup_started']);await assert.rejects(f.rpc('operational_metrics'),/admin_required/);
 await f.login(ids.admin);const counters=await f.rpc('operational_metrics');assert.equal(counters[0].total,1);assert.deepEqual(Object.keys(counters[0]).sort(),['event','hour','total']);
 }finally{await f.db.close();}});

test('rights inbox isolates members and admin responses preserve audit and original records',async()=>{const f=await setup();try{
 await f.login(ids.customer);await f.rpc('member_rights',['DELETE',{detail:'테스트 자료 삭제 요청'}]);const mine=(await f.rpc('member_rights',['list'])).requests;assert.equal(mine.length,1);
 await assert.rejects(f.rpc('admin_member_rights',['list']),/admin_required/);await f.login(ids.other);assert.equal((await f.rpc('member_rights',['list'])).requests.length,0);
 await f.login(ids.admin);const inbox=await f.rpc('admin_member_rights',['list']);assert.equal(inbox.length,1);await assert.rejects(f.rpc('admin_member_rights',['respond',{id:mine[0].id,status:'COMPLETED',response:'완료'}]),/invalid_response/);
 await f.rpc('admin_member_rights',['respond',{id:mine[0].id,status:'IN_PROGRESS',response:'보관 근거와 처리 범위를 확인 중입니다.'}]);await f.login(ids.customer);assert.equal((await f.rpc('member_rights',['list'])).requests[0].status,'IN_PROGRESS');assert.equal((await f.rpc('my_membership')).member,true);
 await f.db.exec('reset role');assert.equal((await f.db.query('select count(*)::integer n from private.member_rights_events')).rows[0].n,1);
 }finally{await f.db.close();}});


test('duration policy is server-owned and 18:00 is an inclusive office start',async()=>{const f=await setup();try{
 await f.db.exec("update private.release_controls set policies_approved=true;update auth.users set phone='+821000000001';insert into private.expert_profiles(user_id,display_name,primary_area,specialties,weekdays,start_hour,end_hour,status,registration_status,map_visible) select user_id,'테스트 전문가','경기 분당',array['claim'],array[0,1,2,3,4,5,6],9,20,'APPROVED','VERIFIED',true from private.planner_directory;insert into private.office_locations(id,name,region,status,address,latitude,longitude,weekdays) values('late-office','검증용 보험소','경기 분당','active','가상 테스트 주소',37.38,127.12,array[0,1,2,3,4,5,6]);");
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(Date.now()+3*86400000));
 await f.login(ids.customer);const slots=await f.rpc('reservation_slots',['late-office',null,date]);assert.equal(slots.at(-1),'18:00');
 const office=await f.cmd('request',{purpose:'claim',region:'경기 분당',method:'scheduled',preferred_at:date+'T18:00:00+09:00',request_key:crypto.randomUUID(),office_id:'late-office',office_assignment:true,duration_minutes:30});
 await f.db.exec('reset role');assert.equal((await f.db.query('select duration_minutes from private.consultations where id=$1',[office.id])).rows[0].duration_minutes,60);
 for(const [method,hour,expected] of [['scheduled',10,60],['phone',12,30]]){await f.login(ids.customer);const r=await f.cmd('request',{purpose:'claim',region:'경기 분당',method,preferred_at:date+'T'+hour+':00:00+09:00',request_key:crypto.randomUUID(),planner_id:ids.planner,duration_minutes:999});await f.db.exec('reset role');assert.equal((await f.db.query('select duration_minutes from private.consultations where id=$1',[r.id])).rows[0].duration_minutes,expected);}
 await f.db.exec('update private.service_features set phone_duration_minutes=60');assert.equal((await f.db.query("select private.reservation_duration(null,'phone') n")).rows[0].n,60);
 }finally{await f.db.close();}});
