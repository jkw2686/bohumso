# 인수인계
이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 다음 할 일부터 진행.

# 관리자 홈 간소화 — 2026-10-24

- 전문가 확인 목록을 먼저 배치, 이름·직군·지역·상태 요약. 서류·심사 상세 한 건만 펼침.
- 관리자 홈 제목과 새로고침 정렬. 기존 문의·통계·명단·무료초대/모집 경로 유지.
- 변경: public/admin.html, public/admin-home.css, src/early-expert-admin.js, tests/mobile-controls-browser.mjs.
- 격리 검수: 320/360/390/430/768/1440 폭, 넘침/터치/입력크기, 실패 초안 유지, 처리 payload 보존. 관리자 접근·계정변경·로그아웃 12건 통과.
- 운영 DB/권한/실제 심사/요금/알림 미변경. 운영 신청 승인은 실행하지 않음.
- 코드 검수와 운영 배포 상태는 아래 후속 기록 참고.

다음: Git CD 배포 확인. 기존 help6 줄바꿈과 outputs 작업은 제외.

# GitHub Actions verify #271 수정

- 실행: https://github.com/jkw2686/bohumso/actions/runs/40080321725
- 대상: ae23a61d61ee8277ccdbf835538ec1b0ccbb5de5. 원격 실제 로그 확인: npm ci/build 성공, test 220개 중218통과/2실패/skip0.
- copy-guards.test.mjs: 이미 간소화된 문의 완료 문구와 이전 고정 문자열 불일치. 현재 완료+답변경로를 정확히 검사하고 실패 안내 검사도 유지/추가.
- expert-phone-connection.test.mjs: 현재시간+29시간으로 만든 구 예약 슬롯이 실행시각에 따라 23시 이후로 이동해 invalid_slot. 미래 KST 날짜10시로 명시. 23:30 거부 검사 추가. 권한·연락처·중복·기존 방문예약 검사 유지.
- 제품 코드/DB/권한 변경 없음. 테스트 삭제/skip/오류무시 없음.
- 로컬 Node24 WASM 메모리 오류는 CI의2개 assertion 실패와 별개. CI와 동일 Node22.23.4로 전체 npm test 실행. 최종 결과 후속 기록.

## 관리자 화면 배포
- code1de0c9a09e1bff8d71ce2a7455078047608ca59c, Netlify6adc773076ab551515fd09da ready.
- 운영 admin-home.css/assets/account.js HTTP200 및 검수본 일치.
- https://bohumso.netlify.app/admin
