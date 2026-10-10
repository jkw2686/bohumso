# 선택형 지도 프로필

## 범위
기존 biography와 photo_url 재사용, experience 데이터 보존·화면에서 제거. 선택형 보험 취급 구분/도움업무 두 배열 추가. 입력 없음은 불이익/빈 배지 없이 숨김. 소개 저장 시 40자/일반 텍스트 검증. 기존 긴 소개는 입력을 변경하기 전 저장값을 유지하고 지도만 40자 이하로 보여줌. 기존 자격·소속·휴대전화 확인 및 상담 ON/OFF 유지.

공개 활동지역과 GPS 구분 유지. 실제 office_locations.operator_user_id로 연결한 계정만 보험소 업무 선택과 해당 보험소 방문예약을 제공. 현재 운영에 연결된 운영자를 임의 지정하지 않음. 취급 구분은 본인 선택이며 자료 확인/자격 인증과 무관.

## 사진
기존 prepareDocument 이미지 처리 재사용 후 중앙 정사각형192px JPEG 생성. 서버128KB/48~256px 정사각형/JPEG 확인, EXIF/IPTC거부. 원본 저장/전송 없음. expert-profile-photos 비공개 버킷. 원본 자격서류 저장소 변경 없음. POST/DELETE는 현재 로그인 계정만, 공개 GET은 기존 공개 catalog에 남은 계정의 현재 버전만. 공개정지·삭제 후 과거 버전 URL로 조회 불가. 직접 Storage 접근은 restrictive정책으로 차단. 이전 파일 정리 실패 시 숨긴 성공이 아니라 운영확인 안내. 기존 외부 주소의 큰 원본은 지도에서 불러오지 않음; 해당 계정은 사진 선택으로 교체 가능.

## DB 적용과 원복
052_optional_expert_profile.sql + optional_profile_storage.sql을 단일 BEGIN/COMMIT으로 조합해 적용. 재실행 가능. 기존 행/열 삭제·타입 변경 없음. 개인별 변경 전 소개/사진주소/경력, 기존 함수2개, 컬럼 구조와 기존회원1건은 private.optional_profile_*에 접근차단 백업. rollback_optional_expert_profile.sql은 기존 catalog/consultation 함수를 복원하고 새 쓰기 RPC를 차단하며 신규자료/비공개사진은 보존. 이전 프런트엔드와 함께 원복; 이전 배포에는 새 사진 API가 없어 새로 등록한 사진의 표시까지 원복되는 것은 아님.

## 검증
격리 DB 소유권/상태/옵션/40자/필드 비우기/경력 유지/서버 인증/반복실행/원복 PASS. 이미지API 잘못된 인증·Origin·용량·타입·메타데이터 및 승인정지 공개차단 PASS. 320/390/1440 화면, 긴소속40자·200%글자·ONOFF·운영보험소버튼·사진 등록변경삭제·새로고침후유지 PASS. 실제 회원 프로필/사진 변경과 운영 예약·SMS는 수행하지 않음. 운영 적용/배포 증거는 HANDOFF에 기록.
