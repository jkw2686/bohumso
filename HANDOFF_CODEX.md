# 인수인계
이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 '다음 할 일'부터 진행.

## 2026-10-24 운영 적용 및 배너 최종 배포
- 운영 코드 ad0c2be757bbf2e497bcbd6af2cba6e7a62de404 / Netlify 6adc971ef3f63652b2723230 ready. https://bohumso.netlify.app/ 실제 HTML 새 배너 확인.
- 홈/지도 배너: '청구까지,' 뒤 명시적 줄바꿈, '가까운 전문가' nowrap. 글꼴·색·사진 유지. 운영 HTML/CSS/이미지 360/390/430/1280 검수, 목록 응답은 격리해 개인정보 조회 회피. artifacts/release-20261024/banner-*.png.
- PDF: output/pdf/우리보험소-홈배너-수정지침.pdf. 한글 원본 폰트 사용, Poppler PNG 렌더 시각 확인. 의료·회원 개인정보 포함 안 함.
- Supabase xyexphhspykwwlhfokfl: 사용자 요청으로 대시보드 열어 기존 로그인 세션 사용. 회원/상담 원문 조회 없이 메타데이터 점검. 운영 079~083 적용 후 ROLLBACK 검증 성공 → 동일 5개 SQL 한 트랜잭션 COMMIT/이력 저장/스키마 reload 완료.
- 최종 DB 확인: migration_count=5, 새 private 테이블 RLS=true, MFA enforced=true, anonymous contact/admin execution=false, private buckets=true. 실제 익명 RPC 401, private schema 406, 관리자 초기 HTML 차단. artifacts/release-20261024/db-applied.png.
- 실제 Auth 설정 읽기 확인: TOTP Enabled, 최대10개, AAL1 15분 제한 ON; SMS30/h, refresh150/5min, OTP30/5min, signup/signin30/5min, 메일 최소60초. CAPTCHA OFF. 설정값 변경하지 않음. 계정별 실제 인증 앱 등록/로그인은 본인 조작 필요, 대리 인증 없음.
- GitHub DATABASE_URL Secret 미설정. 이전 migrate 워크플로 성공은 Apply 단계 SKIPPED였음. 이번에는 관리 화면으로 수동 적용했으므로 '자동 마이그레이션 성공'으로 보고하지 않음. 감사용 임시 workflow 제거, read-only CLI 감사 스크립트는 유지. migrate 채택 기준078로 변경해 미적용072/073 등 과거 SQL을 자동 실행하지 않도록 보호.
- Netlify 전체 환경변수 조회는 자동 승인 검토에서 거절됨(비밀값 반환 우려). 우회하지 않고 DB관리 UI/공개설정/기존 CI 사용. 비밀값 출력·계정 병합·실상담 생성·수락·개인정보 backfill 없음.
- 검수: verify #284 및 배너 포함 #285 모두 성공(224 pass/0fail/0skip), 최종 운영 #286 결과 성공: npm ci / npm run build / npm test, 224 pass·0 fail·0 skip. https://github.com/jkw2686/bohumso/actions/runs/40090263466. 로컬 build 및 migration-plan 7개/배너4폭 통과.
- 후속: 실제 관리자 MFA 앱 연결·로그인 확인, 원할 경우 GitHub DATABASE_URL Secret을 소유자가 설정. 전체 과거 보유자료 자동파기/법정 근거 검토, 기존200건 이후 상담 상세 확장, 보험소/즉시방문 동일 시간당 제한 확대는 기존 후속 범위 유지. 법적 준수/실명 인증 완료를 뜻하지 않음.
- 작업 중 이충경 계정·기록 접근하지 않음. 기존 public/help 6파일/outputs 작업분 보존.
