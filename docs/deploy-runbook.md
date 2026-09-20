# 배포 및 검증 실행 순서

현재 단계에서는 배포 명령을 실행하지 않습니다.

1. 새 테스트 Supabase를 준비하고 SQL 001~006 적용·권한 확인. 기존 DB에는 수정 SQL 재실행 금지.
2. config/production.env.example을 기준으로 서버 환경 설정. 비밀값을 파일/채팅/브라우저에 넣지 않음.
3. npm run preflight, npm run verify. 실제 인증 메일·복구·사용자 간 격리는 별도 검증.
4. 관리자 화면에서 확정된 광고 조건 버전과 지역 슬롯을 설정. 초기 미정 조건을 운영 가격으로 간주하지 않음.
5. 토스 위젯용 test_gck_/test_gsk_ 키를 한 쌍으로 설정한 뒤 PAYMENTS_ENABLED=true인 별도 테스트 환경에서 승인·조회·환불·웹훅 검증.
6. 노출 수집 정책과 서명용 서버 비밀값 준비 후에만 AD_EXPOSURE_ENABLED=true. 광고 표시/중복 기록/기간 종료/독점 슬롯 확인.
7. 로컬 일회용 PostgreSQL의 DATABASE_URL로 npm run concurrency. 도구는 bohumso_test_<무작위> DB를 생성·검증·삭제하며 입력 DB의 스키마를 지우지 않음. CREATEDB 및 필요 시 테스트 역할 생성 권한 필요.
8. release-checklist.md의 미완료 항목과 실제 결과를 확인한 후 최종 승인.

중지 시 PAYMENTS_ENABLED와 AD_EXPOSURE_ENABLED를 false로 둡니다. 이미 승인 확인 중인 거래를 임의 실패 처리하지 않고 재조회로 정리합니다.
CSP는 여전히 Report-Only이며 실제 상점 UI의 출처를 검증한 뒤 별도로 강제 적용합니다.
자동 갱신·자동 청구는 미구현이며 이 런북의 키 교체만으로 실결제를 활성화할 수 없습니다.
