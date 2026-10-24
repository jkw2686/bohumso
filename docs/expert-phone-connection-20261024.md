# 전문가 전화 상담 연결 — 2026-10-24

## 구현
- 최신 사용자 지침으로 새 전문가 상담을 날짜 없는 연결로 전환. 기존 077 고객 최종확인 규칙은 보험소 방문예약과 과거 예약에 유지.
- src/expert-connection.js: 선택한 전문가·지역, 필수 직접 체크 동의, 상담 요청하기, 성공 후 내 요청 보기. 연락처 자체를 URL/sessionStorage로 저장하지 않음. 재시도 request_key 유지.
- src/office-request.js: 전문가만 새 흐름 분기. 실제 office는 기존 wizard 재사용.
- src/workflow.js, booking-overview.js, expert-home.js: connection_only 상태·전화 버튼·수락/거절. 새 연결은 시간 제안·확정·완료 없음. legacy 분기 보존.
- public/service-clarity.css: 신청 화면 한 작업만, 동의 터치 영역, 모바일 4폭, 기존 토큰.
- public/privacy.html, terms.html, expert-terms.html: 전문가 수락 후 제공과 방문예약 확정 후 제공을 구분. 요금/자격/기존 동의 기록 변경 없음.
- supabase/078_expert_phone_connection.sql: 새 mode만 preferred_at=null. DB check로 방문예약 날짜 및 과거 기록 보호. 요청자별 직렬화·key replay·동일 전문가 진행요청 중복 차단. 직접 동의 없으면 거부. 승인·공개 카탈로그/활동/회원/기존 release gate 유지.
- 새 요청 연락처는 private consent snapshot에만 보관. 수락 후 contacts로 옮기고 snapshot 전화는 비움. 수락한 담당자만 workspace에 전화 반환, 다른 전문가/관리자/소비자 응답에서 제외. 조회 이력 기록. 취소·거절 후 번호 공개 중단. 기존 데이터 일괄 변경 없음.
- 알림 수신자·기기구독·발송 대기열은 기존 그대로. 신규 mode의 REQUESTED/ACCEPTED/REJECTED/CANCELLED 문구만 변경. 동일 수락 재시도는 revision/event/알림 추가 안 함.
- 선택적 appointment_care 설치 환경에서도 새 연결에 제안/확정/완료 우회 불가.

## 검수
- tests/expert-phone-connection.test.mjs 2개 통과: 무시간/미동의 거부/담당자 격리/익명 원본조회 차단/수락 재시도/실제 DB 알림 2인×요청·수락 각1/번호 조회로그/취소·거절/과거 expert 예약/보험소 요청→배정→수락→고객확정/optional care 우회 차단.
- tests/customer-final-confirmation.test.mjs 2개 통과: 기존 예약 및 보험소에서 077 유지.
- tests/expert-phone-connection-browser.mjs: 360/390/430/1440, 소비자 요청→전문가 수락→전화 tel 링크→소비자 상태 일치, 실패 후 입력/동의 유지, 더블클릭 중복 방지, 200% 글씨 통과.
- tests/booking-selection-browser.mjs: 보험소 6 viewport, 시간 선택·변경·가용시간·오류·단일 저장·내역 복귀·200% 통과. 이제 날짜 wizard 검수 대상은 office fixture임.
- tests/booking-overview-browser.mjs: 기존 목록·단일 상세·역할·오류/0건·더보기·200% 통과.
- tests/map-simple-browser.mjs: 3폭×1/10/100명×동일/다른 좌표, 클러스터/프로필/복귀, 보험소 시간선택 유지 통과.
- npm run build 성공, JS syntax/diff 검사.
- 병렬 PGlite 실행은 호스트 메모리 부족으로 실패한 뒤 --test-concurrency=1 순차 재실행 통과. 최초 sandbox Edge 실행 실패는 승인된 격리 브라우저로 재실행.

## 제한
- STAGING_SUPABASE_NOT_FOUND: 격리 PGlite/브라우저 fixture 사용. 운영 실회원 신규 요청/수락/취소/시험푸시/전화/결제 실행 안 함.
- 실제 휴대전화 통화 앱 실행 및 새 문구의 실제 푸시 수신은 미실행. tel: 연결과 DB 알림 문구/중복 방지 검증과 구분.
- 실제 다중 서버 PostgreSQL 부하 검사는 미실행. DB 행/transaction advisory lock으로 직렬화.
- 기존 미커밋 public/help 6개 줄바꿈 및 outputs/signup-entry-20261018는 제외/보존.

## 운영
- 기존 Supabase xyexphhspykwwlhfokfl PRODUCTION 재사용. 사전 함수/원장/알림 존재, beta_member/appointment_care 미설치 확인.
- DB/배포 실제 결과는 아래에 기록.

## 운영 완료 — 2026-10-24 15:41 KST
- 코드 fb60da5cf7dd2f71041136a4b78d7f62b7687e40, Netlify 6adc53026bcfbe055ccb839f ready, published 2026-10-24T06:41:21.621Z, commit 일치.
- 078 적용 및 private.schema_migrations 기록 성공. 사후 migration_applied/mode_constraint/consent_rls/raw_phone_denied/anonymous_command_denied/legacy_wrapper_denied/notification_copy=true, new_consents=0. 운영 신규 상담/동의/알림 시험 생성 없음.
- assets/account.js 및 service-clarity.css HTTP200, 줄바꿈/chunk명 정규화 후 로컬 빌드와 일치. 운영 JS sha256 38412b84a8439af1bf41616289cddab7342e765beb2e68936dfc90cf471404c3.
- 실제 로그인된 운영 /requests.html?planner=... 화면에서 대표 보험소장·지역, 날짜 입력 없음, 직접 체크 미선택, 상담 요청하기 비활성, 정확한 안내 확인. 제출하지 않음.
- artifacts/expert-connection/request-production.png 및 production-db-verification.png (로컬 ignored). 모바일 request-390.png/accepted-390.png는 격리 화면.
- 링크 https://bohumso.netlify.app/map?view=experts / https://bohumso.netlify.app/requests / https://bohumso.netlify.app/partner-work.html
- 구현·DB·배포·운영 화면 확인 완료. 실휴대전화 통화/신규 푸시 도착 및 다중 DB 연결 부하만 미검증. 다음은 새 사용자 요청 기준. 운영 추가 데이터 조작 불필요.
