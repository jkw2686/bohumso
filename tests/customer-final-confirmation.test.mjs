import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {setupVisits} from './expert-visits-fixture.mjs';import {setupCare,ids,day} from './appointment-care-fixture.mjs';
async function baseline(care){const f=await(care?setupCare():setupVisits());await f.db.exec('reset role');
 if(!care)for(const n of ['052_optional_expert_profile.sql','053_connection_review.sql','054_profile_office_scope.sql'])await f.db.exec(await readFile('supabase/'+n,'utf8'));
 await f.db.exec('create table private.phone_contacts(user_id uuid primary key,phone_e164 text,phone_verification_status text,phone_verified_at timestamptz)');
 if(!care){const source=await readFile('supabase/069_reservation_event_notifications.sql','utf8');const start=source.indexOf('create or replace function private.booking_notice('),end=source.indexOf('end$$;',start);assert.ok(start>=0&&end>start);await f.db.exec(source.slice(start,end+6));}
 for(const n of ['043_auth_phone_status_bridge.sql','074_same_time_confirmation.sql','077_customer_final_confirmation.sql','077_customer_final_confirmation.sql'])await f.db.exec(await readFile('supabase/'+n,'utf8'));return f;}
for(const care of [false,true])test('customer confirms last, same and proposed times; phone remains private, existing confirmed retained; optional care '+care,async()=>{const f=await baseline(care);try{
 await f.login(ids.customer);const request={planner_id:ids.planner,purpose:'claim',region:'경기 분당',method:'phone',preferred_at:day(2)+'T14:00:00+09:00',request_key:crypto.randomUUID(),confirmation_version:'same-time-v1',name:'격리 고객',share_consent:true};
 const {id}=await f.cmd('request',request);await f.login(ids.planner);await f.cmd('accept',{id,revision:(await f.row(id,'partner')).revision});
 let row=await f.row(id,'partner');assert.equal(row.state,'coordinating');assert.equal(row.customer_ok,false);assert.equal(row.contact,null);
 await assert.rejects(f.cmd('confirm',{id,revision:row.revision,care_revision:care?(await f.get(id)).revision:undefined,name:'격리 고객',share_consent:true}),/invalid_transition|request_forbidden/);
 await f.login(ids.customer);await f.cmd('confirm',{id,revision:(await f.row(id)).revision,care_revision:care?(await f.get(id)).revision:undefined,name:'격리 고객',share_consent:true});
 const customer=await f.row(id);assert.equal(customer.state,'scheduled');await f.login(ids.planner);const expert=await f.row(id,'partner');assert.equal(expert.preferred_at,customer.preferred_at);assert.ok(expert.contact);
 // Reapplying policy never reopens a confirmed booking.
 await f.db.exec('reset role');await f.db.exec(await readFile('supabase/077_customer_final_confirmation.sql','utf8'));await f.login(ids.planner);assert.equal((await f.row(id,'partner')).state,'scheduled');
 if(!care){
  await f.login(ids.customer);const proposed=await f.cmd('request',{...request,preferred_at:day(4)+'T14:00:00+09:00',request_key:crypto.randomUUID()});
  await f.login(ids.planner);await f.cmd('accept',{id:proposed.id,revision:(await f.row(proposed.id,'partner')).revision});await f.cmd('propose',{id:proposed.id,revision:(await f.row(proposed.id,'partner')).revision,preferred_at:day(5)+'T15:00:00+09:00'});
  await f.login(ids.customer);await assert.rejects(f.cmd('confirm',{id:proposed.id,revision:(await f.row(proposed.id)).revision,name:'격리 고객',share_consent:true}),/schedule_pending/);await f.cmd('schedule_accept',{id:proposed.id,revision:(await f.row(proposed.id)).revision});assert.equal((await f.row(proposed.id)).state,'coordinating');
  await f.cmd('confirm',{id:proposed.id,revision:(await f.row(proposed.id)).revision,name:'격리 고객',share_consent:true});const fixed=await f.row(proposed.id);assert.equal(fixed.state,'scheduled');assert.equal(new Date(fixed.preferred_at).toISOString(),new Date(day(5)+'T15:00:00+09:00').toISOString());
 }
 await f.login(ids.other);await assert.rejects(f.cmd('confirm',{id,revision:customer.revision,name:'다른 고객',share_consent:true}));
 await f.login(ids.customer);assert.equal((await f.rpc('booking_flow_capabilities')).sameTimeConfirmationEnabled,false);if(!care){await f.db.exec('reset role');const definition=(await f.db.query("select pg_get_functiondef('private.booking_notice(private.consultations,text,text,uuid,uuid)'::regprocedure) d")).rows[0].d;assert.ok(definition.includes("when 'ACCEPTED' then '일정 조율 중'"));assert.ok(definition.includes('상담 요청 중'));}
 }finally{await f.db.close();}});
