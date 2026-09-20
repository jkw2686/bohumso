# 연결 및 설정

2026-09-20 공개 사이트의 Supabase 인증·공개 목록 연결을 읽기 전용으로 확인했습니다. 이메일 가입은 활성, 카카오/구글은 비활성입니다. 인증 마무리는 `auth-launch-checklist.md`를 따릅니다. 이번 점검에서 서버 설정 변경·배포는 수행하지 않았습니다.

## 새 테스트 DB
001_accounts.sql → 002_requests.sql → 003_consultations.sql → 004_payment_ledger.sql → 005_matching_worker.sql(예약 번호만 유지, 실행 작업 없음) → 006_metrics.sql.
_apply_all.sql은 동일 파일의 합본입니다. 기존 DB에는 적용하지 않습니다.
첫 관리자 지정은 인증 완료 UUID를 private.admin_memberships에 등록하는 별도 운영 절차입니다. 검증된 설계사만 활성화합니다.

## 환경
config/production.env.example의 값은 공란 또는 비활성입니다.
- SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY: 인증·공개 RPC
- SUPABASE_SERVICE_ROLE_KEY: 서버 전용 원장 동기화·광고 기록
- OPERATOR_NAME / PRIVACY_CONTACT: 실제 확인 후 입력
- ACCOUNTS_ENABLED / POLICIES_APPROVED: 실제 정보·동의문 확정 전 false
- TOSS_MODE=test, TOSS_CLIENT_KEY=test_gck_..., TOSS_SECRET_KEY=test_gsk_...: 같은 상점의 위젯용 테스트 키
- PAYMENTS_ENABLED=false: 서버의 외부 테스트 결제 호출 허용 여부
- APP_ORIGIN: 정확한 허용 origin
- AD_EXPOSURE_ENABLED=false: 광고 게재 및 노출 수집 허용 여부
- AD_IMPRESSION_SECRET: 노출 서명용 서버 전용 임의 값, 32자 이상
- VISIT_METRICS_ENABLED=false: 선택적 방문 집계
폐기한 MATCHING_WORKER_ENABLED는 사용하지 않습니다. 비밀값은 저장소·채팅·프런트엔드에 넣지 않습니다.

## 테스트
실제 인증 메일·복구·역할 격리를 확인합니다. Supabase 가입 허용과 redirect URL도 제한합니다.
관리자 화면에서 테스트 요금제 금액·기간·약정 노출수 및 지역 슬롯을 설정합니다. 테스트 표시는 실제 사업 정보 확인을 대체하지 않습니다.
광고 구독 테스트 승인·조회·중복 승인·환불 재시도·웹훅 역순을 검증합니다.
광고 계측은 서명된 10분 유효 토큰과 이벤트 중복 방지를 사용합니다. 브라우저가 50% 이상 표시를 1초 유지하면 기록을 요청합니다.
이 방식은 봇/반복 사용자 검증이 아니므로 운영 전에 별도 보강이 필요합니다.
