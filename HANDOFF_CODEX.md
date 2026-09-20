> Codex 진행 기록 — 2026-09-20
> ① 직접 선택 필수화 완료: UI 자동매칭/다음 후보 제거, 서버 automatic 요청 거부, rank/offer/만료 워커 제거, DB automatic=false 제약. 신규 테스트 DB용 SQL 통합본 갱신.
> 전체 verify 통과 (2026-09-20T09:04:31.446Z): 빌드·DB/PG·가입 회귀·360px/PC 모의 흐름. 실제 Supabase/PG 미검증, 배포 없음.
> ② 광고 노출 구독 전환은 미완료. 현재 상담별 결제 구현은 이전 모델이며 운영 활성화 금지. 아래 ①의 파일 안내는 변경 전 이력으로 보존.
> 기존 003 적용 DB에는 수정된 003을 재실행하지 말 것. 기존 DB용 전환 마이그레이션은 별도 필요.

# 인수인계 (→ Codex) — 우리동네 보험소
작성: 2026-09-20 (KST) · 이전 세션(Claude)에서 인계

## 0. 지금 바로
- 작업 프로젝트: `C:\Users\AdMins\Documents\bohumso-netlify` (git repo, 브랜치 `feature/consultation-commerce`)
- 먼저 읽을 것: 이 문서 → `CLAUDE.md`(마스터 규칙) → `design-system.md`(네이비 가드레일) → `docs/final-report.md`
- **실배포·실결제 금지**(명시 승인 전). 토스 test-only(라이브 차단). Supabase 프로젝트 아직 없음(사용자가 생성). 시크릿은 채팅/프런트/repo에 넣지 않음. 사업자·검증 사실 지어내지 말 것(미확정은 공란).

## 1. 확정된 방향 (사용자 지시)
기존 풀앱을 **그대로 유지**하되(네이비 디자인·지도·회원가입·전 기능), 합법 구조를 위해 **모델 2가지만 변경**한다.
- 디자인: 예전 네이비 컬러 유지. `design-system.md` 토큰만 사용(하드코딩 금지). "앞으로 안 깨지게"가 목적.
- **합법 원칙(CLAUDE.md §1~3, 위반 불가):** 소비자가 먼저 선택·연락 / 고객정보 제3자 분배·판매 금지 / **연결·성사·연락처 트리거 과금 금지(정액 구독만)** / 지급보장 표현 금지 / 명명 규칙(`lead·건당·per_connection·성사·소개비` 금지 → `impression·ad_subscription·exposure_credit·slot·guaranteed_impressions`).

## 2. 남은 작업 (우선순위)

### ① 자동매칭 제거 → 소비자 직접 선택만 (착수 직전, 미완)
목록에서 소비자가 직접 고르는 것만 허용. 자동배정·다음후보·매칭워커 전부 제거.
- `src/workflow.js` 요청폼(~L80-92): **자동매칭 체크박스(`automatic`) 제거**, `planner_id` **선택 필수**(빈 '자동매칭' 옵션 제거), 제출 시 `automatic:false`+선택된 planner. **'다음 후보 찾기'(rematch) 버튼 제거**(~L60).
- `supabase/003_consultations.sql` `consultation_command`:
  - `'request'`: `target`(planner_id) not null 필수, automatic 거부, **`offer_next` 호출 제거**.
  - `'pass'`: 설계사 거절은 유지하되 **automatic 재offer 분기 제거**(state는 unmatched로 두고 재배정 안 함).
  - `'rematch'`: 분기 **전체 제거**.
  - `private.rank_planners`·`private.offer_next` **삭제**(자동매칭 엔진). ⚠️ `private.specialty_match`는 **유지**(→ `planner_catalog` 검색 필터에 쓰임, 자동매칭 아님).
- `supabase/005_matching_worker.sql` + `netlify/functions/matching-sweep.mts`: `expire_consultation_offers` **제거/무력화**. (`MATCHING_WORKER_ENABLED` 이미 기본 false)
- 컬럼 `consultations.automatic/excluded/response_deadline`: 남겨도 무해(automatic 항상 false). 정리하려면 제거 가능.
- 테스트 갱신: `tests/commerce-browser.cjs`(자동흐름 `request(2,true)`·'이번 상담 패스'→'다음 후보' ~L37), `tests/commerce.test.mjs`·`access.test.mjs`·`commerce-edge.test.mjs`의 automatic/offer/expire 케이스. → `npm run verify` 통과시킬 것.

### ② 건당 과금 → 설계사 정기결제(구독) (더 큼, 별도)
상담 건당 2단계 결제 폐기 → **노출슬롯 구독 정액**(베이직/프리미엄/지역독점). 환불=약정 노출 미달(플랫폼 귀책)만. **연결수는 display-only**(과금·환불·정산과 절대 연결 금지).
- 대상: `supabase/004_payment_ledger.sql`(건당 주문/원장 → 구독), `netlify/functions/payment.mts`·`payment-webhook.mts`·`_shared/payments.mjs`, `src/workflow.js` 설계사 결제 UI, `003`의 가격정책(connection_policies).
- 제거 대상 용어/구조: `connection_checkout`·`consultation_orders`(건당). 도입: `ad_subscription`·`exposure_credit`·`slot`·`guaranteed_impressions`.

## 3. 이번 세션에서 한 것
- 배포 준비 도구 일체(committed): `docs/release-checklist.md`·`deploy-runbook.md`·`code-review-notes.md`·`policy-drafts/`, `scripts/preflight.mjs`·`smoke.mjs`·`concurrency-test.mjs`, `.github/workflows/verify.yml`, `supabase/_apply_all.sql`·`_verify_after_apply.sql`, 보안헤더(Report-Only CSP).
- 결제창 → **토스 결제위젯**(카드+간편결제) 전환 (commit 60fd7a9).
- `/api/config` 미배포 시 graceful degrade (commit b5fd77a).
- **CLAUDE.md·design-system.md를 네이비 풀앱 방향으로 정리(미커밋)** — 스타터 파일이 "랜딩만/따뜻한색"이라 실제와 안 맞던 것을 바로잡음.
- `C:\Users\AdMins\Documents\woori-bohumso-landing` (따뜻한 톤 랜딩) 만들었다가 **방향 폐기** — 삭제해도 됨.

## 4. Git 상태
- 브랜치 `feature/consultation-commerce`, base `68524e2`.
- Committed: `e54c48d`(구현+배포도구) · `55ba999`(동시성) · `60fd7a9`(결제위젯) · `b5fd77a`(degrade).
- **미커밋**: `CLAUDE.md`·`design-system.md`(네이비 정리). 커밋해서 이어갈 것.
- identity(local): `jkw2686@gmail.com` / `jkw2686`. 원격 없음(사용자가 GitHub 수동 연결).

## 5. 빌드/검증
- Node 22+. `npm ci` → `npm run build` → `npm test`(14, PGlite) → `npm run verify`(빌드+DB+Edge e2e).
- 배포 전: `npm run preflight`(env 형식) → `npm run smoke`(실연결) → `npm run concurrency`(일회용 Postgres 경합). DB=PGlite, auth/PG 모의, 브라우저=Edge.

## 6. 주의
- 자동매칭 제거·정기결제 전환은 **합법성 근거**(CLAUDE.md §1~2)라 반드시 반영. 반쯤 남기지 말 것.
- UI 변경 시 `design-system.md` 자가검사(색 토큰·대비 4.5:1·간격/ radius·360px·focus) 통과 후 종료.
- 각 변경 후 `npm run verify` 통과 유지. 기능 단위 작게 커밋.
