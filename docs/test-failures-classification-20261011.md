# '원래부터 실패' 20건 분류 — 2026-10-11

ROADMAP 1단계 잔여 항목. **분류만 하고 수정은 하지 않았다.**
원표(실패 신호·성격)는 `docs/test-harness-20261011.md` §3-1. 이 문서는 그 20건을
**예약 / 방문 / 로그인 / 결제 / 고객센터** 5개 흐름 해당 여부로 다시 가른 것이다.

판정 근거는 각 테스트가 실제로 여는 페이지와 클릭하는 요소다(파일을 직접 읽어 확인).
`●` = 그 흐름이 테스트의 주 대상, `△` = 경유·부분만 닿음, 빈칸 = 무관.

## 1. 분류표

| # | 테스트 | 예약 | 방문 | 로그인 | 결제 | 고객센터 | 실패 성격 | 닿는 화면 |
|---|---|:--:|:--:|:--:|:--:|:--:|---|---|
| 1 | `admin-console.cjs` | ● | | △ | | △ | 구조 변경(`#adminResetFilters` 비표시) | `/admin-requests.html` |
| 2 | `brand-browser.cjs` | | | △ | | | 문구 변경('지금 도움받기') | `/index.html`, `/account.html` |
| 3 | `browser-smoke.cjs` | △ | | ● | | | 로그인 폼 구조 변경(`[name=email]`) | `/login.html` 외 6개 |
| 4 | `claim-help-browser.mjs` | △ | | △ | | ● | 요소 사라짐(1 → 0) | `/help/claim.html`, `/map.html`, `/requests.html` |
| 5 | `commerce-browser.cjs` | ● | | ● | ● | △ | 로그인 폼 구조 변경 | `/login.html`, `/requests.html`, `/payment-result.html`, `/partner-work.html` |
| 6 | `compact-ui-browser.mjs` | △ | △ | △ | | | ~~레이아웃 수치(< 200 → 279.5)~~ **2026-10-20 해결** — 낡은 기대값 6개를 의도 기준으로 교체, 8개 폭 통과 | `/index.html`, `/map.html`, `/partner.html`, `/requests.html`, `/signup.html` |
| 7 | `requests-browser-legacy.cjs` | ● | | ● | ● | △ | 로그인 폼 구조 변경(5번과 같은 뿌리) | 구 `requests` 흐름 전체 |
| 8 | `home-layout-browser.mjs` | △ | | | | | 구조 변경( → 6) | `/` 홈·지도 마커·상담 신청 |
| 9 | `location-feedback-browser.mjs` | | | | | | 문구 변경(`🏠 군포 보험소 · 개설 예정`) | 홈 위치 안내·지역 목록 |
| 10 | `location-signup-browser.mjs` | | | ● | | | 요소 사라짐(`.planned-marker` not 0 → 0) | 홈 → `/signup.html` |
| 11 | `login-brand-browser.mjs` | | | ● | | | **환경**: 컨테이너 외부망 차단(`ERR_TUNNEL_CONNECTION_FAILED`) | `/signup.html` → Google |
| 12 | `map-controls-browser.cjs` | | △ | | | | 문구 변경('내 위치를 찾았어요.' → '내 위치 · 오차 약 30m') | `/index.html`, `/map.html` |
| 13 | `member-gate-browser.cjs` | △ | | ● | | | 문구 변경('무료 회원가입 →' → '회원가입하기') | `/login.html`, `/signup.html`, `/requests.html`, `/map.html` |
| 14 | `office-ux-browser.cjs` | ● | | ● | ● | △ | 로그인 폼 구조 변경 | `/login.html`, `/requests.html`, `/payment-result.html`, `/admin-requests.html` |
| 15 | `requests-browser.cjs` | ● | | ● | ● | △ | **5번과 동일 원인**(파일 내용이 `require('./commerce-browser.cjs')` 한 줄) | 5번과 같음 |
| 16 | `signup-continuation-browser.mjs` | | | ● | | | 문구/버튼 변경('가입 화면 체험하기') | `/signup.html` |
| 17 | `signup-google-entry-browser.mjs` | | | ● | | | **환경**: 외부 Google 의존 | `/signup.html` → Google |
| 18 | `trust-ux-browser.mjs` | | | | | ● | 문구/링크 변경(`#situations`) | `/`, `/help/*.html`, `/support.html` |
| 19 | `urgent-browser.cjs` | | ● | | | | 문구 변경('지금 가능 끄기') | `/urgent.html` + 지금 가능 전체 흐름 |
| 20 | `visit-map-icons-browser.mjs` | △ | ● | | | | 아이콘 요소 사라짐(1 → 0) | `/map.html` 핀·방문 탭 |

### 흐름별 집계

| 흐름 | 주 대상(`●`) | 경유(`△`) | 합 |
|---|--:|--:|--:|
| 로그인·가입 | 9 (3·5·7·10·11·13·14·15·16·17 중 중복 제외) | 4 | 13 |
| 예약 | 4 (1·5·14·15) | 5 | 9 |
| 결제 | 3 (5·14·15) | 0 | 3 |
| 방문 | 3 (19·20 + `map-controls` 경유) | 2 | 5 |
| 고객센터 | 2 (4·18) | 4 | 6 |
| 어느 흐름도 아님 | `location-feedback`(9), `home-layout`(8), `brand`(2)·`compact-ui`(6)는 레이아웃·브랜드 | — | 4 |

## 2. 원인 묶음 — 20건은 실제로 7개 뿌리다

같은 원인 하나가 여러 파일을 동시에 깨뜨리고 있어, 숫자 20이 과대평가다.

| 뿌리 | 깨진 파일 | 내용 |
|---|---|---|
| **A. 로그인 폼 구조 변경** | 3, 5, 7, 14, 15 (5건) | 테스트가 `[name=email]` 을 기다리는데 현재 로그인 화면에 그 입력이 그대로 보이지 않는다. 5와 15는 같은 파일이므로 사실상 4건 |
| **B. 가입 화면 문구·구조 변경** | 10, 16 (2건) | '가입 화면 체험하기' 버튼명 · `.planned-marker` 사라짐 |
| **C. 홈·지도 문구 변경** | 2, 9, 12, 13 (4건) | '지금 도움받기', `🏠 … 개설 예정`, '내 위치를 찾았어요.', '무료 회원가입 →' |
| **D. 홈·지도 구조·수치 변경** | 6, 8, 20 (3건) | 요소 개수·레이아웃 폭·핀 아이콘 |
| **E. 고객센터·안내 링크 변경** | 4, 18 (2건) | `#situations` 링크, 청구 도움 요소 |
| **F. 관리자 화면 구조 변경** | 1 (1건) | `#adminResetFilters` |
| **G. 환경 제약(코드 무관)** | 11, 17 (2건) | 컨테이너 외부망 차단 · 외부 Google 의존. **코드로 고칠 대상이 아니다** |

## 3. 앞으로의 단계와 겹치는 것 (수정 시점 판단용)

분류 과정에서 드러난 **충돌 예고**다. 지금 고치면 2·3·8단계에서 또 고쳐야 하므로,
아래는 해당 단계 안에서 함께 처리하는 쪽이 맞다.

| 테스트 | 겹치는 단계 | 왜 |
|---|---|---|
| 9 `location-feedback` | **3-6** 이모지·개별 SVG 정리 | 버튼 이름을 `🏠 군포 보험소 · 개설 예정` 로 찾는다. 이모지를 `ui-icons.js` 로 바꾸면 **더 깨진다** |
| 20 `visit-map-icons` | **3-6** 지도 핀 묶음 | `.professional-pin` / `.planned-pin` 이 겹치지 않음을 검사한다. 묶음(clustering)이 들어오면 전제 자체가 바뀐다 |
| 18 `trust-ux` | **3-1**(support 공통 헤더·하단 탭) · **3-4**(문의 이메일 설정값) · **3-6**('서비스 더 알아보기' 카드형 버튼) | `.home-help[href="#situations"]`, `support.html` 의 `jkw2686@gmail.com` 하드코딩 문자열을 직접 검사한다 |
| 8 `home-layout` | **3-6** 홈 상황 카드 6개 | 마커·카드 개수를 검사한다 |
| 1 `admin-console` | **3-3** 관리자 문의 접힘 제거·배지 | 같은 `admin-requests.html` 구조를 건드린다 |
| 4 `claim-help` | **3-2** '안내문 만들기' 삭제 | 같은 청구 도움 화면 계열 |
| `expert-browser`(목록에서 빠짐, 아래 §5) | **3-5** 전문가 실명 검사 | 지금은 통과하지만 이름에 `'가상 신청자'`(한글+공백)를 넣는다. 3-5 규칙이 한글에 공백을 허용하는지 **지시서에 명시되지 않았다**(`한글 2~10자 또는 영문 2~40자(공백 허용)`). 3-5 구현 전 확정 필요 |
| 19 `urgent-browser` | **2단계** · **8-3** 지금 방문 시간 | `'지금 가능 끄기'`·`'1시간'` 칩을 클릭한다. 8-3 은 30분 선택지를 없애고 1·2·3·4시간 칩으로 바꾸므로 이 테스트를 다시 쓸 수밖에 없다 |
| 6 `compact-ui` | **2단계** partner.html 카드 재배치 · **8-2** 카드 순서 | `/partner.html` 레이아웃 수치를 검사한다 |

**겹치지 않아 독립적으로 정리 가능한 것**: 뿌리 A(로그인 폼 3건)·B 일부(10, 16)·G(환경 2건).
G 는 코드 수정 대상이 아니므로, 실질 정리 대상은 **A + B = 5~6건**이다.

## 4. 결론

- 20건 중 **2건(11, 17)은 환경 제약**이라 코드로 고칠 것이 없다.
- 1건(15)은 다른 파일(5)을 `require` 하는 한 줄짜리라 **중복 집계**다. 실제 독립 실패는 **17건**.
- 17건 중 **9건은 2·3·8단계가 같은 화면을 다시 바꾸므로**, 그 단계에서 테스트를 함께 갱신하는 것이 맞다.
- 지금 단독으로 정리할 수 있는 것은 **로그인 폼(A) 4건 + 가입 문구(B) 2건 = 6건**뿐이다.
- 이번 단계 지시는 '분류만'이므로 **어느 파일도 수정하지 않았다.**

---

## 5. 2026-10-11 2단계 재실행으로 드러난 정정

2단계 회귀에서 전체를 다시 돌린 결과, 위 표의 바탕이 된
`docs/test-harness-20261011.md` §3 의 '52개' 집합이 실제 파일 목록과 달랐다.

| 항목 | 이전 기록 | 실제 (재실행 확인) |
|---|---|---|
| 실행 집합 | 52개 | **55개** — `tests/*browser*` 53 + `tests/admin-console.cjs` + `tests/region-waitlist-connected.mjs` |
| `admin-console.cjs` | 실패 목록 1번 | 맞다(원래부터 실패, main 대조 확인). 다만 **파일명에 `browser` 가 없어 `tests/*browser*` 로 돌리면 통째로 빠진다** |
| `requests-browser-legacy.cjs` | 목록에 없음 | 실행 집합에 있고 **main 에서도 같은 이유로 실패**. 위 표 7번으로 넣었다 |
| `expert-browser.mjs` | 실패(`enabled → disabled`) | **main·작업 트리 모두 통과.** 이전 기록이 맞지 않아 목록에서 뺐다 |
| `region-waitlist-connected.mjs` | 언급 없음 | 이름과 달리 격리 pglite 고정구를 쓴다(외부 자격증명 불필요). **통과** |

→ '원래부터 실패' **총 20건은 그대로**지만 구성이 한 건 바뀌었다
(`expert-browser` 빠지고 `requests-browser-legacy` 들어옴).
뿌리 묶음도 A가 4→5건, B가 3→2건으로 옮겨간다.

**따로 조치가 필요한 것**: `admin-console.cjs` 는 이름 규칙 때문에 일상적인 전체 실행에서 빠진다.
파일명을 `admin-console-browser.cjs` 로 바꾸거나 실행 목록을 파일 하나로 고정하는 편이 맞다.
이번 단계 지시 범위 밖이라 **이름은 바꾸지 않았고**, 2단계 회귀에서는 수동으로 포함해 돌렸다.
