# 현재 상태 — 예약 알림 조사 (2026-10-15)

요청은 읽기전용 추적·원인/최소수정안 보고. 코드수정·배포·예약생성·시험발송·읽음표시 없음.
운영코드1755c705, Netlify6ad02fbe202190f23dff6245 ready 유지.

완료: 실제 이메일회원과 관리자에서 같은 최신예약의 저장이력/대상전문가/상태 확인. 전화로그인 계정은 예약0·이메일계정은1 및 권한표시차이. 계정분리정황과 실제UUID대조는 구분.
정적+격리재현: src/workflow.js:92, src/appointment-care.js:100에서 부가기능disabled/missing/error면 기본알림 mount/query가0. 원래알림이 존재해도 숨김가능. 앱내예약알림 구현, 예약문자/카카오/웹푸시 미연결. SMS훅은Auth OTP만.

미확인: 운영알림행 생성, 수신자authUUID/대상전문가로그인동일성, 운영함수/trigger/부가기능상태응답. 관리자UI는 해당조회 미제공. 권한있는SELECT대조 필요; private.notifications 조회RPC inbox는 reminder flush를 실행하므로 순수읽기처럼 호출하지 않음.
최소안: 기본예약알림의 생성·소유권조회·화면을 부가약속정책과 분리. 부가UI만care게이트, 조회오류는명시적재시도. 중복키/수신자소유필터유지. 전화번호문자열로 자동계정병합/권한복사금지. 실제원인은DB대조후확정.

개인정보 포함 상세보고는 저장소밖 outputs/notification-audit/report.md. 다음읽기DB대조20~40분; 수정·배포는 아직안함. 기존UI/삼성링크·예약UX유지. 로컬재현명령 node ../../work/notification-gate-audit.mjs 성공(외부연결없음).
