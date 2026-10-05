# 예약 알림·모바일 검증 결과 — 2026-10-05

## 운영 DB
037~038 사용자 승인 후 단일 Transaction 실행 완료. 추가 039는 실제 FCM 전송 큐와 서버 전용 토큰 연결, 예약 최종 상태 알림을 구현하며 별도 단일 Transaction으로 적용 완료.
기존 회원/예약 삭제, 테이블/컬럼 삭제, 컬럼 타입 변경, TRUNCATE 없음. 039의 DROP TRIGGER는 기존 알림 트리거를 Transaction 종료 시 실행하는 방식으로 교체하며 데이터 삭제가 아님.
적용 후 Auth 3, 회원 Profile 1, 예약 0 유지. push queue RLS=true, authenticated 직접조회=false, 서버 RPC 직접실행=false, 지연 트리거=true 확인.

신규 private 테이블: phone_contacts, phone_otp_challenges, notifications, office_staff, push_subscriptions, push_deliveries. 039가 push_subscriptions에 token_hash/binding_key 추가. Storage 변경 없음.
백업은 저장소 바깥 outputs/private-backup-2026-10-05에 보관. 개인정보가 포함되어 Git/배포 제외.
롤백: supabase/rollback_solapi_phone_otp.sql, rollback_reservation_notifications.sql, rollback_fcm_push_delivery.sql. 먼저 Netlify 푸시/SMS 스위치를 끄고 실행. 새 기록은 보존. 039 지연 트리거 안전 수정은 유지. 세 롤백 SQL의 로컬 실제 실행 및 예약 행 수 보존도 검증 통과.

## 구현
- 기존 Google/이메일 로그인 유지, 전화번호는 연락처 확인 용도. SOLAPI HMAC 서명과 Hash-only OTP.
- 6자리/3분/30초 재발송/10분3회/오입력5회/이전코드무효화. 공급자 접수 성공은 실제 수신 성공으로 취급하지 않음.
- 예약 저장 후 서버 알림 기록, 분리된 FCM HTTP v1 발송. Firebase SDK 12.19.0, Service Worker, 토큰 사용자 바인딩, 만료 토큰 해제.
- 앱 알림함/읽음/개수/Toast/예약 상세. 고객 본인·배정 전문가·보험소 담당자·관리자만 상세 조회.
- 첫 예약 뒤 선택형 푸시 안내. 거절해도 예약 유지. 로그아웃 시 로컬 바인딩 우선 제거하여 오프라인 상황의 이전 계정 알림 차단.
- 재시도 중복 방지: 알림/기기 유일 큐, 서버 lease. 응답 불명확한 발송은 UNKNOWN으로 기록하고 자동 재발송하지 않음. 이 경우 알림함에서 확인 가능.
- 잠금화면에는 일반 예약 안내만 표시. 상세 상담/건강정보/전화번호 발송하지 않음.
- 설정 우선순위: 회원·예약은 DB release/service_features, 알림 공급자 스위치는 Netlify(IN_APP_NOTIFICATIONS_ENABLED, PUSH_NOTIFICATIONS_ENABLED). public config notificationFeatureSource=netlify. RESERVATION_SMS_ENABLED는 활성화하지 않음.
- 하단 메뉴72px/safe-area/본문여백1회/키보드 시 메뉴 숨김/지도 카드닫기. Netlify 배지는 사이트 설정에서 OFF.

## 검증 범위
| 항목 | 결과 |
|---|---|
| 037~039 운영 적용·기존 행 수·RLS | PASS |
| 로컬 OTP 정책/발송 계약/예약 복귀 | PASS, 모의 |
| 로컬 알림 권한/중복/최종상태/타계정 차단 | PASS, 모의 |
| FCM 토큰 이동·API 계약·권한거절·오프라인 로그아웃 | PASS, 모의 |
| 320/390/844/1440 화면, footer/지도카드/알림함 | PASS, 브라우저 |
| Netlify 배지 Production | NOT_VISIBLE |
| 실제 SMS 수신/실제 코드 입력 | UNTESTED |
| 실제 FCM 전경·배경·고객↔전문가·거점 Push | BLOCKED: Firebase 프로젝트/자격정보 미설정 |
| Android/Samsung/카카오/iPhone 실기기 | UNTESTED |
| 이번 코드 Production 배포 | 보류: 사용자 요구 실제 수신 검증 전 |

## OWNER 연결 단계
현재 Firebase 계정에는 프로젝트가 없음. console.firebase.google.com에서 프로젝트 만들기 화면을 열어둠.
1. 프로젝트 이름 bohumso를 입력하고 약관을 직접 확인·동의해 생성. Google Analytics/개발자 프로그램은 이 기능에 필수 아님.
2. 프로젝트 설정 → 일반 → 웹 앱 추가 → SDK 설정의 firebaseConfig를 JSON으로 정리: Netlify bohumso 환경변수 FIREBASE_WEB_CONFIG.
3. 프로젝트 설정 → Cloud Messaging → Web Push 인증서 → 키 쌍 생성의 공개키: FIREBASE_VAPID_PUBLIC_KEY.
4. 프로젝트 설정 → 서비스 계정 → Firebase Admin SDK → 새 비공개 키 생성. 다운로드 JSON 전체를 Netlify FIREBASE_SERVICE_ACCOUNT_JSON에 Secret으로 직접 등록. 비밀값은 채팅에 보내지 않음.
5. 테스트할 Preview 환경에 위 3개를 설정. PUSH_NOTIFICATIONS_ENABLED=true는 제한된 실제 테스트 연결 시에만 설정. Production은 실제 검증 전 false 유지.
6. 기존 SMS_ALLOWLIST 번호의 실제 휴대전화에서 테스트 화면에 로그인하고 인증번호 직접 입력. 새로운 이메일을 요구하지 않으며 기존 로그인 계정 사용.
7. 별도 역할 테스트에는 실제 승인된 전문가/거점 담당 계정과 수신 기기가 필요. 임의로 기존 계정을 전문가로 변경하거나 가짜 수신 성공 처리하지 않음.

공식 FCM 전경/배경 처리: https://firebase.google.com/docs/cloud-messaging/web/receive-messages
공식 서버 인증: https://firebase.google.com/docs/cloud-messaging/send/v1-api

## 최신 미리보기
https://6ac38c607156b5a3fb2a6986--bohumso.netlify.app
알림함/SW/SDK 200, 미인증 OTP/기기등록/관리자발송401, 배지미노출 확인. 로그인 복귀 허용주소 추가는 사용자 실행시점 확인 대기.
