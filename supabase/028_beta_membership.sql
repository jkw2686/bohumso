begin;
-- Separate beta consent from approval of the general-public policy. No auth.users mutations.
create table private.beta_invites (
 id uuid primary key default gen_random_uuid(), code_hash text not null unique,
 role text not null check(role in ('CUSTOMER','EXPERT','ADMIN_TESTER')),
 allowed_email text, allowed_phone text, max_uses integer not null check(max_uses between 1 and 100),
 used_count integer not null default 0 check(used_count>=0 and used_count<=max_uses),
 status text not null default 'ACTIVE' check(status in ('ACTIVE','USED','EXPIRED','REVOKED')),
 expires_at timestamptz not null, created_by uuid not null references auth.users,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table private.beta_members (
 user_id uuid primary key references auth.users on delete cascade, invite_id uuid not null references private.beta_invites,
 role text not null check(role in ('CUSTOMER','EXPERT','ADMIN_TESTER')), active boolean not null default true,
 phone text, phone_status text not null default 'UNVERIFIED' check(phone_status in ('UNVERIFIED','ADMIN_VERIFIED_BETA','OTP_VERIFIED')),
 phone_verified_by uuid references auth.users, phone_verified_at timestamptz,
 created_at timestamptz not null default now()
);
create table private.beta_consents (
 user_id uuid primary key references private.beta_members on delete cascade,
 terms_version text not null, privacy_version text not null, accepted_at timestamptz not null default now(),
 ip_address inet, user_agent text not null
);
create table private.beta_gateway (id boolean primary key default true check(id), secret text not null check(length(secret)>=64));
-- Provisioned separately into this private table and the Function environment, never the repository.
create table private.beta_audit(id bigint generated always as identity primary key,actor uuid,subject uuid,event text not null,created_at timestamptz not null default now());
alter table private.beta_invites enable row level security;
alter table private.beta_members enable row level security;
alter table private.beta_consents enable row level security;
alter table private.beta_gateway enable row level security;
alter table private.beta_audit enable row level security;
revoke all on private.beta_invites,private.beta_members,private.beta_consents,private.beta_gateway,private.beta_audit from public,anon,authenticated;

create function private.beta_member(subject uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.beta_members b join private.beta_consents c using(user_id) join auth.users u on u.id=b.user_id
 where b.user_id=subject and b.active and c.terms_version='2026-10-05-beta-v1' and c.privacy_version='2026-10-05-beta-v1' and u.email_confirmed_at is not null
 and (nullif(to_jsonb(u)->>'banned_until','')::timestamptz is null or (to_jsonb(u)->>'banned_until')::timestamptz<=now()))
$$;
create function private.beta_phone_verified(subject uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where id=subject and phone_confirmed_at is not null and not exists(
 select 1 from private.beta_members b join private.beta_invites i on i.id=b.invite_id where b.user_id=subject and i.allowed_phone is not null
 and i.allowed_phone is distinct from regexp_replace(regexp_replace(coalesce(u.phone,''),'[^0-9]','','g'),'^82','0'))) or
 (exists(select 1 from private.release_controls where closed_beta) and private.beta_member(subject) and exists(select 1 from private.beta_members where user_id=subject and phone_status='ADMIN_VERIFIED_BETA' and phone_verified_by is not null))
$$;
create or replace function private.is_active_member() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (exists(select 1 from auth.users u join public.member_profiles p on p.user_id=u.id join public.member_consents c on c.user_id=u.id where u.id=auth.uid() and u.email_confirmed_at is not null and c.version<>'') or (exists(select 1 from private.release_controls where closed_beta) and private.beta_member()))
$$;
create or replace function private.beta_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (private.is_admin() or private.beta_member() or exists(select 1 from private.beta_allowlist where user_id=auth.uid()) or exists(select 1 from private.release_controls where not closed_beta))
$$;
create or replace function public.release_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('policiesApproved',policies_approved,'closedBeta',closed_beta,'betaAllowed',private.beta_allowed(),'betaMember',private.beta_member(),
 'bookingAllowed',private.is_active_member() and private.beta_allowed() and private.beta_phone_verified() and (policies_approved or (closed_beta and private.beta_member())),
 'phoneEnabled',phone_enabled,'phoneVerified',private.beta_phone_verified(),'phoneStatus',case when exists(select 1 from auth.users where id=auth.uid() and phone_confirmed_at is not null) then 'OTP_VERIFIED' else coalesce((select phone_status from private.beta_members where user_id=auth.uid()),'UNVERIFIED') end) from private.release_controls
$$;
create or replace function private.require_booking_access() returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if not exists(select 1 from private.release_controls where policies_approved or (closed_beta and private.beta_member())) then raise exception 'policies_not_approved';end if;
 if not private.beta_allowed() then raise exception 'beta_invitation_required';end if;
 if not private.beta_phone_verified() then raise exception 'phone_verification_required';end if;
end $$;
create or replace function public.my_membership() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('member',private.is_active_member(),'admin',private.is_admin(),'beta',private.beta_member(),
 'state',case when auth.uid() is null then 'ANONYMOUS' when private.is_admin() then 'ADMIN' when private.beta_member() then 'BETA_MEMBER' when private.is_active_member() then 'ACTIVE_MEMBER' else 'AUTHENTICATED_INCOMPLETE' end,
 'beta_role',(select role from private.beta_members where user_id=auth.uid()),'phoneStatus',case when exists(select 1 from auth.users where id=auth.uid() and phone_confirmed_at is not null) then 'OTP_VERIFIED' else coalesce((select phone_status from private.beta_members where user_id=auth.uid()),'UNVERIFIED') end,
 'partner_status',(select status from public.partner_applications where user_id=auth.uid()),'profession',(select profession from public.partner_applications where user_id=auth.uid()))
$$;
create function public.beta_invite_check(code text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('valid',true,'role',role,'expiresAt',expires_at) from private.beta_invites where code_hash=encode(sha256(convert_to(code,'UTF8')),'hex') and length(code)=64 and status='ACTIVE' and used_count<max_uses and expires_at>now() and exists(select 1 from private.release_controls where closed_beta)),jsonb_build_object('valid',false))
$$;
create function public.beta_join(code text,terms_version text,privacy_version text,age_accepted boolean) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare invitation private.beta_invites; headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb; actor uuid:=auth.uid(); email text;
begin
 if actor is null then raise exception 'verified_account_required';end if;
 if not exists(select 1 from private.beta_gateway where secret=headers->>'x-beta-gateway') then raise exception 'trusted_gateway_required';end if;
 if not exists(select 1 from private.release_controls where closed_beta) then raise exception 'beta_closed';end if;
 select lower(u.email) into email from auth.users u where u.id=actor and u.email_confirmed_at is not null;
 if email is null then raise exception 'verified_account_required';end if;
 if age_accepted is distinct from true or terms_version is distinct from '2026-10-05-beta-v1' or privacy_version is distinct from '2026-10-05-beta-v1' then raise exception 'consent_required';end if;
 -- Serialize both same-user retries and the last available use of an invite.
 perform 1 from auth.users where id=actor for update;
 if exists(select 1 from private.beta_members where user_id=actor) then
  if not private.beta_member() then raise exception 'beta_membership_inactive';end if;
  return public.my_membership();
 end if;
 select * into invitation from private.beta_invites where code_hash=encode(sha256(convert_to(code,'UTF8')),'hex') and length(code)=64 for update;
 if invitation.id is null or invitation.status<>'ACTIVE' or invitation.expires_at<=now() or invitation.used_count>=invitation.max_uses then raise exception 'invalid_invite';end if;
 if invitation.allowed_email is not null and invitation.allowed_email<>email then raise exception 'invalid_invite';end if;
 -- Phone restriction is a pre-approved known tester, not a claim supplied by the joining client.
 insert into public.member_profiles(user_id) values(actor) on conflict do nothing;
 insert into private.beta_members(user_id,invite_id,role,phone,phone_status,phone_verified_by,phone_verified_at)
 values(actor,invitation.id,invitation.role,invitation.allowed_phone,'UNVERIFIED',null,null);
 insert into private.beta_consents(user_id,terms_version,privacy_version,ip_address,user_agent)
 values(actor,terms_version,privacy_version,nullif(headers->>'x-beta-ip','')::inet,left(coalesce(headers->>'x-beta-user-agent',''),512));
 update private.beta_invites set used_count=used_count+1,status=case when used_count+1=max_uses then 'USED' else 'ACTIVE' end,updated_at=now() where id=invitation.id;
 insert into private.beta_audit(actor,subject,event) values(actor,actor,'JOINED');
 return public.my_membership();
end $$;
create function public.beta_admin(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare code text; target uuid; role text; email text; phone text; expire timestamptz; uses integer; result jsonb;
begin
 if not private.is_admin() then raise exception 'admin_required';end if;
 if operation='create' then
  role:=payload->>'role';email:=nullif(lower(trim(payload->>'email')),'');phone:=nullif(regexp_replace(payload->>'phone','[^0-9]','','g'),'');expire:=(payload->>'expiresAt')::timestamptz;uses:=(payload->>'maxUses')::integer;
  if role is null or role not in ('CUSTOMER','EXPERT','ADMIN_TESTER') or expire is null or expire<=now() or expire>now()+interval '90 days' or uses is null or uses not between 1 and 100 or (email is not null and (length(email)>254 or email!~'^[^ @]+@[^ @]+\.[^ @]+$')) or (phone is not null and phone!~'^010[0-9]{8}$') then raise exception 'invalid_invite_settings';end if;
  -- Phone restricted invites also bind an email. Possession of a leaked link cannot claim that phone.
  if phone is not null and email is null then raise exception 'phone_requires_email';end if;
  code:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into private.beta_invites(code_hash,role,allowed_email,allowed_phone,max_uses,expires_at,created_by)
  values(encode(sha256(convert_to(code,'UTF8')),'hex'),role,email,phone,uses,expire,auth.uid()) returning id into target;
  insert into private.beta_audit(actor,subject,event) values(auth.uid(),null,'INVITE_CREATED');
  return jsonb_build_object('id',target,'code',code);
 elsif operation='revoke' then
  update private.beta_invites set status='REVOKED',updated_at=now() where id=(payload->>'id')::uuid;
  return jsonb_build_object('saved',found);
 elsif operation='verify_phone' then
  target:=(payload->>'userId')::uuid;phone:=regexp_replace(payload->>'phone','[^0-9]','','g');
  if payload->>'checked' is distinct from 'true' or phone is null or phone!~'^010[0-9]{8}$' or not exists(select 1 from private.release_controls where closed_beta) then raise exception 'phone_confirmation_required';end if;
  if not exists(select 1 from private.beta_members m join private.beta_invites i on i.id=m.invite_id where m.user_id=target and m.active and (i.allowed_phone is null or i.allowed_phone=phone)) then raise exception 'invalid_phone';end if;
  update private.beta_members set phone=phone,phone_status='ADMIN_VERIFIED_BETA',phone_verified_by=auth.uid(),phone_verified_at=now() where user_id=target;
  update private.planner_directory set phone=phone where user_id=target;
  insert into private.beta_audit(actor,subject,event) values(auth.uid(),target,'PHONE_ADMIN_VERIFIED');
  return jsonb_build_object('saved',true);
 elsif operation='suspend' then
  update private.beta_members set active=false where user_id=(payload->>'userId')::uuid;
  insert into private.beta_audit(actor,subject,event) values(auth.uid(),(payload->>'userId')::uuid,'SUSPENDED');
  return jsonb_build_object('saved',true);
 elsif operation='dashboard' then
  return jsonb_build_object('invites',(select coalesce(jsonb_agg((to_jsonb(i)-'code_hash')||jsonb_build_object('status',case when status='ACTIVE' and expires_at<=now() then 'EXPIRED' else status end) order by created_at desc),'[]') from private.beta_invites i),
  'members',(select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('email',u.email) order by b.created_at desc),'[]') from private.beta_members b join auth.users u on u.id=b.user_id),
  'bookings',(select coalesce(jsonb_object_agg(state,n),'{}') from (select c.state,count(*) n from private.consultations c where coalesce((to_jsonb(c)->>'is_beta')::boolean,false) group by c.state) q),
  'issued',(select count(*) from private.beta_invites),'used',(select coalesce(sum(used_count),0) from private.beta_invites),'joined',(select count(*) from private.beta_members),
  'customers',(select count(*) from private.beta_members where role='CUSTOMER'),'experts',(select count(*) from private.beta_members where role='EXPERT'),
  'errors',(select count(*) from private.beta_audit where event='JOIN_ERROR' and created_at>now()-interval '7 days'));
 else raise exception 'invalid_operation';end if;
end $$;
create function public.beta_report_error() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from private.beta_gateway where secret=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-beta-gateway') then raise exception 'trusted_gateway_required';end if;
 if (select count(*) from private.beta_audit where actor=auth.uid() and event='JOIN_ERROR' and created_at>now()-interval '1 hour')<20 then insert into private.beta_audit(actor,subject,event) values(auth.uid(),auth.uid(),'JOIN_ERROR');end if;
end $$;
revoke all on function public.beta_report_error() from public,anon,authenticated;
grant execute on function public.beta_report_error() to authenticated;
revoke all on function private.beta_member(uuid),private.beta_phone_verified(uuid),public.beta_invite_check(text),public.beta_join(text,text,text,boolean),public.beta_admin(text,jsonb) from public,anon,authenticated;
grant execute on function public.beta_invite_check(text) to anon,authenticated;
grant execute on function public.beta_join(text,text,text,boolean),public.beta_admin(text,jsonb) to authenticated;
commit;
