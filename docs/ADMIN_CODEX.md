# 관리자 화면 — Codex 담당 (2026-09-21)

Claude는 가입·인증·전문가 신청을 담당하고, Codex는 관리자 전용 화면을 담당합니다.

## 이 작업의 파일
- public/admin-requests.html
- public/admin-console.css
- public/admin-console.js
- tests/admin-console.cjs
- docs/ADMIN_CODEX.md

src/account.js, src/workflow.js, 가입/로그인/전문가 신청 파일, DB, 빌드 설정은 수정하지 않았습니다.
기존 admin.html 전문가 심사 화면으로 연결합니다. 해당 화면과 심사 API는 Claude 작업 범위로 유지합니다.

## 구현
- 기능별 네이비 사이드바, 모바일 접기/펼치기와 Escape 닫기.
- 현재 불러온 예약의 총수·완료 확인 대기·미처리 문의/분쟁·후기 검토 수.
- 기존 서버 필터 유지, 초기화, 완료 대기 빠른 필터.
- 현재 목록 내 텍스트/예약번호 검색과 전체/문의·분쟁/후기 탭, 빈 결과 안내.
- 광고 구독·환불·요금제와 프로필 확인은 기존 실제 기능에 연결.
- 신규 서버 호출, 인증 정보 복제, 저장소 접근, 가상 운영 수치 없음.

## 검증 범위
node tests/admin-console.cjs
관리자 화면의 가상 표시 데이터로 요약·필터·검색·빈 결과·360px 메뉴와 가로 넘침 검사.
이 검사는 실제 관리자 계정/원격 DB/결제 성공 검증이 아닙니다. 운영 화면은 기존 인증 및 관리자 권한 확인 후에만 내용을 표시합니다.
이미지: artifacts/admin-console-desktop.png, artifacts/admin-console-mobile.png (가상 데이터임을 화면에 표시).

## 연동 유의
공통 workflow에서 .booking-card, .request-status, data-booking-id 및 후기/문의 표기를 변경하면 관리자 집계·필터 연동도 함께 확인해야 합니다.
지표는 전체 DB가 아니라 서버 필터 적용 후 현재 로드된 최대 200건 기준입니다. 광고 금액과 실제 매출을 혼동하지 않습니다.
공개 배포는 하지 않았습니다. 정적 관리자 파일은 기존 빌드 결과와 함께 배포할 때 반영됩니다.

## 추가 요청: 관리자 재배포 버튼
위의 '신규 서버 호출/DB 없음'은 첫 화면 정리 작업에 한합니다. 사용자 후속 요청으로 아래 전용 기능을 추가했습니다.
- public/admin-deploy.js, netlify/functions/admin-redeploy.mts
- supabase/008_admin_deploy.sql (기존 DB 미적용)
- config/admin-deploy.env.example, docs/admin-redeploy.md, tests/admin-redeploy.test.mjs
- 기존 가입·공통 인증 파일은 수정하지 않음. 기존 세션을 읽고 서버에서 사용자/관리자 권한을 재검증.
- 신규 Function 빌드, 2개 서버/DB 테스트 및 관리자 UI 모의 검증 통과. 실제 배포/훅 호출 없음.
- Claude 측 적용 필요: 마이그레이션 이력에 맞게 008 적용, Netlify Build Hook과 Functions 환경 설정, 새 코드 최초 릴리스. 상세 docs/admin-redeploy.md 참조.
