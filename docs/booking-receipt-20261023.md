# 예약 수신 진단 및 예약 화면 정리 — 2026-10-23

## 운영 읽기 전용 진단
- 사용자가 지정한 전화 로그인 계정에서 예약 한 건(10af21cc…1ed8)을 식별했다. 희망 일정은 2026-10-26 09:00 KST, 상태 requested.
- 연락처 테이블만으로는 찾을 수 없었으나 auth 사용자와 customer_id 대조로 확인했다. 연락처 0행을 예약 없음으로 판단하면 안 된다.
- planner_id는 운영자 Google identity가 있는 이메일 계정 UUID와 일치하고, 전문가 신청 approved / planner_eligible=true이다.
- 현재 열린 운영자 휴대전화 로그인은 별도 UUID다. 해당 계정은 이 예약의 planner가 아니며 전문가 신청 없음 / eligible=false. 표시 이름으로 동일 계정 판단하지 않았다.
- 해당 UUID를 트랜잭션 범위 JWT subject로 설정해 기존 조회 함수를 호출한 결과: consumer/customer, Google/partner, phone/admin 각각 해당 예약 ID 반환 true. 실제 다른 계정으로 재로그인한 UI 검증은 아니다. 결과는 해당 ID 존재 여부만 출력했다.
- BOOKING_REQUESTED 알림이 고객과 지정 전문가 양측에 2026-10-23 19:50:42 KST 생성. 전문가 알림 미읽음, 활성 기기 1개.
- 전문가 푸시 발송 기록: FAILED / attempts1 / UNREGISTERED 한 건, SENT / attempts1 한 건. 푸시 서비스 접수 성공은 실제 OS 화면 표시나 사용자의 수신 확인을 보장하지 않는다.
- 고객은 활성 기기 0, 발송 기록 없음. 앱 내 알림은 존재한다.
- 최초 확인된 단절: 현재 브라우저의 전화 로그인 계정과 예약을 받은 Google 전문가 계정 불일치. 예약/알림 DB 생성 누락은 확인되지 않았다.
- 최소 조치: 기존 승인된 Google 전문가 계정으로 로그인해 받은 요청 및 앱 내 알림 확인. 미등록 기기의 재연결은 해당 기기에서 별도 확인. 계정 병합/권한 확장/재배정/재발송 불필요하며 시행하지 않았다.
- 전화 원문, 이메일, 구독 endpoint/key/token은 이 보고서와 스크린샷에 저장하지 않았다. 운영 SQL은 SELECT와 트랜잭션 범위 설정만 사용. 예약/계정/권한/정책 변경 없음.

## 화면 변경
- public/requests.html, public/partner-work.html: 제목/새로고침 통합, 검색·부가 요약을 목록 아래로 이동.
- public/booking-management.css: 두 예약 페이지에만 적용. 홈의 색상·글꼴·간격·버튼 토큰 사용.
- src/booking-overview.js: 카드에 상대방·상태·희망/확정시간과 방식·버튼 1개. 비용/지역/설명은 기존 상세 안에 유지. 상세 한 건만 열기, 목록 복귀/스크롤/알림 진입 보존. 10건씩 더보기, 처리 필요 건수 및 조건 밖 미처리 건수 표시. API 200건 범위 표기.
- src/workflow.js: 조회 진행/최초 실패/재조회 실패/진짜0건 구분. 실패 시 이전 목록 보존. 목록 조회에 신규 예약 게이트를 표시하지 않되 실제 신규 신청 게이트는 유지. 일정 변경·문제 신고 접기.
- tests/booking-overview-browser.mjs: 기존 행동 테스트 유지, UI 요구 변경에 맞춘 상세 정보 위치 확인 및 오류/권한/더보기 검증 추가.

## 검증
- 격리 브라우저: 소비자 360/390/430/768/1440, 전문가360/390/430/1440. 가로 넘침 없음. 모바일 첫 카드 행동 버튼 bottom<754px(높이844). 글씨200% 검사 통과.
- 단일 상세/목록 복귀/입력 실패 보존/재조회 스크롤/현재·지난 보기/알림 정확한 예약 진입 통과.
- 최초 조회 실패와 0건 구분, 재조회 실패 시 이전 카드 유지, 25건 중10→20 더보기, 새로고침은 consultation_command 호출0 검증.
- 전문가 수락과 소비자 일정 확정 버튼 권한 구분. 알림 설정을 새 접근 제한으로 만들지 않음.
- node --test tests/booking-hardening.test.mjs: 2개 통과(격리 PGlite). 상담OFF 후 기존 요청 유지, 승인·연락처 권한, 동의, 중복시간, 단일 수신자 보존.
- npm run build: 클라이언트/서버 프로덕션 빌드 통과. 배포 없음.
- 스크린샷은 실제 개인정보가 없는 격리 fixture이다. before: artifacts/booking-receipt-before/list-390.png. after: artifacts/booking-overview/list-390.png, partner-390.png, list-1440.png 및 각 폭 파일.

## 남은 운영 확인 / 범위
- 실제 Google 로그인 세션의 화면 확인과 실제 휴대전화 푸시 표시 확인은 미실시. 현재 사용자 세션을 로그아웃하지 않았다.
- 운영 반영/배포 미실시. DB migration·권한·알림 정책 미변경.
- 조회 API는 기존 최근200건 한도. 화면 더보기는 받은 범위 내에서 동작하며 200건 밖 과거 미처리까지 보장하지 않는다. 서버 커서/미처리 전용 조회는 별도 검토해야 한다.
- 전체 npm test/verify는 재수행하지 않음. 위 해당 범위만 검증.

## 배포 진행 — 2026-10-23
사용자 승인으로 수정 커밋 fc1787a를 기존 Netlify main 자동배포에 반영. 운영 결과는 배포 완료 후 기록한다.

## 운영 배포 완료 — 2026-10-23 20:24 KST
- 사용자 배포 요청으로 main69a2a1d 반영. Netlify6adb43c6628655378ca7f46b ready/published 2026-10-23T11:24:06.275Z, 배포 오류 없음.
- /requests.html, /partner-work.html HTTP200. 새 booking-management.css 연결, 제목1개, 검색이 목록 다음임 확인. CSS 내용 일치.
- 운영 account.js가 참조하는 공통8개 모듈 모두200. booking-task-count/booking-more 및 조회실패 안내 코드 반영 확인. CI 결과와 로컬 생성 번들의 바이트 동일성은 성립하지 않아 동일 해시로 보고하지 않는다.
- 운영 로그인 계정 전환/예약 변경/푸시 재발송 없이 정적 자산 검증. 로그인 후 실사용 전체 검증은 기존 보고서의 미확인 항목 유지.
- 링크: https://bohumso.netlify.app/requests.html / https://bohumso.netlify.app/partner-work.html
