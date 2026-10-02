/**
 * Regenerate `icons/*.svg` — the seven-piece black-line set — from the geometry
 * that lives in `client.js`.
 *
 * The plugin has no build step, so `client.js` cannot be imported normally: it
 * executes `window.__ModuleLoader__.load(...)` at module scope. This script
 * installs the same minimal stubs the test harness uses, reads the `__glyphs`
 * tooling seam off the plugin object, and writes one file per mark.
 *
 * The emitted files keep the reference's own paint: `fill="none"`, a fixed
 * `#1f2328` stroke, 2/56 weight, round caps and joins. The in-plugin renderer
 * binds the same geometry to `currentColor` instead, so it survives a dark theme.
 *
 * Run: node scripts/emit-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'icons');

/** Stroke and viewBox of the accepted reference. */
const VIEW_BOX = '0 0 56 56';
const STROKE = '#1f2328';
const STROKE_WIDTH = 2;

/* ── the same stubs test/client-smoke.mjs uses ────────────────────────────── */

let plugin = null;
globalThis.window = {
  document: { addEventListener() {}, removeEventListener() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  setTimeout: () => 0,
  clearTimeout() {},
  __ModuleLoader__: { load({ id, factory }) { plugin = { id, exports: factory(() => ({})) }; } },
};

await import(new URL('../client.js', import.meta.url).href);

const glyphs = plugin && plugin.exports && plugin.exports.__glyphs;
if (glyphs === undefined) throw new Error('client.js exposed no __glyphs tooling seam');

/* ── serialization ────────────────────────────────────────────────────────── */

const align = (depth) => '  '.repeat(depth);

/**
 * React wants `strokeDasharray`; an SVG file wants `stroke-dasharray`. The glyph
 * table stores the React spelling, so the file spelling is derived here.
 */
const attrName = (key) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** One spec node — `[tag, props]` or `[tag, props, children]` — as SVG text. */
function serialize(spec, depth) {
  const [tag, props, children] = spec;
  const attributes = Object.entries(props)
    .map(([key, value]) => `${attrName(key)}="${value}"`)
    .join(' ');
  if (children === undefined) return `${align(depth)}<${tag} ${attributes} />`;
  const inner = children.map((child) => serialize(child, depth + 1)).join('\n');
  return `${align(depth)}<${tag} ${attributes}>\n${inner}\n${align(depth)}</${tag}>`;
}

mkdirSync(outDir, { recursive: true });

/** Inline `<svg>` for one mark, with the stroke bound to a colour of choice. */
function inlineSvg(glyph, stroke, extra = '') {
  const body = glyph.nodes.map((node) => serialize(node, 1)).join('\n');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="${VIEW_BOX}"`,
    `     fill="none" stroke="${stroke}" stroke-width="${STROKE_WIDTH}"`,
    `     stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${glyph.label}"${extra}>`,
    body,
    '</svg>',
  ].join('\n');
}

const written = [];
for (const [name, glyph] of Object.entries(glyphs)) {
  writeFileSync(join(outDir, `${name}.svg`), `${inlineSvg(glyph, STROKE)}\n`, 'utf8');
  written.push(`${name}.svg  (${glyph.label})`);
}

/* A contact sheet: the seven files as shipped, then the same geometry bound to
   currentColor on a light and a dark surface — which is what the plugin renders. */
const entries = Object.entries(glyphs);
const sheet = [
  '<!doctype html>',
  '<html lang="zh-CN"><head><meta charset="utf-8">',
  '<title>黑边线条图标七件套 · 对照</title>',
  '<style>',
  '  body { margin: 0; font: 14px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }',
  '  section { padding: 24px 28px; }',
  '  h2 { margin: 0 0 4px; font-size: 15px; font-weight: 600; }',
  '  p { margin: 0 0 18px; font-size: 12px; opacity: .7; }',
  '  .row { display: flex; flex-wrap: wrap; gap: 26px; }',
  '  figure { margin: 0; text-align: center; }',
  '  figcaption { margin-top: 6px; font-size: 12px; opacity: .75; }',
  '  .light { background: #ffffff; color: #1f2328; }',
  '  .dark { background: #1b1e22; color: #e6e8ee; }',
  '</style></head><body>',
  '<section class="light">',
  '  <h2>基准墨色（icons/*.svg 原样）</h2>',
  '  <p>固定 #1f2328 描边，与《黑边线条图标七件套.html》逐条一致。适合浅色底。</p>',
  '  <div class="row">',
  ...entries.map(([name, glyph]) => `    <figure><img src="${name}.svg" width="56" height="56" alt="${glyph.label}"><figcaption>${glyph.label}</figcaption></figure>`),
  '  </div>',
  '</section>',
  '<section class="light">',
  '  <h2>插件内渲染 · 浅色主题</h2>',
  '  <p>几何完全相同，只是把描边绑到 currentColor；浅色主题下就是黑线。</p>',
  '  <div class="row">',
  ...entries.map(([name, glyph]) => `    <figure>${inlineSvg(glyph, 'currentColor')}<figcaption>${glyph.label}</figcaption></figure>`),
  '  </div>',
  '</section>',
  '<section class="dark">',
  '  <h2>插件内渲染 · 暗色主题</h2>',
  '  <p>同一份几何，currentColor 跟随文字色 —— 纯黑在这里会看不见，所以插件里不写死颜色。</p>',
  '  <div class="row">',
  ...entries.map(([name, glyph]) => `    <figure>${inlineSvg(glyph, 'currentColor')}<figcaption>${glyph.label}</figcaption></figure>`),
  '  </div>',
  '</section>',
  '</body></html>',
  '',
].join('\n');
writeFileSync(join(outDir, 'preview.html'), sheet, 'utf8');
written.push('preview.html  (对照预览)');

console.log(`wrote ${written.length} files to ${outDir}:`);
for (const line of written) console.log(`  ${line}`);
