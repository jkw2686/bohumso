begin;
select pg_advisory_xact_lock(700070);
-- Proposed migration only. No member, booking, notification or approval is backfilled.
alter table private.instant_availability add column if not exists position_checked_at timestamptz;
alter table private.organization_roster add column if not exists applicant_name text;
alter table private.office_locations add column if not exists accepting_reservations boolean not null default true;
alter table private.office_locations add column if not exists management_revision integer not null default 1;
create table if not exists private.tax_office_verifications(
 user_id uuid primary key references auth.users(id),address text not null,
 latitude double precision not null check(latitude between 33 and 39),longitude double precision not null check(longitude between 124 and 132),
 verified_by uuid not null references auth.users(id),verified_at timestamptz not null default now(),reason text not null check(length(reason) between 5 and 1000));
alter table private.tax_office_verifications enable row level security;
revoke all on private.tax_office_verifications from public,anon,authenticated;
do $$begin
 if to_regprocedure('public.urgent_command_before_management(text,jsonb)') is null then alter function public.urgent_command(text,jsonb) rename to urgent_command_before_management;end if;
 if to_regprocedure('public.early_expert_review_before_management(text,jsonb)') is null then alter function public.early_expert_review(text,jsonb) rename to early_expert_review_before_management;end if;
 if to_regprocedure('public.expert_roster_command_before_management(text,jsonb)') is null then alter function public.expert_roster_command(text,jsonb) rename to expert_roster_command_before_management;end if;
 if to_regprocedure('public.planner_catalog_before_management(text,text)') is null then alter function public.planner_catalog(text,text) rename to planner_catalog_before_management;end if;
end$$;
revoke all on function public.urgent_command_before_management(text,jsonb),public.early_expert_review_before_management(text,jsonb),public.expert_roster_command_before_management(text,jsonb),public.planner_catalog_before_management(text,text) from public,anon,authenticated;
create or replace function public.urgent_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;lat double precision;lng double precision;acc double precision;begin
 if operation='update_location' then
  perform private.require_booking_access();
  if not private.urgent_eligible(auth.uid()) or not exists(select 1 from private.expert_service_areas where user_id=auth.uid()) then raise exception 'expert_verification_required';end if;
  if payload->>'consent' is distinct from 'true' then raise exception 'location_consent_required';end if;
  lat:=(payload->>'latitude')::double precision;lng:=(payload->>'longitude')::double precision;acc:=(payload->>'accuracy')::double precision;
  if lat is null or lng is null or acc is null or not(lat between 33 and 39 and lng between 124 and 132 and acc between 0 and 3000) then raise exception 'invalid_location';end if;
  insert into private.instant_availability(user_id,enabled,started_at,expires_at,latitude,longitude,accuracy,updated_at,consent_at,visit_consent_version,position_checked_at)
  values(auth.uid(),false,now(),now(),lat,lng,acc,now(),now(),'expert-visit-v1',now())
  on conflict(user_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,accuracy=excluded.accuracy,updated_at=now(),position_checked_at=now(),consent_at=now(),visit_consent_version='expert-visit-v1';
  return jsonb_build_object('saved',true,'position_checked_at',now());
 end if;
 result:=public.urgent_command_before_management(operation,payload);
 if operation in('start','refresh_location','stop') then update private.instant_availability set position_checked_at=case when operation='stop' then null else now() end where user_id=auth.uid();end if;
 if operation='settings' then result:=result||jsonb_build_object('manualLocationUpdate',true,'position_checked_at',(select position_checked_at from private.instant_availability where user_id=auth.uid() and latitude is not null));end if;
 return result;
end$$;
-- Contact matching remains evidence only. The final approval is blocked on a
-- conflicting/missing name, conflicting organization or expired roster.
create or replace function public.expert_roster_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if not private.is_admin() then raise exception 'admin_required';end if;
 if operation in('add','confirm_name') and length(trim(coalesce(payload->>'applicant_name',''))) not between 2 and 60 then raise exception 'roster_name_required';end if;
 if operation='confirm_name' then
  if length(trim(coalesce(payload->>'reason',''))) not between 5 and 1000 then raise exception 'evidence_required';end if;
  update private.organization_roster set applicant_name=trim(payload->>'applicant_name') where id=(payload->>'id')::uuid and expires_at>now() and applicant_name is null;
  if not found then raise exception 'roster_name_already_set_or_expired';end if;
  insert into private.expert_verification_events(subject,actor,action,reason) values(auth.uid(),auth.uid(),'ROSTER_NAME_CONFIRMED',payload->>'reason');
  return jsonb_build_object('saved',true);
 end if;
 result:=public.expert_roster_command_before_management(operation,payload);
 if operation='add' then update private.organization_roster set applicant_name=trim(payload->>'applicant_name') where id=(result->>'id')::uuid;end if;
 if operation='list' then select coalesce(jsonb_agg(x||jsonb_build_object('applicant_name',r.applicant_name)),'[]') into result from jsonb_array_elements(result) x left join private.organization_roster r on r.id=(x->>'id')::uuid;end if;
 return result;
end$$;
create or replace function private.roster_identity_check(subject uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare p private.expert_profiles;r private.organization_roster;begin
 select * into p from private.expert_profiles where user_id=subject;
 if p.profession is distinct from 'planner' or p.roster_id is null then return 'NOT_APPLICABLE';end if;
 select * into r from private.organization_roster where id=p.roster_id;
 if r.id is null or r.expires_at<=now() then return 'EXPIRED';end if;
 if nullif(trim(r.applicant_name),'') is null then return 'NAME_REQUIRED';end if;
 if regexp_replace(trim(p.display_name),'\s','','g')<>regexp_replace(trim(r.applicant_name),'\s','','g') then return 'NAME_CONFLICT';end if;
 if lower(regexp_replace(trim(p.organization),'\s','','g'))<>lower(regexp_replace(trim(r.organization),'\s','','g')) then return 'ORGANIZATION_CONFLICT';end if;
 return 'MATCHED';
end$$;
revoke all on function private.roster_identity_check(uuid) from public,anon,authenticated;
create or replace function public.early_expert_review(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;p private.expert_profiles;target uuid:=(payload->>'user_id')::uuid;check_result text;begin
 if not private.is_admin() then raise exception 'admin_required';end if;
 if operation='verify_tax_office' then
  if target=auth.uid() then raise exception 'self_review_forbidden';end if;
  select * into p from private.expert_profiles where user_id=target and profession='tax' for update;
  if p.user_id is null then raise exception 'request_forbidden';end if;
  if nullif(trim(p.office_address),'') is null or payload->>'address' is distinct from p.office_address then raise exception 'office_address_changed';end if;
  insert into private.tax_office_verifications(user_id,address,latitude,longitude,verified_by,reason)
  values(target,p.office_address,(payload->>'latitude')::double precision,(payload->>'longitude')::double precision,auth.uid(),trim(payload->>'reason'))
  on conflict(user_id) do update set address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,verified_by=excluded.verified_by,verified_at=now(),reason=excluded.reason;
  insert into private.expert_verification_events(subject,actor,action,reason) values(target,auth.uid(),'TAX_OFFICE_COORDINATES_VERIFIED',trim(payload->>'reason'));
  return jsonb_build_object('saved',true);
 end if;
 if operation='approve' and coalesce(payload->>'profession','')<>'office' then
  -- Trigger the existing verified-contact matching before checking its evidence.
  update private.expert_profiles set updated_at=updated_at where user_id=target and profession='planner' and organization_status='NOT_SUBMITTED' and status not in('APPROVED','SUSPENDED','REJECTED');
  perform 1 from private.expert_profiles where user_id=target for update;
  perform 1 from private.organization_roster where id=(select roster_id from private.expert_profiles where user_id=target) for share;
  check_result:=private.roster_identity_check(target);
  if check_result not in('NOT_APPLICABLE','MATCHED') then raise exception 'roster_identity_review_required:%',check_result;end if;
 end if;
 result:=public.early_expert_review_before_management(operation,payload);
 if operation='list' then select coalesce(jsonb_agg(x||jsonb_build_object('roster_identity_check',case when x->>'profession'='planner' then private.roster_identity_check((x->>'user_id')::uuid) else 'NOT_APPLICABLE' end)),'[]') into result from jsonb_array_elements(result) x;end if;
 return result;
end$$;
create or replace function public.planner_catalog(area text default '',wanted text default '') returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('planners',coalesce(jsonb_agg(case when p->>'profession'='tax' then p||jsonb_build_object('office_coordinates_verified',v.user_id is not null,'latitude',case when v.user_id is not null then v.latitude else (p->>'latitude')::double precision end,'longitude',case when v.user_id is not null then v.longitude else (p->>'longitude')::double precision end,'office_latitude',v.latitude,'office_longitude',v.longitude) else p end),'[]'))
 from jsonb_array_elements(public.planner_catalog_before_management(area,wanted)->'planners') p
 left join private.expert_profiles e on e.user_id=(p->>'id')::uuid
 left join private.tax_office_verifications v on v.user_id=e.user_id and v.address=e.office_address
$$;
do $$begin
 if to_regprocedure('public.expert_profile_command_before_management(text,jsonb)') is null then alter function public.expert_profile_command(text,jsonb) rename to expert_profile_command_before_management;end if;
end$$;
revoke all on function public.expert_profile_command_before_management(text,jsonb) from public,anon,authenticated;
create or replace function public.expert_profile_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;checked timestamptz;begin
 result:=public.expert_profile_command_before_management(operation,payload);
 if operation='get' and result->'profile'->>'profession'='tax' then
  select v.verified_at into checked from private.tax_office_verifications v join private.expert_profiles p on p.user_id=v.user_id and p.office_address=v.address where v.user_id=auth.uid();
  result:=jsonb_set(result,'{profile}',(result->'profile')||jsonb_build_object('office_coordinates_verified',checked is not null,'office_coordinates_checked_at',checked));
 end if;return result;
end$$;
revoke all on function public.expert_profile_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.expert_profile_command(text,jsonb) to authenticated;
create or replace function public.office_management(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare o private.office_locations;result jsonb;days integer[];first_hour integer;last_hour integer;begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 select l.* into o from private.office_locations l join private.office_operator_applications a on a.office_id=l.id and a.user_id=auth.uid() and a.status='APPROVED' where l.operator_user_id=auth.uid() for update of l;
 if o.id is null then raise exception 'office_approval_required';end if;
 if operation='save' then
  if (payload->>'revision')::integer is distinct from o.management_revision then raise exception 'stale_request';end if;
  first_hour:=(payload->>'first_start_hour')::integer;last_hour:=(payload->>'last_start_hour')::integer;
  days:=array(select distinct jsonb_array_elements_text(payload->'weekdays')::integer);
  if first_hour is null or last_hour is null or first_hour<9 or last_hour>17 or first_hour>last_hour or cardinality(days)=0 or not days<@array[0,1,2,3,4,5,6] or jsonb_typeof(payload->'accepting_reservations') is distinct from 'boolean' then raise exception 'invalid_availability';end if;
  update private.office_locations set first_start_hour=first_hour,last_start_hour=last_hour,weekdays=days,accepting_reservations=(payload->>'accepting_reservations')::boolean,management_revision=management_revision+1 where id=o.id;
  insert into private.expert_verification_events(subject,actor,action,reason) values(auth.uid(),auth.uid(),'OFFICE_SETTINGS_CHANGED','운영시간·신규 예약 접수 설정 변경');
 elsif operation='assign' then
  if not exists(select 1 from private.consultations where id=(payload->>'id')::uuid and office_id=o.id and planner_id is null) then raise exception 'request_forbidden';end if;
  perform public.consultation_command('office_assign',payload);
 elsif operation<>'get' then raise exception 'invalid_operation';end if;
 select jsonb_build_object('office',jsonb_build_object('id',id,'name',name,'address',address,'weekdays',weekdays,'first_start_hour',first_start_hour,'last_start_hour',last_start_hour,'accepting_reservations',accepting_reservations,'revision',management_revision),
 'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'state',c.state,'preferred_at',c.preferred_at,'method',c.method,'revision',c.revision,'assigned',c.planner_id is not null,'expert_name',(select full_name from public.partner_applications where user_id=c.planner_id),'mine',c.planner_id=auth.uid()) order by c.preferred_at) from private.consultations c where c.office_id=o.id),'[]')) into result from private.office_locations where id=o.id;
 return result;
end$$;
-- An approved operator may assign only their own office request. The existing
-- office_assign implementation still validates revision, expert and slot.
create or replace function private.owns_approved_office(office text) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_member() and exists(select 1 from private.office_locations l join private.office_operator_applications a on a.office_id=l.id and a.user_id=l.operator_user_id where l.id=office and l.operator_user_id=auth.uid() and a.status='APPROVED')
$$;
revoke all on function private.owns_approved_office(text) from public,anon,authenticated;
do $$declare r record;d text;needle text;begin
 needle:='elsif operation=''office_assign'' then'||chr(10)||'  if not private.is_admin() then raise exception ''admin_required'';end if;';
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'consultation_command%' loop
 d:=replace(pg_get_functiondef(r.oid),chr(13),'');
 -- Normalize indentation only at the exact existing assignment guard.
 d:=regexp_replace(d,'elsif operation=''office_assign'' then[[:space:]]+if not private\.is_admin\(\) then raise exception ''admin_required'';end if;',needle,'g');
 if position(needle in d)>0 then
 d:=replace(d,needle,'elsif operation=''office_assign'' then'||chr(10)||'  if not private.is_admin() and not private.owns_approved_office((select requested.office_id from private.consultations requested where requested.id=(payload->>''id'')::uuid)) then raise exception ''admin_required'';end if;');execute d;
 end if;
 if position('if operation in (''propose'',''office_assign'',''confirm'',''office_confirm'',''accept'') then' in d)>0 then
 d:=replace(d,'c.customer_id=auth.uid() or c.planner_id=auth.uid() or private.is_admin()) then raise exception ''request_forbidden'';', 'c.customer_id=auth.uid() or c.planner_id=auth.uid() or private.is_admin() or (operation=''office_assign'' and private.owns_approved_office(c.office_id))) then raise exception ''request_forbidden'';');execute d;
 end if;
 end loop;
end$$;
do $$begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'consultation_command%' and position('if not private.is_admin() and not private.owns_approved_office' in p.prosrc)>0)
 or not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'consultation_command%' and position('operation=''office_assign'' and private.owns_approved_office(c.office_id)' in p.prosrc)>0) then raise exception 'office_assignment_definition_review_required';end if;
end$$;
-- Scope changes are explicit: approved owner can see summaries for their office.
-- Assignment/acceptance/confirmation remain on their existing authorized paths.
do $$begin
 if to_regprocedure('private.check_reservation_slot_before_management(uuid,text,timestamptz,uuid,text)') is null then alter function private.check_reservation_slot(uuid,text,timestamptz,uuid,text) rename to check_reservation_slot_before_management;end if;
end$$;
create or replace function private.check_reservation_slot(planner uuid,office text,stamp timestamptz,exclude_id uuid default null,consultation_method text default 'scheduled') returns void language plpgsql security definer set search_path='' as $$begin
 if exclude_id is null and office is not null and exists(select 1 from private.office_locations where id=office and not accepting_reservations) then raise exception 'office_booking_paused';end if;
 perform private.check_reservation_slot_before_management(planner,office,stamp,exclude_id,consultation_method);
end$$;
revoke all on function private.check_reservation_slot_before_management(uuid,text,timestamptz,uuid,text),private.check_reservation_slot(uuid,text,timestamptz,uuid,text) from public,anon,authenticated;
revoke all on function public.urgent_command(text,jsonb),public.expert_roster_command(text,jsonb),public.early_expert_review(text,jsonb),public.office_management(text,jsonb),public.planner_catalog(text,text) from public,anon,authenticated;
grant execute on function public.urgent_command(text,jsonb),public.expert_roster_command(text,jsonb),public.early_expert_review(text,jsonb),public.office_management(text,jsonb) to authenticated;
grant execute on function public.planner_catalog(text,text) to anon,authenticated;

-- Route only the operator's own office summary; preserve customer/expert routes.
do $$begin
 if to_regprocedure('public.notification_reservation_before_management(uuid)') is null then alter function public.notification_reservation(uuid) rename to notification_reservation_before_management;end if;
end$$;
revoke all on function public.notification_reservation_before_management(uuid) from public,anon,authenticated;
create or replace function public.notification_reservation(reservation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 begin result:=public.notification_reservation_before_management(reservation_id);
 exception when raise_exception then if sqlerrm<>'reservation_not_found' then raise;end if;end;
 if (result is null or result->>'workspace' is null) and exists(select 1 from private.consultations c where c.id=reservation_id and private.owns_approved_office(c.office_id)) then
  return jsonb_build_object('id',reservation_id,'workspace','/partner.html');
 end if;
 if result is null then raise exception 'reservation_not_found';end if;return result;
end$$;
revoke all on function public.notification_reservation(uuid) from public,anon,authenticated;
grant execute on function public.notification_reservation(uuid) to authenticated;
-- Existing queue/dedupe/preferences are unchanged. An approved owner is a
-- recipient for unassigned requests; fallback admins are used only if no staff/owner.
do $$declare d text;old text;replacement text;begin
 d:=pg_get_functiondef('private.booking_notice(private.consultations,text,text,uuid,uuid)'::regprocedure);
 old:='(select array_agg(user_id) from private.office_staff where office_id=c.office_id)';
 replacement:='(select array_agg(user_id) from (select user_id from private.office_staff where office_id=c.office_id union select a.user_id from private.office_operator_applications a join private.office_locations l on l.id=a.office_id and l.operator_user_id=a.user_id where a.office_id=c.office_id and a.status=''APPROVED'') responsible)';
 if position(old in d)>0 then execute replace(d,old,replacement);
 elsif position('responsible' in d)=0 then raise exception 'office_notification_definition_review_required';end if;
end$$;
commit;
