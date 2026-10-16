# 현재 상태 — 전문가 청구 도움 만화·애니메이션 운영 배포 완료 (2026-10-16)

이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 다음 할 일부터 진행.

## 최신 승인과 단계
사용자 최신 “배포해”가 이전 로컬한정/원격전송보류를 대체. GitHub main 반영 및 Netlify운영배포 완료.
- [x] 암진단 먼저완성 후 가족사망·입원수술·사고 확장. 네편대본/동일전문가 SVG실제16컷/HTML대사.
- [x] 각24초 사용자선택재생·고개/손동작·일시정지/재개/다시보기/정적복귀·종료정지/동작줄이기정적대체.
- [x] 공통3멘트/상황별문구복사·실패시선택대안/기존병원보험사검색연결/기관출처날짜보존.
- [x] build·검색2검사·신규4편360/390/430/768/1440/2배글자/동작/복사검사, 기존자료실/성장자료회귀 통과.
- [x] 운영배포 및 실제운영 IAB 재생/8초정지/정적복귀/가족사망390px/기존병원분류연결 확인.
- [ ] 실휴대전화 터치·스크린리더음성/운영자최종그림문구 평가 10~20분. 기관별최신본문일괄재검증없음.

## 파일·검사·되돌리기
상세 docs/claim-conversations-20261016.md. public/claim-conversations-data.js(대본), claim-conversation-art.js(SVG원화), claim-conversations.js/css(화면/동작), claim-resources.html/js(기존자료연결), partner-work.html/src/growth.js(진입). tests/claim-conversations-browser.mjs, tests/growth-browser.mjs.
검사 npm run build; node --test tests/claim-resource-search.test.mjs; node tests/claim-conversations-browser.mjs; node tests/claim-resources-browser.mjs; node tests/growth-browser.mjs. Windows 격리브라우저 실행 require_escalated 필요. 이번배포시코드변경없음. CI최신상태는DNS오류로미확인.
원복은이번대화콘텐츠/진입만되돌리고91기관원자료/지도/직접전문가선택/실제보험소예약/알림/DB보존. 카카오연결/새발송/시험예약/요금변경없음.

## 이전작업 미확인 — 이번 배포와 별개
이충경 예약98333c96-38da-491c-96e4-c93257e9f286 본인알림→정확예약·두Android실푸시확인은 사용자 내일하자로 보류. 재발송/원예약상태변경금지. 운영초기연결지연원인/현재관리SELECT/활성운영보험소 실대상 미확인. 출시준비완료 판정보류. 후속본인기기확인 10~20분+사용자가능시간 의존.
## 2026-10-16 운영 배포 완료
- 사용자 “배포해” 승인에 따라 GitHub main 79e6f6f3d22de1a63c8fa931714bacc5fc2fcf19 반영. Netlify 6ad19fcab160895569bbab96 ready, published_at 2026-10-16T03:53:59.398Z = 12:53:59 KST.
- 운영 https://bohumso.netlify.app/claim-resources.html#claimScripts / 고정 https://6ad19fcab160895569bbab96--bohumso.netlify.app/claim-resources.html#claimScripts
- 실제 운영 IAB 네 상황 선택·실제 4컷 원화/HTML대사·기본 정적 표시 확인. 재생 후2컷8초 일시정지·만화복귀 정상. 가족사망390px 화면 및 가로넘침없음 확인(문서폭375=scrollWidth375, 스크롤바 제외). 기존 병원찾기→병원분류 연결 확인, 91기관/기존확인정보 유지. viewport 원복.
- 증빙 outputs/claim-conversations/production.png, production-comic.png (작업폴더 내 저장소 밖).
- 이전 build/검색2검사/신규4편반응형·재생·동작줄이기·복사·기존자료실/성장 회귀검사 통과 결과 유지. 이번에는 코드수정 없이 동일 검수 코드를 배포. GitHub CI 최신상태 조회는 호스트 DNS오류로 미확인; Netlify빌드/공개 성공과 구분.
- 실휴대전화 터치·스크린리더 음성 미확인. 기관 공식본문을 이번에 일괄재검증하지 않음. 예약/알림 실제수신 미확인은 별도 기존과제 그대로이며 이번 배포로 해결 완료 처리하지 않음. DB·정책·요금·외부발송 변경 없음.

## 2026-10-16 배포 후 추가 운영 검수
사용자 계속 지시에 따라 같은 배포79e6f6f/6ad19fcab160895569bbab96 추가 검수. 가족사망·입원수술·사고 전환마다 실제figure4개/제목 정상. 보험사찾기→기존보험사39곳 선택상태 true 확인. 입원수술360x640에서 clientWidth345=scrollWidth345 가로넘침없음. 상황별 안내문구 clipboard 실제값과 성공표시 확인. 공통멘트 첫항목 성공표시는 보였으나 해당순간clipboard읽기는빈값으로 반환되어 운영공통멘트전체실복사 완료로 단정하지 않음(이전격리검사통과와구분). 이후공통멘트추가클릭/증빙저장 묶음호출은 자동승인검토시간초과로실행안됨; 상태조회/viewport원복 재시도성공. 실제기기/상대계정알림 검수 여전히미확인. 코드수정/새배포/예약/외부발송없음. 다음우선: 공통멘트 실제복사 재확인(5분), 사용자가능시 실휴대전화/이충경기존알림10~20분. 배포/출시완료와미확인구분유지.
