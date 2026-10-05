# 실운영 통합 감사 — 2026-10-05

기준: Production https://bohumso.netlify.app/, 작업분기 codex/bohumso-oct03 / 1921088. 이전 028/029 베타 SQL은 운영 미적용. 새 지침이 초대 전용 가입 지침을 대체한다. Preview는 고객 안내·실제 OAuth·이메일 복귀 주소로 사용하지 않는다.

|기능|현재 판정|근거 / 이번 조치|
|---|---|---|
|Production / Preview|PARTIAL|운영 1e7f989 계열, 작업분기에는 베타 가입 변경. 검증 후 묶음 반영|
|일반 신규가입|BROKEN|정책 승인/초대와 묶임. 별도 signup·expert·booking 플래그로 분리|
|Google 로그인|PARTIAL|기존 구조 유지, 실제 신규/재로그인 계정 검증 필요|
|이메일 가입·복귀|PARTIAL|PKCE 구현, 실제 메일 인증과 session 생성 미검증. 가입 전 동의 의도 보존|
|Account 상태|PARTIAL|고객·미완료·관리자 있음. 전문가 draft/확인 상태로 정리|
|메인 카피·상황카드|READY|요청한 메인카피/서브카피/6개 상황이 이미 현재 소스와 일치|
|지도·Bottom Sheet·모바일|READY|최근 4개 크기 회귀 통과. 지도 중심 구성 유지|
|실기기 위치|OWNER_ACTION_REQUIRED|Desktop 실제 GPS 미수신/대략 지역, Android 미연결. 모의 성공과 구분|
|전문가 프로필|BROKEN|운영에 없는 011 RPC를 호출하는 기존 절차. 새 간편 draft 경로 필요|
|자격·소속 자료|SECURITY_BLOCKER|기존 신분증 필수 절차가 새 지침과 불일치. 등록증/위촉증명서만, private 접근 검증 전 OFF|
|활동지역|READY|주활동지역+추가2곳 모델 존재. 간편신청과 연결|
|가능시간|PARTIAL|문자열·예약 선택 있음. 구조화 시간 검증/예약 충돌 연결 필요|
|보험소|PARTIAL|예정 거점과 실제 office table 분리, 실제 운영주소 없음. ACTIVE만 방문예약|
|전문가 예약|PARTIAL|상태머신·본인 조회 구현. 실제 계정 10회 미실행|
|보험소 방문예약|PARTIAL|운영 거점 허용 검사 있으나 30분 UI/office 슬롯 제약 보완 필요|
|중복예약|PARTIAL|확정 유일 제약과 베타 로컬 원자 잠금 존재. 일반 request/office 공통 제약 추가|
|휴대전화|OWNER_ACTION_REQUIRED|provider·차단 구현, 실SMS OFF. 가입에서 제외하고 예약 전 요구|
|회원탈퇴·권리요청|PARTIAL|문의 중심. 서비스 이용 종료와 삭제 처리 대기/감사 기록 필요|
|약관·개인정보|LEGAL_REVIEW_REQUIRED|실제 기능 초안 있음, 운영자 법적 정보·보유정책 미확정. 승인 플래그 임의 변경 금지|
|위치·전문가·결제 안내|PARTIAL|별도 페이지/공통 footer 추가 필요|
|동의기록|PARTIAL|기존 단일 회원 동의·예약 연락처 동의. append-only 유형별 버전 이력 확장|
|RLS·API|PARTIAL|운영 private36/36 RLS 및 API5개 차단 확인 이력. 새 테이블/역할별 실제 재검증 필요|
|결제|READY|테스트 구조 유지, 실결제·카드 OFF. 활성 결제 검증 성공은 아님|
|실시간/백그라운드 위치|READY|OFF 유지|
|Demo/Mock|MOCK|로컬 fixture는 운영과 분리. 공개 디렉터리 sample 제외. 실예약 성공으로 계산 금지|
|특허|LEGAL_REVIEW_REQUIRED|지도 UX 유지, 개인별 노출반경 확대 사용 안 함. 변리사 검토 필요|

공식 개인정보 문서 작성 참고: 개인정보보호위원회 [안내서 목록](https://www.privacy.go.kr/front/bbs/bbsList.do?bbsNo=BBSMSTR_000000000049), [개인정보 보호법 제15조](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1033214947). 이 감사는 법률 적합성·특허 비침해를 확정하지 않는다.
