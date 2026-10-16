# 현재 상태 — 예약·알림·모바일 검수 및 예약 화면 간소화 (2026-10-16)
이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 다음 할 일부터 진행.

## 최신 지시
이충경 관련 실제 계정·예약·알림 완전 제외. 해당 건 조회/읽음/상태/재전송/연락 금지. 과거 보류 검수를 재개하지 않는다. 이번 모든 시험은 합성 UUID/메모리 PGlite/차단된 브라우저 모형. 마지막 사용자 “배포해”로 현재 코드 GitHub main 반영·Netlify 배포 승인. 운영 DB·권한·요금·정책 변경과 실제 회원 예약·발송은 여전히 승인 범위 밖.

## 완료/진행
- [x] 예약 현재/지난·취소 보기, 상대·시간·상태 요약, 상세1회 열기, 처리/보조/취소/신고 정리.
- [x] 필터·상세열림·스크롤 사용자/역할별 복구, 자동재조회 위치 보존, 처리 결과 바로표시, 지정예약 진입.
- [x] 긴 기기알림 설정은 기존 /account.html#notificationSettings. 예약에는 상태요약/설정링크, 기존 /notifications.html 목록 유지. 모르면 켜짐 추정 금지. 기기만OFF와 앱내OFF 분리/계정전환중확인창 저장차단.
- [x] 고객 보험소방문예약·전문가 고객방문 구분 유지. 방문내역도 요약/현재지난 동기화. 지도빈상태 숨김CSS복구.
- [x] 관련 SQL/서버/브라우저 회귀와 5폭/360px200% 통과. 자세한 근거 docs/booking-release-audit-20261016.md. 전체 npm test를 이번에 전부 재실행한 것은 아님.
- [x] npm run build 통과. 새 프레임워크/DBmigration/요금정책/카카오/문자/실회원발송 없음.
- [ ] 마지막 승인에 따른 운영 배포/운영 공개 정적번들+격리자료 확인 결과 후속기록.
- [ ] 실기기 터치·OS글자/스크린리더/실제푸시 미검증. 이충경 외 허용 테스트 계정·기기 지정 및 수신검수 필요(사용자가능시간 의존 15~30분). 출시 준비완료 아님.

## 파일·검사
src/booking-overview.js 신규. workflow/account/booking-notifications/notification-settings/expert-visits.js, public requests-page.css/service-ui.css/account.html/partner-work.html. SQL은 test fixture의 선택적 고정시각만 변경, 운영 supabase 파일 변경 없음.
node tests/booking-overview-browser.mjs; node tests/notifications-browser.mjs; node tests/notification-settings-browser.mjs; node tests/booking-hardening-browser.mjs; node tests/booking-selection-browser.mjs; node tests/requests-page-browser.mjs; node tests/map-empty-waitlist-browser.mjs; node tests/map-controls-browser.cjs; node tests/visit-map-icons-browser.mjs; node tests/expert-contact-actions-browser.mjs; node tests/expert-visits-browser.mjs.
node --test --test-concurrency=1 tests/basic-reservation-alerts.test.mjs tests/booking-hardening.test.mjs tests/reservation-web-push.test.mjs tests/reservation-push-endpoint.test.mjs tests/expert-visits.test.mjs tests/booking-hours.test.mjs. Windows 격리 Edge 검사 require_escalated 필요.
전후 비교는 BOOKING_BASELINE_REF=b07cc0d를 로컬에서 설정해 overview 검사. 기본 검사는 과거 Git 이력 불필요. artifacts/booking-overview/list-390.png,before-390.png,enlarged-360.png 증빙. localhost는 공유/배포주소 아님.

## 되돌리기와 미검증
이번 커밋의 화면/진입/테스트만 되돌리고 이전 청구 만화·지도 직접선택·실제 보험소·공개동의전화·기본알림/서버ACL 유지. 저장 설정없는 기존회원ON/명시OFF/읽음미처리/예약중복방지 보존. 운영실회원/실기기/실푸시 증거를 코드·빌드성공으로 대체하지 않는다. DB변경으로 우회하지 않는다.
