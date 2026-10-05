begin;
create table private.organization_roster(id uuid primary key default gen_random_uuid(),organization text not null check(length(organization) between 2 and 120),email_hash text,phone_hash text,expires_at timestamptz not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),check(email_hash is not null or phone_hash is not null));
alter table private.organization_roster enable row level security;
revoke all on private.organization_roster from public,anon,authenticated;
alter table private.expert_profiles add column roster_id uuid references private.organization_roster(id);
create function public.expert_roster_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid;email_value text;phone_value text;expiration timestamptz;
begin
 if not private.is_admin() then raise exception 'admin_required';end if;
 if operation='list' then return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'organization',organization,'expires_at',expires_at,'hasEmail',email_hash is not null,'hasPhone',phone_hash is not null)),'[]') from private.organization_roster);end if;
 if operation='revoke' then update private.organization_roster set expires_at=now() where id=(payload->>'id')::uuid;return jsonb_build_object('saved',true);end if;
 if operation<>'add' then raise exception 'invalid_operation';end if;
 email_value:=nullif(lower(trim(payload->>'email')),'');phone_value:=nullif(regexp_replace(coalesce(payload->>'phone',''),'[^0-9]','','g'),'');expiration:=(payload->>'expires_at')::timestamptz;
 if email_value is not null and email_value!~'^[^ @]+@[^ @]+\.[^ @]+$' then raise exception 'invalid_email';end if;
 if phone_value like '82%' then phone_value:='0'||substr(phone_value,3);end if;
 if phone_value is not null and phone_value!~'^010[0-9]{8}$' then raise exception 'invalid_phone';end if;
 if expiration is null or expiration<=now() or length(coalesce(payload->>'reason',''))<5 then raise exception 'evidence_required';end if;
 insert into private.organization_roster(organization,email_hash,phone_hash,expires_at,created_by) values(trim(payload->>'organization'),case when email_value is not null then encode(sha256(convert_to(email_value,'UTF8')),'hex') end,case when phone_value is not null then encode(sha256(convert_to(phone_value,'UTF8')),'hex') end,expiration,auth.uid()) returning id into rid;
 insert into private.expert_verification_events(subject,actor,action,reason) values(auth.uid(),auth.uid(),'ROSTER_ADDED',left(payload->>'reason',1000));return jsonb_build_object('id',rid);
end$$;
create function private.match_expert_roster() returns trigger language plpgsql security definer set search_path='' as $$
declare roster private.organization_roster;u jsonb;phone_value text;
begin
 if new.status in ('SUSPENDED','REJECTED') or new.organization_status<>'NOT_SUBMITTED' then return new;end if;
 select to_jsonb(a) into u from auth.users a where id=new.user_id;
 phone_value:=regexp_replace(coalesce(u->>'phone',''),'[^0-9]','','g');if phone_value like '82%' then phone_value:='0'||substr(phone_value,3);end if;
 select * into roster from private.organization_roster r where expires_at>now() and ((u->>'email_confirmed_at' is not null and email_hash=encode(sha256(convert_to(lower(u->>'email'),'UTF8')),'hex')) or (u->>'phone_confirmed_at' is not null and phone_value<>'' and phone_hash=encode(sha256(convert_to(phone_value,'UTF8')),'hex'))) order by created_at desc limit 1;
 if roster.id is not null then new.organization_status:='VERIFIED';new.roster_id:=roster.id;new.status:='VERIFICATION_PENDING';new.map_visible:=false;insert into private.expert_verification_events(subject,actor,action) values(new.user_id,new.user_id,'ORGANIZATION_ROSTER_MATCH');end if;
 return new;
end$$;
create trigger expert_roster_match before insert or update on private.expert_profiles for each row execute function private.match_expert_roster();
alter function private.planner_eligible(uuid) rename to planner_eligible_before_roster;
revoke all on function private.planner_eligible_before_roster(uuid) from public,anon,authenticated;
create function private.planner_eligible(subject uuid) returns boolean language sql stable security definer set search_path='' as $$select private.planner_eligible_before_roster(subject) and exists(select 1 from private.expert_profiles p where p.user_id=subject and (p.registration_status='VERIFIED' or p.roster_id is null or exists(select 1 from private.organization_roster r where r.id=p.roster_id and r.expires_at>now())))$$;
create or replace function public.my_membership() returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('member',private.is_active_member(),'admin',private.is_admin(),'partner_status',(select status from public.partner_applications where user_id=auth.uid()),'profession',(select profession from public.partner_applications where user_id=auth.uid()),'expert_status',(select status from private.expert_profiles where user_id=auth.uid()),'state',case when auth.uid() is null then 'ANONYMOUS' when private.is_admin() then 'ADMIN' when not private.is_active_member() then 'AUTHENTICATED_INCOMPLETE' when private.planner_eligible(auth.uid()) then 'EXPERT_APPROVED' when exists(select 1 from private.expert_profiles where user_id=auth.uid() and status='VERIFICATION_PENDING') then 'EXPERT_VERIFICATION_PENDING' when exists(select 1 from private.expert_profiles where user_id=auth.uid()) then 'EXPERT_DRAFT' else 'ACTIVE_MEMBER' end)
$$;
revoke all on function public.expert_roster_command(text,jsonb),private.match_expert_roster(),private.planner_eligible(uuid) from public,anon,authenticated;
grant execute on function public.expert_roster_command(text,jsonb) to authenticated;
commit;
