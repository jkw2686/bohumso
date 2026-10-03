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

## 2026-10-04 추가 개선과 배포
- d1ce3c3 원격 main/Netlify 공개 반영 완료. GitHub verify 전체 성공.
- 관리자 재배포 버튼 실제 요청 접수 및 새 공개 배포 성공: 6ac1175c4b6cad00089ef96b, 2026-10-03 14:55:35 UTC. 중복 실행하지 않음.
- 추가 사용자 요청: 목록 닫기 개선, 위치 재시도, 메인 하단 지도, 모바일 크기 조절.
- public/map.html/map.css/map.js: 목록 닫기/다시 열기, 큰 터치 버튼, 드래그 높이 조절, 카드 닫기, 키보드 Escape. 지도/하단 메뉴가 겹치지 않는 가변 높이 레이아웃. 위치 버튼은 상단으로 이동.
- public/home-map.js/index.html/simple-ux.css: 메인 하단 83개 예정 거점 지도, 핀/지역 연결, 지도 크게/작게, 확대/축소, 내 위치.
- public/location.js: 캐시/저전력 위치 6초→정밀 위치 20초 재시도, 콜백 없는 브라우저 감시, 권한 거절 안내. 선택한 지역은 늦은 위치 결과가 덮어쓰지 않음. 정확한 위치를 서버나 저장소에 별도 저장하지 않음.
- src/account.js: Netlify pretty URL /requests 로그인 복귀도 허용. 관리자 안내도 담당자 배정 방식으로 정리.
- npm run build 통과, tests/map-controls-browser.cjs에서 320×640/390×844/844×390/1440×900, 지도 확대/축소·닫기/복구·드래그, 위치 첫 실패→정밀 성공, 지역 선택 후 늦은 위치 무시 검증 통과.
- tests/office-ux-browser.cjs 기존 예약→관리자 배정→전문가 수락→이동 상태→타임라인 흐름 통과.

## 다음 할 일 / 알려진 제한
1. 추가 지도 개선분은 이 커밋으로 main에 푸시해 자동 공개 배포. 최종 배포 결과는 채팅 outputs/보험소-UX-작업보고.md에 기록.
2. 실제 장치 위치는 IAB에서 timeout 관측. 모의 재시도 성공은 확인했지만 실제 GPS 연결 성공으로 보고하지 않음. 브라우저·OS 위치 허용과 공급자 정상 동작이 필요함.
3. 현재 활성 전문가 0명. 승인된 전문가 등록 후 운영 배정 가능. 예정 거점 83개는 저장된 계획 자료/지역 중심좌표이며 실제 영업 중 주소가 아님.
4. 다른 기능이 사용하는 SUPABASE_SERVICE_ROLE_KEY 401은 남아 있음. 재배포는 관리자 JWT 방식으로 해결했지만 기존 결제/서버 기능 전체가 해결됐다고 말하지 않음.
5. 결제는 docs/booking-payments.md 참고. 비공개 테이블/컴포넌트 준비, 실결제·카드등록은 비활성. PG·가격·서버 승인/취소/웹훅 없이 env만 켜지 않음.
6. 이전 로컬 af68803/017~019 작업은 이번 배포에 포함하지 않음. 강제 덮어쓰기 없이 별도 병합 검토 필요.
7. 디자인 미리보기 http://127.0.0.1:8889 는 이 PC에서만 동작. API 비활성, 실제 사이트는 https://bohumso.netlify.app/.
