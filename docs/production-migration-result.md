# 운영 DB 적용 결과 — 2026-10-05

## 현재 결과

운영 Supabase `xyexphhspykwwlhfokfl`에 030–036 및 비공개 Storage 설정을 단일 트랜잭션으로 적용했다. 변경 이력 8건 확인. 기존 회원 Profile/동의 JSON은 직전 백업과 일치한다. 실제 기존 계정의 Production 로그인도 유지됨을 브라우저에서 확인했다.

2026-10-05 19:01 KST에 사용자 “다른 이메일이 없어 일단 진행” 응답에 따라 Production 6ac3759012706d0008f41df7 / 1d9799b 공개 배포 완료. 운영 HTTP 17/17 PASS. 실제 새 이메일 가입·비공개 업로드는 미검증으로 유지하며 운영 문서·문자·결제는 비활성. 이후 SOLAPI OTP 지침 도착으로 별도 037 및 테스트 배포 작업 중; 운영 문자 활성화는 별도 승인 전 금지.

## 백업

- 적용 직전 export: 2026-10-05 18:08:25 KST.
- 저장소 밖 `outputs/private-backup-2026-10-05/schema-member-before-final.json`.
- SHA256: `300cbb24ac0c4e6c0b6d21057421cd2069400bd8875364e4a3b70157e6c49526`.
- 기존 39개 앱 테이블, 276개 컬럼, 66개 함수의 정의/권한, 제약·인덱스·트리거·정책, 기존 회원 1건/동의 1건을 포함한다. 비밀번호·인증 토큰·Storage 파일을 포함한 전체 Supabase 백업은 아니다. 비공개 export를 Git/공개 배포에 넣지 않았다.

## 변경 내역

| 구분 | 실제 적용 |
|---|---|
| 신규 테이블 11개 | `service_features`, `account_lifecycle`, `consent_records`, `member_rights_requests`, `expert_profiles`, `expert_verification_events`, `verification_documents`, `office_calendar_exceptions`, `organization_roster`, `operational_counters`, `member_rights_events` (모두 private) |
| 기존 테이블 추가 컬럼 | `office_locations`: address, latitude, longitude, weekdays, first_start_hour, last_start_hour. `consultations`: duration_minutes |
| 기존 컬럼 삭제/타입 변경 | 없음 |
| 기존 회원·예약 삭제/TRUNCATE | 없음. 문서 삭제용 RPC 본문에는 DELETE가 있으나 Migration 실행에서 호출하거나 기존 데이터를 삭제하지 않음 |
| Storage 정책 | `expert-documents` 비공개, 4MB, JPEG/PNG/PDF. `expert_documents_endpoint_only` 제한 정책으로 anon/authenticated의 직접 접근 차단. 같은 이름 정책 교체 구문은 있으나 실행 전 Storage 정책은 0개였음 |
| RLS | private 36→47개, 47/47 활성화. 신규 테이블 직접 접근 권한 회수, 인증·본인/배정/관리자 검사 RPC로만 사용. 기존 public 3개 정책 보존 |
| 동의 | 버전별 추가 이력. UPDATE/DELETE 차단. 기존 동의 1건 보존 |
| 상담 시간 | 보험소/전문가 대면 60분, 전화 기본30분(DB에서60분 선택 가능). 서버가 실제 office_id/method로 결정 |
| 18시 의미 | 18:00 시작/19:00 종료. 배정 전문가도 19시까지 가능한 경우에만 배정 |
| 정책 최종 기준 | DB service_features 및 release_controls. Netlify는 서버/공급자 사용 가능 여부를 제한하며 DB 자격을 부여하지 않음 |

## 검증 결과

| 요청 항목 | 검증 범위와 결과 |
|---|---|
| 기존 회원 로그인 유지 | 실제 Production 브라우저 PASS |
| 기존 Profile 보존 | 직전 export와 JSON 비교 PASS |
| 신규 회원가입 | 실제 DB의 회원 완료 RPC/권한 PASS. 실제 신규 이메일·Google 인증 전 과정은 미완료 |
| 약관 동의 이력 | 실제 DB 임시 회원 3개 버전 기록·수정차단 PASS |
| 전문가 Profile 생성 | 실제 DB 일반 회원 권한 RPC PASS. 실제 새 계정 UI 왕복은 미완료 |
| 비공개 확인자료 업로드 | 비공개 bucket/서버 전용 메타데이터·읽기 권한 PASS. 실제 파일 HTTP 업로드는 미완료 |
| 보험소 60분/18:00 예약 | 실제 DB 임시 보험소·검증 계정 PASS |
| 동일 시간 중복 차단 | 실제 DB 순차 중복 요청 PASS. 실제 별도 두 연결 동시 요청 검증은 미완료 |
| 고객 본인만 조회 | 실제 DB authenticated 역할 RLS/RPC PASS |
| 전문가 배정 건만 조회 | 실제 DB 배정 전 차단·배정 후 노출 PASS |
| 관리자만 자료 열람 | 실제 DB owner 거절/admin 허용 PASS. 원본 파일 HTTP 경로는 미완료 |
| 탈퇴·삭제 요청 | 실제 DB 접수·탈퇴 후 비활성 PASS |
| 일반 사용자 Storage 차단 | 실제 DB anon/authenticated 직접 INSERT 차단 PASS, 제한 정책 확인 |

운영 DB 통합 검증 17개는 합성 계정/거점/자료 메타데이터를 사용하고 전체 ROLLBACK했다. 그 후 Auth 3명/기존 Profile 1건/기존 동의 1건/예약0건을 재확인했다. 실제 사용자의 전화 인증이나 운영 약관 승인 상태를 바꾸지 않았다. 정책 승인·실 SMS가 꺼져 있어 일반 고객 예약 E2E는 이를 우회해 성공으로 처리하지 않았다.

로컬 DB·서버 78개 PASS. 단일 트랜잭션/오류 전체 취소/동일 SQL 재실행/광범위 기존 Storage 정책이 있어도 제한되는지 포함. 화면 6묶음 완료: 마지막 commerce 검사 확인란 시간 초과1회 후 무수정 재실행 PASS. 서버 엄격 타입 검사 PASS. 기존 키 연결 전 검토 배포의 실제 HTTP 17개 PASS(비활성 업로드503은 업로드 성공을 뜻하지 않음).

## 서버 키와 배포 상태

Netlify 일반 목록뿐 아니라 실제 변수 메타데이터/팀 공용 설정/원래 프로젝트를 확인했으나 서버 키가 없었다. Supabase에 남아 있는 기존 service_role 키를 다시 복사해 Netlify에 비밀값으로 연결했다. 새 키 생성/회전은 하지 않았다. 로컬 평문 저장은 자동 검토에서 거절되어 실행하지 않았으며, Netlify UI로 직접 연결했다. Production와 Deploy Preview에만 저장하고 로컬 개발/브랜치에는 넣지 않았다. 요금제 UI의 세부 범위 선택은 잠겨 있어 Secret 기본 범위 Builds/Functions/Runtime이며 Post processing 제외다. 실제 코드에서는 서버 함수만 사용하며 공개 config에 포함하지 않는다.

검토 환경만 EXPERT_DOCUMENTS_ENABLED=true, APP_ORIGIN=https://early-access-review--bohumso.netlify.app. Production 문서 기능은 아직 false 유지. 실제 신규 인증과 업로드 검증을 위해 사용자 직접 인증 단계가 남아 있다.

## 롤백

`supabase/rollback_early_access.sql`: 한 트랜잭션으로 신규 가입/전문가/예약 쓰기를 중지하는 비파괴적 운영 롤백. 기존 데이터·동의·문서·회원탈퇴 보호·읽기·권리요청은 보존한다. 로컬 실행 검증 PASS, 운영에서는 실행하지 않았다.

추가 테이블/컬럼을 삭제해 과거 스키마로 완전히 되돌리는 SQL은 아니다. 신규 데이터가 생길 수 있어 이를 자동 삭제하지 않는다. 이전 함수 정의와 권한은 직전 export에 보관했다. 웹은 필요 시 이전 Production 배포 `6ac1c36080854700096ea90c`로 별도 복구한다.
검토 alias는 branch-deploy로 확인돼 early-access-review 특정 분기에도 비밀 키와 허용 주소/문서 스위치를 맞췄다. 전체 branch-deploy나 로컬 개발에는 키를 추가하지 않았다. 기존 키 확인 중 도구 기록에 비밀값이 한 번 표시되는 실수가 있었음을 사용자에게 알렸다. 키를 반복 표시하지 않았으며 서버 키 교체를 권고한다. 새 키 생성/회전은 아직 하지 않았다.

최종 검토 배포: `6ac371610c316e38929e2d96`, https://early-access-review--bohumso.netlify.app/signup.html. 검토 분기 환경 수정 후 실제 문서 서버 검사 5/5 PASS(DB 정책/문서 스위치 활성, 무로그인401, 위조 로그인401, 외부 Origin403, 익명 service-only RPC401). 실제 파일 업로드 성공을 뜻하지 않는다. 새 테스트 계정 인증은 사용자에게 열린 가입 화면에서 진행 요청했고 현재 대기 중이다.
