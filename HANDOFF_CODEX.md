# 현재 인수인계 — 별도 전체 메뉴 (2026-10-12)

PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽는다. 사용자 최신 직접 지시가 우선한다.

## 현재 상태
- codex/expert-navigation, 운영 main 1900e5d에서 격리. 별도 menu.html 구현·검수·배포 완료. 원격 main 23b885ba63e9271203464d897a82bdde4647c7eb.
- Netlify 6acc5a47f394f70008b11015, 2026-10-12 12:56:05 KST ready/published. https://bohumso.netlify.app/menu.html.
- 실제 사이트 현재 로그인은 일반 회원이어서 소비자 메뉴 확인. 360/390/430/1440px DOM 치수·색상·행64px 확인, 390px 화면 캡처 확인. 전문가·관리자는 격리 계정 검증이며 운영 로그인 미확인.
- 홈 새 문구 및 홈↔메뉴 실제 이동 확인. 운영 쓰기 없음. PC 전체 캡처는 도구 오류로 미확보, 로컬 PC 캡처는 있음. 브라우저 viewport 복원, 사용자용 메뉴 탭16 유지.
- 배포 후 인수인계 기록만 로컬 추가 보존. 원격에는 코드와 배포 직전 검수자료까지 반영됨.
- 하단 홈/지도/예약/고객센터 위치 유지, 마지막 탭만 메뉴로 연결. 기존 계정 페이지는 계정 설정으로 유지.
- 사용자 지정 회색·흰색·차분한 파랑은 .menu-page 범위. 기존 홈의 새 문구와 지도·예약 CSS 유지.
- 상세: docs/full-menu-20261012.md. 캡처/결과 docs/full-menu-screens. 기존 내 계정 본문은 그대로이고 별도 메뉴 화면을 추가한 것.
- 프로필·상담 설정 펼침/활동 지역/방문 설정/예약 요청 필터/성장 자료·실천은 기존 코드에 짧은 이동 연결만 추가. 저장 코드·DB·정책 변경 없음.

## 검증
- node scripts/build.mjs — 성공. 기존 node_modules 연결, 새 설치 없음.
- node --test --test-name-pattern='return path' tests/member-gate.test.mjs
- node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 tests/menu-browser.mjs --flows-only — 격리 DB 연결 검사 15항목 통과.
- --flows-only 제외하면 전체 화면 캡처도 수행. 360/390/430/1440, 360px 긴 이름·200% 본문, 48px 터치, 가로 넘침·탭 가림 없음. 색 대비 >=4.5:1.
- PC 검증 브라우저가 간헐 종료/캡처 실패해 화면과 이동 검증을 분리했다. 캡처 자체 실패는 기능 성공으로 표시하지 않았다.
- 미확인: 실제 휴대전화 키보드/OS 글자 확대, 운영 계정 저장. 격리 fixture의 전화 확인 RPC/구버전 예약 이력은 미지원으로 기존 실패 처리만 확인.

## 손대지 않은 것 / 충돌
- bohumso-fec525a의 codex/meeting-feedback, bohumso-ui-release, 기존 dirty 작업과 운영 DB 미적용 변경을 병합하지 않았다. Claude 작업을 직접 확인했다고 주장하지 않는다.
- home-copy 작업본 bcb0b5b 문서 커밋은 이번 반영에 포함하지 않는다.
- 공통 ui-icons.js 마지막 탭·아이콘만 변경. account.js/growth.js/workflow.js의 기존 기능과 충돌 가능성은 후속 병합 시 확인.
- 지도 공개 전용 스위치·보험소 관리·공지사항 목록은 현행 운영 코드에 없어 가짜 메뉴를 만들지 않았다. 새 기능이 필요하면 별도 범위.

## 다음 단계
1. 전문가 또는 관리자 세션이 있는 환경에서 운영 메뉴 추가 읽기 확인 (약 5~10분). 현재 일반 회원 세션의 역할을 임의로 바꾸지 않는다.
2. 실단말 키보드·접근성은 별도 20~30분. 이번 메뉴에는 입력 폼 없음.
3. 원복 기준 1900e5d. 이번 메뉴 커밋을 revert하여 Git 배포한다. 홈 새 문구 유지, DB 원복 없음.
