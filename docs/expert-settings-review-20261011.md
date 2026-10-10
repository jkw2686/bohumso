# 전문가 노출·방문 설정 — 총괄 검수자료

작성: Claude Code / 2026-10-11 · 브랜치 `codex/interaction-settings` · `204bed6` → **`cc5709c`**
**운영 미적용 · 미배포.** 운영 Supabase 실행 0건, 배포 0건, main 병합 0건, 알림·문자·결제 0건.
검증은 전부 격리 PGlite + 가상 소비자/전문가/관리자입니다.

---

## 1. 실제 발견한 원인

### A. 숨긴 전문가가 **이미 받은** 방문 요청을 수락하지 못함 (1차 1-a)

두 계층이 각각 '지금 방문 ON'을 요구하고 있었습니다. 058만 되돌려서는 해결되지 않습니다.

| 위치 | 조건 | 결과 |
|---|---|---|
| `058`(원안) `visit_available` | `self_map_visible` 추가 | 숨기면 수락 불가 |
| `046:126` accept | `visit_available(actor)` | 방문 ON + **위치 신선도**까지 요구 |
| `024:112-113` accept | `instant_availability.enabled and expires_at>now()` → 없으면 `expert_busy` | 방문 ON 요구 |

지도 OFF는 `instant_availability`를 끄므로, 세 조건이 연쇄로 걸려 수락이 막혔습니다.

**조치**: `visit_available`을 046 정의로 되돌리고, 숨김 검사는 `visit_catalog` 한 곳으로 옮겼습니다.
`046:97`이 신규 방문 요청의 대상을 `visit_catalog`로 검증하므로 **탐색과 신규 요청이 함께** 막힙니다.
accept는 058 계층에서 직접 처리합니다 — 적용 조건은 지시서 그대로
**OFFERED 보유 + `urgent_eligible` + 다른 진행 중 방문 없음 + 요청 자체 만료**이며,
지도 ON·방문 ON은 묻지 않습니다. 상태 전이 결과는 `024:114-116,130`과 같습니다
(`024:128`은 ACCEPTED에서 변화가 없어 생략).

### B. 위치 유효시간만 만료됐는데 스위치를 누르면 꺼짐 (1차 3-a)

`expert-settings.js`가 표시는 `visitAvailable`로, 클릭은 `visitEnabled`로 분기했습니다.
위치가 만료되면 `visitAvailable=false`(OFF로 보임)인데 `visitEnabled=true`라 클릭이 `stop`으로 갔습니다.
**조치**: 클릭도 `visitAvailable` 기준으로 통일했습니다. OFF로 보이면 언제나 동의·위치 확인으로 갑니다.

### C. 승인 대기인데 '숨길까요?' 확인창이 뜸 (1차 3-a)

`self_map_visible` 기본값이 `true`라 `mapEnabled=true`, 승인 전이라 `mapVisible=false`(OFF로 보임).
비활성 조건이 `!eligible && !mapEnabled`여서 이 조합을 비껴갔고, 클릭 시 `enabled=!mapEnabled=false`
→ 숨김 확인창이 떴습니다. **조치**: `!eligible`이면 항상 비활성 + '승인 후 지도에 표시됩니다'.

### D. 만료된 '지금 가능' 배지가 안 내려감 (1차 4)

`planner_catalog`가 `availability_until`을 내려주지 않아 클라이언트가 만료를 알 수 없었습니다.
`src/availability.js`는 `availability_until > now`를 요구하므로 배지가 **아예 안 뜨거나**,
`public/map.js:238`은 그 필드를 무시해 **만료돼도 계속 떠 있었습니다**(목록과 지도가 서로 달랐습니다).
**조치**: 서버가 `availability_until = least(방문 종료시각, 위치 갱신 + expireMinutes)`를 함께 내려주고,
map.js가 같은 규칙을 쓰도록 했습니다. 좌표는 계속 비공개입니다.

### E. 재조회 실패가 목록을 비움 (1차 4-d)

`directory.js`의 catch가 `host.replaceChildren()`로 목록을 지웠고, `map.js`는 `SPOTS=[]`로 비웠습니다.
**조치**: 둘 다 마지막으로 확인한 목록을 유지하고 다시 그리기만 합니다 —
`availability_until`이 지난 배지만 내려가고 '최신 상태를 확인하지 못했습니다' 안내가 붙습니다.

### F. 선택한 전문가가 목록에서 사라져도 상세가 그대로 (1차 4-e)

`refreshDetail`은 목록에 있을 때만 갱신하고, 없으면 아무것도 하지 않아 요청 버튼이 남았습니다.
**조치**: 자동 교체 없이 마지막 정보를 유지하면서 `available:false, newRequestsRestricted:true`로
다시 그립니다 → '현재 새 상담 요청을 받을 수 없습니다.' + 요청 버튼 제거.

---

## 2. 바꾼 호출부 / 일부러 안 바꾼 호출부

### 바꾼 것

| 대상 | 변경 | 이유 |
|---|---|---|
| `private.visit_available` | `self_map_visible` 제거 (046 정의 복귀) | 046 accept 게이트가 이 함수를 씀 |
| `public.visit_catalog` | 숨김 제외 wrapper | 신규 탐색 + 신규 요청(046:97)을 한 곳에서 차단 |
| `public.urgent_command` | `accept` 를 이 계층에서 처리 | 046·024 두 게이트가 방문 ON 요구 |
| `public.consultation_command` | `office_assign` 거부 추가 | 1차 1-b |
| `public.reservation_slots` | 숨긴 전문가 지정 조회 → `[]` | 1차 1-c |
| `public.early_expert_review` | 호출 뒤 `instant_availability` OFF | 1차 1-d. 본문 덮어쓰기 없이 wrapper |
| `private.check_reservation_slot_before_visits` | `existing_time`일 때 보험소 요일·시간만 생략 | 1차 2 |
| `private.expert_settings_state` | `visitInProgress` 추가 | 위치 만료와 진행 중 방문을 화면이 구분 |
| `public.planner_catalog` | `availability_until` 추가 | 1차 4-a |

### 일부러 안 바꾼 것

| 대상 | 이유 |
|---|---|
| `planner_eligible` · `urgent_eligible` | 1차 지시 11행 수정 금지. 승인·정지 제한이 여기 걸려 있어 건드리면 심사 체계가 흔들립니다 |
| `expert_profiles.map_visible` (관리자 플래그) | 지시 12행. 본인 숨김은 `self_map_visible`로만 처리 |
| `004` 결제·구독 함수 4곳 | 지시 11행 수정 금지 |
| `046` accept 본문 | 덮어쓰지 않고 058 계층에서 우회. 046 파일은 그대로 |
| `024` accept 본문 | 기반 계층이라 손대지 않고 058에서 처리 |
| `ad_public_slots` | 1차 1-f. 변경 없이 현재 동작만 아래에 보고 |
| `src/optional-profile.js` | 지시·handoff 모두 재작성 금지 |
| `public/styles.css` · `type-system.css` | 전역 덮어쓰기 금지. 새 CSS는 `.expert-presence` 범위 |
| `renderInstant` 함수 자체 | partner-work 연결에서만 뺐습니다. 함수와 테스트는 보존 |

### `ad_public_slots` 현재 동작 보고 (1-f)

`004:175`의 필터는 `s.state='active' and starts_at<=now() and ends_at>now() and sl.enabled
and private.planner_eligible(s.planner_id)` 입니다.
→ **관리자 플래그(`map_visible`)만 보고 본인 숨김(`self_map_visible`)은 보지 않습니다.**
따라서 **전문가가 지도를 숨겨도 유료 광고 칸에는 계속 노출됩니다.**
현재 `public-config`의 `paymentsEnabled`가 `false`라 화면에 광고 영역이 뜨지 않지만,
결제를 열면 바로 드러나는 불일치입니다. 처리 방향은 총괄 판단이 필요합니다
(① 숨기면 광고도 내림 / ② 광고는 유료 약정이므로 유지하고 안내 문구 추가).

---

## 3. 변경 파일

```
M supabase/058_expert_settings.sql            숨김 검사 범위·accept·배정·슬롯·심사 wrapper, availability_until
M supabase/058_expert_settings_rollback.sql   wrapper 복원 + '완전 원복 아님' 명시
A supabase/059_existing_office_hours.sql      기존 예약 원래 시각의 보험소 시간 재검사 생략
A supabase/rollback_existing_office_hours.sql 059 원복
M src/expert-settings.js                      스위치 표시·클릭 일치, 승인 대기, 진행 중 방문, 확인창 문구
A public/expert-settings.css                  scoped. design-system 토큰만
M public/partner-work.html                    expert-settings.css 연결
M src/account.js                              partner-work 를 상태 → 지역 → 진행 중 요청 순서로
M src/directory.js                            60초 refresh, 진행 중 조회 skip, 늦은 응답 폐기, 실패 시 목록 유지
M public/map.js                               availability_until 반영, 60초 주기, 실패 시 목록 유지
M public/expert-profile-card.js               사라진 선택 전문가 처리(자동 교체 금지)
A tests/expert-settings.test.mjs              격리 DB 시나리오 12건
A tests/expert-settings-browser.mjs           360/390px 동작·레이아웃 24건 + 캡처
M tests/availability.test.mjs                 map.js ↔ availability.js 판정 일치 검증
M tests/profile-usability-browser.mjs         브라우저 채널·실행경로를 환경변수로 (기본 msedge 유지)
M tests/support-integration-browser.mjs       동일
```

---

## 4. 검증 결과 (격리 PGlite + 가상 세션)

| # | 항목 | 결과 |
|---|---|---|
| 1 | 지도 OFF → 지도·목록 제외, 지금 방문 즉시 OFF | **통과** |
| 2 | OFF 상태 RPC 직접 호출: 상담 request 거부 | **통과** (`expert_not_visible`) |
| 2 | 같은 request_key 재전송 → 기존 건 반환 | **통과** (058 의 request_key 예외 경로 유지) |
| 3 | OFF 전 받은 상담 요청 수락·연락처·일정변경·완료 | **부분** — 아래 미검증 참조 |
| 4 | OFF 전 받은 **방문** 요청 수락 | **통과** |
| 5 | 지도 다시 ON → 지금 방문 OFF 유지 | **통과** |
| 6 | 관리자 정지 → 노출·신규·수락 차단 / 재승인 시 방문 자동 복원 없음 | **부분** — wrapper 동작은 코드로 확인, 시나리오 테스트 미작성 |
| 7 | 활동지역 저장 → `expert_profiles.status`·`map_visible` 불변 | **미검증** |
| 8 | `office_assign` 에 숨긴 전문가 → 거부 | **통과** |
| 9 | 보험소 운영시간 변경 후 기존 예약 원래 시각 확정 | **부분** — 059 적용·원복은 통과, 운영시간 변경 시나리오 미작성 |
| 10 | 신규 예약 30분 이내 요청 → 거부(현행 유지) | **통과** (`booking-hardening` 회귀) |
| 11 | 스위치 연타 1회 저장 / 두 탭 stale / 응답 유실 재조회 / 실패 시 원위치 | **부분** — `stale_settings` 와 `aria-busy` 잠금은 통과, 응답 유실 재조회는 미검증 |
| 12 | 새로고침·재로그인 → 상태 동일, `expires_at` 불변 | **통과** (DB 전후 비교) |
| 13 | 소비자 화면 열어둔 채 방문 만료 → 배지 내려감 / 실패 시 목록 유지 | **부분** — 판정 규칙 일치와 실패 경로는 통과, 60초 경과 실측 미검증 |
| 14 | 360·390px 스위치 44px, 주요 버튼 48px, 가로 스크롤 없음 | **통과** |

### 실행한 명령과 결과

```
node --test tests/expert-settings.test.mjs      12/12 pass
node --test tests/availability.test.mjs          3/3  pass
node --test tests/booking-hardening.test.mjs     2/2  pass
node --test tests/expert-visits.test.mjs         4/4  pass
node --test tests/early-access.test.mjs          7/7  pass
npm run test:support                            17/17 pass + 브라우저 PASS
node tests/profile-usability-browser.mjs        PASS 360/390/430/1440
node tests/expert-settings-browser.mjs          24/24 CHECK, 캡처 8장
node scripts/build.mjs                          통과
```

적용 순서 검증: `setupVisits` → 052 · 053 · 054 · 056 · 057 · 058 · 059,
**재실행**(같은 파일 2회) · **원복** · **재적용** 모두 통과.
원복 후에도 `self_map_visible` 열이 보존되는 것을 확인했습니다.

### 캡처

`artifacts/expert-settings/` (360 · 390 각 4장)
- `settings-on-*.png` 지도 ON / 방문 ON
- `settings-expired-*.png` 위치 유효시간 만료 → OFF 표시 + 클릭 시 동의창
- `settings-pending-*.png` 승인 대기 → 스위치 비활성 + 안내
- `settings-visit-in-progress-*.png` 진행 중 방문 안내

> `artifacts/`는 Git 제외입니다. 필요하시면 별도로 전달하겠습니다.

---

## 5. 미검증 항목 (사유 명시)

| 항목 | 사유 |
|---|---|
| 3번 중 **상담** 요청 수락·연락처 조회·일정 변경·완료 전 구간 | 방문 요청 경로만 테스트했습니다. 상담 경로는 `planner_eligible`(미변경)에 걸려 있어 숨김과 무관하지만, 실제 시나리오 테스트를 쓰지 못했습니다 |
| 6번 관리자 정지 → 재승인 전체 흐름 | wrapper 로직은 코드로 확인했으나 격리 시나리오 미작성 |
| 7번 활동지역 저장 시 승인 상태 불변 | 058 의 `save_areas` 경로는 건드리지 않았으나 실측 미검증 |
| 9번 운영시간 변경 후 확정 | 059 의 적용·원복만 확인. 보험소 `weekdays` 변경 시나리오 미작성 |
| 11번 응답 유실 후 재조회 | `settingsCall` 의 `settings_unconfirmed` 경로는 코드에 있으나 실측 미검증 |
| 13번 60초 경과 실측 | 타이머 실제 경과 대신 판정 규칙 일치로 대체 |
| 실제 로그인·실제 GPS·실기기 | 환경 없음. 자격증명을 취급하지 않습니다 |
| 운영 DB 의 `match_expert_roster` 056 조건 | 운영 접근 불가로 **미확인**. 저장소 쪽은 `056:51-53`이 `new.status='APPROVED'` 가드를 삽입하는 것을 확인했습니다 |

---

## 6. 검수 실행 방법

```bash
git fetch && git checkout codex/interaction-settings   # cc5709c
npm install                                            # 29 packages

node --test tests/expert-settings.test.mjs
node --test tests/availability.test.mjs
node --test tests/booking-hardening.test.mjs tests/expert-visits.test.mjs tests/early-access.test.mjs
npm run test:support
node tests/profile-usability-browser.mjs
node tests/expert-settings-browser.mjs                 # 캡처 artifacts/expert-settings
node scripts/build.mjs
```

Edge 가 없는 환경에서는 앞에 다음을 붙입니다. **기본 동작은 그대로 msedge 입니다.**
```bash
PLAYWRIGHT_CHANNEL= PLAYWRIGHT_EXECUTABLE_PATH=<chromium 경로> node tests/...
```

---

## 7. 운영 적용 전제와 원복

적용 순서·백업·확인 쿼리는 `docs/release-plan-20261011.md`를 따릅니다. 이번 작업으로 확정된 부분:

- **적용 순서**: 057 → 058 → 059. `scripts/migrate.mjs` 가 번호 순서로 처리하며 **파일 1개 = 트랜잭션 1개**입니다.
- **백업**: 058 은 `private.expert_settings_backup`, 059 는 `private.existing_office_hours_backup` 에
  변경 대상 함수 원문을 `pg_get_functiondef` 로 보관합니다. `on conflict do nothing` 이라 재실행해도 최초 원문이 유지됩니다.
- **원복**: `058_expert_settings_rollback.sql` → `rollback_existing_office_hours.sql` (역순).
  **완전 원복이 아닙니다.** 전문가의 숨김 선택(`self_map_visible` 열과 공개 필터)과 고객센터 대화는 보존합니다.
  숨김을 무시하고 다시 공개하면 전문가의 의사 표시를 뒤집는 것이 되기 때문입니다.
- **화면과 DB 순서**: DB 먼저, 화면 나중. `expert-settings.js` 가 058 의 `expert_settings` RPC 를 호출합니다.
  원복은 역순(화면 먼저)입니다.

---

## 8. 개발 / 운영 상태

| 구분 | 상태 |
|---|---|
| 개발 반영 | `codex/interaction-settings` **`cc5709c`** 커밋·푸시 완료 (지시 0항 허용 범위) |
| main 병합 | **없음** |
| 운영 DB | **실행 0건** |
| 배포 | **없음** |
| 알림·문자·결제·유료 연결 | **없음** |
| 실제 고객 데이터 | **사용 안 함** (격리 PGlite + 가상 세션) |

---

## 9. 다음 단계

1. 총괄 검수 — 특히 `ad_public_slots` 처리 방향 결정(§2)
2. 미검증 6항목 중 3·6·9번은 시나리오 테스트를 추가로 쓸 수 있습니다. 지시 주시면 이어서 하겠습니다
3. 2차 지시(고객센터 1인 운영)는 이 검수가 끝난 뒤 시작합니다 — 2차 0항이 그렇게 정하고 있습니다
