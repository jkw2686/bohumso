# 인수인계
이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 다음 할 일부터 진행.

# 관리자 메뉴·전문가 프로필·시작 아이콘 — 2026-10-24

- 관리자 홈: 업무별 링크. 선택한 관리 화면 하나만 표시, 나머지 운영 도구 접기. 기존 컴포넌트/권한/입력/처리 경로 재사용.
- 전문가 홈: 사진88px, 이름/직군/프로필 링크 간격 정렬, 핵심 활동·예약 첫 화면 유지.
- 시작 아이콘: 기존 원본SVG, 일반아이콘 심볼90%, maskable76%로 여백 축소.1024PNG/512maskable 및 manifest 버전 갱신. 원형40%반경 안전영역 픽셀검사 통과.
- 앱 내부 전용 splash는 존재하지 않음. 첨부화면은 Android가 manifest로 생성. OS 로고 px/이름크기/간격은 웹CSS로 강제불가. 인위적 시작대기 추가하지 않음. 실폰 재시작 확인 필요.
- 모바일 관리자6폭/전문가4폭 및200%/초안보존/토글저장/직군별 메뉴 통과. 전체CI 확인 후 prod push 예정.
- 실제 사용자/운영DB/과금/승인/연락처 정책 변경 없음.

## 완료 결과
- 작업 브랜치 verify #275: https://github.com/jkw2686/bohumso/actions/runs/40082569010 — npm ci/build/test 성공,220pass/0fail/0skip. 성공 확인 후 동일20d7a07 커밋을 main으로 push.
- Netlify6adc7d09280a273f460dd00e ready. admin-home.css,expert-home.css,manifest.webmanifest,assets/account.js,maskable512 HTTP200/검수본 일치.
- 관리자6폭,전문가4폭/200%/설정저장,관리자권한12건,아이콘 안전영역 검사 통과.
- 실휴대전화 완전종료 재실행은 사용자에게 확인 요청한 상태. OS 로고96~120px/문구28px/간격20~24px는 manifest에서 직접 지정 불가. 개선은 원본아이콘 여백과크기. 실기기 확인완료로 보고하지 말것.
- 관리자/전문가 코드 검수·배포 완료. DB/실데이터/요금 변경 없음.
