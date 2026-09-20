> 2026-09-20: 자동 재배정 기능과 MATCHING_WORKER_ENABLED 설정은 폐기되었습니다. 기존 DB 적용 이력이 있다면 변경된 003을 재실행하지 마세요. 새 테스트 DB용 001~006을 사용하며 기존 DB에는 별도 이관이 필요합니다. 광고 노출 구독 전환은 미완료이므로 배포 승인을 위한 최종본이 아닙니다.

# 보험소 실배포 런북

> 실행 순서 문서. `docs/release-checklist.md`(Go/No-Go)와 함께 사용한다.
> **원칙:** 각 단계 완료를 확인한 뒤 다음으로 넘어간다. 실결제(`PAYMENTS_ENABLED=true` 운영 전환)와 공개 도메인 노출은 **최종 명시적 승인** 후에만. 모든 플래그 기본값은 false.

---

## 0. 준비 (로컬)
- [ ] `npm ci`
- [ ] `npm run verify` → 14/14 pass 확인 (로컬 빌드+DB/결제 시뮬레이션)
- [ ] 배포 대상 브랜치/커밋 확정 (현재 구현은 미커밋 상태 — 커밋 여부는 사용자 결정)

## 1. Supabase (테스트 프로젝트)
1. [ ] Supabase 테스트 프로젝트 생성 (사용자)
2. [ ] SQL Editor에서 `supabase/_apply_all.sql` 1회 실행
3. [ ] `supabase/_verify_after_apply.sql` 실행 → private 16 / RPC 23 / 민감테이블 직접권한 0 / 구형 쓰기API 권한 0
4. [ ] Auth: 이메일 확인 ON, SMTP 설정, Site URL·Redirect URLs(`/account.html`, `/reset-password.html`, 최종 origin) 등록, 와일드카드 금지
5. [ ] 신규 가입은 테스트 사용자만 허용
6. [ ] 첫 관리자: 인증 완료 사용자 UUID를 `private.admin_memberships`에 수동 insert

## 2. 환경변수 (Netlify — 서버에만)
> 시크릿(`SUPABASE_SERVICE_ROLE_KEY`, `TOSS_SECRET_KEY`)은 대시보드에 직접 입력. 채팅·소스·ZIP·프론트에 넣지 않는다.
- [ ] `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `OPERATOR_NAME`, `PRIVACY_CONTACT`
- [ ] `APP_ORIGIN` = 정확한 최종 origin
- [ ] `TOSS_MODE=test`, `TOSS_CLIENT_KEY`(test_ck_), `TOSS_SECRET_KEY`(test_sk_)
- [ ] 이 시점 활성 플래그는 모두 **false** 유지
- [ ] 로컬에서 동일 값으로 `npm run preflight` (또는 배포 환경 셸) → 형식 검증 통과 확인. `--net`으로 Supabase 도달성까지.
- [ ] SQL 적용(§1) 후 `npm run smoke` → Auth health·PostgREST·`planner_catalog` RPC 실도달 확인(마이그레이션 적용 검증). 배포 후엔 `npm run smoke -- --config https://앱-origin`으로 `/api/config`까지, 결제 검증 시 `--toss`로 토스 키 인증까지.

## 2.1 보안 헤더 / CSP (스테이징에서 검증 후 강제)
`netlify.toml`에 이미 `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options=DENY`, `Permissions-Policy`, 그리고 **`Content-Security-Policy-Report-Only`**(비차단)가 설정돼 있다.
1. [ ] 스테이징에서 지도·결제·인증·가입·방문예약 흐름을 모두 실행하며 브라우저 콘솔의 CSP 위반 보고를 확인
2. [ ] 위반 0 확인 후, `netlify.toml`의 헤더명을 `Content-Security-Policy-Report-Only` → **`Content-Security-Policy`**로 변경해 강제 적용
3. [ ] (선택 강화) HTML의 `onclick=` 핸들러 12개를 `addEventListener`로 리팩터링하면 `script-src`에서 `'unsafe-inline'` 제거 가능
4. [ ] Supabase를 커스텀 도메인으로 쓰면 CSP의 `*.supabase.co`를 실제 도메인으로 교체
5. [ ] 커스텀 도메인 확정 후에만 HSTS(`Strict-Transport-Security`) 추가 — netlify.app 공유 서브도메인에는 `includeSubDomains`/`preload` 사용 금지

## 3. 약관·개인정보 (게시)
- [ ] `docs/policy-drafts/`의 초안 공란을 법률 검토로 확정
- [ ] 확정본을 `public/terms.html`·`public/privacy.html`에 이식 (스타일 유지)
- [ ] `POLICIES_APPROVED=true` (약관 확정 후에만)

## 4. 회원 기능 켜기 (스테이징 검증)
1. [ ] `ACCOUNTS_ENABLED=true`
2. [ ] 재배포 후 `/signup.html`에서 실제 가입→인증메일→로그인→약관 동의 흐름 확인
3. [ ] 역할 교차 접근 차단 실측 (고객/설계사/관리자)
4. [ ] `public-config`가 `enabled:true` 및 공개키만 반환하는지 확인 (서비스롤/토스 시크릿 미노출)

## 5. 결제 테스트 켜기 (테스트 상점)
1. [ ] 토스 상점 대시보드에서 **노출할 결제수단 활성화** — 결제위젯에는 상점에서 켠 수단만 표시됨(카드 기본, 간편결제=카카오·네이버·삼성페이 등은 각각 활성화). 프론트는 결제위젯 `variantKey:'DEFAULT'` 사용
1. [ ] `PAYMENTS_ENABLED=true` (테스트 검증 기간 동안)
2. [ ] 게이트 C 시나리오 실측 (1차/2차 승인, 새로고침/중복클릭, 타임아웃 후 조회, 전액환불+동일 멱등키 재시도, 역순/위조 웹훅 재조회, 분쟁 잔금보류)
3. [ ] 성공 URL 도착만으로 완료 처리되지 않음 확인 (`/payment-result.html`)

## 6. 매칭/지표 (선택)
- [ ] 필요 시 `MATCHING_WORKER_ENABLED=true` (15분 주기 응답 만료 재배정)
- [ ] 수집·보유 안내 확정 후에만 `VISIT_METRICS_ENABLED=true`

## 7. 배포 전 최종 게이트
- [ ] `docs/release-checklist.md` 게이트 A~E 전부 확인
- [ ] 독립 PostgreSQL 동시성 부하검사 완료 — 일회용 Postgres에 `DATABASE_URL=... npm run concurrency` 실행(무료 쿠폰 과다배정·슬롯 이중예약 불변식). 운영/공용 DB 금지, 전용 스키마에 setup 후 정리
- [ ] 도메인 확정 (bohumso.netlify.app 미확보)
- [ ] 운영 데이터 존재 시 구형 요청 전환·동결·백업 계획 완료
- [ ] **최종 사용자 배포 승인**

## 롤백
- 문제 발생 시 활성 플래그를 false로 되돌리면 가입·결제가 즉시 비활성(fail-safe). 재배포/이전 배포로 복구.
- 결제 이상은 실패로 단정하지 말고 `status`/`refund` 재조회 흐름으로 정합. DB 삭제 금지, 조회 이력 보존.

---
### 정책 금액 주의
2단계 결제는 `total_won/2` 균등 분할이다. 홀수 총액이면 1·2차 합이 총액과 어긋나므로 짝수여야 하며, 이는 `connection_policies.total_won` 테이블 CHECK(`total_won%2=0`)로 **DB에서 이미 강제**된다(홀수 insert 거부). 정책 변경 시에도 자동 방지됨.
