# 지도 패널·전문가 가입·가입 폼 UI 개선 검증

범위: UI 전용. 운영 기준 1d9799b의 서버/DB/알림/OTP/결제 설정 유지. 회원·예약 데이터 변경 없음.

| 항목 | 기존상태 | 수정내용 | Mobile 결과 | Desktop 결과 | Production 반영 |
|---|---|---|---|---|---|
| 지도 결과패널 | 큰 기본 패널 | 접힘/펼침/닫힘, 데스크톱 우측 패널 | 기본140px, 펼침 최대min(52dvh,520px) PASS | 1024px/1440px 노출72.2%/76.6% PASS | 배포 후 확인 |
| 빈 결과 | 중복 설명·CTA | 결과 문구와 시간 선택 CTA 하나 | 140px PASS |148px PASS|배포 후 확인|
| 전문가 참여 | 접힌 추가정보에 위치 | 데스크톱 헤더, 모바일 헤더 아래52px |첫화면 표시 PASS|아웃라인 버튼 PASS|배포 후 확인|
| 가입 구분 | 일반가입만 표시 | 일반/전문가 목적 선택, 동일 Auth 유지 |내부 next 보존 PASS|동일 PASS|배포 후 확인|
| 가입 입력 | 누적 여백 | 입력54px, 라벨16px/간격8px, 그룹24px |8개 폭 PASS|동일 PASS|배포 후 확인|
| 동의 | 넓고 불균일 | 행48px, 행간8px, 체크22px, 상세 모달 |필수만 동의해도 활성 PASS|약관 원문 표시 PASS|배포 후 확인|
| 하단 메뉴 | 지도/본문 겹침 우려 | 지도 별도 메뉴행, safe area 여백 |겹침 없음 PASS|겹침 없음 PASS|배포 후 확인|

## 세부
- 검사 폭: 320/360/390/412/430/768/1024/1440px. 브라우저 에뮬레이션.
- 데스크톱 패널 폭: 1024화면340px, 1440화면403.2px. 내용과 viewport에 맞게 높이 제한.
- 펼침 최대 min(52dvh,520px,map stage -16px), 빈 결과는 펼쳐도140px.
- 접힌 상태 결과/카운트/핵심CTA만 표시. 펼친 목록은 스크롤, 전문가 카드 최대2개 전문분야·지역·가능상태, 클릭하면 기존 예약시간 선택. 목록에 임의의 가장 빠른 시간은 만들지 않음; 확정 슬롯은 기존 상세에서 조회.
- 전문가 진입 /partner.html?roleIntent=expert → 비회원은 /signup.html?next=... → 기존 인증 → 전문가 등록. 기존회원은 기존 membership gate 후 등록화면. 고객은 원래 상황/예약 next 유지.
- 외부 next 차단 및 내부 allowlist 적용. Google/email 공급자·설정과 정책 변경 없음.
- 약관 상세보기는 체크박스를 변경하지 않으며 email/password 유지. fetch된 같은 사이트 약관을 텍스트로만 삽입, script/iframe 실행 없음.
- 제출 중 비활성 및 ‘가입 처리 중…’; 오류는 입력 아래 aria-describedby로 연결.
- 키보드: 가입/로그인/OTP는 고정 하단 메뉴 없음, 문서 스크롤과 입력 scroll-margin 유지. 실제 Android/iPhone 키보드/실기기 Smoke UNTESTED. 실제 테스트 계정 생성·SMS 전송 없음.
- 별도 TypeScript 설정/Type Check 명령 없음(N/A). JavaScript 문법 검사 및 esbuild 클라이언트/서버 빌드 PASS.
- tests/compact-ui-browser.mjs: 8폭 치수·overflow·접기/닫기·약관·입력 보존·필수/선택·목적복귀·전문가3명 fixture 목록/마커 PASS.
- tests/early-access-browser.mjs: 모의 Auth+로컬 DB 10개 가입/전문가 저장 시나리오 PASS. 실제 신규 인증 완료로 보고하지 않음.
- 통합 작업폴더에서 추가 확인: 로그인origin4, member-gate2, notifications-mobile20화면+알림 UI PASS.

## 배포 분리 근거
공개 운영 member.js/account.js가 1d9799b 원본 빌드와 SHA256까지 같음을 확인(artifacts/ui-production-baseline-proof.json). 통합 브랜치의 미배포 SMS/알림 기능을 운영에 함께 올리지 않기 위해 운영 기준 별도 codex/ui-only-release 사용. netlify/,supabase/,package 파일 diff 없음.

## 수정 파일
public/account.css, index.html, map.css, map.html, map.js, simple-ux.css, styles.css, ui-icons.js; src/member-access.js, member-entry.js, public-signup.js; tests/compact-ui-browser.mjs, early-access-browser.mjs. 통합 브랜치만 notifications-mobile.mjs의 기본 접힘 테스트 절차 수정.

## 배포
- 통합 미리보기: https://6ac3980e594bce5066d47954--bohumso.netlify.app/ (이전 미배포 기능 포함, 운영용 아님)
- UI 전용 최종 미리보기: https://6ac39a3bac03bd486e059419--bohumso.netlify.app/ (실제 가입화면 확인 PASS, 운영 OTP/알림/결제 상태 유지; documentsEnabled만 미리보기 환경값과 운영값 차이)
- Production: https://bohumso.netlify.app/ (배포 전)
- UI 롤백: 기존 운영 deploy6ac3759012706d0008f41df7 복원 또는 UI커밋 revert. DB 롤백 불필요.
