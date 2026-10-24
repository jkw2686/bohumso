begin;
create table if not exists private.expert_map_preferences(user_id uuid primary key references auth.users(id) on delete cascade,enabled boolean not null default true,updated_at timestamptz not null default now());
alter table private.expert_map_preferences enable row level security;
revoke all on private.expert_map_preferences from public,anon,authenticated;
create or replace function public.expert_map_visibility(operation text default 'get',enabled boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();allowed boolean;value boolean;
begin
 if actor is null then raise exception 'login_required';end if;
 select private.planner_eligible(actor) into allowed;
 if operation='set' then
  if not allowed or enabled is null then raise exception 'expert_approval_required';end if;
  insert into private.expert_map_preferences(user_id,enabled) values(actor,enabled) on conflict(user_id) do update set enabled=excluded.enabled,updated_at=now();
 elsif operation<>'get' then raise exception 'invalid_operation';end if;
 select coalesce((select p.enabled from private.expert_map_preferences p where p.user_id=actor),true) into value;
 return jsonb_build_object('enabled',allowed and value,'can_change',allowed);
end$$;
revoke all on function public.expert_map_visibility(text,boolean) from public,anon;
grant execute on function public.expert_map_visibility(text,boolean) to authenticated;
do $$begin
 if to_regprocedure('public.planner_catalog_before_map_preferences(text,text)') is null then alter function public.planner_catalog(text,text) rename to planner_catalog_before_map_preferences;end if;
end$$;
revoke all on function public.planner_catalog_before_map_preferences(text,text) from public,anon,authenticated;
create or replace function public.planner_catalog(area text default '',wanted text default '') returns jsonb language sql stable security definer set search_path='' as $$
 select b||jsonb_build_object('planners',coalesce((select jsonb_agg(p) from jsonb_array_elements(b->'planners') p where not exists(select 1 from private.expert_map_preferences v where v.user_id=(p->>'id')::uuid and not v.enabled)),'[]'::jsonb)) from (select public.planner_catalog_before_map_preferences(area,wanted) b) q
$$;
revoke all on function public.planner_catalog(text,text) from public;
grant execute on function public.planner_catalog(text,text) to anon,authenticated;
commit;
