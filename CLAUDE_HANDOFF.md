# 보험소 — Claude Code 인계 요약
작성: 2026-09-16 (KST)

## 바로 시작할 지시
현재 프로젝트는 C:\Users\AdMins\Documents\bohumso-netlify 이다. 먼저 이 문서, README.md, docs/final-report.md, docs/setup.md를 읽고 기존 디자인과 구현을 유지하며 이어서 작업한다. 사용자의 최신 목표는 배포 직전 준비이며 실제 배포·실결제는 금지다. 사업자 정보나 검증 사실을 만들지 말고 미확정 값은 비워 둔다. 비밀키를 채팅이나 프런트엔드에 넣지 않는다. 현재 사용자는 작업 결과 인계와 미리보기를 요청했다.

## 현재 상태
- 버전 0.3.0, 정적 HTML/CSS/JS + esbuild + Supabase + Netlify Functions.
- 기존 네이비/블루 디자인과 가입·신청 화면을 유지했다.
- 로컬 구현·빌드·모의 통합 검증 완료. 실제 Supabase 프로젝트와 토스 테스트 상점 연결은 미완료다. 운영 준비가 모두 끝났다고 표현하면 안 된다.
- 마지막 전체 검증: 2026-09-15 21:11:05 KST, artifacts/verification-report.json passed=true. 최종 결제 상태 조회 변경 이후 실행한 결과다.
- 빌드, DB/결제 테스트, 가입 화면 회귀, 모바일·PC 전체 흐름 모두 exitCode 0. DB는 PGlite, 인증과 PG는 모의 응답이다.
- 기존 공개 사이트 https://keen-sorbet-c7c0bd.netlify.app/ 는 이번 로컬 변경을 배포하지 않은 이전 버전이다.
- Git 기준 커밋 68524e2. 이번 구현은 아직 커밋되지 않은 변경/새 파일로 존재하므로 reset/clean으로 지우지 않는다.
- bohumso-web, bohumso-site는 이전 프로젝트다. 보험소_배포준비_20260915.zip도 최신 인계본이 아니다.

## 서비스 정책 (유지 필수)
소비자 가입·탐색·요청 무료. 설계사 첫 완료 미팅 2건 무료, 이후 VAT 포함 70,000원. 양측 일정 확정 후 35,000원, 고객의 실제 미팅 완료 확인 후 35,000원을 각각 직접 카드결제한다. 자동청구/구독/카드등록/보험계약 성사 연동 없음. 동일 예약 후속 미팅은 무과금이다.
무료 이용권은 확정 시 예약 배정, 완료 시 사용, 미완료 취소/확인된 노쇼 시 복원한다. 행 잠금과 DB 제약으로 보호하며 정책 버전·금액·무료 여부는 예약에 고정한다. 이미 확정된 무료/유료 예약을 정책 변경으로 바꾸지 않는다.
고객 무응답이나 설계사 일방 요청으로 완료 또는 잔금 청구하지 않는다. 분쟁은 잔금 보류, 관리자 예외 처리는 근거/담당자/시간 기록. 실제 검증된 설계사만 수락하며 테스트 승인을 운영 승인처럼 표시하지 않는다. 보장분석은 샘플만 유지하고 보험증권·건강정보·주민등록번호를 수집하지 않는다.

## 구현한 주요 기능
- 홈 상황 선택, 지역/상담 목적별 설계사 검색·비교, 지도 마커, 위치 사용 동의와 거부 시 지역 선택, 사진·전문 분야·소개·경력·후기·상담 수.
- 직접 선택 또는 명시적으로 동의한 자동매칭. 적합도/지역/거리/업무량/실적 반영, 패스/24시간 만료 시 다음 후보 한 명씩. 직접 선택 건 자동 재배정 없음.
- 고객 예약 조회·일정 조율·확정·취소·완료 확인·신고·후기, 선택 설계사에게만 연락처 제공 동의.
- 설계사 프로필 편집, 승인 확인, 수락/거절/제안, 무료 잔여/배정/사용, 두 단계 결제·영수증·환불·분쟁·후속 일정.
- 관리자 메뉴/지표/필터, 설계사 확인, 가격 정책, 예약·후기 검토·분쟁·노쇼·환불·감사 이력.
- 토스 일반 카드결제 테스트 전용 서버 어댑터: 권한/단계/금액/주문 검증, 승인 및 상태 조회, 멱등 재시도, 웹훅은 거래 재조회 후 반영, 주문별 전액 환불. 라이브 키 차단, 기본 비활성.
- 승인 확인 중에는 새 결제 대신 상태 확인 제공. 지연 통지가 결제/환불 완료 상태를 되돌리지 않도록 처리.
- 익명 방문 세션 지표와 매칭 예약 작업은 기본 비활성. KST 표시.

## 파일 안내
- src/account.js: 기존 Supabase 인증 연결. 기존 woori-account 세션 키 유지.
- src/directory.js, consultation-ui.js: 탐색/지도/표시 도우미.
- src/workflow.js, profile-editor.js: 고객·설계사·관리자 작업.
- src/visit.js: 선택적 방문 집계.
- public/index.html, find.html, requests.html, partner-work.html, admin-requests.html, payment-result.html, account.css: 화면.
- netlify/functions/payment.mts, payment-webhook.mts, _shared/payments.mjs: PG 서버.
- netlify/functions/matching-sweep.mts: 기본 비활성 주기 작업.
- supabase/001_accounts.sql, 002_requests.sql: 기존 보존.
- 003_consultations.sql: 신규 예약·프로필·정책·무료·후기·감사·매칭. 구형 쓰기 RPC 차단, 구형 예약 조회 보존.
- 004_payment_ledger.sql: 주문/승인/환불/소유자 상태조회 RPC.
- 005_matching_worker.sql, 006_metrics.sql: 매칭 만료 처리와 지표.
- tests/: DB 권한/정책/충돌·결제 및 Playwright 흐름 테스트.
- docs/final-report.md: 상세 11개 항목 결과. docs/setup.md: 연결 준비 절차.

## 재검증/미리보기
Node 22 이상 권장, 현재 PC Node 24.18. 의존성은 설치되어 있다.
```powershell
cd C:\Users\AdMins\Documents\bohumso-netlify
npm ci
npm run verify
node scripts/preview.mjs
```
이 PC에서 npm 경로가 없으면 C:\Program Files\nodejs\node.exe 로 scripts/verify.mjs를 직접 실행한다. 브라우저 테스트는 Microsoft Edge를 사용한다. verify는 배포하지 않는다.
로컬 미리보기: http://127.0.0.1:3190/ 와 /find.html. 정적 미리보기 서버는 가입·결제를 비활성으로 응답하며 외부 서비스에 쓰지 않는다. 실제 역할별 흐름은 테스트 및 artifacts/planner-payments.png에서 확인한다.

## 설정과 남은 우선순위
1. 별도 테스트 Supabase 준비 후 001~006 순서 적용, 실제 인증 이메일/비밀번호 복구/고객 간 격리/역할 권한 확인. 기존 운영 데이터가 있다면 003의 구형 쓰기 권한 변경 전에 이관 계획 필요.
2. 토스 테스트 상점 키를 서버 환경변수로 설정하고 실제 테스트 승인·조회·취소·웹훅 재전송 검증. 현재 모의 결제 통과를 실제 PG 통과로 간주하지 않는다.
3. 실제 PostgreSQL 독립 연결로 무료 한도·결제/취소/완료 경합 검증.
4. 운영자·사업자·설계사 실제 확인, 약관/개인정보/제3자 제공/환불/보관·삭제 기준 검토. 확인 전 완료 표시 금지.
5. 최종 사용자 승인 전 공개 배포·실결제 활성화 금지. bohumso.netlify.app은 확보하지 않았다.
환경변수 목록은 config/production.env.example. ACCOUNTS_ENABLED, POLICIES_APPROVED, PAYMENTS_ENABLED, MATCHING_WORKER_ENABLED, VISIT_METRICS_ENABLED는 기본 false. TOSS_MODE=test. SUPABASE_SERVICE_ROLE_KEY와 TOSS_SECRET_KEY는 서버 전용이다.

## 알려진 범위 제한
주문별 전액 환불만 구현(부분 환불 미구현). 상담 시간은 설명/슬롯 충돌/양측 확인 기반이며 주간 시간표 엔진은 없다. 목록 최근 200건, 대규모 페이지 분할/장기 보관·삭제/고급 정산은 추가 작업. 지도 타일은 외부 제공 영향이 있으며 목록 대체 안내가 있다. 실제 SMTP/PG/웹훅/운영 DB 부하 검증 미완료. 실제 개인정보와 실제 검증 설계사를 등록하지 않았다.

## 사용자 장기 요청 (현재 구현과 구분)
향후 지도에 오프라인 보험대리점 방문예약, 제휴 보험금 전문 변호사·손해사정사·기업보험 컨설턴트·세무사를 표시하는 요청이 있다. 현재 설계사 상담 핵심 구현과 구분하여 후속 범위를 점검한다. 관리자 메뉴는 사용자가 제공한 참고 사진처럼 기능별 풍부한 사이드바를 선호한다. 브랜드는 최종 지시대로 '보험소'다.
