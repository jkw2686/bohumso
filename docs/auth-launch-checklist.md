# 가입·로그인 최종 연결 점검

2026-09-20 Codex 읽기 전용 확인. 공개 주소: https://bohumso.netlify.app

## 확인한 사실
- 홈 /signup.html /login.html /account.html /reset-password.html: HTTP 200.
- /api/config: 회원 기능 활성, Supabase 공개 설정 응답 정상.
- Supabase 공개 인증 설정: 이메일 활성, 신규 가입 허용, Kakao/Google 비활성.
- 공개 planner_catalog 조회 정상. 이 결과가 고객 간 접근 격리나 전체 DB 이관 완료를 증명하지는 않음.
- 운영자 정보의 진위, 정책 검토 여부는 확인하지 않음.
- 기존 공개 배포와 이번 로컬 변경은 별개. 이번 점검에서 배포하지 않음.

## 사용자가 수동으로 설정할 값
Supabase → Authentication → URL Configuration:
- Site URL: `https://bohumso.netlify.app`
- Redirect URLs: `https://bohumso.netlify.app/account.html`
- Redirect URLs: `https://bohumso.netlify.app/reset-password.html`

현재 코드는 가입 이메일과 소셜 로그인에서 /account.html, 복구 이메일에서 /reset-password.html로 복귀를 요청함.
운영 주소는 정확한 경로 등록을 권장. 공개 설정 API로 Site URL/allowlist 값을 확인할 수 없으므로 저장 여부는 미확인.
[Supabase 복귀 주소 문서](https://supabase.com/docs/guides/auth/redirect-urls)

Kakao / Google:
1. Supabase Authentication → Providers에서 해당 provider의 Callback URL을 복사.
2. 각 개발자 콘솔의 Redirect URI에 그 Callback URL을 등록. 일반적인 형식은 `https://<project-ref>.supabase.co/auth/v1/callback`. 실제 표시값을 사용.
3. 카카오는 REST API 키 및 Kakao Login Client Secret, 구글은 OAuth Client ID/Secret을 해당 Supabase provider 설정에 입력하고 활성화.
4. 키는 채팅·소스·브라우저 코드에 저장하지 않음.
[카카오 공식 가이드](https://supabase.com/docs/guides/auth/social-login/auth-kakao) · [구글 공식 가이드](https://supabase.com/docs/guides/auth/social-login/auth-google)

## 로컬 보강
- 미연결 소셜 버튼은 준비 중으로 비활성화. 설정 조회 실패 때도 이메일 폼은 유지.
- provider 활성화 이후 새로고침하면 실제 공개 설정에 따라 버튼 활성화. 이 보강은 아직 배포하지 않음.
- 이메일 가입과 간편가입 동의 누락, 이메일/복구 복귀 주소, OAuth PKCE 요청, 비활성 provider, 360px 표시를 모의 브라우저 검사.
- 이 검사는 실제 이메일 수신·카카오/구글 로그인 성공을 대신하지 않음.

## 실제 왕복 확인 (미완료)
본인 이메일로 가입 → 받은 메일에서 인증 → 내 계정 복귀 → 필수 동의 → 로그아웃/재로그인.
복구 메일 → 비밀번호 변경 → 새 비밀번호 로그인. PKCE 메일 테스트는 우선 요청한 같은 브라우저에서 진행.
카카오/구글 각각 로그인 → 내 계정 → 동의 → 새로고침 후 유지. 취소 시 재시도 가능 여부도 확인.
소비자/전문가/관리자 권한과 다른 고객의 예약 접근 차단은 별도 실제 계정 검사 필요.

## 반복 점검
`node scripts/check-public-auth.mjs`는 공개 페이지·공개 인증 설정·설계사 공개 목록만 확인.
결과는 `artifacts/public-readiness.json`. 키·연락처·원본 응답은 보고서에 저장하지 않음.
provider 활성은 성공한 로그인과 구분해 표시. 메일 발송·계정 생성·결제·DB 변경 없음.
기존 Supabase DB에는 `_apply_all.sql`을 재실행하지 말 것. 현재 스키마 확인과 별도 이관 검토 필요.
