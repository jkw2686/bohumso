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
