# 로그인 복귀 주소 검증 — 2026-10-05

사용자가 이번 미리보기 한 호스트/필요 콜백 추가를 승인함. 기존 미리보기 6ac38c607156b5a3fb2a6986의 로그인 코드가 Production으로 강제 이동하는 문제를 발견하여 수정본을 새 immutable Preview로 배포. 구버전 주소는 추가하지 않고 수정본 주소 하나만 추가함.

| 설정 | 변경 전 | 변경 후 |
|---|---|---|
| Site URL | https://bohumso.netlify.app | 동일 |
| Production reset-password.html | 유지 | 동일 |
| Production account.html | 유지 | 동일 |
| Production auth/confirm | 유지 | 동일 |
| Production account.html?next=** | 유지 | 동일 |
| Redirect URL 개수 | 4 | 5 |
| 추가 주소 | 없음 | https://6ac3902b819dc1d15d0461d2--bohumso.netlify.app/account.html?next=** |

호스트나 콜백 경로 와일드카드를 추가하지 않음. **는 next 쿼리 값만 허용하며 앱에서 허용된 내부 페이지 목록으로 다시 검증함. 저장 직전 중복 없음 확인. 기존 네 항목 덮어쓰기/삭제 없음. Google 공급자 설정, 회원/예약 행, RLS 정책 편집 없음. 로그인 테스트에 따른 통상 인증 세션/로그 갱신만 발생함.

## 실제 브라우저
- 지정된 기존 테스트 계정으로 Production 로그아웃 → Google 로그인 → bohumso.netlify.app/account.html, 회원 가입 완료 확인: PASS.
- 수정 Preview Google 로그인 → 동일 Preview account.html 콜백 → phone-verification.html 복귀 및 인증된 알림함 0개 표시: PASS.
- Production 로그인 next=https://external.invalid/ → 동일 Production account.html: PASS.
- Preview 로그인 next=https://external.invalid/ → 동일 Preview account.html: PASS.
- 이번 주소 작업에서 SMS 발송/전화번호 변경/예약 생성은 하지 않음. 실제 SMS·FCM 수신은 이전과 같이 미검증.

## 코드 검증
- src/account.js: Google 로그인 및 인증메일 복귀 주소를 요청 시작 origin의 account.html?next=...로 생성. Production reset-password 설정은 유지.
- src/member-access.js: 내부 복귀 화면 allowlist, 외부·프로토콜 상대·인코딩된 외부 경로 차단, auth/token 및 중첩 next/redirect 파라미터 제거. 짧은 내부 별칭 포함.
- tests/login-origin-browser.mjs: Production/Preview × 정상/외부 next 네 경우, PKCE 생성 모의 검증 PASS.
- tests/member-gate.test.mjs: 내부경로·회원접근2 PASS. early-access-browser 10시나리오 PASS(모의).
- 최신 Production 코드 배포는 하지 않음. 수정본은 https://6ac3902b819dc1d15d0461d2--bohumso.netlify.app 에만 반영.

증거: outputs/로그인주소-변경전.txt, 로그인주소-변경후.txt, 로그인주소-추가완료.png, 운영-로그인-재검증.png, 미리보기-로그인-완료.png.
