/**
 * Acceptance check: compare the emitted seven-piece set against the accepted
 * reference file, shape by shape.
 *
 * The reference is the only style baseline, so this proves provenance rather than
 * restating it: every `d`, `rect`, `circle` and `transform` value in
 * `icons/<name>.svg` must appear, in the same order, in the corresponding
 * `<g transform="translate(...)">` block of the reference.
 *
 * Usage: node scripts/verify-against-reference.mjs "<reference.html>"
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const referencePath = process.argv[2];
if (!referencePath) {
  console.error('usage: node scripts/verify-against-reference.mjs "<reference.html>"');
  process.exit(2);
}

/** Order the reference draws them in, matching the seven emitted file names. */
const ORDER = ['sparkle', 'brick', 'book', 'cap', 'palette', 'check', 'hammer'];

const reference = readFileSync(referencePath, 'utf8');

/* Each icon is one `<g transform="translate(x,y)">…</g>` inside the stroked group. */
const blocks = [];
const blockRe = /<g transform="translate\([^"]*\)">([\s\S]*?)<\/g>\s*(?=<g transform="translate\(|<g class="ts"|<\!--)/g;
let match;
while ((match = blockRe.exec(reference)) !== null) blocks.push(match[1]);

/**
 * Geometry-bearing values, in document order.
 *
 * The lookbehind keeps `stroke-width` from being read as `width`, and the root
 * `<svg>` tag's own `width`/`height` are stripped so only the drawn shapes are
 * compared.
 */
function geometry(svg) {
  const open = svg.indexOf('>');
  const body = svg.trimStart().startsWith('<svg') ? svg.slice(open + 1, svg.lastIndexOf('</svg>')) : svg;
  const values = [];
  const attrRe = /(?<![\w-])(d|x|y|width|height|rx|cx|cy|r|transform)="([^"]+)"/g;
  let found;
  while ((found = attrRe.exec(body)) !== null) values.push(`${found[1]}=${found[2]}`);
  return values;
}

let failures = 0;
console.log(`reference: ${referencePath}`);
console.log(`icon blocks found: ${blocks.length}`);

if (blocks.length !== ORDER.length) {
  failures += 1;
  console.log(`  FAIL expected ${ORDER.length} icon blocks, found ${blocks.length}`);
}

ORDER.forEach((name, index) => {
  const block = blocks[index];
  if (block === undefined) {
    failures += 1;
    console.log(`  FAIL ${name}: no reference block at index ${index}`);
    return;
  }
  const file = readFileSync(join(here, '..', 'icons', `${name}.svg`), 'utf8');
  const expected = geometry(block);
  const actual = geometry(file);

  const same = expected.length === actual.length && expected.every((value, i) => value === actual[i]);
  if (same) {
    console.log(`  ok   ${name}: ${actual.length} geometry values match`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}: geometry differs`);
    console.log(`        reference: ${expected.join(' | ')}`);
    console.log(`        emitted:   ${actual.join(' | ')}`);
  }

  // Paint is the one deliberate deviation: the file keeps the reference's fixed
  // ink, the in-plugin renderer rebinds the same geometry to currentColor.
  const paint = /fill="none"/.test(file) && /stroke="#1f2328"/.test(file)
    && /stroke-width="2"/.test(file) && /viewBox="0 0 56 56"/.test(file);
  if (!paint) {
    failures += 1;
    console.log(`  FAIL ${name}: paint or viewBox drifted from the reference`);
  }
});

console.log(failures === 0 ? '\nREFERENCE MATCH' : `\n${failures} MISMATCH(ES)`);
process.exit(failures === 0 ? 0 : 1);
