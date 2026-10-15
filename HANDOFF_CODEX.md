# 현재 상태 — 관리자 SELECT 대조 완료 (2026-10-15)

사용자 요청의 예약저장·이벤트·알림·수신자UUID 관리SELECT와 최소변경안 확정 완료. 개인정보는 저장소밖 outputs/notification-audit/admin-select-conclusion.md 및증빙txt/sql에만 저장.

확정: 예약/이벤트저장정상, 기본알림트리거활성·전문가알림1건·수신UUID일치·미열람기록. 기본알림 생성이나잘못된수신자가원인아님. 운영 appointment_care(text,jsonb) 미설치인데 프런트가해당capability에 기본알림을묶어숨김. 알림에저장된notifications.html은실제404.
독립 public.notification_inbox(operation=list)는실제정의상SELECTonly(생성/flush없음), public.notification_reservation은당사자/관리자권한검사이며둘다authenticated EXECUTE=true. 정의검토만했으며이번감사에inbox를호출하지않음.
고객emailUUID와별도phoneUUID는다름. 전문가Google/phone는같은수신UUID. 자동병합/권한복사금지.

확정최소안(아직미구현): src/booking-notifications.js신규독립목록, public/notifications.html기존주소수용, src/account.js새화면연결, src/workflow.js부가기능과무관한목록mount/예약카드포커스. 기존renderCareInbox mount교체로중복방지. 기존독립RPC재사용하므로DB/권한/트리거/노쇼정책변경불필요. 기존알림재생성/재전송/일괄읽음불필요.

운영코드1755c705/배포6ad02fbe202190f23dff6245 유지. 이번작업은SELECT와문서만, 코드수정·배포·예약/알림생성/발송·읽음·계정병합 없음. 실행한행조회SQL/함수정의/권한/결과는저장소밖증빙확인. SQL편집기는기존관리세션으로접근. 환경값전체탐색은자동검토차단후중단하고공개프로젝트주소+관리SQL로완료.
다음: 사용자구현요청시위4파일·목록소유권/미설치/오류/기존링크/로그인복귀/4폭검수 약60~90분. DB쓰기/노쇼활성화/자동병합/발송금지유지.
