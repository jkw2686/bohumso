begin;
select pg_advisory_xact_lock(37001);
create table if not exists private.phone_contacts(user_id uuid primary key references auth.users(id),phone_e164 text not null check(phone_e164~'^\+8210[0-9]{8}$'),phone_verified_at timestamptz,phone_verification_status text not null check(phone_verification_status in ('UNVERIFIED','OTP_VERIFIED','REVERIFY_REQUIRED')));
create table if not exists private.phone_otp_challenges(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),phone_e164 text not null,otp_hash text,ip_hash text not null,expires_at timestamptz not null,attempt_count integer not null default 0,send_count integer not null default 1,last_sent_at timestamptz,verified_at timestamptz,status text not null default 'PENDING' check(status in ('PENDING','VERIFIED','EXPIRED','LOCKED','CANCELLED')),created_at timestamptz not null default now());
create index if not exists phone_otp_recent on private.phone_otp_challenges(created_at);
alter table private.phone_contacts enable row level security;
alter table private.phone_otp_challenges enable row level security;
revoke all on private.phone_contacts,private.phone_otp_challenges from public,anon,authenticated;
insert into private.phone_contacts(user_id,phone_e164,phone_verified_at,phone_verification_status) select id,case when phone like '+82%' then phone when phone like '82%' then '+'||phone else '+82'||substr(phone,2) end,phone_confirmed_at,'OTP_VERIFIED' from auth.users where phone_confirmed_at is not null and phone~'^(\+?82|0)10[0-9]{8}$' on conflict do nothing;
create or replace function private.verified_contact(subject uuid) returns text language sql stable security definer set search_path='' as $$
 select phone_e164 from private.phone_contacts where user_id=subject and phone_verification_status='OTP_VERIFIED' and phone_verified_at is not null and not exists(select 1 from private.account_lifecycle where user_id=subject and status<>'ACTIVE')
$$;
revoke all on function private.verified_contact(uuid) from public,anon,authenticated;
create or replace function public.phone_otp_service(subject uuid,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare item private.phone_otp_challenges;number text:=payload->>'phone';current_time_otp timestamptz:=clock_timestamp();recent integer;stamp timestamptz; contact text;
begin
 if subject is null or not exists(select 1 from public.member_profiles p join auth.users u on u.id=p.user_id join public.member_consents c on c.user_id=u.id where p.user_id=subject and u.email_confirmed_at is not null) or exists(select 1 from private.account_lifecycle where user_id=subject and status<>'ACTIVE') then return jsonb_build_object('error','membership_required');end if;
 -- One short DB lock serializes reservations and verification across Function instances.
 perform pg_advisory_xact_lock(37002);
 update private.phone_otp_challenges set status='EXPIRED',otp_hash=null where status='PENDING' and expires_at<=current_time_otp;
 if operation='status' then contact:=private.verified_contact(subject);return jsonb_build_object('verified',contact is not null,'maskedPhone',case when contact is not null then '010-'||substr(contact,6,2)||'**-'||right(contact,4) end);end if;
 if operation in ('reserve','verify') and (number is null or number!~'^\+8210[0-9]{8}$' or coalesce(payload->>'hash','')!~'^[a-f0-9]{64}$') then return jsonb_build_object('error','invalid_phone');end if;
 if operation='reserve' then
  if coalesce(payload->>'ip_hash','')!~'^[a-f0-9]{64}$' then return jsonb_build_object('error','invalid_phone');end if;
  select max(created_at),count(*) into stamp,recent from private.phone_otp_challenges where created_at>current_time_otp-interval '10 minutes' and (phone_e164=number or user_id=subject);
  if stamp>current_time_otp-interval '30 seconds' then return jsonb_build_object('error','otp_cooldown','retryAfter',ceil(extract(epoch from stamp+interval '30 seconds'-current_time_otp)));end if;
  if recent>=3 or (select count(*) from private.phone_otp_challenges where ip_hash=payload->>'ip_hash' and created_at>current_time_otp-interval '10 minutes')>=10 then return jsonb_build_object('error','otp_rate_limit');end if;
  update private.phone_otp_challenges set status='CANCELLED',otp_hash=null where user_id=subject and status='PENDING';
  -- Changing a contact invalidates its prior verification immediately. Auth identity is untouched.
  update private.phone_contacts set phone_verification_status='REVERIFY_REQUIRED' where user_id=subject and phone_e164<>number;
  insert into private.phone_otp_challenges(user_id,phone_e164,otp_hash,ip_hash,expires_at,send_count) values(subject,number,payload->>'hash',payload->>'ip_hash',current_time_otp+interval '3 minutes',recent+1) returning * into item;
  return jsonb_build_object('id',item.id);
 end if;
 if operation in ('sent','cancel') then
  update private.phone_otp_challenges set last_sent_at=case when operation='sent' then current_time_otp end,status=case when operation='cancel' then 'CANCELLED' else status end,otp_hash=case when operation='cancel' then null else otp_hash end where id=(payload->>'id')::uuid and user_id=subject and status='PENDING';
  return jsonb_build_object('saved',found);
 end if;
 if operation<>'verify' then return jsonb_build_object('error','invalid_operation');end if;
 select * into item from private.phone_otp_challenges where user_id=subject and phone_e164=number order by created_at desc,id desc limit 1 for update;
 if item.id is null or item.status in ('EXPIRED','CANCELLED','VERIFIED') then return jsonb_build_object('error','otp_expired');end if;
 if item.status='LOCKED' or item.attempt_count>=5 then return jsonb_build_object('error','otp_locked');end if;
 if item.last_sent_at is null then return jsonb_build_object('error','sms_unavailable');end if;
 if item.otp_hash is distinct from payload->>'hash' then
  update private.phone_otp_challenges set attempt_count=attempt_count+1,status=case when attempt_count+1>=5 then 'LOCKED' else status end,otp_hash=case when attempt_count+1>=5 then null else otp_hash end where id=item.id;
  return jsonb_build_object('error',case when item.attempt_count+1>=5 then 'otp_locked' else 'invalid_otp' end);
 end if;
 update private.phone_otp_challenges set status='VERIFIED',verified_at=current_time_otp,otp_hash=null where id=item.id;
 insert into private.phone_contacts(user_id,phone_e164,phone_verified_at,phone_verification_status) values(subject,number,current_time_otp,'OTP_VERIFIED') on conflict(user_id) do update set phone_e164=excluded.phone_e164,phone_verified_at=excluded.phone_verified_at,phone_verification_status='OTP_VERIFIED';
 return jsonb_build_object('verified',true);
end$$;
revoke all on function public.phone_otp_service(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.phone_otp_service(uuid,text,jsonb) to service_role;
create or replace function public.my_phone_status() returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('verified',private.verified_contact(auth.uid()) is not null,'status',case when private.verified_contact(auth.uid()) is not null then 'OTP_VERIFIED' else 'UNVERIFIED' end)$$;
revoke all on function public.my_phone_status() from public,anon,authenticated;
grant execute on function public.my_phone_status() to authenticated;
-- Replace only known source expressions in the applied RPCs; no Auth phone login is created.
do $migration$
declare routine text;definition text;
begin
 foreach routine in array array['public.release_status()','private.require_booking_access()','private.urgent_eligible(uuid)','private.planner_eligible(uuid)','public.early_expert_review_before_roster(text,jsonb)','public.consultation_command(text,jsonb)','private.match_expert_roster()'] loop
  definition:=pg_get_functiondef(routine::regprocedure);
  definition:=replace(definition,'exists(select 1 from auth.users where id=auth.uid() and phone_confirmed_at is not null)','(private.verified_contact(auth.uid()) is not null)');
  definition:=replace(definition,'exists(select 1 from auth.users where id=e.user_id and phone_confirmed_at is not null)','(private.verified_contact(e.user_id) is not null)');
  definition:=replace(definition,'u.phone_confirmed_at is not null','private.verified_contact(u.id) is not null');
  definition:=replace(definition,'select u.phone into phone from auth.users u where u.id=subject and private.verified_contact(u.id) is not null','select private.verified_contact(subject) into phone');
  definition:=replace(definition,'select phone into verified_phone from auth.users where id=auth.uid() and phone_confirmed_at is not null','select private.verified_contact(auth.uid()) into verified_phone');
  definition:=replace(definition,'coalesce(u->>''phone'','''')','coalesce(private.verified_contact(new.user_id),'''')');
  definition:=replace(definition,'u->>''phone_confirmed_at'' is not null','private.verified_contact(new.user_id) is not null');
  execute definition;
 end loop;
end$migration$;
create or replace function public.urgent_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare contact text;result jsonb;
begin
 if operation in ('request','start') then perform private.require_booking_access();end if;
 if operation='request' then
  contact:=private.verified_contact(auth.uid());if contact is null then raise exception 'phone_verification_required';end if;
  if payload->>'consent' is distinct from 'true' then raise exception 'consent_required';end if;
  payload:=payload||jsonb_build_object('phone','0'||substr(contact,4));
 end if;
 result:=public.urgent_command_before_release(operation,payload);
 if operation='request' then insert into private.consent_records(user_id,type,version,accepted,accepted_at,source) values(auth.uid(),'THIRD_PARTY_PROVISION','2026-10-05-otp-v1',true,now(),'urgent:'||coalesce(result->>'id','request'));end if;
 return result;
end$$;
-- Legacy request creation is already removed from the UI; don't leave alternate writes open.
revoke execute on function public.create_service_request(text,text,text,timestamptz),public.confirm_service_request(uuid,uuid,text,text,boolean) from public,anon,authenticated;
commit;
