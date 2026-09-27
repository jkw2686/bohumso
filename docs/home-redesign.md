# 현재 3195 홈 정리 — 2026-09-27

- 실제 대상: http://127.0.0.1:3195/ → public/test-flow.html → src/test-flow/ui.js의 home(). 별도 홈을 만들지 않았다.
- 수정 전 실제 DOM의 지도 요소 수는 0이었다. 높이·숨김·로딩 문제가 아니라 홈 함수가 지도를 렌더링하지 않았다.
- 기존 public/index.html의 map-platform/hero-pin SVG를 그대로 추출해 현재 홈 template에 재사용했다. 설명 카드와 장식 문구를 제거했다.
- 소개를 네이비 영역 하나로 통합하고 사용자가 지정한 제목·설명·상담 버튼·무료 안내만 배치했다.
- PROJECT_BRIEF.md 3·10항 및 기존 소비자 접수 로직과 대조: 소비자 상담 과금 없음, 보험 가입 의무 없음. 문구 유지.
- 기술 상태·가상 역할·계정 전환·관리자 링크는 기본 닫힌 개발 상태 패널로 이동했다. 인증/DB/결제 로직 및 운영 스위치는 변경하지 않았다.
- 소비자 주요 메뉴: 홈/전문가 찾기/내 신청. 전문가와 관리자 메뉴는 현재 역할에 맞게 표시한다. 메뉴 숨김은 권한 검증을 대체하지 않는다.
- 소개 아래에 같은 DB 디렉터리 컴포넌트를 재사용했다. 지역/직군/전문분야, 위치 사용, 마커, 서약 뱃지, 프로필, 상담 방식 선택을 연결했다.
- 하단은 실제 OpenStreetMap 도로 타일 지도다. 전문가 좌표·자격 상태는 테스트 데이터임을 유지했다. 상단 SVG 그림과 하단 지도는 별개다.
- 기존 public/map.html/map.js와 같은 Leaflet 1.9.4/OSM 방식을 사용한다. CDN 지연을 줄이기 위해 같은 라이브러리를 로컬 vendor에 보관하고 라이선스를 포함했다. 타일은 온라인 OSM에서 불러온다. 외부 타일 장애 시 안내와 목록 선택을 유지한다.
- 모바일 지도 높이 65dvh, 하단 카드 최대42dvh. 크기 변경 시 지도 재계산·마커 범위 재조정. 현재 화면에는 지도를 가리는 고정 하단 메뉴가 없다.

## 변경 파일
- public/test-flow.html — 개발 패널과 기존 SVG 템플릿.
- public/test-flow.css — 소개·지도·메뉴 반응형 레이아웃.
- src/test-flow/ui.js — 현재 홈 렌더링, 역할 메뉴, 공유 디렉터리와 필터.
- src/test-flow/map.js — 기존 Leaflet/OSM 표시 방식 재사용, 크기 변경/정리 처리.
- scripts/test-flow.mjs — vendor 정적 파일 제공만 추가; 인증/데이터/결제 처리 변경 없음.
- public/vendor/leaflet.js, public/vendor/leaflet.css, public/vendor/leaflet-LICENSE.txt — 기존 버전 로컬 보관.
- tests/home-layout-browser.mjs — 홈 레이아웃/접이식 패널/필터/상담 연결 검사.
- docs/home-redesign.md — 이 기록.

## 화면 캡처
- artifacts/home-before-desktop.png / home-before-mobile.png: 수정 전 실제 3195 화면.
- artifacts/home-after-desktop.png / home-after-mobile.png: 수정 후 전체 페이지. 소개·일러스트·하단 지도를 함께 포함.

공개 배포·공개 범위 변경·원격 DB 변경·실결제를 수행하지 않았다. 기존 통합 작업은 a11e024로 먼저 보관했다.

검증 결과: home-layout-browser(데스크톱/360px, 개발 패널 접힘, 소비자 메뉴, 필터, 프로필, 상담 연결) 통과. connected-flow-browser(소비자 신청/가입/심사/지도 노출/제재) 통과. 프로덕션 빌드 통과. 실제 3195 화면에서 OSM 타일 로딩 확인 후 전체 페이지 캡처.
