-- 059 기존 예약의 보험소 운영시간 재검사 생략 — 개발 후보. 운영 미적용.
--
-- 문제: 보험소 운영 요일·시간이 바뀐 뒤 기존 예약을 '원래 시각 그대로' 확정하면
--       056 check_reservation_slot_before_visits:37 의 요일·시간 검사에 걸려 invalid_slot 이 된다.
--       전문가 활동시간은 056 이 이미 existing_planner 로 생략하고 있으므로(056:44)
--       보험소 쪽만 같은 방식으로 맞춘다.
--
-- 유지하는 것 (지금처럼 오류를 낸다 → 화면에서 '일정 재제안 필요'로 안내, 자동 취소 금지):
--   · 보험소 비활성·주소·좌표 누락            → office_not_active
--   · 휴무일(office_calendar_exceptions.closed) → invalid_slot
--   · 겹치는 예약                              → reservation_slot_taken
-- 전체 검사를 그대로 받는 경로:
--   · 새 시각 제안(propose) · 재배정(office_assign) · 신규 예약(request)
--     → existing_time 이 false 이므로 요일·시간 검사가 적용된다.
--   · 신규 예약 30분 리드타임(056:32)은 변경하지 않는다.
--
-- 원복: supabase/rollback_existing_office_hours.sql
begin;
select pg_advisory_xact_lock(590059);
create table if not exists private.existing_office_hours_backup(name text primary key,definition text not null);
alter table private.existing_office_hours_backup enable row level security;
revoke all on private.existing_office_hours_backup from public,anon,authenticated,service_role;
insert into private.existing_office_hours_backup
 select 'private.check_reservation_slot_before_visits(uuid,text,timestamptz,uuid,text)',
        pg_get_functiondef(to_regprocedure('private.check_reservation_slot_before_visits(uuid,text,timestamptz,uuid,text)'))
 on conflict do nothing;

-- 056 본문과 동일하며, 보험소 요일·시간 검사에만 not existing_time 을 붙이고
-- 휴무일 검사를 별도 구문으로 분리했다.
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
 -- 기존 예약·원래 시각은 운영시간 변경 전에 확정된 약속이므로 요일·시간을 다시 묻지 않는다.
 if not existing_time and (extract(minute from local_stamp)<>0 or not extract(dow from local_stamp)::integer=any(op.weekdays) or extract(hour from local_stamp)<op.first_start_hour or extract(hour from local_stamp)>op.last_start_hour) then raise exception 'invalid_slot';end if;
 -- 휴무일은 기존 예약에도 그대로 오류를 낸다. 화면에서 일정 재제안을 안내한다.
 if exists(select 1 from private.office_calendar_exceptions where office_id=office and day=local_stamp::date and closed) then raise exception 'invalid_slot';end if;
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
revoke all on function private.check_reservation_slot_before_visits(uuid,text,timestamptz,uuid,text) from public,anon,authenticated,service_role;
commit;
