# 먼저 읽을 것 — 저장소 상태 경고 (2026-10-19)
아래 '현재 상태' 요약은 2026-10-17 제품 작업 기준이며 **그대로 유효하다**. 2026-10-19 실행은 리서치 브리핑만 추가했고 제품 코드·DB·요금·정책을 바꾸지 않았다. 다만 저장소 상태에 다음 두 가지가 있으니 이어받기 전에 확인한다.

1. **`origin/main`을 읽기 전에 `git fetch` 먼저.** 이번 실행에서 fetch 없이 읽어 `origin/main`이 `3c64497`로 보였고, detached HEAD의 `4f79804`·`f1c7594`를 '미푸시·미승인 커밋'으로 **잘못 판단했다**. fetch 후 확인 결과 둘 다 이미 origin/main에 있다. 미푸시 커밋은 없었고, 보존용으로 만든 `wip/detached-20261019`는 origin/main과 동일해 삭제했다. 저장소 상태는 2026-10-17 배포 이후와 다르지 않다.
2. **브리핑·인수인계는 별도 브랜치에만 있다.** `docs/research-briefing-20261019`, 커밋 `0bb2f9b`·`b2d9b66`, 초안 PR #3(mergeable clean, 체크 통과). `origin/main` 미반영.
3. **`[skip netlify]`는 PR 배포 프리뷰를 막지 않는다 (확인됨).** 두 커밋 모두 `[skip netlify] [skip ci]`를 달았으나 Netlify가 PR 프리뷰를 빌드했다. 운영 배포에서 실제로 막히는지는 미확인.

2026-10-19 브리핑이 코드에서 확인한 미해결 지점(상세·검증 한계는 HANDOFF.md 2026-10-19 항목):
- `public/company-info.js` 사업자등록번호·통신판매업 신고번호·주소·대표전화 전부 빈 문자열 → 운영정보 섹션 미렌더. **전문가 구독료 수취 전 선결.**
- `public/coverage-data.js` 83개 전부 `status:"planned"`. 운영 중 거점은 `offices.status='active'`에서만 나온다(`home-map.js:83`). **DB에 active 거점이 있는지는 미확인.**
- `supabase/seed_ad_pricing.sql` 슬롯이 서울·경기·인천 **광역 3개뿐** — 거점 1개 구(區) 전략을 담을 단위가 없다.
- 38개 HTML 전수 grep 결과 JSON-LD 0건, og:image 0건, canonical 8건. `sitemap.xml`은 7 URL만(소비자 진입면 다수 누락).
- `netlify.toml` CSP는 아직 Report-Only.

**bohumso.netlify.app 직접 열기는 2026-10-19 실행에서 네트워크 정책에 막혀 실패했다. 위 지점은 전부 로컬 코드 기준이며 운영 화면 검증이 아니다.**

---

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
