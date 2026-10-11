# 인수인계 — 고객센터 문의 채팅 개발 검수 (2026-10-11)

사용자 최신 첨부 지시 > ROADMAP > CLAUDE.md 순으로 적용한다. 먼저 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 읽는다.

## 현재 상태

- **codex/support-chat**: main b9407a7에서 분리. 고객센터 비실시간 채팅 개발·격리 검수 완료. main 병합·운영 DB 적용·설정 변경·배포 없음.
- 구현 커밋 **b2f4661**, GitHub origin/codex/support-chat 전송 완료. 이 요약을 포함한 후속 문서 커밋은 기능을 바꾸지 않는다.
- 운영의 마지막 확인 배포는 main bab3978 / Netlify 6acb77fcb27b490008a27b4d / 2026-10-11 20:50:32 KST. 전문가 첫 화면 partner에 병원·보험사 자료실 바로가기를 추가한 버전이다.
- 사용자 최신 지시는 고객센터 개발·검수까지만 허용한다. 이전의 일반 배포 지시를 새 SQL/채팅의 운영 승인으로 해석하지 않는다.
- 다음 AI는 이 개발 브랜치와 main을 구분한다. 다른 dirty 작업본에서 강제 checkout/reset하거나 통째로 복사하지 않는다.
- 상세 파일·DB·검수·원복 보고서: [docs/support-chat-20261011.md](docs/support-chat-20261011.md).

## 구현과 판단

소비자/설계사 새 문의·문의 내역, 접수 안내 1회, 운영자 답변·추가 정보 요청, 내부 메모 분리, 5종 상태, 종료 문의 재개, 서버 읽음 위치와 고객센터 새 답변 배지를 구현했다. 실제 화면에서 본 답변까지만 읽음 처리한다. 이전 메시지 읽는 중 강제 스크롤 없음.

자동 응답은 고정 접수 안내만. AI·외부 SMS/메일/푸시·예약/결제 처리를 새로 연결하지 않았다. 회원탈퇴 등 기존 개인정보 권리 요청은 유지했다. 운영자 답변 초안 중 새 메시지가 도착하면 자동 갱신으로 revision을 승격하지 않고 명시적 최신 확인 후 전송한다. 성공 안내가 백그라운드 조회로 사라지는 문제도 고쳤다.

057은 69e9e17의 기존 문의 대화 기반을 재사용했다. 060은 새 상태/유형/역할/접수 안내 표시, 읽음 위치, 기존 함수 백업을 추가한다. 인증 사용자 소유자·관리자 검증, private RLS/직접 접근 차단, 명시적 고객 응답 필드 제한을 유지했다. 내부 메모는 고객 API에도 없다. DB 미적용 환경은 version 감지 후 기존 문의 UI를 유지한다.

## 검증 결과

- 빌드 통과.
- SQL/기존 통합 **29/29 통과**: 신규/기존 접수, 상태, 중복/응답 유실, 권한, 메모 비공개, 읽음, 오래된 문의 우선, AI 차단, 060 반복·원복·재적용.
- 새 실제 빌드 브라우저 검사 통과: 양 역할 접수, 실패 입력 보존, 빠른 연속 제출, 운영자 답변 실패/재전송, 새 메시지와 초안 충돌, 새 가상 로그인, 직접 URL 거부, 상태·읽음·해결/재개, 스크롤 유지.
- 모바일 360/390/430 및 PC1440 가로 넘침 없음, 44px 이상 터치, 텍스트 대비 최소 6.68:1, 페이지 예외 0.
- 기존 브라우저 4개 통과: support-entry-browser, expert-profile-page-browser, home-experts-browser, booking-hardening-browser.
- **미확인**: 실제 Supabase 다중 연결 경쟁, 실단말 키보드/화면 읽기/OS 글자 확대, 실제 Google 재로그인, 운영 쓰기 E2E. 작은 뷰포트·200% 글자/가상 세션 모의와 구분.
- 처음 병렬로 무거운 검사를 띄울 때 Node 메모리 할당 실패/탐색 timeout 발생. 미리보기 종료 후 순차 재실행 통과. 새 실패를 남겨두고 정상이라고 보고한 것이 아님.
- 전체 기존 57개 브라우저 검사는 이번에 다시 모두 실행하지 않았다.
- 화면: docs/support-chat-20261011-screens/. 모두 가상 계정/격리 DB 화면.

## 실행 방법

```powershell
node scripts/build.mjs
node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 --test --test-concurrency=1 tests/support.test.mjs tests/support-integration.test.mjs tests/support-chat.test.mjs
node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 tests/support-chat-browser.mjs
node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 scripts/support-chat-preview.mjs
```

미리보기: 소비자 http://127.0.0.1:8894/support.html · 운영자 http://127.0.0.1:8895/admin.html · 설계사 http://127.0.0.1:8896/support.html.
PC 전용·메모리 DB·프로세스 종료 시 가상 데이터 소멸. 공개 사이트가 아니다. 미리보기 가상 인증을 운영에 배포하지 말 것.
Edge 없는 컨테이너는 tests/playwright-launch.cjs의 PLAYWRIGHT_CHANNEL/PLAYWRIGHT_EXECUTABLE_PATH 설정을 따른다. 패키지 추가 없음.

## 단계와 남은 일

| 단계 | 상태 / 다음 조치 |
|---|---|
| 1~3 화면/검수 + 자료실 진입 | 이전 main 배포 완료 |
| 4 interaction-settings 동기화·운영 패키지 | 별도 작업, 이번 채팅으로 완료됐다고 처리하지 않음 |
| 5 운영 SQL057~059 | GO 057-059 + Supabase 백업 확인 완료 조건 유지 |
| 6 웹 푸시 | 이번 범위 제외 |
| 7 고객센터 최신 첨부 범위 | 개발·격리 검수 완료, 운영 미반영 |
| 8 시간 설정 / 9 2차 운영 패키지 | 이번 범위 제외, 기존 승인 중단점 유지 |

다음 작업:
1. 이 개발 브랜치 검수/공통 파일 병합 범위 확인: 약 30~60분.
2. 문의 본문·내부 메모·접수증의 보관기간/삭제 요청 범위를 대표가 결정. 기존 개인정보처리방침에 별도 구체 기준이 없어 자동 삭제나 영구 보관 약속을 만들지 않았다.
3. 운영과 분리된 Postgres 다중 연결·실제 휴대전화/화면 읽기 검수: 환경 준비 후 약 1~2시간.
4. 운영 SQL/배포 승인 후 최신 운영 스키마 비교·백업·적용 계획 보완. 승인 대기시간과 운영 상황은 예상시간에 포함하지 않음.
운영 실행 승인은 이번 작업에 없음. 별도 승인 전 main에 push하거나 GitHub workflow/Netlify 배포를 시작하지 말 것.

## 원복과 손대면 안 되는 것

- 057 → 060 순서. 각각 단일 transaction. 060 이후 057만 재실행하면 API가 구버전으로 내려가므로 순서 준수.
- supabase/rollback_support_chat.sql: 이전 함수 정의 복원. 메시지/상태/읽음 자료 보존. 057 자체 원복 SQL도 별도 있음.
- Storage, 회원/예약/요금/상담 상태 정책 변경 없음.
- bohumso-ui-release의 codex/interaction-settings는 HEAD204bed6, 원격a4890f7과 다르고 미커밋 변경이 있다. 손대지 않았다.
- 원격 Claude 브랜치 fec525a는 조회했지만 Claude Code 창의 진행 중/미커밋 작업은 확인할 수 없다.
- styles.css/ui-icons.js/member-rights.js/early-operations-admin.js/HTML/빌드/인수인계 파일은 다른 브랜치와 병합 충돌 가능. 원격 support-integration3922c2c의 전체를 덮어쓰거나 이번 것과 중복 도입하지 않는다.
- 아직 깨끗하지 않은 것: 위 실단말/다중 연결 미검증, 보관 정책 미결정, 다른 작업본 미커밋, 4~6·8~9 미완료. 이번 개발 브랜치 검증 완료를 서비스 전체 실운영 완료로 표현하지 않는다.
- 개발 브랜치 커밋에는 [skip netlify] [skip ci]를 붙인다. 강제 push 금지.
