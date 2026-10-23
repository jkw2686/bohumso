# 예약·알림 화면 개선 — 2026-10-23

## 운영 확인
- 구글 전문가 계정으로 실제 요청, 앱 내 새 요청/수락 처리 알림, 해당 예약 상세 이동 확인. 해당 요청은 고객 일정 확정 대기. 이 작업에서 수락·취소·예약 생성 없음.
- 해당 계정 활성 구독 1개 확인. 오늘 시험 알림 생성 기록 없음(최신 시험 기록 10월 15일). 사용자 휴대전화는 알림 미도착 보고. 활성 구독이 해당 휴대전화인지는 미확인.
- 실제 휴대전화 표시와 알림 탭 후 예약 진입은 미확인. 서버 발송 성공과 기기 표시를 동일시하지 않음.

## 변경
- src/account.js: 전문가 가능 설정 하단 접기, 알림 요약/foreground 연결.
- src/booking-overview.js: 상태별 다음 버튼, 지난 예약, 단일 상세.
- src/expert-visits.js: 빈 이력 숨김, 방문 목록 간결화·단일 상세, 통합 새로고침, 방문 가능 검색 문구 축약.
- src/office-request.js: 날짜 칩, 3단계, 간결 확인·완료.
- src/notification-settings.js, src/notification-prompt.js: 미지원·차단 구분, 구독 저장과 실제 도착 구분, 안내 링크를 실제 기기 설정으로 수정.
- src/foreground-notice.js: 새 앱 내 알림 안내, 중복 억제, OFF/계정 변경 존중. 읽기만 수행.
- src/service-clarity.js, public/service-clarity.css 및 account/requests/partner-work/notifications/urgent HTML: 화면 범위 CSS, 접힌 운영정보.
- 지도·DB·권한·알림 서버 정책 변경 없음.

## 검증
- 프로덕션 빌드 통과.
- booking-overview-browser: 360/390/430/768/1440, 단일 상세, 조회 실패/0건 구분, 더보기, 계정별 뷰, 200% 글씨, 새로고침 무변경 통과.
- booking-selection-browser: 6개 크기, 가능시간, 대상 보존, 실패 복구/중복 방지, 완료 후 내 예약 통과.
- notification-settings-browser: 5개 크기, OFF·차단·구독 실패·계정 전환·재로그인 분리 통과.
- foreground-notice-browser, visit-overview-browser 통과(격리 목업).
- reservation-push-endpoint 단위 3개, reservation-push-worker-browser IndexedDB/표시 호출/클릭/계정 불일치 억제 통과. 실제 푸시 발송 테스트 아님.
- expert-visits-browser 전체 격리 DB 검증은 프로세스 메모리 부족으로 중단. 전체 통과로 보고하지 않음.
- 검은 b 요소: 운영 전문가 화면 스크린샷 및 정확한 b 텍스트 조회에서 재현 안 됨. 원인 미확인, 임의 숨김 없음.

## 증거(로컬 ignored)
- artifacts/service-clarity/before-bookings/list-390.png → artifacts/booking-overview/list-390.png
- artifacts/service-clarity/before-notifications/settings-390.png → artifacts/notification-settings/settings-390.png
- artifacts/booking-selection/review-390.png
- artifacts/service-clarity/google-inbox-production.png, google-request-production.png (운영 개인정보 포함 가능, 원격 커밋 제외)

## 남은 확인
- 사용자 휴대전화 최신 설정 화면에서 구독 확인 → 시험 알림 1회 → 발송 기록 → 실제 표시 → 클릭. 임의로 다른 기기에 발송하지 않음.
- 배포 결과는 후속 기록. 2026-10-23 사용자 배포 승인 받음.

## 배포 확인 2026-10-23 21:05 KST
- 코드 07f377db1a2089bc51395ba946e64603af2b2d6c, Netlify 6adb4d85d40d2993ba4c7141 ready/published 2026-10-23T12:05:47.263Z.
- 운영 CSS는 LF 정규화 후 로컬과 일치. account/urgent JS 본문은 환경별 청크 해시 이름 제외 후 일치. 공개 push config enabled=true.
- 운영 구글 계정 재로그인 후 새 알림 설정, 받은 요청·예약 카드(10/26 09시 전화, 고객 일정 확정 대기), 방문 가능 설정 접기 확인. 운영 스크린샷 artifacts/service-clarity/production-after.png.
- 실제 휴대전화 수신 미확인. 휴대전화 브라우저 종류 질문 대기. 사용자의 실제 기기에서 구독/시험 버튼 실행 및 도착 확인 필요. 이 단계 서버 시험 발송·예약 변경 없음.
