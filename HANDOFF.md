이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 '다음 할 일'부터 진행.

# 인수인계 — 2026-10-03 초간편 UX

## 사용자 최신 결정
- 고객은 날짜·시간만 고르고 보험소 관리자가 전문가 배정. 고객에게 전문가를 먼저 추천/확인시키지 않음.
- 브랜드·Google 로그인·카카오 준비중·무료 상담/가격정책 유지.
- 모든 수정 후 공개 배포 및 관리자 재배포 버튼 해결을 명시적으로 승인함.

## 구현
- 홈 6개 상황 아이콘, 공통 홈/지도/예약/내 정보 메뉴.
- 기존 coverage 등록 83개 예정 거점을 지도에 연결, 가평보험소 등 짧은 이름, 가상 전문가 샘플 제거.
- 지도 모바일 목록/카드와 PC 좌측 목록, 위치 권한 오류/대략 위치 안내, 지역 수동 대체. 지역에서 바로 시간 선택 가능.
- 단계별 날짜·시간 예약, 입력 타이핑 0, 로그인 복귀 정보 유지, 중복 클릭 요청키.
- DB 020: 관리자 배정, 전문가 수락→확정, 거절→재배정 대기, 출발/도착 이벤트. 기존 직접요청 이력 유지.
- DB 021: 결제 프로필·수단·암호화 빌링키 비공개 준비 테이블. src/booking-payment.js는 준비 컴포넌트, 실결제 미연결. 기존 무료 정책 유지. BOOKING_PAYMENTS_ENABLED/SAVED_CARDS_ENABLED=false.
- 관리자 재배포 실패 원인: 기존 SUPABASE_SERVICE_ROLE_KEY로 인증 시 401. 022 및 handler 변경으로 관리자 JWT 권한으로 기록, 서버 빌드훅/10분 중복방지 유지. 다른 기능의 잘못된 서버키는 교체하지 않았음.
- SITE_NAME=bohumso 설정 추가. 기존 잘못된 이름 bohumso 변수는 보존.

## 실제 반영과 검증
- Supabase bohumso xyexphhspykwwlhfokfl SQL Editor에서 020/021/022 적용 성공. schema_migrations에도 해당 3개 기록.
- npm build 성공. DB/서버 전체 52개 검사 중 기존 테스트 fixture 2개가 구형 contact 동의 없이 호출하여 실패; 해당 fixture를 현행 동의/권한 흐름에 맞게 수정 후 관련 4개 모두 통과.
- office-ux-browser: 390/1440 화면, 가평 예정 거점, 위치 거절, 날짜·시간 신청, 관리자 배정, 전문가 수락, 이동 상태·타임라인 통과. mock 인증과 PGlite 테스트이며 실제 고객 예약 생성은 안 함.
- 스크린샷 artifacts/ux-*.png. 최신 기능 tests/office-allocation.test.mjs, tests/admin-redeploy.test.mjs.
- GitHub DATABASE_URL secret 없음. migrate 워크플로는 없을 때 명시적 warning으로 건너뜀. 현재 SQL은 수동 적용 완료. 향후 자동화는 연결 설정 필요.

## 작업 공간과 다른 작업 보존
- 작업 저장소: C:/Users/AdMins/Documents/Codex/2026-10-03/referenced-chatgpt-conversation-this-is-an-2/work/bohumso
- 원격 https://github.com/jkw2686/bohumso, 작업 분기 codex/bohumso-oct03, 시작 원격 00bbe86.
- 기존 C:/Users/AdMins/Documents/bohumso-netlify의 af68803과 미추적 문서는 변경하지 않음. 그 로컬 main에는 아직 원격에 없는 017~019 기반 작업이 있어 그대로 배포하면 안 됨. 차후 병합 검토 필요. 강제 reset/push 금지.
- clone의 main에는 원래 로컬 af68803도 가져와 보존. 이번 분기는 실제 공개 원격 기준.
- node_modules는 기존 저장소로의 junction. node_modules 수정하지 않음.

## 다음 할 일 / 멈춘 지점
1. 현재 진행 중: 최종 변경 커밋·원격 main 반영 후 Netlify 공개 빌드 확인.
2. 공개 홈/지도/예약 조회와 관리자 재배포 1회 확인. 반복 요청으로 크레딧 낭비 금지.
3. live 관리자 화면 실제 활성 전문가 0명이면 담당자 배정은 승인된 전문가가 생길 때 가능. 가상 전문가를 실운영자로 만들지 않음.
4. 내 위치 실제 정확도는 브라우저·OS 권한/장치 상태 의존. mock 성공·거절만으로 실제 GPS 검증 완료라고 말하지 않음.
5. 결제는 docs/booking-payments.md 참고. PG 가입/가격/서버 승인·취소·웹훅 구현 없이 env만 켜서 실결제 가능하다고 말하지 않음.
6. 최종 15항목 UX 보고와 클릭 수를 outputs에 저장하고 공개 주소 전달.
