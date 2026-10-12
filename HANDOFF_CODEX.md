# 현재 인수인계 — 전문가 통합 후속 개발 (2026-10-12)

PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽는다. 최신 사용자 지시가 우선한다.

## 상태와 범위

- 개발 브랜치 codex/expert-integration, 기준 7acb6b7. 구현·검수·화면 커밋 8e556d8 전송 완료: https://github.com/jkw2686/bohumso/commit/8e556d8 . 이 문서 보완은 별도 문서 커밋이다.
- 이전 UI 정리 0bb7a1a / 7acb6b7 유지. main 병합·운영 DB·배포·설정·외부 발송·비용 집행 없음.
- 최신 첨부 4e00c207의 후속 통합만 적용. 이전 운영 승인을 새 배포 승인으로 해석하지 않는다.
- 정적 HTML/CSS/JS + esbuild, Supabase RPC, 기존 문서/사진 처리 재사용. 새 패키지 없음.

| 단계 | 상태 |
|---|---|
| 홈 문장 교체 | 완료. 구조·버튼 유지. 홈 지도는 직역·상담 조건 데이터 전달만 보완 |
| 설계사 필수 원칙·동의 | 개발 완료. 새 가입 서버 차단·버전 이력, 기존 회원 소급 동의 없음 |
| 세무사 가입·증빙·심사·프로필 | 개발 완료. 기존 비공개 구조 재사용, 기본 개방 OFF |
| 지도·예약·비용 | 개발 완료. 새 통합만 60분·09~17시 시작, 기존 예약 유지 |
| 약관·제재 차이 | 보고 완료. 법률 검토·실제 집행 완성은 남음 |
| 첫 원고·대표 게시 | 격리 실제 흐름 완료, 운영 게시 안 함 |
| 운영 반영 | 금지 상태 유지, 새 승인·준비 확인 필요 |

## 검증 재현

```text
node scripts/build.mjs
node scripts/build-expert-integration-candidate.mjs
node --test --test-concurrency=1 tests/expert-integration.test.mjs tests/growth.test.mjs tests/booking-hardening.test.mjs tests/expert-documents-api.test.mjs
node tests/expert-integration-browser.mjs
node tests/profile-usability-browser.mjs
node tests/requests-page-browser.mjs
node tests/growth-browser.mjs
node tests/home-experts-browser.mjs
```

큰 브라우저/메모리 DB 검사는 하나씩 실행한다. 가상 계정·격리 데이터이며 외부 연결은 막는다.
- 필수 미동의·구버전 차단, 기존 동의 보존, 세무사 심사/권한, 요일/시간/휴무 교집합, 중복·재전송, 비용 조건 보존, 원복 검증.
- 새 6화면 360·390·430·1440px, 루트 폰트 200%, 카드 좌우 경계, 빨간 원칙 문구 대비 5.97:1.
- 기존 프로필·사진·예약 목록·실천 CRUD/재접속·홈 지도 회귀 통과.
- 보고: docs/expert-integration-20261012.md / docs/expert-terms-integration-review.md.
- 화면: docs/expert-integration-screens/, 결과: docs/expert-integration-browser-results.json.

## 판단과 원복

- 새 개방 진실값은 private.expert_integration_settings.tax_enabled/unified_booking, 기본 false. 기존 service_features·예약/본인확인 gate·HTTP 자료 설정은 별도 유지.
- 동의 버전 planner-protection-2026-10-12-v2 / tax-service-2026-10-12-v1. 일반 기존 프로필 수정에 강제 재동의 없음.
- 062 직역/원칙, 063 통합 요청/비용, 064 요약·관리자 전용 첫 문안. 기존 회원/예약 삭제·컬럼 삭제·타입 변경 없음.
- 생성기 → ignored artifacts/expert-integration-candidate.sql 한 트랜잭션. 운영 스키마 전체 비교와 백업은 운영 적용 승인 이후 별도.
- supabase/rollback_expert_integration.sql: 진행 중 통합 예약이 있으면 중단. 함수 선택 복원, 추가 컬럼·동의·예약·원고 보존. 코드도 7acb6b7 기준 호환 버전과 함께 복귀해야 한다.
- 첫 원고 source_key는 bohumso-after-meeting-five-minutes-v1 유지. 새 제목은 ‘청구 상담을 마칠 때 확인할 세 가지’. 관리자 RPC로 로드하며 일반 번들에 비공개 문안을 넣지 않는다.
- 기존 비공개 첫 원고는 같은 행 편집, 이미 게시된 원고는 자동 교체하지 않는다.

## 아직 깨끗하지 않은 것

- 소비자 보호 위반의 1·2·3회 집행은 기존 warning/suspended/banned·임의 종료일과 다르다. 사실 확인·사유·이의 신청·기존 예약 보호·만료 복귀를 완성했다고 말하지 않는다.
- 운영 전체 스키마와 062~064 번호·함수 차이는 이번에 비교하지 않았다. 격리 fixture가 운영 전체 동일성을 보장하지 않는다.
- 실제 Storage 업로드·Google/SMS 왕복·실단말 키보드/카카오/OS 글자 확대 미확인. HTTP 파일 전송은 모의 응답, 메타데이터/권한은 실제 PGlite SQL.
- 이전 UI와 이번 개발을 현재 운영 화면에 반영했다고 말하지 않는다.
- ../bohumso-ui-release 204bed6/codex/interaction-settings의 dirty 변경은 유지. 계정·프로필·공통 스타일·지도·예약·058 계열 충돌 가능. Claude Code의 현재 작업은 직접 확인하지 못했다.
- 상시 로컬 미리보기 서버 없음. 캡처와 재현 명령은 검토용이며 공개 배포 링크가 아니다.

## 다음 순서와 예상 시간

1. 총괄의 화면·기능·약관/제재 차이 검수.
2. 실단말 키보드·확대·인앱 확인 30~60분.
3. 다른 작업 diff 비교·통합 30~90분. 공통 파일 전체를 덮어쓰지 않는다.
4. 운영 스키마 비교·백업 계획·최종 DB 리허설 45~90분. 명시적 새 승인 전 실행 금지.
5. 직역 개방·요금/무료기간/세금·최종 약관/재동의·제재 집행·자료 보관·첫 원고 게시 결정. 운영/법률 검토 시간은 별도.
6. 별도 지시 후 main·DB·배포 계획. 이번 지시만으로 운영 계정·예약·제재·설정·실제 알림·결제·유료 AI·자료 게시를 변경하지 않는다.
