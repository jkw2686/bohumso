# SOLAPI OTP 검토 결과 (진행 중)

기존 수정본 Production: 6ac3759012706d0008f41df7 / 1d9799b, 공개 HTTP 17/17 PASS. 추가 이메일이 없어 신규 실제 가입 테스트를 생략하고 진행하라는 사용자 응답에 따라 배포. 이후 SOLAPI 지침 도착: OTP 작업 후 추가 배포 요청.

## 변경
- 037 단일 transaction / 재실행 가능. private.phone_contacts, private.phone_otp_challenges 2개 신규, RLS 및 일반 사용자 직접 접근 차단. 회원 Profile 연락처 상태는 private.phone_contacts에 별도 보관하며 Auth identity는 변경하지 않음.
- 6자리 난수, 서버 HMAC hash만 저장, 3분 만료, 30초 재발송, 번호·사용자 10분 3회/IP 10회, 5회 실패 잠금, 이전 OTP 취소, 성공 hash 폐기. 실패 발송도 제한 집계에 포함. 요청 간 원자성은 DB advisory lock.
- Google/Email 계정 유지, 회원가입에 휴대전화 강제 없음. 예약 마지막 요청에서 인증 후 선택 상태 복귀. 긴급 요청도 인증된 연락처만 서버에서 전달, 별도 제공 동의 유지.
- 기존 연락처 확인 함수 8개 연결 변경; 오래된 UI에서 제거된 legacy 예약 쓰기 2개 권한 회수. 기존 데이터 삭제/컬럼 삭제/타입 변경/Storage 변경 없음. 접근 정책 변경이 있으므로 단순 테이블 추가만은 아님.
- Production 활성화는 DB phone_enabled + Netlify enabled=true/mode=otp 모두 필요. Preview의 mode=test는 허용 번호 실발송용. 허용 목록 없는 발송은 거부.
- SOLAPI 키/Secret 등록 및 Secret 속성 확인, 값을 파일·Git·출력으로 저장하지 않음. Production false/test 유지.

## 근거와 테스트
공식 API: https://solapi.com/developers/api/messages / https://solapi.com/developers/api/authentication-api-key
SMS 90 byte 내 지정 문구와 HMAC 인증 사용. API 접수 성공은 기기 수신 성공과 구분.

| 항목 | 결과 | 방식/횟수 | 문제·수정·재검증 |
|---|---|---|---|
| OTP 생성·소비·기존 코드 무효·RLS | PASS | 로컬 DB 2묶음 | status 기본값 누락 수정 후 재통과 |
| 3분 만료 | PASS | DB 시각 fixture 1 | 실제 3분 대기는 미검증 |
| 30초 제한/10분3회/5회실패 | PASS | DB 경계조건 | 서버 제한, 6번째 차단 포함 |
| 허용 목록/장애/응답 비밀값 | PASS | 서버 모의 1묶음 | 실제 API 호출 아님 |
| 보험소/전문가 예약 복귀 | PASS | 브라우저 2흐름 | fetch 호출 바인딩 수정 후 재통과 |
| Google·Email 실제 문자 수신·인증 | 미검증 | 0 | 운영 037 적용 및 사용자 문자 입력 필요 |
| 실제 SOLAPI 발송·수신시간 | 미검증 | 0 | 성공으로 보고하지 않음 |
| Production 활성화 | 대기 | false/test | 실제 검증 후 별도 승인 필요 |

현재 백업: outputs/private-backup-2026-10-05/otp-before.json (운영 함수84개/회원1/동의/인증계정3·예약0 집계), 저장소 밖 보관. rollback SQL: supabase/rollback_solapi_phone_otp.sql. 기존테이블과 신규 기록을 삭제하지 않고 함수 복원·신규RPC 회수. 기존 legacy 쓰기는 계속 차단.

검증 대기: 실제 SMS 15 CASE, 다른 로그인 제공자, 실제 독립 요청 동시성, 기기 수신시간. 기존 정책 승인 전 예약 서버 차단은 유지되므로 실제 예약까지 열렸다고 보고하지 말 것.
