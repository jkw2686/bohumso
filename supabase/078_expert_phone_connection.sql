begin;
select pg_advisory_xact_lock(780078);
-- Only newly opted-in direct connections use this mode. Existing bookings are untouched.
alter table private.consultations add column if not exists connection_only boolean not null default false;
alter table private.consultations alter column preferred_at drop not null;
alter table private.consultations drop constraint if exists consultation_connection_shape;
alter table private.consultations add constraint consultation_connection_shape check(
 (not connection_only and preferred_at is not null) or
 (connection_only and preferred_at is null and office_id is null and allocation_mode='direct' and planner_id is not null and not customer_ok and state in('requested','coordinating','unmatched','cancelled')));
create table if not exists private.connection_consents(
 consultation_id uuid primary key references private.consultations(id),customer_id uuid not null,recipient uuid not null,
 customer_name text not null,phone text not null,version text not null,agreed_at timestamptz not null default now());
create table if not exists private.connection_contact_reads(
 id bigint generated always as identity primary key,consultation_id uuid not null references private.consultations(id),viewer uuid not null,viewed_at timestamptz not null default now());
alter table private.connection_consents enable row level security;
alter table private.connection_contact_reads enable row level security;
revoke all on private.connection_consents,private.connection_contact_reads from public,anon,authenticated;
do $$begin
 if to_regprocedure('public.consultation_command_before_phone_connection(text,jsonb)') is null then alter function public.consultation_command(text,jsonb) rename to consultation_command_before_phone_connection;end if;
 if to_regprocedure('public.consultation_workspace_before_phone_connection(text)') is null then alter function public.consultation_workspace(text) rename to consultation_workspace_before_phone_connection;end if;
end$$;
create or replace function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();c private.consultations;target uuid;rid uuid;key uuid;number text;customer_name text;profile jsonb;notice text;s private.connection_consents;begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='request' and payload->'connection_only'='true'::jsonb then
  perform private.require_booking_access();
  target:=nullif(payload->>'planner_id','')::uuid;key:=nullif(payload->>'request_key','')::uuid;
  if target is null or target=actor or nullif(payload->>'office_id','') is not null or coalesce((payload->>'office_assignment')::boolean,false) or coalesce((payload->>'automatic')::boolean,false) then raise exception 'select_planner';end if;
  if payload->'share_consent' is distinct from 'true'::jsonb then raise exception 'consent_required';end if;
  if key is null then raise exception 'request_key_required';end if;
  perform pg_advisory_xact_lock(hashtextextended('customer:'||actor::text,33));
  select * into c from private.consultations where customer_id=actor and request_key=key;
  if found then
   if not c.connection_only or c.planner_id<>target or c.purpose is distinct from payload->>'purpose' or c.region is distinct from trim(payload->>'region') then raise exception 'request_key_conflict';end if;
   if c.state in('cancelled','unmatched') then raise exception 'request_closed';end if;
   return jsonb_build_object('id',c.id,'replay',true);
  end if;
  select * into c from private.consultations where customer_id=actor and planner_id=target and connection_only and state in('requested','coordinating') order by created_at limit 1;
  if found then return jsonb_build_object('id',c.id,'replay',true);end if;
  perform 1 from private.planner_directory where user_id=target for share;
  if not private.planner_eligible(target) then raise exception 'invalid_partner';end if;
  select p into profile from jsonb_array_elements(public.planner_catalog('','')->'planners') p where p->>'id'=target::text and p->'available'='true'::jsonb;
  if profile is null then raise exception 'invalid_partner';end if;
  if to_regprocedure('private.beta_member()') is not null then
   if private.beta_member() is distinct from exists(select 1 from private.beta_members where user_id=target) then raise exception 'beta_scope_mismatch';end if;
  end if;
  if to_regprocedure('private.check_help_intent(jsonb)') is not null then perform private.check_help_intent(payload);end if;
  if profile->>'profession'='tax' then
   notice:=private.tax_fee_notice(target);
   if payload->>'fee_ack' is distinct from notice then raise exception 'fee_confirmation_required';end if;
   if payload->>'purpose' is distinct from 'other' then raise exception 'invalid_tax_purpose';end if;
  end if;
  if (select count(*) from private.consultations where customer_id=actor and state not in('cancelled','completed','unmatched') and (not connection_only or state='requested'))>=5 then raise exception 'request_limit';end if;
  number:=private.verified_contact(actor);if number is null then raise exception 'phone_verification_required';end if;
  number:=case when number like '+82%' then '0'||substr(number,4) when number like '82%' then '0'||substr(number,3) else number end;
  select coalesce(nullif(to_jsonb(m)->>'full_name',''),nullif(to_jsonb(m)->>'name',''),'상담 요청 고객') into customer_name from public.member_profiles m where user_id=actor;
  insert into private.consultations(customer_id,planner_id,purpose,region,method,preferred_at,request_key,connection_only)
   values(actor,target,payload->>'purpose',trim(payload->>'region'),'phone',null,key,true) returning id into rid;
  if notice is not null then update private.consultations set fee_notice=notice where id=rid;end if;
  insert into private.connection_consents(consultation_id,customer_id,recipient,customer_name,phone,version) values(rid,actor,target,customer_name,number,'phone-connection-v1');
  insert into private.consultation_events(consultation_id,actor,event,metadata) values(rid,actor,'connection_requested',jsonb_build_object('consent_version','phone-connection-v1'));
  return jsonb_build_object('id',rid);
 end if;
 select * into c from private.consultations where id=nullif(payload->>'id','')::uuid for update;
 if c.connection_only then
  if actor is distinct from c.customer_id and actor is distinct from c.planner_id then raise exception 'request_forbidden';end if;
  if operation not in('accept','pass','cancel','issue') then raise exception 'connection_phone_coordination_only';end if;
  if operation='issue' then
   if payload->>'category' not in('question','dispute') then raise exception 'invalid_operation';end if;
   insert into private.consultation_issues(consultation_id,actor,category,reason) values(c.id,actor,payload->>'category',payload->>'reason');return jsonb_build_object('id',c.id,'saved',true);
  end if;
  if operation in('accept','pass') and actor<>c.planner_id then raise exception 'request_forbidden';end if;
  if operation='accept' and c.state='coordinating' and c.planner_ok or operation='pass' and c.state='unmatched' or operation='cancel' and c.state='cancelled' then return jsonb_build_object('id',c.id,'replay',true);end if;
  if (payload->>'revision')::integer is distinct from c.revision then raise exception 'stale_request';end if;
  if operation in('accept','pass') and c.state<>'requested' or operation='cancel' and c.state not in('requested','coordinating') then raise exception 'invalid_transition';end if;
  if operation='accept' then
   if not private.planner_eligible(actor) then raise exception 'invalid_partner';end if;
   select * into s from private.connection_consents where consultation_id=c.id and customer_id=c.customer_id and recipient=actor;
   if s.consultation_id is null then raise exception 'consent_required';end if;
   insert into private.consultation_contacts(consultation_id,customer_name,phone,recipient,version,consented_at) values(c.id,s.customer_name,s.phone,actor,s.version,s.agreed_at);
  end if;
  -- Keep consent evidence but not a second indefinite copy of the phone number.
  update private.connection_consents set phone='' where consultation_id=c.id;
  if operation in('cancel','pass') then delete from private.consultation_contacts where consultation_id=c.id;end if;
  update private.consultations set state=case operation when 'accept' then 'coordinating' when 'pass' then 'unmatched' else 'cancelled' end,planner_ok=operation='accept',revision=revision+1,updated_at=now() where id=c.id;
  insert into private.consultation_events(consultation_id,actor,event) values(c.id,actor,'connection_'||operation);
  return jsonb_build_object('id',c.id,'saved',true);
 end if;
 return public.consultation_command_before_phone_connection(operation,payload);
end$$;
create or replace function public.consultation_workspace(workspace text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;rows jsonb:='[]';b jsonb;c private.consultations;contact jsonb;begin
 result:=public.consultation_workspace_before_phone_connection(workspace);
 for b in select value from jsonb_array_elements(result->'bookings') loop
  if coalesce((b->>'connection_only')::boolean,false) then
   select * into c from private.consultations where id=(b->>'id')::uuid;
   contact:=null;
   if workspace='partner' and c.planner_id=auth.uid() and c.state='coordinating' and c.planner_ok and private.planner_eligible(auth.uid()) then
    select jsonb_build_object('name',x.customer_name,'phone',x.phone) into contact from private.consultation_contacts x where x.consultation_id=c.id and x.recipient=auth.uid();
    if contact is not null then insert into private.connection_contact_reads(consultation_id,viewer) values(c.id,auth.uid());end if;
   end if;
   b:=b||jsonb_build_object('contact',contact,'planner_phone',null,'schedule_proposal',null,'needs_admin_review',false,'connection_status',case c.state when 'requested' then '상담 요청 중' when 'coordinating' then '상담 연결 완료' when 'unmatched' then '상담 요청을 수락하지 못했습니다' when 'cancelled' then '상담 요청 취소' end);
  end if;
  rows:=rows||jsonb_build_array(b);
 end loop;
 return result||jsonb_build_object('bookings',rows,'expertPhoneConnectionEnabled',true);
end$$;
-- Retain recipient, preference, push queue and deduplication implementation; only copy varies by mode.
do $migration$declare definition text;begin
 if to_regprocedure('private.booking_notice(private.consultations,text,text,uuid,uuid)') is not null then
  definition:=replace(pg_get_functiondef('private.booking_notice(private.consultations,text,text,uuid,uuid)'::regprocedure),chr(13),'');
  if position('PHONE_CONNECTION_COPY' in definition)=0 then
   definition:=replace(definition,'  begin'||chr(10)||'   insert into private.notifications',
    $copy$  -- PHONE_CONNECTION_COPY
  if c.connection_only then
   heading:=case event_name when 'REQUESTED' then '상담 요청 중' when 'ACCEPTED' then '상담 연결 완료' when 'REJECTED' then '상담 요청을 수락하지 못했습니다' when 'CANCELLED' then '상담 요청 취소' else heading end;
   message:=case event_name when 'REQUESTED' then case when customer then '상담을 요청하면 전문가가 확인 후 연락드립니다. 일정과 장소는 전화로 편하게 조율해 주세요.' else '새 상담 요청을 확인하고 수락 여부를 선택해 주세요.' end when 'ACCEPTED' then case when customer then '전문가가 상담 요청을 수락했습니다. 전화로 일정과 장소를 조율해 주세요.' else '고객에게 전화해 일정과 장소를 조율해 주세요.' end when 'REJECTED' then '상담 요청을 수락하지 못했습니다. 다른 전문가를 직접 선택할 수 있습니다.' when 'CANCELLED' then '상담 요청이 취소되었습니다.' else message end;
  end if;
  begin
   insert into private.notifications$copy$);
   if position('PHONE_CONNECTION_COPY' in definition)=0 then raise exception 'notification_definition_review_required';end if;
   execute definition;
  end if;
 end if;
end$migration$;
revoke all on function public.consultation_command_before_phone_connection(text,jsonb),public.consultation_workspace_before_phone_connection(text),public.consultation_command(text,jsonb),public.consultation_workspace(text) from public,anon,authenticated;
grant execute on function public.consultation_command(text,jsonb),public.consultation_workspace(text) to authenticated;
-- Optional appointment subsystem must never turn a phone connection into a meeting.
do $optional$begin
 if to_regprocedure('public.appointment_care(text,jsonb)') is not null then
  if to_regprocedure('public.appointment_care_before_phone_connection(text,jsonb)') is null then alter function public.appointment_care(text,jsonb) rename to appointment_care_before_phone_connection;end if;
  execute $ddl$create or replace function public.appointment_care(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $body$begin
   if payload->>'kind'='consultation' and exists(select 1 from private.consultations where id=nullif(payload->>'id','')::uuid and connection_only) then raise exception 'connection_phone_coordination_only';end if;
   return public.appointment_care_before_phone_connection(operation,payload);
  end$body$$ddl$;
  revoke all on function public.appointment_care_before_phone_connection(text,jsonb),public.appointment_care(text,jsonb) from public,anon,authenticated;
  grant execute on function public.appointment_care(text,jsonb) to authenticated;
 end if;
end$optional$;
notify pgrst,'reload schema';
commit;
