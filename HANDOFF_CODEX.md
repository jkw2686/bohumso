# 현재 인수인계 — 2026-10-24 전문가 전화 연결
이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 다음 할 일부터 진행.

- 최신 사용자 지침: 신규 전문가 상담은 날짜 없이 요청→전문가 수락→그 전문가만 번호 확인→전화 조율. 077 최종확인은 보험소 방문예약과 기존 이력에만 유지.
- 코드 구현/격리 DB 2개+기존 정책2개/모바일 4폭·200%/방문예약 6크기/목록 및 지도 회귀 검수/프로덕션 빌드 통과.
- 운영 Supabase xyexphhspykwwlhfokfl에 078 적용 성공 및 원장 기록. 기존 운영 예약 DML 없음. 코드 배포 진행 중이며 완료 결과는 다음 항목 확인.
- 새 private.connection_consents 및 connection_contact_reads는 RLS/raw SELECT 차단. 요청시 명시 동의, 수락 전 workspace contact null, 수락 후 해당 전문가만, 취소/거절 후 차단. 같은 수락은 replay, 중복 알림 없음.
- 기존 actual office 예약·기록·요금/자동결제/자격 정책 유지. optional appointment API 우회 막음. 실제 상담 완료로 처리하지 않음.
- 상세: docs/expert-phone-connection-20261024.md, 078_expert_phone_connection.sql. 테스트: node --test --test-concurrency=1 tests/expert-phone-connection.test.mjs (PGlite 병렬 메모리부족 주의).
- 운영 실제 요청/수락/취소/시험 발송/통화/결제 실행 안 함. 실휴대전화 통화앱·새 푸시 도착과 다중 DB 연결 부하 미확인.
- 다른 작업 보존: public/help 6개 줄바꿈·outputs/signup-entry-20261018 미커밋 제외. node_modules junction 삭제/설치 금지. 제외 요청한 실제 사용자 데이터 조회 금지.
- 다음: 운영 정적 번들/화면 검증 후 완료 기록. 신규 기능은 새 사용자 요청 기준.

## 운영 완료 — 2026-10-24 15:41 KST
- 코드 fb60da5cf7dd2f71041136a4b78d7f62b7687e40, Netlify 6adc53026bcfbe055ccb839f ready, published 2026-10-24T06:41:21.621Z, commit 일치.
- 078 적용 및 private.schema_migrations 기록 성공. 사후 migration_applied/mode_constraint/consent_rls/raw_phone_denied/anonymous_command_denied/legacy_wrapper_denied/notification_copy=true, new_consents=0. 운영 신규 상담/동의/알림 시험 생성 없음.
- assets/account.js 및 service-clarity.css HTTP200, 줄바꿈/chunk명 정규화 후 로컬 빌드와 일치. 운영 JS sha256 38412b84a8439af1bf41616289cddab7342e765beb2e68936dfc90cf471404c3.
- 실제 로그인된 운영 /requests.html?planner=... 화면에서 대표 보험소장·지역, 날짜 입력 없음, 직접 체크 미선택, 상담 요청하기 비활성, 정확한 안내 확인. 제출하지 않음.
- artifacts/expert-connection/request-production.png 및 production-db-verification.png (로컬 ignored). 모바일 request-390.png/accepted-390.png는 격리 화면.
- 링크 https://bohumso.netlify.app/map?view=experts / https://bohumso.netlify.app/requests / https://bohumso.netlify.app/partner-work.html
- 구현·DB·배포·운영 화면 확인 완료. 실휴대전화 통화/신규 푸시 도착 및 다중 DB 연결 부하만 미검증. 다음은 새 사용자 요청 기준. 운영 추가 데이터 조작 불필요.
