# 전문가 세부 설정 간소화 — 2026-10-24

## 변경
- 전문가 홈 사진·이름·프로필 보기 묶음을 본문 가운데 정렬. 본문 좌우 여백을 통일하고 사진/제목/설정 버튼의 클릭 영역 유지.
- 프로필·연락처: 별도의 편집 진입 버튼과 요약 카드를 제거한 단독 편집 모드. 저장 후 입력창 유지, 저장 버튼1개. 사진·소개·선택 정보 저장/실패/초안 보호 재사용.
- 활동지역: 주지역+추가지역2개를 한 화면에서 선택, 중복 지역 검증, 저장하기1개. 저장 실패 시 선택 유지.
- 상담시간: 분야2열/요일4열 선택 격자, 시작·종료시간 병렬. 중복 약속 문구·승인/신청 카드 제거, 기존 동의와 서버 저장 검증 유지.
- 등록정보 수정 화면 추가: 기존 등록폼과 저장 API 재사용. 자격 화면의 등록정보 수정 링크가 상담시간 화면으로 잘못 가던 경로 정정.
- 알림: 기존 compact 모드 재사용. 차단/미지원/꺼짐/기기연결 상태와 도움말·시험알림 기능 유지. 방문·위치: 상세 설명과 보조 조작을 안내 안에 정리.
- 구독: 기존 가격·결제 정책 유지. 결제 OFF일 때 안내/정책 표시, 기존 구독이용 화면은 상품·처리이력을 접음. 세무사에게 설계사 구독 적용 없음.
- 설정 목록 오른쪽 공개연락처/알림 현재 상태 표시. 기존 메뉴의 해시 링크를 해당 설정 경로로 복원. 보험소 운영자 경로 보존.

## 검증
- expert-home-browser: 기존9개 설정화면 × 360/390/430/1440px; 최종 격자/등록정보 화면4폭 재검사 통과. 홈 사진 묶음 가운데 정렬 계산 검증.
- 프로필·연락처 실패 시 입력유지/저장후 새로고침, 활동지역 저장·새로고침, 상담시간 저장, 상품 열람 시 주문 미생성, 뒤로가기 및 주요 설정200% 글자 통과.
- optional-profile-browser: 현행 짧은 카드/전체 프로필 구분으로 낡은 검사 수정. 320/390/1440px, 사진 추가/교체/삭제, 정사각썸네일, 새로고침, 기존 긴소개 보존 통과.
- notification-settings-browser:5폭, 알림OFF 확인/실패, 구독실패정리, 저장된 연결만 ready, 계정전환/로그아웃/권한차단/팝업중복 방지 통과. 모의 푸시이며 실제 휴대전화 발송 아님.
- 프로덕션 클라이언트·서버함수 build 통과. DB/권한/요금정책 변경 및 운영 설정 저장/예약 처리/자료업로드/과금/푸시발송 없음.

## 파일·화면
src/expert-home.js, optional-profile.js, public-contact.js, urgent.js, expert-visits.js, profession-onboarding.js, ad-subscription.js
public/expert-home.css, tests/expert-home-browser.mjs, tests/optional-profile-browser.mjs
- 전: artifacts/expert-settings-before-home.png, expert-settings-before-schedule.png
- 후(격리 모바일): artifacts/expert-home/home-390.png, detail-{screen}-390.png
- 운영 배포 결과는 HANDOFF 최신 항목 참고.

## 2026-10-24 14:25 KST — 세부 설정 간소화 배포 완료
- code3d01bb757a72a8cfd8fc43c7f801b3732eeab9f9 / Netlify6adc4150f3f63652b260e870 ready / 2026-10-24T05:25:52.264Z.
- 홈 프로필 가운데 정렬, 설정 단독 편집·저장1개, 상담 분야/요일 격자, 지역 한 화면, 알림/방문 설명 접기, 구독 기존 상품/이력 접기. 자격→등록정보 수정 경로 및 기존 해시 설정 링크 복원.
- 운영 홈/상담 설정 로그인 상태로 표시 확인. CSS/account빌드 내용 일치(줄바꿈/청크명 제외). 운영 설정 저장·예약처리·자료업로드·과금·푸시발송 없음. DB/권한/요금정책 변경 없음.
- 설정9화면4폭+등록정보/최종격자4폭, 주요 저장/실패입력/뒤로/200%, 프로필사진 전체·기존소개보존, 알림5폭 회귀, build 통과. docs/expert-settings-20261024.md 참고.
- 전후실화면 artifacts/expert-settings-{before,after}-{home,schedule}.png. 격리모바일 artifacts/expert-home/detail-*-390.png.
- 현재 요청 완료. 다음 요청부터 진행. PROJECT_BRIEF/CLAUDE/design-system/HANDOFF 먼저 읽기. 기존 생성 help6개 줄바꿈 변경은 포함하지 않음.
