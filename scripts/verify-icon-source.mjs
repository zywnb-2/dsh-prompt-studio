/**
 * Acceptance check: compare the 28-mark shelf against the sheet it was extracted
 * from, shape by shape.
 *
 * The sheet is the only source, so this proves provenance rather than restating it:
 * every attribute of every `pcN` definition must appear, in the same order, in the
 * matching entry of the library's glyph table.
 *
 * Usage: node scripts/verify-icon-source.mjs "<提示词风格图标_28枚.html>"
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error('usage: node scripts/verify-icon-source.mjs "<source.html>"');
  process.exit(2);
}

/** `pcN` -> the key the shelf stores it under, in sheet order. */
const KEYS = [
  'structure', 'template', 'checklist', 'steps', 'dialogue', 'roleplay', 'narrative',
  'academic', 'artistic', 'concise', 'vivid', 'formal', 'casual', 'persuasive',
  'chain-of-thought', 'few-shot', 'self-check', 'analogy', 'meta-prompt', 'prompt-chain', 'brainstorm',
  'format', 'length', 'citation', 'code', 'table', 'image', 'multilingual',
];

/* ── the same module stubs the emit script uses ───────────────────────────── */

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

/* ── comparison ───────────────────────────────────────────────────────────── */

const source = readFileSync(sourcePath, 'utf8');
const camel = (name) => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

let failures = 0;
console.log(`source: ${sourcePath}`);
console.log(`marks expected: ${KEYS.length}`);

KEYS.forEach((key, index) => {
  const id = `pc${index + 1}`;
  const block = new RegExp(`<g id="${id}">([\\s\\S]*?)</g>`).exec(source);
  if (block === null) {
    failures += 1;
    console.log(`  FAIL ${id} / ${key}: no definition in the source`);
    return;
  }

  const glyph = glyphs[key];
  if (glyph === undefined) {
    failures += 1;
    console.log(`  FAIL ${id} / ${key}: missing from the library`);
    return;
  }

  // Source attributes, in document order, with React's camelCase spelling.
  const expected = [];
  const tagRe = /<(rect|path|circle|ellipse)\b([^>]*?)\/?>/g;
  let tag;
  while ((tag = tagRe.exec(block[1])) !== null) {
    const attrRe = /([a-zA-Z-]+)="([^"]*)"/g;
    let attr;
    while ((attr = attrRe.exec(tag[2])) !== null) expected.push(`${camel(attr[1])}=${attr[2]}`);
  }

  const actual = [];
  const walk = (nodes) => {
    for (const [, props, children] of nodes) {
      for (const [name, value] of Object.entries(props)) actual.push(`${name}=${value}`);
      if (children !== undefined) walk(children);
    }
  };
  walk(glyph.nodes);

  const same = expected.length === actual.length && expected.every((value, i) => value === actual[i]);
  if (same) {
    console.log(`  ok   ${id} / ${key}: ${actual.length} attributes match`);
  } else {
    failures += 1;
    console.log(`  FAIL ${id} / ${key}: geometry differs`);
    console.log(`        source:  ${expected.join(' | ')}`);
    console.log(`        library: ${actual.join(' | ')}`);
  }

  const painted = glyph.nodes.length > 0;
  if (!painted) {
    failures += 1;
    console.log(`  FAIL ${id} / ${key}: the library entry draws nothing`);
  }
});

const extra = Object.keys(glyphs).filter((key) => !KEYS.includes(key));
console.log(`\nbase marks kept alongside the sheet: ${extra.join(', ')}`);
console.log(failures === 0 ? '\nSOURCE MATCH' : `\n${failures} MISMATCH(ES)`);
process.exit(failures === 0 ? 0 : 1);
