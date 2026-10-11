# 현재 인수인계 — 고객센터·성장 실천 통합 후보 (2026-10-11)

PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽는다. 사용자 최신 직접 지시가 우선한다.

## 진행
- branch codex/support-chat; 기반 origin/main b9407a7. 고객센터 b2f4661/22b9a10, 메신저 bd6a235 원격 저장. 성장·실천 추가 구현. 운영 DB는 승인 후 적용 완료, main 반영·배포가 다음.
- 사용자가 “DB 적용 후 통합 배포” 승인. 비용 발생·첫 원고 공개는 승인하지 않은 범위.
- 고객센터 전송 후 닫기·답변 열림·초안 보호, 성장 개인 실천/자료 4분류/관리자 검토/수정 재승인/예약 게시 구조. 실제 외부 AI/수집/스케줄러 없음.
- 설명: docs/support-chat-20261011.md, docs/growth-practice-20261011.md. 원복: 22b9a10(메신저), bd6a235(성장 이전), 운영은 b9407a7.

## 검증
- build, SQL 성장11 + 고객센터11, 두 기능 브라우저, expert-profile-page-browser, support-entry-browser 통과.
- 최종 성장 SQL 11건 통과(검토 대기 원고 포함 패키지 두 번 실행). 실제 단말/OS 키보드/다중 Postgres/운영 로그인 및 저장은 별개 미검증.
- node scripts/build.mjs
- node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 --test --test-concurrency=1 tests/growth.test.mjs tests/support-chat.test.mjs
- node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 tests/growth-browser.mjs
- node tests/expert-profile-page-browser.mjs / tests/support-entry-browser.mjs

## 다음
1. 운영 DB 057→060→061 + 첫 원고 검토 대기, 2026-10-11 23:08 KST 적용 완료. 회원2·문의1·예약0 전후 지문 일치. 신규10테이블 RLS/직접 접근 차단, 원고 비공개1, 실천0, 자동게시 OFF 확인.
2. artifacts/support-growth-before.json/fingerprints.json/after.json은 비공개 백업·증거, Git 미포함.
3. main에 후보만 반영→Netlify 한 번 배포→버전/URL 확인. 예상 15~30분. origin/main=b9407a7, HEAD의 조상 확인. 로컬 main은 사용하지 않음.
4. HANDOFF/현재 파일/ROADMAP에 실제 결과 갱신.

## 미리보기
node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 scripts/growth-preview.mjs
- http://127.0.0.1:8894/support.html
- http://127.0.0.1:8895/admin.html#growthAdmin (첫 원고 검토 대기)
- http://127.0.0.1:8896/growth.html
가상 문의4개 artifacts/support-preview-backup.json에서 복원. 원고 첫 미리보기 캡처 docs/growth-practice-screens/first-draft-preview.png. 미리보기와 무거운 테스트 동시 실행하면 6GB PC 메모리 부족 가능.

## 주의
- 다른 bohumso-ui-release 작업본 미커밋은 건드리지 않는다. Claude 실행 창은 확인 못 함. main 로컬은 다른 포인터이므로 origin/main 기준으로 확인.
- 공통 충돌 후보: account.js, member-access.js, build.mjs, admin.html, 인수인계. 기존 예약/지도/노출/요금 파일 변경 없음.
- 실제 개인정보·비밀값을 Git/일반 로그에 넣지 않는다. 새 원고를 자동 승인하지 않는다. 개인 실천과 대화 보관기간/탈퇴 후 삭제시점은 미확정.
- 4~9단계 ROADMAP 전체가 끝난 것은 아니다. 완료 주장 금지.
