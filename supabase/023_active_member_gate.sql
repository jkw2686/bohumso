begin;
create or replace function private.is_active_member() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.users u join public.member_profiles p on p.user_id=u.id join public.member_consents c on c.user_id=u.id where u.id=auth.uid() and u.email_confirmed_at is not null and c.version<>'')
$$;
revoke all on function private.is_active_member() from public,anon,authenticated;
create or replace function public.my_membership() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('member',private.is_active_member(),'admin',private.is_admin(),
 'partner_status',(select status from public.partner_applications where user_id=auth.uid()),
 'profession',(select profession from public.partner_applications where user_id=auth.uid()))
$$;
-- Offices stay planned until an operator explicitly registers a real operating location.
create table private.office_locations(id text primary key, name text not null, region text not null, status text not null default 'planned' check(status in ('planned','active','closed')));
revoke all on private.office_locations from public,anon,authenticated;
alter table private.office_locations enable row level security;
create function public.office_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'region',region,'status',status)),'[]'::jsonb) from private.office_locations
$$;
revoke all on function public.office_catalog() from public;
grant execute on function public.office_catalog() to anon,authenticated;
alter table private.consultations add column office_id text references private.office_locations(id);
alter function public.consultation_command(text,jsonb) rename to consultation_command_member_v1;
revoke all on function public.consultation_command_member_v1(text,jsonb) from public,anon,authenticated;
create function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare office private.office_locations; result jsonb;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 -- No verified visit capability/calendar exists yet. Do not promise unsupported visits.
 if operation='request' and payload->>'method'='nearby' then raise exception 'visit_not_available';end if;
 if operation='request' and payload ? 'office_id' then
  select * into office from private.office_locations where id=payload->>'office_id';
  if office.id is null or office.status<>'active' then raise exception 'office_not_active';end if;
  payload:=payload||jsonb_build_object('region',office.region,'office_assignment',true,'method','scheduled');
 end if;
 result:=public.consultation_command_member_v1(operation,payload);
 if operation='request' and office.id is not null then update private.consultations set office_id=office.id where id=(result->>'id')::uuid and customer_id=auth.uid();end if;
 return result;
end $$;
revoke all on function public.consultation_command(text,jsonb) from public,anon;
grant execute on function public.consultation_command(text,jsonb) to authenticated;
alter function public.consultation_workspace(text) rename to consultation_workspace_member_v1;
revoke all on function public.consultation_workspace_member_v1(text) from public,anon,authenticated;
create function public.consultation_workspace(workspace text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if workspace='partner' and not private.planner_eligible(auth.uid()) then raise exception 'request_forbidden';end if;
 return public.consultation_workspace_member_v1(workspace);
end $$;
revoke all on function public.consultation_workspace(text) from public,anon;
grant execute on function public.consultation_workspace(text) to authenticated;
commit;
