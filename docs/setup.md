# 연결과 배포
1. 운영 소유 Supabase 프로젝트에 supabase/001_accounts.sql, supabase/002_requests.sql 순서로 실행합니다.
2. Auth 이메일 확인을 켜고 운영 SMTP, 발송 제한 및 CAPTCHA를 설정합니다.
3. Auth Site URL과 Redirect URLs에 실제 Netlify 운영 주소와 /account.html, /reset-password.html 경로을 등록합니다. 허용할 실제 주소만 등록합니다.
4. Netlify 환경 변수:
   - SUPABASE_URL
   - SUPABASE_PUBLISHABLE_KEY (sb_publishable_ 또는 기존 anon 키만. service_role/secret 키 금지)
   - OPERATOR_NAME
   - PRIVACY_CONTACT
   - POLICIES_APPROVED=false (운영 약관·개인정보 안내 확정 후 true)
   - ACCOUNTS_ENABLED=false (테스트 완료 후 true)
   빈 값 상태에서는 가입 폼을 차단합니다.
5. 운영 정보를 반영한 public/terms.html과 public/privacy.html을 검토·확정합니다. 현재 초안입니다.
6. npm ci && npm run build. Netlify 사이트 연결 후 배포합니다. 단순 정적 폴더 업로드는 functions 배포를 대체하지 못합니다. Git 연결 또는 Netlify CLI를 사용합니다.
7. 최초 운영자는 이메일 확인·가입 완료 후, Supabase SQL Editor에서 private.admin_memberships에 해당 auth.users.id를 직접 지정합니다. 일반 사용자는 자신을 관리자로 만들 수 없습니다.
8. 고객 A/B, 신청자, 승인 파트너, 정지 파트너, 관리자 계정으로 교차 접근 테스트 후 활성화합니다.
9. 개인정보 삭제 요청은 보유 정책에 따라 관련 요청·연락처·심사 참조와 감사 기록을 먼저 처리한 뒤 Auth 사용자를 삭제합니다. 요청 데이터가 남아 있으면 외래 키가 사용자 삭제를 차단합니다. 삭제·익명화 절차와 보유 기간은 출시 전 확정하고 검증해야 합니다.

# 역할
모든 계정은 이메일 확인 후 고객 가입 동의를 마칩니다.
파트너는 별도로 신청하며, 직군 선택만으로 역할이 부여되지 않습니다.
신청자는 자기 신청만 조회합니다. 관리자는 전체 신청을 심사합니다.
승인된 파트너는 자신에게 배정된 업무만 조회하고, 고객 확정·동의가 완료된 예약의 연락처만 조회합니다.
관리자는 UI 메뉴 숨김이 아니라 데이터베이스 함수에서 권한을 검사합니다.
상담·예약 배정 데이터는 002_requests.sql에서 구현합니다. 결제는 미구현입니다.

# 참고
https://supabase.com/docs/guides/auth/managing-user-data
https://supabase.com/docs/guides/database/postgres/row-level-security
https://docs.netlify.com/build/functions/environment-variables/

10. 가입 비활성화 시 앱 설정뿐 아니라 Supabase Auth의 신규 가입 허용 설정도 함께 점검합니다.
11. 관리자 계정 다중 인증, 인증 메일 실제 수신, 만료 링크·비밀번호 재설정은 운영 환경에서 추가 검증합니다.

## 상담·방문예약 추가 적용
001_accounts.sql 적용 후 002_requests.sql을 한 번 실행합니다. 이전 준비본에 001을 이미 적용했다면 002만 실행하세요.
관리자가 승인된 같은 직군의 담당자를 배정하고, 고객이 표시된 담당자와 일정을 확인하며 연락처 제공에 동의해야 확정됩니다. 방문예약은 관리자가 확인한 실제 주소를 입력해야 합니다.
고객은 진행 중 5건까지 요청할 수 있고, 목록은 최근 100건을 표시합니다. 일정은 한국 시간 30분 단위, 30분 이후부터 90일 이내입니다. 중복 확정은 DB에서 차단합니다.
취소·완료 후 전문가에게 연락처를 반환하지 않습니다. 운영자·본인 조회를 위한 연락처는 DB에 남으므로 운영 정책의 보유 기간에 맞춘 삭제 절차를 추가한 뒤 파일럿을 시작하세요.
실제 이메일 인증, 두 고객·두 전문가·운영자 계정 권한, 중복 시간 확정, 정지·취소 시 접근 회수를 원격 환경에서 다시 검증하세요.
이메일·문자 자동 알림은 아직 연결하지 않았습니다. 파일럿 동안 요청·배정 화면을 직접 확인하는 운영이 필요합니다.

