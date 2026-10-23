begin;
select pg_advisory_xact_lock(74001);
create table if not exists private.booking_request_consents(
 consultation_id uuid primary key references private.consultations(id) on delete cascade,
 customer_id uuid not null references auth.users(id), planner_id uuid, office_id text,
 customer_name text not null check(length(customer_name) between 2 and 60),
 terms jsonb not null, version text not null, agreed_at timestamptz not null default now()
);
alter table private.booking_request_consents enable row level security;
revoke all on private.booking_request_consents from public,anon,authenticated;
do $$begin
 if to_regprocedure('public.consultation_command_before_same_time(text,jsonb)') is null then alter function public.consultation_command(text,jsonb) rename to consultation_command_before_same_time;end if;
 if to_regprocedure('public.consultation_workspace_before_same_time(text)') is null then alter function public.consultation_workspace(text) rename to consultation_workspace_before_same_time;end if;
end$$;
create or replace function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;c private.consultations;a jsonb;s private.booking_request_consents;number text;care boolean:=to_regclass('private.appointment_care') is not null;pending boolean:=false;begin
 if operation='request' and payload->>'confirmation_version'='same-time-v1' then
  if payload->'share_consent' is distinct from 'true'::jsonb or length(trim(coalesce(payload->>'name',''))) not between 2 and 60 then raise exception 'consent_required';end if;
  if private.verified_contact(auth.uid()) is null then raise exception 'phone_verification_required';end if;
 end if;
 result:=public.consultation_command_before_same_time(operation,payload);
 if operation='request' and payload->>'confirmation_version'='same-time-v1' and not coalesce((result->>'replay')::boolean,false) then
  select * into c from private.consultations where id=(result->>'id')::uuid;
  if c.customer_id is distinct from auth.uid() then raise exception 'request_forbidden';end if;
  if care then execute 'select to_jsonb(private.appointment_sync(''consultation'',$1))' into a using c.id;
  else a:=jsonb_build_object('terms',jsonb_build_object('at',c.preferred_at,'method',c.method,'region',c.region,'office',c.office_id));end if;
  insert into private.booking_request_consents(consultation_id,customer_id,planner_id,office_id,customer_name,terms,version)
  values(c.id,c.customer_id,c.planner_id,c.office_id,trim(payload->>'name'),(a->'terms'),'same-time-v1') on conflict do nothing;
 elsif operation='accept' then
  select * into c from private.consultations where id=(payload->>'id')::uuid for update;
  select * into s from private.booking_request_consents where consultation_id=c.id;
  if care then execute 'select to_jsonb(private.appointment_sync(''consultation'',$1))' into a using c.id;
  else a:=jsonb_build_object('terms',jsonb_build_object('at',c.preferred_at,'method',c.method,'region',c.region,'office',c.office_id));end if;
  if care then execute 'select exists(select 1 from private.appointment_changes where kind=''consultation'' and appointment_id=$1 and state=''pending'')' into pending using c.id;end if;
  if c.planner_id=auth.uid() and c.state='coordinating' and c.planner_ok and s.customer_id=c.customer_id
   and (s.planner_id=c.planner_id or s.planner_id is null and s.office_id=c.office_id)
   and s.terms=(a->'terms') and c.preferred_at=(s.terms->>'at')::timestamptz and c.method=s.terms->>'method'
   and (not care or nullif((a->'terms')->>'place','') is not null)
   and not pending
   and not exists(select 1 from private.consultation_schedule_proposals where consultation_id=c.id and state='pending') then
   number:=private.verified_contact(c.customer_id);
   if number is null then raise exception 'phone_verification_required';end if;
   number:=case when number like '+82%' then '0'||substr(number,4) when number like '82%' then '0'||substr(number,3) else number end;
   insert into private.consultation_contacts(consultation_id,customer_name,phone,recipient,version,consented_at)
   values(c.id,s.customer_name,number,c.planner_id,s.version,s.agreed_at)
   on conflict(consultation_id) do update set customer_name=excluded.customer_name,phone=excluded.phone,recipient=excluded.recipient,version=excluded.version,consented_at=excluded.consented_at;
   update private.consultations set customer_ok=true,state='scheduled' where id=c.id;
   if care then execute 'update private.appointment_care set confirmed=true,customer_agreed=true,expert_agreed=true,revision=revision+1 where kind=''consultation'' and id=$1' using c.id;end if;
   if care then execute 'select to_jsonb(private.appointment_sync(''consultation'',$1))' into a using c.id;
  else a:=jsonb_build_object('terms',jsonb_build_object('at',c.preferred_at,'method',c.method,'region',c.region,'office',c.office_id));end if;
   insert into private.consultation_events(consultation_id,actor,event,metadata) values(c.id,auth.uid(),'same_time_confirmed',jsonb_build_object('consent_version',s.version));
   if care then execute 'select private.appointment_source_event(private.appointment_sync(''consultation'',$1),''same_time_confirmed'',''선택한 시간으로 예약이 확정되었습니다'')' using c.id;end if;
   result:=result||jsonb_build_object('confirmed',true);
  end if;
 end if;
 return result;
end$$;
create or replace function public.consultation_workspace(workspace text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin return public.consultation_workspace_before_same_time(workspace)||jsonb_build_object('sameTimeConfirmationEnabled',true,'optionalReviewEnabled',true);end$$;
alter table private.consultation_reviews drop constraint if exists consultation_reviews_body_check;
alter table private.consultation_reviews add constraint consultation_reviews_body_check check(length(body) between 0 and 500);
revoke all on function public.consultation_command_before_same_time(text,jsonb),public.consultation_workspace_before_same_time(text),public.consultation_command(text,jsonb),public.consultation_workspace(text) from public,anon,authenticated;
grant execute on function public.consultation_command(text,jsonb),public.consultation_workspace(text) to authenticated;
create or replace function public.booking_flow_capabilities() returns jsonb language sql stable set search_path='' as $$ select jsonb_build_object('sameTimeConfirmationEnabled',true) $$;
revoke all on function public.booking_flow_capabilities() from public,anon,authenticated;
grant execute on function public.booking_flow_capabilities() to authenticated;
commit;
