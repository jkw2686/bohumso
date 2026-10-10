# 가입·로그인 세 가지 선택

## 화면
- Google 계정으로 계속하기: 흰색 둥근 버튼, 공식 G 원본 이미지. 기존 Google 인증과 복귀 경로 사용.
- 카카오로 계속하기: 준비 중 표시, 비활성 유지.
- 휴대전화 번호로 계속하기: Supabase Auth/SOLAPI 문자 인증. 기존 계정은 로그인, 새 계정은 인증 후 기존 약관 동의 화면으로 이동.
- 이메일 가입·로그인은 접힌 보조 메뉴로 보존. 일반/전문가 목적과 안전한 내부 next 경로 유지.
- 로그인된 회원의 전화번호 변경은 기존 phone_change 흐름 유지. 익명 가입·로그인만 sms 타입 사용.

## 운영 변경 051
기존 운영 DB에서 이메일 인증만 허용하는 조건이 확인되어 다음 세 함수에 인증된 휴대전화도 허용한다.
1. private.is_active_member: 기존 프로필·동의·활동 상태와 함께 확인.
2. public.complete_membership: OTP 완료 후 필수 약관 동의가 있어야 가입 완료.
3. public.early_document_service: 휴대전화 회원의 자료 제출 허용. 원본 자료 조회는 기존 관리자 전용 유지.
4. public.release_status: phoneSignupEnabled 상태값 추가. 적용 전에는 새 휴대전화 가입 버튼이 작동하지 않는다.

private.verified_contact를 재사용해 미인증·재확인 필요 상태를 인정하지 않는다. 대표자 이메일 제한, 관리자 권한, 전문가 승인/공개 조건, 기존 회원·예약·동의 기록, 기존 RLS/Storage 정책은 변경하지 않는다.

전체 단일 트랜잭션이며 같은 변경을 재실행할 수 있다. private.phone_signup_backup에 원본 네 함수 정의를 최초 1회 저장한다. 백업 테이블은 일반 사용자가 읽을 수 없다. 기존 열 추가·삭제·타입 변경과 기존 행 삭제는 없다.

## 검사
- PhoneSignIn 단위 검사: 번호 정규화·오류·SMS 타입·재발송 제한·신규 가입 금지 설정.
- 격리 DB: 휴대전화 단독 회원, 동의 누락 차단, 중복 동의 방지, 본인 프로필 범위, 재확인/정지 차단, 기존 이메일 회원, 함수 권한 보존, 반복 적용·원복.
- 실제 정적 화면과 격리 인증/DB: 320/360/390/768 폭, Google 복귀, 카카오 비활성, OTP 실패 후 재시도, 인증 입력 포커스·완료, 약관 동의 후 회원 완료.
- 기존 이메일/Google/전문가 화면 회귀 검사 통과.
- 운영 설정 읽기: Google 및 phone 인증 활성, 회원 가입 및 휴대전화 인증 활성. 카카오 제공자는 설정되어 있어도 이번 요청에 따라 UI 비활성.
- 운영 문자 발송/새 실계정 생성은 하지 않았다. 실제 SMS 수신까지 통과했다고 보고하지 않는다.

## 배포와 원복
운영 DB 실행 직전 확인 후 051 적용 → 운영 상태 및 기존 데이터 개수 확인 → Git main 배포 → 실제 가입 화면 확인 순서.
이 작업은 앞선 049/050 상담 접수·연락처·알림 변경을 포함하지 않는다.
DB 원복: supabase/rollback_phone_signup.sql. 새 휴대전화 회원 기록은 보존되지만 이메일 인증 또는 재적용 전까지 회원 기능 이용이 제한된다. 원복 전 적용 이후의 추가 함수 변경 유무를 확인한다.
화면 원복 기준: a84862c. 변경 커밋 revert 후 배포.

## 참고
- Google 로고 원본: https://developers.google.com/static/identity/images/g-logo.png
- Google 버튼 지침: https://developers.google.com/identity/branding-guidelines
- Supabase SMS 인증: https://supabase.com/docs/guides/auth/phone-login
