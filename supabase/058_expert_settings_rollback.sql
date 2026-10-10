-- 058 원복 — **완전 원복이 아닙니다. 편집 중단입니다.**
--
-- 남는 것 (의도된 보존):
--   · planner_directory.self_map_visible / settings_revision 열과 값
--     → 전문가가 선택한 '숨김'을 무시하고 다시 공개하지 않습니다.
--   · 숨김을 반영하는 공개 필터(planner_catalog / visit_catalog / reservation_slots)
--     → 열만 남기고 필터를 걷으면 숨긴 전문가가 지도에 다시 뜹니다. 그래서 유지합니다.
--   · 고객센터 대화(057)와 기존 예약·요청·동의 기록
-- 되돌리는 것:
--   · 전문가 본인 편집 RPC(expert_settings) 실행 권한
--   · 058이 새로 끼운 동작 wrapper 3개(visit 수락 우회 / 보험소 배정 거부 / 심사 후 방문 OFF)
--     → expert_settings_backup에 보관한 원문으로 복원합니다.
-- 화면은 검증된 이전 Netlify 배포로 별도 복구합니다.
begin;
select pg_advisory_xact_lock(580058);

-- 1) 전문가 본인 편집 중단
revoke execute on function public.expert_settings(text,jsonb) from public,anon,authenticated,service_role;

-- 2) 동작 wrapper 되돌리기 — 백업 원문으로 복원한다.
--    공개 필터(planner_catalog / visit_catalog / reservation_slots)는 숨김 보존을 위해 복원하지 않는다.
do $restore$
declare src text;
begin
 for src in select definition from private.expert_settings_backup
  where name in ('public.urgent_command(text,jsonb)','public.consultation_command(text,jsonb)','public.early_expert_review(text,jsonb)')
 loop execute src; end loop;
end$restore$;

-- 3) 046 정의로 돌아간 visit_available은 058이 의미를 바꾸지 않았으므로 그대로 둔다.
--    058이 추가한 보조 함수만 권한을 회수한다(정의는 남겨 재적용 시 그대로 쓰인다).
revoke all on function private.visit_accept_allowed(uuid) from public,anon,authenticated,service_role;

commit;

-- 재적용: supabase/058_expert_settings.sql 을 다시 실행하면 된다.
--   rename 블록과 열 추가는 if not exists / to_regprocedure 가드가 있어 재실행에 안전하다.
--   백업 테이블은 on conflict do nothing 이므로 최초 원문이 덮이지 않는다.
