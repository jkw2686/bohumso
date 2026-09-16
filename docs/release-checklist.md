# 보험소 배포 전 Go/No-Go 체크리스트

목적: 공개 배포·실결제 활성화 **직전** 확인 게이트. 모든 항목이 완료되기 전까지 공개 배포와 실결제를 켜지 않는다.
전제: 실제 배포/실결제는 별도 명시적 승인이 있기 전까지 수행하지 않는다. (`docs/final-report.md` §9)

상태 표기: [ ] 미완 · [~] 진행/사용자 확인 필요 · [x] 완료

---

## 게이트 A — 데이터베이스 (우선순위 1)
- [~] 테스트 Supabase 프로젝트 생성 (사용자 수행 — 계정/프로젝트 생성은 대행하지 않음)
- [ ] `supabase/_apply_all.sql` 를 SQL Editor에서 실행 (001~006 순서 결합본)
- [ ] `supabase/_verify_after_apply.sql` 실행 → private 테이블 **16**, public RPC **23**, 민감테이블 직접권한 **0**, 구형 쓰기API authenticated 권한 **0** 확인
- [ ] 첫 관리자: 인증 완료 사용자 UUID를 `private.admin_memberships`에 수동 등록
- [x] (로컬 증명) 6개 마이그레이션 순서 적용 + 통합본 단일 실행 적용 성공 — PGlite verify 14/14 pass

## 게이트 B — 계정/인증 (우선순위 1 연장)
- [ ] `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 를 서버 환경변수에만 설정 (시크릿은 채팅·소스·ZIP 금지)
- [ ] 실제 이메일 인증 수신, 만료 링크, 비밀번호 재설정 테스트
- [ ] Auth Site URL / 허용 Redirect URLs 에 최종 origin, `/account.html`, `/reset-password.html` 명시 (와일드카드 금지)
- [ ] 테스트 사용자 외 신규 가입 차단 (앱 + Supabase Auth 양쪽)
- [ ] 역할 교차 접근 차단 실측 (고객/설계사/관리자 격리) — 로컬은 PGlite로 검증됨, 실제 프로젝트에서 재확인
- [x] (코드 게이트) `public-config`는 publishable/anon 키만 노출, 모든 조건 충족 시에만 `enabled:true`

## 게이트 C — 결제 (우선순위 2)
- [~] 토스 **테스트 상점** 클라이언트/시크릿 키 발급 (사용자 수행)
- [ ] `TOSS_CLIENT_KEY`(test_ck_) / `TOSS_SECRET_KEY`(test_sk_) 서버 환경변수 설정, `TOSS_MODE=test`, `PAYMENTS_ENABLED=true`(테스트 검증 동안만)
- [ ] `APP_ORIGIN` 을 정확한 앱 origin으로 설정 (https 또는 localhost)
- [ ] 테스트 상점 시나리오 실측:
  - [ ] 1차/2차 두 단계 승인
  - [ ] 성공 URL 도착만으로 완료 처리되지 않음 (`/payment-result.html`)
  - [ ] 새로고침/중복 클릭 시 재승인 없이 상태 조회
  - [ ] 승인 타임아웃 후 조회로 정합 (불확실 거래는 `payment_status_pending` 유지)
  - [ ] 주문별 전액 환불, 환불 타임아웃 재시도가 동일 멱등키 사용
  - [ ] 역순/위조 웹훅은 저장 주문을 토스에서 재조회 후 반영
  - [ ] 분쟁 중 잔금 보류
- [x] (코드 게이트) 라이브 키 차단(`test_sk_`만), 카드데이터 DB/로그 제외, 부분환불·취소수수료 미구현(임의 설정 안 함)

## 게이트 D — 운영/법률 (우선순위 3)
- [x] 약관·개인정보 **초안** 작성 (`docs/policy-drafts/` — 구현 동작 근거, 미확정 사실은 공란). 라이브 페이지는 "준비 중" 유지
- [ ] 초안의 `[   ]` 공란(사업자정보·보유기간·연결료 법적성격·환불세부·위탁/이전)을 법률 검토로 채우고 확정 → `public/terms.html`·`public/privacy.html`에 이식
- [ ] 실제 사업자 정보, 이용약관, 제3자 제공(대상·목적·보유기간), 위치/후기/방문집계 안내, 삭제·익명화 절차 확정
- [ ] 연결료 모델·직군별 업무범위·표현·환불기준 별도 법률 검토 (코드 동작 ≠ 검토 완료)
- [ ] 실제 제휴 설계사 자격·소속·사진권한·거점좌표·상담가능시간 검증 후 등록
- [ ] `OPERATOR_NAME` / `PRIVACY_CONTACT` 실제 값 설정, `POLICIES_APPROVED=true` 는 문서 확정 후에만
- [ ] 독립 PostgreSQL 연결로 동시 확정/완료/결제/취소 부하검사 추가
- [ ] 운영 데이터 존재 시 구형 요청 전환·동결 계획 + 백업 선행

## 게이트 E — 배포 스위치 (우선순위 4·5, 마지막)
- [ ] `APP_ORIGIN` 및 인증 Redirect URL 최종 주소 일치
- [ ] 도메인 확보 (bohumso.netlify.app 미확보 — 확정 필요)
- [ ] **최종 사용자의 명시적 배포 승인** 확인
- [ ] 배포 후에도 실결제 전환 전까지 test 모드 유지 — 실결제는 새로운 명시적 지시 + 별도 검증 없이는 켜지 않음

---

### 플래그 기본값 (모두 비활성 — fail-safe)
`ACCOUNTS_ENABLED` · `POLICIES_APPROVED` · `PAYMENTS_ENABLED` · `MATCHING_WORKER_ENABLED` · `VISIT_METRICS_ENABLED` = **false**, `TOSS_MODE=test`.
전체 목록은 `config/production.env.example`. 시크릿(`SUPABASE_SERVICE_ROLE_KEY`, `TOSS_SECRET_KEY`)은 서버 전용.
