# 현재 인수인계 — 미팅 후 평점·양방향 확인 (2026-10-12)

PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽는다. 최신 사용자 지시가 우선한다.

## 현재 상태

- 브랜치 codex/meeting-feedback, 시작점 08e2d6f. 이전 UI·전문가 통합 완료분을 유지한 후 이번 평가 기능을 이어서 개발했다.
- 소비자 선택 별점/태그/공개 동의, 설계사 독립 비공개 답변, 조건부 시점, 기존 예약 문제 확인을 구현·격리 검수했다.
- 관리자 원문 비교·선제안·불일치·메모·확인 상태, 프로필 집계, 기존 지도 정렬 보존을 구현·격리 검수했다. 자동 제재 없음.
- 065 후보: private 5개 테이블, 고객 방문 완료 확인 시각, 기존 함수 3개 백업/wrapper. 데이터 삭제·컬럼 삭제·타입/Storage 변경 없음.
- 운영 DB·설정·배포·main·실제 고객 설문·외부 발송·비용 실행 없음. 과거 승인을 새 운영 승인으로 재사용하지 않는다.

## 검증 재현

    node scripts/build.mjs
    node scripts/test-meeting-feedback.mjs
    node --test tests/feedback-ordering.test.mjs
    node --liftoff-only --no-wasm-tier-up tests/meeting-feedback-browser.mjs
    node tests/requests-page-browser.mjs
    node tests/profile-usability-browser.mjs

빌드, SQL 3개 시나리오, 정렬 단위 1개, 새 브라우저 및 기존 예약/프로필 회귀 통과. 메모리 제약으로 무거운 검사는 하나씩 실행한다. 실제 고객/운영 연결은 사용하지 않는다.
- 360/390/430/1440px, 루트 글자 200%, 터치, 실패/재시도/재조회, 중복 제출, 방문 실제 만남 확인, 관리자 메모 보존 확인.
- 보고·화면: docs/meeting-feedback-20261012.md, docs/meeting-feedback-screens/.
- 원시 브라우저 결과: docs/meeting-feedback-browser-results.json.
- 상시 미리보기 서버나 공개된 새 버전 URL 없음. 캡처는 가상 자료다.

## 판단·원복

- 기존 필수 본문·평점·공개 동의 후기 구조를 삭제하지 않고 비공개 응답을 추가 저장한다. 같은 만남의 새 답변이 기존 후기보다 우선하며 이중 집계하지 않는다. 공개 동의 철회 후 옛 점수가 살아나지 않는다.
- 신규 평균/건수/태그만 프로필에 표시. 기존 후기 기반 순서값을 유지하며 새 평균을 지도 순위에 쓰지 않는다. 요금·반경·노출·제재 정책 변경 없음.
- 평균 공개 기준 private.feedback_policy.minimum_public_count는 NULL. 5건 제안만 했고 적용하지 않았다. 테스트의 2건은 가상 DB 전용.
- 한쪽의 설계사 선제안은 시점이 도움 이후여도 확인 대상. 미응답/모름/낮은 점수로 위반을 확정하지 않는다.
- supabase/rollback_meeting_feedback.sql은 함수 복원·새 RPC 중단·데이터 보존. 기존 후기와 겹친 새 응답이 있으면 공개 동의 보호 검토 없이 원복하지 못하게 중단한다.
- 코드 원복 기준 08e2d6f. 전체 reset으로 다른 변경을 덮지 않는다.

## 아직 확인하지 않은 것·충돌

- 실제 휴대전화 키보드/카카오/OS 확대/화면 읽기, 운영 PostgreSQL 다중 연결 경합, 실제 OAuth/SMS 왕복 및 운영 전후 데이터 비교는 미확인.
- 평균 공개 건수와 추가 운영 답변·이력의 보관/삭제 정책 결정 필요.
- 065는 이 브랜치 062~064 이후 검증했다. 운영 스키마·migration 번호 비교·운영 백업은 미실시. 이전 전문직 약관·설정 결정도 남아 있다(docs/expert-integration-20261012.md).
- 다른 bohumso-ui-release dirty 작업본을 수정하지 않았다. Claude Code 현재 실행 작업은 직접 확인하지 못했다. account.css, workflow, consultation-ui, map/home-map, expert-profile-card, RPC wrapper, 인수인계 문서 병합 충돌 가능.
- 기존 전체 로드맵의 운영 검증·제재 집행 완료를 의미하지 않는다.

## 다음 순서·예상 시간

1. 총괄 화면/기능 검수 및 평균 공개 기준·보관 정책 결정.
2. 실제 단말 검수 30~60분 예상.
3. 다른 브랜치 diff·SQL 번호 비교/통합 30~90분 예상.
4. 별도 운영 승인 후 스키마/권한 비교·백업·원복 계획·적용 리허설 30~60분 예상. 차이가 있으면 추가 확인.
5. 승인 범위에서 운영 적용·배포·확인. 이번 지침으로 실행하지 않는다.
