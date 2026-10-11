# 2단계 — 전문가 프로필 화면(partner.html) 정리 결과

ROADMAP 2단계. 중단 지점(`fix/expert-profile-page` `16b0636`)을 인수해 마무리했다.
**격리 DB·가상 계정 기준이다. 운영 로그인·운영 DB 쓰기·결제·알림 발송은 없다.**

## 1. 전·후 (390×844, 같은 가상 전문가 계정)

캡처: `artifacts/expert-profile-before-390-top.png` / `-full.png`,
`artifacts/expert-profile-after-390-top.png` / `-full.png`.
같은 스크립트(`tests/expert-profile-page-capture.mjs`)를 `origin/main` 워크트리와 작업 트리에서 각각 돌렸다.

| | 카드 순서 (화면에 나오는 제목 순) |
|---|---|
| **전** | 휴대전화 인증 / 주활동지역 / 자격·소속 확인 / 주활동지역 / **▶** 지도 프로필 꾸미기 · 선택 / **▶** 지도에 보이는 프로필 미리보기 / **▶** 설계사 프로필·상담가능 상태 관리 |
| **후** | **지금 방문 상담 가능** / 휴대전화 인증 / 주활동지역 / 자격·소속 확인 / 주활동지역 / 지도 프로필 / 상담 요청·연락처 |

- `▶` 접힘 **3개 → 0개**.
- 지금 방문 카드가 맨 위로 올라와 390×844 **첫 화면 안에 켜기/끄기 버튼**이 들어온다(버튼 하단 y 측정값 기준).
- '주활동지역 · 지금 가능 설정 →' 링크 삭제, 맨 아래 '받은 요청·예약 보기 →'.

## 2. 구현 요지

| 지시 | 구현 |
|---|---|
| ① 지금 방문 카드 맨 위 | `src/account.js` — `accountContent.prepend()` 로 신청 정보 카드보다 위. partner-work 와 **같은 `renderInstant`** 를 그대로 사용(새로 만들지 않음). 승인 전에는 '승인 후 지금 방문 상담을 켤 수 있어요' 한 줄 |
| 화면당 1개 · 서버값 기준 | `mode==='requests'`(partner-work) 와 `mode==='partner'` 는 **서로 다른 분기**라 한 화면에 하나뿐이다. `src/expert-visits.js` 에 `visibilitychange`·`focus` 재조회 추가, `syncing` 으로 중복 호출 차단, `pagehide` 에서 해제 |
| ③ 지도 프로필 카드 | `src/optional-profile.js` — `<details>` → `section.card` + 요약 + 전체 폭 버튼. 입력 전 '사진·소개를 넣으면 고객이 고르기 쉬워요 · 선택', 입력 후 작은 사진 + 소개 첫 줄 |
| ④ 상담 요청·연락처 카드 | `src/profile-editor.js` — 같은 패턴. 요약 '상담 요청 받기 · 켜짐/꺼짐' + '예약 확정 후 공개 연락처 · 010-****-1234' |
| ⑤ 링크 정리 | `public/partner.html` 의 작업 링크에 `data-work-link` 를 달아 맨 아래로 이동 |

**저장 로직·사진 처리·초안 보존은 손대지 않았다.** 바깥 껍데기(제목·요약·토글)만 바꿨다.

### 구현 중 드러난 것 2가지

1. **저장 성공 시 폼을 닫으면 저장 확인 문구도 같이 사라진다.** 확인 문구를 접히는 영역 밖(카드 레벨 `.profile-status`)으로 올려 닫혀도 보이게 했다.
2. **연락처 마스킹이 휴대전화가 아닌 번호에 `010-` 을 붙였다.** 접두사를 하드코딩하지 않고 11자리일 때만 실제 앞 3자리를 쓰도록 고쳤다. 그 외에는 `****-1234` 로만 보여준다.

### 폼 안에 남아 있던 ▶ 1개 — 없앴다

중단 지점 기록은 '지도에 보이는 프로필 미리보기' `<details>` 를 남겨 두고 **총괄 판단 필요**로 적어 두었다.
공통 규칙 §1 화면의 `▶ 접힘 대신 버튼` 이 화면 전체에 걸리는 규칙이므로 **버튼(`btn ghost` + `aria-expanded`)으로 바꿨다.**
미리보기 내용 생성 코드는 그대로다. 이제 폼을 펼친 뒤에도 화면에 `<details>` 가 0개다.

## 3. 디자인 자가검사 (CLAUDE.md §4)

| 항목 | 결과 |
|---|---|
| 하드코딩 색 없음 | 추가한 CSS는 전부 토큰(`--space-2/3`, `--type-small`, `--muted`, `--border`). `body[data-account-page="partner"]` 로 범위를 좁혀 전역 미수정 |
| 대비 4.5:1 이상 | 카드 버튼 계산값 `rgb(30,79,214)` / `rgb(255,255,255)` = **6.68:1** (테스트가 매 실행 측정) |
| 간격·radius 스케일 | `--space-*` 스케일, radius 는 기존 `.btn`(13) 상속 |
| 360px 안 깨짐 | 360·390·430·1440 가로 넘침 0 |
| 버튼 가시성·포커스 | 48px 이상 2개, `aria-expanded`/`aria-controls`, Tab·Enter 로 펼침 + 폼 안으로 포커스 이동 |

파란(주요) 버튼은 카드당 1개다. 폼이 열리면 토글은 `btn ghost` 로 낮아지고 주요 버튼 자리는 '저장하기'/'프로필 저장'이 가져간다.

## 4. 검증 (A-4)

`tests/expert-profile-page-browser.mjs` — 실제 번들·실제 `partner.html` + 격리 DB. 전 항목 통과.

① 첫 화면 켜기/끄기(48px) · ② 카드 순서 · ③ 펼침·저장·요약 갱신·저장 후 닫힘 ·
④ 연락처 뒤 4자리·요약 갱신 · ⑤ 하단 링크·옛 링크 제거·승인 전 안내 ·
⑥ `▶` 0개(펼친 뒤에도)·Tab/Enter·포커스 이동 · ⑦ 4폭 넘침 0·버튼 48px·대비 6.68:1 · 콘솔 오류 0.

### 전체 회귀 (제품 변경 이후 다시 돌린 결과)

| 항목 | 결과 |
|---|---|
| `npm test` | **113 / 113 통과** |
| `node scripts/build.mjs` | **통과** |
| 브라우저 전체 55개 | **통과 35 / 실패 20** |
| 실패 20건 | **사전에 main 대조로 확인한 '원래부터 실패' 20건과 정확히 일치.** 차집합 0 |

→ **이번 변경으로 새로 깨진 테스트 0건.**

컨테이너는 Edge 가 없어 Chromium 으로 돌렸다
(`PLAYWRIGHT_CHANNEL='' PLAYWRIGHT_EXECUTABLE_PATH=/opt/pw-browsers/chromium`).
`tests/playwright-launch.cjs` 기본값(msedge)은 그대로라 개발자 PC 동작은 바뀌지 않는다.

## 5. 브라우저 테스트 인벤토리 정정

`docs/test-harness-20261011.md` 의 '52개' 집합이 실제 파일 목록과 달랐다. 바로잡는다.

| | 이전 기록 | 실제 |
|---|---|---|
| 집합 | 52개 | **55개** (`tests/*browser*` 53 + `admin-console.cjs` + `region-waitlist-connected.mjs`) |
| `admin-console.cjs` | 실패 목록에 있음 | 파일명에 `browser` 가 없어 **`tests/*browser*` 실행에서 빠진다.** 따로 돌리면 main·작업 트리 둘 다 실패(원래부터 실패) |
| `requests-browser-legacy.cjs` | 목록에 없음 | 실행 집합에 들어 있고 main 에서도 실패(원래부터 실패) |
| `expert-browser.mjs` | 실패(`enabled → disabled`) | **main·작업 트리 둘 다 통과.** 이전 기록이 맞지 않는다 |
| `region-waitlist-connected.mjs` | 언급 없음 | 이름과 달리 격리 pglite 고정구를 쓴다. 외부 자격증명 불필요. **통과** |

→ '원래부터 실패'는 **20건 그대로**지만 **구성이 다르다**: `expert-browser` 를 빼고
`requests-browser-legacy` 를 넣어야 한다. `docs/test-failures-classification-20261011.md` 에 반영했다.

## 6. 남은 것

- **A-4 ⑨ 배포 후 운영 실측** — 미수행. main 병합·배포를 하지 않았다.
- main 병합은 대표 승인 후.
