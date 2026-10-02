/**
 * Push the current built-in style library and optimizer frame into the live
 * configuration document.
 *
 * Host-half code changes only take effect after the application restarts, but the
 * style library is ordinary user data — so a new or edited built-in style can be
 * delivered immediately. Two delivery paths, tried in order:
 *
 *   1. the Host's own config route (exercises the real save path);
 *   2. the data file directly, via this package's own load/save helpers — used
 *      when the route is fenced (the Host admits only authenticated same-origin
 *      callers, so a plain shell request gets 401).
 *
 * Upsert rule: a built-in id already present is replaced (that is the point —
 * seed content drifted from the shipped text); styles with any other id, i.e.
 * user-authored ones, are left untouched and keep their position.
 *
 * Usage: node scripts/sync-builtins.mjs [baseUrl] [--file]
 */
import { BUILTIN_STYLES, DEFAULT_BASE_PROMPT, configPath, loadDocument, saveDocument } from '../index.js';

const args = process.argv.slice(2);
const forceFile = args.includes('--file');
const baseUrl = args.find((arg) => arg.startsWith('http')) || 'http://127.0.0.1:19387';
const route = `${baseUrl}/plugins/dsh-prompt-studio/config.json`;

/** Merge the seeded library and frame into one document. */
function applySeeds(document) {
  const builtinIds = new Set(BUILTIN_STYLES.map((style) => style.id));
  const userStyles = document.styles.filter((style) => !builtinIds.has(style.id));
  const byId = new Map(document.styles.map((style) => [style.id, style]));

  const changes = [];
  const styles = BUILTIN_STYLES.map((seed) => {
    const existing = byId.get(seed.id);
    if (existing === undefined) {
      changes.push(`+ ${seed.id} (${seed.name})`);
      return { ...seed };
    }
    if (JSON.stringify({ ...existing, order: seed.order }) !== JSON.stringify(seed)) {
      changes.push(`~ ${seed.id} (${seed.name})`);
      // Keep the user's enable/disable choice; the rest is shipped content.
      return { ...seed, enabled: existing.enabled };
    }
    return { ...existing, order: seed.order };
  });
  for (const style of userStyles) styles.push(style);

  if (document.settings.basePrompt !== DEFAULT_BASE_PROMPT) changes.push('~ settings.basePrompt');

  return {
    changes,
    next: {
      ...document,
      settings: { ...document.settings, basePrompt: DEFAULT_BASE_PROMPT },
      styles,
    },
  };
}

let document;
let mode = 'http';
if (forceFile) {
  mode = 'file';
  document = await loadDocument();
} else {
  try {
    const response = await fetch(route, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || payload.ok !== true || !payload.document) throw new Error('malformed response');
    document = payload.document;
  } catch (error) {
    // The route admits only the authenticated page; fall back to the data file.
    mode = 'file';
    console.log(`route unavailable (${error.message}) → writing ${configPath()} directly`);
    document = await loadDocument();
  }
}

const { changes, next } = applySeeds(document);

let saved;
if (mode === 'http') {
  const response = await fetch(route, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(next),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.ok !== true) throw new Error(`save failed: ${JSON.stringify(payload)}`);
  saved = payload.document;
} else {
  saved = await saveDocument(next);
}

console.log(changes.length === 0 ? `nothing to sync (${mode})` : `synced via ${mode}:\n  ${changes.join('\n  ')}`);
console.log(`styles now: ${saved.styles.map((style) => `${style.icon} ${style.name}`).join(', ')}`);
