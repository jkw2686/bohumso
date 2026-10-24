# 인수인계
이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 다음 할 일부터 진행.

## 2026-10-24 알림·고객센터 추가 간소화
- 알림 목록: 제목·KST 시간·예약 확인 버튼 중심, 본문/읽음 여부는 알림 내용에 접기. 전체 시간은 time datetime/title로 보존. 자동 읽음·발송·권한 변경 없음.
- 고객센터 새 문의: 간단한 질문·답변 안내·민감정보 주의사항, 세부 이용 안내만 접기. 문의 유형/개인정보 요청/보내기/초안/닫기 유지.
- 변경: src/booking-notifications.js, src/support-chat.js, public/calm-pages.css 및 기존 브라우저 검수2개. 계정/메뉴 기존 구조 확인, 불필요한 재구성 없음.
- 고객센터4폭/200%/초안보존/전송없음, 프로덕션 build 통과. 알림5폭/권한·로그인복귀·더보기·실패재시도 검사 진행. 운영 고객 데이터 조작·DB·요금·지도·예약 처리 변경 없음.
- 전후/검수 캡처 artifacts/notifications/before-detail-calm-390.png, list-390.png, artifacts/calm-pages/composer-390.png (격리 테스트).

다음: 알림 검수 통과 확인 후 기존 Git CD 배포, ready/운영 파일 대조. 기존 help6줄바꿈·outputs 보존.

- 최종 알림 검수 통과: 5폭, 상세 열기/접기, 10→20→25 더보기, 실패/지연 재시도, 본인예약 이동·포커스, 타인예약 차단, 로그인복귀, 읽음/예약생성 API 호출 없음.

## 운영 배포 완료
- code ae23a61d61ee8277ccdbf835538ec1b0ccbb5de5 / Netlify6adc73f2ca9bb7db16cbf473 ready / 2026-10-24T09:01:51.665Z.
- calm-pages.css HTTP200/로컬일치; assets/account.js 및 rights.js HTTP200/줄바꿈·chunk명 정규화 후 검수 빌드 일치. 압축 JS는 한글 이스케이프로 문자열 직접 검색 대신 전체파일 대조 사용.
- 구현·격리검수·운영파일 배포 확인 완료. 실제 문의 전송/예약생성/알림발송 없음. 모바일 캡처는 테스트 데이터. 다음 사용자 요청부터 진행.
