# 현재 상태 — 출시 검수 5회차 개선, 실기기 확인 대기 (2026-10-16)

이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 다음 할 일부터 진행.

## 운영 버전과 판정
- 최신 코드 220c94d88f181b19d775ef9131bfe20fe3a4931d, Netlify6ad0f3c346673d614d742f5f, 2026-10-16 00:40:05 KST ready. 이전1~4회차b3fa08b/6ad0f1eb0394ace6ef8d4c3e/00:32:15 KST도ready.
- 운영 https://bohumso.netlify.app / 미리보기 https://6ad0f3c346673d614d742f5f--bohumso.netlify.app . 기존reservation-push-dispatch 1분스케줄 유지. DB/서버설정 변경 없음.
- **출시준비완료아님. 공개출시·광고실행없음.** 이충경본인계정·Android검수는사용자 '내일하자' 답변으로이번범위에서미확인. 초기회원연결지연은복구안내구현과원인해결을구분한다.

## 이번 반복 개선
1. src/office-request.js: 저장성공뒤목록실패는조회만재시도. 예약RPC재실행없음/로딩잠금/성공과푸시별개. 저장응답UUID가있으면정확한예약권한확인링크로진입.
2. src/booking-notifications.js: 읽기RPC12초한도,오류·재시도,늦은이전응답무시. care와독립/읽음자동처리없음/중복생성없음.
3. public/service-ui.css·public/map.css, src/workflow.js: 날짜/시간중립형·선택테두리/aria-pressed,보조행동테두리형·취소위험텍스트,본문/입력16px·맥락14px·지도주버튼16px. 지도높이/요금/정책미변경.
4. src/account.js: 초기회원확인15초지연안내·읽기재로드. 늦은성공시안내제거,명시적오류재시도. 인증정보삭제/자동로그아웃/병합없음.
5. 시험자료보완: 예약빈목록시험의로그인/기본알림계약보완. tests/basic-reservation-alerts.test.mjs+tests/fixtures/operational-reservation-alerts.sql(10월15일관리SELECT의함수스냅샷). 이SQL은시험전용,운영에적용금지.

## 검증 근거
- 기존전체168개검사통과+추가운영함수스냅샷연동1개통과. care없이요청→수락→확정→제안/변경수락→취소,정확수신자/중복/타인차단/미열람/방송없음검사.
- 예약선택6크기360×640/390×844/430×932/768×1024/1440×900/740×360,저장후목록실패복구/정확ID링크통과. 알림응답보류/재시도/늦은응답/부가기능실패/권한/로그인복귀,설정OFF/계정전환/로그아웃모의푸시통과. 초기연결지연재로드·늦은성공복구추가검사통과.
- 프로필5폭/긴이름·소속·소개/사진/200%글자/지도중심·줌·선택복귀 및 빈목록·필터4폭통과. build통과. b3fa08b verify38761150641 success,최신220c94d verify38762299590 completed success 확인. 이전모바일verify38750546506 success.
- 기존예약98333c96-38da-491c-96e4-c93257e9f286: 배포전운영소비자알림URL→내예약·이충경·2026-10-16 13:00·요청상태확인. 배포후재조회에서회원초기확인지연/본문숨김발견,5회차로안내보완. 최종배포후운영고객화면에서같은예약/이충경/13:00/요청표시확인. 원예약수정/취소/확정/발송없음.
- 현재관리SQL재SELECT는편집기미렌더링으로미완료. 새SQL탭35,읽기초안은저장소밖 outputs/launch-review/admin-readonly.sql. 기존10월15일SELECT와스냅샷은현재재SELECT증거가아님.

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
