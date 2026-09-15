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

