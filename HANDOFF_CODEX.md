# 인수인계
이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 '다음 할 일'부터 진행.

## 2026-10-24 관리자·가입·연락처 보호 통합 작업
- 최신 사용자 기준을 docs/member-admin-policy-20261024.md로 반영. 이전 본인확인 의무화 지침 대체.
- 관리자 홈 회원/상담 요약·최대5 할 일·4개 메뉴, 회원 검색/필터/25명 페이지/상세/개인정보 처리 기록. 실패를 0으로 표시하지 않음.
- member-contact: 로그인 계정에 이름/번호 직접 저장, 필수 수집 동의, 기존 값 채움, 번호 변경 확인상태 초기화. social/email 인증은 기존 그대로; 신분증/주민번호/필수 SMS/외부 본인확인 미추가.
- 상담 수락 후 담당자 통화 결과 기록, 다른 전문가 접근 차단, 회당 재시도 중복 방지 유지, 계정별 10회/시간 신청 제한. 전화 조율/보험소 방문예약 유지.
- SQL079~083: 연락처 별도 private 테이블/RLS, admin support/statistics 분리, admin AAL2, 자료 endpoint MFA 검사, 가입 보완 gate. 운영 미적용.
- 개인정보 안내 개정 후보와 이전 고지 보관. 새 연락처 탈퇴 삭제; 기존 상담·서류 임의삭제 안 함.
- 신규 핵심 파일: src/member-contact.js, src/admin-member-directory.js, src/admin-mfa.js, supabase/079~083, tests/member-contact.test.mjs, tests/member-admin-browser.mjs. 기존 account/admin nav/workflow/role/서류 endpoint 연결 수정.
- 보존: public/help 6파일, outputs/signup-entry-20261018/, 빌드산출 public/assets/. 다른 작업분 포함 커밋 금지.

### 검증/운영 상태
- 격리 DB: 계정 격리, 같은 번호 별도 회원 허용, 수락 전 연락처 비공개, 번호 변경 초기화, 반복요청 제한, 관리자 MFA/통계 접근 차단, 목록/합계/페이지 일치, 탈퇴 새연락처 삭제 검증.
- 브라우저: 360/390/430/1280px 회원/요약/상세/페이지/조회실패/보완저장/MFA 잘못된코드 차단 검증. artifacts/member-admin/*.png. 실제 운영 회원 데이터나 휴대전화 조작 아님.
- 전체 테스트 최종 결과: 로컬 전체 223개 중 222 통과, promotion 테스트 프로세스 메모리 부족 1건. 단독 재검증 및 원격 CI 진행 예정. 테스트 삭제/건너뛰기 없음.. 마지막 빌드 성공(운영 배포 없음).
- 실제 Netlify Supabase 설정 이름 존재 확인, 키값 비출력. 운영 Auth rate-limit/CAPTCHA/TOTP 설정/운영 RLS 적용상태는 미확인.

### 다음 할 일
1. 전체 npm test 결과 확인 후 최종 보고/검증 기록 갱신.
2. 운영과 동일한 migration ledger 및 관리자 대표 제한 SQL 기준으로 079~083 적용 검토. migration과 프런트/개인정보 고지는 함께 배포; 현재 운영 서비스는 이전 배포 그대로.
3. 운영 MFA TOTP 활성 및 대표 계정 등록/복구 준비 확인. 통계 담당자 권한은 실제 담당자 확인 후 지정(현재 실계정 권한 변경 없음).
4. 운영 Auth rate-limit/CAPTCHA/Storage 정책 읽기 검증. 본인확인 연동은 후속 별도 과제.
5. 기존 상담/자격서류 전체 자동파기, 법정 보관기간 근거, 기존 모든 다운로드/접속로그 포괄 검증은 남음. 화면 구현만으로 법적 준수/본인확인 완료 보고 금지.
- 이충경 계정/기록 접근 금지. PROJECT_BRIEF.md/CLAUDE.md/design-system.md 준수. 기존 이미지·지도·브랜드·요금 유지.
