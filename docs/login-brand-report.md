# 로그인·브랜드 반영 (2026-10-01)

공개 배포 없음. 새 로고팩 원본을 public/brand에 저장.

## 버튼 확인
- 구글: 로컬 → 기존 공개 로그인 화면 → Google 인증 화면 이동 확인. 사용자 동의/실계정 완료 미검증. 로컬 OAuth 별도 키가 없으므로 기존 서비스로 연결하며 로컬 세션과 통합되지 않음.
- 카카오: 준비중·비활성. 서버는 KAKAO_LOGIN_ENABLED=true 및 키 설정 시 재활성 가능(UI 비활성도 해제해야 함).
- 체험: 가입 없이 상황 선택 진입 확인.
- 가입 다음/완료: 형식 검사, 서약 필수, 미인증 전문가 가입 검증.
- 상담 신청/동의/내 신청: 복구 및 검증. 누락됐던 myRequests 함수 복원.
- 전문가 번호 조회/연락함/완료/고객 평가/관리자 경보: 테스트 통과.
- 예약 시간: 10~17시 시작 허용, 18시·반시간·과거 차단 확인.
- 전 화면의 모든 버튼 조합을 전수 완료했다고 주장하지 않음. 공개 결제/실회원 생성은 검사 제외.

## 브랜드
헤더 가로형, 가입 입구 세로형, manifest 앱아이콘 SVG/1024 PNG, favicon 32 PNG 및 apple touch 적용. --blue=#1E4FD6, --brand는 해당 토큰 참조. public/src의 이전 브랜드 문자열 검색 결과 없음.

## 변경 파일
- CLAUDE.md
- PROJECT_BRIEF.md
- design-system.md
- public/account.html
- public/admin-requests.html
- public/admin.html
- public/analysis.html
- public/consult.html
- public/dashboard.html
- public/diagnosis.html
- public/find.html
- public/index.html
- public/login.html
- public/map.html
- public/partner-work.html
- public/partner.html
- public/payment-result.html
- public/requests.html
- public/reset-password.html
- public/signup.html
- public/styles.css
- public/test-flow.html
- public/visual.css
- scripts/test-flow.mjs
- src/social-auth.js
- src/test-flow/signup.js
- src/test-flow/social-server.mjs
- src/test-flow/ui.js
- tests/signup-simple-browser.mjs
- tests/social-server.test.mjs
- public/brand/* (로고팩 20개)
- public/brand.css
- public/manifest.webmanifest
- tests/login-brand-browser.mjs
- docs/login-brand-report.md

고객센터 FAQ·상황 연결·문의 접수·관리자 답변·FAQ 추가·Escape 닫기 검사 통과. tests/support-browser.mjs의 이전 summary 선택자를 현재 UI에 맞게 제거.
추가 변경: src/social-auth.js, tests/support-browser.mjs.

