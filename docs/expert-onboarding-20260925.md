# 전문가 가입 개선 작업 기록 — 2026-09-25

## 완료한 구현
- 우리곁에 보험소 / 보험도, 보건소처럼. 기존 디자인 토큰과 카드·버튼을 재사용.
- 4단계 가입: 직군 3종 → 본인 정보(두 묶음) → 서류 → 서약. 진행 표시, 큰 입력, 하단 전폭 다음 버튼, 필수 항목 검증.
- 직군별 신분증·자격 서류와 등록번호. 카메라/파일 선택, 이미지 압축·메타데이터 제거, 업로드 미리보기, 개별 열람·삭제. 원본 10MB, 전송 4MB 안내. 교체는 기존 파일 삭제 후 첨부.
- 서약 3항목 및 전체 동의, 서버 버전·시간 기록. 인증/서류/동의 누락은 서버에서도 거부.
- 관리자 신청 목록·상세, 서류 열람·삭제, 등록번호와 확인 체크, 승인/보완/거절, 경고→기간 정지→제명, 사유·담당자·시각 이력, 기존 상담 신고 연결. 자기 신청 승인 불가. 이전 신청 기록은 보존·읽기 전용.
- 승인된 프로필의 서약 뱃지 및 설명 팝업. 경고 시 뱃지 회수, 정지/제명 시 노출 제외. 거리→평점→전문분야 정렬에 서류·서약을 사용하지 않음. 이는 기능 구현 설명이며 특허 또는 법률 검토 완료를 의미하지 않음.
- 새로 확인되는 설계사 프로필은 기본 샘플. 손해사정사·변호사는 테스트 카드/서약 표시만 연결했고 기존 설계사 상담 엔진을 억지로 재사용하지 않음(상담 연결 버튼 비활성).

## 보안·동시 처리
- private 스키마 직접 접근 불가. 문서 경로는 신청자/관리자 RPC 응답에서도 숨김.
- 비공개 Storage bucket + restrictive policy. 기존 광범위 정책이 있어도 일반 사용자 직접 접근 차단.
- 서버가 로그인 사용자와 관리자 권한을 검증한 뒤 문서 다운로드를 중계. 공개 URL/영구 링크 없음, no-store, nosniff, attachment, sandbox.
- 신청/심사/서류 변경 시 사용자 잠금 및 revision 확인. 삭제 예약 중인 서류로 승인 불가. 실패한 삭제는 메타데이터를 남겨 재시도 가능.
- 서류 교체는 삭제 후 첨부하여 과거 파일이 고아 객체로 남는 경우를 방지.
- 무료 입력 등록번호는 범용 문자 형식과 주민번호 유사 패턴만 검사. 직군별 등록 진위는 관리자 확인 필요.

## 로컬 미리보기
`node scripts/expert-preview.mjs` → http://127.0.0.1:3192/
관리자: http://127.0.0.1:3192/?view=admin
서약: http://127.0.0.1:3192/?view=badge
브라우저 메모리의 가상 데이터이며 새로고침하면 초기화. 문자 발송·외부 저장·실승인 없음. 가상 인증번호 123456. 실서류를 사용하지 말 것.

## 적용하지 않은 외부 설정
이번 작업에서는 공개 배포, 원격 DB 변경, 실제 가입·서류 수집·문자 발송을 하지 않았음.
- 검토 후 별도 환경에 기존 마이그레이션 순서대로 적용한 다음 `011_expert_onboarding.sql`, `expert_storage_setup.sql` 적용 필요.
- `EXPERT_DOCUMENTS_ENABLED=false`가 기본값. SUPABASE_URL / 서버 전용 SUPABASE_SERVICE_ROLE_KEY / APP_ORIGIN 및 비공개 bucket 확인 후에만 활성화.
- Supabase SMS 공급자 연결 필요. 구현된 문자 인증은 휴대폰 소유 확인이며 법적 실명 본인확인 서비스가 아님. 실패 시 미인증 상태 유지.
- 보유기간·삭제 책임자·확정 동의문 및 개인정보 운영 검토는 아직 미완료. 파일 삭제는 감사 이력·계정 전체 삭제와 다름.
- PDF 악성코드 검사/정화, 신분증 자동 가림, 기관 등록 API 자동 대조는 구현하지 않았음. 실서류 운영 준비 완료로 해석하면 안 됨.
- 기존 승인 기록을 새 서약 동의로 자동 간주하지 않음. 이전 양식 신청은 새 절차로 재신청 필요.

## 검증 명령
- `node scripts/build.mjs` — 클라이언트 및 서버 함수 프로덕션 빌드
- `node --test --test-concurrency=1 tests/*.test.mjs` — 기존 데이터베이스·결제·권한 회귀
- `node --test tests/expert-onboarding.test.mjs tests/expert-documents-api.test.mjs` — 신규 권한/서류/서약/심사/제재/스토리지/API
- `node tests/expert-browser.mjs` — 360px 3직군 가입, 인증 실패, 서류 첨부·삭제, 서약, 관리자, 뱃지
- `node tests/browser-smoke.cjs`, `node tests/brand-browser.cjs`, `node tests/commerce-browser.cjs` — 기존 화면 회귀

스크린샷은 artifacts/expert-*.png. 테스트는 PGlite·가상 인증·가상 파일/API로 실행하며 실제 Supabase/SMS 통합 성공을 의미하지 않음.

공식 문서: [휴대폰 변경](https://supabase.com/docs/reference/javascript/auth-updateuser), [OTP 검증](https://supabase.com/docs/reference/javascript/auth-verifyotp), [비공개 저장소](https://supabase.com/docs/guides/storage/buckets/fundamentals).
