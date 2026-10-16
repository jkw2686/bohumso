# 현재 상태 — 출시 검수 6회차, 기기 설정 지연과 기본 예약 분리 (2026-10-16)

이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 다음 할 일부터 진행.

## 이번 단계
- [x] src/account.js: 알림 링크는 기기 설정 없이 서버 권한 조회, 일반 inbox/기기 설정 독립 실행. 기본 예약 조회 완료 후 추가 기능 전에 화면 표시.
- [x] src/read-rpc.js: 12초 읽기 전용 기한. 알림/설정 get/약속 status·get 적용. 저장·수락·취소·설정 set의 응답 처리와 정책/권한/DB는 유지.
- [x] src/booking-notifications.js: 설정 응답 보류여도 inbox 표시, 버전 검사로 이전 조회 응답 무시.
- [x] src/notification-settings.js: 초기조회중 잠금, 실패시 설정 미확인·재조회·기존선택유지, 준비완료 오표시 차단. config fetch8초기한.
- [x] tests/notifications-browser.mjs와 tests/notification-settings-browser.mjs에 응답보류·늦은응답·OFF중읽기실패 복구 추가.
- [x] 운영 53f7978 / 6ad10640095ad7a2b5d242f5 / 2026-10-16 01:59:00 KST ready·커밋일치.
- [ ] 배포후 실화면: 내장브라우저 ERR_NETWORK_IO_SUSPENDED와 오류페이지 URL차단으로 미완료. 이전버전 앱내 기존시험1건 표시를 새버전/전문가/실푸시 완료로 간주하지 말 것.

## 검수
빌드통과. 예약/약속/알림/푸시서버 격리13개, 알림4폭+설정/부가기능응답보류·정확링크·타인차단·로그인복귀, 설정4폭+명시OFF중조회실패/재시도·모의구독·계정전환/로그아웃, 예약선택6크기 모두통과. 운영시험예약/전화/실제푸시/읽음변경/DB변경없음. 이전전체168+추가1 검사 결과와 이번13개 회귀는 구분한다.

## 판단과 롤백
부가 조회가 기본 예약을 막는 클라이언트 의존만 제거. 응답 지연의 네트워크/인증 원인 자체를 해결했다고 표현하지 않는다. 롤백은 이번6회차 코드/테스트만 이전58a39cc로 되돌리며 세무사 거점과 DB·알림행·구독·원예약을 보존한다. 상세 docs/launch-review-20261016.md. 출시준비완료판정보류.

## 내일 이어갈 항목 (20~40분 + 각자기기 협조)
1. 이충경본인기존알림1건→정확한예약진입. 상대계정로그인허용범위에서확인,원예약상태변경금지.
2. jkw와이충경각Android구독·정확한푸시문구/앱닫힌상태수신. jkw이전최초시험은제공자SENT1회이나답변'왔는데모르겠어'라정확수신미확인. 전문가구독없다는이전SELECT이후미확인. 추가시험임의발송금지.
3. 현재브라우저회원초기연결지연원인과관리SQL편집기정상화후읽기대조. 인증키/토큰/구독원문추출/출력금지.
4. 활성운영보험소실대상없음(이전SELECT0건). 격리예약분기검수와실운영검수를구분.

## 유지 및 금지
전문가공개동의번호만전화보조/상담요청주버튼,전문가보험소CTA재추가금지. 실제보험소예약분기유지. 카카오/알림톡보류,경력미표시,선택프로필미작성불이익없음. 상담ON/OFF와알림설정분리. 앱내기본ON/명시OFF존중/정확OFF경고/과거내역유지. 계정병합·노쇼전체활성화·문자·새유료서비스·요금변경·일괄재전송금지.
SQL067/068은기존명시승인적용완료이며이번회차DB변경없음. 원예약알림수신자전문가UUID/읽음NULL과시험1건SENT는이전10월15일SELECT근거. 이번실기기완료라고표현금지.

## 실행 / 롤백
npm run build; npm test; node tests/booking-selection-browser.mjs; node tests/notifications-browser.mjs; node tests/notification-settings-browser.mjs; node tests/profile-usability-browser.mjs.
Windows브라우저시험은sandbox Edge종료로require_escalated필요,실제UI는CUA만. 개인정보증빙은저장소밖outputs/launch-review. 상세 docs/launch-review-20261016.md.
6회차 롤백은 이전58a39cc의 해당 코드만 복원하고 DB·구독·원예약·알림행은 보존한다. 문서커밋은[skip netlify] [skip ci].

## 2026-10-16 01:59 — 6회차 운영 배포, 운영 재조회 막힘
- 코드 53f79788c3582357e86504b38a11e7d85e32eddc / Netlify 6ad10640095ad7a2b5d242f5 ready, published_at 2026-10-15T16:59:00.213Z = 2026-10-16 01:59:00 KST. 커밋 일치 확인.
- 운영 https://bohumso.netlify.app / 고정 버전 https://6ad10640095ad7a2b5d242f5--bohumso.netlify.app .
- 배포 전 운영 현재 계정의 기존 앱 내 시험 알림 1건·읽음 기록 없음·기기 연결 전 표시를 조회만 확인. 이는 10월15일 기존 시험 내역으로 이번에 생성/발송한 것이 아니며 전문가 예약 알림이나 실제 푸시 수신 완료 증거가 아니다.
- 배포 후 운영 페이지 재조회에서 내장 브라우저 ERR_NETWORK_IO_SUSPENDED, 이어 오류페이지 data URL을 도구 URL 정책이 차단. 정상 원래주소로 재진입 1회도 실패. 보호/네트워크 설정을 바꾸거나 다른 브라우저로 우회하지 않음. 이번 버전 운영 알림 화면/원예약 링크 실표시·모바일 운영 화면은 재검수 미완료. 격리 브라우저 통과와 구분.
- GitHub verify 38773460574 최종 조회 당시 in_progress, 이전 지도문구 verify38768909586 success. 현재 실행 완료 여부는 다음에 확인(성공 단정 금지).
- 이충경본인·두 Android 실수신·현재관리SELECT·활성운영보험소 검수는 기존 미확인 유지. 출시준비 판정 보류. 새예약/상태변경/전화/시험푸시/DB변경 없음.
- 다음 작업: 내장브라우저 연결 복구 후 운영 inbox·기존예약 정확이동 10~15분, 현재관리SELECT 10분, 이충경·기기협조검수20~40분. 네트워크 오류 자체를 보험소 코드 결함으로 단정하지 않음.
