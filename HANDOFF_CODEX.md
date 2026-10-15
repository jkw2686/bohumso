# 현재 상태 — 예약 알림 운영 배포 / 휴대전화 수신 검수 중 (2026-10-15)

이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 다음 할 일부터 진행.

## 완료
- 원인: 원예약/이벤트/전문가 알림·수신UUID 정상. 미설치 appointment_care 게이트가 기본 알림을 숨겼고 notifications.html은404였다.
- 기본 앱 내 복구 7c0c9fc / Netlify 6ad0b30c84ee4a8289013d67 / 20:03:55 KST. 독립 list RPC·오류/재시도·권한검사 예약이동·조회 읽음금지. DB 변경 없이 먼저 배포.
- 회원 설정/웹 푸시 cfe6ea2 / Netlify 6ad0ba1163407032e890dba9 / 2026-10-15 20:33:56 KST ready. 운영 https://bohumso.netlify.app/notifications.html . 공개 미리보기 https://6ad0ba1163407032e890dba9--bohumso.netlify.app . 1분 Scheduled Function 등록 실제 확인.
- 사용자에게 영향 제시 후 운영 DB·푸시 설정 적용 명시 승인 받음. SQL067 신규테이블3/RPC2 적용, VAPID키·subject·활성플래그 합4변수 production/functions 저장(개인키 secret). 기존예약/알림/트리거/legacy push/정책 무변경. SQL확인: RPC권한제한 정상·기존알림 수신자 및미열람 보존.
- 운영 PC: 기본ON/기기연결전/시험버튼비활성, 정확한OFF경고·유지, 기존예약링크→이충경 해당예약 카드. 운영4폭 가로넘침없음. 전문가 실계정 목록은 못봄.
- 전체 npm test 167/167 및빌드 통과. 설정브라우저4폭/OFF/실패/권한/전환/로그아웃/연결중전환경합, 워커실제IndexedDB권한·중복·로그아웃차단 통과. 모든 push이벤트/제공자는 모의. 실제수신이 아니다.

## 최신 보정 (이 절이 이전 UI·구독0 기록보다 우선)
- 메인고정배너는 사용자지시로 제거. 앱실행/예약맥락 권한안내 팝업(나중에/ESC, 맥락별세션1회, 명시OFF/기기준비완료면생략)으로 변경·검수완료, 배포진행. src/notification-prompt.js 신규 및 member-entry/account/expert-visits/simple-ux 연결.
- jkw Android 수신준비완료 사용자답변 및구독1건저장확인. 최초시험1건은시도0에서재연결로취소되어동일수신자/활성구독/설정ON/정확한행만PENDING복구. 새예약/새시험알림생성안함. 제공자/실수신결과확인필요. 이충경기기미확인.
- 준비완료버튼잠금으로중복재연결취소방지. 팝업4폭/나중에/OFF/이미준비완료/권한+저장 및기본알림회귀·빌드통과.

## 이전 시점 기록 (후속 상태는 위 최신 보정 참고)
- 실제 시험 대상: jkw2686@gmail.com, 이충경, 각자의 Android 휴대전화. 이충경 수신확인은 모른다고 사용자 답함.
- 20:36 KST SELECT: 지정계정 구독0·발송0·시험알림0, 기존대상알림 미열람그대로. 실제 시험발송 안함. 휴대전화 수신 성공판정 금지.
- 사용자: 링크를 누르면 메인만 보임, 알림안내 없음. 직접URL/로그인복귀는 PC에서 정상, 휴대전화 원인미확정. 파일·HTML을 찾으라는 설명 금지; 클릭링크나 화면 메뉴로만 안내할 것.
- 사용자 최신: 앱 실행 시 자동 안내가 떠야 하는 것 아닌가. 로그인한 메인에서 짧은 안내+예약알림켜기 링크 자동표시 보완 중. src/member-entry.js/public/simple-ux.css/tests/notifications-browser.mjs 후속배포 완료: 877b5ff / 6ad0bcc1a43443cf300da159 / 20:45:19 KST. 운영 메인 자동안내→설정화면 확인. 시스템권한창 자체는 사용자의 버튼클릭 필요.

## 다음 할 일 (약30~60분 + 사용자 응답)
1. 추가 메인4폭/지도유지/알림진입 및 로그인전체복귀 browser 통과. 이메일폼 접힌 details를 펼치는 fixture 수정 후 통과.
2. 후속코드 main push·배포ready·운영메인 자동안내 확인 완료. 사용자에게 앱 다시 열기와 안내버튼만 설명했으며 휴대전화 실제 화면 답변 대기.
3. 각휴대전화에서 권한허용+구독저장까지 확인. 기기당1회 '이 기기로 시험 알림 받기' 실행 후 앱닫은상태 OS도착 확인. DB발송 SENT는 제공자접수이며 실제수신과분리 보고. 전체시험·시험예약 금지.
4. 전문가 실로그인에서 기존알림1건/예약이동 확인(필요시사용자전환). 관리SELECT와실UI혼동금지.
5. HANDOFF/본파일/ROADMAP/배포시각/검증 갱신. 문서만 커밋에는 [skip netlify] [skip ci].

## 테스트 / 되돌리기
npm run build; npm test; node tests/notifications-browser.mjs; node tests/notification-settings-browser.mjs; node tests/reservation-push-worker-browser.mjs.
Windows sandbox Edge는 종료되어 require_escalated 실행 필요. 실제웹UI는CUA만. 상세 docs/reservation-notifications-20261015.md. 개인정보 증빙은 저장소밖 outputs/notification-recovery 및 notification-audit.
롤백은 RESERVATION_PUSH_ENABLED=false+재배포. 데이터삭제/기존알림재생성/계정병합/노쇼전체활성화/SMS·카카오·새유료서비스 금지. 키/기기구독원문은로그·채팅·저장소출력금지. 내장시험은본인활성기기/요청키중복방지/분당1회, 시험앱내알림1건만생성하며예약생성안함.
