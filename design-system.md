# design-system.md — 우리동네 보험소 (풀앱 · 네이비 프리미엄)

> 모든 UI는 이 토큰·컴포넌트 규칙을 지킨다. 값 하드코딩 금지, 컴포넌트 재사용.
> 이 문서는 현재 앱(`public/styles.css`·`visual.css`·`account.css`)의 실제 시스템을 정리한 것이며,
> 앞으로 화면을 추가/수정할 때 **디자인이 깨지지 않게** 하는 가드레일이다.
> 톤: 신뢰 · 차분 · 프리미엄 (감정적으로 힘든 순간의 사용자 대상. 공격적 세일즈 톤 금지)

## 1. 컬러 토큰 (styles.css `:root` 기준)
```css
:root{
  --brand:#1a56db;        /* 주요 파랑 — 기본 버튼·강조·링크 */
  --brand-dark:#123a99;   /* brand hover */
  --brand-soft:#eef2ff;   /* 옅은 파랑 배경 — 태그·아이콘칩 */
  --navy:#101e36;         /* 히어로/딥 배경 (프리미엄 네이비) */
  --accent:#477cff;       /* 히어로 위 강조 파랑 */
  --danger:#d64545;  --ok:#1a9c6d;  --warn:#b45309;
  --bg:#f4f5f8;           /* 페이지 배경 */
  --card:#ffffff;         /* 카드 배경 */
  --text:#111827;         /* 본문 */
  --muted:#6b7280;        /* 보조 텍스트 */
  --border:#ecedf1;       /* 구분선/테두리 */
}
```
- 주요 행동(제출/다음/찾기) = `--brand`. 히어로 등 딥 섹션 = `--navy` 배경 + 흰 글자 + `--accent` 강조.
- 페이지 배경은 `--bg`, 카드 내부만 `--card`(#fff). 새 hex 만들지 말고 위 토큰 사용.

## 2. 타이포그래피
- 폰트: 시스템 산세리프 스택(별도 웹폰트 미로드) — `-apple-system, "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif`.
- 히어로 h1 ~46px(모바일 35px, letter-spacing -2.2px), 섹션 h2 ~28px, 카드 h3 17~18px, 본문 16px, 보조 12~13px.
- 로고: `우리동네`(작게) + `보험소`(굵게). line-height 본문 1.6~1.7.

## 3. 간격·레이아웃
- 컨테이너 최대폭 760px(홈 등 넓은 화면 1120~1168px), 좌우 여백 24px(모바일 16px).
- 카드 padding 20~25px. 섹션 상하 여백 28~46px. 하단 안전여백 80~120px(하단 탭바 고려).

## 4. radius · 그림자
- `--radius:18px` 기본. 버튼 13px, 입력 10~12px, 큰 히어로/플랫폼 20~32px.
- 그림자: `--shadow:0 1px 2px rgba(16,24,40,.04), 0 4px 14px rgba(16,24,40,.06)` — 카드·버튼. 남용 금지.

## 5. 컴포넌트 (이것만 재사용 — `styles.css` 정의)
- **버튼 `.btn`**: min-height 50px, radius 13px. 주요=`--brand`+흰글자+`--shadow`, hover `--brand-dark`. 보조(ghost)=투명+`--brand` 글자+`--border` 테두리. 전폭은 width:100%.
- **카드 `.card`**: `--card` 배경, 1px `--border`, radius 18, `--shadow`, padding 20~25.
- **입력 `.field input/select/textarea`**: 1px `--border`(포커스 시 `--brand`), radius 10, padding 12, 배경 #fff, font:inherit.
- **하단 탭바 `.bottom-nav`**: 반투명 흰 배경, blur, radius 22, z-index 30. 활성 항목 `--brand` + `--brand-soft` 배경.
- **바텀시트 `.sheet-overlay`/`.sheet`**: 하단 슬라이드업 모달. 보이게 하려면 `.show` 클래스 필수(기본 opacity:0/pointer-events:none).
- **상황 선택 `.situation-grid`**: `--brand-soft` 배경 카드형 링크.

## 6. 상태·접근성 (필수)
- 모든 인터랙션 요소에 hover + **focus-visible** 표시(현재 `outline:3px solid #6c9fff`).
- 텍스트/배경 대비 4.5:1 이상. 이미지 alt, 버튼 aria-label, 폼 label 필수.
- `prefers-reduced-motion` 존중(현재 애니메이션 off 처리 있음).

## 7. 반응형
- 모바일 우선. 가로 스크롤·잘림 금지(현재 e2e에서 mobile overflow 검사함).
- 표·지도·코드 등 넓은 요소는 자체 `overflow-x:auto` 컨테이너로.

## 8. 금지
- 색·radius·간격 하드코딩(토큰 외 값), 컴포넌트 매번 새로 만들기.
- 과한 그라데이션/그림자 남발. 공격적·과장 세일즈 톤.
