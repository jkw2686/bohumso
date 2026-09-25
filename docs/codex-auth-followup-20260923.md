# Codex 간편 로그인 후속 작업 (2026-09-23)

- Claude HANDOFF_CODEX.md를 읽고 이어받음. 실제 서비스는 https://bohumso.netlify.app 이며 keen-sorbet 공유 주소는 비활성 정적 미리보기임.
- 공개 서비스 읽기 전용 재검증: 홈/가입/로그인/계정/복구 HTTP 정상, 회원 기능 활성, 이메일 가입 허용, Google/Kakao provider 활성. provider 활성은 실제 로그인 성공 검증이 아님.
- 가입 필수 개인정보 동의 누락 시 체크박스로 스크롤·포커스, aria-invalid, 가까운 role=alert 안내 추가. 체크하면 오류 안내 해제. 동의 게이트 유지.
- 가입 회귀 검사의 삭제된 Naver/Apple/Facebook 버튼 기대를 현재 Google/Kakao UI에 맞춤. 동의 누락 시 포커스/인접 안내도 검사.
- 프로덕션 빌드 통과. 브라우저 회귀 첫 실행은 로컬 화면 로딩 30초 초과, 재실행은 전체 통과(모의 인증, 360px, 이메일/복구 복귀, Google/Kakao PKCE, 비관리자 차단).
- 변경 파일: src/account.js, public/signup.html, tests/browser-smoke.cjs. scripts/_pw.mjs는 기존 미추적 파일로 수정하지 않음.
- 배포/DB 변경/이메일 발송/실결제/이메일 인증 해제/실제 설계사 승인 없음.

## 남은 확인
- Claude 기록의 Netlify 프로덕션 크레딧 소진은 이번 작업에서 관리자 화면으로 재확인하지 않음. 반복 배포나 유료 업그레이드 하지 않음.
- Kakao KOE205 및 account_email 권한은 Claude 인계상 미해결. 공개 provider 활성값과 UI 활성화가 실제 사용 가능 여부와 다를 수 있으므로 실제 권한 해결 또는 준비중 표시 정책 확정 필요.
- Google 실제 왕복 로그인은 사용자 세션에서 확인 필요. 공개 authorize 설정/모의 PKCE 성공을 실제 로그인 완료로 간주하지 않음.
- 실 서비스 결제는 인계상 테스트 키 연결됨. 정적 공유본의 결제 404를 실 서비스 결제 미구현으로 혼동하지 말 것.
