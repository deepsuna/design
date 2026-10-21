# design-system — 딥리뉴어블스 통합 디자인 가이드 (토큰 · 부품 · 구성표)

피그마 **딥리뉴통합디자인가이드**(`tXPHUuCgrV3o1STFl7kcvI`)의 변수와 텍스트·그림자 스타일을 CSS 로 옮기고, 프로덕트 3종 × 포맷 3종의 진행 현황을 갤러리로 보여 줍니다.

- 프로덕트: **딥리뉴어블스** · **솔라리스** · **왓핀** (피그마 Brand 모드 Deeprenewables · Solarlease · Wattfin)
- 포맷: **홈페이지** · **PPT/구글슬라이드** · **SNS광고** (피그마 Format 모드 Homepage · PPT · SNS). 웹 CSS 와 부품 갤러리는 홈페이지만 있고, PPT · SNS 는 아직 피그마 변수 값만 있습니다.

## 파일

| 파일 | 누가 고치나 | 설명 |
|---|---|---|
| `tokens.json` | 피그마에서 내보냄 | **값의 원본.** 피그마 변수(Primitives · Brand · Format · Theme) + 텍스트·그림자 스타일. 모드별 값과 참조 경로. 손으로 고치지 않음 |
| `icons/` | 피그마에서 내보냄 | 피그마 2. Element › Icon(`180:1242`)의 아이콘 SVG(`<크기>/<이름>_<크기>.svg`) + 목록 `icons.json`, Icon_Logo(`197:1838`)의 로고 SVG(`logo/<이름>.svg`) + 목록 `logos.json`. 손으로 고치지 않음 |
| `guide.json` | 손으로 | **구성표.** 프로덕트 · 포맷 목록, 프로덕트 × 포맷 진행 현황(matrix), 공통 요소, 히스토리, 사용 주의사항, 홈페이지 규격 글. 값(색·크기)은 넣지 않음 |
| `layout.css` · `components.css` · `motion.css` | 손으로 | 셸·브레이크포인트 / 공통 부품(피그마 3 Component 1:1) / 모션. 역할 토큰(`var(--…)`)만 사용 |
| `build.mjs` | — | 생성기. 위 파일을 읽어 아래 생성물을 만든다 |
| `dist/{deeprenewables,solarlease,wattfin}.css` | 생성물 | 프로덕트별 토큰 CSS 1개씩 (홈페이지 포맷) |
| `../gallery/index.html` · `tokens.json` · `guide.json` | 생성물 | 더블클릭으로 여는 갤러리 + 원본 사본 |

생성기는 왓핀 사이트 작업본이 있으면 거기에도 복사합니다(`wattpin-develop/app/styles/tokens.css · figma-components.css · motion.css`, 브랜드 3종 + 라이트/다크 한 파일).

## 갱신 순서

```bash
# 저장소 루트에서
node design/design-system/build.mjs
open design/gallery/index.html
```

| 바꾸려는 것 | 할 일 |
|---|---|
| 색 · 글자 · 간격 같은 **값** | 피그마 변수를 바꾼다 → `tokens.json` 을 다시 내보낸다 (Claude 에게 "피그마 변수 tokens.json 으로 내보내줘") → 빌드 |
| **부품** 모양 | 피그마 3 Component → `components.css` → 빌드 |
| **아이콘 · 로고** | 피그마 2. Element › Icon · Icon_Logo 에서 바꾼다 → Claude 에게 "피그마 아이콘(로고) 다시 내보내줘" (use_figma 로 각 아이콘을 `exportAsync({ format: 'SVG_STRING' })` → `icons/` 덮어쓰기 · 없어진 아이콘 파일 삭제) → 빌드 |
| **진행 현황** (예: 솔라리스 PPT 시작) | `guide.json` 의 `matrix.<프로덕트>.<포맷>.status` · `note` → 빌드 |
| **히스토리** | `guide.json` 의 `history` 맨 아래에 한 줄 추가 → 빌드 → 피그마 0 Overview › P8 운영 정보의 히스토리에도 같은 줄 |
| **프로덕트 · 포맷 추가** | 피그마 Brand / Format 컬렉션에 모드 추가 → `tokens.json` 내보내기 → `guide.json` 의 `products` / `formats` / `matrix` 에 추가 → 빌드 |

### guide.json 형식

```jsonc
{
  "products": [{ "id": "solarlease", "label": "솔라리스", "brand": "Solarlease" }],   // id = brand 소문자 (= 사이트 data-brand 값)
  "formats":  [{ "id": "homepage", "label": "홈페이지", "mode": "Homepage", "css": true }], // css: true 인 포맷 1개만 웹 CSS 로 뽑음
  "statuses": [{ "id": "applied" }, { "id": "ready" }, { "id": "tokens" }, { "id": "planned" }], // 실제 적용 · 갤러리 완료 · 토큰만 · 준비중
  "matrix":   { "solarlease": { "homepage": { "status": "ready", "note": "…" } } },     // 모든 프로덕트 × 포맷 칸이 있어야 함
  "history":  [{ "date": "2026-10-18", "products": ["common"], "formats": ["homepage"], "text": "…" }] // "common" = 공통 / 모든 포맷
}
```

빌드할 때 `guide.json` 을 검사합니다. `tokens.json` 의 브랜드·포맷 모드가 `products` · `formats` 와 맞지 않거나, matrix 칸이 비었거나, 히스토리 태그가 목록에 없으면 오류 목록을 보여 주고 멈춥니다.

## 갤러리

| 보기 | 내용 |
|---|---|
| 디자인 가이드 | 프로덕트 · 테마 · 포맷 전환. 홈페이지 = 규격 + 부품 + 타이포 + 색. PPT · SNS = 홈페이지와 다른 포맷 변수 표 + 그 포맷 값으로 그린 글자 크기 |
| 아이콘 · 로고 | 프로덕트별 로고(솔라리스 · 솔라리스 협동조합 · 딥리뉴어블스 · 왓핀) + 크기별(16~120px) 아이콘 목록 · 이름 찾기 · 바탕(자동/밝게/어둡게) · 아이콘마다 PNG(1x·2x·3x, 브라우저에서 SVG 를 그려 만듦) · SVG 다운로드. 크기로 바로 가기: `?view=icons#icon-72` |
| 구성 현황 | 프로덕트 × 포맷 진행 표(칸을 누르면 그 화면으로 이동) · 공통 요소(1 Theme / 2 Element / 3 Component) · 프로덕트별 값(Brand 컬렉션 비교) |
| 히스토리 및 사용 주의사항 | 변경 기록(프로덕트 · 포맷 필터) · 작업 규칙 |

전환할 때마다 주소가 바뀝니다. 예: `index.html?brand=solarlease&theme=dark&format=ppt` · `?view=status` · `?view=history`. 기본은 딥리뉴어블스 · 라이트 · 홈페이지(`guide.json` 의 `default`).

## 실제 화면에 적용하는 방법

```html
<html lang="ko" data-theme="light">
<head>
  <link rel="stylesheet" href="dist/deeprenewables.css">  <!-- 프로덕트 1개 -->
  <link rel="stylesheet" href="layout.css">
  <link rel="stylesheet" href="components.css">
  <link rel="stylesheet" href="motion.css">
```

- 다크모드: `document.documentElement.dataset.theme = "dark"` (속성을 지우면 OS 설정)
- 한 사이트에서 프로덕트를 전환해야 하면 브랜드 3종을 한 파일에 담은 모드(`brandCss(…, { allBrands: true })`, 왓핀 사이트 `tokens.css`)를 쓰고 `<html data-brand="solarlease">` 로 바꾼다
