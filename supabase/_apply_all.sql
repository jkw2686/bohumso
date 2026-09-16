-- 보험소 통합 마이그레이션 (Supabase SQL Editor 붙여넣기용)
-- 자동 생성: supabase/00{1..6}_*.sql 를 순서대로 결합. 원본을 직접 수정하고 재생성할 것.
-- 각 마이그레이션은 독립 begin;...commit; 트랜잭션이다. 이미 적용된 프로젝트에는 중복 실행 금지.

-- ===================== 001_accounts.sql =====================
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


-- ===================== 002_requests.sql =====================
begin;
create table private.service_requests (
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id),
 kind text not null check(kind in ('consult','visit')),
 profession text not null check(profession in ('planner','adjuster','lawyer','corporate','tax','office')),
 region text not null check(char_length(region) between 2 and 120),
 requested_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','assigned','confirmed','completed','cancelled')),
 partner_id uuid references public.partner_applications(user_id),
 meeting_address text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(customer_id is distinct from partner_id)
);
create unique index one_partner_slot on private.service_requests(partner_id,requested_at) where status='confirmed';
create index request_customer on private.service_requests(customer_id,created_at desc);
create index request_partner on private.service_requests(partner_id,created_at desc);
create table private.request_contacts (
 request_id uuid primary key references private.service_requests(id) on delete cascade,
 full_name text not null check(char_length(full_name) between 2 and 60),
 phone text not null check(phone ~ '^0[0-9]{8,10}$'),
 consent_version text not null, consented_at timestamptz not null default now(), recipient_id uuid not null
);
create table private.request_audit (
 id bigint generated always as identity primary key, request_id uuid not null,
 actor uuid not null, action text not null, created_at timestamptz not null default now()
);
revoke all on private.service_requests,private.request_contacts,private.request_audit from public,anon,authenticated;

create function public.create_service_request(request_kind text,requested_profession text,request_region text,preferred_at timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not exists(select 1 from public.member_profiles where user_id=auth.uid()) then raise exception 'membership_required';end if;
 if preferred_at is null or preferred_at < now()+interval '30 minutes' or preferred_at > now()+interval '90 days' or mod(extract(epoch from preferred_at)::numeric,1800)<>0 then raise exception 'invalid_slot';end if;
 if request_kind='visit' and requested_profession is distinct from 'office' then raise exception 'invalid_profession';end if;
 perform 1 from public.member_profiles where user_id=auth.uid() for update;
 if (select count(*) from private.service_requests where customer_id=auth.uid() and status in ('pending','assigned','confirmed'))>=5 then raise exception 'request_limit';end if;
 insert into private.service_requests(customer_id,kind,profession,region,requested_at)
 values(auth.uid(),request_kind,requested_profession,trim(request_region),preferred_at) returning id into result;
 insert into private.request_audit(request_id,actor,action) values(result,auth.uid(),'created');
 return result;
end $$;

create function public.assign_service_request(request_id uuid,target_partner uuid,visit_address text default '')
returns void language plpgsql security definer set search_path='' as $$
declare r private.service_requests; p public.partner_applications;
begin
 if not private.is_admin() then raise exception 'admin_required';end if;
 select * into r from private.service_requests where id=request_id for update;
 if r.id is null or r.status not in ('pending','assigned') then raise exception 'invalid_transition';end if;
 select * into p from public.partner_applications where user_id=target_partner for update;
 if p.user_id is null or p.status<>'approved' or p.profession<>r.profession or target_partner=r.customer_id then raise exception 'invalid_partner';end if;
 if r.requested_at<=now() then raise exception 'invalid_slot';end if;
 if r.kind='visit' and (visit_address is null or char_length(trim(visit_address)) not between 5 and 300) then raise exception 'address_required';end if;
 update private.service_requests set partner_id=target_partner,status='assigned',meeting_address=case when kind='visit' then trim(visit_address) else '' end,updated_at=now() where id=request_id;
 insert into private.request_audit(request_id,actor,action) values(request_id,auth.uid(),'assigned');
end $$;

create function public.confirm_service_request(request_id uuid,expected_partner uuid,contact_name text,contact_phone text,share_consent boolean)
returns void language plpgsql security definer set search_path='' as $$
declare r private.service_requests;
begin
 select * into r from private.service_requests where id=request_id for update;
 if r.id is null or r.customer_id is distinct from auth.uid() then raise exception 'request_forbidden';end if;
 if r.status<>'assigned' or r.partner_id is distinct from expected_partner then raise exception 'invalid_transition';end if;
 if share_consent is distinct from true then raise exception 'consent_required';end if;
 if r.requested_at<=now() then raise exception 'invalid_slot';end if;
 perform 1 from public.partner_applications where user_id=r.partner_id and status='approved' for update;
 if not found then raise exception 'invalid_partner';end if;
 insert into private.request_contacts(request_id,full_name,phone,consent_version,recipient_id)
 values(request_id,trim(contact_name),regexp_replace(contact_phone,'[- ]','','g'),'2026-09-15-v1',r.partner_id);
 update private.service_requests set status='confirmed',updated_at=now() where id=request_id;
 insert into private.request_audit(request_id,actor,action) values(request_id,auth.uid(),'confirmed_with_contact_consent');
end $$;

create function public.change_service_request(request_id uuid,decision text)
returns void language plpgsql security definer set search_path='' as $$
declare r private.service_requests;
begin
 select * into r from private.service_requests where id=request_id for update;
 if r.id is null then raise exception 'request_forbidden';end if;
 if decision='cancelled' then
  if r.customer_id is distinct from auth.uid() and not private.is_admin() then raise exception 'request_forbidden';end if;
  if r.status not in ('pending','assigned','confirmed') then raise exception 'invalid_transition';end if;
 elsif decision='completed' then
  if r.partner_id is distinct from auth.uid() or not exists(select 1 from public.partner_applications ap where ap.user_id=auth.uid() and ap.status='approved') then raise exception 'request_forbidden';end if;
  if r.status<>'confirmed' or r.requested_at>now() then raise exception 'invalid_transition';end if;
 else raise exception 'invalid_transition';end if;
 update private.service_requests set status=decision,updated_at=now() where id=request_id;
 insert into private.request_audit(request_id,actor,action) values(request_id,auth.uid(),decision);
end $$;

create function public.list_service_requests(workspace text)
returns table(id uuid,kind text,profession text,region text,requested_at timestamptz,status text,partner_id uuid,partner_name text,organization text,partner_status text,meeting_address text,contact_name text,contact_phone text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or workspace is null or workspace not in ('customer','partner','admin') then raise exception 'request_forbidden';end if;
 if workspace='admin' and not private.is_admin() then raise exception 'admin_required';end if;
 if workspace='partner' and not exists(select 1 from public.partner_applications ap where ap.user_id=auth.uid() and ap.status='approved') then raise exception 'invalid_partner';end if;
 return query select r.id,r.kind,r.profession,r.region,r.requested_at,r.status,r.partner_id,p.full_name,p.organization,p.status,r.meeting_address,
 case when workspace<>'partner' or r.status='confirmed' then c.full_name end,
 case when workspace<>'partner' or r.status='confirmed' then c.phone end,r.created_at
 from private.service_requests r left join public.partner_applications p on p.user_id=r.partner_id left join private.request_contacts c on c.request_id=r.id
 where (workspace='admin' or (workspace='customer' and r.customer_id=auth.uid()) or (workspace='partner' and r.partner_id=auth.uid()))
 order by r.created_at desc limit 100;
end $$;

create function public.list_assignable_partners()
returns table(user_id uuid,full_name text,profession text,organization text,region text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'admin_required';end if;
 return query select p.user_id,p.full_name,p.profession,p.organization,p.region from public.partner_applications p where p.status='approved' order by p.full_name;
end $$;
revoke all on function public.create_service_request(text,text,text,timestamptz),public.assign_service_request(uuid,uuid,text),public.confirm_service_request(uuid,uuid,text,text,boolean),public.change_service_request(uuid,text),public.list_service_requests(text),public.list_assignable_partners() from public,anon;
grant execute on function public.create_service_request(text,text,text,timestamptz),public.assign_service_request(uuid,uuid,text),public.confirm_service_request(uuid,uuid,text,text,boolean),public.change_service_request(uuid,text),public.list_service_requests(text),public.list_assignable_partners() to authenticated;
commit;



-- ===================== 003_consultations.sql =====================
begin;
-- Additive schema: previous service_requests and their audit records remain intact.
create table private.connection_policies (
 id bigint generated always as identity primary key, free_meetings integer not null check(free_meetings between 0 and 20),
 total_won integer not null check(total_won>0 and total_won%2=0), created_by uuid,
 reason text not null, created_at timestamptz not null default now()
);
insert into private.connection_policies(free_meetings,total_won,reason) values(2,70000,'Initial test policy; VAT included; no automatic charging');
create table private.planner_directory (
 user_id uuid primary key references public.partner_applications(user_id), specialties text[] not null default '{}',
 biography text not null default '' check(length(biography)<=1000), experience integer not null default 0 check(experience between 0 and 70),
 photo_url text not null default '' check(photo_url='' or photo_url ~ '^https://'), available boolean not null default false,
 hours text not null default '' check(length(hours)<=200), latitude double precision check(latitude between -90 and 90), longitude double precision check(longitude between -180 and 180),
 phone text not null default '' check(phone='' or phone ~ '^0[0-9]{8,10}$'),
 identity_key text unique, verified_by uuid, verified_at timestamptz, evidence text, is_sample boolean not null default true
);
create table private.consultations (
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id), planner_id uuid references private.planner_directory(user_id),
 purpose text not null check(purpose in ('claim','management','coverage','new','other')),
 region text not null check(length(region) between 2 and 120), method text not null check(method in ('phone','nearby','scheduled')),
 preferred_at timestamptz not null, latitude double precision, longitude double precision,
 location_consent boolean not null default false, automatic boolean not null default false, excluded uuid[] not null default '{}',
 state text not null default 'requested' check(state in ('requested','coordinating','confirmed','scheduled','awaiting_completion','completed','cancelled','no_show','dispute','unmatched')),
 customer_ok boolean not null default false, planner_ok boolean not null default false, revision integer not null default 1,
 policy_id bigint references private.connection_policies(id), total_won integer, is_free boolean, coupon_state text check(coupon_state in ('reserved','used','released')),
 paid_consent boolean not null default false, payment_state text not null default 'unpaid' check(payment_state in ('free','unpaid','confirming','first_paid','balance_due','paid','failed','refund_requested','refunding','refunded','refund_failed')),
 first_paid boolean not null default false, second_paid boolean not null default false, completion_requested_at timestamptz, completed_at timestamptz,
 response_deadline timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(customer_id is distinct from planner_id), check((latitude is null and longitude is null) or (location_consent and latitude between -90 and 90 and longitude between -180 and 180))
);
create unique index consultation_slot on private.consultations(planner_id,preferred_at) where state in ('confirmed','scheduled','awaiting_completion');
create index consultation_customer on private.consultations(customer_id,created_at desc);
create index consultation_planner on private.consultations(planner_id,created_at desc);
create table private.consultation_contacts (
 consultation_id uuid primary key references private.consultations(id), customer_name text not null check(length(customer_name) between 2 and 60),
 phone text not null check(phone ~ '^0[0-9]{8,10}$'), recipient uuid not null, version text not null, consented_at timestamptz not null default now()
);
create table private.followup_meetings (
 id uuid primary key default gen_random_uuid(), consultation_id uuid not null references private.consultations(id), planner_id uuid not null,
 proposed_by uuid not null, preferred_at timestamptz not null, state text not null default 'proposed' check(state in ('proposed','confirmed','cancelled')), created_at timestamptz not null default now()
);
create unique index followup_slot on private.followup_meetings(planner_id,preferred_at) where state='confirmed';
revoke all on private.followup_meetings from public,anon,authenticated;
create table private.consultation_reviews (
 consultation_id uuid primary key references private.consultations(id), planner_id uuid not null, rating integer not null check(rating between 1 and 5),
 body text not null check(length(body) between 2 and 500), consent_version text not null, visible boolean not null default false,
 reviewed_by uuid, review_reason text, created_at timestamptz not null default now()
);
revoke all on private.consultation_reviews from public,anon,authenticated;
create table private.consultation_events (
 id bigint generated always as identity primary key, consultation_id uuid references private.consultations(id), actor uuid,
 event text not null, reason text not null default '', metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table private.consultation_issues (
 id uuid primary key default gen_random_uuid(), consultation_id uuid not null references private.consultations(id), actor uuid not null,
 category text not null check(category in ('question','no_show','dispute','refund')), reason text not null check(length(reason) between 3 and 1000),
 resolved boolean not null default false, resolution text, resolved_by uuid, resolved_at timestamptz, created_at timestamptz not null default now()
);
create table private.consultation_orders (
 id text primary key, consultation_id uuid not null references private.consultations(id), stage integer not null check(stage in (1,2)),
 amount integer not null check(amount>0), state text not null default 'unpaid' check(state in ('unpaid','confirming','paid','failed','refund_requested','refunding','refunded','refund_failed')),
 payment_key text unique, receipt_url text, refunded_won integer not null default 0, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(consultation_id,stage)
);
create table private.payment_attempts (
 id uuid primary key default gen_random_uuid(), order_id text not null references private.consultation_orders(id),
 action text not null, outcome text not null, transaction_key text, created_at timestamptz not null default now()
);
revoke all on private.connection_policies,private.planner_directory,private.consultations,private.consultation_contacts,private.consultation_events,private.consultation_issues,private.consultation_orders,private.payment_attempts from public,anon,authenticated;

create function private.planner_eligible(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.planner_directory d join public.partner_applications p on p.user_id=d.user_id where d.user_id=target and d.verified_at is not null and p.status='approved' and p.profession='planner')
$$;
create function private.free_remaining(target uuid,policy bigint) returns integer language sql stable security definer set search_path='' as $$
 select greatest(0,(select free_meetings from private.connection_policies where id=policy)-(select count(*)::integer from private.consultations where planner_id=target and coupon_state in ('reserved','used')))
$$;
create function private.specialty_match(wanted text,tags text[]) returns boolean language sql immutable set search_path='' as $$
 select wanted=any(tags) or (wanted='claim' and tags&&array['death','illness','medical','accident']) or (wanted='coverage' and tags&&array['remodel','life','nonlife','medical']) or (wanted='management' and tags&&array['life','nonlife','remodel']) or (wanted='new' and tags&&array['life','nonlife','corporate'])
$$;
revoke all on function private.specialty_match(text,text[]) from public,anon,authenticated;
-- Standalone deterministic matching module. No consumer medical details enter the score.
create function private.rank_planners(wanted text,area text,slot timestamptz,lat double precision,lng double precision)
returns table(planner_id uuid,score double precision) language sql stable security definer set search_path='' as $$
 select d.user_id,
 (case when private.specialty_match(wanted,d.specialties) then 40 else 0 end + case when p.region=area then 30 else 0 end
 + case when d.available then 10 else 0 end
 - least(20,(select count(*) from private.consultations c where c.planner_id=d.user_id and c.created_at>now()-interval '7 days')*2)
 + coalesce((select 10.0*count(*) filter(where c.state='completed')/nullif(count(*) filter(where c.planner_ok),0) from private.consultations c where c.planner_id=d.user_id),0)
 + coalesce((select 5.0*count(*) filter(where c.planner_ok)/nullif(count(*),0) from private.consultations c where c.planner_id=d.user_id),0)
 - case when lat is not null and lng is not null and d.latitude is not null and d.longitude is not null then least(30,sqrt(power((lat-d.latitude)*111,2)+power((lng-d.longitude)*88,2))) else 0 end)::double precision
 from private.planner_directory d join public.partner_applications p on p.user_id=d.user_id
 where private.planner_eligible(d.user_id) and d.available and (p.region=area or p.region like split_part(area,' ',1)||'%')
 and not exists(select 1 from private.consultations c where c.planner_id=d.user_id and c.preferred_at=slot and c.state in ('confirmed','scheduled','awaiting_completion'))
 and not exists(select 1 from private.consultations c where c.planner_id=d.user_id and c.state='completed' and c.is_free=false and c.first_paid and not c.second_paid and c.payment_state not in ('refund_requested','refunding','refunded','refund_failed'))
 order by 2 desc,d.user_id
$$;
create function private.offer_next(target uuid) returns void language plpgsql security definer set search_path='' as $$
declare c private.consultations; candidate uuid;
begin
 select * into c from private.consultations where id=target for update;
 if c.state not in ('requested','unmatched') then return;end if;
 select r.planner_id into candidate from private.rank_planners(c.purpose,c.region,c.preferred_at,c.latitude,c.longitude) r where r.planner_id<>c.customer_id and not(r.planner_id=any(c.excluded)) limit 1;
 update private.consultations set planner_id=candidate,state=case when candidate is null then 'unmatched' else 'requested' end,response_deadline=case when candidate is null then null else now()+interval '24 hours' end,updated_at=now() where id=target;
 insert into private.consultation_events(consultation_id,actor,event,metadata) values(target,auth.uid(),case when candidate is null then 'matching_failed' else 'offered' end,jsonb_build_object('planner',candidate));
end $$;

create function public.planner_catalog(area text default '',wanted text default '') returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('policy',(select jsonb_build_object('id',id,'free_meetings',free_meetings,'total_won',total_won) from private.connection_policies order by id desc limit 1),'planners',coalesce((
 select jsonb_agg(jsonb_build_object('id',d.user_id,'name',p.full_name,'organization',p.organization,'region',p.region,'specialties',d.specialties,'biography',d.biography,'experience',d.experience,'photo_url',d.photo_url,'available',d.available,'hours',d.hours,'latitude',d.latitude,'longitude',d.longitude,'is_sample',d.is_sample,'verified',d.verified_at is not null,'completed_count',(select count(*) from private.consultations c where c.planner_id=d.user_id and c.state='completed'),'rating',(select round(avg(r.rating),1) from private.consultation_reviews r where r.planner_id=d.user_id and r.visible),'reviews',(select coalesce(jsonb_agg(jsonb_build_object('rating',r.rating,'body',r.body,'created_at',r.created_at)),'[]') from private.consultation_reviews r where r.planner_id=d.user_id and r.visible)) order by p.full_name)
 from private.planner_directory d join public.partner_applications p on p.user_id=d.user_id where private.planner_eligible(d.user_id) and (area='' or p.region like area||'%') and (wanted='' or private.specialty_match(wanted,d.specialties))),'[]'::jsonb))
$$;

create function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare c private.consultations; id uuid; target uuid; pol private.connection_policies; n integer; proposed timestamptz; is_customer boolean; is_planner boolean; admin boolean; ev text;
begin
 if auth.uid() is null or not exists(select 1 from public.member_profiles where user_id=auth.uid()) then raise exception 'membership_required';end if;
 admin:=private.is_admin();
 if operation='profile' then
  if not exists(select 1 from public.partner_applications where user_id=auth.uid() and profession='planner') then raise exception 'planner_required';end if;
  insert into private.planner_directory(user_id) values(auth.uid()) on conflict do nothing;
  update private.planner_directory set specialties=array(select jsonb_array_elements_text(payload->'specialties')),biography=coalesce(payload->>'biography',''),experience=coalesce((payload->>'experience')::integer,0),photo_url=coalesce(payload->>'photo_url',''),hours=coalesce(payload->>'hours',''),phone=regexp_replace(coalesce(payload->>'phone',''),'[- ]','','g'),available=coalesce((payload->>'available')::boolean,false),latitude=(payload->>'latitude')::double precision,longitude=(payload->>'longitude')::double precision where user_id=auth.uid();
  return jsonb_build_object('saved',true);
 elsif operation='verify_planner' then
  if not admin or (payload->>'checked')::boolean is distinct from true or coalesce(length(trim(payload->>'evidence')),0)<5 or coalesce(length(trim(payload->>'identity_key')),0)<5 then raise exception 'verification_required';end if;
  target:=(payload->>'planner_id')::uuid;
  if target=auth.uid() or not exists(select 1 from public.partner_applications where user_id=target and status='approved' and profession='planner') then raise exception 'invalid_partner';end if;
  update private.planner_directory set identity_key=regexp_replace(lower(payload->>'identity_key'),'[^a-z0-9가-힣]','','g'),verified_by=auth.uid(),verified_at=now(),evidence=payload->>'evidence',is_sample=coalesce((payload->>'is_sample')::boolean,true) where user_id=target;
  if not found then raise exception 'profile_required';end if;
  insert into private.consultation_events(actor,event,reason,metadata) values(auth.uid(),'planner_verified',payload->>'evidence',jsonb_build_object('planner',target,'sample',coalesce((payload->>'is_sample')::boolean,true)));
  return jsonb_build_object('saved',true);
 elsif operation='policy' then
  if not admin or coalesce(length(trim(payload->>'reason')),0)<3 then raise exception 'admin_required';end if;
  insert into private.connection_policies(free_meetings,total_won,created_by,reason) values((payload->>'free_meetings')::integer,(payload->>'total_won')::integer,auth.uid(),payload->>'reason');
  return jsonb_build_object('saved',true);
 elsif operation='request' then
  proposed:=(payload->>'preferred_at')::timestamptz;
  if proposed is null or proposed<now()+interval '30 minutes' or proposed>now()+interval '90 days' or mod(extract(epoch from proposed),1800)<>0 then raise exception 'invalid_slot';end if;
  perform 1 from public.member_profiles where user_id=auth.uid() for update;
  if (select count(*) from private.consultations where customer_id=auth.uid() and state not in ('cancelled','completed','unmatched'))>=5 then raise exception 'request_limit';end if;
  target:=(payload->>'planner_id')::uuid;
  if target is not null and (not private.planner_eligible(target) or not exists(select 1 from private.planner_directory where user_id=target and available)) then raise exception 'invalid_partner';end if;
  if target is null and (payload->>'automatic')::boolean is distinct from true then raise exception 'select_planner';end if;
  insert into private.consultations(customer_id,planner_id,purpose,region,method,preferred_at,automatic,location_consent,latitude,longitude,response_deadline)
  values(auth.uid(),target,payload->>'purpose',trim(payload->>'region'),payload->>'method',proposed,coalesce((payload->>'automatic')::boolean,false),coalesce((payload->>'location_consent')::boolean,false),(payload->>'latitude')::double precision,(payload->>'longitude')::double precision,now()+interval '24 hours') returning consultations.id into id;
  insert into private.consultation_events(consultation_id,actor,event) values(id,auth.uid(),'requested');
  if target is null then perform private.offer_next(id);end if;
  return jsonb_build_object('id',id);
 end if;
 id:=(payload->>'id')::uuid;
 select * into c from private.consultations where consultations.id=id for update;
 if c.id is null then raise exception 'request_forbidden';end if;
 is_customer:=c.customer_id=auth.uid();is_planner:=c.planner_id=auth.uid();
 if not (is_customer or coalesce(is_planner,false) or admin) then raise exception 'request_forbidden';end if;
 if operation not in ('issue','resolve_issue') and (payload->>'revision')::integer is distinct from c.revision then raise exception 'stale_request';end if;
 -- Every mutation shares the same booking lock with approval/refund reconciliation.
 if c.payment_state in ('confirming','refunding') and operation not in ('issue') then raise exception 'payment_in_progress';end if;
 if operation='pass' then
  if not is_planner or c.state<>'requested' then raise exception 'invalid_transition';end if;
  update private.consultations set excluded=array_append(excluded,c.planner_id),planner_id=null,state='unmatched' where consultations.id=id;
  if c.automatic then update private.consultations set state='requested' where consultations.id=id;perform private.offer_next(id);end if;
 elsif operation='rematch' then
  if not (is_customer or admin) or not c.automatic or c.state not in ('requested','unmatched') or (c.state='requested' and c.response_deadline>now()) then raise exception 'invalid_transition';end if;
  update private.consultations set excluded=case when planner_id is null then excluded else array_append(excluded,planner_id) end,state='requested' where consultations.id=id;perform private.offer_next(id);
 elsif operation='accept' then
  if not is_planner or not private.planner_eligible(auth.uid()) or not exists(select 1 from private.planner_directory where user_id=auth.uid() and available) or c.state not in ('requested','coordinating') then raise exception 'invalid_transition';end if;
  perform 1 from private.planner_directory where user_id=auth.uid() for update;
  if exists(select 1 from private.consultations where planner_id=auth.uid() and state='completed' and is_free=false and first_paid and not second_paid and payment_state not in ('refund_requested','refunding','refunded','refund_failed')) then raise exception 'balance_outstanding';end if;
  select * into pol from private.connection_policies order by connection_policies.id desc limit 1;
  if c.is_free is null and (payload->>'policy_id')::bigint is distinct from pol.id then raise exception 'price_changed';end if;
  update private.consultations set planner_ok=true,state='coordinating',paid_consent=coalesce((payload->>'paid_consent')::boolean,false),policy_id=case when is_free is null then pol.id else policy_id end where consultations.id=id;
 elsif operation='propose' then
  if not (is_customer or is_planner) or c.state not in ('requested','coordinating','confirmed','scheduled') then raise exception 'invalid_transition';end if;
  proposed:=(payload->>'preferred_at')::timestamptz;
  if proposed is null or proposed<now()+interval '30 minutes' or proposed>now()+interval '90 days' or mod(extract(epoch from proposed),1800)<>0 then raise exception 'invalid_slot';end if;
  update private.consultations set preferred_at=proposed,customer_ok=false,planner_ok=false,state='coordinating' where consultations.id=id;
 elsif operation='confirm' then
  if not is_customer or c.state<>'coordinating' or not c.planner_ok or not private.planner_eligible(c.planner_id) or c.preferred_at<=now() then raise exception 'invalid_transition';end if;
  if (payload->>'share_consent')::boolean is distinct from true then raise exception 'consent_required';end if;
  perform 1 from private.planner_directory where user_id=c.planner_id for update;
  if exists(select 1 from private.followup_meetings where planner_id=c.planner_id and preferred_at=c.preferred_at and state='confirmed') then raise exception 'invalid_slot';end if;
  if c.is_free is null then
   select * into pol from private.connection_policies where connection_policies.id=c.policy_id;
   n:=private.free_remaining(c.planner_id,pol.id);
   if n=0 and not c.paid_consent then raise exception 'planner_price_consent_required';end if;
   update private.consultations set is_free=(n>0),coupon_state=case when n>0 then 'reserved' end,total_won=case when n>0 then 0 else pol.total_won end,payment_state=case when n>0 then 'free' else 'unpaid' end where consultations.id=id;
  end if;
  insert into private.consultation_contacts(consultation_id,customer_name,phone,recipient,version) values(id,trim(payload->>'name'),regexp_replace(payload->>'phone','[- ]','','g'),c.planner_id,'contact-v1') on conflict(consultation_id) do update set customer_name=excluded.customer_name,phone=excluded.phone,consented_at=now();
  update private.consultations set customer_ok=true,state=case when is_free or first_paid then 'scheduled' else 'confirmed' end where consultations.id=id;
 elsif operation='complete_request' then
  if not is_planner or not private.planner_eligible(auth.uid()) or c.state<>'scheduled' or c.preferred_at>now() then raise exception 'invalid_transition';end if;
  update private.consultations set state='awaiting_completion',completion_requested_at=now() where consultations.id=id;
 elsif operation='complete_confirm' then
  if not is_customer or c.state<>'awaiting_completion' then raise exception 'invalid_transition';end if;
  perform 1 from private.planner_directory where user_id=c.planner_id for update;
  update private.consultations set state='completed',completed_at=now(),coupon_state=case when is_free then 'used' else coupon_state end,payment_state=case when is_free then 'free' when second_paid then 'paid' else 'balance_due' end where consultations.id=id;
 elsif operation='review' then
  if not is_customer or c.state<>'completed' or (payload->>'public_consent')::boolean is distinct from true then raise exception 'invalid_transition';end if;
  insert into private.consultation_reviews(consultation_id,planner_id,rating,body,consent_version) values(id,c.planner_id,(payload->>'rating')::integer,trim(payload->>'body'),'review-public-v1');
 elsif operation='publish_review' then
  if not admin or coalesce(length(trim(payload->>'reason')),0)<5 then raise exception 'admin_required';end if;
  update private.consultation_reviews set visible=coalesce((payload->>'visible')::boolean,false),reviewed_by=auth.uid(),review_reason=payload->>'reason' where consultation_id=id;
  if not found then raise exception 'review_not_found';end if;
 elsif operation='followup_propose' then
  if not (is_customer or is_planner) or c.state<>'completed' then raise exception 'invalid_transition';end if;
  proposed:=(payload->>'preferred_at')::timestamptz;
  if proposed is null or proposed<now()+interval '30 minutes' or proposed>now()+interval '90 days' or mod(extract(epoch from proposed),1800)<>0 then raise exception 'invalid_slot';end if;
  insert into private.followup_meetings(consultation_id,planner_id,proposed_by,preferred_at) values(id,c.planner_id,auth.uid(),proposed);
 elsif operation='followup_confirm' then
  if not (is_customer or is_planner) or c.state<>'completed' then raise exception 'invalid_transition';end if;
  perform 1 from private.planner_directory where user_id=c.planner_id for update;
  select preferred_at into proposed from private.followup_meetings where followup_meetings.id=(payload->>'followup_id')::uuid and consultation_id=id and state='proposed' and proposed_by<>auth.uid() for update;
  if not found or proposed<=now() or exists(select 1 from private.consultations where planner_id=c.planner_id and preferred_at=proposed and state in ('confirmed','scheduled','awaiting_completion')) then raise exception 'invalid_slot';end if;
  update private.followup_meetings set state='confirmed' where followup_meetings.id=(payload->>'followup_id')::uuid;
 elsif operation='followup_cancel' then
  if not (is_customer or is_planner) then raise exception 'request_forbidden';end if;
  update private.followup_meetings set state='cancelled' where followup_meetings.id=(payload->>'followup_id')::uuid and consultation_id=id and state<>'cancelled';
  if not found then raise exception 'invalid_transition';end if;
 elsif operation='cancel' then
  if not (is_customer or is_planner or admin) or c.state not in ('requested','coordinating','confirmed','scheduled','unmatched') then raise exception 'invalid_transition';end if;
  update private.consultations set state='cancelled',coupon_state=case when coupon_state='reserved' then 'released' else coupon_state end,payment_state=case when first_paid then 'refund_requested' else payment_state end where consultations.id=id;
 elsif operation='issue' then
  if length(trim(payload->>'reason')) not between 3 and 1000 or payload->>'category' not in ('question','no_show','dispute','refund') then raise exception 'invalid_issue';end if;
  if payload->>'category'='no_show' and (c.preferred_at>now() or c.state not in ('scheduled','awaiting_completion')) then raise exception 'invalid_transition';end if;
  insert into private.consultation_issues(consultation_id,actor,category,reason) values(id,auth.uid(),payload->>'category',trim(payload->>'reason'));
  if payload->>'category' in ('no_show','dispute') then update private.consultations set state=case when payload->>'category'='no_show' then 'no_show' else 'dispute' end where consultations.id=id;end if;
  if payload->>'category'='refund' then update private.consultations set payment_state='refund_requested' where consultations.id=id and first_paid;end if;
 elsif operation='resolve_issue' then
  if not admin or coalesce(length(trim(payload->>'reason')),0)<5 or payload->>'outcome' not in ('cancelled','scheduled') then raise exception 'admin_required';end if;
  if c.state not in ('dispute','no_show') or c.payment_state in ('confirming','refunding') then raise exception 'invalid_transition';end if;
  if payload->>'outcome'='scheduled' and not (c.is_free or c.first_paid) then raise exception 'payment_required';end if;
  update private.consultations set state=payload->>'outcome',coupon_state=case when payload->>'outcome'='cancelled' and coupon_state='reserved' then 'released' else coupon_state end,payment_state=case when payload->>'outcome'='cancelled' and first_paid then 'refund_requested' else payment_state end where consultations.id=id;
  update private.consultation_issues set resolved=true,resolution=payload->>'reason',resolved_by=auth.uid(),resolved_at=now() where consultation_id=id and not resolved;
 else raise exception 'unknown_operation';end if;
 update private.consultations set revision=revision+1,updated_at=now() where consultations.id=id;
 insert into private.consultation_events(consultation_id,actor,event,reason,metadata) values(id,auth.uid(),operation,coalesce(payload->>'reason',''),jsonb_build_object('previous_state',c.state,'revision',c.revision,'previous_preferred_at',c.preferred_at,'new_preferred_at',(select preferred_at from private.consultations where consultations.id=id)));
 return jsonb_build_object('saved',true,'id',id);
end $$;

create function public.consultation_workspace(workspace text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; pol private.connection_policies;
begin
 if auth.uid() is null or workspace not in ('customer','partner','admin') or workspace is null then raise exception 'request_forbidden';end if;
 if workspace='admin' and not private.is_admin() then raise exception 'admin_required';end if;
 select * into pol from private.connection_policies order by id desc limit 1;
 select coalesce(jsonb_agg(q.item order by q.created_at desc),'[]') into result from (
 select c.created_at,(to_jsonb(c)-'latitude'-'longitude'-'excluded'-'customer_id')||jsonb_build_object('planner_name',p.full_name,'organization',p.organization,'planner_sample',d.is_sample,
 'contact',case when workspace='customer' or workspace='admin' or (workspace='partner' and private.planner_eligible(auth.uid()) and c.customer_ok and c.state in ('scheduled','awaiting_completion')) then (select jsonb_build_object('name',x.customer_name,'phone',x.phone) from private.consultation_contacts x where x.consultation_id=c.id) end,
 'planner_phone',case when c.customer_ok and c.state in ('scheduled','awaiting_completion') then d.phone end,
 'events',case when workspace='admin' then (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at),'[]') from private.consultation_events e where e.consultation_id=c.id) else '[]'::jsonb end,
 'review',(select to_jsonb(r)-'reviewed_by' from private.consultation_reviews r where r.consultation_id=c.id),
 'followups',(select coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('can_confirm',f.proposed_by<>auth.uid())),'[]') from private.followup_meetings f where f.consultation_id=c.id),
 'orders',(select coalesce(jsonb_agg(to_jsonb(o)-'payment_key'),'[]') from private.consultation_orders o where o.consultation_id=c.id),
 'issues',(select coalesce(jsonb_agg(to_jsonb(i)-'actor'),'[]') from private.consultation_issues i where i.consultation_id=c.id),
 'needs_admin_review',c.state='awaiting_completion' and c.completion_requested_at<now()-interval '48 hours') item
 from private.consultations c left join public.partner_applications p on p.user_id=c.planner_id left join private.planner_directory d on d.user_id=c.planner_id
 where workspace='admin' or (workspace='customer' and c.customer_id=auth.uid()) or (workspace='partner' and c.planner_id=auth.uid()) order by c.created_at desc limit 200) q;
 return jsonb_build_object('bookings',result,'policy',to_jsonb(pol)-'created_by','free_remaining',private.free_remaining(auth.uid(),pol.id),
 'free_reserved',(select count(*) from private.consultations where planner_id=auth.uid() and coupon_state='reserved'),
 'free_used',(select count(*) from private.consultations where planner_id=auth.uid() and coupon_state='used'),
 'profile',(select to_jsonb(d)-'identity_key'-'evidence'-'verified_by' from private.planner_directory d where d.user_id=auth.uid()),
 'planner_profiles',case when workspace='admin' then (select coalesce(jsonb_agg(to_jsonb(d)-'identity_key'),'[]') from private.planner_directory d) else '[]'::jsonb end);
end $$;
revoke all on function private.planner_eligible(uuid),private.free_remaining(uuid,bigint),private.rank_planners(text,text,timestamptz,double precision,double precision),private.offer_next(uuid) from public,anon,authenticated;
revoke all on function public.planner_catalog(text,text),public.consultation_command(text,jsonb),public.consultation_workspace(text) from public,anon,authenticated;
grant execute on function public.planner_catalog(text,text) to anon,authenticated;
grant execute on function public.consultation_command(text,jsonb),public.consultation_workspace(text) to authenticated;
-- Close the old write API so unilateral completion cannot bypass the new workflow.
revoke execute on function public.create_service_request(text,text,text,timestamptz),public.assign_service_request(uuid,uuid,text),public.confirm_service_request(uuid,uuid,text,text,boolean),public.change_service_request(uuid,text) from authenticated;
commit;



-- ===================== 004_payment_ledger.sql =====================
begin;
create function public.connection_checkout(booking_id uuid,requested_stage integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.consultations; o private.consultation_orders; order_name text;
begin
 select * into c from private.consultations where id=booking_id for update;
 if auth.uid() is null or c.planner_id is distinct from auth.uid() or not private.planner_eligible(auth.uid()) then raise exception 'request_forbidden';end if;
 if c.is_free is distinct from false then raise exception 'free_no_payment';end if;
 if requested_stage is null or requested_stage not in (1,2) then raise exception 'invalid_stage';end if;
 if (requested_stage=1 and (c.state<>'confirmed' or c.first_paid)) or (requested_stage=2 and (c.state<>'completed' or not c.first_paid or c.second_paid or c.payment_state not in ('balance_due','confirming','failed'))) then raise exception 'invalid_stage';end if;
 if exists(select 1 from private.consultation_issues where consultation_id=booking_id and not resolved and category in ('dispute','refund','no_show')) then raise exception 'dispute_on_hold';end if;
 if c.payment_state in ('refund_requested','refunding','refunded','refund_failed') then raise exception 'refund_on_hold';end if;
 order_name:='boh_'||replace(booking_id::text,'-','')||'_'||requested_stage::text;
 insert into private.consultation_orders(id,consultation_id,stage,amount) values(order_name,booking_id,requested_stage,c.total_won/2) on conflict(consultation_id,stage) do nothing;
 select * into o from private.consultation_orders where id=order_name;
 if o.state not in ('unpaid','confirming','failed') then raise exception 'invalid_stage';end if;
 return (to_jsonb(o)-'payment_key')||jsonb_build_object('customer_key',c.planner_id,'test_only',true);
end $$;
create function public.connection_begin_confirm(order_id text,provided_key text,provided_amount integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.consultations; o private.consultation_orders;
begin
 select * into o from private.consultation_orders where id=order_id;
 select * into c from private.consultations where id=o.consultation_id for update;
 if c.id is null or c.planner_id is distinct from auth.uid() or not private.planner_eligible(auth.uid()) then raise exception 'request_forbidden';end if;
 select * into o from private.consultation_orders where id=order_id for update;
 if provided_key is null or length(provided_key) not between 1 and 200 or provided_amount is distinct from o.amount then raise exception 'payment_mismatch';end if;
 if o.payment_key is not null and o.payment_key<>provided_key then raise exception 'payment_key_conflict';end if;
 if o.state='paid' then return jsonb_build_object('already_paid',true,'id',o.id,'amount',o.amount,'payment_key',o.payment_key);end if;
 if (o.stage=1 and c.state<>'confirmed') or (o.stage=2 and c.state<>'completed') or c.payment_state in ('refund_requested','refunding','refunded','refund_failed') then raise exception 'invalid_stage';end if;
 if exists(select 1 from private.consultation_issues where consultation_id=c.id and not resolved and category in ('dispute','refund','no_show')) then raise exception 'dispute_on_hold';end if;
 update private.consultation_orders set state='confirming',payment_key=provided_key,updated_at=now() where id=order_id;
 update private.consultations set payment_state='confirming',updated_at=now() where id=c.id;
 insert into private.payment_attempts(order_id,action,outcome) values(order_id,'confirm','started');
 return jsonb_build_object('id',o.id,'amount',o.amount,'payment_key',provided_key);
end $$;
create function public.connection_order_lookup(order_id text) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(o) from private.consultation_orders o where o.id=order_id
$$;
-- Only the server service role may reconcile a provider-confirmed payment.
create function public.connection_reconcile(order_id text,provided_key text,provided_amount integer,provider_status text,receipt text default null,transaction_id text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.consultation_orders; c private.consultations;
begin
 select * into o from private.consultation_orders where id=order_id;
 select * into c from private.consultations where id=o.consultation_id for update;
 select * into o from private.consultation_orders where id=order_id for update;
 if o.id is null or o.amount is distinct from provided_amount or o.payment_key is distinct from provided_key then raise exception 'payment_mismatch';end if;
 if provider_status='DONE' then
  -- A delayed success notification must never revive a refunded payment.
  if o.state in ('refunded','refunding','refund_failed','refund_requested') then return jsonb_build_object('reconcile_refund',true);end if;
  update private.consultation_orders set state='paid',receipt_url=receipt,updated_at=now() where id=order_id;
  update private.consultations set first_paid=case when o.stage=1 then true else first_paid end,second_paid=case when o.stage=2 then true else second_paid end,
  state=case when o.stage=1 and state='confirmed' then 'scheduled' else state end,
  payment_state=case when state='cancelled' or payment_state='refund_requested' then 'refund_requested' when o.stage=2 or second_paid then 'paid' when state='completed' then 'balance_due' else 'first_paid' end,updated_at=now() where id=c.id;
 elsif provider_status='CANCELED' then
  update private.consultation_orders set state='refunded',refunded_won=amount,updated_at=now() where id=order_id;
  update private.consultations set payment_state=case when exists(select 1 from private.consultation_orders other where other.consultation_id=c.id and other.state='paid') then 'refund_requested' else 'refunded' end where id=c.id;
 elsif provider_status in ('ABORTED','EXPIRED') and o.state not in ('paid','refunded') then
  update private.consultation_orders set state='failed',payment_key=null,updated_at=now() where id=order_id;
  update private.consultations set payment_state=case when o.stage=2 then 'balance_due' else 'failed' end where id=c.id;
 else return jsonb_build_object('pending',true);end if;
 insert into private.payment_attempts(order_id,action,outcome,transaction_key) values(order_id,'reconcile',provider_status,transaction_id);
 return jsonb_build_object('saved',true);
end $$;
create function public.connection_refund_request(order_id text,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.consultation_orders; c private.consultations;
begin
 if not private.is_admin() or coalesce(length(trim(reason)),0)<5 then raise exception 'admin_required';end if;
 select * into o from private.consultation_orders where id=order_id;
 select * into c from private.consultations where id=o.consultation_id for update;
 if c.id is null or c.payment_state='confirming' or c.state not in ('cancelled','dispute','no_show') then raise exception 'invalid_transition';end if;
 if o.state='refunded' then return jsonb_build_object('already_refunded',true);end if;
 if o.state not in ('paid','refunding','refund_failed','refund_requested') then raise exception 'invalid_transition';end if;
 update private.consultation_orders set state='refunding',updated_at=now() where id=order_id;
 update private.consultations set payment_state='refunding' where id=c.id;
 insert into private.consultation_events(consultation_id,actor,event,reason) values(c.id,auth.uid(),'refund_approved',reason);
 return jsonb_build_object('id',o.id,'payment_key',o.payment_key,'amount',o.amount,'reason',reason);
end $$;
create function public.connection_refund_failure(order_id text) returns void language plpgsql security definer set search_path='' as $$
declare booking uuid;
begin
 select consultation_id into booking from private.consultation_orders where id=order_id;
 perform 1 from private.consultations where id=booking for update;
 update private.consultation_orders set state='refund_failed' where id=order_id and state='refunding';
 if found then update private.consultations set payment_state='refund_failed' where id=booking;end if;
 insert into private.payment_attempts(order_id,action,outcome) values(order_id,'refund','needs_reconciliation');
end $$;
revoke all on function public.connection_checkout(uuid,integer),public.connection_begin_confirm(text,text,integer),public.connection_order_lookup(text),public.connection_reconcile(text,text,integer,text,text,text),public.connection_refund_request(text,text),public.connection_refund_failure(text) from public,anon,authenticated;
grant execute on function public.connection_checkout(uuid,integer),public.connection_begin_confirm(text,text,integer),public.connection_refund_request(text,text) to authenticated;
grant execute on function public.connection_order_lookup(text),public.connection_reconcile(text,text,integer,text,text,text),public.connection_refund_failure(text) to service_role;
commit;


begin;
create function public.connection_user_order(order_id text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 select to_jsonb(o) into result from private.consultation_orders o join private.consultations c on c.id=o.consultation_id where o.id=order_id and (c.planner_id=auth.uid() or private.is_admin());
 if result is null then raise exception 'request_forbidden';end if;
 return result;
end $$;
revoke all on function public.connection_user_order(text) from public,anon,authenticated;
grant execute on function public.connection_user_order(text) to authenticated;
commit;


-- ===================== 005_matching_worker.sql =====================
begin;
create function public.expire_consultation_offers() returns integer language plpgsql security definer set search_path='' as $$
declare c private.consultations; total integer:=0;
begin
 for c in select * from private.consultations where state='requested' and automatic and response_deadline<now() order by response_deadline limit 100 for update skip locked loop
  update private.consultations set excluded=case when planner_id is null then excluded else array_append(excluded,planner_id) end,revision=revision+1 where id=c.id;
  insert into private.consultation_events(consultation_id,event,metadata) values(c.id,'offer_expired',jsonb_build_object('planner',c.planner_id));
  perform private.offer_next(c.id);total:=total+1;
 end loop;
 return total;
end $$;
revoke all on function public.expire_consultation_offers() from public,anon,authenticated;
grant execute on function public.expire_consultation_offers() to service_role;
commit;


-- ===================== 006_metrics.sql =====================
begin;
create table private.daily_visit_sessions(day date not null,session_id uuid not null,primary key(day,session_id));
revoke all on private.daily_visit_sessions from public,anon,authenticated;
create function public.record_visit_session(session_id uuid) returns void language sql security definer set search_path='' as $$
 insert into private.daily_visit_sessions(day,session_id) values((now() at time zone 'Asia/Seoul')::date,session_id) on conflict do nothing
$$;
create function public.consultation_metrics() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date:=(now() at time zone 'Asia/Seoul')::date;
begin
 if not private.is_admin() then raise exception 'admin_required';end if;
 return jsonb_build_object('date_kst',today,'visit_sessions',(select count(*) from private.daily_visit_sessions where day=today),
 'today_requests',(select count(*) from private.consultations where (created_at at time zone 'Asia/Seoul')::date=today),
 'active_planners',(select count(*) from private.planner_directory d where private.planner_eligible(d.user_id) and d.available),
 'new_planners',(select count(*) from public.partner_applications where (created_at at time zone 'Asia/Seoul')::date=today and profession='planner'),
 'expected_paid',(select count(*) from private.consultations where is_free=false and state not in ('cancelled','no_show','dispute')),
 'test_paid_won',(select coalesce(sum(amount-refunded_won),0) from private.consultation_orders where state in ('paid','refunding','refund_failed','refunded')),
 'planner_summary',(select coalesce(jsonb_agg(jsonb_build_object('id',d.user_id,'name',p.full_name,'sample',d.is_sample,'completed',(select count(*) from private.consultations c where c.planner_id=d.user_id and c.state='completed'),'free_remaining',private.free_remaining(d.user_id,(select id from private.connection_policies order by id desc limit 1)))),'[]') from private.planner_directory d join public.partner_applications p on p.user_id=d.user_id));
end $$;
revoke all on function public.record_visit_session(uuid),public.consultation_metrics() from public,anon,authenticated;
grant execute on function public.record_visit_session(uuid) to anon,authenticated;
grant execute on function public.consultation_metrics() to authenticated;
commit;


