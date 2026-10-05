-- Apply after the production 027 baseline. Does not depend on optional beta migrations.
begin;
create table private.service_features (
 id boolean primary key default true check(id), stage text not null default 'EARLY_ACCESS',
 public_signup boolean not null default true, customer_signup boolean not null default true,
 expert_applications boolean not null default true, invite_only boolean not null default false,
 expert_auto_publish boolean not null default false check(not expert_auto_publish)
);
insert into private.service_features(id) values(true);
create table private.account_lifecycle(user_id uuid primary key references auth.users(id),status text not null default 'ACTIVE' check(status in ('ACTIVE','WITHDRAWN','SUSPENDED')),changed_at timestamptz not null default now());
create table private.consent_records (
 id bigint generated always as identity primary key,user_id uuid not null references auth.users(id),
 type text not null check(type in ('TERMS','PRIVACY_COLLECTION','THIRD_PARTY_PROVISION','SENSITIVE_INFORMATION','LOCATION','EXPERT_TERMS','EXPERT_DOCUMENT','MARKETING')),
 version text not null,accepted boolean not null,accepted_at timestamptz,withdrawn_at timestamptz,
 ip_address inet,user_agent text,source text not null,recorded_at timestamptz not null default now(),
 check((accepted and accepted_at is not null and withdrawn_at is null) or (not accepted and accepted_at is null))
);
-- Clients cannot claim a trusted IP or alter historical acceptance records.
create function private.immutable_consent() returns trigger language plpgsql set search_path='' as $$begin raise exception 'append_only_consent';end$$;
create trigger consent_append_only before update or delete on private.consent_records for each row execute function private.immutable_consent();
create table private.member_rights_requests(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),kind text not null check(kind in ('ACCESS','CORRECT','DELETE','WITHDRAW','INQUIRY','REPORT')),detail text not null default '' check(length(detail)<=2000),status text not null default 'RECEIVED',created_at timestamptz not null default now());
alter table private.service_features enable row level security;
alter table private.account_lifecycle enable row level security;
alter table private.consent_records enable row level security;
alter table private.member_rights_requests enable row level security;
revoke all on private.service_features,private.account_lifecycle,private.consent_records,private.member_rights_requests from public,anon,authenticated;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from private.admin_memberships where user_id=auth.uid()) and not exists(select 1 from private.account_lifecycle where user_id=auth.uid() and status<>'ACTIVE')$$;
create or replace function private.is_active_member() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.users u join public.member_profiles p on p.user_id=u.id join public.member_consents c on c.user_id=u.id where u.id=auth.uid() and u.email_confirmed_at is not null and c.version<>'') and not exists(select 1 from private.account_lifecycle where user_id=auth.uid() and status<>'ACTIVE')
$$;
create or replace function private.beta_allowed() returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and (private.is_admin() or exists(select 1 from private.service_features where not invite_only) or exists(select 1 from private.beta_allowlist where user_id=auth.uid()))$$;
create or replace function public.complete_membership(terms_accepted boolean,privacy_accepted boolean,age_accepted boolean,marketing_accepted boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare subject uuid:=auth.uid();
begin
 if subject is null or not exists(select 1 from auth.users where id=subject and email_confirmed_at is not null) then raise exception 'verified_account_required';end if;
 perform pg_advisory_xact_lock(hashtextextended(subject::text,30));
 if exists(select 1 from private.account_lifecycle where user_id=subject and status<>'ACTIVE') then raise exception 'account_inactive';end if;
 if private.is_active_member() then return public.my_membership();end if;
 if not exists(select 1 from private.service_features where public_signup and customer_signup) then raise exception 'signup_disabled';end if;
 if not private.beta_allowed() then raise exception 'beta_invitation_required';end if;
 if terms_accepted is distinct from true or privacy_accepted is distinct from true or age_accepted is distinct from true then raise exception 'consent_required';end if;
 insert into public.member_profiles(user_id) values(subject) on conflict do nothing;
 insert into public.member_consents(user_id,version,marketing) values(subject,'2026-10-05-early-access-v1',coalesce(marketing_accepted,false)) on conflict do nothing;
 insert into private.account_lifecycle(user_id) values(subject) on conflict do nothing;
 insert into private.consent_records(user_id,type,version,accepted,accepted_at,source) select subject,t,'2026-10-05-early-access-v1',true,now(),'public_signup' from unnest(array['TERMS','PRIVACY_COLLECTION']) t;
 insert into private.consent_records(user_id,type,version,accepted,accepted_at,source) values(subject,'MARKETING','2026-10-05-early-access-v1',coalesce(marketing_accepted,false),case when marketing_accepted then now() end,'public_signup');
 return public.my_membership();
end$$;
create or replace function public.release_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('serviceStage',f.stage,'signupEnabled',f.public_signup and f.customer_signup,'expertApplicationsEnabled',f.expert_applications,'policiesApproved',r.policies_approved,'closedBeta',f.invite_only,'betaAllowed',private.beta_allowed(),'phoneEnabled',r.phone_enabled,'phoneVerified',exists(select 1 from auth.users where id=auth.uid() and phone_confirmed_at is not null)) from private.release_controls r cross join private.service_features f
$$;
create function public.member_rights(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare subject uuid:=auth.uid(); rid uuid;
begin
 if subject is null then raise exception 'verified_account_required';end if;
 if operation='list' then return jsonb_build_object('requests',(select coalesce(jsonb_agg(to_jsonb(r) order by created_at desc),'[]') from private.member_rights_requests r where user_id=subject),'consents',(select coalesce(jsonb_agg(to_jsonb(c) order by recorded_at desc),'[]') from private.consent_records c where user_id=subject));end if;
 if operation not in ('ACCESS','CORRECT','DELETE','WITHDRAW','INQUIRY','REPORT') then raise exception 'invalid_operation';end if;
 if operation='WITHDRAW' and payload->>'confirmed' is distinct from 'true' then raise exception 'confirmation_required';end if;
 if (select count(*) from private.member_rights_requests where user_id=subject and created_at>now()-interval '1 hour')>=5 then raise exception 'request_limit';end if;
 insert into private.member_rights_requests(user_id,kind,detail) values(subject,operation,left(coalesce(payload->>'detail',''),2000)) returning id into rid;
 if operation='WITHDRAW' then
 insert into private.account_lifecycle(user_id,status) values(subject,'WITHDRAWN') on conflict(user_id) do update set status='WITHDRAWN',changed_at=now();
 insert into private.consent_records(user_id,type,version,accepted,withdrawn_at,source) values(subject,'MARKETING','2026-10-05-early-access-v1',false,now(),'account_withdrawal');
 end if;
 return jsonb_build_object('id',rid,'status','RECEIVED');
end$$;
revoke all on function private.immutable_consent(),public.member_rights(text,jsonb) from public,anon,authenticated;
grant execute on function public.member_rights(text,jsonb) to authenticated;
commit;
