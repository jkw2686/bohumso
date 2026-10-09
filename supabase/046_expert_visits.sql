begin;
select pg_advisory_xact_lock(460046);
create table if not exists private.expert_visit_migration_backup(id boolean primary key default true,created_at timestamptz not null default now(),urgent_definition text not null,planner_definition text not null,slot_definition text not null);
alter table private.expert_visit_migration_backup enable row level security;
revoke all on private.expert_visit_migration_backup from public,anon,authenticated;
insert into private.expert_visit_migration_backup(id,urgent_definition,planner_definition,slot_definition) values(true,pg_get_functiondef('public.urgent_command(text,jsonb)'::regprocedure),pg_get_functiondef('public.planner_catalog(text,text)'::regprocedure),pg_get_functiondef('private.check_reservation_slot(uuid,text,timestamptz,uuid,text)'::regprocedure)) on conflict(id) do nothing;
-- Reuse urgent_requests for expert visits; consultations.office_id remains branch visits.
-- No existing rows, approval rules, contact verification or office functions are replaced.
alter table private.urgent_requests add column if not exists meeting_kind text;
alter table private.urgent_requests add column if not exists preferred_at timestamptz;
alter table private.urgent_requests add column if not exists confirmed_at timestamptz;
alter table private.urgent_requests add column if not exists rejected_at timestamptz;
alter table private.instant_availability add column if not exists visit_consent_version text;
do $$begin
 if to_regprocedure('public.urgent_command_before_visits(text,jsonb)') is null then
  alter function public.urgent_command(text,jsonb) rename to urgent_command_before_visits;
 end if;
end $$;
revoke all on function public.urgent_command_before_visits(text,jsonb) from public,anon,authenticated;
create or replace function private.visit_config() returns jsonb language sql immutable set search_path='' as $$
 select '{"freshMinutes":10,"expireMinutes":30,"availabilityMinutes":240,"radiusKm":30}'::jsonb
$$;
create or replace function private.visit_available(subject uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.urgent_eligible(subject) and exists(select 1 from private.instant_availability i where i.user_id=subject and i.enabled and i.expires_at>now() and i.consent_at is not null and i.visit_consent_version='expert-visit-v1' and i.latitude between 33 and 39 and i.longitude between 124 and 132 and i.accuracy between 0 and 3000 and i.updated_at>now()-make_interval(mins=>(private.visit_config()->>'expireMinutes')::int))
 and not exists(select 1 from private.urgent_requests r where r.planner_id=subject and r.state in ('ACCEPTED','PREPARING','DEPARTED','EN_ROUTE','ARRIVED') and r.ends_at>now())
$$;
-- Public output is deliberately an allowlist. GPS never leaves the server.
create or replace function public.visit_catalog(payload jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a private.service_areas; lat double precision; lng double precision; result jsonb;
begin
 select * into a from private.service_areas where id=payload->>'area';
 if a.id is null then return '[]'::jsonb;end if;
 lat:=coalesce((payload->>'latitude')::double precision,a.latitude);lng:=coalesce((payload->>'longitude')::double precision,a.longitude);
 if not(lat between 33 and 39 and lng between 124 and 132) then raise exception 'invalid_location';end if;
 select coalesce(jsonb_agg(item order by distance,id),'[]') into result from (
  select i.user_id id,private.urgent_distance(lat,lng,i.latitude,i.longitude) distance,
   jsonb_build_object('id',i.user_id,'name',coalesce(ep.display_name,p.full_name),'specialties',d.specialties,'primaryServiceArea',a.name,
    'instantAvailability',true,'distanceKm',greatest(0.1,round(private.urgent_distance(lat,lng,i.latitude,i.longitude)::numeric,1)),
    'stale',i.updated_at<=now()-make_interval(mins=>(private.visit_config()->>'freshMinutes')::int),
    'registrationVerified',coalesce(ep.registration_status='VERIFIED',false),'organizationVerified',coalesce(ep.organization_status='VERIFIED',false),
    'etaMin',greatest(5,ceil(private.urgent_distance(lat,lng,i.latitude,i.longitude)/20*60/5)::int*5),
    'etaMax',greatest(10,ceil(private.urgent_distance(lat,lng,i.latitude,i.longitude)/10*60/5)::int*5+5)) item
  from private.instant_availability i join public.partner_applications p on p.user_id=i.user_id
  join private.planner_directory d on d.user_id=i.user_id left join private.expert_profiles ep on ep.user_id=i.user_id
  where i.user_id is distinct from auth.uid() and private.visit_available(i.user_id)
   and private.urgent_distance(lat,lng,i.latitude,i.longitude)<=(private.visit_config()->>'radiusKm')::int
   and (coalesce(payload->>'specialty','')='' or private.specialty_match(payload->>'specialty',d.specialties))
 ) x;
 return result;
end $$;
create or replace function public.urgent_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=auth.uid(); a private.service_areas; r private.urgent_requests; target uuid; lat double precision; lng double precision; acc double precision; minutes int; until_at timestamptz; result jsonb; picked jsonb; wanted timestamptz;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 perform private.expire_urgent();
 if operation='catalog' then return public.visit_catalog(payload);
 elsif operation='settings' then
  result:=public.urgent_command_before_visits(operation,payload)||jsonb_build_object('visitConfig',private.visit_config());
  if not exists(select 1 from private.instant_availability where user_id=actor and visit_consent_version='expert-visit-v1') and result->'instant'<>'null'::jsonb then result:=jsonb_set(result,'{instant,enabled}','false');end if;
  return result;
 elsif operation in ('start','refresh_location') then
  perform private.require_booking_access();
  if not private.urgent_eligible(actor) or not exists(select 1 from private.expert_service_areas where user_id=actor) then raise exception 'expert_verification_required';end if;
  lat:=(payload->>'latitude')::double precision;lng:=(payload->>'longitude')::double precision;acc:=(payload->>'accuracy')::double precision;
  if lat is null or lng is null or acc is null or not(lat between 33 and 39 and lng between 124 and 132 and acc between 0 and 3000) then raise exception 'invalid_location';end if;
  if operation='refresh_location' then
   update private.instant_availability set latitude=lat,longitude=lng,accuracy=acc,updated_at=now() where user_id=actor and enabled and expires_at>now() and consent_at is not null and visit_consent_version='expert-visit-v1' returning expires_at into until_at;
   if not found then raise exception 'availability_expired';end if;
  else
   if payload->>'consent' is distinct from 'true' then raise exception 'location_consent_required';end if;
   minutes:=coalesce((payload->>'duration')::int,(private.visit_config()->>'availabilityMinutes')::int);
   if minutes not in (30,60,120,240) then raise exception 'invalid_duration';end if;
   until_at:=now()+make_interval(mins=>minutes);
   insert into private.instant_availability(user_id,enabled,started_at,expires_at,latitude,longitude,accuracy,updated_at,consent_at,visit_consent_version)
    values(actor,true,now(),until_at,lat,lng,acc,now(),now(),'expert-visit-v1') on conflict(user_id) do update set enabled=true,started_at=now(),expires_at=excluded.expires_at,latitude=excluded.latitude,longitude=excluded.longitude,accuracy=excluded.accuracy,updated_at=now(),consent_at=now(),visit_consent_version=excluded.visit_consent_version;
  end if;
  return jsonb_build_object('expires_at',until_at);
 elsif operation='request' then
  perform private.require_booking_access();
  perform 1 from public.member_profiles where user_id=actor for update;
  target:=(payload->>'planner_id')::uuid;
  if target is null or target=actor then raise exception 'select_planner';end if;
  select * into r from private.urgent_requests where customer_id=actor and request_key=(payload->>'request_key')::uuid;
  if r.id is not null then
   if not exists(select 1 from private.urgent_offers where request_id=r.id and planner_id=target) then raise exception 'request_key_conflict';end if;
   return jsonb_build_object('id',r.id,'replay',true);
  end if;
  if payload->>'consent' is distinct from 'true' then raise exception 'contact_consent_required';end if;
  if exists(select 1 from private.urgent_requests where customer_id=actor and state not in ('COMPLETED','CANCELLED','EXPIRED')) or (select count(*) from private.urgent_events e where e.actor=auth.uid() and e.event='REQUESTED' and e.created_at>now()-interval '1 hour')>=3 then raise exception 'request_limit';end if;
  select * into a from private.service_areas where id=payload->>'area';if a.id is null then raise exception 'invalid_area';end if;
  wanted:=(payload->>'preferred_at')::timestamptz;
  if wanted is null or wanted<now()+interval '15 minutes' or wanted>now()+interval '4 hours' then raise exception 'invalid_visit_time';end if;
  if coalesce(payload->>'meeting_kind','') not in ('nearby','address') then raise exception 'invalid_meeting_kind';end if;
  -- Lock the chosen expert's availability against OFF/accept. Never broadcast.
  perform 1 from private.instant_availability where user_id=target for update;
  select v into picked from jsonb_array_elements(public.visit_catalog(payload)) v where v->>'id'=target::text;
  if picked is null then raise exception 'no_available_expert';end if;
  insert into private.urgent_requests(customer_id,request_key,area_id,purpose,place,phone,note,meeting_kind,preferred_at,ends_at)
   values(actor,(payload->>'request_key')::uuid,a.id,payload->>'purpose',trim(payload->>'place'),payload->>'phone',coalesce(payload->>'note',''),payload->>'meeting_kind',wanted,wanted+interval '4 hours') returning * into r;
  insert into private.urgent_offers(request_id,planner_id,rank,distance_km) values(r.id,target,1,ceil((picked->>'distanceKm')::numeric));
  insert into private.urgent_events(request_id,actor,event) values(r.id,actor,'REQUESTED');
  return jsonb_build_object('id',r.id,'consultationMode','expert_visit');
 elsif operation='workspace' then
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'state',q.state,'confirmed',q.confirmed_at is not null,'rejected',q.rejected_at is not null,'consultationMode','expert_visit','purpose',q.purpose,'region',area_ref.region||' '||area_ref.name,'distanceKm',o.distance_km,'preferredAt',q.preferred_at,'expires_at',q.expires_at,'ends_at',q.ends_at,'mine',q.customer_id=actor,'assigned',q.planner_id=actor,'expertName',p.full_name,
   'details',case when q.customer_id=actor or (q.planner_id=actor and (q.confirmed_at is not null or q.meeting_kind is null) and private.urgent_eligible(actor) and q.state not in ('CANCELLED','EXPIRED')) then jsonb_build_object('place',q.place,'phone',q.phone,'note',q.note) end,
   'timeline',(select coalesce(jsonb_agg(jsonb_build_object('state',e.event,'at',e.created_at) order by e.id),'[]') from private.urgent_events e where e.request_id=q.id)) order by q.created_at desc),'[]') into result
   from private.urgent_requests q join private.service_areas area_ref on area_ref.id=q.area_id
   left join private.urgent_offers o on o.request_id=q.id and (o.planner_id=actor or q.customer_id=actor)
   left join public.partner_applications p on p.user_id=coalesce(q.planner_id,o.planner_id)
   where q.customer_id=actor or (private.urgent_eligible(actor) and (q.planner_id=actor or (q.state='REQUESTED' and o.state='OFFERED')));
  return result;
 elsif operation='confirm_visit' then
  perform private.require_booking_access();
  select * into r from private.urgent_requests where id=(payload->>'id')::uuid for update;
  if r.customer_id is distinct from actor then raise exception 'request_forbidden';end if;
  if r.state<>'ACCEPTED' or r.preferred_at<=now() or not private.urgent_eligible(r.planner_id) then raise exception 'invalid_transition';end if;
  if payload->>'consent' is distinct from 'true' then raise exception 'contact_consent_required';end if;
  if r.confirmed_at is null then
   update private.urgent_requests set confirmed_at=now() where id=r.id;
   insert into private.urgent_events(request_id,actor,event) values(r.id,actor,'CONFIRMED');
  end if;
  return jsonb_build_object('saved',true);
 elsif operation='accept' then
  perform pg_advisory_xact_lock(hashtextextended('planner:'||actor::text,33));
  if not private.visit_available(actor) then raise exception 'availability_expired';end if;
  select * into r from private.urgent_requests where id=(payload->>'id')::uuid;
  if r.meeting_kind is not null then
   if r.preferred_at<=now() then raise exception 'invalid_visit_time';end if;
   if exists(select 1 from private.consultations c where c.planner_id=actor and c.state in ('requested','coordinating','confirmed','scheduled','awaiting_completion') and c.preferred_at<r.preferred_at+interval '60 minutes' and c.preferred_at+c.duration_minutes*interval '1 minute'>r.preferred_at) or exists(select 1 from private.followup_meetings f where f.planner_id=actor and f.state='confirmed' and f.preferred_at<r.preferred_at+interval '60 minutes' and f.preferred_at+interval '30 minutes'>r.preferred_at) then raise exception 'slot_unavailable';end if;
  end if;
  return public.urgent_command_before_visits(operation,payload);
 elsif operation='trip' then
  select * into r from private.urgent_requests where id=(payload->>'id')::uuid;
  if r.meeting_kind is not null and r.confirmed_at is null then raise exception 'customer_confirmation_required';end if;
  return public.urgent_command_before_visits(operation,payload);
 elsif operation='pass' then
  result:=public.urgent_command_before_visits(operation,payload);
  update private.urgent_requests q set state='EXPIRED',rejected_at=now(),closed_at=now() where q.id=(payload->>'id')::uuid and q.meeting_kind is not null and not exists(select 1 from private.urgent_offers o where o.request_id=q.id and o.state='OFFERED');
  if found then insert into private.urgent_events(request_id,actor,event) values((payload->>'id')::uuid,actor,'REJECTED');end if;
  return result;
 end if;
 return public.urgent_command_before_visits(operation,payload);
end $$;
revoke all on function private.visit_config(),private.visit_available(uuid),public.visit_catalog(jsonb),public.urgent_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.visit_catalog(jsonb) to anon,authenticated;
grant execute on function public.urgent_command(text,jsonb) to authenticated;
do $$begin
 if to_regprocedure('public.planner_catalog_before_visits(text,text)') is null then alter function public.planner_catalog(text,text) rename to planner_catalog_before_visits;end if;
end $$;
revoke all on function public.planner_catalog_before_visits(text,text) from public,anon,authenticated;
create or replace function public.planner_catalog(area text default '',wanted text default '') returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('planners',coalesce(jsonb_agg(p||jsonb_build_object('availability_status',case when private.visit_available((p->>'id')::uuid) then 'now' when p->>'availability_status'='now' then 'scheduled' else p->>'availability_status' end)),'[]')) from jsonb_array_elements(public.planner_catalog_before_visits(area,wanted)->'planners') p
$$;
revoke all on function public.planner_catalog(text,text) from public,anon,authenticated;
grant execute on function public.planner_catalog(text,text) to anon,authenticated;
do $$begin
 if to_regprocedure('private.check_reservation_slot_before_visits(uuid,text,timestamptz,uuid,text)') is null then alter function private.check_reservation_slot(uuid,text,timestamptz,uuid,text) rename to check_reservation_slot_before_visits;end if;
end $$;
create or replace function private.check_reservation_slot(planner uuid,office text,stamp timestamptz,exclude_id uuid default null,consultation_method text default 'scheduled') returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.check_reservation_slot_before_visits(planner,office,stamp,exclude_id,consultation_method);
 if planner is not null and exists(select 1 from private.urgent_requests r where r.planner_id=planner and r.state in ('ACCEPTED','PREPARING','DEPARTED','EN_ROUTE','ARRIVED') and r.ends_at>now() and r.preferred_at<stamp+private.reservation_duration(office,consultation_method)*interval '1 minute' and r.preferred_at+interval '60 minutes'>stamp) then raise exception 'slot_unavailable';end if;
end $$;
revoke all on function private.check_reservation_slot(uuid,text,timestamptz,uuid,text),private.check_reservation_slot_before_visits(uuid,text,timestamptz,uuid,text) from public,anon,authenticated;
commit;

