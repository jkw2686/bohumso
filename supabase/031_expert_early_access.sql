begin;
create table private.expert_profiles (
 user_id uuid primary key references auth.users(id),display_name text not null check(length(display_name) between 2 and 60),
 primary_area text not null references private.service_areas(id),secondary_areas text[] not null default '{}' check(cardinality(secondary_areas)<=2),
 specialties text[] not null check(cardinality(specialties) between 1 and 3),
 weekdays integer[] not null default array[1,2,3,4,5],start_hour integer not null default 9 check(start_hour between 0 and 22),end_hour integer not null default 18 check(end_hour between 1 and 23 and end_hour>start_hour),
 status text not null default 'PROFILE_COMPLETE_VERIFICATION_REQUIRED' check(status in ('DRAFT','PROFILE_COMPLETE_VERIFICATION_REQUIRED','VERIFICATION_PENDING','APPROVED','SUSPENDED','REJECTED')),
 registration_status text not null default 'NOT_SUBMITTED' check(registration_status in ('NOT_SUBMITTED','PENDING','VERIFIED','NEEDS_RESUBMISSION','REJECTED','EXPIRED')),
 organization_status text not null default 'NOT_SUBMITTED' check(organization_status in ('NOT_SUBMITTED','PENDING','VERIFIED','NEEDS_RESUBMISSION','REJECTED','EXPIRED')),
 map_visible boolean not null default false,updated_at timestamptz not null default now(),created_at timestamptz not null default now()
);
create table private.expert_verification_events(id bigint generated always as identity primary key,subject uuid not null references auth.users(id),actor uuid not null references auth.users(id),action text not null,reason text not null default '',created_at timestamptz not null default now());
alter table private.expert_profiles enable row level security;
alter table private.expert_verification_events enable row level security;
revoke all on private.expert_profiles,private.expert_verification_events from public,anon,authenticated;
create function public.expert_profile_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare subject uuid:=auth.uid(); p private.expert_profiles; secondary text[]; specialties text[]; days integer[]; primary_id text;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='get' then return jsonb_build_object('profile',(select to_jsonb(e) from private.expert_profiles e where user_id=subject),'events',(select coalesce(jsonb_agg(to_jsonb(e) order by created_at desc),'[]') from private.expert_verification_events e where e.subject=auth.uid()));end if;
 if operation<>'save' then raise exception 'invalid_operation';end if;
 if not exists(select 1 from private.service_features where expert_applications) then raise exception 'applications_disabled';end if;
 if payload->>'consent' is distinct from 'true' then raise exception 'consent_required';end if;
 perform pg_advisory_xact_lock(hashtextextended(subject::text,31));
 select * into p from private.expert_profiles where user_id=subject;
 if p.status='APPROVED' and p.display_name is distinct from trim(payload->>'display_name') then raise exception 'name_review_required';end if;
 if p.status in ('SUSPENDED','REJECTED') then raise exception 'application_locked';end if;
 primary_id:=payload->>'primary_area';
 select coalesce(array_agg(distinct value),'{}') into secondary from jsonb_array_elements_text(coalesce(payload->'secondary_areas','[]'));
 select array_agg(distinct value) into specialties from jsonb_array_elements_text(payload->'specialties');
 select array_agg(distinct value::integer) into days from jsonb_array_elements_text(payload->'weekdays');
 if not exists(select 1 from private.service_areas where id=primary_id) or primary_id=any(secondary) or cardinality(secondary)>2 or exists(select 1 from unnest(secondary) a where not exists(select 1 from private.service_areas where id=a)) then raise exception 'invalid_area';end if;
 if specialties is null or cardinality(specialties) not between 1 and 3 or not specialties<@array['claim','death','critical','surgery','medical','accident','coverage','corporate'] then raise exception 'invalid_specialties';end if;
 if days is null or cardinality(days)=0 or not days<@array[0,1,2,3,4,5,6] then raise exception 'invalid_availability';end if;
 insert into private.expert_profiles(user_id,display_name,primary_area,secondary_areas,specialties,weekdays,start_hour,end_hour) values(subject,trim(payload->>'display_name'),primary_id,secondary,specialties,days,(payload->>'start_hour')::integer,(payload->>'end_hour')::integer)
 on conflict(user_id) do update set display_name=excluded.display_name,primary_area=excluded.primary_area,secondary_areas=excluded.secondary_areas,specialties=excluded.specialties,weekdays=excluded.weekdays,start_hour=excluded.start_hour,end_hour=excluded.end_hour,updated_at=now();
 insert into private.expert_service_areas(user_id,primary_area,secondary_areas) values(subject,primary_id,secondary) on conflict(user_id) do update set primary_area=excluded.primary_area,secondary_areas=excluded.secondary_areas,changed_at=now();
 if p.user_id is null then insert into private.consent_records(user_id,type,version,accepted,accepted_at,source) values(subject,'EXPERT_TERMS','2026-10-05-early-access-v1',true,now(),'expert_profile');end if;
 insert into private.expert_verification_events(subject,actor,action) values(subject,subject,'PROFILE_SAVED');
 return public.expert_profile_command('get');
end$$;
alter function private.planner_eligible(uuid) rename to planner_eligible_before_early_access;
revoke all on function private.planner_eligible_before_early_access(uuid) from public,anon,authenticated;
create function private.planner_eligible(subject uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.planner_eligible_before_early_access(subject) and exists(select 1 from private.expert_profiles p join auth.users u on u.id=p.user_id where p.user_id=subject and p.status='APPROVED' and p.map_visible and (p.registration_status='VERIFIED' or p.organization_status='VERIFIED') and u.phone_confirmed_at is not null) and not exists(select 1 from private.account_lifecycle where user_id=subject and status<>'ACTIVE')
$$;
-- Urgent matching shares the same strict publication gate as scheduled booking.
create or replace function private.urgent_eligible(subject uuid) returns boolean language sql stable security definer set search_path='' as $$select private.planner_eligible(subject)$$;
revoke all on function public.expert_profile_command(text,jsonb),private.planner_eligible(uuid) from public,anon,authenticated;
grant execute on function public.expert_profile_command(text,jsonb) to authenticated;
commit;
