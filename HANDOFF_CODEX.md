# 최신 작업 — 2026-10-23 전문가 신청/지역 소식 분리

## 2026-10-23 — 전문가 활동신청과 지역 활동 소식 분리
- public/office-slot.js, public/map.js, src/region-waitlist.js: 오픈 예정 보험소·빈 지도·방문 탐색의 전문가 활동신청을 /partner.html?roleIntent=expert&region=... 실제 신청 링크로 변경. 비로그인 가입/로그인과 기존 신청/관리 분기를 재사용한다. 신규 신청 화면·데이터·권한 자동 변경 없음.
- 별도 보조 버튼 '이 지역 활동 소식 받기'; 제목 '지역 활동 소식 받기', 설명 '이 지역의 서비스 오픈·활동 준비 소식을 알려드려요.', 제출 '활동 소식 신청', '전문가 등록 신청과는 별개입니다.' 표시. 전문가 팝업만 도움 유형 제거·need=null. 기존 consumer/planner 역할값·연락처 정규화·동의·RPC·기록 유지.
- 지역은 URL과 인증 복귀 next로 유지. 기존 전문가 신청서에는 region URL 자동 입력 기능이 없으므로 지역을 임의 저장/덮어쓰기하지 않는다. 신청서에서 활동지역을 직접 선택한다.
- public/map.css: 데스크톱 빈 시트 버튼 2열로 배치해 늘어난 항목과 기존 방문 링크가 모두 들어오게 함.
- 검수: build 및 diff --check 통과. help-login(비로그인·일반회원·신청중·승인 + 지역 유지·저장0), region-waitlist(6폭 팝업·동의·consumer 유지·planner need null), map-empty-waitlist(5폭), home-popup(6폭), region-waitlist-connected(격리 DB 저장) 통과. 샌드박스 내 Edge 시작 실패 후 허용된 격리 브라우저로 재실행.
- 운영 DB 쓰기/실제 신청/실문자·메일/푸시 발송/배포 없음. 실휴대전화 미확인. 기존 미커밋 tests/early-access-browser.mjs 및 디버그·outputs는 이번 변경에 포함하지 않는다.

다음: 운영 배포는 별도 승인 시 진행. 실휴대전화 확인 필요(예상 10~15분). 되돌리기: 이번 변경 커밋 revert, DB 원복 불필요.

--- 이전 인수인계 ---
# 현재 상태 — 전체 페이지 간결화 (2026-10-17)
이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 다음 할 일부터 진행.

## 범위·진행
- [x] 서비스 HTML37개 공통 간격 및 페이지별 감사. 전문가 관리 우선 배치, 설명 접기/업무 메뉴 축약, 홈/인증/청구 도움/이전 화면 반복 문구 정리.
- [x] 예약 장소·비용 상시 표시, 상세 열기와 수락·확정 구분, 중첩 접힘 제거. 지도 직접 선택·실제 보험소 방문예약 유지.
- [x] 37×5 정적조건과 마지막12페이지60조건 통과. 격리 동작 검사 통과. 페이지별표/증빙 docs/page-clarity-20261017.md.
- [x] npm run build, git diff --check 통과.
- [x] 새 명시 승인으로3bc4275 main 반영·운영 배포 완료. Netlify6ad2fef3be0db24fff59e3cb, 2026-10-17 13:52:18KST. 공개 CSS/account번들 일치 확인.
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
허용된 비제외 계정·실휴대전화 검수30~60분(기기 준비 별도). 이번 배포 완료. 추가 배포는 새 변경 범위 확인 후. 로컬 캡처는 공유/배포주소 아님. 전체 운영 역할·실기기 검증으로 표현하지 말 것. 이충경 과거 미확인 과제 재개 금지.


## 2026-10-17 13:52:18 KST 운영 배포
사용자가 main 반영·운영 배포를 명시 승인하여 3bc42758b9ab42683809f65821a6bb391e4715ef를 origin/main에 반영. Netlify 6ad2fef3be0db24fff59e3cb ready, published_at=2026-10-17T04:52:18.345Z, error=null. 운영 https://bohumso.netlify.app / 고정 https://6ad2fef3be0db24fff59e3cb--bohumso.netlify.app . 공개 page-clarity.css와 assets/account.js HTTP200 및 로컬과 정규화 본문 일치 확인. 실제 회원·이충경 자료 접근/발송 없음. 잔여 크레딧은 도구에 제공되지 않고 Netlify UI 로그인이 필요하여 미확인(Pro 요금제만 확인).
