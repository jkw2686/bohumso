# 현재 상태 — 2026-10-15

UI 개선과 기존 삼성화재 링크 수정을 개발·검수·배포 완료했다.
코드4209cdbe682f475b2b9b1f40f1ac752c11506cf8, Netlify6acfb55bb53f525693aed49d ready (02:01:33 KST).
운영 https://bohumso.netlify.app
고정 배포 https://6acfb55bb53f525693aed49d--bohumso.netlify.app

공통 디자인 토큰/버튼/카드/입력/탭/일관 SVG, 홈 도움 순서, 관리자 예약 우선 구성, 프로필 상담 설정 busy/실패복구를 적용. 브랜드·지도·전문가 선택·보험소 예약·정책·권한·DB·설정 유지.
삼성화재 공식 필요서류 URL: https://www.samsungfire.com/v2/html/customer/13/G_030_010_010.html
원자료2026-10-10과 본문검수2026-10-14 구분 유지.

최종 GitHub verify38603056745 success. npm run build, service-ui-browser, profession-browser --ui-only, profile-usability-browser, claim-resources-browser, claim-help-browser, map-controls-browser 성공. 브라우저 tests는 tests/ 경로에서 node로 실행하며 필요한 격리 테스트 서버/fixture를 사용한다.
360/390/768/1440 레이아웃, 로그인→지도→전문가→가상예약과 상태 저장/실패복구 검수. 운영 홈 신규 메뉴·실제 지도, 자료실 삼성화재 새 창 본문과 원래 화면 유지 확인.

남은 미확인: 실기기, 실제 OAuth/SMS/GPS, 운영 예약/프로필 쓰기. 고객 개인정보·실제 청구/예약 실행 없음. 오래된 expert-profile-page-browser는 구형 DB fixture 실패이며 현행 전용 검사와 구분한다. 후속 실계정/실기기 검수 예상30~60분.
기존 지도 높이/데스크톱 고정 목록/상세50% 상한 유지. 062~065 다른 작업본이나 SQL을 임의 적용하지 말 것. 되돌릴 경우 UI 변경 전739a5d2와 삼성화재 독립커밋b9ff9f1을 비교하며 운영 DB를 되돌리지 말 것.
상세 docs/ui-design-20261015.md 및 HANDOFF.md. 문서 후속 커밋은 skip netlify/ci로 코드배포를 반복하지 않는다.
