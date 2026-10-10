begin;
create table if not exists private.optional_profile_release_snapshot(name text primary key,payload jsonb not null);
alter table private.optional_profile_release_snapshot enable row level security;
revoke all on private.optional_profile_release_snapshot from public,anon,authenticated;
insert into private.optional_profile_release_snapshot values
 ('schema_columns',(select jsonb_agg(to_jsonb(c)) from information_schema.columns c where table_schema in ('public','private'))),
 ('existing_member',coalesce((select to_jsonb(m) from public.member_profiles m order by user_id limit 1),'{}')),
 ('counts',jsonb_build_object('users',(select count(*) from auth.users),'members',(select count(*) from public.member_profiles),'consultations',(select count(*) from private.consultations),'profiles',(select count(*) from private.planner_directory)))
on conflict do nothing;
create table if not exists private.optional_profile_backup(name text primary key,definition text not null);
alter table private.optional_profile_backup enable row level security;
revoke all on private.optional_profile_backup from public,anon,authenticated;
insert into private.optional_profile_backup select x,pg_get_functiondef(to_regprocedure(x)) from unnest(array['public.planner_catalog(text,text)','public.consultation_command(text,jsonb)']) x on conflict do nothing;
create table if not exists private.optional_profile_rows_backup(user_id uuid primary key,biography text,photo_url text,experience integer,saved_at timestamptz not null default now());
alter table private.optional_profile_rows_backup enable row level security;
revoke all on private.optional_profile_rows_backup from public,anon,authenticated;
insert into private.optional_profile_rows_backup(user_id,biography,photo_url,experience) select user_id,biography,photo_url,experience from private.planner_directory on conflict do nothing;
alter table private.planner_directory add column if not exists insurance_types text[] not null default '{}' check(cardinality(insurance_types)<=2 and insurance_types<@array['life','nonlife']);
alter table private.planner_directory add column if not exists help_tasks text[] not null default '{}' check(cardinality(help_tasks)<=3 and help_tasks<@array['claim_documents','policy_check','office_consultation']);
alter table private.office_locations add column if not exists operator_user_id uuid references public.partner_applications(user_id);

create or replace function private.profile_offices(subject uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'region',o.region,'available',o.status='active' and nullif(o.address,'') is not null and o.latitude is not null and o.longitude is not null) order by o.name),'[]') from private.office_locations o where o.operator_user_id=subject and o.status<>'closed'
$$;
revoke all on function private.profile_offices(uuid) from public,anon,authenticated;

create or replace function public.expert_optional_profile(operation text default 'get',payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();types text[];tasks text[];intro text;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if not exists(select 1 from public.partner_applications where user_id=actor and profession='planner' and status not in ('rejected','suspended')) then raise exception 'planner_required';end if;
 if exists(select 1 from private.expert_profiles where user_id=actor and status in ('REJECTED','SUSPENDED')) then raise exception 'application_locked';end if;
 if operation not in ('get','save') then raise exception 'invalid_operation';end if;
 if operation='save' then
  perform pg_advisory_xact_lock(hashtextextended(actor::text,52));
  types:=array(select distinct jsonb_array_elements_text(coalesce(payload->'insurance_types','[]')));
  tasks:=array(select distinct jsonb_array_elements_text(coalesce(payload->'help_tasks','[]')));
  if cardinality(types)>2 or not types<@array['life','nonlife'] or cardinality(tasks)>3 or not tasks<@array['claim_documents','policy_check','office_consultation'] then raise exception 'invalid_options';end if;
  if 'office_consultation'=any(tasks) and not exists(select 1 from private.office_locations where operator_user_id=actor and status<>'closed') then raise exception 'office_operator_required';end if;
  if payload ? 'biography' then
   intro:=trim(coalesce(payload->>'biography',''));
   if length(intro)>40 or intro~'[[:cntrl:]<>]' then raise exception 'invalid_introduction';end if;
  end if;
  insert into private.planner_directory(user_id) values(actor) on conflict do nothing;
  update private.planner_directory set insurance_types=types,help_tasks=tasks,biography=case when payload ? 'biography' then intro else biography end where user_id=actor;
 end if;
 return (select jsonb_build_object('id',p.user_id,'name',p.full_name,'organization',p.organization,'insurance_types',coalesce(d.insurance_types,'{}'),'help_tasks',coalesce(d.help_tasks,'{}'),'biography',coalesce(d.biography,''),'photo_url',coalesce(d.photo_url,''),'offices',private.profile_offices(p.user_id)) from public.partner_applications p left join private.planner_directory d using(user_id) where p.user_id=actor);
end$$;
revoke all on function public.expert_optional_profile(text,jsonb) from public,anon,authenticated;
grant execute on function public.expert_optional_profile(text,jsonb) to authenticated;

do $$begin
 if to_regprocedure('public.planner_catalog_before_optional_profile(text,text)') is null then alter function public.planner_catalog(text,text) rename to planner_catalog_before_optional_profile;end if;
 if to_regprocedure('public.consultation_command_before_optional_profile(text,jsonb)') is null then alter function public.consultation_command(text,jsonb) rename to consultation_command_before_optional_profile;end if;
end$$;
revoke all on function public.planner_catalog_before_optional_profile(text,text),public.consultation_command_before_optional_profile(text,jsonb) from public,anon,authenticated;
create or replace function public.planner_catalog(area text default '',wanted text default '') returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('planners',coalesce(jsonb_agg((p-'experience')||jsonb_build_object('insurance_types',coalesce(d.insurance_types,'{}'),'help_tasks',coalesce(array(select t from unnest(d.help_tasks) t where t<>'office_consultation' or jsonb_array_length(private.profile_offices(d.user_id))>0),'{}'),'biography',coalesce(d.biography,p->>'biography',''),'photo_url',coalesce(d.photo_url,p->>'photo_url',''),'offices',private.profile_offices(d.user_id)) order by ord),'[]')) from jsonb_array_elements(public.planner_catalog_before_optional_profile(area,wanted)->'planners') with ordinality as entry(p,ord) left join private.planner_directory d on d.user_id=(p->>'id')::uuid
$$;
create or replace function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare current_profile private.planner_directory;
begin
 if operation='profile' then
  select * into current_profile from private.planner_directory where user_id=auth.uid();
  if payload ? 'biography' and payload->>'biography' is distinct from current_profile.biography and (length(payload->>'biography')>40 or payload->>'biography'~'[[:cntrl:]<>]') then raise exception 'invalid_introduction';end if;
  if payload ? 'photo_url' and payload->>'photo_url' is distinct from coalesce(current_profile.photo_url,'') then raise exception 'use_photo_upload';end if;
  payload:=jsonb_build_object('biography',coalesce(current_profile.biography,''),'photo_url',coalesce(current_profile.photo_url,''))||payload||jsonb_build_object('experience',coalesce(current_profile.experience,0));
 end if;
 return public.consultation_command_before_optional_profile(operation,payload);
end$$;
revoke all on function public.planner_catalog(text,text),public.consultation_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.planner_catalog(text,text) to anon,authenticated;
grant execute on function public.consultation_command(text,jsonb) to authenticated;

create or replace function public.expert_photo_service(subject uuid,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare old_url text;version text;new_url text;
begin
 if not exists(select 1 from public.partner_applications p join public.member_profiles m using(user_id) where p.user_id=subject and p.profession='planner' and p.status not in ('rejected','suspended')) or exists(select 1 from private.account_lifecycle where user_id=subject and status<>'ACTIVE') or exists(select 1 from private.expert_profiles where user_id=subject and status in ('REJECTED','SUSPENDED')) then raise exception 'request_forbidden';end if;
 if operation not in ('get','save','clear') then raise exception 'invalid_operation';end if;
 perform pg_advisory_xact_lock(hashtextextended(subject::text,52));
 select photo_url into old_url from private.planner_directory where user_id=subject;
 if operation='save' then
  version:=payload->>'version';if version is null or version!~'^[a-f0-9-]{36}$' then raise exception 'invalid_photo';end if;
  new_url:='https://bohumso.netlify.app/api/expert-photo?id='||subject||'&v='||version;
 elsif operation='clear' then new_url:='';
 end if;
 if operation in ('save','clear') then
  insert into private.planner_directory(user_id,photo_url) values(subject,new_url) on conflict(user_id) do update set photo_url=excluded.photo_url;
 end if;
 return jsonb_build_object('photo_url',coalesce(new_url,old_url,''),'previous_url',old_url);
end$$;
revoke all on function public.expert_photo_service(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.expert_photo_service(uuid,text,jsonb) to service_role;
commit;
