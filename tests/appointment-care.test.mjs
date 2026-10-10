import test from 'node:test';import assert from 'node:assert/strict';
import {setupCare,ids,day} from './appointment-care-fixture.mjs';
import {readFile} from 'node:fs/promises';
test('appointment changes preserve original terms, late notice, cancellation invalidates changes and reminders',async()=>{
 const f=await setupCare();try{
  const id=await f.booking();let a=await f.get(id);assert.equal(a.confirmed,true);const original=a.terms;
  await f.act('late',id,{minutes:15});assert.deepEqual((await f.get(id)).terms,original);
  await f.act('propose',id,{at:day(3)+'T16:00:00+09:00',method:'scheduled',place:'함께 정한 건물 입구'});assert.deepEqual((await f.get(id)).terms,original);
  await assert.rejects(f.act('change_accept',id),/request_forbidden/);
  await f.login(ids.planner);await f.act('change_accept',id);a=await f.get(id);assert.equal(a.terms.method,'scheduled');assert.equal(a.terms.place,'함께 정한 건물 입구');
  await f.act('late',id,{minutes:20});await f.act('propose',id,{at:day(4)+'T16:00:00+09:00',method:'phone',place:'전화상담'});
  const stale={id,kind:'consultation',revision:(await f.get(id)).revision,request_key:crypto.randomUUID()};
  await f.login(ids.customer);await f.act('cancel',id);await assert.rejects(f.care('change_accept',stale),/stale_request|invalid_transition/);assert.equal((await f.row(id)).state,'cancelled');
  await f.db.exec('reset role');assert.equal((await f.db.query("select count(*) n from private.appointment_reminders where state='pending'")).rows[0].n,0);
 }finally{await f.db.close();}
});
async function cases(f,count=3){const list=[];for(let n=0;n<count;n++){const id=await f.booking(n+2);await f.past(id,n+1);await f.login(ids.customer);await f.act('report',id,{body:'약속 당시 상황을 확인해 주세요'});list.push(id);}return list;}
const days=m=>Math.round((Date.parse(m.ends_at)-Date.parse(m.starts_at))/86400000);
test('consumer limits are 3/7 days; repeats do not extend; existing actions and OFF remain available',async()=>{
 const f=await setupCare();try{
  await f.policy();const list=await cases(f,4);
  await f.decide(list[0]);await f.decide(list[1]);await f.login(ids.customer);let m=(await f.get(list[1])).measure;assert.equal(days(m),3);assert.equal(m.blocked,true);const end=m.ends_at;
  await assert.rejects(f.cmd('request',{planner_id:ids.next}),/new_appointments_restricted/);
  await f.act('late',list[0],{minutes:5});assert.ok((await f.get(list[0])).otherPhone!==undefined);await f.act('cancel',list[0]);
  await f.decide(list[2]);await f.login(ids.customer);m=(await f.get(list[2])).measure;assert.equal(m.ends_at,end);assert.equal(m.review_required,true);
  await f.decide(list[2],'unverifiable');await f.db.exec("reset role;update private.appointment_measures set starts_at=now()-interval '4 days',ends_at=now()-interval '1 day' where role='consumer'");await f.decide(list[2]);await f.login(ids.customer);m=(await f.get(list[2])).measure;assert.equal(days(m),7);
  await f.decide(list[1],'unverifiable');await f.decide(list[2],'agreement');await f.login(ids.customer);assert.equal((await f.get(list[2])).measure.blocked,false);
  await f.db.exec('reset role');await f.db.query('update private.planner_directory set available=false where user_id=$1',[ids.planner]);await f.login(ids.planner);await f.urgent('stop');assert.equal((await f.get(list[3])).state,'active');await f.act('cancel',list[3]);
 }finally{await f.db.close();}
});
test('expert 7/30 days and explicit resume; paid experts are held, never silently restricted',async()=>{
 const f=await setupCare();try{
  await f.policy();const list=await cases(f);await f.decide(list[0],'expert_absent');await f.decide(list[1],'expert_absent');await f.login(ids.planner);let m=(await f.get(list[1])).measure;assert.equal(days(m),7);assert.equal(m.blocked,true);
  await f.db.exec("reset role;update private.appointment_measures set starts_at=now()-interval '8 days',ends_at=now()-interval '1 day' where role='expert'");await f.decide(list[2],'expert_absent');await f.login(ids.planner);m=(await f.get(list[2])).measure;assert.equal(days(m),30);assert.equal(m.resume_required,true);
  await f.db.exec("reset role;update private.appointment_measures set starts_at=now()-interval '31 days',ends_at=now()-interval '1 day' where role='expert'");await f.login(ids.planner);assert.equal((await f.get(list[2])).measure.blocked,true);await f.login(ids.admin);await f.act('resume',list[2],{reason:'재발 방지 설명과 약속 이행 가능 여부를 확인함'});await f.login(ids.planner);assert.equal((await f.get(list[2])).measure.blocked,false);
  await f.db.exec('reset role');await f.db.exec("insert into private.ad_slots(code,region) values('basic','격리 지역');");await f.db.query("insert into private.ad_subscriptions(planner_id,amount,state,starts_at,ends_at,period_days,order_id,plan_id,slot_id,request_key,plan_name,guaranteed_impressions) select $1,10000,'active',now(),now()+interval '1 month',30,'care-paid',p.id,s.id,gen_random_uuid(),'격리 요금제',100 from private.ad_plans p cross join private.ad_slots s where p.code='basic' and s.region='격리 지역' limit 1",[ids.planner]);await f.decide(list[2],'expert_absent');await f.login(ids.planner);m=(await f.get(list[2])).measure;assert.equal(m.status,'held_paid');assert.equal(m.blocked,false);assert.equal(m.ends_at,null);
 }finally{await f.db.close();}
});
test('unconfirmed requests cannot be reported, advance notice differs from absence, no retroactive policy',async()=>{
 const f=await setupCare();try{
  const id=await f.booking();await f.act('late',id,{minutes:10});await f.db.exec('reset role');await f.db.query("update private.appointment_events set created_at=now()-interval '2 days' where appointment_id=$1",[id]);await f.past(id);await f.login(ids.customer);await f.act('report',id,{body:'예약 장소에서 상대를 기다림'});await assert.rejects(f.decide(id,'consumer_absent'),/advance_contact_recorded/);await f.decide(id,'expert_absent');await f.login(ids.planner);assert.equal((await f.get(id)).measure.confirmed_count,0);assert.equal((await f.get(id)).measure.blocked,false);
  await f.login(ids.customer);const r=await f.cmd('request',{planner_id:ids.next,office_assignment:false,purpose:'claim',region:'경기 분당',method:'phone',preferred_at:day(5)+'T14:00:00+09:00',request_key:crypto.randomUUID()});await f.get(r.id);await f.past(r.id);await f.login(ids.customer);await assert.rejects(f.act('report',r.id,{body:'아직 확인하지 않은 요청'}),/appointment_not_confirmed/);
 }finally{await f.db.close();}
});
test('in-app reminders are private, delivered once, and stopped by cancellation',async()=>{
 const f=await setupCare();try{
  const id=await f.booking();await f.db.exec('reset role');await f.db.query("update private.appointment_care set terms=terms||jsonb_build_object('at',now()+interval '20 minutes') where id=$1",[id]);await f.login(ids.customer);await f.get(id);
  let rows=await f.care('inbox');assert.equal(rows.filter(n=>n.title==='약속 시간 안내').length,1);await f.care('inbox');assert.equal((await f.care('inbox')).filter(n=>n.title==='약속 시간 안내').length,1);assert.ok(rows.every(n=>!n.body.includes('입구')));
  await f.act('cancel',id);await f.login(ids.planner);rows=await f.care('inbox');assert.equal(rows.filter(n=>n.title==='약속 시간 안내').length,0);assert.ok(rows.some(n=>n.title==='약속이 취소되었습니다'));
  await f.login(ids.other);assert.deepEqual(await f.care('inbox'),[]);
 }finally{await f.db.close();}
});
test('reports are separate, private and deduplicated; facts require review and appeals reverse counts',async()=>{
 const f=await setupCare();try{
  const id=await f.booking();await assert.rejects(f.act('report',id,{body:'상대가 오지 않았습니다'}),/appointment_not_confirmed/);
  await f.policy();await f.past(id);await f.login(ids.customer);
  const p={id,kind:'consultation',revision:(await f.get(id)).revision,request_key:crypto.randomUUID(),body:'약속 장소에서 연락을 기다렸습니다'};
  await f.care('report',p);assert.deepEqual(await f.care('report',p),await f.get(id));await assert.rejects(f.act('report',id,{body:'같은 신고를 다시 접수'}),/report_already_received/);
  assert.equal((await f.row(id)).state,'scheduled');await f.login(ids.planner);await f.act('report',id,{body:'고객님과 만날 수 없었습니다'});
  await f.login(ids.other);await assert.rejects(f.get(id),/request_forbidden/);await assert.rejects(f.care('admin_list'),/admin_required/);await assert.rejects(f.db.query('select * from private.appointment_cases'),/permission denied/);
  await f.login(ids.admin);assert.equal((await f.care('admin_list'))[0].id,id);assert.equal((await f.care('admin_list'))[0].case.statements.length,2);
  await assert.rejects(f.decide(id,'consumer_absent',{not_silence_only:false}),/review_required/);await f.decide(id);await f.login(ids.customer);assert.equal((await f.get(id)).measure.confirmed_count,1);
  await f.act('appeal',id,{body:'합의한 장소가 다르게 기록되었습니다'});await f.decide(id,'unverifiable');await f.login(ids.customer);assert.equal((await f.get(id)).measure.confirmed_count,0);assert.equal((await f.get(id)).case.decisions.length,2);
 }finally{await f.db.close();}
});
test('rolling window uses occurrence, not decision time; request replay creates one notification per party',async()=>{
 const f=await setupCare();try{
  await f.policy();const id=await f.booking();await f.past(id,91);await f.login(ids.customer);await f.act('report',id,{body:'이전 약속에 대한 사실 확인 요청'});await f.decide(id);await f.login(ids.customer);assert.equal((await f.get(id)).measure.recent_count,0);
  const notices=await f.care('inbox');assert.equal(notices.filter(n=>n.title==='요청이 접수되었습니다').length,1);assert.equal(notices.filter(n=>n.title==='약속이 확정되었습니다').length,1);
  await f.login(ids.planner);assert.equal((await f.care('inbox')).filter(n=>n.title==='약속이 확정되었습니다').length,1);
  await f.db.exec('reset role');assert.equal((await f.db.query("select count(*) n from private.appointment_cases where policy_version='appointment-2026-10-v1'")).rows[0].n,1);
 }finally{await f.db.close();}
});
test('expert visits need both parties to confirm the same place; changes, OFF, report and cancel stay separate',async()=>{
 const f=await setupCare();try{
  await f.login(ids.customer);const at=new Date(Math.ceil((Date.now()+3600000)/1800000)*1800000).toISOString();
  const p={area:'경기 분당',planner_id:ids.planner,purpose:'claim',meeting_kind:'address',place:'격리 만남 장소',phone:'01000000001',note:'',preferred_at:at,consent:true,request_key:crypto.randomUUID()};
  const r=await f.urgent('request',p);await f.login(ids.planner);await f.urgent('accept',{id:r.id});let a=await f.get(r.id,'visit');assert.equal(a.terms.place,undefined);
  await f.login(ids.customer);await f.urgent('confirm_visit',{id:r.id,consent:true,care_revision:(await f.get(r.id,'visit')).revision});assert.equal((await f.get(r.id,'visit')).confirmed,false);
  await f.login(ids.planner);a=await f.get(r.id,'visit');assert.equal(a.canAgree,true);assert.equal(a.terms.place,p.place);await assert.rejects(f.urgent('trip',{id:r.id,state:'DEPARTED'}),/customer_confirmation_required/);
  await f.act('agree',r.id,{},'visit');assert.equal((await f.get(r.id,'visit')).confirmed,true);await f.urgent('stop');assert.equal((await f.get(r.id,'visit')).state,'active');
  await f.act('late',r.id,{minutes:15},'visit');await f.act('propose',r.id,{at:day(3)+'T15:00:00+09:00',place:'함께 변경한 장소',method:'visit'},'visit');await f.login(ids.customer);assert.equal((await f.get(r.id,'visit')).terms.place,p.place);await f.act('change_accept',r.id,{},'visit');assert.equal((await f.get(r.id,'visit')).terms.place,'함께 변경한 장소');
  await f.past(r.id,1,'visit');await f.login(ids.customer);await f.act('report',r.id,{body:'방문 약속 사실 확인을 요청합니다'},'visit');assert.equal((await f.get(r.id,'visit')).state,'active');await f.act('cancel',r.id,{},'visit');assert.equal((await f.urgent('workspace'))[0].state,'CANCELLED');
  await f.db.exec('reset role');await f.db.query("update private.urgent_requests set ends_at=now()-interval '2 days',closed_at=now()-interval '2 days' where id=$1",[r.id]);await f.db.exec('select private.expire_urgent()');await f.login(ids.customer);assert.equal((await f.get(r.id,'visit')).terms.place,undefined);assert.equal((await f.care('my_cases'))[0].id,r.id);await f.act('explain',r.id,{body:'종료한 방문 약속에 대한 추가 설명입니다'},'visit');assert.equal((await f.get(r.id,'visit')).case.statements.length,2);
 }finally{await f.db.close();}
});
test('collision is rechecked on acceptance and rollback preserves members and refuses unresolved changes',async()=>{
 const f=await setupCare();try{
  const id=await f.booking();const at=day(6)+'T14:00:00+09:00';await f.act('propose',id,{at,method:'phone',place:'전화상담'});
  await f.db.exec('reset role');await f.db.query("insert into private.consultations(customer_id,planner_id,purpose,region,method,preferred_at,state,request_key) values($1,$2,'claim','경기 분당','phone',$3,'scheduled',$4)",[ids.other,ids.planner,at,crypto.randomUUID()]);
  await f.login(ids.planner);await assert.rejects(f.act('change_accept',id),/slot_unavailable/);await f.db.exec('reset role');await assert.rejects(f.db.exec(await readFile('supabase/rollback_appointment_care.sql','utf8')),/requires_resolution/);await f.db.exec('rollback');
  await f.login(ids.planner);await f.act('change_decline',id);await f.db.exec('reset role');const users=(await f.db.query('select * from public.member_profiles order by user_id')).rows;await f.db.exec(await readFile('supabase/rollback_appointment_care.sql','utf8'));assert.deepEqual((await f.db.query('select * from public.member_profiles order by user_id')).rows,users);await f.login(ids.customer);assert.equal((await f.care('status')).enabled,false);await f.db.exec('reset role');await f.db.exec(await readFile('supabase/055_appointment_care.sql','utf8'));await f.login(null,'anon');await assert.rejects(f.care('status'),/permission denied/);await assert.rejects(f.rpc('consultation_command_before_appointment_care',['cancel',{id}]),/permission denied/);
 }finally{await f.db.close();}
});
