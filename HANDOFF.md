이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 '다음 할 일'부터 진행.

## 최신 상태 — 2026-10-04 출시 준비 (아래 과거 기록보다 우선)
- 사용자 “적용해” 승인 후 024/025 실제 Supabase 적용, migration 이력 기록. retention cron 매분 실행 succeeded. 기존 행 삭제/권한 우회 없이 최종 함수·유일 인덱스 확인.
- 32b05a3 원격 main 및 Netlify 6ac1a19cd477120008e9146a ready, 10/4 09:45 KST 공개. 활동지역84/운영 전문가0. 실제 고객 요청 생성하지 않음.
- 이어서 출시 스프린트 P0: 공개 config에서 기존 로그인과 신규 가입 분리, 약관 승인 전 가입/예약 차단, 결제 UI 숨김, 공개 디렉터리 더미 제거, 위치 탭 공통 저장15분+출처 유지, 휴대전화 provider와 준비중 화면, 개인정보·약관 기능 초안 작성.
- SQL026/027 운영 적용 완료: policies_approved=false,closed_beta=true,phone_enabled=false. 기존 로그인·조회 유지, 신규 가입/예약/지금가능 시작은 약관+초대+전화 인증 조건. 우회 wrapper execute revoke. 기본 초대목록 빈 상태.
- Netlify 실제 설정 완료: OPERATOR_NAME=우리곁에 보험소, PAYMENTS_ENABLED/BOOKING_PAYMENTS_ENABLED/SAVED_CARDS_ENABLED=false, PAYMENT_MODE/TOSS_MODE=test, PHONE_VERIFICATION_ENABLED=false/MODE=test, EXPERT_DOCUMENTS_ENABLED=false. 잘못된 공개키가 들어있던 SUPABASE_SERVICE_ROLE_KEY 제거. TOSS_SECRET_KEY secret 표시 및 dev빈값; scopes builds/functions/runtime. **functions-only scopes는 현 플랜에서 Forbidden: 추가 업그레이드 결제하지 않았음.**
- CLI API snake_case account_id/site_id + body가 작동. accountId/siteId는 이 설치본에서 금지 응답. 비밀값 출력 금지. fine scopes 호출은 요금제 제한. 공개키는 별도 SUPABASE_PUBLISHABLE_KEY 그대로.
- 검증: 전체 단위/DB 회귀63통과, 모바일지도320/390/844/1440 및 회원가입/Google PKCE/이메일 복귀 모의 브라우저검증 통과. 027 private 전체 RLS 추가, 기존 RPC 정상 테스트 통과. PGlite는 실제 운영 다중계정·동시 PostgreSQL 연결 검증 대체 아님. 위치 실제기기 검증 미완료; 자동테스트 모의 GPS. 실제 SMS 미설정/실제활동 전문가0/최종 약관 미승인으로 공개 출시 준비 완료 아님.
- 작업 파일: supabase/026_release_controls.sql, src/account.js/workflow.js/urgent.js/directory.js/phone-verification*.js, public/location.js/home-map.js/map.js/phone-verification.html/privacy.html/terms.html, tests/release-controls/location-store/phone-provider.
- 현재 공개 코드 18f5d78, Netlify 6ac1af011a76d50008085490 ready, 2026-10-04 10:42:41 KST. 공개 config/signup 차단/release_status/84지역/페이지200 및 기존 로그인 표시 확인. Supabase Confirm signup 메일 제목과 깨진 HTML/인증 링크 수정 저장, docs/email-confirmation.html 및 outputs 가입메일 이미지. 실제 메일 수신은 미검증.
- 구형 브라우저 테스트를 현행 5단계 전문가 가입/연락처 동의/공개 지역좌표 계약에 맞춰 갱신. 모의 테스트와 실제 운영 성공을 구분할 것. npm verify 최초 실패 후 별도 줄 push가 실행된 실수는 사용자에게 보고함. 이후 관련 테스트 수정 및 재검증.
- 추가 검증: connected-flow/expert/browser-smoke/brand/commerce 브라우저 검사 모두 개별 통과. commerce 지도 로딩 실패는 구형 find.html 외부 CDN 의존으로 확인, 기존 public/vendor Leaflet으로 교체 후 전체 commerce 통과. artifacts/verification-report.json은 최초 통합 실행 실패 기록이므로 성공 보고서로 사용하지 말 것. 실제 SMS/메일/PG 호출 없음.
- 남은 순서: 첨부 통합스프린트 나머지 P0/P1 점검. OTP 실제 공급자 연동/NotificationProvider 운영연결/실제 베타20건/실기기 GPS/최종 정책 승인은 미완료. 신규 가입 및 신규 예약은 현재 서버에서 제한. 027 운영 private 36/36 RLS 및 직접 SELECT 0 확인.
- Supabase SQL 편집기 Monaco는 fill 전에 반드시 ControlOrMeta+A. fill만 하면 기존 코드 뒤에 붙음. production user row를 테스트 목적으로 수정하지 말 것.
- 무관한 deno.lock 커밋 금지. node_modules는 외부 저장소 junction이라 변경 금지.

# 인수인계 — 2026-10-03 초간편 UX

## 사용자 최신 결정
- 고객은 날짜·시간만 고르고 보험소 관리자가 전문가 배정. 고객에게 전문가를 먼저 추천/확인시키지 않음.
- 브랜드·Google 로그인·카카오 준비중·무료 상담/가격정책 유지.
- 모든 수정 후 공개 배포 및 관리자 재배포 버튼 해결을 명시적으로 승인함.

## 구현
- 홈 6개 상황 아이콘, 공통 홈/지도/예약/내 정보 메뉴.
- 기존 coverage 등록 83개 예정 거점을 지도에 연결, 가평보험소 등 짧은 이름, 가상 전문가 샘플 제거.
- 지도 모바일 목록/카드와 PC 좌측 목록, 위치 권한 오류/대략 위치 안내, 지역 수동 대체. 지역에서 바로 시간 선택 가능.
- 단계별 날짜·시간 예약, 입력 타이핑 0, 로그인 복귀 정보 유지, 중복 클릭 요청키.
- DB 020: 관리자 배정, 전문가 수락→확정, 거절→재배정 대기, 출발/도착 이벤트. 기존 직접요청 이력 유지.
- DB 021: 결제 프로필·수단·암호화 빌링키 비공개 준비 테이블. src/booking-payment.js는 준비 컴포넌트, 실결제 미연결. 기존 무료 정책 유지. BOOKING_PAYMENTS_ENABLED/SAVED_CARDS_ENABLED=false.
- 관리자 재배포 실패 원인: 기존 SUPABASE_SERVICE_ROLE_KEY로 인증 시 401. 022 및 handler 변경으로 관리자 JWT 권한으로 기록, 서버 빌드훅/10분 중복방지 유지. 다른 기능의 잘못된 서버키는 교체하지 않았음.
- SITE_NAME=bohumso 설정 추가. 기존 잘못된 이름 bohumso 변수는 보존.

## 실제 반영과 검증
- Supabase bohumso xyexphhspykwwlhfokfl SQL Editor에서 020/021/022 적용 성공. schema_migrations에도 해당 3개 기록.
- npm build 성공. DB/서버 전체 52개 검사 중 기존 테스트 fixture 2개가 구형 contact 동의 없이 호출하여 실패; 해당 fixture를 현행 동의/권한 흐름에 맞게 수정 후 관련 4개 모두 통과.
- office-ux-browser: 390/1440 화면, 가평 예정 거점, 위치 거절, 날짜·시간 신청, 관리자 배정, 전문가 수락, 이동 상태·타임라인 통과. mock 인증과 PGlite 테스트이며 실제 고객 예약 생성은 안 함.
- 스크린샷 artifacts/ux-*.png. 최신 기능 tests/office-allocation.test.mjs, tests/admin-redeploy.test.mjs.
- GitHub DATABASE_URL secret 없음. migrate 워크플로는 없을 때 명시적 warning으로 건너뜀. 현재 SQL은 수동 적용 완료. 향후 자동화는 연결 설정 필요.

## 작업 공간과 다른 작업 보존
- 작업 저장소: C:/Users/AdMins/Documents/Codex/2026-10-03/referenced-chatgpt-conversation-this-is-an-2/work/bohumso
- 원격 https://github.com/jkw2686/bohumso, 작업 분기 codex/bohumso-oct03, 시작 원격 00bbe86.
- 기존 C:/Users/AdMins/Documents/bohumso-netlify의 af68803과 미추적 문서는 변경하지 않음. 그 로컬 main에는 아직 원격에 없는 017~019 기반 작업이 있어 그대로 배포하면 안 됨. 차후 병합 검토 필요. 강제 reset/push 금지.
- clone의 main에는 원래 로컬 af68803도 가져와 보존. 이번 분기는 실제 공개 원격 기준.
- node_modules는 기존 저장소로의 junction. node_modules 수정하지 않음.

## 2026-10-04 추가 개선과 배포
- d1ce3c3 원격 main/Netlify 공개 반영 완료. GitHub verify 전체 성공.
- 관리자 재배포 버튼 실제 요청 접수 및 새 공개 배포 성공: 6ac1175c4b6cad00089ef96b, 2026-10-03 14:55:35 UTC. 중복 실행하지 않음.
- 추가 사용자 요청: 목록 닫기 개선, 위치 재시도, 메인 하단 지도, 모바일 크기 조절.
- public/map.html/map.css/map.js: 목록 닫기/다시 열기, 큰 터치 버튼, 드래그 높이 조절, 카드 닫기, 키보드 Escape. 지도/하단 메뉴가 겹치지 않는 가변 높이 레이아웃. 위치 버튼은 상단으로 이동.
- public/home-map.js/index.html/simple-ux.css: 메인 하단 83개 예정 거점 지도, 핀/지역 연결, 지도 크게/작게, 확대/축소, 내 위치.
- public/location.js: 캐시/저전력 위치 6초→정밀 위치 20초 재시도, 콜백 없는 브라우저 감시, 권한 거절 안내. 선택한 지역은 늦은 위치 결과가 덮어쓰지 않음. 정확한 위치를 서버나 저장소에 별도 저장하지 않음.
- src/account.js: Netlify pretty URL /requests 로그인 복귀도 허용. 관리자 안내도 담당자 배정 방식으로 정리.
- npm run build 통과, tests/map-controls-browser.cjs에서 320×640/390×844/844×390/1440×900, 지도 확대/축소·닫기/복구·드래그, 위치 첫 실패→정밀 성공, 지역 선택 후 늦은 위치 무시 검증 통과.
- tests/office-ux-browser.cjs 기존 예약→관리자 배정→전문가 수락→이동 상태→타임라인 흐름 통과.

## 다음 할 일 / 알려진 제한
1. 배포 대기 - 크레딧 리셋 후. 추가 지도 개선 6048880 원격 main 푸시 및 GitHub verify 성공. Netlify 배포 6ac11ba7e03dca000854370f가 error: Skipped due to account credit usage exceeded 로 차단됨. 크레딧 충전/리셋 후 최신 main 배포 1회 및 공개 지도 UI 확인 필요. 결제/플랜 변경은 하지 않음. 현재 공개 사이트는 d1ce3c3.
2. 실제 장치 위치는 IAB에서 timeout 관측. 모의 재시도 성공은 확인했지만 실제 GPS 연결 성공으로 보고하지 않음. 브라우저·OS 위치 허용과 공급자 정상 동작이 필요함.
3. 현재 활성 전문가 0명. 승인된 전문가 등록 후 운영 배정 가능. 예정 거점 83개는 저장된 계획 자료/지역 중심좌표이며 실제 영업 중 주소가 아님.
4. 다른 기능이 사용하는 SUPABASE_SERVICE_ROLE_KEY 401은 남아 있음. 재배포는 관리자 JWT 방식으로 해결했지만 기존 결제/서버 기능 전체가 해결됐다고 말하지 않음.
5. 결제는 docs/booking-payments.md 참고. 비공개 테이블/컴포넌트 준비, 실결제·카드등록은 비활성. PG·가격·서버 승인/취소/웹훅 없이 env만 켜지 않음.
6. 이전 로컬 af68803/017~019 작업은 이번 배포에 포함하지 않음. 강제 덮어쓰기 없이 별도 병합 검토 필요.
7. 디자인 미리보기 http://127.0.0.1:8889 는 이 PC에서만 동작. API 비활성, 실제 사이트는 https://bohumso.netlify.app/.

## 2026-10-04 후속 요청 진행
- 사용자 업그레이드 완료 알림 후, 배포를 잠시 멈추고 지도 후속 변경을 먼저 하도록 지시.
- office-slot.js: 보험소 클릭 시 방문 날짜/시간 선택을 즉시 표시. 선택값을 requests에 전달하고 로그인 후 유지. 예정 거점은 희망시간 접수이며 장소/일정 확정 전임을 표시.
- 파란색 집 아이콘, 상세창 최대 380px, 메인 지도에서도 시간 선택.
- 첫 진입 위치 권한 요청. 허용 상태면 근처로 이동, 거부 후 세션 중 반복 요청 방지. 직접 지역을 연 경우 그 지역을 유지.
- 다음 순서: 이 지도 수정 공개 배포·링크 전달 완료 후 관리자 디자인 개선 시작. 관리자 글자 축소, 담당자별/보험소별 예약 지도 보기. 아직 관리자 신규 지도 작업은 시작하지 않음.

## 위치/모바일 조작 추가 보완
- 5d1e750 공개 배포 성공: 6ac129393d3ab20008e5c528, 2026-10-04 01:11 KST. 사용자가 메인 화면 배치 그대로 유지 결정.
- 이후 사용자가 위치 인식/스크롤 크기 조절 개선과 모바일 최적화 후 재배포를 우선 요청. 관리자 작업은 계속 대기.
- home-map: 휠 확대 켜기, 세밀한 확대 단계, 모바일 한 손가락은 페이지 스크롤/두 손가락 지도 확대. 넓은 시트 조절 영역, 휠 높이 조절.
- approximate-location Edge Function: Netlify 접속 지역의 대략 좌표만 반환. 국내 유효 좌표만, IP/우편번호/주소 미반환, no-store. 기기 위치 실패 시 대체 지도, 정확한 내 위치로 표시하지 않음. 대략 좌표를 예약 지역으로 자동 적용하지 않음.
- 브라우저 테스트 320/390/844/1440, 실제 터치 이벤트 pinch, 대체 위치, 지역 선택 유지 성공. Edge 응답 최소화/국외·누락 좌표 테스트 2개 통과. 빌드 성공.
- 실제 장치 GPS는 브라우저/OS 공급자 제한을 코드로 강제 해결할 수 없음. 최신 공개 배포 후 실제 네트워크 대체 지도 확인 필요.

## 관리자 지도/디자인 완료 — 2026-10-04
- 고객 위치/모바일 개선 공개 배포 58422ea 및 실제 IAB에서 접속지역 fallback 표시 확인 후에 관리자 작업 시작(사용자 지정 순서 준수).
- src/admin-booking-map.js: 기존 인증된 관리자 예약 조회 결과만 사용. 보험소별(예약지역)/담당자별 그룹, 배정 대기 그룹, 상태 필터, 지도 핀 클릭→예약 카드, 그룹 선택→목록 동기화. 별도 권한/RPC 추가 없음.
- 지도는 coverage 지역 중심으로만 연결. 정확한 방문주소/이동GPS 아님. 일치하지 않는 지역은 위치 미등록 건수와 목록으로 보존. 현재 조회 최대200건 표시.
- admin-requests.html/admin-console.css/js: 아이콘 메뉴, 간략 현황, 지도 우선, 상세 검색/광고/재배포 도구 접기. 기존 hash 링크로 도구 펼치기 지원.
- 모바일/PC 그룹 필터·핀·목록 2건 모의 데이터 검증 통과. 기존 광고/심사/권한 거절 브라우저 검증 통과. 실제 고객 예약은 만들지 않음.
- 관리자 변경 공개 배포 후 실제 로그인된 빈 예약 지도 확인, 최신 링크 전달이 남음.

## 검증 완료 — 2026-10-04 01:36 KST
- 관리자 지도/모바일 개선 c16686f 공개 배포 ready: 6ac12ef8c882a50008db2907.
- GitHub verify 37137452676 성공. 실제 로그인된 관리자 지도에서 보험소별/담당자별, 상태필터 및 예약 0건 화면 확인.
- 현재 공개 코드는 c16686f이며 위 과거 크레딧 차단 기록은 해소됨.
- 후속 사용자 긴급 지침: 메인카피, 공통 회원 인증 Gate, PLANNED 방문예약 차단, 안전한 원래 행동 복귀, 모든 단계 검증. 기존 Google/이메일 인증 유지.

## 긴급 회원 인증 Gate 수정 — 2026-10-04
- 새 지침 파일: .codex/attachments/96612506-9af9-46d7-a5c4-83541f0d1deb/붙여넣은 텍스트.txt (29항). 기존 문서보다 최신 사용자 지시 우선.
- 메인카피 확정, 첫 화면 로그인/무료 회원가입, 짧은 카드 보조문구. 메인 하단 지도/모바일 제스처 유지.
- src/member-access.js/member-entry.js: Supabase 기존 PKCE 보존, ANONYMOUS/INCOMPLETE/ACTIVE_MEMBER 공통 확인, safeNext + 2시간 session pending, Google/이메일 callback에 next 유지, 로딩 중 계정 UI 숨김.
- account.js: 미완료 회원은 가입 마무리, 약관 인라인 검증, 계정 메뉴는 완료 후 표시, 완료 즉시 원래 상황·예약으로 복귀. 기존 카카오 준비중 유지.
- PLANNED 카드: 시간 입력/예약 버튼 제거, 주변 전문가 탐색. 83개 모두 계획 거점. ACTIVE 운영 보험소는 private.office_locations에 실제로 등록된 곳만 예약 가능(현재 운영 거점 0).
- 직접 전문가 링크의 planner/method/date/time 보존. 일반 예약은 보험소 배정 유지. 실제 방문 가능/시간 등록 기능이 없으므로 전문가 방문은 요청 불가; 즉시 방문 보장 없음.
- 023_active_member_gate.sql 실제 Supabase 적용+schema_migrations 기록 완료. 사용자 인증/프로필/필수약관을 서버 확인, 익명 실행과 옛 함수 우회 차단. 실제 사전 점검 누락약관 프로필 0건. private.is_active_member installed, anonymous_can_book=false, bypass_allowed=false.
- Supabase 기존 URL 설정 3개 보존 + 같은 도메인 account.html?next=** 추가, 저장 확인. 다른 도메인 허용하지 않음.
- npm test 56개 통과; 가입/카카오 준비중/Google PKCE, 회원 Gate/복귀/모의 예약, 관리자 배정/심사/결제 회귀, 지도 320/390/844/1440 검사 성공. 별도 lint/typecheck 스크립트는 없음; esbuild 빌드 성공.
- 실제 신규 Google 인증 완료/이메일 인증메일 클릭은 아직 실행하지 않음. 로컬 공급자 응답은 모의이며 실제 성공으로 보고 금지. 현재 실제 활성 전문가 0, 운영 보험소 0으로 해당 실운영 예약은 생성하지 않음.
- 다음: 코드 배포 후 실제 홈/로그인된 회원 복귀/개설 예정 차단 확인, Production URL과 남은 실계정 검증 범위 보고.

## 긴급 수정 공개 확인
- 1e64539 / Netlify 6ac18a393a83170008b2833e, 2026-10-04 08:05 KST ready. GitHub verify 37160622188 성공.
- 실제 비회원 홈→사망 상황→인증→기존회원 Google 로그인→account callback(next 유지)→사망 지도 자동복귀 성공. 기존 사용자 세션 복구됨. 신규 이메일 인증은 직접 확인이 남음.
- 실제 예정 가평보험소 예약 불가 확인. 운영 보험소/전문가 실제 예약은 실운영 대상이 없어 생성하지 않음.
- 배포에서 HTML 링크가 /login.html 대신 /login으로 변환돼 로그인/가입 상호 링크에 next가 붙지 않는 문제 발견. sessionStorage 복귀는 작동했으나 새 탭까지 고려해 확장자 없는 링크도 지원하도록 보완. 해당 배포 변환을 모의한 브라우저 전체 Gate 검사 통과 후 후속 배포.
- 후속 보완 배포 0cfee50 확인: Netlify 6ac18c7c82be5d00080cbf73, 2026-10-04 08:15 KST ready. 실제 홈 최신 카피 재확인. 신규 이메일 인증메일 클릭만 사용자 직접 점검이 남음.

## 2026-10-04 회원 영역·지도 상세 카드 보완
- 메인 본문에 무료 회원가입 안내 추가. 로그인 완료 회원은 가입 완료·내 정보, 미완료 회원은 가입 마무리로 전환.
- 지도 선택 시 목록 자동 숨김, 배경 덮개 제거, 상세 카드 최대 340px 너비/지도 높이 45%, 내부 스크롤. 닫으면 지도만 남고 목록 재열기 제공. 선택 마커를 카드 위로 이동.
- 기존 회원 인증 및 예정 거점 방문예약 제한 유지. 빌드·회원 흐름·320/390/844/1440 지도 검증 후 Git 기반 배포.

## 2026-10-04 활동지역·긴급 매칭
- 사용자 첨부 299792c0 지침 구현. docs/urgent-service.md에 구조·보유기간·검증·운영 조건 상세 기록.
- src/urgent.js + public/urgent.html/css: 전문가 활동지역 3단계/변경, 임시 GPS 별도 동의·30/60분/18시 ON/OFF, 고객 3단계 긴급 요청, 전문가 수락/패스, 명시 출발·타임라인. PRO/프로필/홈/지도 연결.
- 024_urgent_service.sql: 새 private 테이블/RPC, 주지역만 집계, 권한/1명 수락 잠금/유일 인덱스, 기존 catalog 정확좌표 제거 및 권역 중심 별도 필드, live/background 위치공유 false. 025_urgent_retention.sql 매분 만료·파기.
- 실제 서버 preflight: private.expert_applications 없음, is_active_member 있음, urgent_requests 없음, pg_cron 제공 가능. 024는 011 유무 모두 호환하도록 수정, 두 모드 테스트 통과. 011 자체를 추가 적용하지 않음.
- npm test 60개 성공, 긴급 A-F DB·320/390/1440 UI 통과. 마지막 UI 카드 중첩 제거 후 재빌드/긴급 브라우저 재검증 완료. 지도 회귀 검사도 통과.
- 서버 SQL 입력 후 자동 승인 검토가 Run query를 거절함: 운영 스키마·권한 변경에 구체적 사용자 사전 승인 필요. request_user_input_async 승인 질문 제출 상태. **024/025 아직 실제 적용 안 됨. 공개 배포도 보류. 우회 실행 금지.** 사용자 승인 도착 후 Supabase SQL 탭16 경고 확인→024 실행결과 확인→025/이력 기록→cron 동작 확인→main 배포. DATABASE_URL 없음.
- 실서비스 전문가 0명 상태로 실제 요청 생성/승인 우회하지 말 것. SMS 공급자·실제 전화 인증과 운영 개인정보/위치 검토는 OWNER_ACTION_REQUIRED. 구현 테스트는 가상 계정/가상 GPS만.

## 다음 작업 — 사용자 순서 지정
- 현재 활동지역·긴급매칭의 서버 적용/배포를 마친 뒤에만 출시 준비 통합 스프린트 시작.
- 전체 지침: C:/Users/AdMins/.codex/attachments/e5f0bcba-1d15-4e40-bcec-fbecbf1f69c0/붙여넣은 텍스트.txt.
- 다음은 PHASE 0 감사 → P0 보안/Secret·결제 OFF·정책·Auth/이메일·OTP·위치·예약/RLS → P1 → P2. Google 보존, Kakao 준비중, 결제 OFF, RLS 비활성/운영자료 삭제/유료계약/임의 SMS 금지. 각 Phase 표 보고, NEXT ACTION 하나. 아직 새 스프린트 실행하지 않음.
- 새 첨부의 계속 진행 지시는 앞서 거절된 운영 DB Run query에 대한 구체적 승인 응답으로 간주하지 않았음. 기존 승인 질문 답변 대기.
- Supabase 편집기 입력은 파일 최종 변경보다 오래된 버전일 수 있음. 승인 후 반드시 024 파일을 다시 읽어 입력하고 실행. 025/024 이력은 private.schema_migrations(name)에 기록.
