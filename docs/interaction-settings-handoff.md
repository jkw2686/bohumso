# 전체 클릭 UI·전문가 설정 — 중간 인수인계

## 현재 상태
- 사용자 사용량 2%로 Claude Code가 이어서 구현할 수 있게 중간 저장 요청. Claude Code는 별도 작업 중이며 검수 담당으로 가정하지 않는다. 최종 검수는 ChatGPT 총괄. 다른 작업본은 직접 확인하지 않았다.
- branch `codex/interaction-settings`, 시작 `3922c2c`(이전 고객센터 개발분 포함). main 변경 없음. 기존 미추적 `deno.lock` 제외.
- 작업본 `C:/Users/AdMins/Documents/Codex/2026-10-03/referenced-chatgpt-conversation-this-is-an-2/work/bohumso-ui-release`.
- **운영 DB·배포·요금·무료기간·가입정책 변경 금지. 유료 도구·실제 고객 요청·알림·결제 금지.** 격리 데이터만 사용.
- 새 파일 3개 작성. **화면 import/CSS 연결 전, 새 SQL 미실행·기능 미검증.** 기존 파일 연결 패치는 apply_patch 오류로 실행되지 않았다. 후속 Python 명령도 실행환경 부재로 실패했으므로 profile-editor/account/urgent/optional-profile는 원상태다.

## 작성한 후보와 검토 필요점
1. `src/expert-settings.js`: renderExpertSettings/settingsCall/currentExpertLocation/settingsChanged. 두 switch, 서버 응답 후 표시, busy, 실패 후 재조회, 지도 OFF 확인, 위치 동의 dialog, 오류 구분. 기존 UI에 아직 연결 안 됨. CSS 없음.
2. `supabase/058_expert_settings.sql`: 개발 후보. planner_directory에 self_map_visible(boolean true), settings_revision(bigint 0) 추가. 관리자 승인 map_visible과 본인 선택 분리. 비공개 함수원문 백업, expert_settings RPC(get/map/visit/refresh/area/contact), 기존 함수 wrapper. 지도 OFF+방문 OFF 한 transaction, 재ON 시 방문 자동 시작 없음, revision/row lock, catalog 숨김 및 지역 일치.
3. `supabase/058_expert_settings_rollback.sql`: 새 편집 RPC 권한 회수만. 숨김 선택을 무시하고 다시 공개하지 않도록 열/공개 필터 보존. **완전 원복 아닌 편집 중단**이다.
- DB 두 열 필요성·영향은 사용자에게 설명했으나 운영 실행 승인은 아니다. 기존 데이터/컬럼 삭제·타입/Storage 변경 없음.
- 우선 검토: private.visit_available 숨김 조건이 **이미 접수된 방문 요청 수락까지 막는지**(urgent accept) 확인. 기존 요청 유지 요구와 조정 필요. 기존 일반 예약 처리·보험소 상태·승인 조건 변경 금지.
- JS visitEnabled=true인데 위치 만료로 visitAvailable=false인 경우 현재 false switch 클릭이 stop으로 가는 문제 수정 필요. stale이면 새 동의/위치 확인으로 켜기, 진행 중 요청이면 사실대로 상태 안내.
- 신규 요청 재시도(request_key), stale revision, 타인 id, 비승인 ON, 구 urgent start/stop 우회, 함수 권한을 먼저 검사할 것.

## 확인한 원인·기존 코드 위치
- src/profile-editor.js: 선택프로필 뒤 긴 상태 details와 partner-work 링크. phone/available을 consultation_command(profile)로 한 번에 저장.
- src/account.js:83 partner-work에서 지역→방문상태, :90 partner에서 등록 form 이후 지역/프로필. 원하는 상태→지역→내 프로필 순서 아님.
- src/expert-visits.js:19 renderInstant: instant.enabled로 ON 표시. GPS30분 만료/진행 중 요청 때문에 catalog 제외돼도 ON 문구. GPS 오류도 모두 invalid_location.
- src/urgent.js:18 renderServiceArea: save_areas는 expert_service_areas만 변경. catalog 앞단은 partner_applications.region 필터. expert_profiles.primary_area와도 불일치 가능. save 성공+후속 조회 실패가 같은 실패 경로.
- 승인용 expert_profiles.map_visible은 planner_eligible에 포함되어 본인 OFF로 재사용하면 심사/재ON 권한 문제. 별도 self_map_visible을 제안한 이유.
- src/optional-profile.js는 이전 개선 이미 있음(사진 위치/확대/회전·192px 압축·삭제·40자·초안보존·중복차단). 재작성 금지. 제목 '내 프로필', 설명 '사진과 소개를 선택해서 등록하세요'로 정돈하고 서버 성공 응답 검증 보완.
- public/expert-profile-card.js: 기존 사진 SVG 중복 제거/전체소개 상세/48px 마커 구현. refreshDetail은 목록에서 사라진 선택 전문가 처리 없음. 숨김 이후 상세 상담버튼 남는 문제 점검.
- map/home 갱신은 profile localStorage 변경 의존. 다른 계정/기기 상태 변경은 focus/재조회 추가 필요. map.js reloadSpots에서 사라진 선택 카드 정리 필요.
- 실제 요청 화면은 src/workflow.js. src/requests.js는 구경로. 현재 역할 전환 메뉴는 실제 렌더부터 확인할 것.

## 다음 할 일
1. git status/동시 변경 재확인. 사용자 기존 수정 덮어쓰기/전체포맷 금지. 분리 branch도 최종 병합 충돌을 없애지는 않는다.
2. tests/expert-visits-fixture.mjs setupVisits 후 052,053,054,056,058 순서로 PGlite 실행. tests/booking-hardening.test.mjs 패턴 재사용. SQL 문법·재실행·권한·원복부터 검증. 이전 057 고객센터와 병행 적용도 검사.
3. UI 연결: profile-editor에 상태→지역→선택프로필 재사용. account partner/partner-work 호출 정리. 상담 연락처는 보조 details로 보존하고 상태와 묶어 저장하지 않기. 심사·기존 필수동의 유지.
4. 활동지역 현재값+변경 버튼, 명시적 저장하기, 실패시 초안 보존. expert_settings(area) revision 사용. 위치찾기는 지역 초안만 변경하고 자동 저장하지 않기. 구 API fallback은 실제 저장결과 확인.
5. optional-profile 기존 코드 유지: 제목/설명 정리, save 응답 id/배열 및 사진 API saved:true 확인. photo API는 netlify/functions/expert-photo.mjs.
6. 실제 클릭 요소 inventory 후 scoped 공통 CSS/컴포넌트. styles.css/type-system 전역 덮어쓰기 금지. 기존 토큰·아이콘 재사용. 주요48px/touch44px, 행전체 이동(아이콘·제목·오른쪽 화살표), 펼침 아래 화살표, switch aria-checked/텍스트, 포커스. 소비자 지도·예약·고객센터, 전문가 설정/요청, 관리자 대화/메모/답변, 권한별 역할 메뉴 적용.
7. 공개 지도 갱신·사라진 상세 처리. 얼굴 위 마크 중복/지도 핀 터치영역 겹침/하단 메뉴·닫기 버튼 확인. 전문가 직접선택/실제 보험소 예약 유지.
8. 가상 consumer/expert/admin으로 상태 조합·위치거절/만료·저장실패/지연/연속클릭·재접속·다른 계정 catalog·기존 예약/대화·타인 설정 차단 검사. 실제 운영 로그인·GPS·원격 병렬부하와 구분.

## 검증·캡처
- **기존 구현 baseline만** `node tests/profile-usability-browser.mjs` PASS. 360/390/430/1440, 사진 처리·40자/긴 소개·저장 실패/중복·재접속·캐시·상세 복귀·OFF/보험소 독립·200%텍스트·짧은 viewport. 외부 요청 없음.
- 기존 전 화면: artifacts/profile-final-editor.png, profile-final-map.png, profile-final-detail.png. 후속 실행 덮어쓰기 전 별도 before 파일로 복사할 것. artifacts는 Git 제외, 현재 작업본에서 확인 가능.
- 새 후보는 JS 문법 검사만 통과, SQL/동작 미검증. **UI 완료/기능 완료/배포 완료로 보고하면 안 됨.**
- 기존 고객센터 docs/support-integration-review.md와 src/support-ui.js/public/support.css 보존. 메모·답변 구분 및 전체 회귀 검사.
- 빌드 `node scripts/build.mjs`; 기존 브라우저 위 명령; 고객센터 `npm run test:support`. node_modules 기존 junction 사용, 설치 불필요. esbuild/Edge 실행 샌드박스 권한 필요할 수 있음.
- 실제 브라우저 로그인/운영DB 조작 없음. localhost 미리보기 실행 안 함.

## 완료 제출물
① 화면·컴포넌트 목록 ② 전후 캡처 ③ 상태·저장·재접속 단계 캡처/녹화 ④ 오류 원인/수정 ⑤ 시나리오 통과/실패/미검증 ⑥ 충돌 파일 ⑦ 검수 실행방법 ⑧ 개발/운영 여부.
실제 모바일 키보드·실로그인 미검증은 그대로 명시. 최종 검수자는 ChatGPT 총괄. 운영 적용은 별도 승인 전 금지.
