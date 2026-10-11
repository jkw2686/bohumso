# 테스트 하네스 정리 결과 — 2026-10-11

총괄 지시 1). 브랜치 `chore/test-harness` → main `a28f4be`. **테스트 파일만 변경** (`src/`·`public/`·`supabase/` 무변경).

## 1. RPC 오류 응답에 code 포함 (8곳)

`expert-visits-browser` 에서 겪은 원인의 재발 방지. 코드 없는 오류를 받으면 `careStatus` 가
기능 미적용(PGRST202/42883)으로 판단하지 못하고 예외를 던져 화면 렌더가 중단된다.

| 파일 | 변경 |
|---|---|
| `tests/auth-options-browser.mjs` | `{message:e.message}` → `{message:e.message,code:e.code}` |
| `tests/browser-smoke.cjs` | `{message:e.message}` → `{message:e.message,code:e.code}` |
| `tests/commerce-browser.cjs` | `{message:e.message}` → `{message:e.message,code:e.code}` |
| `tests/early-access-browser.mjs` | `{message:e.message}` → `{message:e.message,code:e.code}` |
| `tests/member-gate-browser.cjs` | `{message:e.message}` → `{message:e.message,code:e.code}` |
| `tests/office-ux-browser.cjs` | `{message:e.message}` → `{message:e.message,code:e.code}` |
| `tests/region-waitlist-connected.mjs` | `{message:e.message}` → `{message:e.message,code:e.code}` |
| `tests/urgent-browser.cjs` | `{message:e.message}` → `{message:e.message,code:e.code}` |

제외한 것과 이유:

- `{message:'not logged in'}` 등 **상수 문구** — 잡힌 예외가 아니라 code 가 없는 것이 정상
- `{error:e.message}` (commerce·office-ux·browser-smoke) — Supabase RPC 가 아니라 **Netlify 함수** 엔드포인트(checkout/confirm). supabase-js 가 code 를 읽지 않는다

## 2. 브라우저 실행 옵션 공용화 (53곳)

`channel:'msedge'` 고정을 `tests/playwright-launch.cjs` 한 곳으로 모았다.

```js
const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'msedge';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
module.exports = {headless: true, ...(channel ? {channel} : {}), ...(executablePath ? {executablePath} : {})};
```

- **기본값이 기존과 같은 msedge** 라 개발자 PC 동작은 바뀌지 않는다
- `.cjs` 로 둬서 `.mjs` 는 default import, `.cjs` 는 require 로 같은 값을 쓴다
- 앞서 개별 파일에 넣었던 임시 블록도 이 헬퍼로 흡수했다

## 3. 전체 회귀 (컨테이너, Chromium)

| 항목 | 결과 |
|---|---|
| `npm test` | **113 / 113 통과** |
| `node scripts/build.mjs` | **통과** |
| 브라우저 테스트 | 52개 중 **통과 32 / 실패 20** |

### 3-1. 실패 20건 — 전부 '원래부터 실패'

두 단계로 확인했다.

1. **내 변경이 원인인지** — `code` 추가만 되돌리고 같은 20건 재실행 → 20건 모두 동일하게 실패. `code` 변경 무관.
2. **main 에서도 실패하는지** — main 을 별도 워크트리로 꺼내 `launch` 한 줄만 Chromium 으로 바꿔(커밋 없음) 대표 5건 실행 →
   `member-gate`·`browser-smoke`·`compact-ui`·`visit-map-icons`·`trust-ux` **모두 같은 메시지로 실패**.

   참고: main 트리 그대로는 이 컨테이너에서 52개 전부 실행조차 되지 않는다(`msedge not found`).
   이번 공용화가 필요했던 이유이기도 하다.

| 테스트 | 실패 신호 | 성격 |
|---|---|---|
| `admin-console.cjs` | locator('#adminResetFilters') → element to be visible, en | 구조 변경 |
| `brand-browser.cjs` | getByRole('link', { name: '지금 도움받기' }) → getByRole('link' | 문구 변경 |
| `browser-smoke.cjs` | locator('[name=email]') → element to be visible, enabled  | 로그인 폼 구조 변경 |
| `claim-help-browser.mjs` | 1 → 0 | 요소 사라짐 |
| `commerce-browser.cjs` | locator('[name=email]') → element to be visible, enabled  | 로그인 폼 구조 변경 |
| `compact-ui-browser.mjs` | < 200 → 279.5 | 레이아웃 수치 변경 |
| `expert-browser.mjs` | enabled → disabled | 버튼 비활성 조건 변경 |
| `home-layout-browser.mjs` |  → 6 | 구조 변경 |
| `location-feedback-browser.mjs` | visible → getByRole('button', { name: '🏠 군포 보험소 · 개설 | 문구 변경 |
| `location-signup-browser.mjs` | not 0 → 0 | 요소 사라짐 |
| `login-brand-browser.mjs` | ERR_TUNNEL_CONNECTION_FAILED → navigation to "https://bohu | 컨테이너 외부망 차단 |
| `map-controls-browser.cjs` | "내 위치를 찾았어요." → "내 위치 · 오차 약 30m" | 문구 변경 |
| `member-gate-browser.cjs` | "무료 회원가입 →" → "회원가입하기" | 문구 변경 |
| `office-ux-browser.cjs` | locator('[name=email]') → element to be visible, enabled  | 로그인 폼 구조 변경 |
| `requests-browser.cjs` | locator('[name=email]') → element to be visible, enabled  | 로그인 폼 구조 변경 |
| `signup-continuation-browser.mjs` | getByRole('button', { name: '가입 화면 체험하기' } → getByRole('bu | 문구/버튼 변경 |
| `signup-google-entry-browser.mjs` | getByRole('button', { name: 'Google로 시작하기' → getByRole('bu | 외부 Google 의존 |
| `trust-ux-browser.mjs` | "#situations" → "/urgent.html" | 문구/링크 변경 |
| `urgent-browser.cjs` | getByRole('button', { name: '지금 가능 끄기' }) → getByRole('bu | 문구 변경 |
| `visit-map-icons-browser.mjs` | 1 → 0 | 아이콘 요소 사라짐 |

대부분 **제품이 바뀐 뒤 테스트가 따라가지 않은 것**이다(문구·링크·폼 구조 변경).
`login-brand`·`signup-google-entry` 2건은 컨테이너 외부망 차단·외부 Google 의존이라 환경 문제다.
**이번 작업 범위 밖이므로 손대지 않았다.** 별도 지시가 있으면 정리하겠다.

### 3-2. 통과 32건

`admin-access-browser.mjs`, `admin-test-payment-browser.cjs`, `appointment-care-browser.mjs`, `appointment-pages-browser.mjs`, `auth-options-browser.mjs`, `booking-buttons-browser.mjs`, `booking-hardening-browser.mjs`, `branch-consumer-browser.mjs`, `claim-resources-browser.mjs`, `connected-flow-browser.mjs`, `connection-review-browser.mjs`, `contact-browser.mjs`, `early-access-browser.mjs`, `expert-visits-browser.mjs`, `expert-visits-care-outage-browser.mjs`, `expert-workspace-order-browser.mjs`, `home-experts-browser.mjs`, `home-popup-browser.mjs`, `map-empty-waitlist-browser.mjs`, `mobile-controls-browser.mjs`, `optional-profile-browser.mjs`, `phone-entry-browser.mjs`, `policy-pages-browser.mjs`, `pro-browser.mjs`, `profile-crop-browser.mjs`, `profile-pages-browser.mjs`, `profile-usability-browser.mjs`, `region-waitlist-browser.mjs`, `requests-page-browser.mjs`, `signup-simple-browser.mjs`, `support-browser.mjs`, `type-system-browser.mjs`

제품 변경(지도 빈 지역 안내, 전문가 업무 첫 화면, 약속 안내 내성, 프로필)에 닿는 테스트는 전부 통과다.

## 4. 배포

테스트 파일만 바뀌어 화면·DB 영향이 없다. main 병합(`a28f4be`)했고 **Netlify 배포는 다음 A 배포에 함께 실린다.**
