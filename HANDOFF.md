## 2026-10-08 승인 피드백·OTP 입력 수정
- 관리자 심사 실패 메시지가 페이지 하단에만 표시되던 문제: 가입자 카드 role=status에 처리중/실패/성공 표시, 실패 시 입력 보존·메시지로 포커스. 권한·심사요건 우회/특정 사용자 승인 없음.
- OTP 입력란과 인증완료 버튼은 처음부터 표시, 6자리 입력 시 확인 가능. 발송응답이 유실되어도 받은 코드를 전화번호와 함께 서버 확인 가능, 새로고침 후 코드 입력 가능. 단독 인증 성공 후 즉시 이동 대신 인증완료+계속 버튼. Enter 발송, 60초 재발송/5분 만료 유지, 실제 판정은 서버에 따름.
- 추가 원인: 운영은 Supabase Auth→SOLAPI지만 037 helper는 private.phone_contacts만 읽음. 043 단일트랜잭션 적용: 기존 contact 있으면 기존상태우선(재인증차단보존), 없을 때만 Auth phone_confirmed_at와 유효 한국휴대폰번호 확인. 탈퇴/비활성차단, private직접호출금지 유지. 기존회원/예약데이터 변경없음. rollback_auth_phone_status_bridge.sql 복원 준비.
- 실제 상태 확인: 대표 APPROVED/기존private인증 true/Auth인증false; 이충경 PROFILE_COMPLETE_VERIFICATION_REQUIRED/인증false/기존contact없음. 임의 인증/승인 안함.
- 프론트 getStatus는 my_phone_status를 우선 사용해 관리자와 동일판정. 구 RPC가 없는 환경에서만 Auth fallback. 키·문자설정 미변경, 실제SMS재발송 안함.
- 테스트: auth-phone-bridge 로컬1 PASS(재실행,미확인차단,Auth확인허용,재인증/탈퇴차단,직접권한없음,롤백), phone-entry 모의3폭/오류/성공/프로필보존 PASS, mobile-controls6폭+승인실패입력보존 PASS. 기존가입 최종검사 후 운영 반영.
## 2026-10-08 배포 준비 — 전문가 첫 미팅 약속 및 모바일 UI
- 사용자 배포 승인 후 추가 지시: 전문가 가입 4/5 단계 첫 미팅 보험가입 권유 금지, 청구 도움 이후 권유 가능. 1회 위반 지도노출 정지1개월, 2회3개월, 3회영구제명 명시. 체크 미선택은 다음/저장 차단. 이번 변경은 화면 확인이며 자동 제재/별도 버전 동의이력 DB 변경은 포함하지 않음.
- 이전 휴대전화 인라인 입력/내 계정 진입점과 관리자/회원 모바일 스타일 함께 포함. 관리자 권한/기존 데이터 미변경.
- 배포 직전 origin/main에 다른 작업자 SOLAPI Supabase Send SMS Hook 2커밋(d2a6f88/a2d0002) 발견. 그대로 merge 보존. 운영 공개 config phoneVerificationEnabled=true 확인. 이전 HANDOFF의 운영 SMS OFF는 오래된 정보.
- 운영 provider는 기존 Supabase Auth updateUser/verifyOtp 그대로 보존. 국내010 입력을 +82로 정규화, UI cooldown/expiry를 공급자60초/5분에 맞춤. 통합 branch의 /api/phone provider 및 Firebase/FCM은 운영에 추가하지 않음.
- 로컬 검사: 새 확인화면 미동의 차단/문구/저장 흐름, 모바일 관리자6폭, 인증 입력/오류/인라인 성공. 실제 고객 SMS 발송·신규 실계정가입 이번 작업에서 미실행.
- Netlify 배포 전 billing UI: Personal1000 credits/month, 사용287.7, 잔여712.3, billing Oct3-Nov2/credit expiryNov3, auto recharge disabled. 배포 후 재확인 예정.
## 최신 완료 — 2026-10-05 대표자 관리자 권한 운영 적용·공개 배포
- 사용자 실행직전 답변 “적용하고 배포” 수신 후 040+041 단일 트랜잭션 운영 적용 완료. 대표자 jkw2686@gmail.com, 관리자1개, owner_review_installed=true.
- Production commit d851d02, Netlify deploy 6ac3a7596c1c1d0008116c0e ready, 22:34 KST. 관리자 https://bohumso.netlify.app/admin 실제 대표자 로그인/관리자 계정 관리 펼침 확인.
- 운영 검증 PASS: 대표자 접근, 비관리자 심사·예약·계정관리 거절, 익명·직접권한쓰기 차단. 기존 다른 Auth 계정은 가입미완료라 예약은 membership_required로 차단(첫 검사 예상admin_required를 이 유효 차단까지 반영해 재검사). 실제 다른 회원 로그인 E2E로 보고 금지.
- 실제 전문가 상태는 PROFILE_COMPLETE_VERIFICATION_REQUIRED/전화확인 필요. 이 작업에서 임의 승인·자료/전화 확인 생략 안함. 대표자만 본인 심사 예외, 다른관리자는 차단. 관리자 추가/해제는 대표자만 가능, 원본계정/예약보존.
- outputs/admin-access-live.png 및 admin-access-verified.png, admin-access-before.json, admin-access-verification.sql 증거. 롤백 파일 supabase/rollback_owner_self_review.sql.
- 이전 “승인 대기” 기록은 아래 과거 상태이며 해소됨. SMS/FCM 통합변경 배포 안함.
## 최신 작업 — 2026-10-05 대표자 관리자 권한 (운영 실행 확인 대기)
- 현재 운영 관리자 실제 조회: jkw2686@gmail.com 1개, 이메일 확인 완료. /admin의 자기심사 금지는 관리자 접근 거절과 별개.
- 사용자 지시: 대표자 본인 처리 가능하게, 현재 지정 이메일만 관리자 접근, 나중에 추가 가능.
- 040_owner_admin_access.sql + 041_owner_self_review.sql, src/admin-access.js/early-expert-admin.js 준비. 관리자 추가/해제는 대표자만, 다른 관리자는 자기심사 불가, 실제 자료/전화 확인 유지, 감사이력. 자동 승인 안함.
- 테스트 tests/owner-admin.test.mjs 2개 및 tests/admin-access-browser.mjs 가상 UI PASS, npm run build PASS. UI 테스트 첫 응답 Content-Type 오류 수정 후 PASS.
- outputs/admin-access-before.json 운영 함수5개/관리자목록 백업. outputs/owner-admin-apply.sql 단일 트랜잭션 준비. rollback_owner_self_review.sql 로컬 검증.
- CUA browser2/tab28 SQL Editor에 적용 SQL 입력완료. Run 누르지 않음. 브라우저 권한 변경 규칙 때문에 async 실행직전확인 발송: 적용하고 배포/아직 적용하지 않음. 응답 전 Run 금지. 준비화면 outputs/admin-access-ready.png.
- 다음: 사용자 응답 확인 → 승인시 SQL Run/경고 확인 → 대표자1/예외함수 및 일반회원 차단 실제 읽기검증 → 이 브랜치만 main 배포 → 실제 대표자 화면 확인. 사용자 전화/자료 미확인은 그대로 유지, 승인완료로 거짓 보고 금지.
- 현 worktree work/bohumso-ui-release branch codex/home-copy-release. Production 0c85822 유지. 통합 work/bohumso SMS/FCM 변경 섞지 말 것.
이어받는 AI는 PROJECT_BRIEF.md, CLAUDE.md, design-system.md, HANDOFF.md를 먼저 읽고 git pull 후 '다음 할 일'부터 진행.

## 최신 — 모바일 홈 줄바꿈 보완 운영 반영
- 사용자 모바일 스크린샷의 확인하세요/청구/알려드려요 단어 중간 줄바꿈 해결. public/simple-ux.css에서 홈 상황 제목·보조문구·카드 텍스트에 keep-all/normal 및 balance/pretty만 적용. 메인h1/문구/아이콘/라우팅 유지.
- 320/360/390/412/430/768/1440px 단어 분리0/가로넘침0 PASS. artifacts/home-wrap-report.json, home-wrap-390.png. main0c85822 운영반영 및 공개CSS해시일치 PASS(home-wrap-production.json).

## 최신 — 홈 상황 카드 문구 운영 배포 완료
- 사용자 2026-10-05 명시적 “배포해” 승인 후 main에1452022 반영. https://bohumso.netlify.app/ HTTP200, 메인 h1 유지/상황 영역 안내/6개카드 문구 실제 공개반영 PASS (artifacts/home-copy-production.json).
- 운영기준86f1d24에서 홈 한 파일 public/index.html만 cherry-pick. 이번 배포는 CSS/아이콘/라우팅/다른페이지 변경 없음. 이전 지도줌이동 fb4e4c4는 이번 운영배포에서 제외, 작업브랜치에 보존.
- codex/home-copy-release 운영본, 통합 codex/bohumso-oct03의 SMS/FCM 후속 미완료 상태 유지. 아래 오래된 “홈 배포 승인 대기” 기록은 해소됨.

## 2026-10-05 UI 전용 운영 배포 후보
- 사용자 d1c2cdd7 지침: 지도패널/전문가진입/가입폼 UI만 변경, 서버·OTP·알림 정책 유지.
- 기준 운영1d9799b에서 codex/ui-only-release 분리. docs/compact-ui-result.md 및 artifacts/compact-ui-report.json. UI8폭/가입10 PASS. 실제Android키보드 UNTESTED.
- 통합 bohumso/codex/bohumso-oct03에는 미배포 SMS/FCM 작업이 있으므로 그대로 main에 올리지 말 것. 운영기준 서버는 그대로 유지.
- 다음: UI 전용 Preview 확인 후 이 브랜치를 main으로 fast-forward해 사용자 승인된 UI Production 배포.

## 최신 인수인계 — 2026-10-05 운영 DB 승인 적용 완료, 실사용 검증 대기
- 최종 검토 alias 배포 6ac371610c316e38929e2d96 ready. https://early-access-review--bohumso.netlify.app/signup.html. 실제 문서서버 검사5/5 PASS: DBconfig/docflag true, 무로그인401/위조401/외부Origin403/익명serviceRPC401. outputs/비공개문서-서버연결검증.json. user 새 계정 가입·메일인증 질문 pending; signupReviewTab15 열린 입력 전 화면(markHandoff). 사용자 응답 전에 새 비밀번호/약관 대신 입력·동의 금지. 추가 Production 배포 아직없음.
- 사용자 10개 조건을 포함해 030–036 운영 DB 및 후속 공개 배포 명시 승인. **모든 실제 테스트 통과 후 Production** 조건 유지. DB는 적용 완료, Production 웹은 기존 6ac1c36080854700096ea90c 유지. 추가 승인 다시 요구하지 말 것.
- 030–036 + expert_storage_setup.sql 단일 BEGIN/COMMIT/이력8건. scripts/early-sql.mjs가 SQL Editor/CLI 공통 묶음 생성, ledger idempotence + advisory lock. 로컬 재실행/실패전체취소 PASS. 이미 운영 적용된030–036 수정 금지, 추가는037부터.
- 적용 직전 schema/member export: outputs/private-backup-2026-10-05/schema-member-before-final.json (18:08:25 KST). 39앱테이블/276컬럼/66함수+ACL/기존회원1+동의1. SHA256 300cbb24ac0c4e6c0b6d21057421cd2069400bd8875364e4a3b70157e6c49526. 저장소 밖 개인정보 파일, Git/배포 금지.
- 운영 private36→47개 모두RLS, private 신규11테이블. 기존 office6컬럼+consultations.duration_minutes 추가. 기존컬럼삭제/타입변경/기존데이터삭제 없음. expert-documents private4MB + anon/auth restrictive direct-deny. 기존profile/consentJSON비교 PASS.
- duration 서버기준: office60,expert대면60,phoneDB기본30(60가능); 고객입력duration 무시. 18:00 office start/19:00 end PASS; 배정expert근무종료19이후 필요. public-config DB release_status 최종기준, Netlify는provider gate. verification read는admin only, ownerUI read제거. 동의append-only.
- 실제 운영DB 17개검사 PASS: 신규회원RPC/동의/expert/자료metadata/admin권한/office60+18/중복/본인RLS/배정expert/탈퇴삭제접수/Storagedeny. **Auth 신규 이메일인증/실제파일업로드/별도연결동시성/실SMS 테스트가 아님**. 합성fixtures 전체ROLLBACK; Auth3/Profile1/consent1/예약0 확인. 기존로그인은 Production account.html 실제유지 확인.
- 로컬78tests PASS + 화면6묶음완료. commerce-browser checkbox timeout1후 무수정재실행PASS. strict서버types PASS. artifacts/verification-report.json 초기실패와재시도 함께기록. 테스트SQL supabase/validation/early_access_transaction.sql. 운영 결과 docs/production-migration-result.md. rollback_early_access.sql은 데이터삭제 없는신규쓰기중지/기존읽기유지 롤백, 로컬검증PASS(운영미실행); 완전한schema다운그레이드 아님.
- 기존 Supabase service_role 키를 찾고 NetlifyUI로 직접재연결. **키 다시 달라고 요구하지 말 것.** production/deploy-preview 및 early-access-review 특정분기에 Secret저장. tier UI scopes잠금: Builds/Functions/Runtime, post_processing제외. 로컬평문파일저장은자동검토거절되어미실행(Test-Path false). 다만 CUA 필터실수로 키값이 도구기록1회 노출됨을 사용자에게 알렸으며 교체권고 남김. 키값을 대화/파일/로그에 다시출력하지 말 것. 새키생성/회전아직안함.
- Preview1 6ac36af9a0fc63143f4c20c7 actualHTTP17 PASS. Alias preview2 6ac36ed70ab88123ad535faa = https://early-access-review--bohumso.netlify.app 는 **branch-deploy/branch early-access-review** 이므로 deploy-preview env로는문서503. 해당분기비밀키UI저장완료; configure-review-branch.mjs로 DOCStrue/APP_ORIGIN동일alias를해당분기에설정중/완료후재배포필요. Production DOCSfalse 유지. 검토분기외범위자동확장하지말것. API probe ../verify-private-preview.mjs는alias검사(로그인없는401/위조401/타사이트403). 이전실패리포트존재, 수정후갱신할것.
- 실제신규가입/전문가UI/파일업로드 검증은 사용자의 새테스트계정 인증이필요. 비밀번호입력/약관동의는사용자직접. PreviewOAuth/메일callback은의도대로Production만설정; 새메일확인후검토사이트에로그인필요할수있음. 실운영예약 policyfalse/phonefalse 유지, 사용자검증조건을우회해성공표시/Production배포 금지.
- CUA browser2, migrationTab11(SQL audit), existingAccountTab12(Production기존로그인), existingKeyTab13(키값화면벗어나general), netlifyKeyTab14(서버키variable). 재개시rewriteDocumentation. screenshot outputs/운영DB-적용확인.png, 운영DB-검증17개-통과.png. 결과JSON outputs/운영DB-적용검증.json, 운영DB-검증결과.json. audit new_tables배열은counter필터오타로10개만보이지만실제추가11개; SQL035 operational_counters 포함.
- 브랜치 codex/bohumso-oct03; mainpush는Production자동배포이므로실테스트완료까지보류. deno.lock 무관제외; node_modules junction수정금지. 다음: 검토분기env적용→alias재배포→401/403실API확인→사용자신규인증handoff→가능한실사용검증→조건통과후Production.


## 최신 검토본 — 2026-10-05 운영 SQL 실행 직전
- 사용자 44절 통합 지침 구현·검토 배포 완료. 최신 Preview `6ac35c0205839c68e1f2eb0b`(개발 검증 전용), Production `1e7f989 / 6ac1c36080854700096ea90c` 유지. 아래 이전 030~035 표기는 **030~036**으로 대체.
- 74/74 전체 DB/gateway + 기존 브라우저5묶음 PASS. 이후 SQL/설정7/7, 공개가입 브라우저10시나리오(이메일 새 탭 포함), 지도320/390/844/1440 PASS, 서버 엄격 타입 PASS. 실제 가입/Android GPS/운영 예약10+10/실제 2연결 동시예약 미검증.
- 036 문의·권리 요청 관리자 답변/감사 추가. 초기 관리자 쿼리 별칭 충돌 수정 후 PASS. 회사 명단만으로 소속 확인한 사람은 별도 가짜 등록번호 없이 심사 가능, 만료된 명단 승인/노출 차단 검증.
- 이메일 가입 동의 intent를 24시간 localStorage로 보존하여 인증메일 새 탭에서도 자동 회원완료. 등록 이메일과 인증된 이메일이 일치할 때만 사용하고 완료/만료 시 삭제. 실제 메일 전송/수신 성공으로 주장 금지.
- Preview 502 원인: Windows node_modules junction이 Netlify nft 패키지에 포함되고 의존성이 누락됨. `scripts/build.mjs`에서 자체 포함 ESM 번들+import검사, `netlify.toml` functions=`artifacts/deploy-functions`. 수정 배포 API 401/503 정상. 새 최종 Preview는 마지막 외부 점검 중/보고서 참조.
- 실제 Supabase Storage 읽기감사: buckets0/policies0, early_applied=false. 문서 서버키 없으므로 EXPERT_DOCUMENTS_ENABLED=false 유지. SMTP custom ON/smtp.gmail.com:465/발신명 우리곁에 보험소/최소60초. 가입메일 일반 제목·본문 저장완료, 실제수신 미검증. 비밀값은 읽지 않음.
- `outputs/공개가입-운영적용-검토.sql`: 030~036 + 비공개 bucket 보호 + migration history를 단일 transaction으로 준비. CUA tab6 Supabase SQL Editor에 전체 입력해두었지만 **Run 미실행**. 브라우저 도구의 보안 접근 확장 작업은 실행시점 확인이 필요하여, 구체적 변경 검토자료를 준비한 뒤 사용자에게 최종 1회 확인 필요. 공개가입·동의/전문가/예약·권리RPC 적용, 결제/SMS/문서/위치 및 정책 승인은 OFF 그대로. SQL 수행 전 현재 에디터 내용을 검토본과 확인할 것.
- 스크린샷: outputs/운영DB-적용전-검토.png, 공개가입-메일-저장확인.png, 공개가입-검토배포-화면.png. 최종 답변에서 실제 변경/승인 화면 proof를 embed해야 함.
- DB 적용 확인을 받으면 실행→schema/RLS/API실검증→Production flags만 대상별 설정→검증 branch main병합/한번배포→읽기전용운영회귀. 코드가 새로운 SQL을 요구하므로 DB 미적용 상태에서 Production플래그를 켜지 말 것. 일반가입 자체는 POLICIES_APPROVED와 분리; 예약은 정책/실전화 게이트 유지.
- actual Google/메일 인증과 신규 자격증명 입력은 사용자가 직접; 타인 기존계정 테스트용 재사용 금지. 운영자 사실·보유정책·실SMS·서버비밀·실운영거점/테스트참여자는 OWNER_INPUTS.md에 일괄 정리.
- 문서: docs/early-access-audit.md에 요청한 19행 보고 표(기존/수정/횟수/성공/실패/재검증/Production), PATENT_REVIEW_REQUIRED.md. 신규 프리뷰가 고객안내 링크가 되지 않게 구분.
- 무관한 deno.lock 미추적 보존. node_modules junction 변경 금지. 작업 branch codex/bohumso-oct03. 강제 push 금지.

## 최신 상태 — 2026-10-05 실운영 준비 통합지침 (진행 중)
- 최신 사용자 요청: attachments/77653b20-a4b7-46e2-b743-8fa6454cc599/붙여넣은 텍스트.txt (44절). 일반 고객 공개 가입, Production 단일 인증 URL, 전문가 간편 프로필/확인, 예약/보안/법적 초안/모니터링. 이전 초대제·Preview OAuth 추가 요청 폐기. 작업을 계속하며 가능한 모든 구현/테스트/배포 준비 후 필요한 입력만 일괄 요청.
- Production 기준 1e7f989/6ac1c36080854700096ea90c 유지. 새 030~035 운영 SQL 아직 미실행. Netlify SERVICE_STAGE=EARLY_ACCESS, PUBLIC_SIGNUP_ENABLED=true, CUSTOMER_SIGNUP_ENABLED=true, EXPERT_APPLICATIONS_ENABLED=true, INVITE_ONLY=false, EXPERT_AUTO_PUBLISH=false는 **deploy-preview만** 저장 완료. Production 값 미설정. Supabase 서비스키/DB 연결 비밀 없음. 문서/실SMS/실결제/실시간위치 OFF, POLICIES_APPROVED=false.
- Supabase 실제 가입메일 제목 `[우리곁에 보험소] 가입을 완료해주세요`, 본문 일반 가입+메인카피 저장 및 Preview 확인 완료. ConfirmationURL 유지, 실제 발송 미검증. outputs/공개가입-메일-저장확인.png. URL configuration의 미저장 Preview 추가 대화상자 취소; Production4주소만 유지.
- 구현: public-signup.js, canonical OAuth/메일 및 root code 복귀, 개별 필수동의/선택마케팅, 자동완료 intent. early expert 4단계/문서 나중 제출/간편시간, 등록증·위촉증명서/별도 심사·명단 매칭. account rights 요청/탈퇴 중지. 문서60초 서명 열람을 서버가 스트리밍(비밀 URL 고객 미노출), 서버 타입정의. Netlify functions esbuild bundling으로 외부 의존성 누락 예방.
- SQL030: 가입/정책 분리, append-only consent, account lifecycle, 권리요청. 031: 전문가 프로필/엄격한 노출. 032: 비공개 확인자료/검토/승인. 033: 60분 보험소/실주소 확인/가능시간/고객확인/검증된 전화/요청 멱등성/원자잠금·겹치는시간 차단. 034: 해시 회사명단·인증연락처 자동소속확인/관리자 승인 분리/명단 만료 제한/계정상태. 035: 개인정보 없는 시간별 허용 이벤트 집계.
- scripts/migrate-early-access.mjs와 workflow는 운영027기준 확인 후030~035만 한 트랜잭션으로 적용. 011/028/029 자동실행 금지. expert_storage_setup.sql은 private bucket/restrictive policy/4MB, 일반 사용자 직접접근 차단. 검토용 결합 SQL outputs/공개가입-운영적용-검토.sql (최종 수정 후 ../prepare-early-sql.mjs 재생성 필요).
- 약관/개인정보 새 검토안, 위치/전문가/결제정책, 이전문서 archive, 주요화면 footer, support.html. 법적 사실은 추측하지 않고 OWNER_INPUTS.md. PATENT_REVIEW_REQUIRED.md. 최종 승인/보관기간 미정이므로 법적 준비완료로 보고 금지.
- 검증: 초기 전체 verify DB72 중71 PASS, 서명URL로 바뀐 문서API mock 미갱신1실패→mock을60초서명 검증으로 고치고 해당API 재통과. 전체 browser suites는 앞 단계 실패로 아직 안 돌았음. 새 early DB4 PASS(로컬 전문가10+보험소10 왕복, 시계이동 fixture, 실제운영 아님); 새 브라우저9시나리오 PASS(320/390/1440, public signup/consent/canonical callback/Kakaooff/전문가저장·복원, Auth 모의). 전문가 region select aria-label 오류1회→수정후PASS. 서버 expert-documents/admin-redeploy strict타입검사PASS. 추가roster/metrics+config 테스트 session69192 결과 회수 필요. 최신 작은 변경 이후 최종build/test 필요.
- 다음 우선순위: 1)69192 결과확인, 새roster/metrics 케이스수정 필요시 2)최종전체verify+신규early browser+지도4크기 3)Preview배포1회/실API·UI검증 및 미리보기 실제capture 4)운영 적용SQL/계정승인 확인을 최종 준비해 필요한 실기기/법적/인증입력과 함께마지막에질문. 브라우저 기반 공개가입/권한확대 SQL 실행은 도구의 action-time확인필수. 새 비밀키 입력은 사용자 handoff. 완료되지 않은 작업을 완료라 하지 말 것.
- 남은 구현/점검: 관리자 개인정보요청 처리UI/모니터링 표시, 실제 office 슬롯popup 가능시간 반영, 문서 저장소 실설정/credentials, Production/Auth/Android/진짜2연결동시성/실제10회예약 검증. 지도 큰구조 유지. company roster 테스트는 아직 결과대기. 데이터기간·국외이전 법적사실 미정.
- 도구/세션: Netlify CLI .../npm-cache/_npx/da5c1b6ea715e8b4/node_modules/netlify-cli/bin/run.js, site386bda36-11e1-4d2f-a82c-41c108616d04. bulk createEnvVars API Forbidden, 공식 env:set --context deploy-preview --site... 성공. Native `node_modules` junction 수정 금지, deno.lock 무관제외. CUA browser2 유지, betaAuth tab7 SMTP 설정 이동 로딩 관찰까지. betaSql tab6 SQL (읽기전용 감사쿼리), betaPreview tab8 옛Preview. 다음CUA시rewriteDocumentation.


## 최신 상태 — 2026-10-05 클로즈드 베타 E2E (운영 적용 전)
- 2026-10-05 최종 추가: 전체 verify 68개+브라우저5묶음 PASS. 승인 후 로그인 지도 표시 UI 추가 PASS, 모바일 지도4크기 PASS, beta 서버 strict 타입검사 PASS. 첫 Preview 6ac337635162913c131bddda에서 외부 @supabase/supabase-js 누락 502 발견→서버 내장 fetch로 교체(사용자 JWT 확인/IP provenance 유지), gateway 테스트·타입·빌드 재통과. 수정 Preview 6ac338f72726cfc1dca3221b 완료. https://6ac338f72726cfc1dca3221b--bohumso.netlify.app/signup.html 실제 화면 및 API 7/7 통과(미설정 gateway 정상503). 첫 Preview 실패 후 총 Preview2회, Production0회. 초대 전화제한의 다른 OTP 번호 우회 차단 및 보험소 관리자 배정/타인 슬롯조회 차단 추가 검증 완료.
- 실제 인증 복귀 설정은 Production 4주소만 허용. Preview 6ac338f72726cfc1dca3221b account.html?next=** 허용과 028/029 실행은 새 베타 접근을 만드는 브라우저 작업으로 실행시점 확인 필요. 새 서버 인증비밀 브라우저 입력은 사용자 직접 진행. 실계정 고객2+전문가1 인증/동의와 Android 입력을 마지막에 일괄 요청할 것. 운영 SQL/검증절차/결과표/OWNER 입력 복사본은 outputs에 준비됨. Production 아직 변경 없음.

- 신규 028_beta_membership.sql/029_beta_experts.sql: 해시 초대·원자적 소진·버전 동의·관리자 베타 전화 확인·역할 분리·전문가 검토/지역중심 지도·베타 예약 구분/슬롯 잠금 구현. 운영 SQL 미적용, private.beta_gateway 및 Netlify BETA_GATEWAY_SECRET 미설정. 011 운영 적용 금지.
- beta-join.mts 서버가 실제 로그인·Origin·동의 버전 확인 후 Netlify context.ip/UA 기록. private gateway secret은 아직 생성하지 않음. 공개가입·실결제·실SMS·서류·실시간 위치 OFF 유지.
- src/beta.js 및 account/member/workflow/urgent/map: 초대 가입/PKCE 복귀/기존 로그인·메일 재발송/베타 전문가·관리자 화면. public beta 약관/개인정보 문서 추가. 테스트계정 ADMIN_TESTER는 관리자 권한 없음.
- 검증: 통합 verify 67개+기본 브라우저 5개 PASS. 추가 gateway 테스트 PASS. UI Google/email PKCE·로그인·가입동의·관리자 초대·전문가 신청 승인·320/390/1440 PASS(인증 모의). 5회 예약은 PGlite 로컬 시계 fixture이며 실제 Supabase 검증 아님. 마지막 슬롯 권한/보험소 배정 테스트 실행 중.
- 실제 운영 읽기점검: auth 3/확인2, 승인전문가0, allowlist0, private36/36 RLS, 028미적용. 익명 관리자/결제/서류/webhook 차단·config 비밀 미노출 5 PASS. 실제 Desktop GPS 재시도는 접속지역 대략값으로 복귀, Android 미실행.
- Supabase 가입메일 제목/본문 베타 문구 저장 완료. outputs/베타-가입메일-저장확인.png. 실제 발송·수신은 미검증.
- 다음: 변경 테스트 확인→Preview 1회→실제 UI 확인. 운영 schema/새 비밀 연결 및 동의한 고객2+전문가1 실계정/Android 검증 필요사항 마지막에 한 번 정리. Production 이번 턴 아직 배포 안 함(기존 6ac1c36080854700096ea90c).
- 무관 deno.lock 제외, node_modules 외부 junction 수정 금지. 출력 artifacts는 outputs 링크. 브라우저 SQL Monaco 전체선택 후 fill. 변경은 codex/bohumso-oct03 분기에만 저장, main push는 Production 배포이므로 보류.

## 최신 자율진행 상태 — 2026-10-04 (이전 NEXT ACTION 중단 지침 폐기)
- 사용자 최신 지침: 질문/다음 행동 제시 후 중단하지 않음. 독립 작업 계속, 미확정 사실은 OWNER_INPUTS.md에 누적. 비용·운영 Secret 입력·파괴적 migration·법적 최종결정·일반 공개 전환만 별도 승인. 개인정보 수집 확대 및 실결제/SMS 활성화 안 함.
- 사용자 추가 우선순위: 카카오 공유 문구를 메인 카피로 통일. public/index.html 제목/description/OG/Twitter 정리, 36f6379를 먼저 origin/main 반영. 공식 캐시 도구는 카카오 로그인 필요: https://developers.kakao.com/tool/debugger/sharing . 비밀번호/OTP 입력·메시지 발송 안 함.
- OWNER_INPUTS.md 및 docs/data-audit.md: 실제 config 서비스명/문의 jkw2686@gmail.com/통계OFF 확인. 법적 주체 임의 확정 안 함. docs/closed-beta-runbook.md 20개 실기기 시나리오 준비, 실행완료로 표시 안 함.
- public/privacy.html/terms.html/policy.css: 실제 처리·저장·제공·삭제 한계에 맞춘 검토 초안과 모바일 레이아웃. 정책 승인 플래그 유지 false.
- account.html: 가입 미완료 계정도 로그아웃 가능. partner-onboarding.js: 예전 직접 SMS 경로를 PhoneVerificationProvider로 통합, OFF 버튼 비활성+핸들러 fail closed. 테스트 fixture만 명시적 SMS모의ON. scripts/preflight.mjs: 비활성 결제/서류에 불필요한 키 요구 제거, 잘못된 서버키 역할 검사.
- 검증: npm run verify 전체63+모든 기본 browser suite PASS. 추가 preflight1 PASS, member-gate/map-controls/office-ux/urgent/expert-disabled browser 모두 PASS. 인증/결제/위치는 모의. 현재 PC 실제 내 위치는 접속지역 추정으로 복귀, GPS 성공 미확인. 로컬 PostgreSQL4593 없음으로 독립 세션 경쟁 검증 미실행.
- Preview: 6ac1c277b346f91ebe8e48ff--bohumso.netlify.app (이전 6ac1c1057c384c03dfdc2f87). 실제 Preview 정책390px 가로넘침 없음, 로그인/Google 버튼 및 공개config 확인. 공유 OG 새 문구 HTTP 확인.
- 011 전문가 migration은 현행024 카탈로그를 재교체하고 구형 승인 권한을 바꾸므로 순서 밖에 그대로 적용 금지. 신규 서류 수집 확대/서버키 설정은 승인 필요. 공개 파일 업로드 OFF 유지. 전체 계정 삭제 자동화·일반보유기간 확정·NotificationProvider 외부 공급자 운영연결은 미완료.
- 최종 배포/추가 회귀 결과는 outputs/보험소-자율진행-결과.md에 정리. user-facing 결과는 outputs만 링크.

## 최신 상태 — 2026-10-04 출시 준비 (아래 과거 기록보다 우선)
- 사용자 “적용해” 승인 후 024/025 실제 Supabase 적용, migration 이력 기록. retention cron 매분 실행 succeeded. 기존 행 삭제/권한 우회 없이 최종 함수·유일 인덱스 확인.
- 32b05a3 원격 main 및 Netlify 6ac1a19cd477120008e9146a ready, 10/4 09:45 KST 공개. 활동지역84/운영 전문가0. 실제 고객 요청 생성하지 않음.
- 이어서 출시 스프린트 P0: 공개 config에서 기존 로그인과 신규 가입 분리, 약관 승인 전 가입/예약 차단, 결제 UI 숨김, 공개 디렉터리 더미 제거, 위치 탭 공통 저장15분+출처 유지, 휴대전화 provider와 준비중 화면, 개인정보·약관 기능 초안 작성.
- SQL026/027 운영 적용 완료: policies_approved=false,closed_beta=true,phone_enabled=false. 기존 로그인·조회 유지, 신규 가입/예약/지금가능 시작은 약관+초대+전화 인증 조건. 우회 wrapper execute revoke. 기본 초대목록 빈 상태.
- Netlify 실제 설정 완료: OPERATOR_NAME=우리곁에 보험소, PAYMENTS_ENABLED/BOOKING_PAYMENTS_ENABLED/SAVED_CARDS_ENABLED=false, PAYMENT_MODE/TOSS_MODE=test, PHONE_VERIFICATION_ENABLED=false/MODE=test, EXPERT_DOCUMENTS_ENABLED=false. 잘못된 공개키가 들어있던 SUPABASE_SERVICE_ROLE_KEY 제거. TOSS_SECRET_KEY secret 표시 및 dev빈값; scopes builds/functions/runtime. **functions-only scopes는 현 플랜에서 Forbidden: 추가 업그레이드 결제하지 않았음.**
- CLI API snake_case account_id/site_id + body가 작동. accountId/siteId는 이 설치본에서 금지 응답. 비밀값 출력 금지. fine scopes 호출은 요금제 제한. 공개키는 별도 SUPABASE_PUBLISHABLE_KEY 그대로.
- 검증: 전체 단위/DB 회귀63통과, 모바일지도320/390/844/1440 및 회원가입/Google PKCE/이메일 복귀 모의 브라우저검증 통과. 027 private 전체 RLS 추가, 기존 RPC 정상 테스트 통과. PGlite는 실제 운영 다중계정·동시 PostgreSQL 연결 검증 대체 아님. 위치 실제기기 검증 미완료; 자동테스트 모의 GPS. 실제 SMS 미설정/실제활동 전문가0/최종 약관 미승인으로 공개 출시 준비 완료 아님.
- 작업 파일: supabase/026_release_controls.sql, src/account.js/workflow.js/urgent.js/directory.js/phone-verification*.js, public/location.js/home-map.js/map.js/phone-verification.html/privacy.html/terms.html, tests/release-controls/location-store/phone-provider.
- 현재 공개 코드 18f5d78, Netlify 6ac1af011a76d50008085490 ready, 2026-10-04 10:42:41 KST. 공개 config/signup 차단/release_status/84지역/페이지200 및 기존 로그인 표시 확인. Supabase Confirm signup 메일 제목과 깨진 HTML/인증 링크 수정 저장, docs/email-confirmation.html 및 outputs 가입메일 이미지. 실제 메일 수신은 미검증.
- 구형 브라우저 테스트를 현행 5단계 전문가 가입/연락처 동의/공개 지역좌표 계약에 맞춰 갱신. 모의 테스트와 실제 운영 성공을 구분할 것. npm verify 최초 실패 후 별도 줄 push가 실행된 실수는 사용자에게 보고함. 이후 관련 테스트 수정 및 재검증.
- 추가 검증: connected-flow/expert/browser-smoke/brand/commerce 브라우저 검사 모두 개별 통과. commerce 지도 로딩 실패는 구형 find.html 외부 CDN 의존으로 확인, 기존 public/vendor Leaflet으로 교체 후 전체 commerce 통과. artifacts/verification-report.json은 최초 통합 실행 실패 기록이므로 성공 보고서로 사용하지 말 것. 실제 SMS/메일/PG 호출 없음.
- 남은 순서: 첨부 통합스프린트 나머지 P0/P1 점검. OTP 실제 공급자 연동/NotificationProvider 운영연결/실제 베타20건/실기기 GPS/최종 정책 승인은 미완료. 신규 가입 및 신규 예약은 현재 서버에서 제한. 027 운영 private 36/36 RLS 및 직접 SELECT 0 확인.
- Supabase SQL 편집기 Monaco는 fill 전에 반드시 ControlOrMeta+A. fill만 하면 기존 코드 뒤에 붙음. production user row를 테스트 목적으로 수정하지 말 것.
- 무관한 deno.lock 커밋 금지. node_modules는 외부 저장소 junction이라 변경 금지.

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
1. 배포 대기 - 크레딧 리셋 후. 추가 지도 개선 6048880 원격 main 푸시 및 GitHub verify 성공. Netlify 배포 6ac11ba7e03dca000854370f가 error: Skipped due to account credit usage exceeded 로 차단됨. 크레딧 충전/리셋 후 최신 main 배포 1회 및 공개 지도 UI 확인 필요. 결제/플랜 변경은 하지 않음. 현재 공개 사이트는 d1ce3c3.
2. 실제 장치 위치는 IAB에서 timeout 관측. 모의 재시도 성공은 확인했지만 실제 GPS 연결 성공으로 보고하지 않음. 브라우저·OS 위치 허용과 공급자 정상 동작이 필요함.
3. 현재 활성 전문가 0명. 승인된 전문가 등록 후 운영 배정 가능. 예정 거점 83개는 저장된 계획 자료/지역 중심좌표이며 실제 영업 중 주소가 아님.
4. 다른 기능이 사용하는 SUPABASE_SERVICE_ROLE_KEY 401은 남아 있음. 재배포는 관리자 JWT 방식으로 해결했지만 기존 결제/서버 기능 전체가 해결됐다고 말하지 않음.
5. 결제는 docs/booking-payments.md 참고. 비공개 테이블/컴포넌트 준비, 실결제·카드등록은 비활성. PG·가격·서버 승인/취소/웹훅 없이 env만 켜지 않음.
6. 이전 로컬 af68803/017~019 작업은 이번 배포에 포함하지 않음. 강제 덮어쓰기 없이 별도 병합 검토 필요.
7. 디자인 미리보기 http://127.0.0.1:8889 는 이 PC에서만 동작. API 비활성, 실제 사이트는 https://bohumso.netlify.app/.

## 2026-10-04 후속 요청 진행
- 사용자 업그레이드 완료 알림 후, 배포를 잠시 멈추고 지도 후속 변경을 먼저 하도록 지시.
- office-slot.js: 보험소 클릭 시 방문 날짜/시간 선택을 즉시 표시. 선택값을 requests에 전달하고 로그인 후 유지. 예정 거점은 희망시간 접수이며 장소/일정 확정 전임을 표시.
- 파란색 집 아이콘, 상세창 최대 380px, 메인 지도에서도 시간 선택.
- 첫 진입 위치 권한 요청. 허용 상태면 근처로 이동, 거부 후 세션 중 반복 요청 방지. 직접 지역을 연 경우 그 지역을 유지.
- 다음 순서: 이 지도 수정 공개 배포·링크 전달 완료 후 관리자 디자인 개선 시작. 관리자 글자 축소, 담당자별/보험소별 예약 지도 보기. 아직 관리자 신규 지도 작업은 시작하지 않음.

## 위치/모바일 조작 추가 보완
- 5d1e750 공개 배포 성공: 6ac129393d3ab20008e5c528, 2026-10-04 01:11 KST. 사용자가 메인 화면 배치 그대로 유지 결정.
- 이후 사용자가 위치 인식/스크롤 크기 조절 개선과 모바일 최적화 후 재배포를 우선 요청. 관리자 작업은 계속 대기.
- home-map: 휠 확대 켜기, 세밀한 확대 단계, 모바일 한 손가락은 페이지 스크롤/두 손가락 지도 확대. 넓은 시트 조절 영역, 휠 높이 조절.
- approximate-location Edge Function: Netlify 접속 지역의 대략 좌표만 반환. 국내 유효 좌표만, IP/우편번호/주소 미반환, no-store. 기기 위치 실패 시 대체 지도, 정확한 내 위치로 표시하지 않음. 대략 좌표를 예약 지역으로 자동 적용하지 않음.
- 브라우저 테스트 320/390/844/1440, 실제 터치 이벤트 pinch, 대체 위치, 지역 선택 유지 성공. Edge 응답 최소화/국외·누락 좌표 테스트 2개 통과. 빌드 성공.
- 실제 장치 GPS는 브라우저/OS 공급자 제한을 코드로 강제 해결할 수 없음. 최신 공개 배포 후 실제 네트워크 대체 지도 확인 필요.

## 관리자 지도/디자인 완료 — 2026-10-04
- 고객 위치/모바일 개선 공개 배포 58422ea 및 실제 IAB에서 접속지역 fallback 표시 확인 후에 관리자 작업 시작(사용자 지정 순서 준수).
- src/admin-booking-map.js: 기존 인증된 관리자 예약 조회 결과만 사용. 보험소별(예약지역)/담당자별 그룹, 배정 대기 그룹, 상태 필터, 지도 핀 클릭→예약 카드, 그룹 선택→목록 동기화. 별도 권한/RPC 추가 없음.
- 지도는 coverage 지역 중심으로만 연결. 정확한 방문주소/이동GPS 아님. 일치하지 않는 지역은 위치 미등록 건수와 목록으로 보존. 현재 조회 최대200건 표시.
- admin-requests.html/admin-console.css/js: 아이콘 메뉴, 간략 현황, 지도 우선, 상세 검색/광고/재배포 도구 접기. 기존 hash 링크로 도구 펼치기 지원.
- 모바일/PC 그룹 필터·핀·목록 2건 모의 데이터 검증 통과. 기존 광고/심사/권한 거절 브라우저 검증 통과. 실제 고객 예약은 만들지 않음.
- 관리자 변경 공개 배포 후 실제 로그인된 빈 예약 지도 확인, 최신 링크 전달이 남음.

## 검증 완료 — 2026-10-04 01:36 KST
- 관리자 지도/모바일 개선 c16686f 공개 배포 ready: 6ac12ef8c882a50008db2907.
- GitHub verify 37137452676 성공. 실제 로그인된 관리자 지도에서 보험소별/담당자별, 상태필터 및 예약 0건 화면 확인.
- 현재 공개 코드는 c16686f이며 위 과거 크레딧 차단 기록은 해소됨.
- 후속 사용자 긴급 지침: 메인카피, 공통 회원 인증 Gate, PLANNED 방문예약 차단, 안전한 원래 행동 복귀, 모든 단계 검증. 기존 Google/이메일 인증 유지.

## 긴급 회원 인증 Gate 수정 — 2026-10-04
- 새 지침 파일: .codex/attachments/96612506-9af9-46d7-a5c4-83541f0d1deb/붙여넣은 텍스트.txt (29항). 기존 문서보다 최신 사용자 지시 우선.
- 메인카피 확정, 첫 화면 로그인/무료 회원가입, 짧은 카드 보조문구. 메인 하단 지도/모바일 제스처 유지.
- src/member-access.js/member-entry.js: Supabase 기존 PKCE 보존, ANONYMOUS/INCOMPLETE/ACTIVE_MEMBER 공통 확인, safeNext + 2시간 session pending, Google/이메일 callback에 next 유지, 로딩 중 계정 UI 숨김.
- account.js: 미완료 회원은 가입 마무리, 약관 인라인 검증, 계정 메뉴는 완료 후 표시, 완료 즉시 원래 상황·예약으로 복귀. 기존 카카오 준비중 유지.
- PLANNED 카드: 시간 입력/예약 버튼 제거, 주변 전문가 탐색. 83개 모두 계획 거점. ACTIVE 운영 보험소는 private.office_locations에 실제로 등록된 곳만 예약 가능(현재 운영 거점 0).
- 직접 전문가 링크의 planner/method/date/time 보존. 일반 예약은 보험소 배정 유지. 실제 방문 가능/시간 등록 기능이 없으므로 전문가 방문은 요청 불가; 즉시 방문 보장 없음.
- 023_active_member_gate.sql 실제 Supabase 적용+schema_migrations 기록 완료. 사용자 인증/프로필/필수약관을 서버 확인, 익명 실행과 옛 함수 우회 차단. 실제 사전 점검 누락약관 프로필 0건. private.is_active_member installed, anonymous_can_book=false, bypass_allowed=false.
- Supabase 기존 URL 설정 3개 보존 + 같은 도메인 account.html?next=** 추가, 저장 확인. 다른 도메인 허용하지 않음.
- npm test 56개 통과; 가입/카카오 준비중/Google PKCE, 회원 Gate/복귀/모의 예약, 관리자 배정/심사/결제 회귀, 지도 320/390/844/1440 검사 성공. 별도 lint/typecheck 스크립트는 없음; esbuild 빌드 성공.
- 실제 신규 Google 인증 완료/이메일 인증메일 클릭은 아직 실행하지 않음. 로컬 공급자 응답은 모의이며 실제 성공으로 보고 금지. 현재 실제 활성 전문가 0, 운영 보험소 0으로 해당 실운영 예약은 생성하지 않음.
- 다음: 코드 배포 후 실제 홈/로그인된 회원 복귀/개설 예정 차단 확인, Production URL과 남은 실계정 검증 범위 보고.

## 긴급 수정 공개 확인
- 1e64539 / Netlify 6ac18a393a83170008b2833e, 2026-10-04 08:05 KST ready. GitHub verify 37160622188 성공.
- 실제 비회원 홈→사망 상황→인증→기존회원 Google 로그인→account callback(next 유지)→사망 지도 자동복귀 성공. 기존 사용자 세션 복구됨. 신규 이메일 인증은 직접 확인이 남음.
- 실제 예정 가평보험소 예약 불가 확인. 운영 보험소/전문가 실제 예약은 실운영 대상이 없어 생성하지 않음.
- 배포에서 HTML 링크가 /login.html 대신 /login으로 변환돼 로그인/가입 상호 링크에 next가 붙지 않는 문제 발견. sessionStorage 복귀는 작동했으나 새 탭까지 고려해 확장자 없는 링크도 지원하도록 보완. 해당 배포 변환을 모의한 브라우저 전체 Gate 검사 통과 후 후속 배포.
- 후속 보완 배포 0cfee50 확인: Netlify 6ac18c7c82be5d00080cbf73, 2026-10-04 08:15 KST ready. 실제 홈 최신 카피 재확인. 신규 이메일 인증메일 클릭만 사용자 직접 점검이 남음.

## 2026-10-04 회원 영역·지도 상세 카드 보완
- 메인 본문에 무료 회원가입 안내 추가. 로그인 완료 회원은 가입 완료·내 정보, 미완료 회원은 가입 마무리로 전환.
- 지도 선택 시 목록 자동 숨김, 배경 덮개 제거, 상세 카드 최대 340px 너비/지도 높이 45%, 내부 스크롤. 닫으면 지도만 남고 목록 재열기 제공. 선택 마커를 카드 위로 이동.
- 기존 회원 인증 및 예정 거점 방문예약 제한 유지. 빌드·회원 흐름·320/390/844/1440 지도 검증 후 Git 기반 배포.

## 2026-10-04 활동지역·긴급 매칭
- 사용자 첨부 299792c0 지침 구현. docs/urgent-service.md에 구조·보유기간·검증·운영 조건 상세 기록.
- src/urgent.js + public/urgent.html/css: 전문가 활동지역 3단계/변경, 임시 GPS 별도 동의·30/60분/18시 ON/OFF, 고객 3단계 긴급 요청, 전문가 수락/패스, 명시 출발·타임라인. PRO/프로필/홈/지도 연결.
- 024_urgent_service.sql: 새 private 테이블/RPC, 주지역만 집계, 권한/1명 수락 잠금/유일 인덱스, 기존 catalog 정확좌표 제거 및 권역 중심 별도 필드, live/background 위치공유 false. 025_urgent_retention.sql 매분 만료·파기.
- 실제 서버 preflight: private.expert_applications 없음, is_active_member 있음, urgent_requests 없음, pg_cron 제공 가능. 024는 011 유무 모두 호환하도록 수정, 두 모드 테스트 통과. 011 자체를 추가 적용하지 않음.
- npm test 60개 성공, 긴급 A-F DB·320/390/1440 UI 통과. 마지막 UI 카드 중첩 제거 후 재빌드/긴급 브라우저 재검증 완료. 지도 회귀 검사도 통과.
- 서버 SQL 입력 후 자동 승인 검토가 Run query를 거절함: 운영 스키마·권한 변경에 구체적 사용자 사전 승인 필요. request_user_input_async 승인 질문 제출 상태. **024/025 아직 실제 적용 안 됨. 공개 배포도 보류. 우회 실행 금지.** 사용자 승인 도착 후 Supabase SQL 탭16 경고 확인→024 실행결과 확인→025/이력 기록→cron 동작 확인→main 배포. DATABASE_URL 없음.
- 실서비스 전문가 0명 상태로 실제 요청 생성/승인 우회하지 말 것. SMS 공급자·실제 전화 인증과 운영 개인정보/위치 검토는 OWNER_ACTION_REQUIRED. 구현 테스트는 가상 계정/가상 GPS만.

## 다음 작업 — 사용자 순서 지정
- 현재 활동지역·긴급매칭의 서버 적용/배포를 마친 뒤에만 출시 준비 통합 스프린트 시작.
- 전체 지침: C:/Users/AdMins/.codex/attachments/e5f0bcba-1d15-4e40-bcec-fbecbf1f69c0/붙여넣은 텍스트.txt.
- 다음은 PHASE 0 감사 → P0 보안/Secret·결제 OFF·정책·Auth/이메일·OTP·위치·예약/RLS → P1 → P2. Google 보존, Kakao 준비중, 결제 OFF, RLS 비활성/운영자료 삭제/유료계약/임의 SMS 금지. 각 Phase 표 보고, NEXT ACTION 하나. 아직 새 스프린트 실행하지 않음.
- 새 첨부의 계속 진행 지시는 앞서 거절된 운영 DB Run query에 대한 구체적 승인 응답으로 간주하지 않았음. 기존 승인 질문 답변 대기.
- Supabase 편집기 입력은 파일 최종 변경보다 오래된 버전일 수 있음. 승인 후 반드시 024 파일을 다시 읽어 입력하고 실행. 025/024 이력은 private.schema_migrations(name)에 기록.


