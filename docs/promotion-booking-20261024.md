# 무료 초대혜택·예약 신청 정리 / 고객 최종확인

## 최종 사용자 지침
- 브랜드 우리보험소. 기존 홈의 색상·글자·버튼을 유지한다.
- 최신 요청이 기존 '같은 시간 수락 즉시 확정'을 대체한다. 요청 → 전문가 확인/시간 제안 → 고객 최종확인 → 확정. 기존 확정 건을 다시 열지 않는다.
- 관리자는 무료기간·인원·마감일만 입력하여 링크를 만들고 복사한다. 가입자가 보는 링크 안내와 관리자 운영 화면을 분리한다.

## 구현
- `src/office-request.js`, `public/service-clarity.css`, `public/requests.html`: 날짜/시간/확인 세 단계 유지, 중복 제목·대상·선택 설명 축소, 신청 시 연락처 선동의를 제거하고 최종 확인에서 기존 동의 처리. 희망 상담 시간 / 상담 요청하기 / '희망하시는 시간을 알려주세요. 전문가와 일정을 조율한 뒤 예약이 확정됩니다.' 적용. 저장 실패 복구·동일 요청 키·선택 대상·가능시간 API 유지.
- `src/workflow.js`, `src/booking-overview.js`, `src/consultation-ui.js`: 상담 요청 중 / 일정 조율 중 / 예약 확정. 미해결 시간 제안이 있으면 이전 시간의 확정 폼을 숨김. 세부 연락처 안내 접기. 수락·시간 제안·고객 최종확인·전화번호 공개의 기존 권한과 동의 처리 재사용.
- `supabase/077_customer_final_confirmation.sql`: 074의 자동확정 구간만 우회하고 이전 전체 예약 명령 체인을 재사용. 고객 확정 시 미해결 제안 차단. 새 알림 문구만 갱신하고 기존 알림·예약·연락처·이력은 수정/삭제하지 않음. optional appointment_care 존재/미존재 모두 테스트.
- `src/promotion.js`, `public/promotion.html`, `public/admin-promotions.html`, `public/recruitment-regions.html`, `public/promotion.css`: 초대 안내/자동 적용, 관리자 3개 입력/복사/중지/별도 명단, 지역 집계. 새 링크 생성 성공 후 주 버튼은 복사 하나.
- `src/member-access.js`, `src/public-signup.js`: 허용된 복귀 경로에 초대 페이지 추가. 전문가/일반회원·직군 선택이나 인증 복귀에서 초대 주소를 덮어쓰지 않음. 외부 리다이렉트 허용 안 함.
- `src/account.js`, `src/expert-home.js`: 관리자 확인 후에만 초대 운영 링크 제공. 내 계정/구독·무료혜택에 실제 서버의 무료 종료일 표시. 계정 변경 전후 ID 대조 후만 부가 혜택 표시.
- `scripts/build.mjs`, `.gitignore`: promotion 진입 번들 추가. 생성 번들은 커밋 제외, Git CD 빌드에서 생성.

## DB / 불변 조건
- `supabase/076_promotion_invites.sql`: 비공개 초대/적용 원장/현재 혜택/지역 임계치 원장 4개. RLS ON, anon/authenticated 원본 SELECT 차단. 공개 RPC는 전달된 불투명 토큰의 조건만 반환. 관리 RPC는 서버 관리자 확인, 혜택은 가입 완료한 자기 계정만.
- 사용자별 트랜잭션 advisory lock + 초대 행 FOR UPDATE + (프로모션, 회원) PK. 사용 인원은 성공 원장에서 집계. 실패는 트랜잭션 롤백, 중복은 동일 종료일 반환.
- 현재 유효한 무료기간이 있으면 새 혜택은 적용하지 않음. 활성 유료 구독/승인·환불 확인 중 거래도 변경하지 않고 새 무료혜택 차단. 만료 혜택은 새로운 성공 건으로 갱신 가능하나 이전 원장 보존. 종료 후 자동 결제 없음.
- 자격 승인/지도 노출/상담·방문 ON/OFF/요금·결제 스위치 변경 없음.
- 승인·자격 확인된 청구 도움 설계사의 실제 활동지역을 회원당 구별 1명 집계. 판교/분당 별칭 통합. 지도 표시·방문 OFF 무관. 세무사·일반회원·클릭·소식 신청 제외. 탈퇴/활동 정지 계정 제외.
- 10명 도달 원장 지역 PK로 한 번만 기록. 관리자 화면 새 소식과 별도 현황에서 확인 처리. 재도달에도 다시 생성하지 않음. 실제 오픈/광고 집행은 자동화하지 않으며 '오픈 준비' 표시.

## 검수
- `tests/promotion.test.mjs`: 재적용, 인원 소진, 미가입/일반회원 관리자 거부, 유효 무료/유료 보존, 실패 시 사용 수 불변, 중지/마감 후 기존 혜택 유지, 원본 테이블 접근 거부, 1명/N명/무제한 구조, 동일 회원 동시 호출 및 다른 회원 병렬 요청의 1석 경쟁, 별칭/중복/토글/탈퇴 집계, 10명 도달 1회/확인 기록.
- 동시 요청 검사는 PGlite의 격리 트랜잭션 큐를 이용한다. 실제 다중 PostgreSQL 연결 부하 시험과 같다고 주장하지 않는다. 서버 잠금/고유키는 실제 PostgreSQL에도 적용되는 SQL이다.
- `tests/promotion-integration.test.mjs`: 기존 직군·예약 스키마에 076/077 적용, 무료혜택 → 선택한 전문가 요청 → 수락 후 미확정 → 고객 최종확정 → 동일 일시, 관리자 원장 종료일 대조, 다른 계정 처리 거부.
- `tests/customer-final-confirmation.test.mjs`: 같은 시간도 수락만으로 미확정, 확정 전 연락처 없음/확정 후 담당자만, 다른 시간 제안 앱 내 수락/최종확정, 제안 미해결 시 이전 시간 확정 차단, 기존 확정 건 보존, 부가 약속 테이블 유/무, 운영 알림 함수 원문에 077 적용 검수.
- `tests/booking-selection-browser.mjs`: 360/390/430/768/1440, 짧은 가로 화면, 200% 글씨, 선택·뒤로·다른 날짜·서버 슬롯/실패·재조회·단일 제출, 보험소 예약 입구, 예전 자동확정 capability를 주어도 새 UI 선확정 불가.
- `tests/booking-overview-browser.mjs`: 5폭·현재/지난 예약·한 건 상세·새 상태·권한별 행동·새로고침 무변경·25건 더보기·오류/0건·200%·후기.
- `tests/promotion-browser.mjs`: 신규 필수동의 가입 완료/기존 회원 복귀 → 자동 적용, 직군 변경에도 토큰 유지, 4폭 조건/혜택/관리자 폼, 마감/소진, 일반회원 관리 접근 차단, 명단 상세, 도달 소식 확인.
- `tests/signup-routing-browser.mjs`: 기존 가입 역할·복귀·동의·관리자 접근·실패 복구 회귀.
- `tests/map-simple-browser.mjs`: 360/390/430 × 전문가1/10/100 × 별도/동일 좌표, 묶음/필터 일치·최대 확대·짧은 카드/전체 프로필/뒤로·전화/상담 링크·보험소 날짜/가능시간 유지.
- `npm run build`, 문법/`git diff --check` 통과. 전체 역사적 migration 전용 테스트를 최신 운영 정책으로 일괄 바꾸지는 않음.

## 화면 증거 (로컬, 개인정보 없는 격리 자료)
- 수정 전: `artifacts/booking-selection/before-review-390.png`
- 수정 후: `artifacts/booking-selection/review-390.png`
- 초대/관리자: `artifacts/promotion/invite-390.png`, `admin-390.png`, `applied-390.png`
- 예약 목록: `artifacts/booking-overview/list-390.png`
- 운영 DB: `artifacts/promotion/production-db-verification.png`

## 운영 확인 / 한계
- 기존 Supabase YES, ref `xyexphhspykwwlhfokfl`, PRODUCTION. 기존 SQL UI를 이용했으며 비밀키 재요청/출력 없음. 별도 staging은 미발견(`STAGING_SUPABASE_NOT_FOUND`), 격리 PGlite/브라우저 검수.
- 076/077을 한 트랜잭션으로 적용하고 private.schema_migrations 원장 기록. 사후 조회: migration_count=2, rls_tables=4, 원본 SELECT 차단/익명 관리 RPC 차단/공유 토큰 조건 조회/미래 알림 문구 변경 모두 true. sameTimeConfirmationEnabled=false, customerFinalConfirmationRequired=true. 신규 운영 초대링크0건.
- 실제 회원 가입/혜택 적용/예약 수락·취소/시험 알림·결제 실행 없음. 실제 휴대전화 신규 왕복·푸시 도착은 이번에 재검증하지 않음.
- 배포 결과와 운영 페이지 확인은 완료 후 아래에 기록한다.
