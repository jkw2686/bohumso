-- Development candidate. Production application requires a separate approval.
begin;
select pg_advisory_xact_lock(620062);
create table if not exists private.expert_integration_settings(
 id boolean primary key default true check(id), tax_enabled boolean not null default false,
 unified_booking boolean not null default false
);
insert into private.expert_integration_settings(id) values(true) on conflict do nothing;
create table if not exists private.expert_integration_backup(signature text primary key,definition text not null);
alter table private.expert_integration_settings enable row level security;
alter table private.expert_integration_backup enable row level security;
revoke all on private.expert_integration_settings,private.expert_integration_backup from public,anon,authenticated;
insert into private.expert_integration_backup
 select p.oid::regprocedure::text,pg_get_functiondef(p.oid) from pg_proc p
 where p.prokind='f' and p.pronamespace in ('public'::regnamespace,'private'::regnamespace)
 on conflict do nothing;
alter table private.expert_profiles add column if not exists profession text not null default 'planner' check(profession in ('planner','tax'));
alter table private.expert_profiles add column if not exists declared_organization text not null default '';
alter table private.expert_profiles add column if not exists registration_reference text not null default '';
alter table private.expert_profiles add column if not exists consultation_options jsonb not null default '{"modes":[],"fee":{"status":"check"},"revision":1}';
alter table private.expert_profiles add column if not exists tax_help_tasks text[] not null default '{}' check(cardinality(tax_help_tasks)<=3 and tax_help_tasks<@array['tax_consultation','inheritance_tax','business_tax']);

create or replace function public.expert_integration_capabilities() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',1,'professions',case when tax_enabled then jsonb_build_array('planner','tax') else jsonb_build_array('planner') end,'unifiedBooking',unified_booking,'plannerPolicy','planner-protection-2026-10-12-v2','taxPolicy','tax-service-2026-10-12-v1') from private.expert_integration_settings where id
$$;
create or replace function private.expert_policy_version(job text) returns text language sql immutable set search_path='' as $$
 select case job when 'tax' then 'tax-service-2026-10-12-v1' else 'planner-protection-2026-10-12-v2' end
$$;
create or replace function private.record_expert_policy(job text,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v text:=private.expert_policy_version(job);
begin
 if payload->>'operating_consent' is distinct from 'true' or payload->>'policy_version' is distinct from v then raise exception 'operating_consent_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('policy:'||auth.uid()::text,62));
 if not exists(select 1 from private.consent_records where user_id=auth.uid() and type='EXPERT_TERMS' and version=v and source='expert_operating_principles' and accepted) then
  insert into private.consent_records(user_id,type,version,accepted,accepted_at,source) values(auth.uid(),'EXPERT_TERMS',v,true,now(),'expert_operating_principles');
 end if;
end$$;
do $$begin
 if to_regprocedure('public.expert_profile_before_types(text,jsonb)') is null then alter function public.expert_profile_command(text,jsonb) rename to expert_profile_before_types;end if;
 if to_regprocedure('public.early_review_before_types(text,jsonb)') is null then alter function public.early_expert_review(text,jsonb) rename to early_review_before_types;end if;
 if to_regprocedure('private.eligible_before_types(uuid)') is null then alter function private.planner_eligible(uuid) rename to eligible_before_types;end if;
 if to_regprocedure('private.urgent_before_types(uuid)') is null then alter function private.urgent_eligible(uuid) rename to urgent_before_types;end if;
 if to_regprocedure('public.optional_before_types(text,jsonb)') is null then alter function public.expert_optional_profile(text,jsonb) rename to optional_before_types;end if;
 if to_regprocedure('public.document_before_types(uuid,text,jsonb)') is null then alter function public.early_document_service(uuid,text,jsonb) rename to document_before_types;end if;
 if to_regprocedure('public.expert_submit(jsonb,integer)') is not null and to_regprocedure('public.submit_before_policy(jsonb,integer)') is null then alter function public.expert_submit(jsonb,integer) rename to submit_before_policy;end if;
end$$;

create or replace function public.expert_profile_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.expert_profiles; result jsonb; job text; days integer[]; secondary text[]; tags text[];
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,31));
 select * into p from private.expert_profiles where user_id=auth.uid();
 job:=coalesce(p.profession,payload->>'profession','planner');
 if payload ? 'profession' and p.user_id is not null and p.profession<>payload->>'profession' then raise exception 'profession_change_review_required';end if;
 if operation='consent' then
  if p.user_id is null then raise exception 'profile_required';end if;
  perform private.record_expert_policy(job,payload);operation:='get';
 end if;
 if operation='get' then
  result:=public.expert_profile_before_types('get');
  return result||jsonb_build_object('policyVersion',private.expert_policy_version(job),'policyAccepted',exists(select 1 from private.consent_records where user_id=auth.uid() and type='EXPERT_TERMS' and source='expert_operating_principles' and version=private.expert_policy_version(job) and accepted));
 end if;
 if operation<>'save' or job not in ('planner','tax') then raise exception 'invalid_operation';end if;
 if p.user_id is null or payload->>'operating_consent'='true' then perform private.record_expert_policy(job,payload);end if;
 if job='planner' then return public.expert_profile_before_types(operation,payload);end if;
 if not exists(select 1 from private.expert_integration_settings where tax_enabled) or not exists(select 1 from private.service_features where expert_applications) then raise exception 'profession_not_open';end if;
 if p.user_id is null and exists(select 1 from public.partner_applications where user_id=auth.uid() and status='approved' and profession<>'tax') then raise exception 'profession_change_review_required';end if;
 if payload->>'consent' is distinct from 'true' then raise exception 'consent_required';end if;
 if p.status in ('SUSPENDED','REJECTED') then raise exception 'application_locked';end if;
 if p.status='APPROVED' and (p.display_name is distinct from trim(payload->>'display_name') or p.declared_organization is distinct from trim(payload->>'organization') or p.registration_reference is distinct from trim(payload->>'registration_reference')) then raise exception 'identity_review_required';end if;
 secondary:=array(select distinct jsonb_array_elements_text(coalesce(payload->'secondary_areas','[]')));
 days:=array(select distinct jsonb_array_elements_text(payload->'weekdays')::integer);
 tags:=array(select distinct jsonb_array_elements_text(payload->'specialties'));
 if not exists(select 1 from private.service_areas where id=payload->>'primary_area') or cardinality(secondary)>2 or payload->>'primary_area'=any(secondary) or exists(select 1 from unnest(secondary) a where not exists(select 1 from private.service_areas where id=a)) then raise exception 'invalid_area';end if;
 if cardinality(days)=0 or not days<@array[0,1,2,3,4,5,6] or cardinality(tags) not between 1 and 3 or not tags<@array['tax_consultation','inheritance_tax','business_tax'] then raise exception 'invalid_options';end if;
 if length(trim(coalesce(payload->>'organization',''))) not between 2 and 120 or length(trim(coalesce(payload->>'registration_reference',''))) not between 2 and 80 then raise exception 'registration_required';end if;
 insert into private.expert_profiles(user_id,profession,display_name,declared_organization,registration_reference,primary_area,secondary_areas,specialties,weekdays,start_hour,end_hour)
 values(auth.uid(),job,trim(payload->>'display_name'),trim(payload->>'organization'),trim(payload->>'registration_reference'),payload->>'primary_area',secondary,tags,days,(payload->>'start_hour')::integer,(payload->>'end_hour')::integer)
 on conflict(user_id) do update set display_name=excluded.display_name,declared_organization=excluded.declared_organization,registration_reference=excluded.registration_reference,primary_area=excluded.primary_area,secondary_areas=excluded.secondary_areas,specialties=excluded.specialties,weekdays=excluded.weekdays,start_hour=excluded.start_hour,end_hour=excluded.end_hour,updated_at=now();
 insert into private.expert_service_areas(user_id,primary_area,secondary_areas) values(auth.uid(),payload->>'primary_area',secondary) on conflict(user_id) do update set primary_area=excluded.primary_area,secondary_areas=excluded.secondary_areas;
 insert into public.partner_applications(user_id,full_name,profession,organization,region,credential_reference,status) values(auth.uid(),trim(payload->>'display_name'),'tax',trim(payload->>'organization'),payload->>'primary_area',trim(payload->>'registration_reference'),'pending')
 on conflict(user_id) do update set region=excluded.region;
 insert into private.expert_verification_events(subject,actor,action) values(auth.uid(),auth.uid(),'PROFILE_SAVED');
 return public.expert_profile_command('get');
end$$;

do $migration$begin
if to_regprocedure('public.submit_before_policy(jsonb,integer)') is not null then
execute $definition$create or replace function public.expert_submit(payload jsonb,expected_revision integer default 0) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if payload->>'profession'='planner' then perform private.record_expert_policy('planner',payload);end if;
 perform public.submit_before_policy(payload,expected_revision);
 return;
end$$;$definition$;
revoke all on function public.submit_before_policy(jsonb,integer),public.expert_submit(jsonb,integer) from public,anon,authenticated;
grant execute on function public.expert_submit(jsonb,integer) to authenticated;
end if;
end$migration$;

create or replace function public.early_document_service(subject uuid,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare job text;
begin
 select profession into job from private.expert_profiles where user_id=subject;
 if operation='save' then
  if job='tax' and (payload->>'profession' is distinct from 'tax' or payload->>'kind' is distinct from 'registration') then raise exception 'invalid_document';end if;
  if payload->>'profession'='tax' and job is distinct from 'tax' then raise exception 'invalid_document';end if;
 end if;
 return public.document_before_types(subject,operation,payload);
end$$;

create or replace function public.early_expert_review(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.expert_profiles; a private.service_areas; telephone text; reason text;
begin
 if not private.is_admin() then raise exception 'admin_required';end if;
 select * into p from private.expert_profiles where user_id=nullif(payload->>'user_id','')::uuid for update;
 if p.profession is distinct from 'tax' or operation in ('list','verify','suspend') then return public.early_review_before_types(operation,payload);end if;
 if operation<>'approve' or p.user_id=auth.uid() then raise exception 'request_forbidden';end if;
 if p.registration_status<>'VERIFIED' or not exists(select 1 from private.verification_documents where user_id=p.user_id and kind='registration' and not deleting) then raise exception 'verification_required';end if;
 if not exists(select 1 from private.expert_integration_settings where tax_enabled) then raise exception 'profession_not_open';end if;
 reason:=trim(payload->>'reason');
 if length(coalesce(reason,'')) not between 5 and 1000 or trim(coalesce(payload->>'organization',''))<>p.declared_organization or trim(coalesce(payload->>'registration_reference',''))<>p.registration_reference then raise exception 'evidence_required';end if;
 select phone into telephone from auth.users where id=p.user_id and phone_confirmed_at is not null;
 if telephone is null then raise exception 'phone_verification_required';end if;
 if exists(select 1 from private.account_lifecycle where user_id=p.user_id and status<>'ACTIVE') then raise exception 'account_inactive';end if;
 select * into a from private.service_areas where id=p.primary_area;
 update public.partner_applications set full_name=p.display_name,profession='tax',organization=p.declared_organization,region=p.primary_area,credential_reference=p.registration_reference,status='approved',reviewed_by=auth.uid(),reviewed_at=now() where user_id=p.user_id;
 insert into private.planner_directory(user_id,specialties,hours,latitude,longitude,phone,verified_by,verified_at,evidence,is_sample,available)
 values(p.user_id,p.specialties,p.start_hour||':00–'||p.end_hour||':00',a.latitude,a.longitude,case when telephone like '+82%' then '0'||substr(telephone,4) when telephone like '82%' then '0'||substr(telephone,3) else telephone end,auth.uid(),now(),reason,false,true)
 on conflict(user_id) do update set verified_by=excluded.verified_by,verified_at=excluded.verified_at,evidence=excluded.evidence,is_sample=false;
 update private.expert_profiles set status='APPROVED',map_visible=true,updated_at=now() where user_id=p.user_id;
 insert into private.expert_verification_events(subject,actor,action,reason) values(p.user_id,auth.uid(),'APPROVE',reason);
 return jsonb_build_object('saved',true);
end$$;

create or replace function private.planner_eligible(subject uuid) returns boolean language sql stable security definer set search_path='' as $$
 select (not exists(select 1 from private.expert_profiles where user_id=subject and profession='tax') and private.eligible_before_types(subject)) or (
 exists(select 1 from private.expert_profiles e join public.partner_applications p on p.user_id=e.user_id join private.planner_directory d on d.user_id=e.user_id join auth.users u on u.id=e.user_id
 where e.user_id=subject and e.profession='tax' and p.profession='tax' and p.status='approved' and e.status='APPROVED' and e.map_visible and e.registration_status='VERIFIED' and d.verified_at is not null and u.phone_confirmed_at is not null)
 and exists(select 1 from private.expert_integration_settings where tax_enabled)
 and not exists(select 1 from private.account_lifecycle where user_id=subject and status<>'ACTIVE'))
$$;

create or replace function public.expert_optional_profile(operation text default 'get',payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.expert_profiles; tags text[]; intro text; result jsonb;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 select * into p from private.expert_profiles where user_id=auth.uid();
 if p.profession is distinct from 'tax' then return public.optional_before_types(operation,payload);end if;
 if p.status in ('SUSPENDED','REJECTED') then raise exception 'application_locked';end if;
 if operation='save' then
  tags:=array(select distinct jsonb_array_elements_text(coalesce(payload->'help_tasks','[]')));
  if cardinality(tags)>3 or not tags<@array['tax_consultation','inheritance_tax','business_tax'] or coalesce(payload->'insurance_types','[]')<>'[]'::jsonb then raise exception 'invalid_options';end if;
  intro:=trim(coalesce(payload->>'biography',''));
  if payload ? 'biography' and (length(intro)>40 or intro~'[[:cntrl:]<>]') then raise exception 'invalid_introduction';end if;
  insert into private.planner_directory(user_id) values(auth.uid()) on conflict do nothing;
  if payload ? 'biography' then update private.planner_directory set biography=intro where user_id=auth.uid();end if;
  update private.expert_profiles set tax_help_tasks=tags where user_id=auth.uid();
 elsif operation<>'get' then raise exception 'invalid_operation';end if;
 return (select jsonb_build_object('id',e.user_id,'name',e.display_name,'organization',e.declared_organization,'profession','tax','insurance_types','[]'::jsonb,'help_tasks',e.tax_help_tasks,'biography',coalesce(d.biography,''),'photo_url',coalesce(d.photo_url,''),'offices',private.profile_offices(e.user_id)) from private.expert_profiles e left join private.planner_directory d using(user_id) where e.user_id=auth.uid());
end$$;
-- Tax requests use the scheduled flow with the disclosed cost snapshot.
create or replace function private.urgent_eligible(subject uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.urgent_before_types(subject) and not exists(select 1 from private.expert_profiles where user_id=subject and profession='tax')
$$;
revoke all on function private.urgent_before_types(uuid),private.urgent_eligible(uuid) from public,anon,authenticated;
-- The existing image processor and protected Storage path are reused.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.expert_photo_service(uuid,text,jsonb)'::regprocedure);
 execute replace(definition,'p.profession=''planner''','p.profession in (''planner'',''tax'')');
end$$;
revoke all on function public.expert_profile_before_types(text,jsonb),public.early_review_before_types(text,jsonb),private.eligible_before_types(uuid),public.optional_before_types(text,jsonb),public.document_before_types(uuid,text,jsonb),private.record_expert_policy(text,jsonb),private.expert_policy_version(text),private.planner_eligible(uuid) from public,anon,authenticated;
revoke all on function public.expert_integration_capabilities(),public.expert_profile_command(text,jsonb),public.early_expert_review(text,jsonb),public.expert_optional_profile(text,jsonb),public.early_document_service(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.expert_integration_capabilities() to anon,authenticated;
grant execute on function public.expert_profile_command(text,jsonb),public.early_expert_review(text,jsonb),public.expert_optional_profile(text,jsonb) to authenticated;
grant execute on function public.early_document_service(uuid,text,jsonb) to service_role;
commit;
