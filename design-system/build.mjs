// tokens.json(원본) → dist/<brand>.css · ../gallery/ · ../../code/wattpin-main/app/styles/ · ../../wattfin/app/styles/ (브랜드 3종 한 파일)
// guide.json(구성표: 프로덕트 · 포맷 · 진행 현황 · 히스토리 · 주의사항) → ../gallery/ 의 글
// 실행 (저장소 루트에서): node design/design-system/build.mjs
// 값의 원본은 피그마 → tokens.json. 이 스크립트는 이름 규칙(피그마 "a/b/c" → CSS "--a-b-c")만 적용한다.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const design = join(root, '..');          // design/
const repo = join(root, '..', '..');      // 저장소 루트
const tokens = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8'));
const guide = JSON.parse(readFileSync(join(root, 'guide.json'), 'utf8'));

// ---------- guide.json 검사 — tokens.json(피그마)과 어긋나면 여기서 멈춘다 ----------
{
  const errs = [];
  const ids = (list) => list.map((x) => x.id);
  const P = ids(guide.products), F = ids(guide.formats), S = ids(guide.statuses);
  for (const b of tokens.brand.$modes) if (!guide.products.some((p) => p.brand === b)) errs.push(`tokens.json 브랜드 "${b}" 가 products 에 없음`);
  for (const p of guide.products) {
    if (!tokens.brand.$modes.includes(p.brand)) errs.push(`products "${p.id}" 의 brand "${p.brand}" 가 tokens.json 에 없음`);
    if (p.id !== p.brand.toLowerCase()) errs.push(`products "${p.id}": id 는 brand 의 소문자("${p.brand.toLowerCase()}")여야 함 — 사이트의 data-brand 값과 같게`);
  }
  for (const m of tokens.format.$modes) if (!guide.formats.some((f) => f.mode === m)) errs.push(`tokens.json 포맷 "${m}" 가 formats 에 없음`);
  for (const f of guide.formats) if (!tokens.format.$modes.includes(f.mode)) errs.push(`formats "${f.id}" 의 mode "${f.mode}" 가 tokens.json 에 없음`);
  if (guide.formats.filter((f) => f.css).length !== 1) errs.push('formats 중 css: true 는 정확히 1개여야 함 (웹 CSS 로 뽑는 포맷)');
  for (const p of P) for (const f of F) if (!S.includes(guide.matrix[p]?.[f]?.status)) errs.push(`matrix.${p}.${f}.status 가 없거나 statuses 에 없는 값`);
  for (const c of guide.common) if (!S.includes(c.status)) errs.push(`common "${c.id}" 의 status "${c.status}" 가 statuses 에 없음`);
  guide.history.forEach((h, i) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(h.date)) errs.push(`history[${i}] 날짜 형식은 YYYY-MM-DD`);
    for (const p of h.products || []) if (p !== 'common' && !P.includes(p)) errs.push(`history[${i}] products 의 "${p}" 가 없음 (common 또는 products id)`);
    for (const f of h.formats || []) if (f !== 'common' && !F.includes(f)) errs.push(`history[${i}] formats 의 "${f}" 가 없음 (common 또는 formats id)`);
    if (!h.products?.length || !h.formats?.length || !h.text) errs.push(`history[${i}] 에 products · formats · text 가 모두 있어야 함`);
  });
  if (!P.includes(guide.default.product) || !F.includes(guide.default.format)) errs.push('default.product / default.format 이 목록에 없음');
  if (errs.length) { console.error('guide.json 오류:\n  - ' + errs.join('\n  - ')); process.exit(1); }
}

const FORMAT = guide.formats.find((f) => f.css).mode; // 'Homepage'
// 카드로 취급하는 선택자 — 디자인 시스템(.card) + 왓핀 사이트의 카드 클래스. 4-1 블록에 쓴다
const LIGHT_SURFACE = '.card, .sl-card, .wf-card2, .wf-live-card, .wf-kpi, .wf-carbon, .wf-dash, .sl-stat, [data-theme="dark"] .wf-feature-stat'; // 웹은 홈페이지 포맷만 쓴다. PPT·SNS 값은 tokens.json 에 그대로 있다.
const BRANDS = tokens.brand.$modes; // Solarlease · Wattfin · Deeprenewables
const THEMES = tokens.theme.$modes; // Light · Dark

// ---------- 공통 ----------
const cssName = (path) => '--' + path.replace(/\//g, '-');
// "primitives/gray/800" → "--gray-800", "brand/brand/primary" → "--brand-primary"
const refToVar = (ref) => `var(${cssName(ref.replace(/^(primitives|brand|format|theme)\//, ''))})`;
const unit = (path, type, v) => {
  if (type === 'color') return v;
  if (type === 'fontWeight' || path.includes('font/weight')) return String(v);
  if (path.includes('letter-spacing')) return `${Number(v) / 100}em`; // 피그마 % → em
  if (type === 'fontFamily' || path.includes('font/family')) return `"${v}", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
  return `${v}px`;
};
// 컬렉션 객체를 [path, token] 목록으로 펼친다
const flat = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => {
  if (k.startsWith('$')) return [];
  const p = prefix ? `${prefix}/${k}` : k;
  return v && typeof v === 'object' && '$type' in v ? [[p, v]] : flat(v, p);
});
const line = (path, token, mode) => {
  const ref = mode ? token.$ref?.[mode] : null;
  const raw = mode ? token.$value[mode] : token.$value;
  const val = ref ? refToVar(ref) : unit(path, token.$type, raw);
  return `  ${cssName(path)}: ${val};`;
};
const header = (title) => `/* ${title}\n * 자동 생성: design/design-system/build.mjs ← design/design-system/tokens.json (피그마 변수 원본)\n * 직접 고치지 말고 피그마 값을 바꾼 뒤 tokens.json 을 갱신하고 build.mjs 를 다시 실행하세요. */\n`;

// ---------- 브랜드 1개 = CSS 1개 ----------
function brandCss(brand, { allBrands = false } = {}) {
  const prim = flat(tokens.primitives).map(([p, t]) => line(p, t));
  const br = flat(tokens.brand).map(([p, t]) => line(p, t, brand));
  const fm = flat(tokens.format).map(([p, t]) => line(p, t, FORMAT));
  const th = Object.fromEntries(THEMES.map((m) => [m, flat(tokens.theme).map(([p, t]) => line(p, t, m))]));
  const [light, dark] = THEMES;

  let out = header(`${brand} — 디자인 토큰 (Format: ${FORMAT})`);
  out += `\n/* 1. 원시 값 (Primitives) — 화면 코드에서 직접 쓰지 않는다 */\n:root {\n${prim.join('\n')}\n}\n`;
  if (allBrands) {
    // 기본 = brand. <html data-brand="solarlease"> 처럼 속성 하나로 전환. 역할 색(4)이 브랜드 변수를 참조하므로 색·둥글기·폰트가 함께 바뀐다
    out += `\n/* 2. 브랜드 값 — 기본 ${brand}. <html data-brand=\"…\"> 로 전환 (${BRANDS.map((b) => b.toLowerCase()).join(' · ')}) */\n`;
    // 기본 브랜드(:root)를 먼저 써야 한다 — 같은 특정도라 뒤에 오는 선택자가 이기므로, 기본이 뒤면 다른 브랜드로 전환이 안 된다
    for (const b of [brand, ...BRANDS.filter((x) => x !== brand)]) {
      const lines = flat(tokens.brand).map(([p, t]) => line(p, t, b));
      out += `${b === brand ? ':root,\n' : ''}[data-brand="${b.toLowerCase()}"] {\n${lines.join('\n')}\n}\n`;
    }
  } else {
    out += `\n/* 2. 브랜드 값 (Brand: ${brand}) */\n:root {\n${br.join('\n')}\n}\n`;
  }
  out += `\n/* 3. 포맷 값 (Format: ${FORMAT}) — 글자 크기·간격 */\n:root {\n${fm.join('\n')}\n}\n`;
  out += `\n/* 4. 역할 색 (Theme) — 기본 ${light}. <html data-theme="dark"> 로 전환. 속성이 없으면 OS 설정을 따른다 */\n:root,\n[data-theme="${light.toLowerCase()}"] {\n${th[light].join('\n')}\n}\n`;
  out += `[data-theme="${dark.toLowerCase()}"] {\n${th[dark].join('\n')}\n}\n`;
  out += `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]) {\n${th[dark].map((l) => '  ' + l).join('\n')}\n  }\n}\n`;
  // 4-1. 다크에서도 흰 카드를 쓰는 브랜드 (brand/card-dark 가 primitives/white 인 브랜드, 2026-10-08 왓핀 결정)
  //      카드 안에서는 라이트 역할 색 전체를 다시 선언한다 — 글자·선·상태색까지 라이트 값이어야 흰 카드 위에서 읽힌다.
  //      선택자 목록은 LIGHT_SURFACE. 사이트의 카드 클래스가 늘면 여기에 추가한다.
  if (allBrands) {
    const lightCardBrands = BRANDS.filter((b) => (tokens.brand.brand['card-dark']?.$ref?.[b] || '') === 'primitives/white');
    for (const b of lightCardBrands) {
      // 기본 브랜드는 data-brand 속성이 없어도(:root 값이 적용되는 경우) 같은 규칙을 받아야 한다
      const sel = [b === brand && `:root:not([data-brand])[data-theme="dark"] :is(${LIGHT_SURFACE})`, `[data-brand="${b.toLowerCase()}"][data-theme="dark"] :is(${LIGHT_SURFACE})`].filter(Boolean).join(',\n');
      out += `\n/* 4-1. ${b}: 다크 모드에서도 흰 카드 — 카드 안은 라이트 역할 색 (2026-10-08 결정) */\n${sel} {\n${th[light].join('\n')}\n  color-scheme: light;\n}\n`;
    }
  }

  // 5. 텍스트 스타일 "단계/두께" → .text-<단계> + .font-<두께>
  out += `\n/* 5. 텍스트 스타일 — 피그마 "단계/두께" ↔ .text-<단계> + .font-<두께> */\n`;
  out += `.font-regular { font-weight: var(--font-weight-regular); }\n.font-medium { font-weight: var(--font-weight-medium); }\n.font-bold { font-weight: var(--font-weight-bold); }\n`;
  const steps = new Map();
  for (const [name, s] of Object.entries(tokens.textStyles)) {
    const cls = name.split('/')[0];
    if (!steps.has(cls)) steps.set(cls, { ...s, weights: [] });
    steps.get(cls).weights.push(name.split('/')[1].toLowerCase());
  }
  for (const [cls, s] of steps) {
    const lh = s.lineHeight === 'normal' ? 'normal' : refToVar(s.lineHeight);
    const ls = s.letterSpacing ? `\n  letter-spacing: ${refToVar(s.letterSpacing)};` : '';
    out += `.text-${cls} { /* ${s.weights.join(' · ')} */\n  font-family: ${refToVar(s.fontFamily)};\n  font-size: ${refToVar(s.fontSize)};\n  line-height: ${lh};\n  font-weight: var(--font-weight-${s.weights[0]});${ls}\n}\n`;
  }

  // 6. 그림자 — 다크에서는 그림자 색이 투명해지고 1px 테두리(--color-border-elevation)로 표현
  out += `\n/* 6. 그림자 — 라이트는 그림자, 다크는 투명 그림자 + 1px 테두리 */\n`;
  for (const [name, layers] of Object.entries(tokens.effectStyles)) {
    const shadow = layers.map((l) => `${l.offsetX} ${l.offsetY} ${l.blur} ${l.spread} ${refToVar(l.color)}`).join(', ');
    out += `.${name.replace('/', '-')} { box-shadow: ${shadow}; border: 1px solid var(--color-border-elevation); }\n`;
  }
  return out;
}

mkdirSync(join(root, 'dist'), { recursive: true });
const dist = {};
for (const b of BRANDS) {
  dist[b] = brandCss(b);
  writeFileSync(join(root, 'dist', `${b.toLowerCase()}.css`), dist[b]);
}

// ---------- 홈페이지(wattpin-main)로 복사 ----------
const site = join(repo, 'code', 'wattpin-main', 'app', 'styles');
if (existsSync(site)) {
  writeFileSync(join(site, 'tokens.css'), dist.Wattfin);
  for (const f of ['layout.css', 'components.css', 'motion.css']) copyFileSync(join(root, f), join(site, f));
}

// ---------- 실제 사이트(바탕화면 github/wattfin)로 복사 — 브랜드 3종 + 라이트/다크 한 파일 ----------
const dev = [join(repo, 'wattfin', 'app', 'styles'), join(repo, '..', 'wattfin', 'app', 'styles')].find(existsSync); // 2026-10-21부터 사이트 작업은 github/wattfin 한 곳 (design 폴더가 github/design 이면 repo = github)
if (dev) {
  writeFileSync(join(dev, 'tokens.css'), brandCss('Wattfin', { allBrands: true }));
  copyFileSync(join(root, 'components.css'), join(dev, 'figma-components.css'));
  copyFileSync(join(root, 'motion.css'), join(dev, 'motion.css'));
}

// ---------- 갤러리 (gallery/index.html + gallery/tokens.json) ----------
const hand = ['layout.css', 'components.css', 'motion.css'].map((f) => `/* ===== ${f} ===== */\n` + readFileSync(join(root, f), 'utf8')).join('\n');
const TYPE_STEPS = [...new Set(Object.keys(tokens.textStyles).map((n) => n.split('/')[0]))];
const WEIGHTS = Object.fromEntries(TYPE_STEPS.map((s) => [s, Object.keys(tokens.textStyles).filter((n) => n.startsWith(s + '/')).map((n) => n.split('/')[1].toLowerCase())]));
const COLOR_TOKENS = flat(tokens.theme).map(([p]) => p.replace(/^color\//, '')).filter((p) => !p.startsWith('shadow/'));
const VERSION = tokens.$version || ''; // 피그마 0. Overview 의 버전 글자(노드 399:88). tokens.json 내보내기가 채운다
const FIGMA_FILE = guide.figma.url;
const figmaNode = (key) => FIGMA_FILE + '?node-id=' + guide.figma.nodes[key].replace(':', '-');
const FIGMA_P9 = figmaNode('homepage'); // 0 Overview · P9 홈페이지 규격
const VIEWS = [['guide', '디자인 가이드'], ['icons', '아이콘 · 로고'], ['status', '구성 현황'], ['history', '히스토리 및 사용 주의사항']];
// 프로덕트 · 포맷 · 진행 현황 · 히스토리 · 주의사항 · 규격 글은 guide.json 에서 관리한다 (새 히스토리는 guide.json history 맨 아래에 추가)
const PRODUCTS = guide.products; // 갤러리 표시 순서
const FORMATS = guide.formats.map((f) => [f.id, f.label]);
const CSS_FORMAT = guide.formats.find((f) => f.css).id; // 'homepage' — 부품 갤러리. 나머지 포맷은 토큰 비교 화면
const HISTORY = guide.history;
const CAVEATS = guide.caveats.map((c) => [c.title, c.text]);
const SPEC_BREAKPOINTS = guide.specs.homepage.breakpoints;
const SPEC_WIDTHS = guide.specs.homepage.widths;
const STATUS = Object.fromEntries(guide.statuses.map((s) => [s.id, s]));
const STATUS_BADGE = { applied: 'badge--success', ready: 'badge--primary', tokens: 'badge--warning', planned: 'badge--gray' };
const statusBadge = (id) => `<span class="badge ${STATUS_BADGE[id] || 'badge--gray'}">${STATUS[id].label}</span>`;
const LABEL = Object.fromEntries([...guide.products, ...guide.formats].map((x) => [x.id, x.label]));
const chips = (name, opts) => opts.map(([v, l]) => `<button class="chip" data-set="${name}" data-value="${v}">${l}</button>`).join('');

// 타이포 — 글자 크기 · 줄높이를 함께 적는다. 포맷 탭에서는 같은 줄을 그 포맷 값으로 다시 그린다
const fmtVal = (ref, mode) => { const t = ref.split('/').slice(1).reduce((o, k) => o?.[k], tokens.format); return t ? t.$value[mode] : ref; };
const typeRows = (mode) => TYPE_STEPS.map((s) => {
  const st = tokens.textStyles[`${s}/${WEIGHTS[s][0][0].toUpperCase()}${WEIGHTS[s][0].slice(1)}`];
  const size = `${fmtVal(st.fontSize, mode)}/${st.lineHeight === 'normal' ? 'normal' : fmtVal(st.lineHeight, mode)}`;
  return `<div class="g-type-row"><code class="text-caption-1 g-muted">${s} · ${WEIGHTS[s].join('/')} · ${size}</code><div>${WEIGHTS[s].map((w) => `<p class="text-${s} font-${w}">에너지와 금융을 연결합니다 Aa 123</p>`).join('')}</div></div>`;
}).join('\n');
const swatches = COLOR_TOKENS.map((t) => `<div class="g-swatch"><span class="g-swatch__chip" style="background:var(--color-${t.replace(/\//g, '-')})"></span><code class="text-caption-1">${t}</code><code class="text-caption-2 g-muted" data-token="${t}"></code></div>`).join('\n');
const brandStyles = PRODUCTS.map((p) => `<style data-brand="${p.id}"${p.id === guide.default.product ? '' : ' media="not all"'}>\n${dist[p.brand]}\n</style>`).join('\n');

// ---------- 포맷 탭 (PPT · SNS) — 화면 요소 준비중. 피그마 Format 변수를 웹 포맷(홈페이지)과 비교하고 그 값으로 글자를 그린다 ----------
const FMT_TOKENS = flat(tokens.format);
const fmtShow = (path, v) => (path.includes('letter-spacing') ? `${v}%` : path.includes('font/weight') ? String(v) : `${v}px`);
const fmtCss = guide.formats.filter((f) => !f.css).map((f) => `.g-fmt[data-fmt="${f.id}"] {\n${FMT_TOKENS.map(([p, t]) => line(p, t, f.mode)).join('\n')}\n}\n[data-format="${f.id}"] .g-fmt[data-fmt="${f.id}"] { display: flex; }`).join('\n');
const formatPanels = guide.formats.filter((f) => !f.css).map((f) => {
  const diffs = FMT_TOKENS.filter(([, t]) => t.$value[f.mode] !== t.$value[FORMAT]);
  const per = PRODUCTS.map((p) => `<span class="g-row g-row--tight">${p.label} ${statusBadge(guide.matrix[p.id][f.id].status)}</span>`).join('');
  const table = diffs.length
    ? `<div class="card"><table class="g-table"><tr><th>변수 format/</th><th>${LABEL[CSS_FORMAT]}</th><th>${f.label}</th></tr>\n${diffs.map(([p, t]) => `<tr><td><code>${p}</code></td><td>${fmtShow(p, t.$value[FORMAT])}</td><td><b>${fmtShow(p, t.$value[f.mode])}</b></td></tr>`).join('\n')}\n</table></div>`
    : `<p class="text-body-2 g-muted">${FMT_TOKENS.length}개 변수가 모두 ${LABEL[CSS_FORMAT]}와 같습니다.</p>`;
  return `<div class="g-fmt" data-fmt="${f.id}">
    <section class="g-section">
      <h2 class="text-heading-4">${f.label}</h2>
      <div class="g-row">${per}</div>
      <div class="callout callout--info"><div><span class="callout__title">화면 요소 준비중</span>지금은 피그마 Format=${f.mode} 변수(글자 크기 · 줄높이 · 자간 · 간격 · 레이아웃)만 있습니다. 색 · 둥글기 · 폰트는 프로덕트(Brand)와 테마를 따르므로 ${LABEL[CSS_FORMAT]}와 같습니다.</div></div>
    </section>
    <section class="g-section">
      <h3 class="text-heading-5">${LABEL[CSS_FORMAT]}와 다른 값 (${diffs.length} / ${FMT_TOKENS.length})</h3>
      ${table}
    </section>
    <section class="g-section">
      <h3 class="text-heading-5">글자 크기 미리보기 · Format=${f.mode}</h3><p class="text-body-2 g-muted g-note">텍스트 스타일 "단계/두께" 를 이 포맷 값으로 그린 것 (크기/줄높이 px)</p>
      <div class="g-type">
${typeRows(f.mode)}
      </div>
    </section>
  </div>`;
}).join('\n');

// ---------- 구성 현황 (프로덕트 × 포맷 · 공통 요소 · 프로덕트별 값) ----------
const brandShow = (t, b) => {
  const ref = (t.$ref?.[b] || '').replace(/^(primitives|brand)\//, '');
  const v = t.$value[b];
  if (t.$type === 'color') return `<span class="g-dot" style="background:${v}"></span>${ref || v} <span class="g-muted">${v}</span>`;
  return `${typeof v === 'number' ? v + 'px' : v}${ref ? ` <span class="g-muted">${ref}</span>` : ''}`;
};
const brandRows = flat(tokens.brand).map(([p, t]) => {
  const same = new Set(PRODUCTS.map((x) => JSON.stringify(t.$value[x.brand]))).size === 1;
  return `<tr class="${same ? 'g-same' : ''}"><td><code>${p}</code></td><td>${same ? '같음' : '<b>프로덕트별</b>'}</td>${PRODUCTS.map((x) => `<td>${brandShow(t, x.brand)}</td>`).join('')}</tr>`;
}).join('\n');
const statusView = `
  <div class="wf-shell g-status">
    <section class="g-section">
      <h2 class="text-heading-4">프로덕트 × 포맷</h2><p class="text-body-2 g-muted g-note">칸을 누르면 그 프로덕트 · 포맷의 디자인 가이드로 이동합니다. 원본: <code>guide.json</code> matrix</p>
      <div class="card g-scroll"><table class="g-table g-matrix">
        <tr><th></th>${guide.formats.map((f) => `<th>${f.label}</th>`).join('')}</tr>
${PRODUCTS.map((p) => `        <tr><th>${p.label}</th>${guide.formats.map((f) => { const c = guide.matrix[p.id][f.id]; return `<td><a class="g-cell" href="?brand=${p.id}&amp;format=${f.id}" data-goto-brand="${p.id}" data-goto-format="${f.id}">${statusBadge(c.status)}<span class="text-caption-1 g-muted">${c.note || ''}</span></a></td>`; }).join('')}</tr>`).join('\n')}
      </table></div>
      <div class="g-legend">${guide.statuses.map((s) => `<span class="g-row g-row--tight">${statusBadge(s.id)}<span class="text-caption-1 g-muted">${s.desc}</span></span>`).join('')}</div>
    </section>
    <section class="g-section">
      <h2 class="text-heading-4">공통 요소</h2><p class="text-body-2 g-muted g-note">모든 프로덕트 · 포맷이 함께 쓰는 층. 피그마 <a href="${figmaNode('index')}" target="_blank" rel="noreferrer">목차</a> 1 Theme → 2 Element → 3 Component</p>
      <div class="card g-scroll"><table class="g-table">
        <tr><th>층</th><th>상태</th><th>내용</th><th>원본 → 코드</th></tr>
${guide.common.map((c) => `        <tr><td><b>${c.label}</b></td><td>${statusBadge(c.status)}</td><td>${c.items}</td><td>${c.source}</td></tr>`).join('\n')}
      </table></div>
    </section>
    <section class="g-section">
      <h2 class="text-heading-4">프로덕트별 값 (Brand)</h2><p class="text-body-2 g-muted g-note">피그마 Brand 컬렉션. 프로덕트를 바꾸면 이 값만 바뀌고 부품 CSS 는 공통입니다. 원본: <code>tokens.json</code> brand</p>
      <div class="card g-scroll"><table class="g-table g-brand-table">
        <tr><th>변수 brand/</th><th>구분</th>${PRODUCTS.map((p) => `<th>${p.label}</th>`).join('')}</tr>
${brandRows}
      </table></div>
    </section>
  </div>`;

// ---------- 히스토리 — 프로덕트 · 포맷 태그와 필터 ----------
const histTags = (h) => [
  ...h.products.map((p) => `<span class="g-tag${p === 'common' ? '' : ' g-tag--product'}">${p === 'common' ? '공통' : LABEL[p]}</span>`),
  ...h.formats.map((f) => `<span class="g-tag g-tag--format">${f === 'common' ? '모든 포맷' : LABEL[f]}</span>`),
].join('');
const histFilter = (name, label, opts) => `<div class="g-switch"><span class="text-caption-1 g-muted">${label}</span>${opts.map(([v, l]) => `<button class="chip" data-hfilter="${name}" data-value="${v}">${l}</button>`).join('')}</div>`;
const histFilters = histFilter('product', '프로덕트', [['all', '전체'], ['common', '공통'], ...PRODUCTS.map((p) => [p.id, p.label])])
  + histFilter('format', '포맷', [['all', '전체'], ['common', '모든 포맷'], ...FORMATS]);

// ---------- 아이콘 — 피그마 2. Element › Icon 을 내보낸 icons/(icons.json + SVG). 크기별 목록 + PNG · SVG 다운로드 ----------
const ICONS = JSON.parse(readFileSync(join(root, 'icons', 'icons.json'), 'utf8'));
const LOGOS = JSON.parse(readFileSync(join(root, 'icons', 'logos.json'), 'utf8')); // 피그마 2. Element › Icon_Logo — 프로덕트별 로고
// 칠·선 색이 모두 밝은 아이콘(흰색 계열)은 어두운 바탕에 보여준다. defs · mask 안의 white 는 모양 정의라 뺀다
const lum = (c) => {
  let h = { white: 'ffffff', black: '000000' }[c.toLowerCase()] || (c.startsWith('#') ? c.slice(1) : null);
  if (!h) return null;
  if (h.length === 3) h = [...h].map((x) => x + x).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const isLightIcon = (svg) => {
  const body = svg.replace(/<defs>[\s\S]*?<\/defs>/g, '').replace(/<mask[\s\S]*?<\/mask>/g, '');
  const ls = [...body.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => lum(m[1])).filter((v) => v !== null);
  return ls.length > 0 && ls.every((v) => v >= 0.8);
};
const iconCard = (i) => {
  const svg = readFileSync(join(root, 'icons', i.file), 'utf8');
  return `<div class="g-icon${isLightIcon(svg) ? ' g-icon--dark' : ''}" data-search="${(i.name + ' ' + i.figma + ' ' + (i.group || '')).toLowerCase()}">
          <div class="g-icon__tile"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${i.width}" height="${i.height}" alt="${i.name}" data-file="${i.size ? `${i.name}_${i.size}` : i.name}"></div>
          <div class="g-icon__meta"><code class="g-icon__name">${i.name.replace(/_/g, '_<wbr>')}</code><span class="text-caption-2 g-muted">${i.figma}</span><span class="text-caption-2 g-muted">${i.width}×${i.height}px${i.duplicateOf ? ' · <b>피그마에 같은 아이콘이 하나 더 있음</b>' : ''}</span></div>
          <div class="g-icon__actions"><button class="btn btn--secondary btn--sm" data-dl="png">PNG 다운로드</button><button class="btn btn--secondary btn--sm" data-dl="svg">SVG 다운로드</button></div>
        </div>`;
};
const iconView = `
  <div class="wf-shell g-icons">
    <section class="g-section">
      <h2 class="text-heading-4">아이콘 · 로고</h2><p class="text-body-2 g-muted g-note">피그마 <a href="${figmaNode('logos')}" target="_blank" rel="noreferrer">2. Element › Icon_Logo</a> 의 로고 ${LOGOS.logos.length}개와 <a href="${figmaNode('icons')}" target="_blank" rel="noreferrer">Icon</a> 의 아이콘 ${ICONS.icons.length}개(크기 ${ICONS.sections.length}종). 원본은 피그마이고 <code>design-system/icons/</code> 는 내보낸 사본입니다.</p>
      <div class="callout callout--info"><div><span class="callout__title">네이밍</span>${ICONS.namingRule.replace(/^네이밍\s*:\s*/, '')}</div></div>
      <div class="g-icon-bar">
        <input class="input g-icon-search" type="search" placeholder="이름으로 찾기 (예: arrow, check)" aria-label="아이콘 찾기">
        <div class="g-switch"><span class="text-caption-1 g-muted">배경</span>${[['auto', '자동'], ['light', '밝게'], ['dark', '어둡게']].map(([v, l]) => `<button class="chip" data-bg="${v}">${l}</button>`).join('')}</div>
        <div class="g-switch"><span class="text-caption-1 g-muted">PNG 배율</span>${[1, 2, 3].map((s) => `<button class="chip" data-pngscale="${s}">${s}x</button>`).join('')}</div>
        <span class="text-caption-1 g-muted g-icon-count"></span>
      </div>
      <nav class="g-icon-jump" aria-label="바로 가기"><a class="chip" href="#icon-logo">로고</a>${ICONS.sections.map((s) => `<a class="chip" href="#icon-${s.size}">${s.size}px</a>`).join('')}</nav>
    </section>
    <div id="icon-logo" class="g-icon-logos">
${LOGOS.groups.map((g, n) => `    <section class="g-section g-icon-sec g-icon-sec--logo" id="icon-logo-${n + 1}">
      <h3 class="text-heading-5">${g.label} <small class="text-body-2 g-muted">${g.count}개 · ${LABEL[g.product]}</small></h3>
      <div class="g-icon-grid">
        ${LOGOS.logos.filter((l) => l.group === g.label).map(iconCard).join('\n        ')}
      </div>
    </section>`).join('\n')}
    </div>
${ICONS.sections.map((s) => `    <section class="g-section g-icon-sec" id="icon-${s.size}" style="--tile: ${Math.max(48, s.size + 24)}px">
      <h3 class="text-heading-5">${s.label} <small class="text-body-2 g-muted">${s.count}개</small></h3>
      <div class="g-icon-grid">
        ${ICONS.icons.filter((i) => i.size === s.size).map(iconCard).join('\n        ')}
      </div>
    </section>`).join('\n')}
  </div>`;

const html = `<!doctype html>
<html lang="ko" data-theme="${guide.default.theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${guide.name}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
${brandStyles}
<style>
${hand}
/* ===== 갤러리 전용 ===== */
* { box-sizing: border-box; margin: 0; padding: 0; }
html { color-scheme: light; } [data-theme="dark"] { color-scheme: dark; }
body { font-family: var(--font-family-base); font-size: var(--font-size-body-1); line-height: var(--font-line-height-body-1); color: var(--color-text-primary); background: var(--color-bg-default); -webkit-font-smoothing: antialiased; }
.g { min-height: 100vh; display: flex; flex-direction: column; }
.g-bar { position: sticky; top: 0; z-index: 10; display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-md); padding: var(--spacing-sm) var(--spacing-md); background: var(--color-bg-default); border-bottom: 1px solid var(--color-border-default); }
.g-switch { display: flex; align-items: center; gap: var(--spacing-xxs); }
.g-tabs { display: flex; gap: var(--spacing-xs); width: 100%; padding-top: var(--spacing-xs); border-top: 1px solid var(--color-border-default); }
.g-tab { padding: var(--spacing-xs) var(--spacing-md); border: 0; border-bottom: 2px solid transparent; background: none; color: var(--color-text-secondary); font: inherit; font-size: var(--font-size-body-2); cursor: pointer; }
.g-tab.is-active { color: var(--color-text-brand); border-bottom-color: var(--color-border-brand); font-weight: 700; }
.g-version { font-weight: 500; margin-left: var(--spacing-xxs); vertical-align: middle; }
.g-views { display: flex; flex-wrap: wrap; gap: var(--spacing-xs); width: 100%; }
.g-view-tab { white-space: nowrap; }
.g-view-tab { padding: var(--spacing-xs) var(--spacing-md); border: 1px solid var(--color-border-default); border-radius: var(--radius-sm); background: var(--color-bg-card); color: var(--color-text-secondary); font: inherit; font-size: var(--font-size-body-2); cursor: pointer; }
.g-view-tab.is-active { background: var(--color-bg-brand); color: var(--color-text-on-brand); border-color: var(--color-bg-brand); font-weight: 700; }
.g-history, .g-status, .g-icons { display: none; flex: 1; padding-block: var(--spacing-xl); flex-direction: column; gap: var(--spacing-2xl); }
[data-view="history"] .g-history, [data-view="status"] .g-status, [data-view="icons"] .g-icons { display: flex; }
.g-table { width: 100%; border-collapse: collapse; font-size: var(--font-size-body-2); line-height: var(--font-line-height-body-2); }
.g-table th, .g-table td { text-align: left; vertical-align: top; padding: var(--spacing-xs) var(--spacing-sm); border-bottom: 1px solid var(--color-border-default); }
.g-table th { color: var(--color-text-tertiary); font-weight: 500; white-space: nowrap; }
.g-table code { background: var(--color-bg-subtle); padding: 0 4px; border-radius: var(--radius-xs); }
.g-hist-date { white-space: nowrap; color: var(--color-text-brand); font-weight: 700; }
.g-hist-text { font-size: var(--font-size-body-3); line-height: var(--font-line-height-body-3); font-weight: var(--font-weight-regular); color: var(--color-text-secondary); }
.g-diagram { position: relative; background: var(--color-bg-subtle); border: 1px solid var(--color-border-default); border-radius: var(--radius-md); padding: var(--spacing-sm) 0; font-size: var(--font-size-caption-1); color: var(--color-text-secondary); text-align: center; }
.g-diagram__band { background: var(--color-bg-brand); color: var(--color-text-on-brand); padding: var(--spacing-xxs); }
.g-diagram__content { width: 81.25%; margin: var(--spacing-xs) auto; padding: var(--spacing-xs); border: 1px dashed var(--color-border-brand); border-radius: var(--radius-sm); }
.g-diagram__list { width: 76.9%; margin: var(--spacing-xs) auto 0; padding: var(--spacing-sm); background: var(--color-bg-card); border: 1px solid var(--color-border-card); border-radius: var(--radius-sm); }
/* 포맷 탭: 웹 포맷(${CSS_FORMAT})은 부품 갤러리(.g-body), 나머지는 포맷 토큰 비교(.g-formats) */
.g-formats { flex: 1; display: none; padding-block: var(--spacing-xl); flex-direction: column; gap: var(--spacing-2xl); }
.g-fmt { display: none; flex-direction: column; gap: var(--spacing-2xl); }
[data-format]:not([data-format="${CSS_FORMAT}"]) .g-body, [data-format]:not([data-format="${CSS_FORMAT}"]) .g-switch--theme { display: none; }
[data-format]:not([data-format="${CSS_FORMAT}"]) .g-formats { display: flex; }
${fmtCss}
/* 보기 전환: 구성 현황 · 히스토리에서는 가이드 화면과 상단 전환을 숨긴다 (포맷 규칙보다 뒤에 둔다) */
[data-view]:not([data-view="guide"]) :is(.g-body, .g-formats, .g-switch--top, .g-tabs, .g-figma-note) { display: none; }
/* 구성 현황 · 히스토리 */
.g-scroll { overflow-x: auto; }
.g-row--tight { gap: var(--spacing-xxs); }
.g-legend { display: flex; flex-wrap: wrap; gap: var(--spacing-xs) var(--spacing-md); }
.g-table .badge { white-space: nowrap; }
.g-matrix { table-layout: fixed; min-width: 640px; }
.g-matrix th:first-child { width: 112px; }
@media (max-width: 720px) { .g-table th { white-space: normal; } }
.g-cell { display: flex; flex-direction: column; align-items: flex-start; gap: var(--spacing-xxs); margin: calc(-1 * var(--spacing-xxs)); padding: var(--spacing-xxs); border-radius: var(--radius-sm); color: inherit; text-decoration: none; }
.g-cell:hover { background: var(--color-bg-subtle); }
.g-dot { display: inline-block; width: 12px; height: 12px; margin-right: var(--spacing-xxs); border-radius: var(--radius-xs); border: 1px solid var(--color-border-default); vertical-align: -1px; }
.g-brand-table td { white-space: nowrap; }
.g-same td { color: var(--color-text-tertiary); }
.g-filters { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-sm) var(--spacing-lg); }
.g-hist-tagcell { width: 1%; }
.g-hist-tags { display: flex; flex-wrap: wrap; gap: var(--spacing-xxs); min-width: 140px; }
.g-tag { display: inline-flex; align-items: center; height: 20px; padding-inline: var(--spacing-xxs-plus); border: 1px solid var(--color-border-default); border-radius: var(--radius-pill); font-size: var(--font-size-caption-2); color: var(--color-text-secondary); white-space: nowrap; }
.g-tag--product { color: var(--color-text-brand); border-color: var(--color-border-brand); font-weight: 700; }
.g-tag--format { border-style: dashed; }
/* 아이콘 — 아이콘 색은 고정이라 바탕도 테마와 상관없이 고정(원시 값 white · gray/800) */
.g-icon-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-sm) var(--spacing-lg); }
.g-icon-search { max-width: 320px; }
.g-icon-jump { display: flex; flex-wrap: wrap; gap: var(--spacing-xs); }
.g-icon-jump .chip { text-decoration: none; }
.g-icon-sec, .g-icon-logos { scroll-margin-top: 140px; }
.g-icon-logos { display: flex; flex-direction: column; gap: var(--spacing-2xl); }
/* 로고는 가로로 길어서 바탕 칸을 로고 크기에 맞추고 칸 폭을 넓힌다 */
.g-icon-sec--logo .g-icon-grid { grid-template-columns: repeat(auto-fill, minmax(min(100%, 640px), 1fr)); }
.g-icon-sec--logo .g-icon { flex-wrap: wrap; align-items: flex-start; }
.g-icon-sec--logo .g-icon__tile { flex: 1 1 100%; width: auto; height: auto; justify-content: start; padding: var(--spacing-lg); }
.g-icon-sec[hidden], .g-icon[hidden] { display: none; }
.g-icon-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: var(--spacing-sm); }
.g-icon { display: flex; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-sm); border: 1px solid var(--color-border-default); border-radius: var(--radius-md); background: var(--color-bg-card); color: var(--color-text-on-card); }
.g-icon__tile { flex: none; display: grid; place-items: center; width: var(--tile); height: var(--tile); border-radius: var(--radius-sm); background: var(--white); border: 1px solid var(--gray-200); }
.g-icon--dark .g-icon__tile, [data-iconbg="dark"] .g-icon__tile { background: var(--gray-800); border-color: var(--gray-800); }
[data-iconbg="light"] .g-icon__tile { background: var(--white); border-color: var(--gray-200); }
.g-icon__tile img { display: block; max-width: 100%; height: auto; }
.g-icon__meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.g-icon__name { font-size: var(--font-size-body-2); font-weight: 700; overflow-wrap: anywhere; }
.g-icon__actions { flex: none; display: flex; flex-direction: column; gap: var(--spacing-xxs); }
.g-icon__actions .btn { white-space: nowrap; }
@media (max-width: 720px) {
  .g-icon-grid { grid-template-columns: minmax(0, 1fr); }
  .g-icon-search { max-width: none; }
  .g-icon { flex-wrap: wrap; }
  .g-icon__actions { flex-direction: row; width: 100%; }
  .g-icon__actions .btn { flex: 1; }
}
.g-body { flex: 1; padding-block: var(--spacing-xl); display: flex; flex-direction: column; gap: var(--spacing-2xl); }
.g-section { display: flex; flex-direction: column; gap: var(--spacing-md); }
.g-note { margin-top: calc(-1 * var(--spacing-xs)); }
.g-muted { color: var(--color-text-tertiary); }
.g-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-sm); }
.g-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--spacing-md); }
.g-grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--spacing-md); }
.g-form { display: flex; flex-direction: column; gap: var(--spacing-md); padding: 0; }
.g-type-row { display: grid; grid-template-columns: 200px 1fr; gap: var(--spacing-md); align-items: center; padding-block: var(--spacing-sm); border-bottom: 1px solid var(--color-border-default); }
.g-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--spacing-sm); }
.g-swatch { display: flex; flex-direction: column; gap: var(--spacing-xxs); }
.g-swatch__chip { display: block; height: 40px; border-radius: var(--radius-sm); border: 1px solid var(--color-border-default); }
.g-footer { padding-block: var(--spacing-lg); }
.g-howto { font-size: var(--font-size-body-2); line-height: var(--font-line-height-body-2); color: var(--color-text-secondary); display: flex; flex-direction: column; gap: var(--spacing-xs); }
.g-howto code { background: var(--color-bg-subtle); padding: 0 4px; border-radius: var(--radius-xs); }
@media (max-width: 720px) { .g-type-row { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main class="g">
  <header class="g-bar">
    <strong class="text-heading-6">${guide.name}${VERSION ? ` <small class="g-version text-caption-1 g-muted">${VERSION}</small>` : ''}</strong>
    <nav class="g-views" aria-label="보기">${VIEWS.map(([v, l]) => `<button class="g-view-tab" data-set="view" data-value="${v}">${l}</button>`).join('')}</nav>
    <div class="g-switch g-switch--top"><span class="text-caption-1 g-muted">Product</span>${chips('brand', PRODUCTS.map((p) => [p.id, p.label]))}</div>
    <div class="g-switch g-switch--top g-switch--theme"><span class="text-caption-1 g-muted">Theme</span>${chips('theme', THEMES.map((t) => [t.toLowerCase(), t.toLowerCase()]))}</div>
    <span class="text-caption-1 g-muted g-figma-note">피그마 <a href="${FIGMA_FILE}" target="_blank" rel="noreferrer">${guide.figma.name}</a> 변수 기준</span>
    <nav class="g-tabs" aria-label="포맷">${FORMATS.map(([v, l]) => `<button class="g-tab" data-set="format" data-value="${v}">${l}</button>`).join('')}</nav>
  </header>

  <div class="wf-shell g-formats">
${formatPanels}
  </div>
${iconView}
${statusView}

  <div class="wf-shell g-history">
    <section class="g-section">
      <h2 class="text-heading-4">히스토리</h2><p class="text-body-2 g-muted g-note">디자인 가이드가 바뀐 기록. 최신이 아래. 프로덕트 · 포맷을 고르면 공통 항목도 함께 보입니다. 원본: <code>guide.json</code> history · 피그마 <a href="${figmaNode('ops')}" target="_blank" rel="noreferrer">P8 운영 정보</a></p>
      <div class="g-filters">${histFilters}<span class="text-caption-1 g-muted g-hist-count"></span></div>
      <div class="card g-scroll"><table class="g-table">
${HISTORY.map((h) => `        <tr class="g-hist-row" data-products="${h.products.join(' ')}" data-formats="${h.formats.join(' ')}"><td class="g-hist-date">${h.date}</td><td class="g-hist-tagcell"><div class="g-hist-tags">${histTags(h)}</div></td><td class="g-hist-text">${h.text}</td></tr>`).join('\n')}
      </table></div>
    </section>
    <section class="g-section">
      <h2 class="text-heading-4">사용 주의사항</h2><p class="text-body-2 g-muted g-note">값이 두 곳으로 갈라지지 않게 지키는 규칙</p>
      <div class="card g-scroll"><table class="g-table">
${CAVEATS.map(([h, t]) => `        <tr><th>${h}</th><td>${t}</td></tr>`).join('\n')}
      </table></div>
    </section>
  </div>

  <div class="wf-shell g-body">
    <section class="g-section">
      <h2 class="text-heading-4">0-1. 홈페이지 규격</h2><p class="text-body-2 g-muted g-note">피그마 0 Overview · <a href="${FIGMA_P9}" target="_blank" rel="noreferrer">P9 홈페이지</a> 기준. 코드는 <code>layout.css</code></p>
      <div class="g-grid-2">
        <div class="card">
          <p class="text-heading-6">화면 구간 (Breakpoint)</p>
          <table class="g-table">
            <tr><th>구간</th><th>규칙</th><th>토큰 layout/</th></tr>
${SPEC_BREAKPOINTS.map(([r, d, t]) => `            <tr><td>${r}</td><td>${d}</td><td><code>${t}</code></td></tr>`).join('\n')}
          </table>
        </div>
        <div class="card">
          <p class="text-heading-6">콘텐츠 최대 폭</p>
          <table class="g-table">
            <tr><th>종류</th><th>폭</th><th>규칙</th><th>변수</th></tr>
${SPEC_WIDTHS.map(([k, w, d, v]) => `            <tr><td>${k}</td><td><b>${w}</b></td><td>${d}</td><td><code>${v}</code></td></tr>`).join('\n')}
          </table>
          <p class="text-body-2 g-muted" style="margin-top:var(--spacing-sm)"><b>GNB · 푸터</b> — 배경과 구분선은 항상 화면 전체 폭. 그 밖의 모든 콘텐츠는 위 최대 폭 안에서 가운데 정렬.</p>
          <p class="text-body-2 g-muted" style="margin-top:var(--spacing-xs)"><b>토큰</b> — breakpoint xl 1600 · lg 1200 · md 1024 · sm 720 · min 280 / margin desktop 20 · tablet 16 · mobile 16 / max-width content 1560 · list 1200 · form 688. 모두 Primitives(size/*, spacing/*)에서 파생. 코드: <code>var(--layout-max-width-content)</code></p>
        </div>
      </div>
      <div class="g-diagram">
        <div class="g-diagram__band">GNB — 화면 전체 폭</div>
        <div class="g-diagram__content">콘텐츠 최대 1560px · 가운데 정렬<div class="g-diagram__list">목록 최대 1200px</div></div>
        <div class="g-diagram__band">푸터 — 화면 전체 폭</div>
        <p style="margin-top:var(--spacing-xs)">※ 1920px 화면 기준 축소 예시. 좌우 빈 공간은 배경색으로 채웁니다.</p>
      </div>
    </section>

    <section class="g-section">
      <h2 class="text-heading-4">1. 버튼</h2><p class="text-body-2 g-muted g-note">.btn + 변형(--primary --secondary --point --ghost --ghost-gray --text) + 크기(--sm --lg --block)</p>
      <div class="g-row">
        <button class="btn btn--point btn--lg">랜딩 주 CTA</button><button class="btn btn--secondary btn--lg">랜딩 보조</button><button class="btn btn--primary">화면 주 행동</button><button class="btn btn--secondary">보조 행동</button><button class="btn btn--primary btn--sm">상단 메뉴</button><button class="btn btn--ghost">조용한 행동</button><button class="btn btn--ghost-gray">회색 고스트</button><button class="btn btn--text">텍스트 버튼 →</button><button class="btn btn--primary" disabled>비활성</button>
      </div>
      <button class="btn btn--primary btn--block">거래 · 폼 주 행동 (block)</button>
    </section>

    <section class="g-section">
      <h2 class="text-heading-4">2. 카드</h2><p class="text-body-2 g-muted g-note">.card + 변형(--outlined --subtle --kpi) · 그림자 .shadow-sm/md/lg</p>
      <div class="g-grid-3">
        <div class="card"><div class="card__title">기본 카드</div><p class="card__desc">border/default · radius/card · 배경 bg/default</p></div>
        <div class="card card--outlined shadow-md"><div class="card__title">Outlined + shadow/md</div><p class="card__desc">다크에서는 그림자 대신 1px 테두리(border/elevation)</p></div>
        <div class="card card--subtle"><div class="card__title">Subtle</div><p class="card__desc">bg/subtle 배경</p></div>
        <div class="card card--kpi"><p class="card__desc">누적 발전량</p><div class="card__value">1,284 MWh</div><span class="text-caption-1 card__delta-up">▲ 12.4% 전월 대비</span></div>
        <div class="card card--kpi"><p class="card__desc">월 정산 이자</p><div class="card__value">₩ 3,920,000</div><span class="text-caption-1 card__delta-down">▼ 2.1%</span></div>
        <div class="card shadow-lg"><div class="card__title">shadow/lg</div><p class="card__desc">key + ambient 2겹</p></div>
      </div>
    </section>

    <section class="g-section">
      <h2 class="text-heading-4">3. 입력창 · 폼</h2><p class="text-body-2 g-muted g-note">.field .input .check .switch · 폼 최대 폭 688</p>
      <div class="wf-shell--form g-form">
        <div class="field"><label class="field__label">이름 <span class="req">*</span></label><input class="input" placeholder="홍길동"><span class="field__help">실명을 입력해 주세요</span></div>
        <div class="field"><label class="field__label">이메일</label><input class="input" value="user@example.com" aria-invalid="true"><span class="field__help field__help--error">올바른 이메일 형식이 아닙니다</span></div>
        <div class="field"><label class="field__label">조합원 번호</label><input class="input" value="WF-2026-0042" readonly><span class="field__help">읽기 전용 (DB 값)</span></div>
        <div class="field"><label class="field__label">비활성</label><input class="input" placeholder="입력 불가" disabled></div>
        <div class="field"><label class="field__label">문의 내용</label><textarea class="input" placeholder="문의 남겨주시면 3영업일 이내 답변드립니다"></textarea></div>
        <div class="g-row"><label class="check"><input type="checkbox" checked> 개인정보 수집 동의</label><label class="check"><input type="radio" name="r" checked> 개인</label><label class="check"><input type="radio" name="r"> 법인</label><button class="switch" role="switch" aria-checked="true" onclick="this.setAttribute('aria-checked', this.getAttribute('aria-checked')==='true'?'false':'true')"></button></div>
      </div>
    </section>

    <section class="g-section">
      <h2 class="text-heading-4">4. 콜아웃</h2><p class="text-body-2 g-muted g-note">.callout + --info --tip --warn --error --point</p>
      <div class="g-grid-2">
        <div class="callout callout--info"><div><span class="callout__title">안내</span>세후 수익률은 금리 변동에 따라 달라질 수 있습니다.</div></div>
        <div class="callout callout--tip"><div><span class="callout__title">팁</span>출자와 납입을 한 번에 이체하면 수수료가 없습니다.</div></div>
        <div class="callout callout--warn"><div><span class="callout__title">주의</span>본인인증 후 24시간 안에 계약을 완료해 주세요.</div></div>
        <div class="callout callout--error"><div><span class="callout__title">오류</span>계좌 정보를 확인할 수 없습니다.</div></div>
        <div class="callout callout--point"><div><span class="callout__title">포인트</span>이번 달 모집 마감 D-3</div></div>
      </div>
    </section>

    <section class="g-section">
      <h2 class="text-heading-4">5. 표</h2><p class="text-body-2 g-muted g-note">.table (+ --subtle) · 목록 최대 폭 1200</p>
      <div class="wf-shell--list" style="padding:0">
        <table class="table">
          <thead><tr><th>회차</th><th>납입일</th><th class="num">납입액</th><th class="num">이자</th><th>상태</th></tr></thead>
          <tbody>
            <tr><td>1회차</td><td>2026-09-25</td><td class="num">1,000,000</td><td class="num">8,333</td><td><span class="badge badge--success">완료</span></td></tr>
            <tr><td>2회차</td><td>2026-10-25</td><td class="num">1,000,000</td><td class="num">8,333</td><td><span class="badge badge--warning">예정</span></td></tr>
            <tr><td>3회차</td><td>2026-11-25</td><td class="num">1,000,000</td><td class="num">—</td><td><span class="badge badge--gray">대기</span></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="g-section">
      <h2 class="text-heading-4">6. 배지 · 칩 · 진행 바</h2><p class="text-body-2 g-muted g-note">.badge · .chip.is-active · .progress</p>
      <div class="g-row"><span class="badge badge--primary">NEW</span><span class="badge badge--gray">마감</span><span class="badge badge--warning">모집 중</span><span class="badge badge--success">승인</span></div>
      <div class="chips"><button class="chip is-active">전체</button><button class="chip">태양광</button><button class="chip">풍력</button><button class="chip">ESS</button></div>
      <div class="progress" aria-label="모집률 68%"><span style="width:68%"></span></div>
    </section>

    <section class="g-section">
      <h2 class="text-heading-4">6-1. 세그먼트 · 탭 · 페이지네이션</h2><p class="text-body-2 g-muted g-note">.segment .segment__item · .tabs .tab · .pagination (피그마 Segment/60 · 48/Tab Item · 36/Pagination)</p>
      <div class="g-grid-2">
        <div class="segment" role="group"><button class="segment__item" aria-pressed="true">검토 신청 <span class="badge badge--success">추천</span></button><button class="segment__item">간편조회</button></div>
        <div class="tabs" role="tablist"><button class="tab" aria-selected="true">탭 이름</button><button class="tab">탭 이름</button><button class="tab" disabled>탭 이름</button></div>
      </div>
      <nav class="pagination" aria-label="페이지"><button class="pagination__arrow pagination__arrow--prev" disabled aria-label="이전"></button><a class="pagination__page" aria-current="page" href="#">1</a><a class="pagination__page" href="#">2</a><a class="pagination__page" href="#">3</a><a class="pagination__page" href="#">4</a><a class="pagination__page" href="#">5</a><button class="pagination__arrow pagination__arrow--next" aria-label="다음"></button></nav>
    </section>

    <section class="g-section">
      <h2 class="text-heading-4">6-2. 휴대폰 · 날짜 · 선택 상자 · CTA 바</h2><p class="text-body-2 g-muted g-note">.input--phone · .input--date · .input--select · .menu · .cta (피그마 Input/Phone · Calendar · dropdown · CTA)</p>
      <div class="wf-shell--form g-form">
        <div class="field"><label class="field__label">휴대전화 번호 <span class="req">*</span></label><input class="input input--phone" type="tel" inputmode="numeric" placeholder="010-1234-5678"><span class="field__help">숫자만 입력하면 자동으로 형식이 맞춰집니다.</span></div>
        <div class="field"><label class="field__label">날짜 <span class="req">*</span></label><input class="input input--date" type="date" value="2026-06-27"></div>
        <div class="field"><label class="field__label">dropdown <span class="req">*</span></label><select class="input input--select"><option value="" selected disabled>선택</option><option>공장/창고</option><option>상가</option></select></div>
        <div class="menu"><button class="menu__item is-active">공장/창고</button><button class="menu__item">공장/창고</button><button class="menu__item">풀버전 다 노출시켜주세요 내용은 다 노출시켜주세요</button></div>
        <div class="cta cta--shadow"><button class="btn btn--primary">CTA 버튼</button></div>
        <div class="cta"><button class="btn btn--reset">초기화</button><button class="btn btn--primary">CTA 버튼</button></div>
        <div class="cta cta--m"><button class="btn btn--primary">CTA 버튼 (M)</button></div>
      </div>
    </section>

    <section class="g-section">
      <h2 class="text-heading-4">6-3. 아코디언</h2><p class="text-body-2 g-muted g-note">.accordion · .accordion__body (피그마 Accordion, State=Closed/Open). 닫힘·열림 모두 16 리듬, 본문 상자 안쪽 16</p>
      <div class="wf-shell--form">
        <details class="accordion"><summary>내 돈은 어디에 쓰이나요?</summary><div class="accordion__body">투자금은 조합 명의 계좌로 입금되어 연결된 지붕 발전소에 사용됩니다.</div></details>
        <details class="accordion" open><summary>이자는 어떻게 지급되나요?</summary><div class="accordion__body">매월 정해진 날, 세금을 원천징수한 세후 금액이 등록 계좌로 입금됩니다.</div></details>
        <details class="accordion"><summary>위험 안내</summary><div class="accordion__body">수익률은 목표치이며 변동될 수 있습니다. 원금 손실이 발생할 수 있습니다.</div></details>
      </div>
    </section>

    <section class="g-section">
      <h2 class="text-heading-4">7. 모션</h2><p class="text-body-2 g-noted g-muted g-note">.reveal (스크롤 등장) · .hover-lift · 시간/곡선은 motion.css 변수</p>
      <div class="g-grid-3">
        <div class="card reveal is-visible hover-lift"><div class="card__title">hover-lift</div><p class="card__desc">마우스를 올리면 살짝 떠오름</p></div>
        <div class="card reveal" data-reveal><div class="card__title">reveal</div><p class="card__desc">화면에 들어오면 올라오며 나타남</p></div>
        <div class="card reveal" data-reveal style="--reveal-delay: var(--motion-stagger)"><div class="card__title">reveal + stagger</div><p class="card__desc">한 박자 늦게</p></div>
      </div>
    </section>

    <section class="g-section">
      <h2 class="text-heading-4">8. 타이포그래피</h2><p class="text-body-2 g-muted g-note">텍스트 스타일 "단계/두께" = .text-&lt;단계&gt; + .font-&lt;두께&gt;</p>
      <div class="g-type">
${typeRows(FORMAT)}
      </div>
    </section>

    <section class="g-section">
      <h2 class="text-heading-4">9. 색 토큰 (Theme)</h2><p class="text-body-2 g-muted g-note">현재 Product · Theme 에서 실제로 계산된 값</p>
      <div class="g-swatches">
${swatches}
      </div>
    </section>
  </div>
  <footer class="wf-band"><div class="wf-shell g-footer text-body-2 font-medium">푸터 — 화면 전체 폭 · 안쪽 내용은 1560px 셸</div></footer>
</main>
<script>
(function () {
  var html = document.documentElement;
  var q = new URLSearchParams(location.search);
  var DEF = ${JSON.stringify(guide.default)};
  var PRODUCTS = ${JSON.stringify(PRODUCTS.map((p) => p.id))}, FORMATS = ${JSON.stringify(FORMATS.map(([v]) => v))}, VIEWS = ${JSON.stringify(VIEWS.map(([v]) => v))};
  function pick(list, v, d) { return list.indexOf(v) >= 0 ? v : d; }
  var brand = pick(PRODUCTS, q.get('brand'), DEF.product);
  if (q.get('theme')) html.setAttribute('data-theme', q.get('theme'));
  var format = pick(FORMATS, q.get('format'), DEF.format);
  function setFormat(f) { format = f; html.setAttribute('data-format', f); }
  var view = pick(VIEWS, q.get('view'), 'guide');
  function setView(v) { view = v; html.setAttribute('data-view', v); }
  function setBrand(b) {
    brand = b;
    document.querySelectorAll('style[data-brand]').forEach(function (s) { if (s.dataset.brand === b) s.removeAttribute('media'); else s.setAttribute('media', 'not all'); });
  }
  // 지금 상태를 주소에 남긴다 — 주소를 복사하면 같은 화면이 열린다 (브라우저가 막으면 무시)
  function saveUrl() {
    var p = new URLSearchParams();
    if (brand !== DEF.product) p.set('brand', brand);
    if (html.getAttribute('data-theme') !== DEF.theme) p.set('theme', html.getAttribute('data-theme'));
    if (format !== DEF.format) p.set('format', format);
    if (view !== 'guide') p.set('view', view);
    try { history.replaceState(null, '', (p.toString() ? '?' + p.toString() : location.pathname) + location.hash); } catch (e) {}
  }
  function sync() {
    saveUrl();
    document.querySelectorAll('.chip[data-set=brand]').forEach(function (c) { c.classList.toggle('is-active', c.dataset.value === brand); });
    document.querySelectorAll('.chip[data-set=theme]').forEach(function (c) { c.classList.toggle('is-active', html.getAttribute('data-theme') === c.dataset.value); });
    document.querySelectorAll('.g-tab[data-set=format]').forEach(function (c) { c.classList.toggle('is-active', c.dataset.value === format); });
    document.querySelectorAll('.g-view-tab[data-set=view]').forEach(function (c) { c.classList.toggle('is-active', c.dataset.value === view); });
    var cs = getComputedStyle(html);
    document.querySelectorAll('[data-token]').forEach(function (el) { el.textContent = cs.getPropertyValue('--color-' + el.dataset.token.replace(/\\//g, '-')).trim(); });
  }
  document.querySelectorAll('.chip[data-set=brand]').forEach(function (c) { c.addEventListener('click', function () { setBrand(c.dataset.value); sync(); }); });
  document.querySelectorAll('.chip[data-set=theme]').forEach(function (c) { c.addEventListener('click', function () { html.setAttribute('data-theme', c.dataset.value); sync(); }); });
  document.querySelectorAll('.g-tab[data-set=format]').forEach(function (c) { c.addEventListener('click', function () { setFormat(c.dataset.value); sync(); }); });
  document.querySelectorAll('.g-view-tab[data-set=view]').forEach(function (c) { c.addEventListener('click', function () { setView(c.dataset.value); sync(); }); });
  setBrand(brand); setFormat(format); setView(view); sync();
  // 구성 현황의 칸 → 그 프로덕트 · 포맷의 디자인 가이드
  document.querySelectorAll('[data-goto-brand]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); setBrand(a.dataset.gotoBrand); setFormat(a.dataset.gotoFormat); setView('guide'); sync(); window.scrollTo(0, 0); }); });
  // 히스토리 필터 — 프로덕트(또는 포맷)를 고르면 그 태그 항목 + 공통 항목
  var hf = { product: 'all', format: 'all' };
  var rows = document.querySelectorAll('.g-hist-row');
  function hit(list, v) { return v === 'all' || list.indexOf(v) >= 0 || (v !== 'common' && list.indexOf('common') >= 0); }
  function filterHistory() {
    var n = 0;
    rows.forEach(function (r) { var ok = hit(r.dataset.products.split(' '), hf.product) && hit(r.dataset.formats.split(' '), hf.format); r.hidden = !ok; if (ok) n++; });
    document.querySelectorAll('.chip[data-hfilter]').forEach(function (c) { c.classList.toggle('is-active', hf[c.dataset.hfilter] === c.dataset.value); });
    document.querySelector('.g-hist-count').textContent = n + ' / ' + rows.length + '건';
  }
  document.querySelectorAll('.chip[data-hfilter]').forEach(function (c) { c.addEventListener('click', function () { hf[c.dataset.hfilter] = c.dataset.value; filterHistory(); }); });
  filterHistory();
  // 아이콘 — 찾기 · 배경 · PNG 배율 · 다운로드. PNG 는 내장 SVG 를 그 자리에서 캔버스에 그려 만든다
  var iconBg = 'auto', pngScale = 1, iconCards = document.querySelectorAll('.g-icon');
  function iconUi() {
    html.setAttribute('data-iconbg', iconBg);
    document.querySelectorAll('.chip[data-bg]').forEach(function (c) { c.classList.toggle('is-active', c.dataset.bg === iconBg); });
    document.querySelectorAll('.chip[data-pngscale]').forEach(function (c) { c.classList.toggle('is-active', +c.dataset.pngscale === pngScale); });
  }
  function iconFilter() {
    var q = document.querySelector('.g-icon-search').value.trim().toLowerCase(), n = 0;
    iconCards.forEach(function (card) { var ok = !q || card.dataset.search.indexOf(q) >= 0; card.hidden = !ok; if (ok) n++; });
    document.querySelectorAll('.g-icon-sec').forEach(function (s) { s.hidden = !s.querySelector('.g-icon:not([hidden])'); });
    document.querySelector('.g-icon-count').textContent = n + ' / ' + iconCards.length + '개';
  }
  function saveFile(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function svgText(img) {
    var bin = atob(img.src.slice(img.src.indexOf(',') + 1));
    return new TextDecoder().decode(Uint8Array.from(bin, function (ch) { return ch.charCodeAt(0); }));
  }
  document.querySelectorAll('.chip[data-bg]').forEach(function (c) { c.addEventListener('click', function () { iconBg = c.dataset.bg; iconUi(); }); });
  document.querySelectorAll('.chip[data-pngscale]').forEach(function (c) { c.addEventListener('click', function () { pngScale = +c.dataset.pngscale; iconUi(); }); });
  document.querySelector('.g-icon-search').addEventListener('input', iconFilter);
  document.querySelectorAll('[data-dl]').forEach(function (b) { b.addEventListener('click', function () {
    var img = b.closest('.g-icon').querySelector('img'), name = img.dataset.file;
    if (b.dataset.dl === 'svg') return saveFile(new Blob([svgText(img)], { type: 'image/svg+xml' }), name + '.svg');
    var w = +img.getAttribute('width') * pngScale, h = +img.getAttribute('height') * pngScale, src = new Image();
    src.onload = function () {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(src, 0, 0, w, h);
      c.toBlob(function (blob) { saveFile(blob, name + (pngScale > 1 ? '@' + pngScale + 'x' : '') + '.png'); }, 'image/png');
    };
    src.src = img.src;
  }); });
  iconUi(); iconFilter();
  // 주소의 #icon-72 같은 위치로 이동 — 보기가 정해진 뒤에야 그 섹션이 보이므로 여기서 한 번 더 스크롤
  var target = location.hash && document.getElementById(location.hash.slice(1));
  if (target) target.scrollIntoView();
  // 스크롤 등장 (motion.css .reveal) — 사이트의 useReveal 훅과 같은 동작
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } }); }, { threshold: 0.2 });
  document.querySelectorAll('[data-reveal]').forEach(function (el) { io.observe(el); });
})();
</script>
</body>
</html>
`;
mkdirSync(join(design, 'gallery'), { recursive: true });
writeFileSync(join(design, 'gallery', 'index.html'), html);
copyFileSync(join(root, 'tokens.json'), join(design, 'gallery', 'tokens.json'));
copyFileSync(join(root, 'guide.json'), join(design, 'gallery', 'guide.json'));

console.log(`built → design/design-system/dist/{${BRANDS.map((b) => b.toLowerCase()).join(',')}}.css · design/gallery/index.html · design/gallery/tokens.json · design/gallery/guide.json · 아이콘 ${ICONS.icons.length}개 · 로고 ${LOGOS.logos.length}개${existsSync(site) ? ' · code/wattpin-main/app/styles/' : ''}`);
