import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setupVisits} from './expert-visits-fixture.mjs';
import {ids} from './commerce-fixture.mjs';
test('operational alert snapshot: request through cancellation, exact recipient, no duplicates or read-on-query without care',async()=>{
 const f=await setupVisits({now:'2030-01-14T03:10:00Z'});try{
 await f.db.exec('reset role');
 for(const name of ['052_optional_expert_profile.sql','053_connection_review.sql','054_profile_office_scope.sql','056_booking_hardening.sql'])await f.db.exec(await readFile('supabase/'+name,'utf8'));
 // Minimal dependencies for the captured non-office trigger. No optional care installation.
 await f.db.exec(`create table private.office_staff(office_id text,user_id uuid);
 create table private.notifications(id uuid primary key default gen_random_uuid(),recipient_user_id uuid not null,notification_type text,title text,body text,consultation_id uuid,insurance_office_id text,deep_link text,dedupe_key text,delivery_status text default 'IN_APP_CREATED',read_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),unique(recipient_user_id,dedupe_key));`);
 await f.db.exec(await readFile('tests/fixtures/operational-reservation-alerts.sql','utf8'));
 await f.db.exec(`revoke all on function public.notification_inbox(text,uuid),public.notification_reservation(uuid) from public,anon;grant execute on function public.notification_inbox(text,uuid),public.notification_reservation(uuid) to authenticated;
 create constraint trigger reservation_notification after insert or update on private.consultations deferrable initially deferred for each row execute function private.reservation_notification();`);
 const inbox=()=>f.rpc('notification_inbox',['list',null]);
 const date=n=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(Date.parse('2030-01-14T03:10:00Z')+n*86400000));
 const payload={planner_id:ids.planner,office_assignment:false,purpose:'claim',region:'경기 분당',method:'phone',preferred_at:date(2)+'T14:00:00+09:00',request_key:crypto.randomUUID()};
 await f.login(ids.customer);const booking=await f.cmd('request',payload);assert.equal((await f.cmd('request',payload)).id,booking.id);assert.equal((await inbox()).items.length,0);
 const customerRow=await f.row(booking.id);assert.equal(customerRow.planner_id,ids.planner);assert.equal(customerRow.method,'phone');assert.equal(Date.parse(customerRow.preferred_at),Date.parse(payload.preferred_at));
 await f.login(ids.planner);let list=await inbox();assert.equal(list.items.length,1);assert.equal(list.items[0].notification_type,'RESERVATION_REQUESTED');assert.equal(list.items[0].deep_link,'/notifications.html?reservation='+booking.id);assert.equal(list.items[0].read_at,null);assert.equal((await f.rpc('notification_reservation',[booking.id])).workspace,'/partner-work.html');assert.equal((await inbox()).items[0].read_at,null);
 await f.login(ids.other);assert.equal((await inbox()).items.length,0);await assert.rejects(f.rpc('notification_reservation',[booking.id]),/reservation_not_found/);await assert.rejects(f.db.query('select * from private.notifications'),/permission denied/);
 await f.login(ids.planner);await f.cmd('accept',{id:booking.id,revision:(await f.row(booking.id,'partner')).revision});
 await f.login(ids.customer);assert.equal((await f.row(booking.id)).planner_ok,true);assert.ok((await inbox()).items.some(n=>n.notification_type==='RESERVATION_ACCEPTED'));await f.cmd('confirm',{id:booking.id,revision:(await f.row(booking.id)).revision,name:'격리 확인 고객',share_consent:true});assert.equal((await f.row(booking.id)).state,'scheduled');
 await f.login(ids.planner);assert.ok((await inbox()).items.some(n=>n.notification_type==='RESERVATION_ACCEPTED'));
 await f.login(ids.customer);await f.cmd('propose',{id:booking.id,revision:(await f.row(booking.id)).revision,preferred_at:date(3)+'T15:00:00+09:00'});
 await f.login(ids.planner);await f.cmd('schedule_accept',{id:booking.id,revision:(await f.row(booking.id,'partner')).revision});
 const changedPartner=await f.row(booking.id,'partner');await f.login(ids.customer);const changedCustomer=await f.row(booking.id);assert.equal(changedCustomer.preferred_at,changedPartner.preferred_at);assert.equal(Date.parse(changedCustomer.preferred_at),Date.parse(date(3)+'T15:00:00+09:00'));assert.equal(changedCustomer.state,changedPartner.state);assert.equal(changedPartner.method,'phone');
 await f.login(ids.customer);assert.ok((await inbox()).items.some(n=>n.notification_type==='RESERVATION_CHANGED'));await f.cmd('cancel',{id:booking.id,revision:(await f.row(booking.id)).revision});
 await f.login(ids.planner);list=await inbox();assert.ok(list.items.some(n=>n.notification_type==='RESERVATION_CANCELLED'));assert.ok(list.items.every(n=>n.read_at===null));assert.equal((await f.row(booking.id,'partner')).state,'cancelled');
 // A separate isolated booking completes through both actors; the cancelled fixture stays cancelled.
 await f.login(ids.customer);const done=await f.cmd('request',{...payload,preferred_at:date(4)+'T14:00:00+09:00',request_key:crypto.randomUUID()});
 await f.login(ids.planner);await f.cmd('accept',{id:done.id,revision:(await f.row(done.id,'partner')).revision});
 await f.login(ids.customer);await f.cmd('confirm',{id:done.id,revision:(await f.row(done.id)).revision,name:'격리 완료 고객',share_consent:true});
 await f.db.exec("reset role;create or replace function pg_catalog.now() returns timestamptz language sql stable as $$select '2030-01-18T06:00:00Z'::timestamptz$$;");
 await f.login(ids.planner);await f.cmd('complete_request',{id:done.id,revision:(await f.row(done.id,'partner')).revision});
 await f.login(ids.customer);assert.equal((await f.row(done.id)).state,'awaiting_completion');await f.cmd('complete_confirm',{id:done.id,revision:(await f.row(done.id)).revision});assert.equal((await f.row(done.id)).state,'completed');
 await f.login(ids.planner);assert.equal((await f.row(done.id,'partner')).state,'completed');assert.ok((await inbox()).items.some(n=>n.notification_type==='RESERVATION_COMPLETED'&&n.deep_link.endsWith(done.id)));assert.ok((await inbox()).items.every(n=>n.read_at===null));assert.equal((await f.row(booking.id,'partner')).state,'cancelled');
 await f.db.exec('reset role');assert.equal((await f.db.query('select count(*)::int n from private.consultations')).rows[0].n,2);assert.equal((await f.db.query('select count(*)::int n from private.notifications where recipient_user_id not in($1,$2)',[ids.customer,ids.planner])).rows[0].n,0);
 }finally{await f.db.close();}
});
