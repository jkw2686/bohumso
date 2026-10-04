# 출시 준비 점검 — 2026-10-04

판정: PUBLIC_LAUNCH_READY 아님. 구현 테스트와 실제 운영 검증을 구분한다.

|항목|현재상태|수정내용|테스트결과|Production 반영|남은문제|OWNER_ACTION_REQUIRED|
|---|---|---|---|---|---|---|
|Git/Netlify|READY|기존 저장소·배포 유지|18f5d78 ready · 10/4 10:42 KST|완료|공개 config/페이지 확인 완료|없음|
|Supabase 긴급 기능|READY|024/025/026/027, 임시 위치 정리|cron succeeded·84개 활동지역|완료|실제 전문가0|실제 승인 전문가 참여|
|비밀키/결제|PARTIAL|결제 OFF, 잘못된 서버키 제거, TOSS secret|환경 메타데이터 확인|완료|functions-only scope 플랜 제한|필요 시 플랜 판단, 유료 변경 없음|
|Auth Google/returnTo|PARTIAL|기존 로그인 보존, 신규가입과 정책분리|외부 redirect 차단 단위검증|완료|실제 재로그인은 사용자 계정으로 미실행|최종 Google 실기기 확인|
|이메일/약관|LEGAL_REVIEW_REQUIRED|정책 미승인 서버차단, 기능기반 초안|우회호출 금지 검증|DB 완료|브랜드 가입메일·정상 인증링크 저장 완료. 운영 주체·보유기간·해외이전 확정 필요|최종 정책 승인·SMTP/도메인|
|예약/OTP|PARTIAL|서버 전화 인증조건, Provider/전용 화면|테스트 모드 발송0, cooldown/attempt 제한|DB 완료|실SMS와 실제 예약 전과정 미검증|SMS 공급자 설정·실제 테스트 참여자|
|RLS/권한|PARTIAL|private 직접접근·다른고객조회 차단|가상 계정 DB 테스트 통과|private 36/36 RLS, 직접 SELECT 권한0 확인|운영 별도 계정·동시성 검증 필요|테스트 참여자|
|위치/모바일|PARTIAL|DEVICE/MANUAL/NETWORK 출처·SAVED 복원·15분만료|유효성·만료 단위검증|완료|실제 폰 GPS 확인 필요|위치 허용/거부 실기기 확인|
|전문가/예정거점|PARTIAL|실제 프로필 샘플제거, 83예정거점과84서비스권역 분리|공개 정확좌표 미노출 검증|기본 기능 적용|운영 방문가능 주소 없음|실제 운영장소 확인|
|주활동/지금가능/이동|READY|명시적 ON·한명 수락·상태알림|지역·만료·권한·여정 테스트|적용, 신규시작 정책 제한|실SMS·실전문가 미검증|같음|
|알림/전체문구|PARTIAL|화면 내 상태조회, 간결한 제한문구|기본 여정 통과|기존 기능|NotificationProvider 실제 운영연결/문구 전수정리 남음|SMS 연결 전 발송 금지|
|Closed Beta|OWNER_ACTION_REQUIRED|초대목록+서버 검증 준비, 기본빈목록|초대없는 요청 거절|DB 적용|고객10~20/전문가3~5/20건 실제 테스트 없음|참여자·정책·SMS 준비|
|Android|OWNER_ACTION_REQUIRED|조건 충족 전 보류|미실행|미반영|웹 베타 완료 전 AAB/스토어 진행 안 함|웹 베타 성공 이후|

총 단위/DB 자동 테스트63 통과. 연결 흐름·전문가 가입·일반 가입·브랜드/동의·모바일/데스크톱 commerce 브라우저 검사도 개별 통과. 구형 find 화면은 외부 CDN 지도 파일을 사이트 내 파일로 교체했다. 통합 실행의 최초 실패 기록과 이후 개별 통과 결과를 구분한다. 실제 회원·전문가·GPS·SMS 성공을 의미하지 않는다. 011 expert onboarding 신규 테이블은 운영 미적용이며 과거 승인 체계를 호환한다. 문서 업로드 OFF/새 expert 심사 전체 연결은 별도 검증 필요.

가입 메일은 Supabase Confirm signup에 한국어 제목·정상 ConfirmationURL·브랜드 HTML을 저장하고 미리보기를 확인했다. 실제 메일 수신은 미검증. 소스: docs/email-confirmation.html.

권한 점검 시 원문 개인정보·비밀키·OTP를 로그에 쓰지 않는다. 테스트계정으로 실제 전문가 승인 우회 금지. 과거 public 샘플 dashboard/analysis 직접URL은 예제 표기가 남아 있고 일반 홈·계정 링크는 제거했다.

사용자 최신 지침: 위 미확정 항목은 OWNER_INPUTS.md에 누적하고 독립 개발·검증은 계속한다. docs/data-audit.md 및 docs/closed-beta-runbook.md 참고.


2026-10-04 추가: 정책 상세 초안, 미완료 계정 로그아웃, 전문가 SMS 공통 Provider 차단, 조건부 preflight 및 베타20건 준비 완료. npm run verify 전체 성공 + preflight 추가1 및 지도/예약/긴급/미완료회원/전화OFF 브라우저 검증 통과. 실제 PC 위치는 NETWORK 추정, 실기기 GPS 성공 아님.
