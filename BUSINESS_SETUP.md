# 운영 정보 관리

입력 위치: `public/company-info.js`의 `BUSINESS_INFO`. 빈 항목은 표시하지 않는다.
공통 설정을 읽는 푸터·약관·개인정보처리방침·고객지원에 반영된다.

- [ ] 법적 상호: legalName
- [ ] 대표자명: representativeName
- [ ] 사업자등록번호: businessRegistrationNumber
- [ ] 사업장 주소: address
- [ ] 대표 전화번호: phone
- [ ] 통신판매업 신고번호(해당 시): ecommerceRegistrationNumber
- [ ] 위치기반서비스 관련 신고정보(해당 시): 실제 행정절차 및 적용 여부 확인 후 등록

고객·개인정보 문의 창구는 COMPANY_INFO.supportEmail, 담당부서는 보험소 운영팀.
정책 버전 2026-10-09-v1 / 시행일·개정일 2026-10-09는 사업자 식별정보와 독립한다.

## 외부 처리 사실 확인

- 코드 확인: Netlify 호스팅/Functions, Supabase 인증/DB/Storage, Google OAuth, OSM 타일, SOLAPI 인증문자.
- [ ] 실제 계약상 수탁자, 프로젝트 저장 지역, 국외이전 근거·항목·시점·방법·기간·거부 영향을 확인하고 개인정보처리방침에 추가한다. 국가·법적 근거를 추측하지 않는다.
- 참고: https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq — 프로젝트 DB 지역과 서비스 운영 로그 처리가 같다고 단정하지 않는다.
- 참고: https://supabase.com/docs/guides/platform/regions
- 이 문서의 미완료 확인 항목은 법적 준수 완료를 의미하지 않는다. 정책 상태 표시와 실제 처리 사실 검증은 별개다.

## 보유기간 운영 절차 (내부 정책, 자동삭제 완료 주장이 아님)

- 운영팀은 매월 종료/취소 1년 경과 상담, 탈퇴/활동종료 1년 경과 동의·심사 기록, 심사 완료 30일 경과 원본을 점검한다.
- 일반 계정정보는 탈퇴 등 목적 달성 시 지체 없이 처리한다. 삭제 요청은 `member_rights` / 관리자 권리요청 목록에서 접수한다.
- 진행 중인 분쟁 및 실제 법적 보존 근거가 확인된 항목만 분리하고 사유·해제 시점을 기록한다.
- 문서는 `expert-documents` 서버 삭제 API로 객체와 DB를 함께 처리한다. 동의 증빙은 append-only이므로 일반 계정이 수정·삭제하지 못한다. 기간 만료 파기는 권한 있는 DB 운영자가 관계·분쟁 보존 여부를 검토해 수행한다.
- 기존 긴급요청 정리 기능은 그대로 유지. 전체 자동 파기 스케줄러는 이번 변경에 포함하지 않는다.

## 운영 전환/원복

- PRODUCTION 호환 코드 배포 후 `supabase/044_operational_policy.sql` 실행. 단일 트랜잭션, 재실행 가능, 기존 설정·함수·스키마·RLS 정의를 private.operational_policy_backup에 보관.
- `supabase/rollback_operational_policy.sql`은 새 접수 설정만 복원한다. 기존 회원·예약·동의는 삭제하지 않는다.
- 원복 기준 Git 태그: backup/pre-operational-policy-20261009. 코드 원복은 이번 변경만 revert하여 새 배포한다.
- 연락처 인증·전문가 심사·거점 활성 조건·RLS·비공개 Storage 정책은 완화하지 않는다.
