# 인수인계 (Claude → Codex) — 2026-09-22

우리곁에 보험소(bohumso) 풀앱. 이 문서는 Claude 세션 종료 시점의 현재 상태와 다음 작업을 정리한다.
**규칙은 항상 `CLAUDE.md`·`design-system.md` 준수** (자동매칭 금지·건당과금 금지·정액 광고구독만·네이비 디자인 토큰).

## 접속/환경
- 코드: `C:\Users\AdMins\Documents\bohumso-netlify` · GitHub: `jkw2686/bohumso` (main push→Netlify 자동배포)
- 라이브: https://bohumso.netlify.app · 어드민: https://bohumso.netlify.app/admin-requests.html
- Supabase ref `xyexphhspykwwlhfokfl` (리전 Sydney ap-southeast-2)
- 스택: 정적 HTML/CSS/JS + esbuild(`npm run build` → src/account.js·visit.js를 public/assets/로 번들) + Netlify Functions(.mts) + Supabase + Toss(테스트)
- `public/assets/account.js`는 **gitignore**(빌드산출물). 소스는 `src/account.js`. Netlify가 배포 때 빌드함.

## ⚠️ 지금 당장 확인할 것 (in-flight)
1. **Netlify 자동배포 멈춤(확실)**: 커밋 `0c30d17`·`01741eb` 등 여러 푸시가 **약 10분+ 재시도에도 라이브 미전파**. `curl -s https://bohumso.netlify.app/login.html | grep facebookLogin` 아직 매치(=옛버전). 로컬 `npm run build` 통과하므로 코드 문제 아님. → **Netlify Deploys 페이지(https://app.netlify.com/projects/bohumso/deploys)에서 최신 배포 상태 확인 필수**: (a) Failed(빨강)면 빌드 로그 확인, (b) Building/Queued면 대기, (c) 아무 배포도 안 생겼으면 GitHub 연동 끊김/자동배포 중지 → Site configuration → Build & deploy에서 재연결/재개. 마지막으로 확실히 전파된 커밋은 `4eb5bf8`(kakao scope) 무렵.
2. **회원가입 버튼 "반응 없음" 이슈**: 원인은 **동의 체크박스(signupPrivacy) 미체크 시 조용히 막힘**(`src/account.js` consent()). 사용자가 체크 안 하고 눌러서 반응 없어 보임. → **개선 필요: 동의 미체크 시 눈에 띄는 피드백**(체크박스 하이라이트/메시지 스크롤). 법적 동의라 게이트 자체는 유지.

## 이번 세션 완료 (라이브 반영됨, 0c30d17 제외)
- **어드민 콘솔 통합·배포**(admin-requests.html + admin-console.js/.css). 008 라이브 적용. account.js/workflow.js admin 워크스페이스 위 UI층.
- **결제(광고구독) 백엔드 ON**: Netlify env(PAYMENTS_ENABLED=true,TOSS_MODE=test,TOSS_CLIENT_KEY=test_gck_,TOSS_SECRET_KEY=test_gsk_,APP_ORIGIN) 등록·검증(`/api/payment` 4단계 통과). 요금제 basic=월3만원 DB 반영, 수도권 슬롯 활성.
- **DB 마이그레이션 001~009 전부 라이브 적용 + private.schema_migrations 이력 기록**(자동화 켜면 010부터).
- **Codex 이전작업 배포**: 브랜드 "우리곁에 보험소"(우리동네→우리곁에), social-auth 상태 명확화, 009 설계사 가용시간.
- **간편로그인 구글=완성**: Google Cloud `bohumso-auth` OAuth 웹클라이언트, Supabase external.google=true, authorize 리디렉트 검증. **로그인/가입 UI를 구글(맨위)+카카오만 남기고 네이버·애플·페북 삭제**(0c30d17, 미전파).
- **사용자 계정**: jkw2686@gmail.com (auth.users id `089a8ca3-a1aa-4306-9f07-2c30a903d5ff`) 가입·인증 완료, **admin_memberships 등록=관리자**. 로그인만 하면 어드민 사용 가능.

## 남은 로드맵 / TODO
1. **배포 전파 문제 해결**(위 in-flight #1) — 최우선.
2. **회원가입 UX 개선**(위 #2) + **이메일 확인 끄기**: Supabase Auth → "Confirm email" OFF 권장(mailer_autoconfirm=false라 신규 가입자가 확인메일 필요 → 지인 테스트 불편). Supabase 대시보드에서 토글.
3. **카카오 로그인 미완**: 카카오 앱(ID 1586338) 등록·Redirect URI·Client Secret·external.kakao=true 다 됐으나, **개인 카카오앱은 account_email "권한 없음"**이고 Supabase가 account_email 강제 요청 → **KOE205**. 해결=카카오 **비즈니스 앱 전환(사업자번호)** 후 이메일 권한 신청. 그전까지 카카오 버튼은 "준비 중" 비활성 유지. (Supabase Kakao provider scope에서 account_email 제거는 대시보드에 없음; 클라 scope override는 append돼 무효—시도했다 되돌림.)
4. **카드결제 실제 테스트**: 결제창은 승인된 설계사/관리자 로그인 시 `/partner-work.html` 광고구독 섹션에 뜸. 실제 카드클릭 테스트하려면 승인된 설계사 계정 필요. (원하면 사용자 계정을 planner_directory에 넣어 테스트 가능.)
5. **마이그레이션 자동화 완성**: `.github/workflows/migrate.yml`+`scripts/migrate.mjs`. GitHub `DATABASE_URL` 시크릿을 **Session pooler** 문자열로 교체해야 작동: `postgresql://postgres.xyexphhspykwwlhfokfl:[PW]@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres` (비번 특수문자 percent-encode). 이력은 이미 시드됨.
6. **운영자명 불일치**: 브랜드는 "우리곁에 보험소"인데 Netlify `OPERATOR_NAME`=아직 "우리동네 보험소"(푸터 법적표시). 통일 필요(Netlify env 수정).
7. **상위 요금제**(프리미엄·지역독점) 가격 미정 비활성 — 정해지면 `supabase/seed_ad_pricing.sql` 방식으로 반영.

## DB 직접 접근 (중요)
- 이 PC에서 pg로 라이브 DB 직접 SQL 실행 가능(마이그레이션·시드·계정관리 이렇게 처리해옴). Session pooler: host `aws-0-ap-southeast-2.pooler.supabase.com`, port 5432, user `postgres.xyexphhspykwwlhfokfl`, db postgres, ssl(rejectUnauthorized:false).
- **DB 비밀번호는 사용자만 보유(어디에도 저장 안 함)**. 필요 시 사용자에게 재요청. Netlify env 수정(비번 재설정 등)은 auto-mode classifier가 "shared resource"로 막을 수 있음 → 사용자 승인 필요.
- **시크릿 값(DB비번·Toss secret·Kakao/Google secret)은 이 문서/코드/깃에 저장 금지.** 위치만 참조.

## 검증
- `npm run build` (functions 컴파일+키누출 검사), `node tests/admin-console.cjs`, `node --test tests/*.test.mjs`.
- ⚠️ 이 PC는 메모리 부족으로 PGlite 테스트가 "Array buffer allocation failed"로 로컬 실패함(로직결함 아님). GitHub Actions verify.yml에서 깨끗이 검증됨.
- 배포 검증: `/api/config`(enabled·operator), `/api/payment`(결제 config), `/auth/v1/settings`(소셜 provider), authorize 리디렉트.
