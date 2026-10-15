# 예약 알림 복구 및 웹 푸시 적용 검토

## 운영 반영 완료: 앱 내 기본 알림

원인: 기본 알림 생성은 정상이나 화면이 미설치 appointment_care capability에 종속되어 숨겨졌고, 알림에 저장된 notifications.html 경로는 404였다.

7c0c9fc / Netlify 6ad0b30c84ee4a8289013d67, 2026-10-15 20:03:55 KST 운영 반영. notification_inbox(list)를 독립 표시하고 notification_reservation의 서버 권한검사 결과로 이동한다. 조회·이동으로 읽음 처리하지 않는다. 기본 알림과 선택적 care 목록을 중복 mount하지 않는다. DB 변경 없음.

운영 기존 예약 링크 → 내 예약의 이충경 해당 카드 이동 확인. 고객 자신의 요청은 전문가에게 가므로 고객 알림 0건을 수신 실패로 판정하지 않는다. 전문가 실계정 알림 목록과 휴대전화 수신은 아직 미확인.

## 추가 구현: 운영 DB/서버 승인 및 적용

검토 파일: supabase/067_reservation_web_push.sql.

- 신규 private 테이블 3개: notification_preferences(본인 ON/OFF), web_push_subscriptions(계정·기기·구독·기기 비밀 해시), web_push_deliveries(알림/구독/연결 UUID별 중복 방지·발송 상태).
- 신규 RPC 2개: reservation_notification_settings는 authenticated 본인만, reservation_web_push_service는 service_role만 실행. 신규 테이블에 RLS를 켜고 일반 역할의 직접 접근을 차단한다.
- 설정 없는 회원은 조회 시 ON으로 해석한다. 회원 전체에 행을 일괄 생성하지 않는다. 새 설정의 명시적 OFF를 유지한다. 기존 legacy push_subscriptions/push_deliveries와 비활성 기록을 건드리지 않는다.
- 기존 예약·이벤트·알림·트리거·권한·노쇼 정책·계정 연결은 변경하지 않는다. 기존 알림 재생성·재전송과 전체 회원 시험 발송은 없다.
- 신규 기기 연결 이후의 새 요청/변경/확정/취소만 해당 수신자의 활성 구독에 전달한다. 예약 저장 경로와 발송 경로를 분리한다. 제공자 접수 SENT와 실제 휴대전화 도착은 다른 검증이다.
- 시험 발송은 로그인 본인의 활성 기기 1개만, 요청 키 중복 방지·기기당 분당 1회 제한. 시험용 앱 내 알림 1건과 그 기기의 발송행만 생성하며 예약은 만들지 않는다.

Netlify 설정 추가 4개: RESERVATION_PUSH_ENABLED=true, WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, WEB_PUSH_SUBJECT=mailto:jkw2686@gmail.com. VAPID 키는 새로 생성하여 Netlify 서버 환경에만 저장한다. 비밀 키를 코드·클라이언트·로그·채팅에 출력하지 않는다. 기존 SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY를 재사용한다. 새 유료 외부 서비스는 없다. 1분 간격 Scheduled Function이 발송 대기를 처리하므로 Functions/DB 사용량은 발생한다.

실제 푸시에는 브라우저 제공자(FCM/Apple/Mozilla/Windows)에 기기 구독과 일반적인 예약 안내 문구가 전달된다. 고객 이름·전화번호·상담 내용은 푸시 본문에 넣지 않는다. 서비스 워커 연결 UUID 검사를 추가해 계정 전환 후 이전 계정의 지연 알림 표시와 클릭을 막는다. 로그아웃 전 해제 실패 시 로그아웃 실패를 안내한다.

## 적용 순서와 되돌리기

1. 검증 완료한 SQL 067 및 위 서버 설정의 운영 적용 승인.
2. 운영 SQL을 트랜잭션으로 적용하고 함수/권한/기존 대상 알림·예약이 그대로인지 SELECT 확인.
3. 새 키를 서버 환경에 저장하고 기능 플래그 활성화, 코드 배포. 운영 API/설정/로그인 복귀 확인.
4. 지정한 jkw2686@gmail.com, 이충경 계정이 **각자의 휴대전화**에서 로그인 → 예약 알림 켜기 → 권한 허용 → 구독 저장 성공 확인. iPhone/iPad는 지원 버전과 홈 화면 웹앱 조건을 실제 기기에서 확인해야 한다.
5. 각자 이 기기로 시험 알림 받기를 1회 실행하고 앱을 닫은 상태에서 실제 도착을 확인한다. 운영 발송행의 제공자 접수 결과와 사용자 실기기 확인을 별도로 기록한다. 임의 대리 기기 등록/전체 시험 발송 금지.

롤백: RESERVATION_PUSH_ENABLED=false로 서버 발송과 신규 등록을 중단하고 재배포. 기존 앱 내 알림은 유지한다. 설정/구독/발송 기록은 보존하며 테이블 삭제나 기존 예약 수정은 하지 않는다. 필요시 사용자가 OFF/로그아웃으로 기기 연결을 해제한다.

## 검증 기록

- PGlite 격리 DB: 기본 ON, 명시적 OFF 유지·SQL 재실행, 본인 권한, 서비스 전용 RPC, 과거 알림 미재전송, 중복 억제, OFF 취소, 계정 재연결, 기기 비밀 검사, 단일 기기 시험 발송·중복/속도 제한 통과.
- 서버 단위: Origin/JWT/수신자 위조 차단, 구독 URL·키 검증, 비활성 시 외부 요청 없음, 발송 성공/410/재시도/전송 불명확 구분 통과.
- 브라우저 격리: 360/390/768/1440px, 정확한 OFF 경고·유지/저장 실패, 권한 허용만으로 준비 완료 금지, 구독 저장 실패 해제, 계정 전환/로그아웃 해제, 차단 권한 표시 통과. 실제 푸시 제공자는 모의 처리했다.
- 서비스 워커 실제 브라우저 IndexedDB: 다른 연결 UUID/중복/로그아웃 후 푸시·클릭 차단, 외부 링크·외부 메시지 차단 통과. push 이벤트는 모의이며 실기기 수신이 아니다.
- 실제 휴대전화 수신: 아직 실행하지 않음. 두 계정·각자의 휴대전화는 사용자 지정 완료. 운영 DB/서버 적용과 휴대전화 권한·구독 저장이 선행되어야 한다.

사용자가 운영 DB·푸시 설정 적용을 명시 승인했다. SQL 067 운영 실행 후 신규 테이블/함수 존재, authenticated 서비스 RPC 실행 불가·본인 설정 RPC 실행 가능, 기존 대상 알림의 수신자·미열람 보존, 신규 구독/발송 0건을 SELECT 확인했다. 승인된 환경변수 4개도 production/functions에 저장 완료(비밀 키 secret). 운영 트리거 실제 정의의 요청/변경/확정/취소 유형과 큐 필터가 일치한다.

전체 단위 테스트 167/167 통과, 빌드 통과. 추가 브라우저 3종 통과. 운영 배포와 실기기 검증을 이어서 진행한다. 코드/빌드/제공자 접수만으로 수신 해결 완료라고 판정하지 않는다.

## 운영 배포 및 현재 검수 결과

회원 설정·웹 푸시: cfe6ea2 / 6ad0ba1163407032e890dba9 / 2026-10-15 20:33:56 KST ready.

메인 자동 안내 보완: 877b5ff / 6ad0bcc1a43443cf300da159 / **2026-10-15 20:45:19 KST ready**. 로그인한 회원이 메인을 열면 안내와 예약 알림 켜기 진입 링크가 표시된다. 실제 운영 메인에서 자동 표시→설정 화면의 기기 연결 전/기본ON/시험버튼 비활성을 확인했다. 1분 스케줄 등록 확인. 운영 https://bohumso.netlify.app , 해당 코드 미리보기 https://6ad0bcc1a43443cf300da159--bohumso.netlify.app .

Android 시스템 권한창은 사용자 동작이 필요하므로 앱 실행만으로 자동 허용하지 않는다. 자동으로 제공하는 것은 안내이며, 실제 권한과 구독 저장 완료 후에만 준비완료로 표시한다.

운영 360/390/768/1440px 설정 화면 가로넘침 없음, OFF 경고 문구/유지 확인, 최종 배포에서 기존 예약 링크→해당 이충경 카드 확인. 자동 안내 보완의 격리 4폭 메인/지도 유지/설정 진입과 로그인 완료→원래 알림 예약 복귀도 통과. 실제 전문가 계정 화면과 실기기 환경은 이와 구분한다.

사용자는 두 기기 모두 Android라고 지정했고, 이충경 수신 여부는 모른다고 답했다. jkw 휴대전화에서 링크를 누르면 메인만 보이고 안내가 없다고 보고해 메인 자동 안내를 보완했다. PC·격리에서 동일한 URL 오동작은 재현하지 못했으므로 원인 해결 완료로 단정하지 않는다. 20:36 KST 관리SELECT 기준 지정 두 계정 구독0·발송0·시험알림0이며 기존 대상 알림은 동일 수신자/미열람 상태다. 휴대전화의 구독 저장과 실제 도착은 아직 미확인이다.

## 변경 파일

| 구분 | 파일 |
| --- | --- |
| 기본 앱 내 알림 | src/booking-notifications.js, src/workflow.js, src/account.js, src/menu.js, public/notifications.html |
| 회원 설정·연결 해제 | src/notification-settings.js, src/reservation-push.js, src/member-access.js |
| 메인 자동 안내·화면 | src/member-entry.js, public/simple-ux.css, public/requests-page.css |
| 푸시 서버·워커 | netlify/functions/reservation-push.mjs, netlify/functions/reservation-push-dispatch.mjs, netlify/functions/_shared/reservation-push.mjs, public/reservation-push-sw.js |
| 승인된 추가 스키마·의존성 | supabase/067_reservation_web_push.sql, package.json, package-lock.json, scripts/build.mjs |
| 검증 | tests/notifications-browser.mjs, tests/notification-settings-browser.mjs, tests/reservation-push-worker-browser.mjs, tests/reservation-push-endpoint.test.mjs, tests/reservation-web-push.test.mjs |
| 기록 | HANDOFF.md, HANDOFF_CODEX.md, docs/ROADMAP-20261011.md, 본 문서 |

현재 채널은 앱 내 알림 및 명시적으로 구독한 기기의 웹 푸시다. 예약 문자·카카오 알림톡은 추가하지 않았다.
