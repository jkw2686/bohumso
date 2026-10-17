# 현재 상태 — 전체 페이지 간결화 (2026-10-17)
이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 다음 할 일부터 진행.

## 범위·진행
- [x] 서비스 HTML37개 공통 간격 및 페이지별 감사. 전문가 관리 우선 배치, 설명 접기/업무 메뉴 축약, 홈/인증/청구 도움/이전 화면 반복 문구 정리.
- [x] 예약 장소·비용 상시 표시, 상세 열기와 수락·확정 구분, 중첩 접힘 제거. 지도 직접 선택·실제 보험소 방문예약 유지.
- [x] 37×5 정적조건과 마지막12페이지60조건 통과. 격리 동작 검사 통과. 페이지별표/증빙 docs/page-clarity-20261017.md.
- [x] npm run build, git diff --check 통과.
- [ ] 이번 변경 미배포. 이전 운영 ee306ca / Netlify6ad1f50055b845cd21d14766 (2026-10-16 18:57:35KST)과 구분. 이전 배포 승인 재사용 금지.
- [ ] 실기기/실푸시/실회원 양쪽 상태 미검증. 출시준비 판정 안 함. 과거 약관8·test-flow 미수정/미검수.

## 절대 보존
이충경 실제 계정·예약·알림 제외: 조회/읽음/발송/상태 변경 금지. DB·권한·요금·무료기간·정책 불변. 카카오 연결 안 함. 실제 운영 데이터 시험 금지.

## 재현
npm run build
node scripts/clarity-regression.mjs booking-overview-browser.mjs booking-hardening-browser.mjs service-ui-browser.mjs policy-pages-browser.mjs page-clarity-browser.mjs
QA_PHASE=after node tests/page-clarity-inventory.mjs (PowerShell에서는 env 변수 지정; 기본 before는2d6df1c 캡처)
QA_INLINE=1 node tests/appointment-care-browser.mjs
그 외 notifications/profile-pages/expert-workspace-order/auth-options/booking-selection/claim-help/claim-conversations/map-controls/profession --ui-only 통과. Windows 격리Edge 권한 필요. 전체 npm test 재실행은 아님.

## 판단·되돌리기·다음
기존 DOM 이동으로 입력/이벤트 보존. native details로 키보드/동시열림. 필수 상태/비용/동의 숨기지 않음. CSS/UI만 되돌릴 수 있고 SQL/서버 변경 없음. 구형 테스트 selector/직군 fixture/약관 기대버전은 수정 후 통과.
허용된 비제외 계정·실휴대전화 검수30~60분(기기 준비 별도). 배포는 이번 작업에 대한 별도 지시 후. 로컬 캡처는 공유/배포주소 아님. 전체 운영 역할·실기기 검증으로 표현하지 말 것. 이충경 과거 미확인 과제 재개 금지.
