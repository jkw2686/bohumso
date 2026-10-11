# 현재 인수인계 — 고객센터·성장 실천 통합 배포 완료 (2026-10-11)

PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽는다. 사용자 최신 직접 지시가 우선한다.

## 진행
- branch codex/support-chat; 운영 main 942dcc7. 고객센터 b2f4661/22b9a10, 메신저 bd6a235, 성장598d334. 사용자 승인 후 DB 적용 및 통합 배포 완료.
- 사용자가 “DB 적용 후 통합 배포” 승인. 비용 발생·첫 원고 공개는 승인하지 않은 범위.
- 고객센터 전송 후 닫기·답변 열림·초안 보호, 성장 개인 실천/자료 4분류/관리자 검토/수정 재승인/예약 게시 구조. 실제 외부 AI/수집/스케줄러 없음.
- 설명: docs/support-chat-20261011.md, docs/growth-practice-20261011.md. 원복: 22b9a10(메신저), bd6a235(성장 이전), 운영은 b9407a7.
- Netlify 배포 6acb993f62318600085a5151, 2026-10-11 23:12 KST ready/published, main942dcc7 일치. 이전 운영 배포 6acb77fcb27b490008a27b4d. 실제 공개 https://bohumso.netlify.app/.
- 기존 로그인 세션에서 전문가 첫 화면→성장, 고객센터 기존 문의1 및 새 대화창, 관리자 비공개 첫 원고 전체보기 확인. 운영 메시지/실천 저장·원고 공개는 실행하지 않음.

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
3. 배포 후 확인 완료. 다음 작업은 실제 단말 키보드/접근성 검수(30~60분), 보관 기간·탈퇴 후 삭제 시점 결정(운영자 결정 필요).
4. 외부 수집/AI/스케줄러는 미연결. 공급자·모델·월 상한 제시 및 비용 승인 이후 별도 구현/검증(예상 2~4시간, 공급자 범위에 따라 변동). 원고 공개도 별도 검토·승인이 필요.
5. 기존 ROADMAP4~9는 완료 처리하지 않음. 다음 담당자는 해당 단계와 기존 멈춤 조건을 먼저 확인.

## 미리보기
node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 scripts/growth-preview.mjs
- http://127.0.0.1:8894/support.html
- http://127.0.0.1:8895/admin.html#growthAdmin (첫 원고 검토 대기)
- http://127.0.0.1:8896/growth.html
가상 문의4개 artifacts/support-preview-backup.json에서 복원. 원고 첫 미리보기 캡처 docs/growth-practice-screens/first-draft-preview.png. 미리보기와 무거운 테스트 동시 실행하면 6GB PC 메모리 부족 가능.
현재 통합 미리보기 프로세스 실행 중(session3863). 새 원고 ID는 재실행 시 바뀌지만 기존 문의 링크4개는 백업에서 복원한다.

## 주의
- 다른 bohumso-ui-release 작업본 미커밋은 건드리지 않는다. Claude 실행 창은 확인 못 함. main 로컬은 다른 포인터이므로 origin/main 기준으로 확인.
- 공통 충돌 후보: account.js, member-access.js, build.mjs, admin.html, 인수인계. 기존 예약/지도/노출/요금 파일 변경 없음.
- 실제 개인정보·비밀값을 Git/일반 로그에 넣지 않는다. 새 원고를 자동 승인하지 않는다. 개인 실천과 대화 보관기간/탈퇴 후 삭제시점은 미확정.
- 4~9단계 ROADMAP 전체가 끝난 것은 아니다. 완료 주장 금지.
