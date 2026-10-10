begin;
create table if not exists private.connection_review_backup(name text primary key,definition text not null);
alter table private.connection_review_backup enable row level security;
revoke all on private.connection_review_backup from public,anon,authenticated;
insert into private.connection_review_backup select x,pg_get_functiondef(to_regprocedure(x)) from unnest(array['public.consultation_command(text,jsonb)','public.consultation_workspace(text)']) x on conflict do nothing;
create table if not exists private.connection_review_snapshot(name text primary key,payload jsonb not null);
alter table private.connection_review_snapshot enable row level security;
revoke all on private.connection_review_snapshot from public,anon,authenticated;
insert into private.connection_review_snapshot values
 ('columns',(select jsonb_agg(to_jsonb(c)) from information_schema.columns c where table_schema in ('public','private'))),
 ('member',coalesce((select to_jsonb(m) from public.member_profiles m order by user_id limit 1),'{}')),
 ('counts',jsonb_build_object('users',(select count(*) from auth.users),'members',(select count(*) from public.member_profiles),'bookings',(select count(*) from private.consultations))) on conflict do nothing;
create table if not exists private.consultation_schedule_proposals(
 consultation_id uuid primary key references private.consultations(id),
 proposed_by uuid not null references auth.users(id),
 preferred_at timestamptz not null,
 state text not null check(state in ('pending','accepted','declined','cancelled')),
 created_at timestamptz not null default now(),resolved_at timestamptz
);
alter table private.consultation_schedule_proposals enable row level security;
revoke all on private.consultation_schedule_proposals from public,anon,authenticated;
do $$begin
 if to_regprocedure('public.consultation_command_before_connection_review(text,jsonb)') is null then alter function public.consultation_command(text,jsonb) rename to consultation_command_before_connection_review;end if;
 if to_regprocedure('public.consultation_workspace_before_connection_review(text)') is null then alter function public.consultation_workspace(text) rename to consultation_workspace_before_connection_review;end if;
end$$;
revoke all on function public.consultation_command_before_connection_review(text,jsonb),public.consultation_workspace_before_connection_review(text) from public,anon,authenticated;
create or replace function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();c private.consultations;p private.consultation_schedule_proposals;target uuid;office text;stamp timestamptz;result jsonb;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='request' then
  perform private.require_booking_access();
  perform pg_advisory_xact_lock(hashtextextended('customer:'||actor::text,33));
  target:=nullif(payload->>'planner_id','')::uuid;office:=nullif(payload->>'office_id','');stamp:=(payload->>'preferred_at')::timestamptz;
  if (target is null and office is null) or (target is not null and office is not null) or target=actor then raise exception 'select_planner';end if;
  if office is not null and payload->>'method' is distinct from 'scheduled' then raise exception 'invalid_method';end if;
  if target is not null and coalesce((payload->>'office_assignment')::boolean,false) then raise exception 'select_planner';end if;
  if nullif(payload->>'request_key','') is null then raise exception 'request_key_required';end if;
  select * into c from private.consultations where customer_id=actor and request_key=(payload->>'request_key')::uuid;
  if c.id is not null then
   if c.planner_id is distinct from target and office is null or c.office_id is distinct from office or c.preferred_at is distinct from stamp or c.method is distinct from payload->>'method' or c.purpose is distinct from payload->>'purpose' or c.region is distinct from trim(payload->>'region') then raise exception 'request_key_conflict';end if;
   if c.state in ('cancelled','completed','unmatched') then raise exception 'request_closed';end if;
   return jsonb_build_object('id',c.id,'replay',true);
  end if;
  select * into c from private.consultations where customer_id=actor and ((office is not null and office_id=office) or (office is null and office_id is null and planner_id=target)) and preferred_at=stamp and method=payload->>'method' and purpose=payload->>'purpose' and region=trim(payload->>'region') and state in ('requested','coordinating','confirmed','scheduled','awaiting_completion') order by created_at limit 1;
  if c.id is not null then return jsonb_build_object('id',c.id,'replay',true);end if;
  payload:=payload||jsonb_build_object('office_assignment',office is not null);
 end if;
 if operation in ('propose','schedule_accept','schedule_decline') then
  select * into c from private.consultations where id=(payload->>'id')::uuid for update;
  if c.id is null or not (c.customer_id=actor or coalesce(c.planner_id=actor,false)) then raise exception 'request_forbidden';end if;
  if c.revision is distinct from (payload->>'revision')::integer then raise exception 'stale_request';end if;
  if c.state not in ('requested','coordinating','confirmed','scheduled') or c.planner_id is null then raise exception 'invalid_transition';end if;
  select * into p from private.consultation_schedule_proposals where consultation_id=c.id for update;
  if operation='propose' then
   if p.state='pending' and p.proposed_by<>actor then raise exception 'schedule_pending';end if;
   stamp:=(payload->>'preferred_at')::timestamptz;
   if stamp=c.preferred_at then raise exception 'invalid_slot';end if;
   perform private.check_reservation_slot(c.planner_id,c.office_id,stamp,c.id,c.method);
   insert into private.consultation_schedule_proposals(consultation_id,proposed_by,preferred_at,state) values(c.id,actor,stamp,'pending') on conflict(consultation_id) do update set proposed_by=actor,preferred_at=stamp,state='pending',created_at=now(),resolved_at=null;
  else
   if p.state is distinct from 'pending' then raise exception 'invalid_transition';end if;
   if operation='schedule_accept' then
    if p.proposed_by=actor then raise exception 'request_forbidden';end if;
    perform private.check_reservation_slot(c.planner_id,c.office_id,p.preferred_at,c.id,c.method);
    update private.consultations set preferred_at=p.preferred_at,state=case when c.state in ('confirmed','scheduled') then 'scheduled' else 'coordinating' end,planner_ok=true,customer_ok=c.state in ('confirmed','scheduled'),journey_state=null where id=c.id;
   end if;
   update private.consultation_schedule_proposals set state=case when operation='schedule_accept' then 'accepted' else 'declined' end,resolved_at=now() where consultation_id=c.id;
  end if;
  update private.consultations set revision=revision+1,updated_at=now() where id=c.id;
  insert into private.consultation_events(consultation_id,actor,event,metadata) values(c.id,actor,operation,jsonb_build_object('previous_preferred_at',c.preferred_at,'proposed_preferred_at',case when operation='propose' then stamp else p.preferred_at end));
  return jsonb_build_object('id',c.id,'saved',true);
 end if;
 result:=public.consultation_command_before_connection_review(operation,payload);
 if operation in ('cancel','pass','complete_request','complete_confirm','resolve_issue') then update private.consultation_schedule_proposals set state='cancelled',resolved_at=now() where consultation_id=(payload->>'id')::uuid and state='pending';end if;
 return result;
end$$;
create or replace function public.consultation_workspace(workspace text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.consultation_workspace_before_connection_review(workspace);
 return result||jsonb_build_object('scheduleProposalsEnabled',true,'bookings',coalesce((select jsonb_agg(b||jsonb_build_object('office_name',o.name,'office_address',case when o.status='active' then o.address end,'schedule_proposal',case when p.state='pending' and b->>'state' in ('requested','coordinating','confirmed','scheduled') then jsonb_build_object('preferred_at',p.preferred_at,'mine',p.proposed_by=auth.uid(),'can_accept',p.proposed_by<>auth.uid() and exists(select 1 from private.consultations c where c.id=(b->>'id')::uuid and auth.uid() in (c.customer_id,c.planner_id))) else null end) order by ord) from jsonb_array_elements(result->'bookings') with ordinality entries(b,ord) left join private.office_locations o on o.id=b->>'office_id' left join private.consultation_schedule_proposals p on p.consultation_id=(b->>'id')::uuid),'[]'));
end$$;
revoke all on function public.consultation_command(text,jsonb),public.consultation_workspace(text) from public,anon,authenticated;
grant execute on function public.consultation_command(text,jsonb),public.consultation_workspace(text) to authenticated;
commit;
