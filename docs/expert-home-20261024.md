# 전문가 홈 필수 간소화 — 2026-10-24

- 홈: 프로필/지도 표시·방문 가능/답변 대기·오늘 예약 요약/우선 예약1건/단일 예약 전체 보기/자료실·설정.
- 설정은 partner.html?screen=settings 목록, 항목별 query route로 별도 표시. 기존 저장 API·권한·예약 로직 재사용.
- 자격: 실제 VERIFIED 판정만 완료. 승인만 있고 실제 확인이 없는 계정은 완료로 가장하지 않음. 확인완료 자료는 제출자료 관리 안에 접음.
- 서류는 직군별 행+하단 제출1개, 동의 직접체크, 실패/부분성공 재시도 시 선택 유지·중복 저장 방지.
- 지도 표시: 075_expert_map_preferences.sql 운영 적용. 별도 self preference, 공개 catalog만 필터. 승인·방문가능·기존예약 불변. RLS=true, authenticated direct SELECT=false, anon toggle execute=false 확인.
- 검증: expert-home-browser 360/390/430/1440, 독립 토글 새로고침 유지, 승인/심사중/미제출, 세무사 메뉴 통과. 서류 batch browser 및 API2 통과. PGlite map preference/권한/재적용 통과. production build 통과.
- 전 화면: artifacts/expert-home-before-production.png. 후 모의 모바일: artifacts/expert-home/home-390.png.
- 실제 운영 예약·방문ON/OFF·위치 저장·자료 업로드는 검사에서 실행하지 않음.
- 사용자 요청으로 필수범위만 마무리. 설정별 긴 기존 안내 일부와 알림/구독의 기존 상세 화면은 유지. 모든 세부설정 개편을 완료한 것으로 보고하지 않음.
- 변경 파일: src/expert-home.js, account.js, expert-visits.js, profession-onboarding.js, early-documents.js; public/partner.html, expert-home.css; supabase/075_expert_map_preferences.sql; 관련 테스트3개.
