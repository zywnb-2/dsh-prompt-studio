/**
 * Turn the rewriter's project-context injection on or off.
 *
 * The switch is an ordinary field of the configuration document, so it can be
 * flipped while the application runs: the Host re-reads the document with a two
 * second cache, so no restart is needed for this setting (unlike a code change).
 *
 * Usage:
 *   node scripts/toggle-context.mjs status
 *   node scripts/toggle-context.mjs on
 *   node scripts/toggle-context.mjs off
 */
import { DEFAULT_SETTINGS, configPath, loadDocument, saveDocument } from '../index.js';

const action = (process.argv[2] || 'status').toLowerCase();

const document = await loadDocument();
const current = document.settings.injectContext;

if (action === 'status') {
  console.log(`context injection: ${current ? 'on' : 'off'}  (default: ${DEFAULT_SETTINGS.injectContext ? 'on' : 'off'})`);
  console.log(`config: ${configPath()}`);
  process.exit(0);
}

if (action !== 'on' && action !== 'off') {
  console.error(`unknown action "${action}" — use status, on or off`);
  process.exit(2);
}

const wanted = action === 'on';
if (current === wanted) {
  console.log(`context injection already ${action} — nothing to do`);
  console.log(`config: ${configPath()}`);
  process.exit(0);
}

await saveDocument({ ...document, settings: { ...document.settings, injectContext: wanted } });
console.log(`context injection: ${current ? 'on' : 'off'} -> ${wanted ? 'on' : 'off'}`);
console.log('takes effect within two seconds; no restart needed for this setting');
console.log(`config: ${configPath()}`);
