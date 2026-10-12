# 현재 인수인계 — 직군별 가입 운영 배포 완료 (2026-10-12)

PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 읽고 최신 직접 사용자 지시를 우선한다.

## 현재 상태
- 사용자 “066 DB 적용 후 배포 승인”에 따라 운영 Supabase066 적용 및 공개 배포 완료. 재승인을 기다리는 상태가 아니다.
- 브랜치 codex/profession-registration. main과 코드 fb970b48a76577dfe5477fc3e8e28b6cfd89fe91 동기화. 문서 후속 커밋은 배포 생략한다.
- Production https://bohumso.netlify.app/ · Netlify6acc93b70f2a87c5160f7e22 · 2026-10-12 17:01:15 KST ready/published.
- 고정 버전 https://6acc93b70f2a87c5160f7e22--bohumso.netlify.app/
- 완료: 보험설계사/세무사/보험소 운영자 가입 첫 단계·직군별 서류·심사·선택 프로필·지도 유형·세무 비용 확인·예약 연결. 손해사정사/변호사 신규 접수 차단.
- 기존 전체 메뉴/디자인 유지. 플랫폼 요금/무료기간/결제/외부 메시지 변경 없음.
- 마지막 코드 수정: src/workflow.js 일정 변경 입력 1시간/09~17시, src/account.js invalid_slot 문구 일치.

## 운영 DB 결과
- 사전26대상함수, 전체128함수/569컬럼/제약·권한/기존 회원1건 비공개 백업. 066 전체BEGIN/COMMIT 실행.
- 기존 데이터 내용 지문 보존 확인. 기존 컬럼 삭제/타입변경0, 기존정책 동일.
- 새5테이블 RLS/anon·authenticated 직접 읽기쓰기 거부. expert-documents 비공개, 문서 메타 RPC service_role 전용.
- 운영 스키마 비교 결과055 등 별도 작업은 미적용이다. 운영 기준24함수로 격리 DB를 재검사했다. 대표 전용2함수는 실신원 재현하지 않고 기존 위임/보존 확인.

## 검증 재실행
- node scripts/profession-catalog.mjs --check
- node scripts/build.mjs
- node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 --test tests/profession-registration.test.mjs
- node --test tests/expert-documents-api.test.mjs tests/profile-photo-api.test.mjs
- node tests/profession-browser.mjs --ui-only
- node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 tests/profession-browser.mjs
- 선택 환경변수 PROFESSION_BASELINE_FUNCTIONS=artifacts/profession-production/functions-before.json: 운영 대상24함수 기반 추가 통합 검사. 백업은 비공개/Git 제외. 보통 검사는 가상 데이터만 사용한다.
- node_modules는 기존 설치의 연결 경로라 제한 환경 빌드에서 access denied가 날 수 있다. 같은 빌드를 승인된 로컬 권한으로 실행하여 통과했으며 신규 패키지 설치 안 함.
- 운영 읽기 확인: 가입/직군별 입력, 모바일360/390/430 및PC1440, 기존2전문가 지도·상담 연결, 서버09~17 정각슬롯, 홈 새 문구·약관. 배포 account.js SHA-256 로컬과 동일, 인증 없는 자료 조회401.
- 운영 캡처와 DB/화면/파일 검사 결과는 artifacts/profession-production에 로컬 보관. 원격에는 운영 캡처/개인정보/백업 원문을 전송하지 않음.

## 미확인·다음 단계
- 운영 실계정 신규가입/심사/파일 바이너리/예약 쓰기 검사는 안 함. 격리 DB/모의Storage 검사와 구분. 실제 로그인 세션으로 입력 화면/읽기는 확인.
- 실제 단말 키보드/OS 글자확대/OAuth·SMS·업로드 검사는 약20~40분 예상. 지정 테스트 계정과 외부 발송 승인 범위 확인 후 수행. 자동으로 고객 메시지 보내지 않는다.
- 기존 원본30일/기록1년 보관 문구는 유지. 실제 자동 파기 연결은 미확인, 운영자가 기간별 집행 절차 확인 필요(약30~60분 점검).
- 세무사 등록/사무소는 사람이 공식 자료로 확인. 자동 자격검증 API를 연결한 것으로 표현하지 않음. 유료 노출 법률 판단은 미완료, 새 직군 가격·결제 개방 금지.
- 거점 승인 시 관리자가 주소 확인 후 좌표 입력. 별도 거점 전용 대시보드는 기준 코드에 없어 신설하지 않음. 신규세무/거점 자기심사 차단: 대표 본인 신청은 다른 권한 있는 심사자 또는 운영 결정 필요.
- 자세한 결과와 법적 근거 docs/profession-registration-20261012.md.

## 보호·원복
- 다른 작업본 bohumso-fec525a codex/meeting-feedback(062~065), bohumso-ui-release 등 수정/병합 안 함. Claude 작업을 직접 확인했다고 주장하지 않는다.
- 충돌 가능: src/account.js, menu.js, workflow.js, profile-editor.js 및 consultation/urgent/profile SQL 함수. 특히066 뒤에 과거SQL을 덮어 적용하지 않는다.
- 원복: supabase/rollback_profession_registration.sql + 이전 프런트23b885b. 추가 테이블/컬럼/신청은 보존, 신규거점 접수중지. 이후 생긴 실제 데이터/승인범위를 확인하고 실행. 무단 rollback 금지.
- 비공개 백업 private.profession_release_backup / private.profession_release_snapshot, artifacts/profession-production. 회원/함수 전체 백업을 Git에 넣지 않는다.
- 이번 작업 완료. 별도 ROADMAP4~9단계/062~065 완료로 표시하지 않는다.
