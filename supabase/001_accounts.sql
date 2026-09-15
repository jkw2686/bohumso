begin;
create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
create table private.admin_memberships(user_id uuid primary key references auth.users(id) on delete cascade);
create table public.member_profiles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table public.member_consents(
 user_id uuid primary key references auth.users(id) on delete cascade,
 version text not null, marketing boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.partner_applications(
 user_id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null check(char_length(full_name) between 2 and 60),
 profession text not null check(profession in ('planner','adjuster','lawyer','corporate','tax','office')),
 organization text not null check(char_length(organization) between 2 and 120),
 region text not null check(char_length(region) between 2 and 120),
 credential_reference text not null check(char_length(credential_reference) between 2 and 120),
 status text not null default 'pending' check(status in ('pending','approved','rejected','suspended')),
 review_note text not null default '',
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create table private.partner_audit(
 id bigint generated always as identity primary key,actor uuid,subject uuid,
 action text not null,reason text not null,created_at timestamptz not null default now()
);
revoke all on private.admin_memberships,private.partner_audit from public,anon,authenticated;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.admin_memberships where user_id=auth.uid())
$$;
revoke all on function private.is_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

alter table public.member_profiles enable row level security;
alter table public.member_consents enable row level security;
alter table public.partner_applications enable row level security;
revoke all on public.member_profiles,public.member_consents,public.partner_applications from anon,authenticated;
grant select on public.member_profiles,public.member_consents,public.partner_applications to authenticated;
create policy self_profile on public.member_profiles for select to authenticated using(user_id=auth.uid());
create policy self_consent on public.member_consents for select to authenticated using(user_id=auth.uid());
create policy application_visibility on public.partner_applications for select to authenticated using(user_id=auth.uid() or private.is_admin());

create or replace function public.my_membership() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('member',exists(select 1 from public.member_profiles where user_id=auth.uid()),
 'admin',private.is_admin(),
 'partner_status',(select status from public.partner_applications where user_id=auth.uid()),
 'profession',(select profession from public.partner_applications where user_id=auth.uid()))
$$;

create or replace function public.complete_membership(terms_accepted boolean,privacy_accepted boolean,age_accepted boolean,marketing_accepted boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'verified_account_required'; end if;
 if terms_accepted is distinct from true or privacy_accepted is distinct from true or age_accepted is distinct from true then raise exception 'consent_required';end if;
 insert into public.member_profiles(user_id) values(auth.uid()) on conflict do nothing;
 insert into public.member_consents(user_id,version,marketing) values(auth.uid(),'2026-09-14-v1',coalesce(marketing_accepted,false)) on conflict do nothing;
end;
$$;

create or replace function public.apply_partner(full_name text,profession text,organization text,region text,credential_reference text,verification_consent boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.member_profiles where user_id=auth.uid()) then raise exception 'membership_required';end if;
 if verification_consent is distinct from true then raise exception 'verification_consent_required';end if;
 insert into public.partner_applications(user_id,full_name,profession,organization,region,credential_reference)
 values(auth.uid(),trim(full_name),profession,trim(organization),trim(region),trim(credential_reference));
 insert into private.partner_audit(actor,subject,action,reason) values(auth.uid(),auth.uid(),'submitted','qualification_verification_consent:2026-09-14-v1');
end;
$$;

create or replace function public.review_partner(target_user uuid,decision text,reason text)
returns void language plpgsql security definer set search_path='' as $$
declare previous text;
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'admin_required';end if;
 if target_user=auth.uid() then raise exception 'self_review_forbidden';end if;
 if decision not in ('approved','rejected','suspended') or decision is null or char_length(trim(reason)) not between 3 and 1000 then raise exception 'invalid_review';end if;
 select status into previous from public.partner_applications where user_id=target_user for update;
 if previous is null then raise exception 'application_not_found';end if;
 if not ((previous='pending' and decision in ('approved','rejected')) or (previous='approved' and decision='suspended') or (previous='suspended' and decision='approved')) then raise exception 'invalid_transition';end if;
 update public.partner_applications set status=decision,review_note=trim(reason),reviewed_by=auth.uid(),reviewed_at=now() where user_id=target_user;
 insert into private.partner_audit(actor,subject,action,reason) values(auth.uid(),target_user,decision,trim(reason));
end;
$$;
revoke all on function public.my_membership(),public.complete_membership(boolean,boolean,boolean,boolean),public.apply_partner(text,text,text,text,text,boolean),public.review_partner(uuid,text,text) from public;
grant execute on function public.my_membership(),public.complete_membership(boolean,boolean,boolean,boolean),public.apply_partner(text,text,text,text,text,boolean),public.review_partner(uuid,text,text) to authenticated;
commit;
