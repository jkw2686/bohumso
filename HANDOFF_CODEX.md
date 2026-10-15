# 현재 상태 — 출시 검수 6회차, 기기 설정 지연과 기본 예약 분리 (2026-10-16)

이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 다음 할 일부터 진행.

## 이번 단계
- [x] src/account.js: 알림 링크는 기기 설정 없이 서버 권한 조회, 일반 inbox/기기 설정 독립 실행. 기본 예약 조회 완료 후 추가 기능 전에 화면 표시.
- [x] src/read-rpc.js: 12초 읽기 전용 기한. 알림/설정 get/약속 status·get 적용. 저장·수락·취소·설정 set의 응답 처리와 정책/권한/DB는 유지.
- [x] src/booking-notifications.js: 설정 응답 보류여도 inbox 표시, 버전 검사로 이전 조회 응답 무시.
- [x] src/notification-settings.js: 초기조회중 잠금, 실패시 설정 미확인·재조회·기존선택유지, 준비완료 오표시 차단. config fetch8초기한.
- [x] tests/notifications-browser.mjs와 tests/notification-settings-browser.mjs에 응답보류·늦은응답·OFF중읽기실패 복구 추가.
- [ ] 운영 배포와 실화면 확인 기록 예정. 현재 이전 운영은 b66b2e5/6ad0fe870180ecaff3393d4c, 세무사 거점 안내(01:26:03 KST).

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
롤백은이번클라이언트변경을이전fc2e1a4로되돌리고DB·구독·원예약·알림행은보존한다. 문서커밋은[skip netlify] [skip ci].
