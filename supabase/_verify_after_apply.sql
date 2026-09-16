-- 보험소 마이그레이션 적용 후 검증 (Supabase SQL Editor에서 실행)
-- 기대값: private 테이블 16개, public RPC 23개. 값이 다르면 적용 순서/중복을 점검한다.

-- 1) private 스키마 테이블 수 (기대: 16)
select 'private_tables' as check, count(*) as actual, 16 as expected
from pg_tables where schemaname = 'private';

-- 2) public 함수(RPC) 수 (기대: 23)
select 'public_functions' as check, count(*) as actual, 23 as expected
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';

-- 3) private 테이블에 anon/authenticated 직접 권한이 남아있지 않은지 (기대: 0건)
--    민감 테이블은 RPC로만 접근해야 한다.
select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'private' and grantee in ('anon','authenticated')
order by table_name, grantee;

-- 4) 구형 예약 쓰기 API 권한 회수 확인 (003 이후 authenticated 실행권한이 없어야 함, 기대: 0건)
select p.proname, r.grantee
from information_schema.role_routine_grants r
join pg_proc p on p.proname = r.routine_name
where r.routine_schema = 'public'
  and r.grantee = 'authenticated'
  and p.proname in ('create_service_request','assign_service_request','confirm_service_request','change_service_request')
order by p.proname;

-- 5) 첫 관리자 지정 안내 (실행 아님 — 인증 완료한 사용자 UUID로 수동 등록)
--    select id, email from auth.users where email = '관리자이메일';
--    insert into private.admin_memberships(user_id) values ('여기에-UUID'::uuid);
