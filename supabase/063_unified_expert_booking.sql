-- Reuses consultations and appointment care; no historical times are rewritten.
begin;
select pg_advisory_xact_lock(630063);
alter table private.consultations add column if not exists integration_details jsonb;
do $$begin
 if to_regprocedure('public.catalog_before_integration(text,text)') is null then alter function public.planner_catalog(text,text) rename to catalog_before_integration;end if;
 if to_regprocedure('public.command_before_integration(text,jsonb)') is null then alter function public.consultation_command(text,jsonb) rename to command_before_integration;end if;
 if to_regprocedure('public.workspace_before_integration(text)') is null then alter function public.consultation_workspace(text) rename to workspace_before_integration;end if;
 if to_regprocedure('private.slot_before_integration(uuid,text,timestamptz,uuid,text)') is null then alter function private.check_reservation_slot(uuid,text,timestamptz,uuid,text) rename to slot_before_integration;end if;
end$$;
create or replace function public.expert_consultation_settings(operation text default 'get',payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.expert_profiles; modes text[]; fee jsonb; opts jsonb;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 select * into p from private.expert_profiles where user_id=auth.uid() for update;
 if p.user_id is null or p.status in ('REJECTED','SUSPENDED') then raise exception 'expert_required';end if;
 if operation='save' then
  if not exists(select 1 from private.expert_integration_settings where unified_booking) then raise exception 'integration_disabled';end if;
  if (payload->>'revision')::integer is distinct from (p.consultation_options->>'revision')::integer then raise exception 'stale_record';end if;
  modes:=array(select distinct jsonb_array_elements_text(coalesce(payload->'modes','[]')));
  if not modes<@array['expert_office','insurance_office','expert_visit'] then raise exception 'invalid_options';end if;
  if 'expert_office'=any(modes) and length(trim(coalesce(payload->>'office_address',''))) not between 5 and 200 then raise exception 'address_required';end if;
  if 'insurance_office'=any(modes) and not exists(select 1 from jsonb_array_elements(private.profile_offices(auth.uid())) o where o->>'available'='true') then raise exception 'office_operator_required';end if;
  if p.profession='tax' then
   fee:=payload->'fee';
   if fee->>'status' is null or fee->>'status' not in ('free','paid','check') then raise exception 'fee_required';end if;
   if fee->>'status'='paid' and (coalesce(fee->>'amount','')!~'^[1-9][0-9]{0,7}$' or length(trim(coalesce(fee->>'scope','')))=0 or length(trim(coalesce(fee->>'extra','')))=0 or length(trim(coalesce(fee->>'tax_note','')))=0) then raise exception 'fee_required';end if;
   if length(coalesce(fee->>'scope',''))>300 or length(coalesce(fee->>'extra',''))>300 or length(coalesce(fee->>'tax_note',''))>120 then raise exception 'invalid_options';end if;
   fee:=jsonb_build_object('status',fee->>'status','amount',case when fee->>'status'='paid' then (fee->>'amount')::integer else null end,'minutes',60,'scope',coalesce(fee->>'scope',''),'extra',coalesce(fee->>'extra',''),'tax_note',coalesce(fee->>'tax_note',''));
  else fee:='null';end if;
  opts:=jsonb_build_object('modes',modes,'office_address',case when 'expert_office'=any(modes) then trim(payload->>'office_address') else '' end,'fee',fee,'revision',(p.consultation_options->>'revision')::integer+1);
  update private.expert_profiles set consultation_options=opts where user_id=auth.uid();
 elsif operation<>'get' then raise exception 'invalid_operation';end if;
 return (select consultation_options||jsonb_build_object('profession',profession,'offices',private.profile_offices(user_id)) from private.expert_profiles where user_id=auth.uid());
end$$;

create or replace function public.planner_catalog(area text default '',wanted text default '') returns jsonb language sql stable security definer set search_path='' as $$
 with base as (select p,ord from jsonb_array_elements(public.catalog_before_integration(area,wanted)->'planners') with ordinality q(p,ord) where coalesce(p->>'profession','planner')<>'tax' and not exists(select 1 from private.expert_profiles e where e.user_id=(p->>'id')::uuid and e.profession='tax')),
 people as (
 select p,ord from base
 union all
 select jsonb_build_object('id',e.user_id,'name',e.display_name,'organization',a.organization,'region',e.primary_area,'profession','tax','specialties',e.specialties,'insurance_types','[]'::jsonb,'help_tasks',e.tax_help_tasks,'biography',d.biography,'photo_url',d.photo_url,'available',d.available and not private.appointment_blocked(e.user_id,'expert'),'newRequestsRestricted',private.appointment_blocked(e.user_id,'expert'),'verified',true,'is_sample',d.is_sample,'area_latitude',s.latitude,'area_longitude',s.longitude,'offices',private.profile_offices(e.user_id)),1000000
 from private.expert_profiles e join private.planner_directory d on d.user_id=e.user_id join public.partner_applications a on a.user_id=e.user_id join private.service_areas s on s.id=e.primary_area
 where e.profession='tax' and private.planner_eligible(e.user_id) and (area='' or e.primary_area like area||'%') and wanted in ('','other','tax','inheritance_tax','business_tax')
 )
 select jsonb_build_object('planners',coalesce(jsonb_agg(p||jsonb_build_object('profession',coalesce(e.profession,p->>'profession','planner'),'consultation_options',case when (select unified_booking from private.expert_integration_settings where id) then e.consultation_options else null end) order by ord,p->>'name'),'[]'))
 from people left join private.expert_profiles e on e.user_id=(p->>'id')::uuid
$$;

create or replace function private.check_reservation_slot(planner uuid,office text,stamp timestamptz,exclude_id uuid default null,consultation_method text default 'scheduled') returns void language plpgsql security definer set search_path='' as $$
declare c private.consultations; local_stamp timestamp:=stamp at time zone 'Asia/Seoul';
begin
 select * into c from private.consultations where id=exclude_id;
 if c.integration_details is not null and (stamp is distinct from c.preferred_at or consultation_method is distinct from c.method) and
 (consultation_method<>'scheduled' or extract(minute from local_stamp)<>0 or local_stamp::time<time '09:00' or local_stamp::time>time '17:00') then raise exception 'invalid_slot';end if;
 perform private.slot_before_integration(planner,office,stamp,exclude_id,consultation_method);
end$$;

create or replace function private.integration_selection(target uuid,office text,mode text,stamp timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.expert_profiles; o private.office_locations; local_stamp timestamp:=stamp at time zone 'Asia/Seoul';
begin
 if not exists(select 1 from private.expert_integration_settings where unified_booking) then raise exception 'integration_disabled';end if;
 select * into p from private.expert_profiles where user_id=target;
 if not private.planner_eligible(target) or not exists(select 1 from private.planner_directory where user_id=target and available and not is_sample) then raise exception 'invalid_partner';end if;
 if mode is null or not coalesce(p.consultation_options->'modes' ? mode,false) then raise exception 'invalid_method';end if;
 if private.appointment_blocked(target,'expert') then raise exception 'new_appointments_restricted';end if;
 if stamp is null or extract(minute from local_stamp)<>0 or local_stamp::time<time '09:00' or local_stamp::time>time '17:00' then raise exception 'invalid_slot';end if;
 if mode='insurance_office' then
  select * into o from private.office_locations where id=office and operator_user_id=target;
  if o.id is null then raise exception 'office_relation_required';end if;
 elsif office is not null then raise exception 'invalid_method';end if;
 perform private.check_reservation_slot(target,office,stamp,null,'scheduled');
 return jsonb_build_object('version',1,'profession',p.profession,'mode',mode,'office',office,'place',case mode when 'insurance_office' then o.address when 'expert_office' then p.consultation_options->>'office_address' else null end,
 'options_revision',p.consultation_options->'revision','fee',case when p.profession='tax' then p.consultation_options->'fee' else null end);
end$$;
create or replace function public.integration_slots(target uuid,office text default null,mode text default 'expert_office',day date default current_date) returns jsonb language plpgsql security definer set search_path='' as $$
declare hour integer; result jsonb:='[]'; stamp timestamptz;
begin
 for hour in 9..17 loop
  stamp:=(day+make_time(hour,0,0)) at time zone 'Asia/Seoul';
  begin perform private.integration_selection(target,office,mode,stamp);result:=result||jsonb_build_array(lpad(hour::text,2,'0')||':00');
  exception when raise_exception then if sqlerrm not in ('invalid_slot','reservation_slot_taken','slot_unavailable','invalid_partner','office_not_active','office_relation_required','invalid_method','integration_disabled','new_appointments_restricted') then raise;end if;
  end;
 end loop;
 return result;
end$$;

create or replace function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; options jsonb; existing private.consultations; p private.expert_profiles; target uuid; office text; stamp timestamptz; intent text;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 select * into p from private.expert_profiles where user_id=auth.uid();
 if operation='profile' and p.profession='tax' then
  if p.status<>'APPROVED' then raise exception 'expert_required';end if;
  if regexp_replace(coalesce(payload->>'phone',''),'[^0-9]','','g') !~ '^0[0-9]{8,10}$' then raise exception 'invalid_phone';end if;
  if payload->>'available' not in ('true','false') or payload->>'available' is null then raise exception 'invalid_options';end if;
  update private.planner_directory set available=(payload->>'available')::boolean,phone=regexp_replace(payload->>'phone','[^0-9]','','g') where user_id=auth.uid();
  return jsonb_build_object('saved',true);
 end if;
 if operation<>'request' or payload->>'integration' is distinct from 'true' then
  if operation='request' and exists(select 1 from private.expert_profiles where user_id=nullif(payload->>'planner_id','')::uuid and profession='tax') then raise exception 'integration_required';end if;
  return public.command_before_integration(operation,payload);
 end if;
 perform private.require_booking_access();
 perform pg_advisory_xact_lock(hashtextextended('customer:'||auth.uid()::text,33));
 if nullif(payload->>'request_key','') is null then raise exception 'request_key_required';end if;
 intent:=md5((payload-'request_key')::text);
 select * into existing from private.consultations where customer_id=auth.uid() and request_key=(payload->>'request_key')::uuid;
 if existing.id is not null then
  if existing.integration_details->>'intent' is distinct from intent then raise exception 'request_key_conflict';end if;
  return jsonb_build_object('id',existing.id,'replay',true);
 end if;
 target:=(payload->>'planner_id')::uuid;office:=nullif(payload->>'office_id','');stamp:=(payload->>'preferred_at')::timestamptz;
 if target=auth.uid() or payload->>'method' is distinct from 'scheduled' then raise exception 'invalid_method';end if;
 options:=private.integration_selection(target,office,payload->>'meeting_mode',stamp);
 if payload->>'options_revision' is distinct from options->>'options_revision' then raise exception 'conditions_changed';end if;
 if options->>'profession'='tax' and payload->>'fee_acknowledged' is distinct from 'true' then raise exception 'fee_consent_required';end if;
 result:=public.command_before_integration('request',(payload-'office_id')||jsonb_build_object('office_assignment',false));
 select * into existing from private.consultations where id=(result->>'id')::uuid for update;
 if existing.integration_details is not null or result->>'replay'='true' then raise exception 'reservation_slot_taken';end if;
 update private.consultations set office_id=office,duration_minutes=60,integration_details=options||jsonb_build_object('intent',intent,'fee_acknowledged_at',case when options->>'profession'='tax' then now() else null end) where id=existing.id;
 update private.appointment_care set terms=terms||jsonb_build_object('office',office,'place',options->>'place') where kind='consultation' and id=existing.id;
 return result;
end$$;
create or replace function public.consultation_workspace(workspace text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.workspace_before_integration(workspace);
 return result||jsonb_build_object('bookings',coalesce((select jsonb_agg(b||jsonb_build_object('integration_details',c.integration_details-'intent') order by ord) from jsonb_array_elements(result->'bookings') with ordinality q(b,ord) join private.consultations c on c.id=(b->>'id')::uuid),'[]'),
 'profile',case when result->'profile' is null then null else result->'profile'||jsonb_build_object('profession',(select profession from private.expert_profiles where user_id=auth.uid())) end);
end$$;
revoke all on function public.catalog_before_integration(text,text),public.command_before_integration(text,jsonb),public.workspace_before_integration(text),private.slot_before_integration(uuid,text,timestamptz,uuid,text),private.integration_selection(uuid,text,text,timestamptz),private.check_reservation_slot(uuid,text,timestamptz,uuid,text) from public,anon,authenticated;
revoke all on function public.expert_consultation_settings(text,jsonb),public.planner_catalog(text,text),public.integration_slots(uuid,text,text,date),public.consultation_command(text,jsonb),public.consultation_workspace(text) from public,anon,authenticated;
grant execute on function public.planner_catalog(text,text),public.integration_slots(uuid,text,text,date) to anon,authenticated;
grant execute on function public.expert_consultation_settings(text,jsonb),public.consultation_command(text,jsonb),public.consultation_workspace(text) to authenticated;
commit;
