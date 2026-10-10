-- 059 원복. 백업한 056 원문으로 check_reservation_slot_before_visits 를 되돌린다.
-- 되돌리면 보험소 운영시간이 바뀐 뒤 기존 예약을 원래 시각으로 확정할 때 다시
-- invalid_slot 이 발생한다(일정 재제안이 필요해짐). 데이터는 지우지 않는다.
begin;
select pg_advisory_xact_lock(590059);
do $restore$
declare src text;
begin
 select definition into src from private.existing_office_hours_backup
  where name='private.check_reservation_slot_before_visits(uuid,text,timestamptz,uuid,text)';
 if src is null then raise exception 'backup_missing';end if;
 execute src;
end$restore$;
revoke all on function private.check_reservation_slot_before_visits(uuid,text,timestamptz,uuid,text) from public,anon,authenticated,service_role;
commit;
