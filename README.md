# 보험소 0.3 — 모델 전환 작업 중

2026-09-20: 소비자 직접 선택으로 전환했습니다. 자동 재배정과 예약 만료 워커는 제거했습니다. 광고 노출 구독 전환은 아직 미완료이며 아래 상담별 결제 설명은 이전 구현입니다. 운영 준비 완료로 해석하지 마세요.

기존 Netlify 디자인과 Supabase 가입·파트너 심사를 유지하고, 설계사 직접 선택, 무료 이용권, 두 단계 테스트 결제 흐름을 추가했습니다.
**실제 배포·실결제·외부 메시지·운영 DB 변경은 하지 않았습니다.**

## 실행 및 검증
Node.js 22 이상, npm, Microsoft Edge가 필요합니다.

```text
npm ci
npm run verify
```

`verify`는 프로덕션 빌드 → DB/결제 자동검사 → 모바일·PC 브라우저 검사를 실행합니다. 실제 메일·토스 결제 대신 가상 인증/PG와 로컬 PostgreSQL 호환 DB를 사용합니다. 배포 명령은 실행하지 않습니다.
배포 직전에는 환경변수를 설정한 뒤 `npm run preflight`로 키 형식·설정을 점검합니다.
브라우저 검사는 Edge가 설치되어 있어야 합니다. 검사 종료 후 브라우저와 임시 서버를 닫습니다.

## 주요 화면
- `/` 기존 홈 + 상황 선택
- `/find.html` 지역·분야별 설계사, 프로필·지도, 위치 거부 시 지역 선택
- `/requests.html` 고객 요청·일정·취소·완료 확인·후기·문의
- `/partner.html` 입점 신청·프로필·상담가능 상태
- `/partner-work.html` 수락·패스·무료 현황·두 단계 테스트 결제·후속 미팅
- `/admin.html` 기존 입점 심사
- `/admin-requests.html` 운영 현황·가격·등록 확인·예약·환불·분쟁·처리 이력
- `/analysis.html`, `/dashboard.html` 가상 보장분석 체험

## 데이터베이스
신규 테스트 프로젝트: `supabase/001_accounts.sql`부터 `006_metrics.sql`까지 번호 순서로 적용합니다.
001/002 적용 이력이 있으면 기존 파일을 재실행하지 말고 003~006만 적용합니다.
003은 기존 요청 데이터를 보존하고 예전 쓰기 API를 닫습니다. 기존 예약은 조회 전용으로 남습니다. 진행 중인 기존 운영 예약이 있다면 전환 계획을 먼저 세워야 합니다.
가상 설계사·고객은 테스트 fixture에만 있습니다. 마이그레이션은 운영 승인된 설계사를 자동 생성하지 않습니다.

## 결제
첫 완료 2건 무료, 이후 총 70,000원(VAT 포함)을 35,000원씩 직접 결제하는 초기 정책입니다. 신규 정책은 관리자에서 변경하며 확정 예약의 금액·정책·무료 여부는 보존합니다.
Toss v2 **결제위젯(renderPaymentMethods)**으로 카드 + 간편결제(카카오·네이버·삼성페이 등)를 한 화면에서 선택합니다 — 실제 노출 수단은 토스 상점 대시보드에서 켠 결제수단에 따릅니다. 승인/조회/전액 환불/웹훅 재조회 포함. **test_ck_/test_sk_만 허용하며 기본값은 비활성**, 라이브 키는 거부합니다.
테스트 상점 키와 실제 Supabase 연결 정보가 없어 **토스 테스트 상점의 실제 승인·환불은 아직 검증하지 않았습니다.** 모의 PG 통과를 PG 인증 완료로 간주하지 않습니다.

## 배포 준비 도구
- `docs/release-checklist.md`: 배포 전 Go/No-Go 체크리스트(게이트 A~E)
- `docs/deploy-runbook.md`: 실배포 실행 순서(환경변수→SQL→보안헤더→약관→회원ON→결제ON→최종게이트)·롤백
- `docs/policy-drafts/`: 약관·개인정보 처리방침 **초안**(공란 포함, 게시 전 법률 검토 필요)
- `supabase/_apply_all.sql`: 001~006 결합 붙여넣기용 · `supabase/_verify_after_apply.sql`: 적용 후 검증 쿼리
- `npm run preflight`: (환경변수 설정 후) 키 형식·설정 검증. 시크릿 미출력, 읽기전용. `--net`으로 Supabase 도달성까지
- `npm run smoke`: (키 설정+SQL 적용 후) 실연결 스모크 — Auth health·PostgREST·`planner_catalog` RPC 도달. `--config <origin>`으로 `/api/config`, `--toss`로 토스 키 인증까지
- `npm run concurrency`: (일회용 Postgres에) `DATABASE_URL` 지정 후 실행 — 실 다중연결로 무료쿠폰 과다배정·슬롯 이중예약 불변식 검증(PGlite로는 불가). `--customers N`·`--keep`
- `.github/workflows/verify.yml`: GitHub 연결 시 푸시/PR마다 자동 `build + npm test`(브라우저 불필요)
- `docs/code-review-notes.md`: 기존 결제·예약 구현 검토 기록 (새 구독 모델 검증과 구분)

## 전달 문서
- `docs/final-report.md`: 요청한 11개 항목의 결과와 남은 작업
- `docs/setup.md`: 서버 환경변수·테스트 연결 순서
- `docs/implementation-audit.md`: 기존 구조 분석
- `config/production.env.example`: 비밀값 없는 설정 예시
- `artifacts/build-report.json`: 로컬 빌드 결과

희망 주소 `bohumso.netlify.app`은 아직 확보하지 않았습니다. 계정 연결·운영 정책·실제 테스트 승인 확인이 끝나기 전에는 공개 서비스를 열 수 없습니다.
