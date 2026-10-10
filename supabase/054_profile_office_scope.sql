begin;
create table if not exists private.profile_scope_backup(name text primary key,definition text not null);
alter table private.profile_scope_backup enable row level security;
revoke all on private.profile_scope_backup from public,anon,authenticated;
insert into private.profile_scope_backup select x,pg_get_functiondef(to_regprocedure(x)) from unnest(array['public.expert_optional_profile(text,jsonb)','public.planner_catalog(text,text)']) x on conflict do nothing;
do $$begin
 if to_regprocedure('public.expert_optional_profile_before_office_scope(text,jsonb)') is null then alter function public.expert_optional_profile(text,jsonb) rename to expert_optional_profile_before_office_scope;end if;
 if to_regprocedure('public.planner_catalog_before_office_scope(text,text)') is null then alter function public.planner_catalog(text,text) rename to planner_catalog_before_office_scope;end if;
end$$;
revoke all on function public.expert_optional_profile_before_office_scope(text,jsonb),public.planner_catalog_before_office_scope(text,text) from public,anon,authenticated;

create or replace function private.profile_office_scope(profile jsonb) returns jsonb language sql immutable set search_path='' as $$
 select profile||jsonb_build_object('help_tasks',coalesce((select jsonb_agg(t) from jsonb_array_elements(coalesce(profile->'help_tasks','[]')) t where t<>'"office_consultation"'::jsonb or exists(select 1 from jsonb_array_elements(coalesce(profile->'offices','[]')) o where o->>'available'='true')),'[]'))
$$;
revoke all on function private.profile_office_scope(jsonb) from public,anon,authenticated;
create or replace function public.expert_optional_profile(operation text default 'get',payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if operation='save' and coalesce(payload->'help_tasks','[]') ? 'office_consultation' and not exists(select 1 from jsonb_array_elements(private.profile_offices(auth.uid())) o where o->>'available'='true') then raise exception 'office_operator_required';end if;
 return private.profile_office_scope(public.expert_optional_profile_before_office_scope(operation,payload));
end$$;
create or replace function public.planner_catalog(area text default '',wanted text default '') returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('planners',coalesce(jsonb_agg(private.profile_office_scope(p) order by ord),'[]')) from jsonb_array_elements(public.planner_catalog_before_office_scope(area,wanted)->'planners') with ordinality as entry(p,ord)
$$;
revoke all on function public.expert_optional_profile(text,jsonb),public.planner_catalog(text,text) from public,anon,authenticated;
grant execute on function public.expert_optional_profile(text,jsonb) to authenticated;
grant execute on function public.planner_catalog(text,text) to anon,authenticated;
commit;
