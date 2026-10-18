import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {setupProfessions,ids,application,day} from './profession-fixture.mjs';
test('management migration: OFF location, owner isolation, tax coordinates and roster conflicts',async()=>{
 const f=await setupProfessions();try{
 await f.db.exec('reset role');
 await f.db.exec("create table private.office_staff(office_id text,user_id uuid);create table if not exists private.notifications(id uuid primary key default gen_random_uuid(),recipient_user_id uuid not null,notification_type text not null,title text not null,body text not null,consultation_id uuid,deep_link text not null,dedupe_key text not null,read_at timestamptz,created_at timestamptz default now(),insurance_office_id text,delivery_status text,updated_at timestamptz default now(),unique(recipient_user_id,dedupe_key));alter table private.notifications add column if not exists insurance_office_id text;alter table private.notifications add column if not exists delivery_status text;alter table private.notifications add column if not exists updated_at timestamptz default now();");
 await f.db.exec(await readFile('tests/fixtures/operational-reservation-alerts.sql','utf8'));
 await f.db.exec('create constraint trigger reservation_notification after insert or update on private.consultations deferrable initially deferred for each row execute function private.reservation_notification();');
 for(const file of ['067_reservation_web_push.sql','069_reservation_event_notifications.sql'])await f.db.exec(await readFile('supabase/'+file,'utf8'));
 if(process.env.MANAGEMENT_BASELINE_FUNCTIONS){for(const row of JSON.parse(await readFile(process.env.MANAGEMENT_BASELINE_FUNCTIONS,'utf8')))await f.db.exec(row.definition);}
 const sql=await readFile('supabase/070_expert_management.sql','utf8');await f.db.exec(sql);await f.db.exec(sql);await f.db.exec(await readFile('supabase/071_help_intent.sql','utf8'));
 await f.login(ids.planner);await f.urgent('stop');
 await f.urgent('update_location',{consent:true,latitude:37.3,longitude:127.1,accuracy:20});
 let s=await f.urgent('settings');assert.equal(s.instant.enabled,false);assert.ok(s.position_checked_at);assert.equal(s.manualLocationUpdate,true);
 assert.equal((await f.rpc('visit_catalog',[{area:'경기 분당'}])).some(p=>p.id===ids.planner),false);
 await assert.rejects(f.urgent('update_location',{latitude:37.3,longitude:127.1,accuracy:20}),/location_consent_required/);
 await f.urgent('start',{consent:true,latitude:37.3,longitude:127.1,accuracy:20,duration:60});const expires=(await f.urgent('settings')).instant.expires_at;
 await f.urgent('update_location',{consent:true,latitude:37.31,longitude:127.11,accuracy:20});assert.equal((await f.urgent('settings')).instant.expires_at,expires);
 await f.urgent('stop');assert.equal((await f.urgent('settings')).position_checked_at,null);
 await f.login(ids.customer);await assert.rejects(f.urgent('update_location',{consent:true,latitude:37.3,longitude:127.1,accuracy:20}),/expert_verification_required/);
 await assert.rejects(f.rpc('office_management',['get',{}]),/office_approval_required/);
 await f.db.exec('reset role');await f.db.query("insert into private.office_locations(id,name,region,status,address,latitude,longitude,operator_user_id) values('managed-office','격리 보험소','경기 분당','active','격리 고정 주소',37.3,127.1,$1)",[ids.planner]);
 await f.db.query("insert into private.office_operator_applications(user_id,display_name,office_name,primary_area,address,phone,status,office_id) values($1,'격리 운영자','격리 보험소','경기 분당','격리 고정 주소','01000000001','APPROVED','managed-office')",[ids.planner]);
 await f.login(ids.planner);let o=await f.rpc('office_management',['get',{}]);assert.equal(o.office.id,'managed-office');
 const before=JSON.stringify(await f.rpc('consultation_workspace',['partner']));
 o=await f.rpc('office_management',['save',{revision:o.office.revision,first_start_hour:10,last_start_hour:16,weekdays:[1,2,3,4,5],accepting_reservations:false}]);assert.equal(o.office.accepting_reservations,false);assert.equal(JSON.stringify(await f.rpc('consultation_workspace',['partner'])),before);
 await assert.rejects(f.rpc('office_management',['save',{revision:1,first_start_hour:9,last_start_hour:17,weekdays:[1],accepting_reservations:true}]),/stale_request/);
 await f.login(ids.customer);await assert.rejects(f.rpc('office_management',['save',{revision:2}]),/office_approval_required/);
 await f.db.exec('reset role');const booking=(await f.db.query("insert into private.consultations(customer_id,purpose,region,method,preferred_at,office_id,allocation_mode) values($1,'claim','경기 분당','scheduled',$2::timestamptz,'managed-office','office') returning id",[ids.customer,day(3)+'T14:00:00+09:00'])).rows[0].id;
 await f.login(ids.customer);await assert.rejects(f.cmd('office_assign',{id:booking,revision:1,planner_id:ids.next}),/request_forbidden|admin_required/);
 await f.login(ids.planner);assert.equal((await f.rpc('notification_reservation',[booking])).workspace,'/partner.html');
 await f.db.exec('reset role');let notices=(await f.db.query('select recipient_user_id from private.notifications where consultation_id=$1',[booking])).rows;assert.ok(notices.some(n=>n.recipient_user_id===ids.planner));
 const count=(await f.db.query('select count(*) n from private.notifications')).rows[0].n;
 await f.login(ids.planner);await f.rpc('office_management',['get',{}]);await f.urgent('settings');await f.rpc('notification_reservation',[booking]);await f.db.exec('reset role');assert.equal((await f.db.query('select count(*) n from private.notifications')).rows[0].n,count);assert.equal((await f.db.query('select count(*) n from private.notifications where read_at is not null')).rows[0].n,0);
 await f.login(ids.other);await assert.rejects(f.rpc('notification_reservation',[booking]),/reservation_not_found/);
 await f.login(ids.planner);o=await f.rpc('office_management',['assign',{id:booking,revision:1,planner_id:ids.next}]);assert.equal(o.bookings.find(x=>x.id===booking).assigned,true);
 await assert.rejects(f.rpc('office_management',['assign',{id:f.previous.id,revision:1,planner_id:ids.next}]),/request_forbidden/);
 await f.db.exec('reset role');assert.equal((await f.db.query('select state from private.consultations where id=$1',[booking])).rows[0].state,'requested');
 await assert.rejects(f.db.query("select private.check_reservation_slot(null,'managed-office',date_trunc('day',now())+interval '7 days 5 hours',null,'scheduled')"),/office_booking_paused/);
 await f.login(ids.planner);await assert.rejects(f.db.query('select * from private.tax_office_verifications'),/permission denied/);
 await f.login(ids.other);await f.rpc('expert_profile_command',['save',application('tax')]);
 await f.login(ids.admin);await f.rpc('early_expert_review',['verify_tax_office',{user_id:ids.other,address:application().office_address,latitude:37.5,longitude:127.02,reason:'격리 사무소 주소 좌표 확인'}]);
 await assert.rejects(f.rpc('early_expert_review',['verify_tax_office',{user_id:ids.other,address:'다른 주소',latitude:37.5,longitude:127.02,reason:'격리 사무소 주소 좌표 확인'}]),/office_address_changed/);
 await f.login(ids.other);await assert.rejects(f.rpc('early_expert_review',['verify_tax_office',{user_id:ids.other}]),/admin_required/);
 for(const kind of ['registration','appointment']){await f.login(ids.other,'service_role');await f.rpc('early_document_service',[ids.other,'save',{profession:'tax',kind,path:ids.other+'/'+crypto.randomUUID()+'.pdf',filename:'격리.pdf',mime:'application/pdf',bytes:100}]);await f.login(ids.admin);await f.rpc('early_expert_review',['verify',{user_id:ids.other,kind,decision:'VERIFIED',reason:'격리 등록 사무소 자료 확인'}]);}
 await f.rpc('early_expert_review',['approve',{user_id:ids.other,reason:'격리 자격 확인 후 승인'}]);let tax=(await f.rpc('planner_catalog',['',''])).planners.find(p=>p.id===ids.other);assert.equal(tax.office_coordinates_verified,true);assert.equal(tax.office_latitude,37.5);
 await f.db.exec('reset role');await f.db.query("update private.expert_profiles set office_address='변경된 사무소 주소' where user_id=$1",[ids.other]);await f.login(ids.customer);tax=(await f.rpc('planner_catalog',['',''])).planners.find(p=>p.id===ids.other);assert.equal(tax.office_coordinates_verified,false);assert.equal(tax.office_latitude,null);
 await f.db.exec('reset role');await f.db.query("update private.expert_profiles set profession='planner',organization='격리 회사' where user_id=$1",[ids.planner]);
 await f.login(ids.admin);const r=await f.rpc('expert_roster_command',['add',{applicant_name:'다른 이름',organization:'격리 회사',email:'fixture@example.test',expires_at:'2099-01-01',reason:'격리 명단 확인 자료'}]);
 await f.db.exec('reset role');await f.db.query('update private.expert_profiles set roster_id=$1 where user_id=$2',[r.id,ids.planner]);
 await f.login(ids.admin);await assert.rejects(f.rpc('early_expert_review',['approve',{user_id:ids.planner,reason:'격리 승인 시도 차단'}]),/NAME_CONFLICT/);
 await f.db.exec('reset role');await f.db.query("update private.organization_roster set applicant_name=null where id=$1",[r.id]);await f.login(ids.admin);await assert.rejects(f.rpc('early_expert_review',['approve',{user_id:ids.planner,reason:'격리 승인 시도 차단'}]),/NAME_REQUIRED/);
 await f.rpc('expert_roster_command',['confirm_name',{id:r.id,applicant_name:'격리 테스트 전문가',reason:'기존 명단 원자료 명의 확인'}]);
 await assert.rejects(f.rpc('expert_roster_command',['confirm_name',{id:r.id,applicant_name:'다른 이름',reason:'기존 명의 변경 차단 검증'}]),/roster_name_already_set_or_expired/);
 await f.db.exec('reset role');assert.equal((await f.db.query('select private.roster_identity_check($1) state',[ids.planner])).rows[0].state,'MATCHED');

 await f.db.exec('reset role');await f.db.query("update private.organization_roster set applicant_name=(select display_name from private.expert_profiles where user_id=$2),organization='다른 회사' where id=$1",[r.id,ids.planner]);await f.login(ids.admin);await assert.rejects(f.rpc('early_expert_review',['approve',{user_id:ids.planner,reason:'격리 승인 시도 차단'}]),/ORGANIZATION_CONFLICT/);
 await f.rpc('expert_roster_command',['revoke',{id:r.id}]);await assert.rejects(f.rpc('early_expert_review',['approve',{user_id:ids.planner,reason:'격리 승인 시도 차단'}]),/EXPIRED/);
 }finally{await f.db.close();}
});
