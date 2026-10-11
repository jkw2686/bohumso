# 현재 인수인계 — 출시 전 UI 개발 정리 (2026-10-12)

PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽는다. 최신 사용자 지시가 우선한다.

## 현재 범위와 진행
- codex/mobile-ui-polish, 시작 기준 65580fd. 첫 홈은 유지하고 전문가·자료실·성장·프로필·계정·예약·고객센터를 정리했다.
- 이번 지시는 UI 구현·격리 검수만 허용한다. 운영 DB/설정/배포/외부 발송/비용 집행 금지. 예전 배포 승인을 재사용하지 않는다.
- 선택한 7페이지에 app-ui.css 적용. 기관 데이터·URL, index.html, 전역 styles.css/type-system.css, SQL, Netlify 설정은 그대로다.
- 전문가 홈: 이름 → 상담 상태 → 받은 요청·예약 → 내 프로필/자료실/성장/고객센터. 기존 폼과 저장 구조를 재사용한다.
- 자료실: 검색·분류·기관 목록 우선, 공식 안내/상세보기 구분. 성장: 바로 입력, 날짜·메모 선택 펼침, 나의 실천/읽을거리 구분.
- 프로필·상담 조회 실패에 재시도, 상담 저장 중 입력 잠금, 자료 제출에 파일명·처리 상태. 예약은 상대방·시간·방식·상태 순서.

## 검증과 결과
- node scripts/build.mjs
- node tests/ui-polish-browser.mjs after
- node tests/expert-profile-page-browser.mjs
- node tests/claim-resources-browser.mjs
- node tests/growth-browser.mjs
- node tests/profile-usability-browser.mjs
- node tests/requests-page-browser.mjs
- node tests/appointment-care-browser.mjs
- node tests/support-chat-browser.mjs
- 위 검사는 메모리 문제를 피하도록 하나씩 순차 실행한다. 가상 계정·격리 PGlite/응답을 사용하고 외부 요청은 차단한다.
- 7페이지 360/390/430/1440px·글자 200%, 프로필/사진 저장·실패, 상담 상태 독립성, 실천 CRUD·재접속, 검색·공식 링크·상세, 예약·문의 회귀 통과.
- 최종 확대 검사에서는 프로필·실천 선택 입력·자료 상세·새 문의 입력을 펼쳤다. 문의는 짧은 500px 화면에서 입력창과 보내기 버튼 접근도 확인했다.
- 상세 보고: docs/ui-polish-20261012.md. 전후 390px 화면: docs/ui-polish-screens/. 원시 결과: docs/ui-polish-results.json.
- 수정 전 이미지는 첫 변경 빌드 전에 기준 65580fd의 파일·번들로 캡처했다. 이후 before 검사를 재실행해 새 번들과 섞지 않는다.

## 미확인·충돌 가능
- 실단말 키보드·카카오 브라우저·OS 글자 확대 미확인. 짧은 브라우저 화면/루트 폰트 확대와 구분한다.
- 운영 OAuth/SMS/실계정 저장·비공개 Storage 업로드는 실행하지 않았다. 자료 제출의 동의 차단·오류 입력 보존만 격리 확인했다.
- 별도 지도 공개 스위치는 현재 기준에 없어 만들지 않았다. 상담 수신을 지도 공개로 표시하지 않는다.
- ../bohumso-ui-release는 기존 dirty 작업본이다. account.js/optional-profile.js/profile-editor.js, 관련 HTML/design-system/profile tests 충돌 가능. 그 작업본과 058 SQL을 가져오거나 수정하지 않았다.
- Claude Code 실행 중 변경은 직접 확인하지 못했다. 통합할 때 실제 diff로 비교해야 한다.

## 다음 순서와 예상 시간
1. 총괄 검수: 보고서의 전후 캡처와 기능 근거 확인.
2. 실단말 키보드/확대/인앱 확인 30~60분.
3. 다른 작업본과 비교·필요한 통합 30~90분. 공통 파일을 통째로 덮어쓰지 않는다.
4. 운영 반영은 별도 지시 후 진행. 이번 작업에서 main 병합/DB 실행/배포 금지.

## 되돌리기·전송
- 기준 65580fd와 개발 브랜치 변경만 비교해 되돌린다. 타 작업이나 기존 데이터는 되돌리지 않는다.
- 개발 브랜치에만 저장·전송하고 [skip netlify] [skip ci]를 붙인다. 강제 push 금지.
- 이번 작업용 상시 미리보기는 실행 중이지 않다. 화면·검수 결과는 보고서에서 확인한다.
- 이전 운영 이력: main942dcc7 / Netlify6acb993f62318600085a5151, 2026-10-11 통합 배포. 이번 변경의 운영 반영을 뜻하지 않는다.
