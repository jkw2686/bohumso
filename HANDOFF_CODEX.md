# 현재 상태 — 체험사이트 예약 UX 적용 (2026-10-15)

사용자 요청: 비공개 체험사이트 전문가 선택·예약시간·내용 확인의 장점을 실제 보험소에 적용. 사용자 로그인 후 실제 화면 비교 완료. 체험 데이터나 운영 기준 변경은 포함하지 않음.

구현: src/office-request.js의 실제 전문가/보험소 예약에서 오전·오후 정각 버튼, 불가시간 취소선/설명, KST 표시, 별도 내용 확인과 일정 수정. public/requests-page.css에 범위한정 공통토큰 스타일. 최종 신청 전 요청0건, 기존 서버예약 검증·요청키·신청 후 조율·대상/지역 맥락 유지. DB/요금/권한/동의 불변.

성공: 빌드, booking-selection-browser4폭, booking-hours/hardening3개, claim-resources-browser, connection-review-browser(가상 가입/휴대폰/재시도/대상/보험소), service-ui-browser4폭 실제렌더와 가상예약/상태저장/관리. connection-review 구형18시 fixture는 현행17시로 수정.
전체 npm test 실행 중. 배포 최종 상태는 후속기록.

실제 고객 예약·SMS·개인정보 전송·청구 없음. 실단말 및 운영쓰기 미검수. 체험 전용 휴무·가짜 시간·무료/자격·후기·확정예약 표시는 적용하지 않음. 별도 즉시 전문가 방문요청 시간 정책 유지.

docs/booking-selection-20261015.md, HANDOFF.md와 ROADMAP 갱신. 배포 전 기준5173b27; 되돌리려면 이번예약UI커밋만 revert, SQL 불필요. 이전 통합UI/삼성화재 운영코드4209cdbe/배포6acfb55bb53f525693aed49d 유지.
남은 일: 실행중 전체검사 결과 확인→운영배포 확인·정적파일 대조→배포ID 기록/전후보고. 예상10~20분. 이후 실기기/실계정 쓰기 검수는 별도30~60분.
