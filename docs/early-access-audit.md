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


## 구현·검증 결과 — 2026-10-05 후속 점검

새 고객 공개가입, 4단계 설계사 프로필, 회사 명단 확인, 예약 잠금, 권리 요청·관리자 답변, 약관 초안과 별도 동의기록을 구현했다. 운영 SQL 030~036은 적용 대기이며 Production은 기존 1e7f989를 유지한다. Preview만 EARLY_ACCESS 설정이다.

전체 자동 검증 74/74 및 기존 브라우저 5개 묶음 통과 후 추가 변경을 검증했다. 최종 SQL/설정 집중 검증 7/7 통과(20건 예약 왕복은 한 테스트 안에 포함). 지도 4개 화면 크기 통과. 실제 외부 Google/메일·Android GPS·운영 예약 왕복·실제 동시 트랜잭션은 미실행이며 로컬 결과로 대체하지 않는다.

|항목|기존상태|수정내용|테스트횟수|성공횟수|실패원인|재검증결과|Production 반영여부|
|---|---|---|---|---|---|---|---|
|Production/Preview|PARTIAL|인증·메일 Production 주소 고정, Preview 개발 검증 전용|외부 설정 1|1|없음|PASS|코드 대기|
|일반 신규가입|BROKEN|초대·정책·전화와 가입 플래그 분리|DB 1, 화면 포함|DB 1|운영 SQL 미적용|로컬 PASS|대기|
|Google/Email Auth|PARTIAL|기존 Google 유지, 이메일 필수동의·PKCE·내부 복귀|화면 회귀 묶음|묶음 통과|실계정 인증·메일 수신 미검증|실환경 PARTIAL|메일 제목·본문만 저장|
|휴대전화|OWNER_ACTION_REQUIRED|예약/연락처 전달 전 실제 확인 필수, Provider 차단 유지|기존 보안 묶음|통과|실SMS 업체 미연결|OFF 유지|기존 OFF|
|지도 위치|PARTIAL|지도 중심 UX·거부/시간초과·지역선택 유지|4개 크기|4|Android 미연결, Desktop GPS 미확인|모의 PASS/실기기 미완|기존 화면 유지|
|전문가 예약|PARTIAL|30분 슬롯·잠금·실전화·최종 연락처 동의|로컬 10왕복|10|실제 계정/정책/SMS 미준비|로컬 PASS|대기|
|보험소 방문예약|PARTIAL|실제 ACTIVE 주소·달력,09~18시 시작/60분 슬롯|로컬 10왕복|10|실제 운영 거점 없음|로컬 PASS|대기|
|중복예약|PARTIAL|DB 원자 잠금·중복 클릭 재사용·동일 시간 거절|왕복 내20충돌|20|실제 두 연결 동시 실행 미실행|로컬 순차 충돌 PASS|대기|
|전문가 가입·확인|BROKEN|1~2분 목표4단계·자료 나중 제출·등록 또는 소속 확인·명단 만료 차단|DB 3, 화면 포함|DB 3|서버 자격증명/문서 연결 없음|로컬 PASS/문서 OFF|대기|
|이용약관|LEGAL_REVIEW_REQUIRED|실제 흐름에 맞춘 공개 검토안·구버전 보존|외부 페이지1|1|법적 주체/최종 승인 없음|초안 접근 PASS|대기|
|개인정보처리방침|LEGAL_REVIEW_REQUIRED|항목·목적·권리·외부 처리·삭제 미확정 명시|외부 페이지1|1|보유기간/국외이전 조건 미확정|초안 접근 PASS|대기|
|위치정보 안내|LEGAL_REVIEW_REQUIRED|현재 위치와 지역추정 구분, 추적 OFF|외부 페이지1|1|실기기/최종 검토 필요|초안 접근 PASS|대기|
|전문가 약관|LEGAL_REVIEW_REQUIRED|자격 보증 아님·심사·자료·제재 안내|외부 페이지1|1|최종 검토 필요|초안 접근 PASS|대기|
|ConsentRecord|PARTIAL|별도 유형·버전·동의시각·append-only·연락처 실제 수신자|DB 가입/예약 묶음|통과|신뢰할 IP/UA 수집 미연결(null)|저장/변조 차단 PASS|대기|
|Footer/권리 요청|PARTIAL|공통 약관 링크·요청함·관리자 답변/감사·탈퇴 이용종료|DB1 + 페이지1|2|관리자 쿼리 별칭 충돌 수정|재검증 PASS|대기|
|RLS/API/Storage|PARTIAL|새 private RLS·역할 검사·60초 서버 열람·비공개 bucket SQL|외부API5, 설정1, 로컬 묶음|외부6|Windows 의존성 링크가 서버 배포에 누락됨|독립 번들 후401/503 정상|코드/SQL 대기|
|결제/실시간위치|READY(비활성)|운영 결제·카드·라이브/배경 GPS OFF|설정1, API 포함|통과|PG/SMS 계약 미완|비활성 PASS|기존 OFF|
|특허 검토문서|LEGAL_REVIEW_REQUIRED|개별 반경 보상 없음·청구항 비교/전문가 검토 기록|문서검토1|1|변리사 비침해 의견 없음|기술기록 작성|대기|
|OWNER_INPUTS/운영차단|OWNER_ACTION_REQUIRED|운영자 사실·정책·SMS·문서서버 비밀·테스트 참여/기기 정리|운영 감사1|1|실운영 준비 미완|차단 유지|준비 대기|

운영 감사: 현재 private 36개 모두 RLS, 사용자3/인증완료2/관리자1/승인전문가0. 문서 Storage bucket0/정책0. SMTP는 custom ON, Gmail465, 발신명 우리곁에 보험소, 사용자당60초. 실제 전달 성공은 확인하지 않았고 비밀값은 읽지 않았다.

검토 배포에서 502가 발생했던 원인은 Windows의 node_modules junction을 함수 패키지가 참조한 것이다. scripts/build.mjs가 서버 의존성을 독립 ESM 파일로 묶고 로딩까지 검사하도록 변경했으며, Netlify는 artifacts/deploy-functions를 사용한다. 수정 배포의 실제 API 인증/비활성 응답을 확인했다.

최종 개발 검토 배포: `6ac35c0205839c68e1f2eb0b`. 공개가입 브라우저 **10/10**(인증메일 새 탭 포함), 서버 엄격 타입 검사 PASS. 고객에게 공유할 주소는 https://bohumso.netlify.app/ 하나이며 새 기능의 Production 적용 완료를 의미하지 않는다.
