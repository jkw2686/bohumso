이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 '다음 할 일'부터 진행.

# 인수인계 — 2026-10-01

## 완료
- 4f1b57f: 새 로고팩 public/brand/* 20개 적용. public/*.html 헤더·favicon·apple-touch-icon·manifest, brand.css, --blue #1E4FD6. 슬로건 반영.
- src/test-flow/signup.js: 소비자 3단계/전문가 5단계, 직접 연락처 입력, 문자 인증 제거. 서류 선택/서약 필수/미인증 등록.
- src/test-flow/social-server.mjs: 별도 로컬 OAuth 처리와 명시적 demo. 카카오 준비중 비활성, 서버 KAKAO_LOGIN_ENABLED 추가 조건. 키 없음 시 구글은 기존 공개 로그인 화면으로 이동.
- src/test-flow/ui.js: 누락 myRequests 함수 복원. 상담 신청→내 신청→전문가 연락처 열람/상태→평가→관리자 경보 검사 통과.
- 테스트 체험 시작은 가입 없이 /claim?step=1 이동.
- tests/login-brand-browser.mjs: 360px, 로고 로딩, 카카오 비활성, 체험 진입, 공개 로그인→Google 인증 화면 확인.
- tests/signup-simple-browser.mjs, social-server.test.mjs, booking-hours.test.mjs, contact-browser.mjs, support-browser.mjs 통과. 빌드 통과.
- 세부 변경 파일: docs/login-brand-report.md. OAuth 설정: docs/social-login-setup.md.

## 현재 멈춘 지점
기능 작업은 4f1b57f로 저장 완료. 현재는 상시 인수인계 규칙을 AGENTS.md에 기록하고 이 문서/원격 저장을 준비하는 지점. 미완료 코드 편집 없음. 다음 개발 시작점은 src/test-flow/signup.js의 소셜 로그인 진입 부분(파일 앞부분).

## 다음 할 일
1. git status와 원격 상태 확인. 신규 변경과 충돌하지 않도록 최신 사용자 지시 확인.
2. 구글 공개 로그인과 로컬 테스트 앱이 분리된 구조를 통합할지 결정하고 구현. 현재 로컬 버튼은 공개 login.html로 이동 후 Google 버튼을 한 번 더 누르는 흐름이다. 로컬에 로그인 세션이 돌아온다고 주장하지 말 것.
3. 모든 화면 버튼 전수 검사 계속. 현재 핵심 흐름만 E2E 통과; 모든 조합 검사 완료 아님.
4. 실서비스 준비 시 테스트 계정 전환/관리자 도구 격리, 영속 사용자 저장, 실제 OAuth 동의/콜백 E2E 검증.
5. 배포 요청 시 public 앱과 로컬 test-flow를 혼동하지 말고 diff/미리보기 확인 후 필요한 파일만 배포.

## 알려진 제한
- 구글: Google 인증 화면 이동까지만 검증. 사용자 계정 선택 이후 실제 완료는 미검증.
- 카카오: 준비중. 키+서버 플래그+UI 활성 변경 필요.
- .env.social.local은 Git 제외 로컬 비밀 설정. 키값은 출력/커밋하지 않는다.
- 로컬 소셜/소비자 정보는 서버 세션 저장, 재시작 소멸. 실회원/영속 권한 시스템 아님.
- 현재 지역 선택 일부 테스트 지역만 지원. 지도 실제 위치는 브라우저 권한/장치 정확도 영향.
- 신규 로고와 최근 가입 작업은 공개 배포하지 않음. 크레딧 상태는 이번 작업에서 확인하지 않았으므로 부족하다고 단정하지 않음.
- docs/claude-to-codex-handoff.md는 기존 미추적 타 AI 문서로 보존. 이번 커밋에 포함하지 않음.

## 경로와 링크
- 저장소: https://github.com/jkw2686/bohumso
- 기능 커밋: https://github.com/jkw2686/bohumso/commit/4f1b57f (원격 push 성공 확인 필요)
- 최신 로컬 미리보기: http://127.0.0.1:3201/signup.html (외부 접속 불가)
- 예전 로컬 3200은 오래된 서버일 수 있음. 최신은 3201.
- 공개 사이트: https://bohumso.netlify.app/ (최근 변경과 다름)
- 루트: C:/Users/AdMins/Documents/bohumso-netlify

## 주의
PROJECT_BRIEF.md·CLAUDE.md·design-system.md 및 AGENTS.md 준수. 소비자 직접 선택/연락 개시, 정보 살포 금지, 건당 과금 금지, 서류량 노출조절 금지. 공개 서비스 Supabase와 로컬 PGlite를 혼동하지 말 것. 명시적으로 승인된 배포라도 로컬 관리자 역할 전환을 공개하지 말 것.
