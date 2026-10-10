-- Development candidate only. Preserve approval, existing appointments and office operations.
begin;
select pg_advisory_xact_lock(580058);
alter table private.planner_directory add column if not exists self_map_visible boolean not null default true;
alter table private.planner_directory add column if not exists settings_revision bigint not null default 0;
create table if not exists private.expert_settings_backup(name text primary key,definition text not null);
alter table private.expert_settings_backup enable row level security;
revoke all on private.expert_settings_backup from public,anon,authenticated,service_role;
insert into private.expert_settings_backup select name,pg_get_functiondef(to_regprocedure(name)) from unnest(array['public.urgent_command(text,jsonb)','public.consultation_command(text,jsonb)','public.planner_catalog(text,text)','private.visit_available(uuid)']) name on conflict do nothing;
do $$begin
 if to_regprocedure('public.urgent_command_before_settings(text,jsonb)') is null then alter function public.urgent_command(text,jsonb) rename to urgent_command_before_settings;end if;
 if to_regprocedure('public.consultation_command_before_settings(text,jsonb)') is null then alter function public.consultation_command(text,jsonb) rename to consultation_command_before_settings;end if;
 if to_regprocedure('public.planner_catalog_before_settings(text,text)') is null then alter function public.planner_catalog(text,text) rename to planner_catalog_before_settings;end if;
 if to_regprocedure('private.visit_available_before_settings(uuid)') is null then alter function private.visit_available(uuid) rename to visit_available_before_settings;end if;
end$$;
revoke all on function public.urgent_command_before_settings(text,jsonb),public.consultation_command_before_settings(text,jsonb),public.planner_catalog_before_settings(text,text),private.visit_available_before_settings(uuid) from public,anon,authenticated,service_role;

create or replace function private.visit_available(subject uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.planner_directory where user_id=subject and self_map_visible) and private.visit_available_before_settings(subject)
$$;
create or replace function private.expert_settings_state(subject uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('revision',d.settings_revision,'mapEnabled',d.self_map_visible,'mapVisible',d.self_map_visible and private.planner_eligible(subject),'eligible',private.planner_eligible(subject),'scheduledAvailable',d.available,'phone',d.phone,
 'visitEnabled',coalesce(i.enabled and i.expires_at>now(),false),'visitAvailable',private.visit_available(subject),'expiresAt',i.expires_at,'locationUpdatedAt',i.updated_at,
 'locationState',case when i.updated_at is null or i.latitude is null then 'missing' when i.updated_at<=now()-make_interval(mins=>(private.visit_config()->>'expireMinutes')::int) then 'expired' else 'fresh' end,
 'visitConfig',private.visit_config(),'areas',(select to_jsonb(a)-'user_id' from private.expert_service_areas a where a.user_id=subject)) from private.planner_directory d left join private.instant_availability i using(user_id) where d.user_id=subject
$$;
revoke all on function private.expert_settings_state(uuid),private.visit_available(uuid) from public,anon,authenticated,service_role;

-- Legacy visit controls share the same row lock and cannot activate a hidden profile.
create or replace function public.urgent_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();d private.planner_directory;result jsonb;
begin
 if operation in ('start','stop','refresh_location','save_areas') then
  if not private.is_active_member() then raise exception 'membership_required';end if;
  select * into d from private.planner_directory where user_id=actor for update;
  if operation in ('start','refresh_location') and (d.user_id is null or not d.self_map_visible) then raise exception 'map_hidden';end if;
 end if;
 result:=public.urgent_command_before_settings(operation,payload);
 if operation in ('start','stop','refresh_location','save_areas') then
  update private.planner_directory set settings_revision=settings_revision+1 where user_id=actor;
  if operation='save_areas' then
   update private.expert_profiles e set primary_area=a.primary_area,secondary_areas=a.secondary_areas,updated_at=now() from private.expert_service_areas a where a.user_id=actor and e.user_id=actor;
   update public.partner_applications p set region=a.primary_area from private.expert_service_areas a where a.user_id=actor and p.user_id=actor;
  end if;
 end if;
 return result;
end$$;

create or replace function public.expert_settings(operation text default 'get',payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();d private.planner_directory;enabled boolean;result jsonb;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if payload ? 'user_id' or payload ? 'subject' or payload ? 'planner_id' then raise exception 'request_forbidden';end if;
 if not exists(select 1 from public.partner_applications where user_id=actor and profession='planner') then raise exception 'planner_required';end if;
 select * into d from private.planner_directory where user_id=actor for update;
 if d.user_id is null then raise exception 'profile_required';end if;
 if operation='get' then return private.expert_settings_state(actor);end if;
 if operation not in ('map','visit','refresh','area','contact') then raise exception 'invalid_operation';end if;
 if d.settings_revision is distinct from (payload->>'revision')::bigint then raise exception 'stale_settings';end if;
 if operation in ('map','visit') then
  if jsonb_typeof(payload->'enabled') is distinct from 'boolean' then raise exception 'invalid_settings';end if;
  enabled:=(payload->>'enabled')::boolean;
 end if;
 if operation='map' then
  if enabled and not private.planner_eligible(actor) then raise exception 'expert_verification_required';end if;
  if not enabled and payload->>'confirmed' is distinct from 'true' then raise exception 'confirmation_required';end if;
  update private.planner_directory set self_map_visible=enabled,settings_revision=settings_revision+1 where user_id=actor;
  if not enabled then update private.instant_availability set enabled=false,latitude=null,longitude=null,accuracy=null,updated_at=now() where user_id=actor;end if;
 elsif operation='visit' then
  result:=public.urgent_command(case when enabled then 'start' else 'stop' end,payload);
 elsif operation='refresh' then result:=public.urgent_command('refresh_location',payload);
 elsif operation='area' then result:=public.urgent_command('save_areas',payload);
 elsif operation='contact' then
  if length(coalesce(payload->>'phone',''))>30 then raise exception 'invalid_contact';end if;
  update private.planner_directory set phone=regexp_replace(coalesce(payload->>'phone',''),'[- ]','','g'),settings_revision=settings_revision+1 where user_id=actor;
 end if;
 return private.expert_settings_state(actor)||jsonb_build_object('saved',true);
end$$;

-- Hiding a profile prevents new direct requests, while existing requests remain usable.
create or replace function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if operation='request' and nullif(payload->>'office_id','') is null then
  target:=nullif(payload->>'planner_id','')::uuid;
  perform 1 from private.planner_directory where user_id=target for update;
  if exists(select 1 from private.planner_directory where user_id=target and not self_map_visible)
   and not exists(select 1 from private.consultations where customer_id=auth.uid() and planner_id=target and request_key=(payload->>'request_key')::uuid) then raise exception 'expert_not_visible';end if;
 end if;
 return public.consultation_command_before_settings(operation,payload);
end$$;
create or replace function public.planner_catalog(area text default '',wanted text default '') returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('planners',coalesce(jsonb_agg(p||jsonb_build_object('region',coalesce(a.primary_area,p->>'region')) order by ord),'[]'))
 from jsonb_array_elements(public.planner_catalog_before_settings('',wanted)->'planners') with ordinality entry(p,ord)
 join private.planner_directory d on d.user_id=(p->>'id')::uuid left join private.expert_service_areas a on a.user_id=d.user_id
 where d.self_map_visible and (coalesce(area,'')='' or coalesce(a.primary_area,p->>'region') like area||'%' or exists(select 1 from unnest(a.secondary_areas) x where x like area||'%'))
$$;
revoke all on function public.expert_settings(text,jsonb),public.urgent_command(text,jsonb),public.consultation_command(text,jsonb),public.planner_catalog(text,text) from public,anon,authenticated;
grant execute on function public.expert_settings(text,jsonb),public.urgent_command(text,jsonb),public.consultation_command(text,jsonb) to authenticated;
grant execute on function public.planner_catalog(text,text) to anon,authenticated;
commit;
