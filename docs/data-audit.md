# 실제 기능·데이터 점검

2026-10-04. 소스와 공개 config/이전 운영 DB 점검을 구분한다. 데이터 원문·토큰·OTP 수집 없이 점검했다. 공개 설정 operator/contact는 서비스명과 이메일이며 법적 주체 확정 아님.

|흐름|항목·목적|처리 위치·열람 범위|보유·삭제/현재 상태|근거|
|---|---|---|---|---|
|이메일/Google|인증 계정 ID·이메일·인증 상태, 공급자 계정 메타데이터|Supabase Auth, 본인 세션|Auth 세션은 브라우저 저장; 탈퇴 일괄 삭제 미구현|src/member-access.js, account.js|
|가입 완료|가입 시각·약관 버전·선택 마케팅 동의|member_profiles/consents, 본인 RLS|신규 완료 정책 승인/초대 검증; 일반 보유기간 미확정|001,023,026 SQL|
|전화 인증|전화번호·인증 상태, OTP는 인증 공급자가 처리|Supabase Auth, 본인|공급자 OFF. 앱은 OTP 저장 안 함; 서버 제한은 공급자 설정 필요|phone-verification.js|
|일반 예약|목적·지역·일정·진행 상태·배정·동의·연락처|private consultations/contacts/events, 본인·해당 담당자·관리자|상태별 공개 제한, 일반 보유기간/삭제 미확정|003,020,023,026 SQL|
|긴급 요청|목적·위치·장소·전화·메모·상태|private urgent 테이블; 후보에게는 개략 요청, 수락자에게 상세|좌표 종료 상태에서 정리; 요청은 ends_at+24시간 뒤 삭제, 이벤트/제안 cascade|024,025 SQL|
|지도|기기 좌표/직접 선택 지역/접속 지역 추정|sessionStorage 15분, 공개 지도에는 지역 중심만|정확 기기위치와 접속 추정 구분; 백그라운드 추적 없음|public/location.js, home-map.js/map.js|
|전문가 지금 가능|주/추가 활동지역·기간·일회 좌표·동의·변경 이력|private; 공개는 지역중심·상태|좌표 중지·만료·수락 때 정리, 지역 변경 이력 1년|024 SQL|
|전문가 심사|이름·직군·소속·자격번호·서약·심사 사유|기존 partner_applications 및 비공개 감사|새011 심사 운영 미적용; 샘플 프로필 공개 제외|011 SQL, partner-onboarding.js|
|파일|마스킹된 자격/신분 파일과 메타데이터|Netlify 함수·Supabase private storage, 권한 확인|EXPERT_DOCUMENTS_ENABLED=false, 수집 안 함; 신규 기능 활성 전 원본 삭제 검증 필요|netlify/functions, expert-shared.js|
|결제|테스트 주문·금액·상태·대사·이벤트 식별자|비공개 결제 원장·Toss 테스트|실결제/카드저장 OFF, 앱 카드 원문 저장 없음|004,008,021 SQL, payment 관련 함수|
|로그/통계|서버 요청 로그, 감사 actor/action/time; 방문 통계는 일자/임의 세션 ID|플랫폼 로그·비공개 DB|visitMetrics=false; 공급자 로그 보유기간 확인 필요|006 SQL, public-config.mjs|
|외부 전송|호스팅·인증·저장·Google 로그인·OSM 지도 타일|Netlify/Supabase/Google/OSM|타일 요청에 IP·표시 지도영역 전달 가능; 국가/계약조건 확정 필요|netlify.toml, public/vendor 및 지도 파일|

## 차이 및 조치
- 기존 개인정보 안내의 보유기간·권리절차·브라우저 저장 설명을 구체화한다. 실제 없는 자동 탈퇴·전체 삭제를 약속하지 않는다.
- 공개 문의처는 실제 config의 jkw2686@gmail.com 사용. 대표자·사업자번호·운영주소는 만들지 않는다.
- 전문가 기존 문자 코드가 공통 Provider를 우회하던 경로를 통합한다. 비활성 설정에서는 발송 0.
- 정책 문서는 검토 초안 상태 유지. 약관 미승인/초대/전화 인증 서버 제한 유지.
- 위치 권한은 PC 브라우저에서 재시도하고 화면 결과를 기록한다. 모의 좌표 성공을 실제 GPS 성공으로 표현하지 않는다.
- 법적 필수사항 최종 검토 기준: [개인정보보호위원회 작성지침 목록](https://www.privacy.go.kr/front/bbs/bbsList.do?bbsNo=BBSMSTR_000000000049). 이 문서는 법률 승인 결과가 아니다.
