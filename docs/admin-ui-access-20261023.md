# 관리자 화면 인증 동기화 최소 수정 (2026-10-23)

## 범위와 상태
- 메뉴 신원/운영 링크 동기화, admin.html 및 admin-requests.html 초기 표시 차단만 수정.
- 서버/DB 권한 검사, 가입/심사/예약/결제/알림 정책 변경 없음. 운영 SQL 적용·권한 확대·승인/삭제/발송 없음.
- 로컬 코드 수정. 푸시/배포 안 함. 운영 변경본 검증 안 함.

## 원인과 변경 파일
- src/menu.js: 기존에는 최초 load와 pageshow만 처리하고 인증 변경 구독이 없었음. loading 플래그 때문에 이전 조회 중 새 계정 조회도 생략 가능했음.
  - 인증 이벤트/다른 탭 storage 이벤트/pagehide/BFCache pageshow 처리. 즉시 이름·역할 링크 제거 후 서버 my_membership 재조회.
  - 요청 revision으로 이전 인증/프로필 요청의 성공·실패·finally가 새 화면을 덮어쓰지 못하게 함. 권한 조회 실패는 공개 메뉴만 표시.
- src/member-access.js: 진행 중 공유 권한 요청의 epoch를 명시적으로 무효화하는 함수 추가. 완료 권한 캐시를 새로 만들지 않음.
- public/admin.html, public/admin-requests.html: HTML 자체의 초기 inline CSS로 운영 내비게이션·본문·사이드바·이전 예약 영역 전체 차단. 처음에는 ‘접근 권한을 확인하고 있습니다.’만 표시. JS가 실행되지 않아도 차단 유지.
- src/admin-page-access.js: 화면 gate의 revision과 BFCache 복귀 시 잠금/재조회 처리. 서버 권한 대체 수단 아님.
- src/account.js: 관리자 페이지에서 첫 역할 요청 전 인증 변경 구독. 다른 계정/로그아웃 시 즉시 숨기고 기존 데이터 제거. 같은 계정 인증 변경은 서버 재조회 후 관리자만 다시 표시. 초기 SDK 복원 SIGNED_IN 중복은 이미 진행 중인 서버 조회로 확인해 재로딩 루프 방지.
- tests/admin-ui-auth-browser.mjs: 외부 네트워크 차단 모의 인증/RPC 회귀 검사. 읽기만 수행하며 실제 신청/승인/삭제/발송하지 않음.

## RPC 404 별도 조사
| RPC | 호출/정의 | 운영 재확인 | 영향 |
| --- | --- | --- | --- |
| public.expert_admin_list() returns jsonb | src/expert-admin.js, supabase/011_expert_onboarding.sql:97 | 인수 {}로 404 PGRST202, no-parameters 함수가 schema cache에 없음 | earlyAccess=false의 구 전문가 심사 목록. 운영 공개 설정 earlyAccess=true라 현재 관리자 첫 화면은 early_expert_review 사용 |
| public.insurer_contacts_command(operation text, payload jsonb default '{}') returns jsonb | src/admin-insurers.js 및 src/insurer-contacts.js, supabase/073_insurer_contacts.sql:59 | {operation:'list',payload:{}}로 404 PGRST202, operation/payload 함수가 schema cache에 없음 | 관리자 보험사 연락처 운영 및 승인 전문가 연락처 자료실. 관리자 화면은 기존 PGRST202 처리로 해당 패널만 건너뜀 |

- 클라이언트 인수 이름/정의 시그니처는 서로 일치. 운영 정의 자체가 다른지는 미확인.
- 최신 migrate 실행 https://github.com/jkw2686/bohumso/actions/runs/39874687094 (2026-10-22 23:53 UTC): 전체 success이나 Apply pending migrations 단계 skipped. 작업 120157293523 로그에 DATABASE_URL is not configured for this workflow 경고. 이 실행에서 SQL을 적용했다는 증거가 없음.
- .github/workflows/migrate.yml은 071까지 기준선으로 **실행 없이 기록**하고 이후 파일만 적용하는 구조. 따라서 011 원장 기록이 있더라도 실제 함수 존재 증거가 되지 않음.
- 073 수동 적용 여부와 현재 운영 pg_proc/원장은 확인하지 못함. 공개 RPC 404만으로 ‘함수 자체 누락’과 ‘캐시 미갱신’을 확정 구분할 수 없음. DB 비밀키로 우회하지 않음.

### 다음 최소 조치 (아직 실행하지 않음)
운영 SQL Editor의 읽기 전용 조회로 다음을 확인해야 한다.

~~~sql
select n.nspname, p.proname,
       pg_get_function_identity_arguments(p.oid) as identity_arguments,
       pg_get_function_arguments(p.oid) as arguments_with_defaults,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('expert_admin_list','insurer_contacts_command');
select name, applied_at from private.schema_migrations
where name in ('011_expert_onboarding.sql','073_insurer_contacts.sql');
~~~

- 함수가 없으면: 누락 마이그레이션 및 선행 의존성을 별도로 검토한 후 적용 여부 결정. 특히 011 전체 재실행은 광범위 전문가 함수/자료/심사에 영향을 주므로 자동 재실행 금지.
- 같은 이름이지만 시그니처가 다르면: 실제 운영 인수·클라이언트 버전 차이 확인 후 최소 호환 변경 제안.
- 정확한 함수와 실행 권한이 있는데도 404면: 운영 연결 프로젝트/노출 스키마/캐시 상태 확인 후 캐시 갱신을 별도 승인 범위로 처리.
- 073 적용은 연락처/즐겨찾기 private 테이블, RLS/함수와 실행권한을 추가하는 작업이므로 이번 화면 수정과 분리. 요금·예약 기능에 직접 변경 없음.

## 검수와 한계
- 최종 빌드: node scripts/build.mjs 통과 (배포 없음).
- 관리자 표시/접근: node tests/admin-ui-auth-browser.mjs --gates-only 12항목 통과. 관리자→일반회원은 계정 화면 이동 또는 현재 관리 경로의 서버 재조회 후 권한 거부를 허용하되, 운영 본문 숨김과 기존 데이터 제거를 검증.
- 메뉴/동기화: node tests/admin-ui-auth-browser.mjs --menus-only 11항목 통과. 역할별 메뉴·계정 전환·늦은 역할 응답·실제 두 탭 storage 로그아웃·조회 실패·persisted 모의 복귀·브라우저 뒤로가기 포함. 두 분할의 공통 뒤로가기 1항목을 제외하면 고유 22항목.
- 기존 소비자·전문가 흐름: node tests/help-login-browser.mjs 통과(청구/세무 목적 복귀, 익명/일반/작성·심사중/승인·베타 전문가 및 지역 복귀, 저장 없음).
- 격리 DB/서버 회귀: node --test --test-concurrency=1 tests/access.test.mjs tests/member-gate.test.mjs tests/admin-redeploy.test.mjs 5/5 통과. 서버 역할/가입·승인 조건/고객 데이터 격리/관리자 엔드포인트 검사 유지. 외부 호출은 mock.
- 소스 node --check 및 git diff --check 통과.
- 전체 npm test와 npm run verify는 이번 변경에서 재실행하지 않음.
- 초기 검수에서 발견한 SDK 복원 SIGNED_IN 재진입 루프를 해소. 모의 관리자 예약 응답에도 실제 계약의 consultation_metrics.planner_summary를 추가. 이 두 검수 실패를 해결한 뒤 최종 재검수.
- 격리 검사 명령: node tests/admin-ui-auth-browser.mjs (전체), --gates-only / --menus-only (기능별 분할), --history-only (뒤로가기). 상세 결과 artifacts/admin-ui-auth-20261023/*-report.json (로컬 ignored).
- BFCache는 PageTransitionEvent persisted 모의 수명주기를 검사. 별도로 관리자 메뉴를 떠난 뒤 로그아웃하고 브라우저 뒤로가기로 돌아오는 회귀 검사를 제공한다. 실제 BFCache 캐시 적중을 보장하는 시험은 아님. 실제 기기/Android 및 실제 운영 로그인 계정은 미확인.
- 운영에서 확인한 것은 공개 설정 및 두 RPC의 읽기 전용 404 응답과 GitHub 실행 로그. 수정된 UI가 운영에 반영됐다는 의미가 아님.
