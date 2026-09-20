# 인수인계 — 우리동네 보험소 (현행 상태)
갱신: 2026-09-20 (KST) · Claude ↔ Codex 교대 작업

## 0. 지금 바로
- 프로젝트: `C:\Users\AdMins\Documents\bohumso-netlify` · git 브랜치 `feature/consultation-commerce`
- 먼저 읽기: 이 문서 → `CLAUDE.md`(마스터 규칙) → `design-system.md`(네이비 가드레일) → `docs/final-report.md`
- **실배포·실결제 금지**(명시 승인 전). 토스 test-only(라이브 차단). Supabase 프로젝트 아직 없음(사용자 생성). 시크릿 채팅/프런트/repo 금지. 사업자·검증 사실 지어내지 말 것(미확정 공란).

## 1. 확정된 방향
기존 풀앱(네이비 디자인·지도·회원가입·전 기능) 유지 + 합법 구조를 위한 모델 2개 변경. `design-system.md` 토큰만 사용.
합법 원칙(CLAUDE.md §1~3): 소비자 직접 선택·먼저 연락 / 고객정보 제3자 분배·판매 금지 / **연결·연락처 트리거 과금 금지(정액 구독만)** / 지급보장 표현 금지.

## 2. 완료 상태 ✅ (둘 다 구현·커밋·verify green)
### ① 자동매칭 제거 → 소비자 직접 선택만 — 완료 (commit `ced2a55`)
UI 자동매칭/다음후보 제거, 서버 automatic 요청 거부, rank/offer/만료워커 제거, DB automatic=false 제약.

### ② 건당 과금 → 광고 노출 구독(선불·수동갱신) — 완료 (commit `05dc73d`)
- 상담에서 가격·무료이용권·단계별 주문·미결제 제한 제거. 상담 확정/완료/취소/분쟁은 광고와 **분리**.
- 신규: `ad_plans·ad_slots·ad_subscriptions·ad_impressions·ad_audit` + RPC(`ad_checkout/begin_confirm/reconcile/refund_request/refund_failure/workspace/admin_command/user_order/order_lookup/public_slots/record_impression`).
- 3요금제(베이직/프리미엄/지역독점)는 조건 NULL·비활성(사업자 확정 대기). 지역독점 슬롯 잠금, 주문조건 고정, **환불=약정 노출 미달+플랫폼 귀책만**(전액), 지연승인 무시, 만료 해제.
- **노출집계 = display-only**(과금·환불과 무연결). 서버 서명 토큰·10분 만료·중복방지·기본 비활성.
- 신규 파일: `netlify/functions/ads.mts`·`_shared/impressions.mjs`, `src/ad-subscription.js`·`sponsored.js`, `tests/impressions.test.mjs`.
- 토스 위젯 키 `test_gck_/test_gsk_`(의도적), 라이브 차단, 간편결제 잔액 응답 검증.

## 3. 검증
- `npm run verify` green: **단위 19 + 브라우저 e2e + 가입 회귀**. DB=PGlite, auth/PG 모의, 브라우저=Edge.
- 최신 실행: `artifacts/verification-report.json` 확인. Node 22+. `npm ci → build → test → verify`.
- 배포 전 도구: `preflight`(env 형식) · `smoke`(실연결) · `concurrency`(일회용 Postgres 경합).

## 4. 남은 일 = 전부 인적 게이트 / 후속 범위
- **인적 게이트(사용자·법률):** 실제 Supabase 프로젝트+키, 토스 테스트 상점 승인·취소·웹훅, 운영자·설계사 자격 확인, 요금/약정·약관·환불/보유기간 법률 검토. → `docs/deploy-runbook.md`·`release-checklist.md` 순서.
- **미구현 후속 범위(당장 불필요):** 저장카드 자동갱신, 부분환불, 노출크레딧 충전형 상품.
- **DB 이관:** 현재 SQL 합본(`_apply_all.sql`)은 **새 빈 테스트 DB 전용**. 기존 003/004 적용 DB가 있으면 전환 마이그레이션·거래 보존 별도 필요(현재 실 DB 없음).

## 5. Git
- 브랜치 `feature/consultation-commerce`, base `68524e2`.
- 최근: `05dc73d`(광고구독) · `ced2a55`(직접선택) · `b5fd77a`(degrade) · `60fd7a9`(결제위젯) · `55ba999`(동시성) · `e54c48d`(구현+배포도구).
- 작업 트리 클린. identity(local) `jkw2686@gmail.com`. 원격 없음(GitHub 수동 연결).

## 6. 주의
- 합법 원칙(§1~2) 반영 상태 유지 — 상담과 광고 과금은 절대 다시 엮지 말 것.
- UI 변경 시 `design-system.md` 자가검사(네이비 토큰·대비 4.5:1·간격/radius·360px·focus) 후 종료. 각 변경 후 `npm run verify` 유지.
