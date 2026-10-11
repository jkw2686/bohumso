# 빈 지역 화면 → 오픈 알림 신청 연결 — 제출물

작성: Claude Code / 2026-10-11 · 브랜치 `fix/map-empty-waitlist` (`origin/main` `65e4d8d` 기준)
**미배포.** main 병합 없음, 배포 없음, 문자 발송 없음, 운영 신청 데이터 생성·조회·삭제 없음.
DB·SQL 변경 없음 — 화면만 수정했습니다.

---

## 1. 변경 파일

```
M public/map.js    renderList 빈 목록 분기 + 신청 버튼·지역 검증·지역 해제
M public/map.css   .map-page .list-body 범위의 빈 안내 레이아웃 (전역 파일 미수정)
A tests/map-empty-waitlist-browser.mjs   1~9 검증 + 360/390 캡처
M tests/region-waitlist-browser.mjs      브라우저 채널·실행경로를 환경변수로 (기본 msedge 유지)
```

`codex/interaction-settings` 와 섞지 않았습니다. 그쪽의 `map.js` 변경 구간(availability 배지·60초 재조회)과
이번 변경 구간(renderList 빈 분기)은 겹치지 않습니다.

---

## 2. 구현 방식

### 'import 한 줄' 금지 준수

`public/map.js` 는 모듈이 아닌 즉시실행 함수라 `import` 를 넣으면 지도 전체가 멈춥니다.
`public/office-slot.js` 와 같은 방식으로 `window.openRegionWaitlist` 를 **호출 시점에** 확인합니다.

```js
b.onclick = function () {
  if (window.openRegionWaitlist) window.openRegionWaitlist({region: region, role: role});
  else b.textContent = '잠시 후 다시 눌러 주세요.';
};
```

버튼은 `member.js` 준비 여부와 무관하게 **항상** 그립니다.

### 지역 값 검증

```js
function waitlistRegion() {
  var value = (selectedArea || '').trim();
  if (!value) return '';
  var parts = value.split(' ');
  if (parts.length < 2) return '';
  return (GU[parts[0]] || []).indexOf(parts.slice(1).join(' ')) >= 0 ? value : '';
}
```

`GU` 는 `window.COVERAGE_AREAS` 에서 만든 시→구 목록입니다. 단순 정규식이 아니라 실제 목록과 대조하므로
`'경기 수원시 장안구'` 처럼 구 이름이 두 단어인 경우도 올바르게 통과합니다.
서비스 지역·오픈 예정 보험소·방문 화면의 기존 신청과 **같은 '시 구' 문자열**이라 관리자 지역별 집계가 합쳐집니다.

위치로 자동 선택된 지역도 `selectedArea` 를 그대로 쓰므로 같은 값이 들어갑니다.
지역을 바꾸면 `reloadSpots` → `renderList` 가 다시 돌면서 **그 시점의** `selectedArea` 로 버튼을 다시 만듭니다
(이전 지역으로 신청되는 경로가 없습니다).

### 지역 해제

`applyRegion()`(기존 지역 적용 경로)을 모듈 범위 참조로 두고 그대로 호출합니다.
지도 중심·저장 위치·재조회가 한 번에 맞춰지므로 별도 경로를 만들지 않았습니다.

---

## 3. 작업 중 발견한 문제 (제 구현의 버그)

기존 `이 지역 방문 가능한 전문가 찾기` 링크(`#areaRequest`)는 HTML 상 `#listBody` **위**에 있습니다.
지시대로 "신청 버튼 아래로" 옮기려고 그 노드를 `#listBody` 안으로 이동시켰더니,
다음 `renderList()` 의 `body.innerHTML=''` 가 **그 노드를 지워버려** 이후 렌더에서
`Cannot set properties of null (setting 'hidden')` 로 지도 목록이 깨졌습니다.

브라우저 테스트의 `pageerror` 수집에서 잡았고, `renderList` 진입 시 링크를 먼저 제자리로 되돌리도록 고쳤습니다.

```js
if (areaLink && body.contains(areaLink)) body.parentNode.insertBefore(areaLink, body);
body.innerHTML = '';
```

---

## 4. 확인 결과 (1~9)

로컬 전용. RPC 와 지도 타일은 가로챘고 **운영 신청 데이터를 만들지 않았습니다.**

| # | 항목 | 360px | 390px |
|---|---|---|---|
| 1 | 빈 지역 → 문구 + 버튼 3개 | **통과** | **통과** |
| 2 | 오픈 알림 신청 → `{region:'서울 종로구', role:'consumer'}` | **통과** | **통과** |
| 3 | 활동 신청 → `role:'planner'` | **통과** | **통과** |
| 4 | 시만 선택 → '구를 선택하면 오픈 알림을 신청할 수 있어요' + 신청 버튼 없음 | **통과** | **통과** |
| 5 | 지역 A(종로구) → B(성동구) 변경 후 B로 신청 | **통과** | **통과** |
| 6 | 전문가 있는 지역(마포구) → 기존 목록 그대로, 빈 안내 없음 | **통과** | **통과** |
| 7 | `member.js` 로드 전 클릭 → '잠시 후 다시 눌러 주세요.' / 콘솔 오류 0 | **통과** | — |
| 8 | 버튼 48px, 가로 스크롤 없음 | **통과** (48,48,48) | **통과** (48,48,48) |
| 9 | `node scripts/build.mjs` | **통과** | |
| 9 | `node --test tests/region-waitlist.test.mjs` | **통과** 1/1 | |
| 9 | `node tests/region-waitlist-browser.mjs` | **통과** (6 viewport) | |

실행:
```bash
node scripts/build.mjs
node --test tests/region-waitlist.test.mjs
node tests/region-waitlist-browser.mjs
node tests/map-empty-waitlist-browser.mjs      # 캡처 artifacts/map-empty-waitlist
```
Edge 가 없는 환경은 앞에 `PLAYWRIGHT_CHANNEL= PLAYWRIGHT_EXECUTABLE_PATH=<chromium>` 을 붙입니다.
**기본 동작은 그대로 msedge 입니다.**

### 캡처

`artifacts/map-empty-waitlist/` (360·390 각 3장)
- `empty-*.png` 빈 지역 안내 + 신청 버튼
- `city-only-*.png` 시만 선택 → 구 선택 안내
- `with-expert-*.png` 전문가 있는 지역(기존 목록 유지)

---

## 5. 지시와 다르게 한 것 · 알아두실 점

### ④ '전체 지역 전문가 보기' 를 링크가 아닌 `btn ghost` 버튼으로 했습니다

지시는 '링크'였습니다. 다만 이 동작은 페이지 이동이 아니라 **지역 해제 후 재조회**라
`<a href>` 로 만들면 의미가 맞지 않고, 새 CSS 클래스를 만들면 "기존 btn / btn ghost 클래스만" 조건에
어긋납니다. 기존 컴포넌트 중 가장 가벼운 `btn ghost` 를 썼습니다. 바꾸길 원하시면 알려주세요.

### 빈 상태는 `?view=experts` 경로에서 보입니다

기본 보기(`/map.html`)는 오픈 예정 보험소(`PLANNED`)가 함께 떠서 목록이 비지 않습니다
(`sortedSpots()` 가 기본에서는 전문가·보험소를 모두 포함). 빈 안내가 실제로 노출되는 경로는
**전문가 보기(`?view=experts`)** 이며, 테스트도 그 경로로 확인했습니다.
보험소 보기(`?view=offices`)는 모든 지역에 오픈 예정 거점이 있어 현재 데이터로는 비지 않습니다
(문구 분기는 넣어 두었습니다).

### 목록 시트 높이

`.list-sheet` 가 `32dvh`(펼치면 `62dvh`)이고 `.list-body` 는 `overflow-y:auto` 입니다.
360px에서는 첫 화면에 **주요 버튼까지 보이고 나머지는 스크롤**로 닿습니다. 여백을 토큰 범위에서
줄여 두 번째 버튼이 걸쳐 보이도록 했습니다. 시트 높이 자체는 이번 범위를 넘어 건드리지 않았습니다.
세 버튼을 모두 첫 화면에 넣으려면 빈 상태일 때 시트를 `open` 으로 여는 변경이 필요합니다 — 지시 주시면 하겠습니다.

### 미검증

- 실제 모바일 기기·실제 키보드 올라온 상태 (환경 없음). 신청창 자체의 키보드 동작은
  기존 `region-waitlist-browser.mjs` 가 6개 viewport 로 검증하며 이번에도 통과했습니다.
- 실제 신청 저장(운영 RPC) — 지시대로 운영 데이터를 만들지 않았습니다.

---

## 6. 상태

| 구분 | 상태 |
|---|---|
| 개발 반영 | `fix/map-empty-waitlist` 커밋 |
| main 병합 | **없음** |
| 배포 | **없음** |
| DB·SQL | **변경 없음** |
| 문자·알림 | **없음** |
| 운영 신청 데이터 | **생성·조회·삭제 없음** |

배포는 대표 승인 후 별도로 진행합니다.
