begin;
alter table private.office_locations add column address text,add column latitude double precision check(latitude between -90 and 90),add column longitude double precision check(longitude between -180 and 180),add column weekdays integer[] not null default array[1,2,3,4,5],add column first_start_hour integer not null default 9 check(first_start_hour between 9 and 18),add column last_start_hour integer not null default 18 check(last_start_hour between 9 and 18);
create table private.office_calendar_exceptions(office_id text not null references private.office_locations(id),day date not null,closed boolean not null default true,primary key(office_id,day));
alter table private.office_calendar_exceptions enable row level security;
revoke all on private.office_calendar_exceptions from public,anon,authenticated;
alter table private.consultations add column duration_minutes integer not null default 30 check(duration_minutes in (30,60));
create or replace function public.office_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'region',region,'status',case when status='active' and nullif(address,'') is not null and latitude is not null and longitude is not null then 'active' else 'planned' end,'address',case when status='active' then address end,'latitude',latitude,'longitude',longitude,'weekdays',weekdays,'firstStartHour',first_start_hour,'lastStartHour',last_start_hour,'durationMinutes',60)),'[]') from private.office_locations where status<>'closed'
$$;
-- Server authority: a physical office always takes 60 minutes; expert face-to-face takes 60.
-- Phone duration is controlled by service_features, never by a client-supplied duration/targetType.
create function private.reservation_duration(office text,consultation_method text) returns integer language plpgsql stable security definer set search_path='' as $$
begin
 if consultation_method is null or consultation_method not in ('scheduled','nearby','phone') then raise exception 'invalid_method';end if;
 if office is not null or consultation_method<>'phone' then return 60;end if;
 return (select phone_duration_minutes from private.service_features where id);
end$$;
revoke all on function private.reservation_duration(text,text) from public,anon,authenticated;
create function private.check_reservation_slot(planner uuid,office text,stamp timestamptz,exclude_id uuid default null,consultation_method text default 'scheduled') returns void language plpgsql security definer set search_path='' as $$
declare length_minutes integer:=private.reservation_duration(office,consultation_method);ep private.expert_profiles;op private.office_locations; local_stamp timestamp:=stamp at time zone 'Asia/Seoul';
begin
 if stamp is null or stamp<now()+interval '30 minutes' or stamp>now()+interval '90 days' or mod(extract(epoch from stamp),1800)<>0 then raise exception 'invalid_slot';end if;
 if office is not null then
 perform pg_advisory_xact_lock(hashtextextended('office:'||office,33));
 select * into op from private.office_locations where id=office;
 if op.id is null or op.status<>'active' or nullif(op.address,'') is null or op.latitude is null or op.longitude is null then raise exception 'office_not_active';end if;
 if extract(minute from local_stamp)<>0 or not extract(dow from local_stamp)::integer=any(op.weekdays) or extract(hour from local_stamp)<op.first_start_hour or extract(hour from local_stamp)>op.last_start_hour or exists(select 1 from private.office_calendar_exceptions where office_id=office and day=local_stamp::date and closed) then raise exception 'invalid_slot';end if;
 if exists(select 1 from private.consultations c where c.office_id=office and c.id is distinct from exclude_id and c.state in ('requested','coordinating','confirmed','scheduled','awaiting_completion') and c.preferred_at<stamp+interval '60 minutes' and c.preferred_at+c.duration_minutes*interval '1 minute'>stamp) then raise exception 'slot_unavailable';end if;
 end if;
 if planner is not null then
 perform pg_advisory_xact_lock(hashtextextended('planner:'||planner::text,33));
 if not private.planner_eligible(planner) then raise exception 'invalid_partner';end if;
 select * into ep from private.expert_profiles where user_id=planner;
 if not extract(dow from local_stamp)::integer=any(ep.weekdays) or local_stamp::time<make_time(ep.start_hour,0,0) or (local_stamp+length_minutes*interval '1 minute')::date<>local_stamp::date or (local_stamp+length_minutes*interval '1 minute')::time>make_time(ep.end_hour,0,0) then raise exception 'invalid_slot';end if;
 if exists(select 1 from private.consultations c where c.planner_id=planner and c.id is distinct from exclude_id and c.state in ('requested','coordinating','confirmed','scheduled','awaiting_completion') and c.preferred_at<stamp+length_minutes*interval '1 minute' and c.preferred_at+c.duration_minutes*interval '1 minute'>stamp) or exists(select 1 from private.followup_meetings where planner_id=planner and state='confirmed' and preferred_at<stamp+length_minutes*interval '1 minute' and preferred_at+interval '30 minutes'>stamp) then raise exception 'slot_unavailable';end if;
 end if;
end$$;
alter function public.consultation_command(text,jsonb) rename to consultation_command_before_integrity;
revoke all on function public.consultation_command_before_integrity(text,jsonb) from public,anon,authenticated;
create function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.consultations; result jsonb; rid uuid; target uuid;office text; stamp timestamptz;verified_phone text;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='request' then
 perform private.require_booking_access();
 perform pg_advisory_xact_lock(hashtextextended('customer:'||auth.uid()::text,33));
 if nullif(payload->>'request_key','') is null then raise exception 'request_key_required';end if;
 select id into rid from private.consultations where customer_id=auth.uid() and request_key=(payload->>'request_key')::uuid;
 if rid is not null then return jsonb_build_object('id',rid,'replay',true);end if;
 target:=nullif(payload->>'planner_id','')::uuid;office:=nullif(payload->>'office_id','');stamp:=(payload->>'preferred_at')::timestamptz;
 perform private.check_reservation_slot(target,office,stamp,null,payload->>'method');
 else
 select * into c from private.consultations where id=nullif(payload->>'id','')::uuid for update;
 if operation in ('propose','office_assign','confirm','office_confirm','accept') then
 if c.id is null or not (c.customer_id=auth.uid() or c.planner_id=auth.uid() or private.is_admin()) then raise exception 'request_forbidden';end if;
 target:=case when operation='office_assign' then (payload->>'planner_id')::uuid else c.planner_id end;
 stamp:=case when operation='propose' then (payload->>'preferred_at')::timestamptz else c.preferred_at end;
 perform private.check_reservation_slot(target,c.office_id,stamp,c.id,c.method);
 end if;
 end if;
 if operation='followup_confirm' then
 if c.id is null or not (c.customer_id=auth.uid() or c.planner_id=auth.uid()) then raise exception 'request_forbidden';end if;
 select preferred_at into stamp from private.followup_meetings where id=(payload->>'followup_id')::uuid and consultation_id=c.id and state='proposed';
 perform private.check_reservation_slot(c.planner_id,null,stamp,c.id);
 end if;
 if operation in ('confirm','office_confirm') then
 if payload->>'share_consent' is distinct from 'true' then raise exception 'consent_required';end if;
 select phone into verified_phone from auth.users where id=auth.uid() and phone_confirmed_at is not null;
 if verified_phone is null then raise exception 'phone_verification_required';end if;
 payload:=payload||jsonb_build_object('phone',case when verified_phone like '+82%' then '0'||substr(verified_phone,4) when verified_phone like '82%' then '0'||substr(verified_phone,3) else verified_phone end);
 -- Reuse contact disclosure validation for both direct and assigned reservations.
 operation:='confirm';
 end if;
 result:=public.consultation_command_before_integrity(operation,payload);
 if operation='request' then update private.consultations set request_key=(payload->>'request_key')::uuid,duration_minutes=private.reservation_duration(office,payload->>'method') where id=(result->>'id')::uuid;end if;
 if operation='accept' and c.allocation_mode='office' then update private.consultations set state='coordinating',customer_ok=false where id=c.id;end if;
 if operation='confirm' then insert into private.consent_records(user_id,type,version,accepted,accepted_at,source) values(auth.uid(),'THIRD_PARTY_PROVISION','2026-10-05-early-access-v1',true,now(),'reservation:'||c.id::text||':recipient:'||c.planner_id::text);end if;
 return result;
end$$;
revoke all on function private.check_reservation_slot(uuid,text,timestamptz,uuid,text),public.consultation_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.consultation_command(text,jsonb) to authenticated;
alter table private.consultations drop constraint consultations_purpose_check;
alter table private.consultations add constraint consultations_purpose_check check(purpose in ('claim','management','coverage','corporate','new','other'));
create function public.reservation_slots(office_id text default null,planner_id uuid default null,day date default current_date,consultation_method text default 'scheduled') returns jsonb language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_variable
declare office private.office_locations;expert private.expert_profiles;stamp timestamptz;slot_length integer;first_hour integer;last_hour integer;results jsonb:='[]';minutes integer;
begin
 if day<(now() at time zone 'Asia/Seoul')::date or day>(now() at time zone 'Asia/Seoul')::date+90 then raise exception 'invalid_slot';end if;
 if office_id is not null then
 select * into office from private.office_locations o where o.id=office_id;
 if office.id is null or office.status<>'active' or nullif(office.address,'') is null or office.latitude is null or office.longitude is null then return '[]';end if;
 if not extract(dow from day)::integer=any(office.weekdays) or exists(select 1 from private.office_calendar_exceptions e where e.office_id=office.id and e.day=day and closed) then return '[]';end if;
 slot_length:=60;first_hour:=office.first_start_hour;last_hour:=office.last_start_hour;
 elsif planner_id is not null then
 if not private.planner_eligible(planner_id) then return '[]';end if;
 select * into expert from private.expert_profiles e where e.user_id=planner_id;
 if not extract(dow from day)::integer=any(expert.weekdays) then return '[]';end if;
 slot_length:=private.reservation_duration(null,consultation_method);first_hour:=expert.start_hour;last_hour:=expert.end_hour;
 else return '[]';end if;
 for minutes in select generate_series(first_hour*60,last_hour*60-case when office_id is null then slot_length else 0 end,slot_length) loop
 stamp:=(day::timestamp+minutes*interval '1 minute') at time zone 'Asia/Seoul';
 if stamp<now()+interval '30 minutes' then continue;end if;
 if exists(select 1 from private.consultations c where ((office_id is not null and c.office_id=office_id) or (planner_id is not null and c.planner_id=planner_id)) and c.state in ('requested','coordinating','confirmed','scheduled','awaiting_completion') and c.preferred_at<stamp+slot_length*interval '1 minute' and c.preferred_at+c.duration_minutes*interval '1 minute'>stamp) then continue;end if;
 if planner_id is not null and exists(select 1 from private.followup_meetings f where f.planner_id=planner_id and state='confirmed' and preferred_at<stamp+slot_length*interval '1 minute' and preferred_at+interval '30 minutes'>stamp) then continue;end if;
 results:=results||jsonb_build_array(to_char(stamp at time zone 'Asia/Seoul','HH24:MI'));
 end loop;return results;
end$$;
revoke all on function public.reservation_slots(text,uuid,date,text) from public;
grant execute on function public.reservation_slots(text,uuid,date,text) to anon,authenticated;
commit;
