# 내 계정·예약 알림·고객센터 간소화 — 2026-10-24

## 확인한 문제와 수정
- 내 계정: 다음 할 일 카드/예약 버튼/메뉴가 중복되고 기기 알림 설정이 첫 화면을 길게 차지함. 계정 정보 우선, 역할별 기존 주요 링크1개, 나머지 메뉴를 간단한 행으로 표시. 같은 목적지의 링크는 .html/pretty URL 모두 정규화해 중복 제거. 회원가입 동의·권한 판정·역할별 목적지는 보존.
- 계정 기기 설정은 접이식으로 분리하고 열 때만 읽기. 기존 #notificationSettings 직접 링크/해시 이동에서 자동 열림 보존. 예약 알림 화면에서는 기존 켜기 버튼을 계속 바로 제공.
- 예약 알림: 중복 예약 알림 제목/긴 읽음 안내를 정리. 최근/새 알림 요약, 새로고침, 알림10개씩 더보기. 원문·예약 링크·시각·읽음 상태를 유지하고, 읽음 처리 설명은 접이식 안내로 이동. 조회·열람·더보기·새로고침으로 예약이나 읽음 기록을 생성하지 않음.
- 고객센터: 1:1 문의가 주요 행동. 중복 문의내역 버튼 제거, 새로고침을 작은 도구로 정리. 긴 이용 안내/이메일 문의는 접어서 접근. 예약 변경·취소 경로 유지. 기존 대화·개인정보 열람/정정/삭제/탈퇴·신고 기능 보존.
- 실제 발견 오류: 기존 고객센터 전체화면 CSS가 대화창의 상위 support-layout까지 숨겨 입력창이 가려짐. 숨김 대상을 올바르게 제한해 해결.

## 검사
- notifications-browser:360/390/430/768/1440px, 10→20→25개 더보기, 조회 실패·시간초과·재시도, 소비자/전문가/방문 예약 링크·초점, 다른 계정 차단, 로그인 복귀, 자동 읽음·예약 생성 없음 통과.
- signup-routing-browser:가입 역할·4폭, 내 계정4폭, 알림 직접 링크/나중 로딩, 역할별 주요 링크1개, 필수동의, 비승인/비관리자 차단, 연결 실패 재시도 검증. 현행 화면에 맞춰 주요 행동1개 및 키보드 이동 검사 갱신.
- calm-support-layout-browser:360/390/430/1440px, 문의 버튼·대화 입력·닫기·초안 유지, 200% 글자, 가로넘침 없음 및 시험 전송 없음 통과.
- support-chat-browser:격리 DB의 고객/전문가/관리자 문의·전송 실패/재시도/응답 유실/중복 방지·운영자 답변·비공개 메모·다른 계정 거절·읽음커서·4폭·작은 화면/200%·익명 복귀 모두 통과. 낡은 관리자 오류 텍스트 중복 locator를 실제 권한 게이트로 명확히 지정.
- 프로덕션 클라이언트/서버 함수 build 통과. 테스트는 격리 데이터이며 운영 문의·예약·설정 저장/푸시발송/과금 없음. DB/권한/요금정책 변경 없음.

## 변경 파일
public/account.html, notifications.html, support.html, support.css, calm-pages.css
src/account.js, booking-notifications.js, member-rights.js, support-chat.js
관련 browser 테스트4개.

## 증거
- 전 운영 화면: artifacts/calm-pages/account-before-production.png
- 후 모의 화면: artifacts/account-calm-*.png, artifacts/notifications/list-*.png, artifacts/calm-pages/support-*.png
- 운영 배포 식별자와 게시 확인은 HANDOFF의 최신 항목 참고.

## 2026-10-24 14:41 KST — 계정·알림·고객센터 간소화 배포 완료
- codea8a89fdf03bb652a54b35e4b2cbfb586a687f18f, Netlify6adc4516daeba12ade17bcc8 ready, published2026-10-24T05:41:55.398Z.
- 내계정 중복 주요 버튼/대형 기기설정 정리, 알림10개씩 더보기·안내 접기, 고객센터 주요문의/이메일·안내 정리. 대화 입력창을 가리는 기존 상위숨김 CSS도 해결.
- notifications5폭/링크권한/실패재시도/10→20→25개/무변경조회, signup/account4폭·동의·권한·직접링크, support레이아웃4폭/초안/200%, support격리DB 전체 고객·전문가·관리자·전송실패/답변/읽음/권한·4폭·200%, build 통과.
- 운영 계정 로그인 화면에서 단일 주요 버튼/중복 관리자 링크 제거 확인. calm-pages.css/support.css/account/rights빌드 내용 일치(줄바꿈/청크명 제외).
- DB/권한/요금정책/운영예약·문의저장/과금·푸시발송 변경 없음. 실제 고객센터·휴대전화 발송을 시험한 것은 아님.
- 전후계정 artifacts/calm-pages/account-{before,after}-production.png; 모의 화면 artifacts/account-calm-*.png, notifications/list-*.png, calm-pages/support-*.png. docs/calm-pages-20261024.md 참고.
- 이번 3화면 정리 완료. 다음 요청부터. 기존 help6개 줄바꿈·테스트가 생성한 outputs/signup-entry-20261018/는 커밋 제외. PROJECT_BRIEF/CLAUDE/design-system/HANDOFF 먼저 확인.
