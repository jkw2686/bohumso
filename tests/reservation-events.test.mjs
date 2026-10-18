import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {setupVisits} from './expert-visits-fixture.mjs';import {ids} from './commerce-fixture.mjs';
const now='2030-01-14T03:10:00Z';const date=n=>`2030-01-${String(14+n).padStart(2,'0')}T14:00:00+09:00`;
async function setup(care=false,tax=false){const f=await setupVisits({now});await f.db.exec('reset role');
 for(const n of ['052_optional_expert_profile.sql','053_connection_review.sql','054_profile_office_scope.sql',...(care?['055_appointment_care.sql']:[])])await f.db.exec(await readFile('supabase/'+n,'utf8'));
 // Reproduce only the operational notification schema/trigger, no real user data.
 await f.db.exec(`create table if not exists private.office_staff(office_id text,user_id uuid);create table if not exists private.notifications(id uuid primary key default gen_random_uuid(),recipient_user_id uuid not null,notification_type text not null,title text not null,body text not null,consultation_id uuid,deep_link text not null,dedupe_key text not null,read_at timestamptz,created_at timestamptz default now(),unique(recipient_user_id,dedupe_key));alter table private.notifications add column if not exists insurance_office_id text;alter table private.notifications add column if not exists delivery_status text;alter table private.notifications add column if not exists updated_at timestamptz default now();`);
 await f.db.exec(await readFile('tests/fixtures/operational-reservation-alerts.sql','utf8'));
 await f.db.exec('create constraint trigger reservation_notification after insert or update on private.consultations deferrable initially deferred for each row execute function private.reservation_notification();');
 await f.db.exec(await readFile('supabase/067_reservation_web_push.sql','utf8'));
 const sql=await readFile('supabase/069_reservation_event_notifications.sql','utf8');await f.db.exec(sql);await f.db.exec(sql);await f.db.exec('create trigger urgent_notification after update on private.urgent_requests for each row execute function private.urgent_notification();create trigger urgent_offer_notification after insert on private.urgent_offers for each row execute function private.urgent_notification();');
 if(tax){await f.db.exec('create table private.phone_contacts(user_id uuid primary key,phone_e164 text,phone_verification_status text,phone_verified_at timestamptz)');for(const n of ['043_auth_phone_status_bridge.sql','051_phone_signup.sql','056_booking_hardening.sql','066_profession_registration.sql'])await f.db.exec(await readFile('supabase/'+n,'utf8'));await f.db.query("update private.expert_profiles set profession='tax',organization_status='VERIFIED',fee_mode='free',specialties=array['tax_income'] where user_id=$1",[ids.planner]);await f.db.query("update public.partner_applications set profession='tax' where user_id=$1",[ids.planner]);await f.db.query('update private.planner_directory set is_sample=false where user_id=$1',[ids.planner]);await f.db.query('update auth.users set phone_confirmed_at=now() where id=$1',[ids.planner]);await f.db.query("insert into private.phone_contacts values($1,'+821000000001','OTP_VERIFIED',now())",[ids.planner]);}
 f.notices=async(id,type)=>{await f.db.exec('reset role');return (await f.db.query('select * from private.notifications where consultation_id=$1 and notification_type=$2 order by recipient_user_id',[id,'BOOKING_'+type])).rows;};
 f.service=async(op,payload={},subject=null)=>{await f.login(null,'service_role');return f.rpc('reservation_web_push_service',[subject,op,payload]);};
 f.register=async(user)=>f.service('register',{device_id:crypto.randomUUID(),device_hash:'a'.repeat(64),binding:crypto.randomUUID(),subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/'+user,keys:{auth:'A'.repeat(22),p256dh:'B'.repeat(87)}}},user);
 return f;
}
const payload=(extra={})=>({planner_id:ids.planner,purpose:'claim',region:'경기 분당',method:'phone',preferred_at:date(2),request_key:crypto.randomUUID(),...extra});
for(const mode of ['planner','tax','office'])test('basic booking events '+mode+': both roles, OFF, replay, proposals, completion, push and authorized links without care',async()=>{const tax=mode==='tax',office=mode==='office',f=await setup(false,tax);try{
 if(office){await f.db.exec("insert into private.office_locations(id,name,region,status,address,latitude,longitude,weekdays) values('full-office','격리 보험소','경기 분당','active','격리 주소',37.3,127.1,array[0,1,2,3,4,5,6]);");await f.register(ids.admin);}
 await f.register(ids.customer);await f.register(ids.planner);await f.login(ids.customer);const p=payload(tax?{purpose:'other',fee_ack:'세무 상담료: 무료'}:office?{planner_id:null,office_id:'full-office',office_assignment:true,method:'scheduled'}:{});const {id}=await f.cmd('request',p);await f.cmd('request',p);
 let rows=await f.notices(id,'REQUESTED');assert.equal(rows.length,2);assert.equal(rows[0].title,'상담 요청 접수');assert.match(rows[0].body,/확정 전/);assert.equal(rows[1].title,'새 예약 요청');
 if(office){await f.login(ids.admin);await f.cmd('office_assign',{id,revision:(await f.row(id,'admin')).revision,planner_id:ids.planner});}
 const both=async(type)=>{const a=await f.notices(id,type);assert.equal(a.length,2,type);assert.deepEqual(a.map(n=>n.recipient_user_id),[ids.customer,ids.planner]);for(const n of a)assert.equal(n.deep_link,'/notifications.html?reservation='+id);};
 await f.login(ids.planner);await f.cmd('accept',{id,revision:(await f.row(id,'partner')).revision});await both('ACCEPTED');
 await f.login(ids.customer);await f.cmd('confirm',{id,revision:(await f.row(id)).revision,name:'격리 고객',share_consent:true});await both('CONFIRMED');
 await f.login(ids.customer);await f.cmd('propose',{id,revision:(await f.row(id)).revision,preferred_at:date(3)});await both('PROPOSED');
 await f.login(ids.planner);await f.cmd('schedule_accept',{id,revision:(await f.row(id,'partner')).revision});await both('CHANGED');
 await f.db.exec('reset role');await f.db.query("update private.consultations set preferred_at=now()-interval '1 minute',revision=revision+1 where id=$1",[id]);
 await f.db.exec('alter table private.notifications alter column created_at set default now()');await f.login(ids.planner);await f.cmd('complete_request',{id,revision:(await f.row(id,'partner')).revision});await both('COMPLETION_REQUESTED');
 await f.login(ids.customer);await f.cmd('complete_confirm',{id,revision:(await f.row(id)).revision});await both('COMPLETED');
 // New notifications only; prior-day events are intentionally not replayed by the worker.
 const jobs=await f.service('claim');assert.equal(jobs.length,10);for(const job of jobs){const a=await f.service('authorize',job);assert.equal(a.reservationId,id);assert.ok(a.type.startsWith('BOOKING_'));await f.service('finish',{...job,state:'SENT'});}const remaining=await f.service('claim');assert.equal(remaining.length,office?8:6);for(const job of remaining)await f.service('finish',{...job,state:'SENT'});assert.equal((await f.service('claim')).length,0);
 await f.login(ids.customer);const before=(await f.rpc('notification_inbox',['list'])).items.length;await f.rpc('notification_reservation',[id]);assert.equal((await f.rpc('notification_inbox',['list'])).items.length,before);assert.equal((await f.rpc('notification_inbox',['list'])).items.every(n=>!n.read_at),true);
 await f.login(ids.other);await assert.rejects(f.rpc('notification_reservation',[id]),/reservation_not_found/);
 await f.login(ids.customer);await f.rpc('reservation_notification_settings',['set',{enabled:false}]);const r=await f.cmd('request',payload({preferred_at:date(6),...(tax?{purpose:'other',fee_ack:'세무 상담료: 무료'}:{})}));assert.equal((await f.notices(r.id,'REQUESTED')).length,1);
 await f.login(ids.planner);await f.cmd('pass',{id:r.id,revision:(await f.row(r.id,'partner')).revision});const rejected=await f.notices(r.id,'REJECTED');assert.equal(rejected.length,1);assert.equal(rejected[0].recipient_user_id,ids.planner);
 console.log('PASS care absent: actual commands, bilateral stage messages, actor receipt, OFF, deep-link permissions, no read side effect, push claim/authorize/dedupe');
}finally{await f.db.close();}});

test('office has only authorized staff recipient before assignment; cancellation reaches both',async()=>{const f=await setup();try{
 await f.db.exec("insert into private.office_locations(id,name,region,status,address,latitude,longitude,weekdays) values('notice-office','격리 보험소','경기 분당','active','격리 주소',37.3,127.1,array[0,1,2,3,4,5,6]);");
 await f.login(ids.customer);const {id}=await f.cmd('request',payload({planner_id:null,office_id:'notice-office',office_assignment:true,method:'scheduled'}));
 assert.deepEqual((await f.notices(id,'REQUESTED')).map(n=>n.recipient_user_id),[ids.customer,ids.admin]);
 await f.login(ids.admin);await f.cmd('office_assign',{id,revision:(await f.row(id,'admin')).revision,planner_id:ids.planner});
 await f.login(ids.planner);await f.cmd('accept',{id,revision:(await f.row(id,'partner')).revision});
 await f.login(ids.customer);await f.cmd('confirm',{id,revision:(await f.row(id)).revision,name:'격리 고객',share_consent:true});assert.equal((await f.notices(id,'CONFIRMED')).length,2);
 await f.login(ids.customer);await f.cmd('cancel',{id,revision:(await f.row(id)).revision});assert.equal((await f.notices(id,'CANCELLED')).length,2);
}finally{await f.db.close();}});

test('optional appointment adapter emits typed proposals with reservation ID, and list cannot flush reminders',async()=>{const f=await setup(true);try{
 await f.register(ids.customer);await f.register(ids.planner);
 await f.login(ids.customer);const {id}=await f.cmd('request',payload());await f.login(ids.planner);await f.cmd('accept',{id,revision:(await f.row(id,'partner')).revision,place:'전화상담'});await f.login(ids.customer);const a=await f.rpc('appointment_care',['get',{kind:'consultation',id}]);await f.cmd('confirm',{id,revision:(await f.row(id)).revision,care_revision:a.revision,name:'격리 고객',share_consent:true});
 const current=await f.rpc('appointment_care',['get',{kind:'consultation',id}]);await f.rpc('appointment_care',['propose',{kind:'consultation',id,revision:current.revision,request_key:crypto.randomUUID(),at:date(3),method:'phone',place:'전화상담'}]);assert.equal((await f.notices(id,'PROPOSED')).length,2);
 await f.db.exec("create or replace function pg_catalog.now() returns timestamptz language sql stable as $$select '2030-01-16T04:45:00Z'::timestamptz$$");await f.login(ids.customer);await f.rpc('appointment_care',['inbox']);assert.equal((await f.notices(id,'REMINDER')).length,0);
 await f.service('claim');const reminders=await f.notices(id,'REMINDER');assert.equal(reminders.length,2);
 // Fixed-clock fixture defaults were compiled before the clock advanced.
 await f.db.query("update private.notifications set created_at=now() where consultation_id=$1 and notification_type='BOOKING_REMINDER'",[id]);
 const reminderJobs=await f.service('claim');assert.equal(reminderJobs.length,2);for(const job of reminderJobs){assert.equal((await f.service('authorize',job)).type,'BOOKING_REMINDER');await f.service('finish',{...job,state:'RETRY'});}
 await f.login(ids.planner);let care=await f.rpc('appointment_care',['get',{kind:'consultation',id}]);await f.rpc('appointment_care',['change_accept',{kind:'consultation',id,revision:care.revision,request_key:crypto.randomUUID()}]);
 await f.db.exec('reset role');for(const n of reminders)assert.equal((await f.db.query('select private.booking_push_current(n) valid from private.notifications n where id=$1',[n.id])).rows[0].valid,false);
 await f.service('claim');await f.db.exec('reset role');for(const job of reminderJobs)assert.equal((await f.db.query('select state from private.web_push_deliveries where id=$1',[job.id])).rows[0].state,'CANCELLED');
 assert.equal((await f.db.query("select count(*)::int n from private.appointment_reminders where appointment_id=$1 and state='pending' and scheduled_at<$2",[id,date(3)])).rows[0].n,0);
 await f.login(ids.customer);care=await f.rpc('appointment_care',['get',{kind:'consultation',id}]);await f.rpc('appointment_care',['cancel',{kind:'consultation',id,revision:care.revision,request_key:crypto.randomUUID()}]);await f.db.exec('reset role');assert.equal((await f.db.query("select count(*)::int n from private.appointment_reminders where appointment_id=$1 and state='pending'",[id])).rows[0].n,0);
}finally{await f.db.close();}});

test('same-transaction acceptance and confirmation coalesce; notification failure does not undo booking or other recipient',async()=>{const f=await setup();try{
 await f.login(ids.customer);const {id}=await f.cmd('request',payload());await f.db.exec('reset role');
 await f.db.exec('begin');await f.db.query("update private.consultations set planner_ok=true,state='coordinating',revision=revision+1 where id=$1",[id]);await f.db.query("update private.consultations set customer_ok=true,state='scheduled',revision=revision+1 where id=$1",[id]);await f.db.exec('commit');
 assert.equal((await f.notices(id,'ACCEPTED')).length,0);assert.equal((await f.notices(id,'CONFIRMED')).length,2);
 await f.db.exec(`create function private.fixture_notice_failure() returns trigger language plpgsql as $$begin if new.recipient_user_id='${ids.customer}' then raise exception 'fixture_failure';end if;return new;end$$;create trigger fixture_notice_failure before insert on private.notifications for each row execute function private.fixture_notice_failure();`);
 await f.login(ids.customer);await f.cmd('cancel',{id,revision:(await f.row(id)).revision});assert.equal((await f.row(id)).state,'cancelled');assert.equal((await f.notices(id,'CANCELLED')).length,1);
}finally{await f.db.close();}});

test('decline, departure, arrival, retry exhaustion and legacy appointment is not a wildcard push target',async()=>{const f=await setup();try{
 await f.register(ids.customer);await f.login(ids.customer);const {id}=await f.cmd('request',payload());
 await f.cmd('propose',{id,revision:(await f.row(id)).revision,preferred_at:date(3)});await f.login(ids.planner);await f.cmd('schedule_decline',{id,revision:(await f.row(id,'partner')).revision});assert.equal((await f.notices(id,'CHANGE_DECLINED')).length,2);
 await f.db.exec('reset role');for(const state of ['departed','arrived']){await f.db.query('update private.consultations set journey_state=$1,revision=revision+1 where id=$2',[state,id]);const a=await f.notices(id,state.toUpperCase());assert.equal(a.length,1);assert.equal(a[0].recipient_user_id,ids.customer);}
 await f.db.query("insert into private.notifications(recipient_user_id,notification_type,title,body,deep_link,dedupe_key) values($1,'appointment','기타 약속','시험','/notifications.html','unknown-appointment')",[ids.customer]);
 const jobs=await f.service('claim');assert.equal(jobs.length,5);const job=jobs[0];await f.service('finish',{...job,state:'RETRY',errorCode:'PROVIDER_REJECTED'});await f.db.exec('reset role');await f.db.query('update private.web_push_deliveries set attempts=3 where id=$1',[job.id]);await f.service('claim');await f.db.exec('reset role');assert.equal((await f.db.query('select state from private.web_push_deliveries where id=$1',[job.id])).rows[0].state,'FAILED');
}finally{await f.db.close();}});

const visitPayload=()=>({request_key:crypto.randomUUID(),planner_id:ids.planner,area:'경기 분당',purpose:'claim',meeting_kind:'address',place:'격리 주소',phone:'01000000000',note:'비공개 상담 내용',preferred_at:'2030-01-14T04:10:00Z',consent:true});
test('live visit path: actor receipt, confirmed_at without state change, push ID, exact permissions and no read mutation',async()=>{const f=await setup();try{
 await f.register(ids.customer);await f.register(ids.planner);await f.login(ids.customer);const p=visitPayload(),{id}=await f.urgent('request',p);await f.urgent('request',p);
 const notices=async ev=>{await f.db.exec('reset role');return (await f.db.query("select * from private.notifications where dedupe_key=$1 order by recipient_user_id",['visit-v2:'+id+':'+ev])).rows;};
 assert.equal((await notices('REQUESTED')).length,2);
 await f.login(ids.other);await assert.rejects(f.rpc('notification_reservation',[id]),/reservation_not_found/);
 await f.login(ids.planner);assert.equal((await f.rpc('notification_reservation',[id])).workspace,'/urgent.html');await f.urgent('accept',{id});assert.equal((await notices('ACCEPTED')).length,2);
 await f.login(ids.customer);await f.urgent('confirm_visit',{id,consent:true});await f.urgent('confirm_visit',{id,consent:true});assert.equal((await notices('CONFIRMED')).length,2);
 await f.login(ids.planner);for(const state of ['DEPARTED','ARRIVED','COMPLETED'])await f.urgent('trip',{id,state});
 assert.equal((await notices('DEPARTED')).length,1);assert.equal((await notices('ARRIVED')).length,1);assert.equal((await notices('COMPLETED')).length,2);
 const jobs=await f.service('claim');assert.equal(jobs.length,10);for(const job of jobs){const a=await f.service('authorize',job);assert.equal(a.reservationId,id);assert.match(a.type,/^BOOKING_/);await f.service('finish',{...job,state:'SENT'});}assert.equal((await f.service('claim')).length,0);
 await f.login(ids.customer);const before=await f.rpc('notification_inbox',['list']);await f.rpc('notification_reservation',[id]);assert.deepEqual(await f.rpc('notification_inbox',['list']),before);assert.ok(before.items.every(n=>!n.read_at&&!n.body.includes(p.note)&&!n.body.includes(p.phone)));
}finally{await f.db.close();}});

test('office staff summary permission is existing read-only scope, not an admin grant',async()=>{const f=await setup();try{
 await f.db.exec("insert into private.office_locations(id,name,region,status,address,latitude,longitude,weekdays) values('staff-office','격리 보험소','경기 분당','active','격리 주소',37.3,127.1,array[0,1,2,3,4,5,6]);");await f.db.query("insert into private.office_staff values('staff-office',$1)",[ids.other]);
 await f.login(ids.customer);const {id}=await f.cmd('request',payload({planner_id:null,office_id:'staff-office',office_assignment:true,method:'scheduled'}));
 assert.deepEqual((await f.notices(id,'REQUESTED')).map(n=>n.recipient_user_id),[ids.customer,ids.other]);await f.login(ids.other);const row=await f.rpc('notification_reservation',[id]);assert.equal(row.id,id);assert.equal(row.workspace,null);await assert.rejects(f.rpc('consultation_workspace',['admin']),/admin_required/);
}finally{await f.db.close();}});

test('visit cancellation and rejection preserve OFF, old push exclusion, and existing declined-offer access boundary',async()=>{const f=await setup();try{
 await f.register(ids.customer);await f.login(ids.customer);let r=await f.urgent('request',visitPayload());await f.urgent('cancel',{id:r.id});await f.db.exec('reset role');assert.equal((await f.db.query("select count(*)::int n from private.notifications where dedupe_key=$1",['visit-v2:'+r.id+':CANCELLED'])).rows[0].n,2);
 await f.db.query("insert into private.notifications(recipient_user_id,notification_type,title,body,deep_link,dedupe_key) values($1,'RESERVATION_REQUESTED','과거 알림','시험',$2,'legacy-visit')",[ids.customer,'/urgent.html?request='+r.id]);assert.equal((await f.db.query("select private.notification_booking_id(n) id from private.notifications n where dedupe_key='legacy-visit'")).rows[0].id,null);
 await f.login(ids.customer);await f.rpc('reservation_notification_settings',['set',{enabled:false}]);r=await f.urgent('request',visitPayload());await f.login(ids.planner);await f.urgent('pass',{id:r.id});await f.db.exec('reset role');const rows=(await f.db.query("select * from private.notifications where dedupe_key=$1",['visit-v2:'+r.id+':REJECTED'])).rows;assert.equal(rows.length,1);assert.equal(rows[0].recipient_user_id,ids.planner);
 await f.login(ids.planner);assert.deepEqual(await f.rpc('notification_reservation',[r.id]),{id:r.id,workspace:null,receipt_only:true,state:'DECLINED'});assert.deepEqual(await f.urgent('workspace'),[]);await f.login(ids.other);await assert.rejects(f.rpc('notification_reservation',[r.id]),/reservation_not_found/);await f.login(ids.customer);assert.equal((await f.rpc('notification_reservation',[r.id])).workspace,'/urgent.html');
}finally{await f.db.close();}});

test('expired visit reads are side-effect free; existing cron expires once using original deadline',async()=>{const f=await setup();try{
 await f.login(ids.customer);const {id}=await f.urgent('request',visitPayload());await f.db.exec('reset role');
 await f.db.query("update private.urgent_requests set expires_at=now()-interval '1 minute' where id=$1",[id]);const before=(await f.db.query('select * from private.urgent_requests where id=$1',[id])).rows[0];const count=async()=>{await f.db.exec('reset role');return (await f.db.query('select count(*)::int n from private.notifications')).rows[0].n;};const n=await count();

 for(let i=0;i<2;i++){await f.login(ids.customer);await f.urgent('workspace');await f.urgent('settings');await f.urgent('catalog',{area:'경기 분당'});await f.rpc('notification_inbox',['list']);await f.rpc('notification_reservation',[id]);}
 assert.equal(await count(),n);assert.deepEqual((await f.db.query('select * from private.urgent_requests where id=$1',[id])).rows[0],before);
 await f.db.exec('reset role;select private.expire_urgent()');assert.equal((await f.db.query('select state from private.urgent_requests where id=$1',[id])).rows[0].state,'EXPIRED');assert.equal(await count(),n+2);await f.db.exec('select private.expire_urgent()');assert.equal(await count(),n+2);
 assert.ok((await f.db.query('select read_at from private.notifications')).rows.every(x=>x.read_at===null));
}finally{await f.db.close();}});
