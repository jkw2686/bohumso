# 직군별 가입 연결 — 개발 검수

2026-10-12 · codex/profession-registration. 사용자 승인 후 066 운영 DB 적용 완료, 공개 배포 진행 중. 아래 초기 개발 검수 기록과 마지막 운영 적용 기록을 구분한다.
기준 코드 23b885b, 기존 별도 전체 메뉴와 회색·흰색·파란색 토큰을 유지했다.

## 범위와 구현

| 직군 | 가입·자료 | 공개·요청 연결 | 운영 반영 |
|---|---|---|---|
| 보험설계사 | 기존 확인 절차, 공통 약관과 두 가지 보험 가입 권유 제한 필수 동의 | 기존 개인 프로필·지도·예약·사진·상담 설정 재사용 | 미적용 |
| 세무사 | 등록번호·사무소·등록 확인자료·사무소 확인자료, 공통/직군 약관 | 세무사 이름·아이콘, 선택 상담 분야·소개·사진, 상담료 안내 및 기존 직접 선택 요청 | 미적용 |
| 보험소 운영자 | 거점명·주소·운영 연락처·공간/운영권한 자료 | 기존 office_locations 및 방문예약, 같은 계정의 개인 전문가와 별도 심사 | 미적용 |
| 손해사정사·변호사 | 정의만 보관, 신규 접수 차단 | 이번에 공개·예약 개방하지 않음, 기존 계정 재분류 안 함 | 미적용 |

- 공개 회원가입의 전문가 선택과 별도 partner 경로 모두 직군을 유지한다. Google·휴대전화 진입의 next에도 직군을 전달한다.
- shared/professions.json이 화면·서버·SQL 서류 정의의 기준이다. scripts/profession-catalog.mjs --check로 SQL 정의와 일치 여부를 검사한다.
- 추가 선택 항목이 비어도 저장 가능. 기존 경력·회원·예약 데이터 삭제 없음.
- 사진 크롭/압축/썸네일·캐시 처리와 선택 프로필 편집기를 재사용한다. 세무사에게 생명/손해 선택과 보험 가입 권유 서약을 요구하지 않는다.
- 지도 필터와 개인 프로필에 직군명을 표시한다. 보험소 거점/보험설계사/세무사는 아이콘·이름으로 구별한다. 외부 지도 타일은 격리 화면에서 차단했다.
- 예약 신규 생성은 09:00~18:00, 60분, 마지막 시작 17:00. 열어 둔 요일·시간만 제공. 기존 18:00/30분 예약은 변경 없이 확인 절차를 진행할 수 있음을 검사했다.
- 지금 방문의 기존 위치 동의·만료·시간 범위는 유지한다. 시간표 예약과 별도인 즉시 방문 정책을 임의 확대하지 않았다.
- 세무사가 입력한 상담료 안내를 요청 시 서버가 비교하고 예약에 저장한다. 나중에 프로필 비용을 바꿔도 이미 요청한 비용 안내는 유지한다. 플랫폼 요금이나 결제 로직 변경 없음.

## 주요 파일

- 가입: src/public-signup.js, src/profession-onboarding.js, src/partner-onboarding.js, shared/professions.json
- 자료/심사: src/early-documents.js, src/early-expert-admin.js, netlify/functions/expert-documents.mts
- 기존 기능 연결: src/account.js, src/menu.js, src/profile-editor.js, src/optional-profile.js
- 공개 탐색: public/map.html, public/map.css, public/map.js, public/home-map.js, public/expert-profile-card.js, src/directory.js
- 예약: src/office-request.js, src/workflow.js, src/expert-visits.js, public/office-slot.js
- 약관 초안: public/expert-terms.html. 이전 약관은 public/policy-archive/expert-terms-2026-10-09.html에 그대로 보존.
- DB/원복: supabase/066_profession_registration.sql, supabase/rollback_profession_registration.sql

## DB 변경안

| 항목 | 변경 |
|---|---|
| 신규 비공개 테이블 | profession_definitions, office_operator_applications, profession_documents, profession_release_backup, profession_release_snapshot |
| expert_profiles 추가 컬럼 | profession, organization, registration_reference, office_address, fee_mode, fee_basis |
| 동의/예약 추가 컬럼 | consent_records.profession, consultations.fee_notice, urgent_requests.fee_notice |
| 기존 값 일괄 변경 | 없음. office_locations.last_start_hour의 신규 행 기본값만 17로 변경 |
| 컬럼 삭제·타입 변경·TRUNCATE | 없음 |
| 제약조건 | specialties 선택 입력 0~3개, 세무 방문 목적 other 추가. 기존 데이터 허용 범위를 넓힘 |
| 기존 데이터 삭제 | Migration 실행 자체의 회원/예약/자료 일괄 삭제 없음. 자료 삭제 RPC의 명시적 본인/관리자 요청 시 DELETE는 유지 |
| 접근 권한 | 새 테이블 RLS 활성 및 anon/authenticated 직접 접근 금지. 인증 RPC와 서버 service_role 자료 처리 경로만 허용 |
| Storage | 기존 expert-documents 비공개 저장소 재사용. 공개 bucket·직접 접근 정책 추가 없음 |
| 적용 | 단일 Transaction, 사전 함수 정의/스키마 컬럼/회원 1건/건수/기본값 스냅샷. 같은 파일 두 번 실행 검증 |
| 원복 | 백업 함수와 거점 기본값 복구, 새 거점 신규 접수 중지. 추가된 데이터·컬럼 보존. 기존 프런트엔드와 함께 원복 |

원복은 데이터 삭제 없는 기능 복귀다. 새 직군으로 생긴 신청·예약은 보존되므로 운영자가 기존 요청을 이어서 관리해야 한다. 재적용해도 거점을 임의 재공개하지 않으며 재심사로 연다.

## 검사 근거

- 빌드 통과: node scripts/build.mjs. 패키지 추가 없음, 배포 실행 없음.
- SQL 통합: node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 --test tests/profession-registration.test.mjs
- 자료/사진 API: node --test tests/expert-documents-api.test.mjs tests/profile-photo-api.test.mjs
- 실제 페이지+격리 DB: node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 tests/profession-browser.mjs
- 실제 페이지+모의 응답: node tests/profession-browser.mjs --ui-only

| 시나리오 | 결과/범위 |
|---|---|
| 직군 저장·새로고침, 직군 변경 시 기존 승인 승계 차단 | 격리 DB 통과 |
| 세무사 휴대전화만으로 인증한 회원의 자료 등록 | 격리 DB 통과 |
| 승인 전 비공개·예약 거부, 두 자료 심사 후 공개 | 격리 DB 통과 |
| 타인 자료 읽기·삭제, 일반 계정 심사 RPC·테이블 직접 조회 | 거부 확인 |
| 세무사 사진 메타정보 저장/삭제, 선택 소개, 41자 거부 | 격리 DB 통과; 바이너리는 기존 API 모의 검사 |
| 세무사 상담 ON/OFF 저장, 세무 분야 표시/유지 | 격리 DB 통과 |
| 비용 확인 누락 거부, 비용 스냅샷, 17시/60분, 18시·30분 시작 거부 | 격리 DB 통과 |
| 중복 요청·동일 시간 경쟁 예약 차단 | 격리 DB 통과 |
| 개인 전문가+거점 같은 계정, 거점 정지 후 개인 상태 유지 | 격리 DB 통과 |
| 신규 동의 직군/버전 기록, 기존 회원/예약 보존 | 격리 DB 통과 |
| 반복 Migration·원복·재적용 | 격리 DB 통과 |
| 360·390·430·1440px 가입 화면, 지도 필터·접힌 버튼 가림 | 모의 화면 통과 |
| 실패 시 입력 보존·연속 클릭·저장 재시도·새로고침 | 실제 페이지+격리 DB 통과 |
| Google·휴대전화 가입 진입 시 직군 유지 | 모의 화면 통과 (외부 인증/발송 차단) |
| 실제 휴대전화 키보드·OS 글자 확대·운영 OAuth/SMS·운영 Storage 업로드 | 미확인. 운영 사용자/외부 발송을 사용하지 않음 |

발견한 오류: SQL 문자열 종료 표기, 원복 시 함수 기본값 불일치, 활동지역 select 접근성 이름, 직군 필터로 커진 접힌 지도 패널, 세무사 상담 분야의 코드 그대로 표시. 수정 후 관련 검사를 다시 수행했다.

## 운영 전 남은 확인/결정

1. 066 적용과 새 프런트엔드 배포는 이번 작업에서 실행하지 않았다. 운영 적용 직전 실제 스키마/함수 및 DB 사용량을 읽기 비교하고 새 접근 권한·직군별 약관 초안의 승인이 필요하다.
2. 기존 보관기간 문구(심사 완료 후 원본 30일, 활동 종료 후 기록 1년)는 이번에 임의 변경하지 않았다. 원본 자동 파기 작업의 실제 운영 연결은 확인하지 못했다. 운영자가 기간별 삭제를 수행할 절차와 기존 기능 연결을 확인해야 한다.
3. 세무사 등록 및 현재 사무소를 사람이 확인하는 단계다. 공식 사이트의 자동 자격 검증 API를 연결한 것으로 표시하지 않았다.
4. 거점 좌표는 관리자가 실제 주소를 확인해 입력해야 한다. 임의 좌표 생성 없음. 거점 전용 운영 대시보드/상태 스위치가 기준 코드에 없으므로 새로 가장하지 않았다. 개인 상담 설정과 거점 승인/상태는 별개다.
5. 새 세무/거점 신청의 자기 심사는 차단한다. 현재 대표 한 명만 관리자이면 본인 신규 세무/거점 심사를 담당할 권한 있는 다른 심사자 또는 별도 운영 결정을 준비해야 한다. 기존 설계사 대표 예외는 수정하지 않았다.
6. 별도 작업본의 062~065 및 진행 중 변경은 병합하지 않았다. 공통 account/workflow/menu/profile-editor 및 SQL 함수 연결은 후속 병합 시 충돌 확인 필요.

## 공식 근거 확인 (2026-10-12)

- [국가법령정보센터 세무사법 제6조](https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1030818585), 시행 2026-06-24: 업무 개시 전 등록과 성명·사무소 정보, 등록사항 변경 신고 규정을 확인. 등록/사무소 확인을 분리한 근거다.
- [세무사법 제20조](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1030818799): 등록자에 대한 명칭 사용 제한을 확인. 자격시험 합격만으로 승인하지 않는다.
- [한국세무사회 공식 메뉴](https://www.kacpta.or.kr/sitemap/sitemap/sitemap.htm): 세무사 찾기와 등록·입회 안내 경로 확인. 실제 신청자의 진위 확인을 대신하지 않는다.

위 자료는 가입 심사 설계의 근거이며 플랫폼 유료 노출 구조의 적법성 판단이 아니다. 실제 계약·요금·광고 방식에 대한 법률 검토는 미완료다. 직군별 플랫폼 가격·무료기간·VAT·환불·결제는 변경하지 않았다.

## 화면 근거

[세무사 입력 390px](profession-registration-screens/tax-info-390.png) · [보험소 운영자 입력 390px](profession-registration-screens/office-info-390.png) · [지도 직군 선택 390px](profession-registration-screens/map-tax-390.png) · [PC 입력](profession-registration-screens/tax-info-1440.png)

사진은 격리 검수 데이터이며 운영 가입자가 아니다. 실제 지도 배경 요청은 차단한 캡처다.

## 2026-10-12 운영 적용

- 사용자 직접 승인: “066 DB 적용 후 배포 승인”.
- Supabase xyexphhspykwwlhfokfl: 변경 전 비공개 백업(대상 함수26개, 전체 함수128개·컬럼569개·제약·권한·기존 회원1건), 이후 066 전체 BEGIN/COMMIT 실행.
- 기존 회원3건·전문가 프로필2건·예약0건의 내용 지문 일치, 동의8건 유지. 기존 컬럼 삭제/타입 변경0, 기존 정책 동일. 새 비공개5테이블 RLS/직접 권한 차단, expert-documents 비공개 및 service_role 자료 경로 확인.
- 운영 함수와 격리 기준 사이 차이를 확인했다. 예약/확인연락처 등 운영 함수24개를 격리 DB에 재현한 추가 통합 검사 통과. 대표자 전용2개 함수는 실계정 데이터를 재현하지 않고 기존 함수 위임과 원문 보존을 확인했다.
- `PROFESSION_BASELINE_FUNCTIONS=artifacts/profession-production/functions-before.json`으로 추가 격리 검사 재실행 가능. 백업은 Git 비포함 artifacts 및 private.profession_release_backup / private.profession_release_snapshot에 보관.
- 원복 SQL은 supabase/rollback_profession_registration.sql. 실제 회원 가입·SMS·파일 업로드·실예약은 운영에서 시험하지 않았다.
- 공개 배포 결과와 실제 화면 검증은 이어서 기록한다.
