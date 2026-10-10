-- Development draft. Production execution requires a separate review of retention and policy activation.
begin;
create table if not exists private.appointment_care_backup(name text primary key,definition text not null);
insert into private.appointment_care_backup
 select x,pg_get_functiondef(to_regprocedure(x)) from unnest(array[
 'public.consultation_command(text,jsonb)','public.urgent_command(text,jsonb)',
 'private.expire_urgent()','public.planner_catalog(text,text)','public.visit_catalog(jsonb)']) x where to_regprocedure(x) is not null on conflict do nothing;
create table if not exists private.appointment_policy(
 version text primary key, effective_at timestamptz, enforcement_enabled boolean not null default false,
 paid_enforcement_enabled boolean not null default false check(not paid_enforcement_enabled)
);
insert into private.appointment_policy(version) values('appointment-2026-10-v1') on conflict do nothing;
create table if not exists private.appointment_care(
 kind text not null check(kind in ('consultation','visit')), id uuid not null,
 customer_id uuid not null references auth.users(id), expert_id uuid references auth.users(id),
 revision integer not null default 1, terms jsonb not null, confirmed boolean not null default false,
 customer_agreed boolean not null default false, expert_agreed boolean not null default false,
 state text not null default 'active' check(state in ('active','cancelled','completed')),
 created_at timestamptz not null default now(), primary key(kind,id)
);
create table if not exists private.appointment_changes(
 id uuid primary key default gen_random_uuid(), kind text not null, appointment_id uuid not null,
 actor uuid not null references auth.users(id), terms jsonb not null,
 state text not null default 'pending' check(state in ('pending','accepted','declined','cancelled')),
 created_at timestamptz not null default now(), resolved_at timestamptz,
 foreign key(kind,appointment_id) references private.appointment_care(kind,id)
);
create unique index if not exists appointment_one_pending on private.appointment_changes(kind,appointment_id) where state='pending';
create table if not exists private.appointment_events(
 id bigint generated always as identity primary key, kind text not null, appointment_id uuid not null,
 actor uuid references auth.users(id), event text not null, detail jsonb not null default '{}', created_at timestamptz not null default now(),dedupe_key text,
 unique(kind,appointment_id,dedupe_key),
 foreign key(kind,appointment_id) references private.appointment_care(kind,id)
);
create table if not exists private.appointment_cases(
 id uuid primary key default gen_random_uuid(), kind text not null, appointment_id uuid not null,
 occurred_at timestamptz not null, opened_at timestamptz not null default now(),
 policy_version text not null default 'appointment-2026-10-v1' references private.appointment_policy(version),
 outcome text check(outcome in ('expert_absent','consumer_absent','agreement','unverifiable','withdrawn')),
 decision_at timestamptz, reason text, appeal_pending boolean not null default false,
 unique(kind,appointment_id), foreign key(kind,appointment_id) references private.appointment_care(kind,id)
);
create table if not exists private.appointment_statements(
 id bigint generated always as identity primary key, case_id uuid not null references private.appointment_cases(id),
 actor uuid not null references auth.users(id), type text not null check(type in ('report','explain','appeal')),
 body text not null check(char_length(body) between 3 and 1000), created_at timestamptz not null default now()
);
create unique index if not exists appointment_one_report on private.appointment_statements(case_id,actor) where type='report';
create table if not exists private.appointment_decisions(
 id bigint generated always as identity primary key, case_id uuid not null references private.appointment_cases(id),
 actor uuid not null references auth.users(id), outcome text not null, reason text not null,
 review jsonb not null, created_at timestamptz not null default now()
);
create table if not exists private.appointment_measures(
 user_id uuid not null references auth.users(id), role text not null check(role in ('consumer','expert')),
 policy_version text not null references private.appointment_policy(version), confirmed_count integer not null default 0,
 status text not null default 'none', starts_at timestamptz, ends_at timestamptz,
 resume_required boolean not null default false, resumed_at timestamptz, resumed_by uuid references auth.users(id),
 review_required boolean not null default false, updated_at timestamptz not null default now(), primary key(user_id,role)
);
create table if not exists private.appointment_receipts(
 actor uuid not null references auth.users(id), request_key uuid not null, operation text not null,
 payload_hash text not null, primary key(actor,request_key)
);
-- Compatible with the existing in-app notification schema; no external delivery is added.
create table if not exists private.notifications(
 id uuid primary key default gen_random_uuid(), recipient_user_id uuid not null references auth.users(id),
 notification_type text not null, title text not null, body text not null, consultation_id uuid,
 insurance_office_id text, deep_link text not null, dedupe_key text not null,
 delivery_status text not null default 'IN_APP_CREATED', read_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(recipient_user_id,dedupe_key)
);
create table if not exists private.appointment_reminders(
 kind text not null, appointment_id uuid not null, scheduled_at timestamptz not null,
 recipient uuid not null references auth.users(id), state text not null default 'pending',
 primary key(kind,appointment_id,scheduled_at,recipient)
);
do $$declare t text;begin
 foreach t in array array['appointment_care_backup','appointment_policy','appointment_care','appointment_changes','appointment_events','appointment_cases','appointment_statements','appointment_decisions','appointment_measures','appointment_receipts','notifications','appointment_reminders'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated',t);
 end loop;
 if to_regprocedure('public.consultation_command_before_appointment_care(text,jsonb)') is null then alter function public.consultation_command(text,jsonb) rename to consultation_command_before_appointment_care;end if;
 if to_regprocedure('public.urgent_command_before_appointment_care(text,jsonb)') is null then alter function public.urgent_command(text,jsonb) rename to urgent_command_before_appointment_care;end if;
 if to_regprocedure('public.planner_catalog_before_appointment_care(text,text)') is null then alter function public.planner_catalog(text,text) rename to planner_catalog_before_appointment_care;end if;
 if to_regprocedure('public.visit_catalog_before_appointment_care(jsonb)') is null then alter function public.visit_catalog(jsonb) rename to visit_catalog_before_appointment_care;end if;
end$$;

create or replace function private.appointment_count(uid uuid,who text) returns integer language sql stable security definer set search_path='' as $$
 select count(*)::integer from private.appointment_cases c join private.appointment_care a on a.kind=c.kind and a.id=c.appointment_id
 cross join private.appointment_policy p where p.version='appointment-2026-10-v1'
 and (case when who='consumer' then a.customer_id else a.expert_id end)=uid
 and c.outcome=case when who='consumer' then 'consumer_absent' else 'expert_absent' end
 and p.effective_at is not null and c.occurred_at>=greatest(now()-interval '90 days',p.effective_at) and c.occurred_at<=now()
$$;
create or replace function private.appointment_view(a private.appointment_care) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=auth.uid();p private.appointment_policy;can_see boolean;begin
 if actor is null or not(a.customer_id=actor or coalesce(a.expert_id=actor,false) or private.is_admin()) then raise exception 'request_forbidden';end if;
 select * into p from private.appointment_policy where version='appointment-2026-10-v1';
 can_see:=a.kind='consultation' or a.customer_id=actor or a.customer_agreed or private.is_admin();
 return jsonb_build_object('kind',a.kind,'id',a.id,'revision',a.revision,'mine',a.customer_id=actor,'expertId',a.expert_id,'admin',private.is_admin(),
 'terms',case when can_see then a.terms else a.terms-'place' end,'state',a.state,'confirmed',a.confirmed,'customerAgreed',a.customer_agreed,'expertAgreed',a.expert_agreed,
 'policyActive',p.enforcement_enabled and p.effective_at<=now(),'paidHold',private.appointment_paid(a.expert_id),
 'canAgree',a.kind='visit' and a.customer_agreed and not a.expert_agreed and a.expert_id=actor and a.state='active',
 'otherPhone',case when a.confirmed and a.state='active' then
  case when a.customer_id=actor then (select phone from private.planner_directory where user_id=a.expert_id)
   when a.kind='visit' then (select phone from private.urgent_requests where id=a.id)
   else (select phone from private.consultation_contacts where consultation_id=a.id order by consented_at desc limit 1) end end,
 'proposal',(select to_jsonb(x)||jsonb_build_object('mine',x.actor=actor) from private.appointment_changes x where x.kind=a.kind and x.appointment_id=a.id and x.state='pending'),
 'events',coalesce((select jsonb_agg(to_jsonb(x)-'actor'||jsonb_build_object('who',case when x.actor=a.customer_id then 'consumer' when x.actor=a.expert_id then 'expert' else 'admin' end) order by x.id) from private.appointment_events x where x.kind=a.kind and x.appointment_id=a.id),'[]'),
 'case',(select to_jsonb(c)||jsonb_build_object('statements',coalesce((select jsonb_agg(to_jsonb(s)-'actor'||jsonb_build_object('who',case when s.actor=a.customer_id then 'consumer' else 'expert' end) order by s.id) from private.appointment_statements s where s.case_id=c.id),'[]'),'decisions',coalesce((select jsonb_agg(to_jsonb(d)-'actor' order by d.id) from private.appointment_decisions d where d.case_id=c.id),'[]')) from private.appointment_cases c where c.kind=a.kind and c.appointment_id=a.id),
 'priorEvents',case a.kind when 'consultation' then coalesce((select jsonb_agg(jsonb_build_object('event',e.event,'created_at',e.created_at,'who',case e.actor when a.customer_id then 'consumer' when a.expert_id then 'expert' else 'admin' end) order by e.created_at) from private.consultation_events e where e.consultation_id=a.id and e.created_at<a.created_at),'[]') else coalesce((select jsonb_agg(jsonb_build_object('event',lower(e.event),'created_at',e.created_at,'who',case e.actor when a.customer_id then 'consumer' when a.expert_id then 'expert' else 'admin' end) order by e.created_at) from private.urgent_events e where e.request_id=a.id and e.created_at<a.created_at),'[]') end,
 'measure',(select to_jsonb(m)-'user_id'-'resumed_by'||jsonb_build_object('recent_count',private.appointment_count(m.user_id,m.role),'blocked',private.appointment_blocked(m.user_id,m.role)) from private.appointment_measures m where m.user_id=actor and m.role=case when a.customer_id=actor then 'consumer' else 'expert' end),
 'measures',case when private.is_admin() then (select jsonb_agg(to_jsonb(m)||jsonb_build_object('recent_count',private.appointment_count(m.user_id,m.role),'blocked',private.appointment_blocked(m.user_id,m.role))) from private.appointment_measures m where m.user_id in (a.customer_id,a.expert_id)) end);
end$$;

create or replace function public.appointment_care(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=auth.uid();k text:=payload->>'kind';rid uuid:=nullif(payload->>'id','')::uuid;
 a private.appointment_care;ch private.appointment_changes;cs private.appointment_cases;receipt private.appointment_receipts;
 t jsonb;result jsonb;key uuid;outcome text;ev bigint;uid uuid;who text;p private.appointment_policy;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='status' then
  select * into p from private.appointment_policy where version='appointment-2026-10-v1';
  return jsonb_build_object('enabled',true,'policyActive',p.enforcement_enabled and p.effective_at<=now(),'paidHold',private.appointment_paid(actor),'consumerBlocked',private.appointment_blocked(actor,'consumer'),'expertBlocked',private.appointment_blocked(actor,'expert'));
 elsif operation='my_cases' then
  return coalesce((select jsonb_agg(q.item order by q.opened_at desc) from (select private.appointment_view(ac) item,c.opened_at from private.appointment_care ac join private.appointment_cases c on c.kind=ac.kind and c.appointment_id=ac.id where (payload->>'workspace'='partner' and ac.expert_id=actor) or (coalesce(payload->>'workspace','customer')='customer' and ac.customer_id=actor) order by c.opened_at desc limit 200) q),'[]');
 elsif operation='admin_list' then
  if not private.is_admin() then raise exception 'admin_required';end if;
  return coalesce((select jsonb_agg(q.item order by q.created_at desc) from (select private.appointment_view(ac) item,ac.created_at from private.appointment_care ac where ac.state='cancelled' or exists(select 1 from private.appointment_cases c where c.kind=ac.kind and c.appointment_id=ac.id) order by ac.created_at desc limit 200) q),'[]');
 elsif operation in ('inbox','read') then
  if operation='read' then update private.notifications set read_at=coalesce(read_at,now()) where id=rid and recipient_user_id=actor;end if;
  -- Foreground fallback. A privileged worker can call the same helper for all due reminders.
  perform private.flush_appointment_reminders(actor);
  return coalesce((select jsonb_agg(to_jsonb(n)-'recipient_user_id'-'dedupe_key' order by n.created_at desc) from (select * from private.notifications where recipient_user_id=actor order by created_at desc limit 100)n),'[]');
 end if;
 a:=private.appointment_sync(k,rid);
 if not(actor=a.customer_id or coalesce(actor=a.expert_id,false) or private.is_admin()) then raise exception 'request_forbidden';end if;
 if operation='get' then return private.appointment_view(a);end if;
 if operation in ('decide','resume','review_cancellations') then
  if not private.is_admin() then raise exception 'admin_required';end if;
 elsif actor<>a.customer_id and actor is distinct from a.expert_id then raise exception 'request_forbidden';end if;
 key:=(payload->>'request_key')::uuid;if key is null then raise exception 'request_key_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('appointment-key:'||actor::text||key::text,55));
 select * into receipt from private.appointment_receipts r where r.actor=actor and r.request_key=key;
 if found then
  if receipt.operation<>operation or receipt.payload_hash<>md5(payload::text) then raise exception 'request_key_conflict';end if;
  return private.appointment_view(a);
 end if;
 if a.revision is distinct from (payload->>'revision')::integer then raise exception 'stale_request';end if;
 if operation in ('late','keep','propose','change_accept','change_decline','agree') and a.state<>'active' then raise exception 'invalid_transition';end if;
 if operation='late' then
  if not a.confirmed then raise exception 'appointment_not_confirmed';end if;
  if (payload->>'minutes')::integer not between 1 and 240 or payload->>'minutes' is null then raise exception 'invalid_delay';end if;
  t:=jsonb_build_object('minutes',(payload->>'minutes')::integer);
 elsif operation='keep' then t:='{}';
 elsif operation='propose' then
  t:=a.terms||jsonb_build_object('at',payload->>'at','place',trim(payload->>'place'),'method',payload->>'method');
  perform private.appointment_check_terms(a,t);
  if exists(select 1 from private.appointment_changes where kind=k and appointment_id=rid and state='pending') then raise exception 'schedule_pending';end if;
  insert into private.appointment_changes(kind,appointment_id,actor,terms) values(k,rid,actor,t);
  t:='{}';
 elsif operation in ('change_accept','change_decline') then
  select * into ch from private.appointment_changes where kind=k and appointment_id=rid and state='pending' for update;
  if ch.id is null then raise exception 'invalid_transition';end if;
  if operation='change_accept' then
   if ch.actor=actor then raise exception 'request_forbidden';end if;
   perform private.appointment_check_terms(a,ch.terms);
   if k='consultation' then
    update private.consultations set preferred_at=(ch.terms->>'at')::timestamptz,method=ch.terms->>'method',duration_minutes=private.reservation_duration(a.terms->>'office',ch.terms->>'method'),revision=revision+1 where id=rid;
   else update private.urgent_requests set preferred_at=(ch.terms->>'at')::timestamptz,place=ch.terms->>'place',ends_at=(ch.terms->>'at')::timestamptz+interval '4 hours' where id=rid;end if;
   update private.appointment_care set terms=ch.terms where kind=k and id=rid;
   update private.appointment_reminders set state='cancelled' where kind=k and appointment_id=rid and state='pending';
  end if;
  update private.appointment_changes set state=case operation when 'change_accept' then 'accepted' else 'declined' end,resolved_at=now() where id=ch.id;
  t:='{}';
 elsif operation='cancel' then
  if a.state<>'active' then raise exception 'invalid_transition';end if;
  if char_length(coalesce(payload->>'reason',''))>300 then raise exception 'invalid_reason';end if;
  if k='consultation' then
   update private.consultations set state='cancelled',revision=revision+1,updated_at=now() where id=rid;
   update private.consultation_schedule_proposals set state='cancelled',resolved_at=now() where consultation_id=rid and state='pending';
   insert into private.consultation_events(consultation_id,actor,event) values(rid,actor,'cancel');
  else update private.urgent_requests set state='CANCELLED',closed_at=now(),latitude=null,longitude=null where id=rid;
   update private.urgent_offers set state='CLOSED' where request_id=rid and state='OFFERED';end if;
  update private.appointment_care set state='cancelled' where kind=k and id=rid;
  update private.appointment_changes set state='cancelled',resolved_at=now() where kind=k and appointment_id=rid and state='pending';
  update private.appointment_reminders set state='cancelled' where kind=k and appointment_id=rid and state='pending';
  t:=jsonb_build_object('reason',trim(coalesce(payload->>'reason','')));
 elsif operation='agree' then
  if not(a.kind='visit' and actor=a.expert_id and a.customer_agreed and not a.expert_agreed) then raise exception 'invalid_transition';end if;
  perform private.appointment_check_terms(a,a.terms);
  update private.urgent_requests set confirmed_at=now() where id=rid and state='ACCEPTED';
  if not found then raise exception 'invalid_transition';end if;
  update private.appointment_care set expert_agreed=true,confirmed=true where kind=k and id=rid;t:='{}';
 elsif operation in ('report','explain','appeal') then
  if char_length(trim(coalesce(payload->>'body',''))) not between 3 and 1000 then raise exception 'invalid_reason';end if;
  select * into cs from private.appointment_cases where kind=k and appointment_id=rid for update;
  if operation='report' then
   if not a.confirmed or (a.terms->>'at')::timestamptz>now() then raise exception 'appointment_not_confirmed';end if;
   insert into private.appointment_cases(kind,appointment_id,occurred_at) values(k,rid,(a.terms->>'at')::timestamptz) on conflict(kind,appointment_id) do nothing;
   select * into cs from private.appointment_cases where kind=k and appointment_id=rid;
   if exists(select 1 from private.appointment_statements s where s.case_id=cs.id and s.actor=actor and s.type='report') then raise exception 'report_already_received';end if;
  elsif cs.id is null then raise exception 'invalid_transition';end if;
  if operation='appeal' then
   if cs.outcome is null then raise exception 'invalid_transition';end if;
   update private.appointment_cases set appeal_pending=true where id=cs.id;
  end if;
  insert into private.appointment_statements(case_id,actor,type,body) values(cs.id,actor,operation,trim(payload->>'body'));
  t:='{}';
 elsif operation='decide' then
  select * into cs from private.appointment_cases where kind=k and appointment_id=rid for update;
  outcome:=payload->>'outcome';
  if cs.id is null or outcome not in ('expert_absent','consumer_absent','agreement','unverifiable','withdrawn') or outcome is null or char_length(trim(coalesce(payload->>'reason',''))) not between 5 and 1000 then raise exception 'invalid_reason';end if;
  if payload->>'records_reviewed' is distinct from 'true' or payload->>'both_sides_reviewed' is distinct from 'true' or payload->>'exceptions_reviewed' is distinct from 'true' then raise exception 'review_required';end if;
  if outcome in ('expert_absent','consumer_absent') and (payload->>'absence_verified' is distinct from 'true' or payload->>'no_advance_contact_verified' is distinct from 'true' or payload->>'not_silence_only' is distinct from 'true') then raise exception 'review_required';end if;
  if outcome in ('expert_absent','consumer_absent') and exists(select 1 from private.appointment_events e where e.kind=k and e.appointment_id=rid and e.event in ('late','cancel') and e.created_at<=cs.occurred_at and e.actor=case outcome when 'expert_absent' then a.expert_id else a.customer_id end) then raise exception 'advance_contact_recorded';end if;
  insert into private.appointment_decisions(case_id,actor,outcome,reason,review) values(cs.id,actor,outcome,trim(payload->>'reason'),payload-'request_key'-'reason');
  update private.appointment_cases set outcome=outcome,reason=trim(payload->>'reason'),decision_at=now(),appeal_pending=false where id=cs.id;
  perform private.appointment_recalculate(a.customer_id,'consumer');
  if a.expert_id is not null then perform private.appointment_recalculate(a.expert_id,'expert');end if;
  t:=jsonb_build_object('outcome',outcome);
 elsif operation='resume' then
  if char_length(trim(coalesce(payload->>'reason',''))) not between 5 and 1000 then raise exception 'invalid_reason';end if;
  update private.appointment_measures set resumed_at=now(),resumed_by=actor,review_required=false,updated_at=now()
   where user_id=a.expert_id and role='expert' and resume_required and ends_at<=now() and status='restricted';
  if not found then raise exception 'invalid_transition';end if;
  t:=jsonb_build_object('reason',trim(payload->>'reason'));
 elsif operation='review_cancellations' then
  if char_length(trim(coalesce(payload->>'reason',''))) not between 5 and 1000 then raise exception 'invalid_reason';end if;
  t:=jsonb_build_object('reason',trim(payload->>'reason'));
 else raise exception 'invalid_operation';end if;
 update private.appointment_care set revision=revision+1 where kind=k and id=rid;
 insert into private.appointment_events(kind,appointment_id,actor,event,detail) values(k,rid,actor,operation,coalesce(t,'{}')) returning id into ev;
 a:=private.appointment_sync(k,rid);
 if not((operation='cancel' or operation='change_accept' and k='consultation') and exists(select 1 from pg_trigger where not tgisinternal and tgname=case k when 'consultation' then 'reservation_notification' else 'urgent_notification' end and tgrelid=case k when 'consultation' then 'private.consultations'::regclass else 'private.urgent_requests'::regclass end)) then
 perform private.appointment_notify(a,ev::text,
  case operation when 'report' then '불참 확인 중' when 'cancel' then '약속이 취소되었습니다' when 'late' then '지각 안내가 도착했습니다' when 'decide' then '약속 확인 결과가 등록되었습니다' else '약속 안내가 업데이트되었습니다' end,
  case operation when 'report' then '약속 불참 신고가 접수되었습니다. 아직 노쇼로 확정된 것은 아닙니다. 당시 상황을 알려주세요.' else '예약 상세에서 현재 상태와 다음 행동을 확인해 주세요.' end);
 end if;
 result:=private.appointment_view(a);
 insert into private.appointment_receipts values(actor,key,operation,md5(payload::text));
 return result;
end$$;

create or replace function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.appointment_care;c private.consultations;result jsonb;op text;rid uuid;begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='request' then
  if private.appointment_blocked(auth.uid(),'consumer') or private.appointment_blocked(nullif(payload->>'planner_id','')::uuid,'expert') then raise exception 'new_appointments_restricted';end if;
 elsif operation in ('followup_propose','followup_confirm') then
  select * into c from private.consultations where id=(payload->>'id')::uuid;
  if private.appointment_blocked(c.customer_id,'consumer') or private.appointment_blocked(c.planner_id,'expert') then raise exception 'new_appointments_restricted';end if;
 end if;
 if operation='accept' and private.appointment_blocked(auth.uid(),'expert') then raise exception 'new_appointments_restricted';end if;
 if operation in ('cancel','propose','schedule_accept','schedule_decline') or operation='issue' and payload->>'category'='no_show' then
  a:=private.appointment_sync('consultation',(payload->>'id')::uuid);
  select * into c from private.consultations where id=a.id;
  if operation<>'issue' and (payload->>'revision')::integer is distinct from c.revision then raise exception 'stale_request';end if;
  op:=case operation when 'schedule_accept' then 'change_accept' when 'schedule_decline' then 'change_decline' when 'issue' then 'report' else operation end;
  return public.appointment_care(op,payload||jsonb_build_object('kind','consultation','revision',a.revision,'at',payload->>'preferred_at','place',coalesce(payload->>'place',a.terms->>'place'),'method',coalesce(payload->>'method',a.terms->>'method'),'body',payload->>'reason','request_key',coalesce(payload->>'request_key',gen_random_uuid()::text)));
 end if;
 if operation in ('accept','confirm','office_confirm') then
  a:=private.appointment_sync('consultation',(payload->>'id')::uuid);
  if operation='accept' then
   if auth.uid() is distinct from a.expert_id then raise exception 'request_forbidden';end if;
   if nullif(a.terms->>'place','') is null then
    if char_length(trim(coalesce(payload->>'place',''))) not between 2 and 160 then raise exception 'appointment_place_required';end if;
    update private.appointment_care set terms=terms||jsonb_build_object('place',trim(payload->>'place')) where kind=a.kind and id=a.id;
   end if;
  else
   if (payload->>'care_revision')::integer is distinct from a.revision then raise exception 'stale_request';end if;
  end if;
 end if;
 result:=public.consultation_command_before_appointment_care(operation,payload);
 rid:=coalesce(nullif(result->>'id','')::uuid,nullif(payload->>'id','')::uuid);
 if rid is not null and exists(select 1 from private.consultations where id=rid) then
  a:=private.appointment_sync('consultation',rid);
  if operation in ('accept','confirm','office_confirm') then
   update private.appointment_care set expert_agreed=case when operation='accept' then true else expert_agreed end,
    customer_agreed=case when operation<>'accept' then true else customer_agreed end,
    confirmed=operation<>'accept' and expert_agreed,revision=revision+1 where kind=a.kind and id=a.id;
   a:=private.appointment_sync('consultation',rid);
  end if;
  if operation in ('request','accept','confirm','office_confirm','journey','complete_request','complete_confirm') then
   perform private.appointment_source_event(a,operation,case operation when 'request' then '요청이 접수되었습니다' when 'accept' then '전문가가 수락했습니다. 시간·장소를 확인해 주세요' when 'confirm' then '약속이 확정되었습니다' when 'office_confirm' then '약속이 확정되었습니다' when 'complete_confirm' then '상담 완료를 확인했습니다' else '예약 진행 상태가 변경되었습니다' end);
  end if;
 end if;
 return result;
end$$;

create or replace function public.urgent_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.appointment_care;result jsonb;rid uuid;begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='request' and (private.appointment_blocked(auth.uid(),'consumer') or private.appointment_blocked(nullif(payload->>'planner_id','')::uuid,'expert')) or operation='accept' and private.appointment_blocked(auth.uid(),'expert') then raise exception 'new_appointments_restricted';end if;
 if operation='cancel' then
  a:=private.appointment_sync('visit',(payload->>'id')::uuid);
  return public.appointment_care('cancel',payload||jsonb_build_object('kind','visit','revision',a.revision,'request_key',coalesce(payload->>'request_key',gen_random_uuid()::text)));
 end if;
 if operation='confirm_visit' then
  a:=private.appointment_sync('visit',(payload->>'id')::uuid);
  if (payload->>'care_revision')::integer is distinct from a.revision or a.customer_agreed then raise exception 'stale_request';end if;
 end if;
 result:=public.urgent_command_before_appointment_care(operation,payload);
 rid:=coalesce(nullif(result->>'id','')::uuid,nullif(payload->>'id','')::uuid);
 if rid is not null and exists(select 1 from private.urgent_requests where id=rid) then
  if operation='confirm_visit' then
   update private.urgent_requests set confirmed_at=null where id=rid;
   update private.appointment_care set customer_agreed=true,expert_agreed=false,confirmed=false,revision=revision+1 where kind='visit' and id=rid;
  end if;
  a:=private.appointment_sync('visit',rid);
  if operation in ('request','accept','confirm_visit','trip') then
   perform private.appointment_source_event(a,operation||coalesce(payload->>'state',''),case operation when 'request' then '방문상담 요청이 접수되었습니다' when 'accept' then '전문가가 수락했습니다. 방문 장소를 확인해 주세요' when 'confirm_visit' then '고객이 장소 확인을 요청했습니다' else '방문 진행 상태가 변경되었습니다' end);
  end if;
 end if;
 return result;
end$$;

create or replace function private.expire_urgent() returns void language plpgsql security definer set search_path='' as $$
begin
 update private.instant_availability set enabled=false,latitude=null,longitude=null,accuracy=null where (expires_at<=now() or not private.urgent_eligible(user_id)) and (enabled or latitude is not null);
 update private.urgent_requests v set state='EXPIRED',closed_at=now(),latitude=null,longitude=null
 where (state='REQUESTED' and expires_at<=now()) or (state not in ('COMPLETED','CANCELLED','EXPIRED') and ends_at<=now() and confirmed_at is null and not exists(select 1 from private.appointment_care a where a.kind='visit' and a.id=v.id and a.confirmed));
 update private.urgent_offers o set state='CLOSED' from private.urgent_requests r where o.request_id=r.id and o.state='OFFERED' and r.state<>'REQUESTED';
 update private.urgent_requests set latitude=null,longitude=null where state in ('ARRIVED','COMPLETED','CANCELLED','EXPIRED') and latitude is not null;
 -- Existing contact cleanup after closure. Active appointment retention needs operator approval before rollout.
 update private.appointment_care a set terms=a.terms-'place',state=case v.state when 'COMPLETED' then 'completed' else 'cancelled' end from private.urgent_requests v
  where a.kind='visit' and a.id=v.id and v.state in ('COMPLETED','CANCELLED','EXPIRED') and greatest(v.ends_at,v.closed_at)<now()-interval '24 hours';
 update private.appointment_changes c set terms=c.terms-'place' from private.urgent_requests v
  where c.kind='visit' and c.appointment_id=v.id and v.state in ('COMPLETED','CANCELLED','EXPIRED') and greatest(v.ends_at,v.closed_at)<now()-interval '24 hours';
 delete from private.urgent_requests where state in ('COMPLETED','CANCELLED','EXPIRED') and greatest(ends_at,closed_at)<now()-interval '24 hours';
 delete from private.service_area_history where changed_at<now()-interval '1 year';
end$$;

create or replace function private.appointment_source_event(a private.appointment_care,op text,heading text) returns void language plpgsql security definer set search_path='' as $$
declare e bigint;begin
 insert into private.appointment_events(kind,appointment_id,actor,event,dedupe_key)
 values(a.kind,a.id,auth.uid(),op,'source:'||op) on conflict(kind,appointment_id,dedupe_key) do nothing returning id into e;
 if e is not null and (op='confirm_visit' or not exists(select 1 from pg_trigger where not tgisinternal and tgname=case a.kind when 'consultation' then 'reservation_notification' else 'urgent_notification' end and tgrelid=case a.kind when 'consultation' then 'private.consultations'::regclass else 'private.urgent_requests'::regclass end)) then
  perform private.appointment_notify(a,'source:'||e::text,heading,'예약 상세에서 현재 상태와 다음 행동을 확인해 주세요.');
 end if;
end$$;
create or replace function private.appointment_paid(uid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.ad_subscriptions where planner_id=uid and state in ('active','confirming','refunding','refund_failed') and (ends_at is null or ends_at>now()))
$$;
create or replace function private.appointment_blocked(uid uuid,who text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.appointment_measures m join private.appointment_policy p on p.version=m.policy_version
 where m.user_id=uid and m.role=who and p.enforcement_enabled and p.effective_at<=now()
 and m.status='restricted' and (m.ends_at>now() or m.resume_required and m.resumed_at is null)
 and not(who='expert' and private.appointment_paid(uid)))
$$;
create or replace function private.appointment_notify(a private.appointment_care,event_key text,heading text,body_text text,recipient uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid;begin
 if a.kind='visit' and a.expert_id is null then select planner_id into a.expert_id from private.urgent_offers where request_id=a.id order by rank limit 1;end if;
 foreach uid in array array[a.customer_id,a.expert_id] loop
  if uid is not null and (recipient is null or recipient=uid) then
   insert into private.notifications(recipient_user_id,notification_type,title,body,deep_link,dedupe_key)
   values(uid,'appointment',heading,body_text,case when uid=a.customer_id then '/requests.html' else '/partner-work.html' end||'?request='||a.id::text,
   'appointment:'||a.kind||':'||a.id||':'||event_key) on conflict(recipient_user_id,dedupe_key) do nothing;
  end if;
 end loop;
end$$;
create or replace function private.appointment_sync(k text,rid uuid) returns private.appointment_care language plpgsql security definer set search_path='' as $$
declare c private.consultations;v private.urgent_requests;a private.appointment_care;uid uuid;expert uuid;t jsonb;fixed boolean;st text;begin
 perform pg_advisory_xact_lock(hashtextextended('appointment:'||k||rid::text,55));
 if k='consultation' then
  select * into c from private.consultations where id=rid for update;
  if c.id is null then select * into a from private.appointment_care where kind=k and id=rid;if a.id is not null and a.state<>'active' then return a;end if;raise exception 'appointment_not_found';end if;
  uid:=c.customer_id;expert:=c.planner_id;
  t:=jsonb_build_object('at',c.preferred_at,'method',c.method,'place',case when c.method='phone' then '전화상담' else (select address from private.office_locations where id=c.office_id) end,'office',c.office_id,'region',c.region,'purpose',c.purpose);
  fixed:=c.customer_ok and c.planner_ok and c.state in ('scheduled','confirmed','awaiting_completion','completed') and nullif(t->>'place','') is not null;
  st:=case c.state when 'cancelled' then 'cancelled' when 'unmatched' then 'cancelled' when 'completed' then 'completed' else 'active' end;
 elsif k='visit' then
  select * into v from private.urgent_requests where id=rid for update;
  if v.id is null then select * into a from private.appointment_care where kind=k and id=rid;if a.id is not null and a.state<>'active' then return a;end if;raise exception 'appointment_not_found';end if;
  uid:=v.customer_id;expert:=v.planner_id;
  t:=jsonb_build_object('at',v.preferred_at,'method','visit','place',v.place,'region',v.area_id,'purpose',v.purpose);
  fixed:=v.confirmed_at is not null;st:=case v.state when 'CANCELLED' then 'cancelled' when 'EXPIRED' then 'cancelled' when 'COMPLETED' then 'completed' else 'active' end;
 else raise exception 'invalid_appointment_kind';end if;
 insert into private.appointment_care(kind,id,customer_id,expert_id,terms,confirmed,customer_agreed,expert_agreed,state)
 values(k,rid,uid,expert,t,fixed,fixed,fixed,st) on conflict(kind,id) do update set expert_id=excluded.expert_id,state=excluded.state;
 select * into a from private.appointment_care where kind=k and id=rid for update;
 if a.state='active' and a.confirmed then
  insert into private.appointment_reminders(kind,appointment_id,scheduled_at,recipient)
  select k,rid,(a.terms->>'at')::timestamptz,x from unnest(array[a.customer_id,a.expert_id]) x where x is not null on conflict do nothing;
 else update private.appointment_reminders set state='cancelled' where kind=k and appointment_id=rid and state='pending';end if;
 return a;
end$$;

create or replace function private.appointment_recalculate(uid uuid,who text) returns void language plpgsql security definer set search_path='' as $$
declare p private.appointment_policy;m private.appointment_measures;n integer;days integer;next_status text;until_at timestamptz;manual boolean:=false;begin
 perform pg_advisory_xact_lock(hashtextextended('appointment-measure:'||uid::text||who,55));
 select * into p from private.appointment_policy where version='appointment-2026-10-v1';
 n:=private.appointment_count(uid,who);
 select * into m from private.appointment_measures where user_id=uid and role=who for update;
 days:=case when n=2 then case who when 'consumer' then 3 else 7 end when n=3 then case who when 'consumer' then 7 else 30 end else 0 end;
 next_status:=case when n=0 then 'none' when n=1 then 'warning' when not p.enforcement_enabled or p.effective_at>now() then 'held_policy' when who='expert' and private.appointment_paid(uid) then 'held_paid' when n>3 then 'manual_review' else 'restricted' end;
 until_at:=case when next_status='restricted' then now()+make_interval(days=>days) end;
 -- An additional finding never stacks or extends an existing restriction automatically.
 if m.status='restricted' and (m.ends_at>now() or m.resume_required and m.resumed_at is null) and n>=m.confirmed_count and next_status not in ('held_paid','held_policy') then
  next_status:='restricted';until_at:=m.ends_at;manual:=n>m.confirmed_count or m.review_required;
 elsif m.status='restricted' and n<m.confirmed_count and next_status='restricted' then
  until_at:=least(m.ends_at,m.starts_at+make_interval(days=>days));
 elsif m.confirmed_count=n and m.status='restricted' and next_status='restricted' then
  until_at:=m.ends_at;
 end if;
 insert into private.appointment_measures(user_id,role,policy_version,confirmed_count,status,starts_at,ends_at,resume_required,review_required)
 values(uid,who,p.version,n,next_status,case when next_status='restricted' then case when m.status='restricted' and (n<=m.confirmed_count or m.ends_at>now() or m.resume_required and m.resumed_at is null) then m.starts_at else now() end end,until_at,who='expert' and n=3 and next_status='restricted',manual or n>3)
 on conflict(user_id,role) do update set confirmed_count=excluded.confirmed_count,status=excluded.status,
 starts_at=excluded.starts_at,ends_at=excluded.ends_at,
 resume_required=case when n>3 and next_status='restricted' then m.resume_required else excluded.resume_required end,
 resumed_at=case when n=m.confirmed_count then m.resumed_at end,review_required=excluded.review_required,updated_at=now();
end$$;

create or replace function private.appointment_check_terms(a private.appointment_care,t jsonb) returns void language plpgsql security definer set search_path='' as $$
declare stamp timestamptz:=(t->>'at')::timestamptz;begin
 if a.expert_id is null or char_length(coalesce(t->>'place','')) not between 2 and 160 then raise exception 'appointment_place_required';end if;
 if a.kind='consultation' then
  if t->>'method' is null or t->>'method' not in ('phone','nearby','scheduled') or a.terms->>'office' is not null and (t->>'method'<>'scheduled' or t->>'place' is distinct from a.terms->>'place') then raise exception 'invalid_method';end if;
  perform private.check_reservation_slot(a.expert_id,a.terms->>'office',stamp,a.id,t->>'method');
 else
  if t->>'method' is distinct from 'visit' or stamp is null or stamp<=now() or stamp>now()+interval '90 days' then raise exception 'invalid_visit_time';end if;
  perform pg_advisory_xact_lock(hashtextextended('planner:'||a.expert_id::text,33));
  if exists(select 1 from private.consultations c where c.planner_id=a.expert_id and c.state in ('requested','coordinating','confirmed','scheduled','awaiting_completion') and tstzrange(c.preferred_at,c.preferred_at+make_interval(mins=>c.duration_minutes),'[)') && tstzrange(stamp,stamp+interval '1 hour','[)'))
  or exists(select 1 from private.urgent_requests v where v.planner_id=a.expert_id and v.id<>a.id and v.state not in ('CANCELLED','EXPIRED','COMPLETED') and tstzrange(v.preferred_at,v.preferred_at+interval '1 hour','[)') && tstzrange(stamp,stamp+interval '1 hour','[)'))
  or exists(select 1 from private.followup_meetings f where f.planner_id=a.expert_id and f.state='confirmed' and tstzrange(f.preferred_at,f.preferred_at+interval '30 minutes','[)') && tstzrange(stamp,stamp+interval '1 hour','[)')) then raise exception 'slot_unavailable';end if;
 end if;
end$$;

create or replace function private.flush_appointment_reminders(recipient_filter uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare r private.appointment_reminders;a private.appointment_care;begin
 for r in select * from private.appointment_reminders where state='pending' and scheduled_at between now() and now()+interval '30 minutes' and (recipient_filter is null or recipient=recipient_filter) order by scheduled_at limit 200 loop
  a:=private.appointment_sync(r.kind,r.appointment_id);
  if a.confirmed and a.state='active' and (a.terms->>'at')::timestamptz=r.scheduled_at
   and exists(select 1 from private.appointment_reminders q where q.kind=r.kind and q.appointment_id=r.appointment_id and q.scheduled_at=r.scheduled_at and q.recipient=r.recipient and q.state='pending') then
   perform private.appointment_notify(a,'reminder:'||(a.terms->>'at'),'약속 시간 안내','곧 약속 시간입니다. 늦거나 참석이 어렵다면 상대방에게 미리 알려주세요.',r.recipient);
   update private.appointment_reminders q set state='sent' where q.kind=r.kind and q.appointment_id=r.appointment_id and q.scheduled_at=r.scheduled_at and q.recipient=r.recipient;
  end if;
 end loop;
end$$;
revoke all on function private.flush_appointment_reminders(uuid) from public,anon,authenticated;
-- No cron activation in this draft. Proposed interval: one minute, using the existing job runner.
-- Revoke implementation helpers, including renamed legacy entry points.
create or replace function public.planner_catalog(area text default '',wanted text default '') returns jsonb language sql stable security definer set search_path='' as $$
 select b||jsonb_build_object('planners',coalesce((select jsonb_agg(p||jsonb_build_object('newRequestsRestricted',private.appointment_blocked((p->>'id')::uuid,'expert'),'availableSetting',p->'available','available',coalesce((p->>'available')::boolean,false) and not private.appointment_blocked((p->>'id')::uuid,'expert'))) from jsonb_array_elements(b->'planners') p),'[]')) from (select public.planner_catalog_before_appointment_care(area,wanted) b)q
$$;
create or replace function public.visit_catalog(payload jsonb default '{}') returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(p),'[]') from jsonb_array_elements(public.visit_catalog_before_appointment_care(payload))p where not private.appointment_blocked((p->>'id')::uuid,'expert')
$$;
revoke all on function public.planner_catalog_before_appointment_care(text,text),public.visit_catalog_before_appointment_care(jsonb),public.planner_catalog(text,text),public.visit_catalog(jsonb) from public,anon,authenticated;
grant execute on function public.planner_catalog(text,text),public.visit_catalog(jsonb) to anon,authenticated;
do $$declare r record;begin
 for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='private' and p.proname like 'appointment_%') or (n.nspname='public' and p.proname in ('appointment_care','consultation_command','urgent_command','consultation_command_before_appointment_care','urgent_command_before_appointment_care')) loop
 execute format('revoke all on function %s from public,anon,authenticated',r.sig);
 end loop;
end$$;
grant execute on function public.appointment_care(text,jsonb),public.consultation_command(text,jsonb),public.urgent_command(text,jsonb) to authenticated;
-- Preserve existing pending time proposals when upgrading 053.
do $$declare r record;a private.appointment_care;begin
 for r in select * from private.consultation_schedule_proposals where state='pending' loop
 a:=private.appointment_sync('consultation',r.consultation_id);
 if not exists(select 1 from private.appointment_changes where kind='consultation' and appointment_id=r.consultation_id and state='pending') then
 insert into private.appointment_changes(kind,appointment_id,actor,terms,created_at) values('consultation',r.consultation_id,r.proposed_by,a.terms||jsonb_build_object('at',r.preferred_at),r.created_at);
 end if;
 end loop;
end$$;
commit;
