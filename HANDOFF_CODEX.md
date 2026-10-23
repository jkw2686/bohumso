# 현재 상태 — 예약 수신 진단 및 화면 개선 (2026-10-23)

이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 '다음 할 일'부터 진행.

- 작업 위치: C:/Users/AdMins/Documents/bohumso-booking-receipt, branch fix/booking-receipt-20261023. 기존 main 작업과 분리. node_modules는 signup-fix의 junction, 대상 삭제/재설치 금지.
- 완료: 지정 예약 읽기 전용 진단, 소비자/전문가 목록 UI, 격리 브라우저 및 PGlite2/build. 세부 파일/증거/제한은 docs/booking-receipt-20261023.md.
- 결론: Google 승인 전문가 UUID로 예약/알림 정상 생성. 현재 전화 로그인 UUID는 다른 계정. 푸시 SENT1/UNREGISTERED1. 앱/OS 실제 알림 확인은 미완료.
- 운영 DB/권한/알림정책 미수정, 예약 생성/수락/취소/재발송/병합 없음. 공개 배포 없음.
- 다음: 사용자 요청 시 배포 전 최신 main 충돌 확인·빌드 후 운영 Google 세션 UI 확인(15~30분). 실제 휴대전화 알림 확인은 기기 소유자 필요. 서버200건 범위 확장은 별도 변경(1~2시간 추정), 자동 적용 금지.
- 테스트: PLAYWRIGHT_CHANNEL=msedge node tests/booking-overview-browser.mjs; node --test tests/booking-hardening.test.mjs; npm run build.
- 재현 자료: artifacts/booking-receipt-before / artifacts/booking-overview (ignored, 가상 데이터). 새 CSS는 예약 두 페이지에만 적용.
- 되돌리기: 이번 UI 커밋 revert. DB 원복 필요 없음. 이전 운영 성능 개선·180초 인증 설정은 유지.
- 전체 npm test/verify 미실행. 과거 handoff의 관련 없는 실제 사용자 데이터 조회금지 유지. 이번 사용자가 지정한 예약만 대조함.

--- 이전 작업 상태 (보존) ---

# 최신 작업 — 2026-10-23 화면 전환 성능 개선

## 현재 진행·재현·남은 일
- [x] 해시 공통 JS 모듈 분리/캐시, 기본 메뉴의 부가 조회 대기 해소, 익명 공개 설정 CDN10초 캐시. 서버 역할/관리자 판정은 캐시하지 않는다. 상세 docs/navigation-performance-20261023.md.
- [x] build, 설정 단위3, admin-ui-auth --gates-only12 / --menus-only11, help-login, navigation-performance2 통과. 생성 자산은 ignored. `node scripts/measure-client-assets.mjs`로 현재 번들 측정.
- [x] auth-options 격리DB/4폭 및 help-entry4폭 통과. map-controls:21 기존 단일 링크 선택자 실패는 범위 외로 기록/미수정.
- [x] c0b28fa main 푸시/운영 Netlify6adb3a5642b637db4e3b05bb ready(19:43:53KST),17개JS HTTP200/hash일치/해시캐시 확인. 공개설정1243/83/92ms 실제Edge hit. 전화대표 메뉴2링크/admin초기gate→본문, 홈지도/회원메뉴/2버튼 확인. 실휴대전화 성능·전체 npm test/verify는 재수행하지 않음.
- 남은 필수 작업 없음. 선택 후속:느린 네트워크 실휴대전화 체감/화면시간 비교15~30분. 운영 콜드 설정응답과 현재 서버 회원/역할 조회 지연은 남으며 권한 검사를 제거하지 않는다.
- 판단: 관리자 본문 선표시 변경은 인증 재확인 충돌로 철회, 기존 gate 순서 보존. auth180초/DB/권한 변경 없음. 향후 공개 설정 긴급 변경 시 CDN10초 반영 지연 고려.
- 되돌리기: 이번 성능 코드 커밋 revert 후 빌드/배포, DB 원복 불필요. 새 해시 모듈은 빌드에서 생성, 로컬 미커밋 생성물을 배포하지 않는다.
- 아직 깨끗하지 않은 것: 기존 tests/early-access-browser.mjs 수정, outputs/help-entry-20261018/, tests/_dbg-066.mjs 및 _dbg-early.mjs 보존·제외. 011/073 운영 RPC 누락은 별도 과제. 이충경 실제 계정·예약·알림 조회/변경/발송 금지.

--- 이전 작업 기록 ---

## 2026-10-23 — SMS OTP 유효시간 3분 적용
- 사용자 요청으로 운영 Supabase Auth > Sign In / Providers > Phone의 SMS OTP Expiry만 60→180초 저장.
- 페이지 새로고침 후 Phone 설정을 다시 열어 Expiry=180, Length=6, Save 비활성(저장 완료) 재확인. 재발송 간격·문자 Hook·관리자 권한 정책·가입/동의 조건 변경 없음.
- 실제 문자를 새로 보내거나 180초 만료 시점까지 시간 경과 시험은 하지 않음. 운영 설정 저장/재조회 확인이며 코드/DB 스키마 변경·재배포 없음.
- artifacts/sms-otp-expiry-180-production-20261023.png(로컬 ignored) 설정값 증거. 이전 기록의 60초는 변경 전 값.


## 2026-10-23 — 전화번호 대표 실제 로그인·관리 화면 검수 완료
- 사용자가 실제 SMS OTP를 직접 입력하여 전화번호 계정 로그인 완료. account 화면의 신원이 지정 전화번호와 일치함을 원문 출력 없이 확인. 인증번호 원문 조회/기록 없음.
- 실제 menu.html 운영 관리에 관리자 화면·예약 관리 두 링크 표시. admin.html 파트너 승인 관리 본문 및 대표 전용 관리자 계정 관리 패널 표시, 휴대전화 로그인 · 대표자와 기존 운영자 추가 입구 확인.
- 메뉴의 예약 관리 링크 직접 클릭 → admin-requests.html?from=menu 최초 권한 확인 안내만 → 예약 관리·업무 현황·예약 지도·상담·예약 접수 본문 로딩 확인. 권한 거부나 조회 오류 안내 없음.
- 인증 설정은 읽기만 확인: SMS OTP 6자리/60초. 앞선 만료·불일치 오류 후 사용자 요청에 따라 재발송, 최신 OTP로 사용자가 인증 성공. 유효시간/보안 설정 변경 없음.
- 실제 예약/승인/삭제/권한 추가·해제/발송/결제 버튼 실행 없음. 이번 단계 코드/DB 변경·재배포 없음. 로그인 상태 유지. 실휴대전화 브라우저 자체의 화면 검수와는 구분(문자 수신·OTP 로그인은 실제 수행).
- artifacts/phone-admin-menu-production-20261023.png(로컬 ignored): 고객 개인정보 없는 전화 대표 메뉴 캡처. 새 운영 변경이 필요하면 기존 제한 정책은 scripts/admin-owner-logins.sql 및 docs/admin-owner-logins-20261023.md 참고.


## 2026-10-23 — 최종 운영 검증 완료 범위
- 최종 코드 0ac7731 main 푸시/Netlify 6adb2e94dc2277cc1a50426e ready, commit 일치. 운영 assets/menu.js 및 assets/account.js SHA-256 로컬 검수 빌드와 일치. 두 실제 admin HTML 초기 gate 확인.
- 실제 Google 로그인으로 지정 이메일 대표 admin 본문/운영 관리 메뉴 표시 확인. 최신 배포의 관리자 계정 관리 패널에서 이메일 대표·휴대전화 대표 표시 및 관리자 추가 입구 확인(추가/해제 실행 안 함).
- 실제 다른 탭의 기존 로그아웃 버튼 실행 후 메뉴 새로고침 없이 이전 이름·관리자 링크 제거, 열려 있던 관리자 본문도 로그인으로 이동 확인. 로그인 후 전문가 승인·문의 열기·저장·발송·결제 실행 없음.
- 운영 권한 제한: 대표2/그 외 관리자0, email/phone owner의 active/my_membership.admin/is_admin/is_owner 및 다른 계정/익명 거부/등록부 비공개를 SQL로 확인. 실제 휴대전화 OTP 로그인/실기기/일반회원으로 실제 계정 전환은 미확인. 해당 상태는 격리 검사로 보완.
- artifacts/admin-owner-menu-production-20261023.png, admin-initial-production-20261023.png(로컬 ignored): 개인정보 없는 실제 화면 증거. docs/admin-owner-logins-20261023.md 참조.
- 남은 작업: 실휴대전화 대표 로그인 확인(사용자가 OTP 직접 수행, 약5~10분), 011/073 함수 누락은 별도 검토(미적용 유지). 이번 두 대표/명시 운영자 제한 외 DB·권한 변경 없음.


## 2026-10-23 — 관리자 UI 운영 배포 및 대표 로그인 제한 적용
- bc82e9d main 푸시, Netlify 6adb2a6284f84df2cced4a66 ready(해당 commit 일치). 운영 메뉴 비로그인 관리자 링크 없음. admin.html/admin-requests.html 최초 화면은 권한 확인 안내만, 이후 login next 복귀 확인. artifacts/admin-menu-production-20261023.png 및 admin-initial-production-20261023.png(로컬 ignored).
- 사용자 추가 승인 후 운영 SQL Editor에서 대표 로그인 제한만 적용. 기존 이메일 대표와 인증·가입 완료된 별도 전화 계정을 UUID로 고정한 private.admin_owner_logins 등록부 사용. 개인식별값/운영 UUID는 공개 코드에 넣지 않음.
- scripts/admin-owner-logins.sql: 기존 회원/ACTIVE 조건 유지 + 대표 식별자 현재 인증 확인 또는 대표의 최신 ADD 감사기록 요구. 기존 admin_access_command 재사용, 대표 둘 보호, 미래 운영자는 기존 가입/이메일 확인 후 대표가 이메일·사유로 명시 추가. 임의 멤버십 행/메타데이터만으로 관리자 불가.
- 운영 적용 결과 대표 로그인2/관리자 멤버십2/그 외0, 원장 admin_owner_logins_20261023.sql 기록. 후속 read-only SQL에서 양 대표 is_admin/is_owner/my_membership.admin/active_member=true, 다른 계정·익명=false, registry anon/authenticated SELECT 거부 검증.
- 첫 실행용 SQL 문자열 구분자 오류로 실패 후 수정. 전체 운영 SQL을 격리 fixture(대상 식별자 치환)에서 검증한 뒤 재실행 성공. 계정·필수동의·예약·전문가 승인·결제·발송 변경 없음.
- 최신 번호 SQL의 일괄 실행으로 미승인073이 섞이지 않게 명시적인 scripts/ 수동 SQL로 분리. 기존 migrate 워크플로·연결 설정은 변경 안 함. 404 두 RPC는 pg_proc상 실제 미존재 확인, 011/073 적용 안 함.
- src/admin-access.js 전화 대표의 null 이메일 대신 휴대전화 로그인 표시. 신규 DB2+기존 owner-admin2 검사, 전체 실행SQL 격리1, admin-access 모의 브라우저, build 통과. 기존 Google 로그인으로 이메일 대표의 실제 admin 본문 접근 확인. 휴대전화 OTP·실기기는 미확인(실제 발송 안 함).
- 상세 docs/admin-owner-logins-20261023.md. 표시 보완 배포 결과는 후속 기록 참조.


## 2026-10-23 — 관리자 메뉴 인증 동기화와 초기 표시 차단 (미배포)
- src/menu.js: 인증/다른 탭 storage/복귀 변경 시 이름·역할 메뉴 즉시 제거, 서버 역할 재조회, request revision으로 오래된 결과 무효화. src/member-access.js에 진행 중 역할 요청 무효화 API 추가.
- public/admin.html, public/admin-requests.html 및 src/admin-page-access.js: 초기 HTML부터 운영 영역 전체 숨김, 권한 확인 안내만 노출. src/account.js: 관리자만 표시, 계정 변경 시 숨김·데이터 제거, 같은 계정 인증 변경도 서버 재조회. 기존 서버/DB 권한 검사 유지.
- 404 별도 조사: expert_admin_list()=011, insurer_contacts_command(operation text,payload jsonb default '{}')=073. 현재 호출 인수와 저장소 정의 일치. 운영 정확 인수 조회도 두 함수 404 PGRST202. 운영 earlyAccess=true라 expert_admin_list는 구 분기. 최신 migrate run39874687094는 성공이나 SQL 단계 skipped(DATABASE_URL 미확인 경고); 073 적용 증거가 아님. 운영 pg_proc/원장 대조 전까지 함수 누락/운영 시그니처/캐시 원인 확정 금지.
- 최종 검수: build 통과; 관리자 UI 고유22항목(분할 gates12/menus11, 뒤로가기1 중복) 통과; help-login 기존 소비자 목적/전문가 상태·지역 복귀 통과; access/member-gate/admin-redeploy 격리 단위5/5 통과; node --check와 diff --check 통과. 전체 npm test/npm run verify는 이번 최소 수정에서 재실행하지 않음.
- 상세 변경/읽기 전용 후속 SQL/영향: docs/admin-ui-access-20261023.md. SQL 적용·권한 확대·실제 승인/삭제/결제/발송 없음. 운영 미배포, 실계정/실휴대전화 미확인.

## 다음 할 일
- 격리 회귀 결과 및 커밋은 HANDOFF.md의 최신 기록 확인. 배포는 이번 작업에서 수행하지 않음.
- 운영 DB 함수 진단은 docs/admin-ui-access-20261023.md의 읽기 전용 SQL부터. 마이그레이션 자동 적용/캐시 갱신/권한 확대 임의 실행 금지. 예상 15~30분(운영 SQL 읽기 접근 필요).
- 배포 후 관리자/일반회원/전문가 실계정·실휴대전화·실제 BFCache 확인 필요(20~30분). 운영 쓰기 불필요.
- 되돌리기는 이번 UI 변경 커밋 revert, DB 원복 없음.
- 손대지 말 것: 기존 tests/early-access-browser.mjs 미커밋, tests/_dbg-066.mjs, tests/_dbg-early.mjs, outputs/help-entry-20261018/. 이번 커밋에서 제외.

--- 이전 작업 참고 ---
# 최신 작업 — 2026-10-23 전문가 신청/지역 소식 분리

## 2026-10-23 — 전문가 신청/지역 소식 운영 검수 완료
- 709a14e 및 가입 복귀 region 보완 4c8ac25를 origin/main에 푸시했고 Netlify 운영 반영 완료. 운영 /assets/account.js SHA-256이 로컬 검수 빌드와 일치.
- 운영 지도 김포보험소 카드에서 전문가 활동신청 → 기존 전문가 가입(전문가 선택됨) → 로그인 연결을 직접 클릭. signup 초기화 후와 login next에 경기 김포시 유지 확인. 가입/로그인 제출은 하지 않음.
- 운영 소식 팝업: '지역 활동 소식 받기', 요청 설명, '전문가 등록 신청과는 별개입니다.', '활동 소식 신청' 확인. 전문가 도움 질문 없음; 소비자 알림의 도움 선택은 존재.
- 검수 추가 통과: help-login(가입·직군 선택 후 region/profession 복귀 포함), auth-options(격리 DB 가입 수단·OTP·동의). 화면 증거 artifacts/expert-regional-news-live.png(ignored, 로컬).
- 배포 완료 / 운영 UI 확인 완료 / 실제 운영 저장·발송·승인·지도공개·상담ON 변경 없음. 일반회원·심사중·승인 계정은 격리 브라우저 검수만 완료, 운영 실로그인·실휴대전화는 미확인.


## 2026-10-23 — 운영 배포 및 가입 복귀 지역 보완
- 709a14e main 푸시 후 운영 지도 김포보험소 카드에서 실제 전문가 활동신청 링크와 별도 지역 소식 팝업 반영을 확인했다. 신청 제출/발송 없음.
- 실제 운영 클릭에서 signup의 setRole이 복귀 next를 다시 만들며 region을 버리는 것을 발견. src/public-signup.js에서 최초 전문가 진입 지역을 보존해 직군 변경·로그인 링크에 전달하도록 보완했다. 화면 구성·동의·인증/권한/저장 조건 변경 없음.
- help-login 격리 검사에 가입 화면 및 직군 선택 후 로그인 링크 region/profession 유지 검사를 추가해 통과. 운영 후속 확인 결과는 최종 보고 참고.


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

## 최신 배포 갱신 — 2026-10-23
위의 미배포 상태는 해소됨. 사용자 요청으로 main69a2a1d, deploy6adb43c6628655378ca7f46b 20:24KST published. 운영 양쪽 예약 페이지/새CSS/참조8모듈200 확인. 실제 계정 전환·예약 행동·기기 푸시 검증은 미실시. 로컬/CI JS 해시 동일성 주장 금지. 최신 링크 /requests.html, /partner-work.html.

## 2026-10-23 예약·알림 간소화
- docs/service-clarity-20261023.md 참고. 화면/격리검증/빌드 완료, 사용자 배포 승인. 실제 휴대전화 미도착 보고: 시험 생성 기록 없음, 수신 해결 완료 아님. 다음: 배포 확인 및 사용자 기기 구독/시험 발송/표시 검증. DB·권한 변경 없음.

## 배포 확인 2026-10-23 21:05 KST
- 코드 07f377db1a2089bc51395ba946e64603af2b2d6c, Netlify 6adb4d85d40d2993ba4c7141 ready/published 2026-10-23T12:05:47.263Z.
- 운영 CSS는 LF 정규화 후 로컬과 일치. account/urgent JS 본문은 환경별 청크 해시 이름 제외 후 일치. 공개 push config enabled=true.
- 운영 구글 계정 재로그인 후 새 알림 설정, 받은 요청·예약 카드(10/26 09시 전화, 고객 일정 확정 대기), 방문 가능 설정 접기 확인. 운영 스크린샷 artifacts/service-clarity/production-after.png.
- 실제 휴대전화 수신 미확인. 휴대전화 브라우저 종류 질문 대기. 사용자의 실제 기기에서 구독/시험 버튼 실행 및 도착 확인 필요. 이 단계 서버 시험 발송·예약 변경 없음.

## 2026-10-23 예약 알림 화면에서 직접 켜기
- notifications 목록 최상단에 기존 기기 설정 컴포넌트를 compact 모드로 재사용. 연결 전 켜기, 연결 후 시험 알림, 끄기/다시확인/기기해제는 도움말에 배치. OFF 재활성은 본문 유지. 예약 딥링크는 설정 조회와 독립.
- notification-settings-browser: 기존 권한·OFF·계정변경 + compact 연결/시험 전환·390px 통과. DB/서버 정책 변경·실제 시험 발송 없음. 사진에서 사용자 기기 구독 연결 완료 확인, 실제 도착은 미확인.

- 직접 켜기 배포 완료: f15a3ce / Netlify6adb4fbacdd764f13178e15b, 2026-10-23 21:15:10KST ready/published. 운영 notifications.html에서 휴대전화 알림·켜기·접힌 도움말이 기존 알림4건보다 먼저 표시 확인. 실제 시험 발송 없음.

## 2026-10-23 방문상담 통합 검증 재완료
- NODE_OPTIONS=--max-old-space-size=4096, node tests/expert-visits-browser.mjs 단독 실행 통과. 격리 DB+실제 번들: 익명 탐색→위치 동의→1인 선택→요청→수락→고객 확정→출발→도착→완료. 확정 전 주소 비공개/후 공개, 4폭, 지도 상황값 유지 확인. 부가 appointment_care/알림 RPC는 이 구형 fixture에 없어 fallback 사용; 해당 신규 부가기능 전체 DB 검증으로 확대 해석하지 않음.
- 실제 결함 수정: 빈 방문 내역 패널 숨김 시 수동 새로고침까지 숨던 문제(버튼을 root에 배치), 전문가 지도 복귀 situation 보존. tests 선택자는 현행 문구 반영.
- 운영 지정 구글 계정 읽기 진단: 활성1개(21:18KST 갱신), 오늘 시험 기록 없음. 과거 BOOKING_ACCEPTED의 만료 구독 UNREGISTERED와 BOOKING_REQUESTED SENT/UNREGISTERED 병존. 사용자에게 현재 휴대전화 시험 버튼 1회 요청, 응답 대기. 실발송/표시 미확인, 임의 시험·예약 변경 없음.
