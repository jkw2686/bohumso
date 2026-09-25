# 관리자 전용 테스트 결제

기능은 로컬 구현/검증 상태이며 원격 DB와 공개 사이트에 아직 적용하지 않았다.

- supabase/010_admin_test_payments.sql: 기존 관리자에게만 허용된 별도 테스트 주문·이벤트 원장. 금액 서버/DB 고정 1,000원. 실제 청구는 test_gck_/test_gsk_ 전용 서버 차단으로 금지.
- 전문가 심사/프로필/광고 슬롯/광고 노출 데이터와 연결하지 않음. 본인 승인 차단 유지.
- 관리자 업무 화면의 '관리자 카드결제 점검' → 테스트 주문 생성 → 기존 토스 위젯 → payment-result 서버 승인 → 상태 확인.
- 주문 생성은 ADMIN_TEST_PAYMENTS_ENABLED=true가 필요. 기본 false. 기존 PAYMENTS_ENABLED=true, TOSS_MODE=test 및 유효한 테스트 키/APP_ORIGIN도 필요.
- 중복 생성은 관리자+요청키 유일성으로 보호. 금액·결제키·소유권 검증, 서버 전용 결과 반영. 늦은 DONE 통지가 취소 완료를 되돌리지 않음.
- 웹훅: 기존 광고 ad_ 및 testadmin_ 주문 접두사 처리. 이전 boh_ 전용 필터 문제 수정.
- 테스트 환불 전용 버튼은 이번 범위에 없음. 토스 테스트 콘솔 취소 후 서버 상태 재조회/웹훅으로 취소 기록 가능.

## 적용 순서
1. 대상 Supabase에서 001~009 적용 이력/백업 확인 후 010만 적용. _apply_all.sql 재실행 금지.
2. 새 서버/클라이언트를 검증된 배포에 반영. 기존 Netlify 크레딧 제한은 실제 관리자 화면에서 재확인해야 함.
3. 서버 환경변수 ADMIN_TEST_PAYMENTS_ENABLED=true 설정. 실키 전환 금지.
4. 관리자 로그인 → admin-requests.html → 관리자 카드결제 점검. 테스트 표시 확인 후 주문/승인/재조회 수행.
5. 결과를 실제 PG 검증으로 기록하기 전 실제 토스 응답 확인. 지금의 로컬 검사는 모의 PG임.

## 검증
- node scripts/build.mjs
- node --test --test-concurrency=1 tests/admin-test-payments.test.mjs tests/payment-gateway.test.mjs tests/payment-endpoints.test.mjs
- node tests/admin-test-payment-browser.cjs

운영 계정의 신청·검증 상태는 변경하지 않았다. DB 접속 정보나 추가 계정 권한을 임의 생성하지 않았다.
