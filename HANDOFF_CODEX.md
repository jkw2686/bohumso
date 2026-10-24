# 인수인계
이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 '다음 할 일'부터 진행.

## 2026-10-25 — 홈 잔여 정리 · 켜기/끄기 버튼 · 로그인 종류 안내
- 코드만 수정, DB/서버 권한/예약 상태 전이/결제/발송 로직 변경 없음. 운영 DB·마이그레이션 실행 안 함. 실계정 미사용.
- 이 PC 사본이 origin/main보다 260커밋 뒤처져 있어 origin/main(a70af23) 기준으로 작업. 로컬 전용 14커밋은 backup/local-main-20261025 브랜치로 보존(원격 미반영 여부 별도 점검 필요).
- aee823f 홈: .map-gesture-help 문구 삭제, #homeLocationStatus 초기 빈 값, 저장된 위치 복원 시에도 문구 미표시, '내 위치'를 누른 뒤에만 진행·오류·결과 문구. 지도·핀·버튼 2개 유지. #homeExperts 잔여 참조 0건.
- 35ebc71 전문가: '지도에 표시'(expert-home.js)와 compact '방문 가능'(expert-visits.js)을 [항목 · 상태] [켜기/끄기] 한 줄로 교체. role=switch 제거, aria-label은 항목명+동작, 터치 44px, 켜기=채움(--brand-ink)/끄기=테두리, 켜짐은 ●+--brand-teal-strong, 꺼짐은 --muted. 끄면 확인창 없이 '껐습니다' 잠깐 표시. 화면 문구 'ON'/'OFF' 0건(알림 설정 문구 포함 정리).
- d2a3d81 로그인: 로그인 링크에 as=customer/as=expert(기존 next 유지, index.html·menu.js·member-entry.js). as는 member-access.js가 기억하고 account.js가 roleDestination 직전에 비교(role-routing.js roleMismatch). 전문가계정+일반로그인→'전문가로 등록된 계정입니다.'[전문가 화면으로], 일반계정+전문가로그인→'일반회원으로 가입된 계정입니다.'[전문가로 등록하기][일반 화면으로]. 일치/as없음은 기존 이동 유지, 관리자(전문가 아님)는 안내 없음, 관리자+전문가는 전문가 규칙. 로그아웃시키지 않음. 로그인·가입 화면 미수정.
- 검사: npm run build 통과. npm test 224/224 통과(1·2번 반영 시점). 신규 tests/role-login-notice.test.mjs 8건 통과(4조합+관리자+as없음). npm run verify는 실행마다 다른 파일이 1건 실패(promotion / insurer-contacts)하나 개별 실행 시 모두 통과 — 이 PC 메모리 문제로 판단, 신규 실패 아님. CI 재확인 필요.
- 390x844 DOM 확인: 확대·축소 문구 0, 위치 문구 빈 값→'내 위치' 누른 뒤에만 표시, 지도+버튼 2개가 스크롤 없이 보임(하단 667<844), 가로 넘침 없음.
- 미검수: 전문가 화면 꺼짐/켜짐 실제 캡처(로그인 계정 필요 — 실계정 사용 금지로 미실행), 실기기 검수. 지시서 3~7번(동의 1회, 시간 선택지, 084 노출 2단, 위치 자동 갱신, 30분 방치 자동 끔)은 아직 착수 전.

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
