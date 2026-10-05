# 운영 변경 계약 (030–036)

- 운영 적용 경로는 `scripts/early-sql.mjs`가 생성한 하나의 BEGIN/COMMIT 묶음이다. SQL Editor와 배포 스크립트가 동일한 묶음을 사용한다. 오류 시 전체 취소하며 migration ledger 기록도 취소된다.
- 재실행은 ledger의 파일명으로 전체 migration을 건너뛴다. 이미 적용된 파일은 수정해 재실행하지 않고 새 migration 번호를 만든다. 동시 실행은 transaction advisory lock으로 직렬화한다.
- 서비스 가입·전문가 신청·초대·상담 시간 정책의 최종 기준은 DB `service_features`다. 예약 정책 승인·전화 검증 자격은 DB `release_controls` 및 실제 인증 상태가 결정한다. Netlify는 서버 연결·공급자 사용 가능 여부를 제한하는 추가 스위치일 뿐 DB 권한을 부여하지 않는다. DB 조회 실패 시 회원 진입을 닫는다.
- 전화는 기본 30분이며 DB 설정으로 60분도 가능하다. 보험소 방문/전문가 대면은 60분이다. 서버는 실제 office_id와 consultation method로 확정하며 고객이 보낸 duration/targetType은 신뢰하지 않는다. 기존 예약 값은 수정하지 않는다.
- 보험소 last_start_hour=18은 18:00 시작,19:00 종료를 허용한다. 해당 예약에 전문가를 배정하려면 전문가 근무 종료도 19시 이후여야 한다.
- 동의는 버전별 추가 기록이며 UPDATE/DELETE를 거부한다. 기존 member_consents 행은 그대로 둔다.
- 확인자료 메타데이터/Storage는 비공개다. 일반 회원은 직접 Storage에 접근할 수 없다. 업로드/삭제는 인증 서버를 통하며 자료 원문 열람은 관리자만 가능하다. 제출자는 목록만 확인한다.
- `supabase/rollback_early_access.sql`은 새 가입·전문가/예약 쓰기를 중지하는 비파괴적 운영 롤백이다. 추가된 테이블/동의/업로드/요청 이력은 보존하며 회원탈퇴 보호를 유지한다. 스키마를 과거 상태로 삭제 복원하는 SQL이 아니다. 프론트엔드는 검증된 이전 Netlify 배포로 별도 복구한다.
- 전체 구조와 이전 함수 정의/권한 및 기존 회원 1건의 export는 저장소 밖 로컬 private-backup 폴더에 보관한다. Supabase 전체 백업이나 Auth 비밀번호/Storage 파일 백업을 대신하지 않는다.
