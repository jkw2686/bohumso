begin;
-- Office-managed allocation: new requests contain no chosen expert or contact data.
alter table private.consultations add column allocation_mode text not null default 'direct' check(allocation_mode in ('direct','office'));
alter table private.consultations add column request_key uuid;
alter table private.consultations add column journey_state text check(journey_state in ('departed','arrived'));
create unique index consultation_request_key on private.consultations(customer_id,request_key) where request_key is not null;
alter function public.consultation_command(text,jsonb) rename to consultation_command_direct;
revoke all on function public.consultation_command_direct(text,jsonb) from public,anon,authenticated;
create function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare c private.consultations; target uuid; proposed timestamptz; id uuid; result jsonb;
begin
 if auth.uid() is null then raise exception 'membership_required';end if;
 if operation='request' and coalesce((payload->>'office_assignment')::boolean,false) then
  if not exists(select 1 from public.member_profiles where user_id=auth.uid()) then raise exception 'membership_required';end if;
  proposed:=(payload->>'preferred_at')::timestamptz;
  if proposed is null or proposed<now()+interval '30 minutes' or proposed>now()+interval '90 days' or mod(extract(epoch from proposed),1800)<>0 then raise exception 'invalid_slot';end if;
  if (proposed at time zone 'Asia/Seoul')::time < time '09:00' or (proposed at time zone 'Asia/Seoul')::time > time '18:00' then raise exception 'invalid_slot';end if;
  perform 1 from public.member_profiles where user_id=auth.uid() for update;
  select consultations.id into id from private.consultations where customer_id=auth.uid() and request_key=nullif(payload->>'request_key','')::uuid;
  if id is not null then return jsonb_build_object('id',id,'replay',true);end if;
  if (select count(*) from private.consultations where customer_id=auth.uid() and state not in ('cancelled','completed','unmatched'))>=5 then raise exception 'request_limit';end if;
  insert into private.consultations(customer_id,purpose,region,method,preferred_at,allocation_mode,customer_ok,request_key)
  values(auth.uid(),payload->>'purpose',trim(payload->>'region'),coalesce(payload->>'method','scheduled'),proposed,'office',true,nullif(payload->>'request_key','')::uuid) returning consultations.id into id;
  insert into private.consultation_events(consultation_id,actor,event) values(id,auth.uid(),'office_requested');
  return jsonb_build_object('id',id);
 elsif operation='office_assign' then
  if not private.is_admin() then raise exception 'admin_required';end if;
  id:=(payload->>'id')::uuid;target:=(payload->>'planner_id')::uuid;
  select * into c from private.consultations where consultations.id=id for update;
  if c.id is null or c.allocation_mode<>'office' or c.state not in ('requested','coordinating') or c.preferred_at<=now() then raise exception 'invalid_transition';end if;
  if c.revision is distinct from (payload->>'revision')::integer then raise exception 'stale_request';end if;
  if not private.planner_eligible(target) or target=c.customer_id or not exists(select 1 from private.planner_directory where user_id=target and available and not is_sample) then raise exception 'invalid_partner';end if;
  perform 1 from private.planner_directory where user_id=target for update;
  if exists(select 1 from private.consultations where planner_id=target and preferred_at=c.preferred_at and state in ('confirmed','scheduled','awaiting_completion')) or exists(select 1 from private.followup_meetings where planner_id=target and preferred_at=c.preferred_at and state='confirmed') then raise exception 'invalid_slot';end if;
  update private.consultations set planner_id=target,planner_ok=false,customer_ok=true,state='requested',revision=revision+1,updated_at=now() where consultations.id=id;
  insert into private.consultation_events(consultation_id,actor,event,metadata) values(id,auth.uid(),'office_assigned',jsonb_build_object('planner',target));
  return jsonb_build_object('id',id,'saved',true);
 end if;
 -- Existing direct requests and their history continue through the original API.
 id:=nullif(payload->>'id','')::uuid;
 if operation in ('accept','pass','propose','office_confirm','journey') then
  select * into c from private.consultations where consultations.id=id for update;
 end if;
 if c.allocation_mode='office' and operation in ('accept','pass') and c.planner_id is distinct from auth.uid() then raise exception 'request_forbidden';end if;
 if operation in ('office_confirm','journey') then
  if c.id is null or c.revision is distinct from (payload->>'revision')::integer then raise exception 'stale_request';end if;
  if operation='journey' then
   if c.planner_id is distinct from auth.uid() or not private.planner_eligible(auth.uid()) then raise exception 'request_forbidden';end if;
   if c.state<>'scheduled' or c.method='phone' or not (payload->>'state' in ('departed','arrived')) or payload->>'state' is null then raise exception 'invalid_transition';end if;
   if c.journey_state='arrived' and payload->>'state'='departed' then raise exception 'invalid_transition';end if;
   update private.consultations set journey_state=payload->>'state',revision=revision+1,updated_at=now() where consultations.id=id;
  else
   if c.customer_id is distinct from auth.uid() then raise exception 'request_forbidden';end if;
   if c.allocation_mode<>'office' or c.state<>'coordinating' or not c.planner_ok or c.preferred_at<=now() or not private.planner_eligible(c.planner_id) then raise exception 'invalid_transition';end if;
   perform 1 from private.planner_directory where user_id=c.planner_id for update;
   if exists(select 1 from private.followup_meetings where planner_id=c.planner_id and preferred_at=c.preferred_at and state='confirmed') then raise exception 'invalid_slot';end if;
   update private.consultations set customer_ok=true,state='scheduled',revision=revision+1,updated_at=now() where consultations.id=id;
  end if;
  insert into private.consultation_events(consultation_id,actor,event) values(id,auth.uid(),case when operation='journey' then 'journey_'||(payload->>'state') else 'office_confirm' end);
  return jsonb_build_object('id',id,'saved',true);
 end if;
 result:=public.consultation_command_direct(operation,payload);
 if operation='accept' and c.allocation_mode='office' and c.customer_ok then
  if exists(select 1 from private.followup_meetings where planner_id=c.planner_id and preferred_at=c.preferred_at and state='confirmed') then raise exception 'invalid_slot';end if;
  update private.consultations set state='scheduled' where consultations.id=id;
 end if;
 if c.allocation_mode='office' and operation='pass' then
  update private.consultations set state='requested',planner_ok=false,journey_state=null where consultations.id=id;
 elsif c.allocation_mode='office' and operation='propose' then
  update private.consultations set customer_ok=(customer_id=auth.uid()),journey_state=null where consultations.id=id;
 end if;
 return result;
end $$;
revoke all on function public.consultation_command(text,jsonb) from public,anon;
grant execute on function public.consultation_command(text,jsonb) to authenticated;
commit;
