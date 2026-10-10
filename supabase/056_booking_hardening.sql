begin;
select pg_advisory_xact_lock(hashtextextended('bohumso-booking-hardening',56));
create table if not exists private.booking_hardening_backup(name text primary key,definition text not null);
alter table private.booking_hardening_backup enable row level security;
revoke all on private.booking_hardening_backup from public,anon,authenticated;
insert into private.booking_hardening_backup select p.oid::regprocedure::text,pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='private' and proname in ('specialty_match','check_reservation_slot_before_visits','match_expert_roster')) or (n.nspname='public' and (proname like 'consultation_command%' or proname='planner_catalog')) on conflict do nothing;
create table if not exists private.booking_hardening_snapshot(name text primary key,payload jsonb);
alter table private.booking_hardening_snapshot enable row level security;
revoke all on private.booking_hardening_snapshot from public,anon,authenticated;
insert into private.booking_hardening_snapshot values
 ('schema',(select jsonb_agg(to_jsonb(c)) from information_schema.columns c where table_schema in ('public','private'))),
 ('member',(select to_jsonb(m) from public.member_profiles m order by user_id limit 1)),
 ('directory',(select jsonb_agg(jsonb_build_object('id',user_id,'specialties',specialties,'hours',hours)) from private.planner_directory)),
 ('counts',jsonb_build_object('members',(select count(*) from public.member_profiles),'bookings',(select count(*) from private.consultations))) on conflict do nothing;
create or replace function private.specialty_match(wanted text,tags text[]) returns boolean language sql immutable set search_path='' as $$
 select coalesce(wanted,'') in ('','other') or coalesce(wanted=any(tags),false)
 or (wanted='claim' and tags&&array['claim','death','critical','surgery','illness','medical','accident'])
 or (wanted in ('illness','critical') and tags&&array['critical','illness'])
 or (wanted in ('medical','surgery') and tags&&array['medical','surgery'])
 or (wanted in ('coverage','management') and tags&&array['coverage','medical','remodel','life','nonlife','management'])
 or (wanted='new' and tags&&array['life','nonlife','corporate','coverage']);
$$;
create or replace function private.check_reservation_slot_before_visits(planner uuid,office text,stamp timestamptz,exclude_id uuid default null,consultation_method text default 'scheduled') returns void language plpgsql security definer set search_path='' as $$
declare length_minutes integer:=private.reservation_duration(office,consultation_method);ep private.expert_profiles;op private.office_locations; local_stamp timestamp:=stamp at time zone 'Asia/Seoul'; existing_time boolean:=false; existing_planner boolean:=false;
begin
 select exists(select 1 from private.consultations c where c.id=exclude_id and c.preferred_at=stamp and c.method=consultation_method and c.office_id is not distinct from office and c.state in ('requested','coordinating','confirmed','scheduled','awaiting_completion')) into existing_time;
 select existing_time and exists(select 1 from private.consultations c where c.id=exclude_id and c.planner_id=planner) into existing_planner;
 if not existing_time and exclude_id is not null then
  select exists(select 1 from private.consultation_schedule_proposals s where s.consultation_id=exclude_id and s.preferred_at=stamp and s.state='pending') or exists(select 1 from private.followup_meetings f where f.consultation_id=exclude_id and f.preferred_at=stamp and f.state='proposed') into existing_time;
 end if;
 if existing_time and stamp<=now() then raise exception 'reservation_time_passed';end if;
 if stamp is null or (not existing_time and stamp<now()+interval '30 minutes') or stamp>now()+interval '90 days' or mod(extract(epoch from stamp),1800)<>0 then raise exception 'invalid_slot';end if;
 if office is not null then
 perform pg_advisory_xact_lock(hashtextextended('office:'||office,33));
 select * into op from private.office_locations where id=office;
 if op.id is null or op.status<>'active' or nullif(op.address,'') is null or op.latitude is null or op.longitude is null then raise exception 'office_not_active';end if;
 if extract(minute from local_stamp)<>0 or not extract(dow from local_stamp)::integer=any(op.weekdays) or extract(hour from local_stamp)<op.first_start_hour or extract(hour from local_stamp)>op.last_start_hour or exists(select 1 from private.office_calendar_exceptions where office_id=office and day=local_stamp::date and closed) then raise exception 'invalid_slot';end if;
 if exists(select 1 from private.consultations c where c.office_id=office and c.id is distinct from exclude_id and c.state in ('requested','coordinating','confirmed','scheduled','awaiting_completion') and c.preferred_at<stamp+interval '60 minutes' and c.preferred_at+c.duration_minutes*interval '1 minute'>stamp) then raise exception 'reservation_slot_taken';end if;
 end if;
 if planner is not null then
 perform pg_advisory_xact_lock(hashtextextended('planner:'||planner::text,33));
 if not private.planner_eligible(planner) then raise exception 'invalid_partner';end if;
 select * into ep from private.expert_profiles where user_id=planner;
 if not existing_planner and (not extract(dow from local_stamp)::integer=any(ep.weekdays) or local_stamp::time<make_time(ep.start_hour,0,0) or (local_stamp+length_minutes*interval '1 minute')::date<>local_stamp::date or (local_stamp+length_minutes*interval '1 minute')::time>make_time(ep.end_hour,0,0)) then raise exception 'invalid_slot';end if;
 if exists(select 1 from private.consultations c where c.planner_id=planner and c.id is distinct from exclude_id and c.state in ('requested','coordinating','confirmed','scheduled','awaiting_completion') and c.preferred_at<stamp+length_minutes*interval '1 minute' and c.preferred_at+c.duration_minutes*interval '1 minute'>stamp) or exists(select 1 from private.followup_meetings where planner_id=planner and state='confirmed' and preferred_at<stamp+length_minutes*interval '1 minute' and preferred_at+interval '30 minutes'>stamp) then raise exception 'reservation_slot_taken';end if;
 end if;
end$$;

-- Retain existing approval decisions when a verified expert edits their profile.
do $$declare source text;begin
 select pg_get_functiondef('private.match_expert_roster()'::regprocedure) into source;
 if position('new.status=''APPROVED'''  in source)=0 then
  source:=replace(source,'if new.status in (''SUSPENDED'',''REJECTED'')', 'if new.status=''APPROVED'' or new.status in (''SUSPENDED'',''REJECTED'')');
  execute source;
 end if;
end$$;
-- Turning off new requests does not cancel an already received request.
do $$declare p record;source text;old_clause text:=' or not exists(select 1 from private.planner_directory where user_id=auth.uid() and available)';begin
 for p in select oid from pg_proc where pronamespace='public'::regnamespace and proname like 'consultation_command%' loop
  source:=pg_get_functiondef(p.oid);
  if position(old_clause in source)>0 then execute replace(source,old_clause,'');end if;
 end loop;
end$$;
create or replace function private.sync_expert_booking_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.planner_directory set specialties=new.specialties,hours=lpad(new.start_hour::text,2,'0')||':00–'||lpad(new.end_hour::text,2,'0')||':00' where user_id=new.user_id;
 return new;
end$$;
do $$begin if not exists(select 1 from pg_trigger where tgname='expert_booking_profile_sync' and tgrelid='private.expert_profiles'::regclass) then
 create trigger expert_booking_profile_sync after insert or update of specialties,start_hour,end_hour on private.expert_profiles for each row execute function private.sync_expert_booking_profile();end if;end$$;
update private.planner_directory d set specialties=e.specialties,hours=lpad(e.start_hour::text,2,'0')||':00–'||lpad(e.end_hour::text,2,'0')||':00' from private.expert_profiles e where d.user_id=e.user_id and (d.specialties is distinct from e.specialties or d.hours is distinct from lpad(e.start_hour::text,2,'0')||':00–'||lpad(e.end_hour::text,2,'0')||':00');
do $$begin
 if to_regprocedure('public.consultation_command_before_booking_hardening(text,jsonb)') is null then alter function public.consultation_command(text,jsonb) rename to consultation_command_before_booking_hardening;end if;
 if to_regprocedure('public.planner_catalog_before_booking_hardening(text,text)') is null then alter function public.planner_catalog(text,text) rename to planner_catalog_before_booking_hardening;end if;
end$$;
create or replace function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare ep private.expert_profiles;d private.planner_directory;
begin
 if operation='profile' then
  select * into ep from private.expert_profiles where user_id=auth.uid();select * into d from private.planner_directory where user_id=auth.uid();
  if ep.user_id is not null then payload:=payload||jsonb_build_object('specialties',ep.specialties,'hours',lpad(ep.start_hour::text,2,'0')||':00–'||lpad(ep.end_hour::text,2,'0')||':00','latitude',d.latitude,'longitude',d.longitude);end if;
 end if;
 return public.consultation_command_before_booking_hardening(operation,payload);
end$$;
create or replace function public.planner_catalog(area text default '',wanted text default '') returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('planners',coalesce(jsonb_agg(p||case when e.user_id is not null then jsonb_build_object('hours',array_to_string(array(select (array['일','월','화','수','목','금','토'])[v+1] from unnest(e.weekdays) v order by v),'·')||' '||lpad(e.start_hour::text,2,'0')||':00–'||lpad(e.end_hour::text,2,'0')||':00') else '{}'::jsonb end order by ord),'[]')) from jsonb_array_elements(public.planner_catalog_before_booking_hardening(area,wanted)->'planners') with ordinality entry(p,ord) left join private.expert_profiles e on e.user_id=(p->>'id')::uuid;
$$;
revoke all on function private.sync_expert_booking_profile(),private.specialty_match(text,text[]),private.check_reservation_slot_before_visits(uuid,text,timestamptz,uuid,text),public.consultation_command_before_booking_hardening(text,jsonb),public.planner_catalog_before_booking_hardening(text,text),public.consultation_command(text,jsonb),public.planner_catalog(text,text) from public,anon,authenticated;
grant execute on function public.consultation_command(text,jsonb) to authenticated;
grant execute on function public.planner_catalog(text,text) to anon,authenticated;
commit;
