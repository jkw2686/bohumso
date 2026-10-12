# 현재 인수인계 — 직군별 가입 (2026-10-12)

PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 읽고 최신 직접 사용자 지시를 우선한다.

## 현재 상태
- 브랜치 codex/profession-registration. 기준 로컬0ece098/배포 코드23b885b. 변경은 개발 검수 단계이며 운영 DB/배포 미적용.
- 최신 사용자 요청: 보험설계사/세무사/보험소 운영자 가입 첫 단계 및 기존 기능 연결. 기존 메뉴/홈/UI 유지. 새 직군 플랫폼 요금·과금·외부 발송 금지.
- 구현: shared/professions.json 공통 정의, 공개 가입 next 직군 전달, 기존 partner 화면 5단계, 자료/관리자 심사/선택 프로필/지도 유형/세무 상담료/예약 연결. 세무·거점 자료는 별도 비공개 저장. 기존 개인 계정+거점 운영 분리.
- 066 SQL 단일 transaction, 재실행 가능, 백업/보존 원복 포함. 신규5테이블+직군·상담료 안내 컬럼. 기존 데이터 삭제 없음.
- 마지막 확인한 기존 운영 버전: Netlify6acc5a47f394f70008b11015 / main23b885ba63e9271203464d897a82bdde4647c7eb / 2026-10-12 12:56 KST. 이번 배포번호가 아님.

## 검증/실행
- node scripts/profession-catalog.mjs --check
- node scripts/build.mjs
- node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 --test tests/profession-registration.test.mjs
- node --test tests/expert-documents-api.test.mjs tests/profile-photo-api.test.mjs
- node tests/profession-browser.mjs --ui-only
- node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 tests/profession-browser.mjs
- DB 검증은 PGlite 임시 DB. 운영 URL/키/회원 데이터를 쓰지 않는다. UI는 인증/RPC 격리. 외부 SMS/OAuth/지도 타일 요청 차단.
- PC 메모리가 부족해 초기 실행 실패했지만 이후 위 테스트 실행 가능해짐. 필요 시 로컬 격리 실행에 sandbox escalation. 64MB 초기 메모리 시도는 최소128MB 때문에 불가했고 해당 임시 코드는 제거했다.
- artifacts/profession-browser-ui-report.json / profession-browser-database-report.json. 캡처는 docs/profession-registration-screens.

## 아직 남은 것
- request_user_input_async로 066 DB 적용+배포 승인 질문 제출. 응답이 없으면 운영 변경 금지. 공개 권한/직군 약관 변경이 과거 migration 승인에 포함되지 않는다고 설명했다.
- 실제 운영 스키마와 SQL 적용 직전 비교·백업, 사용자 승인 후 적용/배포 (약40~60분). Netlify deploy skill 및 기존 절차를 읽고 진행.
- 실제 외부 OAuth/SMS·Storage 업로드, 실단말 키보드·OS글자확대는 미확인 (약20~40분, 지정 계정·격리 데이터와 별도 허용 범위 확인).
- 약관은 요청한 공통/직군 원칙을 개발 반영한 초안. 세무사 등록/명칭은 공식 근거 확인, 유료 노출 법률 판단은 미완료. 가격/결제 개방 금지.
- 기존 원본30일/기록1년 보관 문구를 변경하지 않음. 자동 파기 연결은 미확인. 운영 절차 확인 필요.
- 거점 좌표는 관리자 실주소 확인 후 입력. 별도 거점 운영 대시보드는 현행에 없어 새로 만들지 않았다. 새 세무/거점 자기 심사 불가.

## 보호/원복
- bohumso-fec525a의 codex/meeting-feedback(062~065), bohumso-ui-release 및 다른 작업본 수정/병합 안 함. Claude 작업을 직접 확인한 것으로 보고하지 않는다.
- 충돌 가능: src/account.js, menu.js, workflow.js, profile-editor.js와 SQL의 consultation/urgent/profile 함수. 원격main을 작업본에 덮어쓰지 않는다.
- 원복: 이전 프런트엔드 + supabase/rollback_profession_registration.sql. 추가 데이터/컬럼 보존, 신규 거점 접수 중지. 재적용 시 거점 재공개는 재심사 필요.
- 상세 변경안/법적 참고/미확인: docs/profession-registration-20261012.md.
