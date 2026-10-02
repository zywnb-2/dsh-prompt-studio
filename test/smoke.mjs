/**
 * Host-half smoke test — pure functions and the persistence round trip.
 * Run: node test/smoke.mjs
 */
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'prompt-studio-test-'));
process.env.DSH_HOME = home;

const studio = await import('../index.js');

let failures = 0;
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
  }
};

console.log('defaultDocument');
const seeded = studio.defaultDocument();
check('seven seeded styles', seeded.styles.length === 7, JSON.stringify(seeded.styles.map((s) => s.id)));
check('the hardcore style ships', seeded.styles.some((style) => style.id === 'hardcore' && style.name === '硬邦邦'));
check('hardcore keeps its voice rules', (seeded.styles.find((style) => style.id === 'hardcore').instruction || '').includes('硬邦邦'));
check('style order is ascending', seeded.styles.every((style, index) => index === 0 || seeded.styles[index - 1].order <= style.order));
check('autoOptimize defaults off', seeded.settings.autoOptimize === false);
check('version stamped', seeded.version === 1);

console.log('normalizeDocument');
const messed = studio.normalizeDocument({
  settings: { autoOptimize: 'yes', temperature: 99, maxTokens: 5, autoStyleId: 'nope' },
  styles: [
    { id: 'a', name: 'A', instruction: 'do a' },
    { id: 'a', name: 'dup', instruction: 'do dup' },
    { id: '', name: '', instruction: '' },
    { name: 'NoInstruction' },
  ],
});
check('boolean coercion uses default', messed.settings.autoOptimize === false);
check('temperature clamped', messed.settings.temperature === 2, String(messed.settings.temperature));
check('maxTokens clamped', messed.settings.maxTokens === 128, String(messed.settings.maxTokens));
check('duplicate ids deduped', messed.styles[0].id !== messed.styles[1].id, JSON.stringify(messed.styles.map((s) => s.id)));
check('instruction-less styles dropped', messed.styles.length === 2, String(messed.styles.length));
check('unknown style id falls back to a real one', messed.styles.some((s) => s.id === messed.settings.autoStyleId), messed.settings.autoStyleId);
check('empty basePrompt restored', messed.settings.basePrompt === studio.DEFAULT_BASE_PROMPT);
check(
  'empty style list falls back to the seed',
  studio.normalizeDocument({ styles: [] }).styles.length === 7,
);

/* ── style icon normalization ─────────────────────────────────────────────── */

console.log('style icon normalization');
check('a glyph key survives whole', studio.normalizeIcon('sparkle') === 'sparkle');
check('the longest key survives whole', studio.normalizeIcon('palette') === 'palette');
check('an emoji is still bounded to two code points', studio.normalizeIcon('😀😀😀') === '😀😀');
check('an unknown word is kept as typed', studio.normalizeIcon('hello') === 'hello');
check('an empty icon stays empty', studio.normalizeIcon('') === '' && studio.normalizeIcon(undefined) === '');

// The regression this guards: every key used to be stored as its first two code
// points, so all seven prefixes must map back to the key they came from.
const LEGACY_PREFIXES = ['sp', 'br', 'bo', 'ca', 'pa', 'ch', 'ha'];
check('every legacy two-letter truncation is repaired',
  LEGACY_PREFIXES.every((prefix, index) => studio.normalizeIcon(prefix) === studio.ICON_KEYS[index]),
  LEGACY_PREFIXES.map((prefix) => `${prefix}->${studio.normalizeIcon(prefix)}`).join(' '));
check('the prefixes stay unambiguous',
  new Set(studio.ICON_KEYS.map((key) => key.slice(0, 2))).size === studio.ICON_KEYS.length);
check('the shipped seed uses keys, not emoji',
  studio.BUILTIN_STYLES.every((style) => studio.ICON_KEYS.includes(style.icon)),
  JSON.stringify(studio.BUILTIN_STYLES.map((style) => style.icon)));

const iconDocument = studio.normalizeDocument({
  styles: studio.ICON_KEYS.map((key, index) => ({ id: key, name: key, icon: key, instruction: `do ${key}`, order: index })),
});
check('keys survive document normalization',
  iconDocument.styles.every((style) => studio.ICON_KEYS.includes(style.icon)),
  JSON.stringify(iconDocument.styles.map((style) => style.icon)));
check('legacy truncations are repaired on load',
  studio.normalizeDocument({ styles: [{ id: 'a', name: 'A', icon: 'sp', instruction: 'do a' }] }).styles[0].icon === 'sparkle');
check('a repaired key survives the save/load round trip', await (async () => {
  await studio.saveDocument(iconDocument);
  const reloaded = await studio.loadDocument();
  return reloaded.styles.every((style) => studio.ICON_KEYS.includes(style.icon));
})());

console.log('rendering');
const styled = studio.renderBasePrompt('S:{{styleName}}\n{{styleInstruction}}', seeded.styles[0]);
check('style name substituted', styled.includes('轻润色'));
check('style instruction substituted', styled.includes('错别字'));
check('no leftover placeholder', !styled.includes('{{'));
const input = studio.renderOptimizerInput('帮我写个网页', '要快');
check('original draft preserved', input.includes('帮我写个网页'));
check('extra requirement included', input.includes('要快'));
check('extra section omitted when blank', !studio.renderOptimizerInput('x', '  ').includes('额外要求'));

console.log('stripWrapper');
check('fenced block unwrapped', studio.stripWrapper('```\nhello\n```') === 'hello');
check('fenced block with language unwrapped', studio.stripWrapper('```markdown\nbody\n```') === 'body');
check('curly quotes unwrapped', studio.stripWrapper('\u201chello\u201d') === 'hello');
check('plain text untouched', studio.stripWrapper('  keep me  ') === 'keep me');

console.log('persistence');
const saved = await studio.saveDocument({ settings: { autoOptimize: true, autoStyleId: 'plan' }, styles: seeded.styles });
check('save returns normalized document', saved.settings.autoOptimize === true);
const onDisk = JSON.parse(await readFile(studio.configPath(), 'utf8'));
check('file written under DSH_HOME', onDisk.styles.length === 7);
check('document path is the data directory', studio.configPath().startsWith(home));

console.log('corrupt document recovery');
await writeFile(studio.configPath(), '{ not json', 'utf8');
check('corrupt file still yields a usable document', (await studio.loadDocument()).styles.length === 7);
await rm(studio.configPath());
check('missing file still yields a usable document', (await studio.loadDocument()).styles.length === 7);

console.log('request fences');
check('json same-origin write allowed', studio.isTrustedWrite({ headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: 'http://127.0.0.1:1', host: '127.0.0.1:1' } }));
check('cross-site write rejected', !studio.isTrustedWrite({ headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' } }));
check('form-encoded write rejected', !studio.isTrustedWrite({ headers: { 'content-type': 'text/plain', 'sec-fetch-site': 'same-origin' } }));
check('foreign origin rejected', !studio.isTrustedWrite({ headers: { 'content-type': 'application/json', origin: 'http://evil.test', host: '127.0.0.1:1' } }));
check('cross-site read rejected', !studio.isTrustedRead({ headers: { 'sec-fetch-site': 'cross-site' } }));

console.log('optimizePrompt guards');
const bare = { get: () => null };
const noLlm = await studio.optimizePrompt(bare, { text: 'hi' }).then(() => null, (error) => error.message);
check('missing llm reported', noLlm !== null && noLlm.includes('llm'), noLlm);
const empty = await studio.optimizePrompt(bare, { text: '   ' }).then(() => null, (error) => error.message);
check('empty draft rejected', empty !== null && empty.includes('草稿'), empty);

// A fake llm service drives the whole streaming path end to end.
const fakeChunks = [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: '```\n' },
  { type: 'text-delta', index: 0, text: '优化后的提示词' },
  { type: 'text-delta', index: 0, text: '\n```' },
  { type: 'finish', reason: { kind: 'stop' } },
];
const captured = [];
const fakeCtx = {
  get(name) {
    if (name === 'llm') {
      return {
        stream(options) {
          captured.push(options);
          return (async function* generate() {
            for (const chunk of fakeChunks) yield chunk;
          })();
        },
      };
    }
    if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'p', model: 'm' }) };
    return null;
  },
};
const result = await studio.optimizePrompt(fakeCtx, { text: '写个网站', styleId: 'structured', extra: '用中文' });
check('streamed deltas assembled', result.text === '优化后的提示词', result.text);
check('style echoed back', result.styleId === 'structured');
check('route inherited from the host default', result.provider === 'p' && result.model === 'm');
check('system prompt carries the style frame', typeof captured[0].system === 'string' && captured[0].system.includes('结构化需求'));
check('user turn carries the draft', JSON.stringify(captured[0].messages).includes('写个网站'));
check('maxTokens forwarded', captured[0].maxTokens === 4096);

const explicit = { ...fakeCtx };
const document = await studio.loadDocument();
await studio.saveDocument({ ...document, settings: { ...document.settings, provider: 'x', model: 'y' } });
const routed = await studio.optimizePrompt(fakeCtx, { text: 'hi', styleId: 'quick' });
check('explicit provider/model override wins', routed.provider === 'x' && routed.model === 'y');

const errorCtx = {
  get(name) {
    if (name === 'llm') {
      return {
        stream() {
          return (async function* generate() {
            yield { type: 'finish', reason: { kind: 'error', failure: { message: 'boom', code: 'X' } } };
          })();
        },
      };
    }
    return { currentSelection: () => ({ provider: 'p', model: 'm' }) };
  },
};
const failure = await studio.optimizePrompt(errorCtx, { text: 'hi' }).then(() => null, (error) => error.message);
check('provider failure surfaced', failure !== null && failure.includes('boom'), failure);

/* ── auto mode: the agent/pre-step fold ───────────────────────────────────── */

console.log('auto mode (agent/pre-step)');
{
  // Clear the explicit route the previous section installed, so the fallback chain is under test.
  const current = await studio.loadDocument();
  await studio.saveDocument({
    ...current,
    settings: { ...current.settings, autoOptimize: false, autoStyleId: 'quick', provider: '', model: '' },
  });
}

const humanMessage = (id, text, extra) => ({
  id,
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'user', rpcId: `rpc-${id}`, ...extra },
});
const injectedMessage = (id, text) => ({
  id,
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'user' },
});
const assistantMessage = { id: 'a1', role: 'assistant', content: [{ type: 'text', text: 'hi' }], source: { kind: 'model', provider: 'p', model: 'm' } };

const rewriteCtx = (route) => {
  const calls = [];
  return {
    calls,
    get(name) {
      if (name === 'llm') {
        return {
          stream(options) {
            calls.push(options);
            return (async function* generate() {
              yield { type: 'text-delta', index: 0, text: `REWRITTEN(${options.system.includes('轻润色') ? 'quick' : 'other'})` };
              yield { type: 'finish', reason: { kind: 'stop' } };
            })();
          },
        };
      }
      if (name === 'agentDefaultModel') return { currentSelection: () => route };
      return null;
    },
  };
};

// Auto mode off: the decision passes through by identity.
const offCtx = rewriteCtx({ provider: 'p', model: 'm' });
const offMessage = humanMessage('u1', '帮我改改');
const offDecision = { kind: 'enter', messages: [offMessage, assistantMessage], startsRequestSeries: true };
const offResult = await studio.handlePreStep(offCtx, { agent: null, signal: undefined }, async () => offDecision);
check('auto off returns the same decision object', offResult === offDecision);
check('auto off makes no model call', offCtx.calls.length === 0);

// Auto mode on: the human message is rewritten, everything else is preserved.
await studio.saveDocument({
  ...(await studio.loadDocument()),
  settings: { ...(await studio.loadDocument()).settings, autoOptimize: true, autoStyleId: 'quick' },
});
const onCtx = rewriteCtx({ provider: 'p', model: 'm' });
const human = humanMessage('u2', '帮我改改');
const injected = injectedMessage('ctx1', 'plugin injected context');
const decision = { kind: 'enter', messages: [injected, assistantMessage, human], startsRequestSeries: true };
const rewrittenDecision = await studio.handlePreStep(onCtx, { agent: null, signal: undefined }, async () => decision);
check('one model call for one human message', onCtx.calls.length === 1, String(onCtx.calls.length));
check('user text replaced', rewrittenDecision.messages[2].content[0].text === 'REWRITTEN(quick)', JSON.stringify(rewrittenDecision.messages[2].content));
check('message id preserved', rewrittenDecision.messages[2].id === 'u2');
check('message source preserved', rewrittenDecision.messages[2].source.rpcId === 'rpc-u2');
check('injected context untouched', rewrittenDecision.messages[0] === injected);
check('assistant message untouched', rewrittenDecision.messages[1] === assistantMessage);
check('startsRequestSeries preserved', rewrittenDecision.startsRequestSeries === true);
check('original message object not mutated', human.content[0].text === '帮我改改');
check('route came from the session default', onCtx.calls[0].provider === 'p');

// A session that already committed a request wins over the deployment default.
const sessionCtx = rewriteCtx({ provider: 'default', model: 'default-model' });
const sessionMessage = humanMessage('u3', '再改一次');
await studio.handlePreStep(
  sessionCtx,
  { agent: { session: { requestHeader: () => ({ config: { provider: 'session-p', model: 'session-m' } }) } }, signal: undefined },
  async () => ({ kind: 'enter', messages: [sessionMessage] }),
);
check('committed session route wins', sessionCtx.calls[0].provider === 'session-p' && sessionCtx.calls[0].model === 'session-m', `${sessionCtx.calls[0].provider}/${sessionCtx.calls[0].model}`);

// Dedupe: the same message id never pays for a second call.
const dedupeCtx = rewriteCtx({ provider: 'p', model: 'm' });
const dedupeMessage = humanMessage('u4', '第三次');
const firstPass = await studio.handlePreStep(dedupeCtx, { agent: null, signal: undefined }, async () => ({ kind: 'enter', messages: [dedupeMessage] }));
const secondPass = await studio.handlePreStep(dedupeCtx, { agent: null, signal: undefined }, async () => ({ kind: 'enter', messages: [dedupeMessage] }));
check('first pass rewrote', firstPass.messages[0].content[0].text.startsWith('REWRITTEN'));
check('second pass is a no-op', secondPass === secondPass && dedupeCtx.calls.length === 1, String(dedupeCtx.calls.length));

// Slash commands and non-enter decisions stay on the Host's original path.
const slashCtx = rewriteCtx({ provider: 'p', model: 'm' });
const slashDecision = { kind: 'enter', messages: [humanMessage('u5', '/compact')] };
check('slash command untouched', (await studio.handlePreStep(slashCtx, { agent: null, signal: undefined }, async () => slashDecision)) === slashDecision);
const rejectDecision = { kind: 'reject' };
check('reject decision untouched', (await studio.handlePreStep(slashCtx, { agent: null, signal: undefined }, async () => rejectDecision)) === rejectDecision);
check('no extra calls for skipped decisions', slashCtx.calls.length === 0);

// A failing rewriter must not block the turn.
const failingCtx = {
  get(name) {
    if (name === 'llm') {
      return {
        stream() {
          return (async function* generate() {
            yield { type: 'finish', reason: { kind: 'error', failure: { message: 'provider down', code: 'X' } } };
          })();
        },
      };
    }
    return { currentSelection: () => ({ provider: 'p', model: 'm' }) };
  },
};
const failingDecision = { kind: 'enter', messages: [humanMessage('u6', '会失败')] };
const failureResult = await studio.handlePreStep(failingCtx, { agent: null, signal: undefined }, async () => failingDecision);
check('failure falls back to the original decision', failureResult === failingDecision);
check('failure keeps the original text', failureResult.messages[0].content[0].text === '会失败');

/* ── model catalog for the rewriter picker ────────────────────────────────── */

/* ── rewriter route and reasoning effort ──────────────────────────────────── */
/*
 * A thinking-only model answers 400 / 1210 to a request whose thinking is off,
 * and an omitted `reasoningEffort` is exactly what produces that. Every route a
 * call can start from therefore has to carry its effort across.
 */

console.log('rewriter route and reasoning effort');
{
  const current = await studio.loadDocument();
  await studio.saveDocument({ ...current, settings: { ...current.settings, provider: '', model: '' } });
}

const effortCtx = (options = {}) => {
  const calls = [];
  return {
    calls,
    get(name) {
      if (name === 'agentDefaultModel') return { currentSelection: () => options.defaultSelection };
      if (name === 'agents') return options.agents === undefined ? null : options.agents;
      if (name === 'llm') {
        return {
          resolveModelInfo: options.resolveModelInfo,
          stream(callOptions) {
            calls.push(callOptions);
            return (async function* generate() {
              yield { type: 'text-delta', index: 0, text: 'ok' };
              yield { type: 'finish', reason: { kind: 'stop' } };
            })();
          },
        };
      }
      return null;
    },
  };
};

const agentOn = (config) => ({ session: { requestHeader: () => ({ config }) } });

// 1. The session's own committed route wins, and brings its effort.
const routeSessionCtx = effortCtx({
  defaultSelection: { provider: 'dp', model: 'dm', reasoningEffort: 'low' },
  agents: { get: () => agentOn({ provider: 'sp', model: 'sm', reasoningEffort: 'max' }) },
});
const sessionResult = await studio.optimizePrompt(routeSessionCtx, { text: 'hi', sessionId: 'session-1' });
check('the committed session route beats the deployment default',
  sessionResult.provider === 'sp' && sessionResult.model === 'sm',
  `${sessionResult.provider}/${sessionResult.model}`);
check('the session reasoning effort is forwarded', routeSessionCtx.calls[0].reasoningEffort === 'max',
  String(routeSessionCtx.calls[0].reasoningEffort));

// 2. With no session route, the deployment default carries its effort too.
const routeDefaultCtx = effortCtx({ defaultSelection: { provider: 'dp', model: 'dm', reasoningEffort: 'high' } });
const defaultResult = await studio.optimizePrompt(routeDefaultCtx, { text: 'hi' });
check('the deployment default effort is forwarded', routeDefaultCtx.calls[0].reasoningEffort === 'high',
  String(routeDefaultCtx.calls[0].reasoningEffort));
check('the result reports the effort used', defaultResult.reasoningEffort === 'high');

// 3. An explicit settings override has no effort of its own, so the adapter's
//    default for that exact model is what keeps the call legal.
await studio.saveDocument({
  ...(await studio.loadDocument()),
  settings: { ...(await studio.loadDocument()).settings, provider: 'override-p', model: 'override-m' },
});
const routeOverrideCtx = effortCtx({
  defaultSelection: { provider: 'dp', model: 'dm', reasoningEffort: 'high' },
  resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'low' }, { id: 'high' }], defaultEffort: 'high' } }),
});
await studio.optimizePrompt(routeOverrideCtx, { text: 'hi' });
check('an override without an effort asks the model for its default',
  routeOverrideCtx.calls[0].reasoningEffort === 'high', String(routeOverrideCtx.calls[0].reasoningEffort));

// 4. A first effort is used when the model names no default.
const firstEffortCtx = effortCtx({
  defaultSelection: { provider: 'dp', model: 'dm' },
  resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'low' }, { id: 'max' }] } }),
});
await studio.optimizePrompt(firstEffortCtx, { text: 'hi' });
check('the model\'s first effort is used when it names no default',
  firstEffortCtx.calls[0].reasoningEffort === 'low', String(firstEffortCtx.calls[0].reasoningEffort));

// Drop the explicit override again: the remaining cases are about the fallbacks.
await studio.saveDocument({
  ...(await studio.loadDocument()),
  settings: { ...(await studio.loadDocument()).settings, provider: '', model: '' },
});

// 5. An adapter that cannot answer must not break the call.
const silentCtx = effortCtx({
  defaultSelection: { provider: 'dp', model: 'dm' },
  resolveModelInfo: async () => { throw new Error('no capability'); },
});
const silentResult = await studio.optimizePrompt(silentCtx, { text: 'hi' });
check('a model that cannot report an effort still runs',
  silentResult.text === 'ok' && silentCtx.calls[0].reasoningEffort === undefined);
check('the result says no effort was used', silentResult.reasoningEffort === null);

// 6. An empty effort on a route is not forwarded as an empty value.
const blankEffortCtx = effortCtx({
  agents: { get: () => agentOn({ provider: 'sp', model: 'sm', reasoningEffort: '' }) },
  resolveModelInfo: async () => undefined,
});
await studio.optimizePrompt(blankEffortCtx, { text: 'hi', sessionId: 'session-2' });
check('an empty effort is treated as absent', blankEffortCtx.calls[0].reasoningEffort === undefined,
  JSON.stringify(blankEffortCtx.calls[0].reasoningEffort));

// 7. A broken agent registry must not take the call down.
const brokenAgentsCtx = effortCtx({
  defaultSelection: { provider: 'dp', model: 'dm', reasoningEffort: 'low' },
  agents: { get() { throw new Error('agent is gone'); } },
});
const brokenResult = await studio.optimizePrompt(brokenAgentsCtx, { text: 'hi', sessionId: 'session-3' });
check('a broken agent lookup falls back to the deployment default',
  brokenResult.provider === 'dp' && brokenAgentsCtx.calls[0].reasoningEffort === 'low');

await studio.saveDocument({
  ...(await studio.loadDocument()),
  settings: { ...(await studio.loadDocument()).settings, provider: '', model: '' },
});

console.log('rewriter model catalog');
const catalogCtx = (options = {}) => {
  const calls = [];
  return {
    calls,
    get(name) {
      if (name === 'agentDefaultModel') {
        return { currentSelection: () => options.defaultSelection || { provider: 'prov-a', model: 'model-a' } };
      }
      if (name === 'llm') {
        if (options.noLlm === true) return null;
        return {
          listProviders: () => options.providers || [{ id: 'prov-a', name: 'Provider A' }, { id: 'prov-b', name: 'Provider B' }],
          listModels: async (id) => {
            calls.push(id);
            if (options.throwOn !== undefined && id === options.throwOn) throw new Error('no credentials');
            if (id === 'prov-a') return [{ id: 'model-a', name: 'Model A' }, { id: 'model-b', name: 'Model B' }];
            return [{ id: 'model-c', name: 'Model C' }];
          },
        };
      }
      return null;
    },
  };
};

const catalog = await studio.listModelsForPicker(catalogCtx(), { fresh: true });
check('reports the deployment default', catalog.default.provider === 'prov-a' && catalog.default.model === 'model-a');
check('groups every provider', catalog.groups.length === 2, String(catalog.groups.length));
check('lists each provider\'s models', catalog.groups[0].models.length === 2 && catalog.groups[1].models.length === 1);
check('carries provider display names', catalog.groups[0].name === 'Provider A');
check('no top-level error on success', catalog.error === null);

const isolated = await studio.listModelsForPicker(catalogCtx({ throwOn: 'prov-b' }), { fresh: true });
check('a failing provider does not empty the menu', isolated.groups[0].models.length === 2 && isolated.groups[1].models.length === 0);
check('a failing provider reports its own reason', isolated.groups[1].error === 'no credentials', String(isolated.groups[1].error));
check('a failing provider does not raise a top-level error', isolated.error === null);

const withoutLlm = await studio.listModelsForPicker({ get: () => null }, { fresh: true });
check(
  'reports a missing llm service',
  withoutLlm.groups.length === 0 && typeof withoutLlm.error === 'string' && withoutLlm.error.includes('llm'),
  String(withoutLlm.error),
);

// A deployment default whose provider has not listed it must still be selectable.
const staleDefault = await studio.listModelsForPicker(
  catalogCtx({ defaultSelection: { provider: 'prov-b', model: 'retired-model' } }),
  { fresh: true },
);
check(
  'a default model missing from the listing is injected',
  staleDefault.groups[1].models.some((model) => model.id === 'retired-model'),
  JSON.stringify(staleDefault.groups[1].models),
);

// Caching: the same default within the TTL reuses the listing; `fresh` bypasses it.
const cachedCtx = catalogCtx({ defaultSelection: { provider: 'cache-probe', model: 'x' }, providers: [{ id: 'cache-prov', name: 'Cache' }] });
await studio.listModelsForPicker(cachedCtx, { fresh: true });
const before = cachedCtx.calls.length;
await studio.listModelsForPicker(cachedCtx);
check('a repeat call reuses the cached catalog', cachedCtx.calls.length === before, `${before} -> ${cachedCtx.calls.length}`);
await studio.listModelsForPicker(cachedCtx, { fresh: true });
check('fresh:true bypasses the cache', cachedCtx.calls.length === before + 1, `${before} -> ${cachedCtx.calls.length}`);

/* ── project conversation context ─────────────────────────────────────────── */
/*
 * The prerequisite this capability rests on: a session keeps its model-visible
 * history on itself (`deriveMessages()`), and `sessionQuery` exposes every session
 * of one project keyed by the header's working directory. Both are exercised against
 * fakes shaped exactly like the documented contracts.
 */

console.log('project conversation context');
check('only text blocks carry words',
  studio.textOfContent([{ type: 'text', text: 'a' }, { type: 'reasoning', text: 'b' }, { type: 'image', attachment: {} }]) === 'a');
check('a non-array or empty body is empty',
  studio.textOfContent(undefined) === '' && studio.textOfContent('x') === '' && studio.textOfContent([]) === '');

const msg = (role, text, source) => ({
  id: `${role}-${text}`,
  role,
  content: [{ type: 'text', text }],
  source: source === undefined ? { kind: role === 'user' ? 'user' : 'model' } : source,
});
const asSession = (messages, cwd = 'C:/proj') => ({
  header: { id: 'session-here', cwd },
  deriveMessages: () => messages,
});

const conversation = [
  msg('system', '系统提示'),
  msg('user', '第一轮：我们在做一个发布清单'),
  msg('assistant', '收到，先整理字段'),
  { id: 'tool-1', role: 'tool', content: [{ type: 'text', text: '工具输出' }], source: { kind: 'tool', callId: 'c1' } },
  msg('user', '注入的上下文', { kind: 'agent-instructions' }),
  msg('user', '帮我看下登录接口为什么超时'),
];
const draft = '帮我看下登录接口为什么超时';

const history = studio.sessionHistory(asSession(conversation), draft);
check('history keeps the human and model turns', history.length === 2, JSON.stringify(history));
check('history is oldest first', history[0].text.startsWith('第一轮'), history[0].text);
check('history drops the system prompt', !history.some((entry) => entry.text === '系统提示'));
check('history drops tool traffic', !history.some((entry) => entry.text === '工具输出'));
check('history drops injected context', !history.some((entry) => entry.text === '注入的上下文'));
check('history skips the draft itself', !history.some((entry) => entry.text === draft));

check('a session without deriveMessages yields nothing', studio.sessionHistory({}, draft).length === 0);
check('a broken deriveMessages yields nothing',
  studio.sessionHistory({ deriveMessages() { throw new Error('gone'); } }, draft).length === 0);
check('one long message is clipped',
  studio.sessionHistory(asSession([msg('user', 'x'.repeat(5000))]), '')
    .every((entry) => entry.text.length <= studio.CONTEXT_LIMITS.messageChars + 1));
check('history is bounded',
  studio.sessionHistory(asSession(Array.from({ length: 40 }, (_, index) => msg('user', `第 ${index} 条`))), '').length
    <= studio.CONTEXT_LIMITS.sessionMessages);

// The other conversation pages of the same project.
const projectPages = (options = {}) => {
  const asked = [];
  return {
    asked,
    get(name) {
      if (name !== 'sessionQuery') return null;
      return {
        async filterSessions(filters, signal) {
          asked.push({ filters, signal });
          return options.records === undefined ? [
            { header: { id: 'session-here', cwd: 'C:/proj' } },
            { header: { id: 'session-b', cwd: 'C:/proj' } },
            { header: { id: 'session-c', cwd: 'C:/proj' } },
            { header: { id: 'session-d', cwd: 'C:/proj' } },
            { header: { id: 'session-e', cwd: 'C:/proj' } },
          ] : options.records;
        },
        async readSurface(id) {
          if (options.throwOn !== undefined && id === options.throwOn) throw new Error('unreadable');
          return { events: [
            { type: 'user/message', data: msg('user', `${id} 说过的话`) },
            { type: 'assistant/message', data: { message: msg('assistant', 'ok') } },
          ] };
        },
      };
    },
  };
};

studio.forgetProjectHistory();
const pagesCtx = projectPages();
const pages = await studio.projectHistory(pagesCtx, asSession([], 'C:/proj'), 'session-here');
check('the project is queried by working directory',
  pagesCtx.asked[0].filters[0].kind === 'cwd' && pagesCtx.asked[0].filters[0].values[0] === 'C:/proj',
  JSON.stringify(pagesCtx.asked[0].filters));
check('the current page is excluded', !pages.some((entry) => entry.label === 'session-here'));
check('sibling pages are bounded', pages.length === studio.CONTEXT_LIMITS.siblingSessions, String(pages.length));
check('a sibling page contributes its own words', pages[0].text.includes('session-b 说过的话'), JSON.stringify(pages[0]));

studio.forgetProjectHistory();
const survived = await studio.projectHistory(projectPages({ throwOn: 'session-b' }), asSession([], 'C:/proj'), 'session-here');
check('one unreadable page does not cost the others',
  survived.length === studio.CONTEXT_LIMITS.siblingSessions - 1, String(survived.length));
studio.forgetProjectHistory();
check('no sessionQuery means no project pages',
  (await studio.projectHistory({ get: () => null }, asSession([], 'C:/proj'), 'x')).length === 0);
studio.forgetProjectHistory();
check('a page without a working directory has no project pages',
  (await studio.projectHistory(pagesCtx, { header: { id: 'x' }, deriveMessages: () => [] }, 'session-here')).length === 0);
studio.forgetProjectHistory();
check('an empty corpus yields nothing',
  (await studio.projectHistory(projectPages({ records: [] }), asSession([], 'C:/proj'), 'session-here')).length === 0);

// Assembly and rendering.
studio.forgetProjectHistory();
check('nothing to reference is null',
  (await studio.buildContext({ get: () => null }, asSession([]), 'x', draft)) === null);
studio.forgetProjectHistory();
const assembled = await studio.buildContext(pagesCtx, asSession(conversation, 'C:/proj'), 'session-here', draft);
check('assembly carries both sources',
  assembled.history.length === 2 && assembled.siblings.length === studio.CONTEXT_LIMITS.siblingSessions);

const withContext = studio.renderOptimizerInput(draft, '', assembled);
check('the reference block reaches the turn', withContext.includes('【参考上下文】'));
check('the turn states the rules of use',
  withContext.includes('不得据它新增草稿没有提出的需求') && withContext.includes('以草稿为准'));
check('the turn shows the conversation', withContext.includes('第一轮：我们在做一个发布清单'));
check('the turn shows the project pages', withContext.includes('session-b 说过的话'));
check('the draft stays in the turn', withContext.includes(draft));
check('no context renders exactly the old turn',
  studio.renderOptimizerInput(draft, '') === `【原始草稿】\n${draft}\n\n请按上面的风格输出优化后的提示词正文。`,
  JSON.stringify(studio.renderOptimizerInput(draft, '')));

// End to end through the one method both triggers call.
const contextCall = (session) => {
  const calls = [];
  return {
    calls,
    get(name) {
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'p', model: 'm' }) };
      if (name === 'llm') {
        return {
          stream(options) {
            calls.push(options);
            return (async function* generate() {
              yield { type: 'text-delta', index: 0, text: '结果' };
              yield { type: 'finish', reason: { kind: 'stop' } };
            })();
          },
        };
      }
      if (name === 'sessionQuery') return projectPages().get('sessionQuery');
      // The live-session store is how the button's path finds its session.
      if (name === 'sessions') return { get: (id) => (session !== null && id === 'session-here' ? session : null) };
      return null;
    },
  };
};

studio.forgetProjectHistory();
const liveCtx = contextCall(asSession(conversation, 'C:/proj'));
const liveResult = await studio.optimizePrompt(liveCtx, { text: draft, styleId: 'quick', sessionId: 'session-here' });
check('the optimizer request carries the reference block',
  liveCtx.calls[0].messages[0].content[0].text.includes('【参考上下文】'));
check('the result reports the reference it used',
  liveResult.context !== null && liveResult.context.sessionMessages === 2, JSON.stringify(liveResult.context));

const bareCtx = contextCall(null);
const bareResult = await studio.optimizePrompt(bareCtx, { text: draft, styleId: 'quick' });
check('no session still optimizes', bareResult.text === '结果');
check('no session reports no reference', bareResult.context === null);
check('no session sends exactly the old request',
  !bareCtx.calls[0].messages[0].content[0].text.includes('【参考上下文】'));

// The corpus scan is the one non-local read, so it is cached per project.
studio.forgetProjectHistory();
const cachedPages = projectPages();
await studio.projectHistory(cachedPages, asSession([], 'C:/proj'), 'session-here');
await studio.projectHistory(cachedPages, asSession([], 'C:/proj'), 'session-here');
check('the project scan is reused within its window', cachedPages.asked.length === 1, String(cachedPages.asked.length));
studio.forgetProjectHistory();
await studio.projectHistory(cachedPages, asSession([], 'C:/proj'), 'session-here');
check('forgetting the cache forces a fresh scan', cachedPages.asked.length === 2, String(cachedPages.asked.length));

/* ── the context injection switch ─────────────────────────────────────────── */
/*
 * One setting, read at the single point both triggers pass through. The assertions
 * are about the two ends: on must inject exactly as before, off must not read at all.
 */

console.log('context injection switch');
check('the switch defaults to on', studio.DEFAULT_SETTINGS.injectContext === true);
check('an absent switch falls back to on', studio.normalizeDocument({}).settings.injectContext === true);
check('an explicit off survives normalization',
  studio.normalizeDocument({ settings: { injectContext: false } }).settings.injectContext === false);
check('a non-boolean is not mistaken for off',
  studio.normalizeDocument({ settings: { injectContext: 'off' } }).settings.injectContext === true);
check('an edit elsewhere keeps the switch off',
  studio.normalizeDocument({
    settings: { injectContext: false, temperature: 0.9 },
    styles: [{ id: 'x', name: 'x', instruction: 'do x' }],
  }).settings.injectContext === false);

/** Counts every read, so "off" proves a real skip rather than a late filter. */
const switchCtx = () => {
  const reads = { sessions: 0, agents: 0, sessionQuery: 0 };
  const calls = [];
  return {
    reads,
    calls,
    get(name) {
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'p', model: 'm' }) };
      if (name === 'sessions') { reads.sessions += 1; return { get: () => asSession(conversation, 'C:/proj') }; }
      if (name === 'agents') { reads.agents += 1; return null; }
      if (name === 'sessionQuery') { reads.sessionQuery += 1; return projectPages().get('sessionQuery'); }
      if (name === 'llm') {
        return {
          stream(options) {
            calls.push(options);
            return (async function* generate() {
              yield { type: 'text-delta', index: 0, text: '结果' };
              yield { type: 'finish', reason: { kind: 'stop' } };
            })();
          },
        };
      }
      return null;
    },
  };
};

const withSwitch = async (flag) => {
  const base = await studio.loadDocument();
  await studio.saveDocument({ ...base, settings: { ...base.settings, injectContext: flag } });
  studio.forgetProjectHistory();
  const ctx = switchCtx();
  const result = await studio.optimizePrompt(ctx, { text: draft, styleId: 'quick', sessionId: 'session-here' });
  return { ctx, result };
};

const onRun = await withSwitch(true);
check('on: the request carries the reference block',
  onRun.ctx.calls[0].messages[0].content[0].text.includes('【参考上下文】'));
check('on: the session is read', onRun.ctx.reads.sessions > 0);
check('on: the project is read', onRun.ctx.reads.sessionQuery > 0);
check('on: the result reports the reference used',
  onRun.result.context !== null && onRun.result.context.sessionMessages > 0,
  JSON.stringify(onRun.result.context));

const offRun = await withSwitch(false);
check('off: the request carries no reference block',
  !offRun.ctx.calls[0].messages[0].content[0].text.includes('【参考上下文】'),
  JSON.stringify(offRun.ctx.calls[0].messages[0].content[0].text));
check('off: the result reports no reference', offRun.result.context === null);
// `agents` is not a signal here: route resolution reads it either way. The two
// lookups that exist only for context are the session store and the corpus scan.
check('off: the session is never looked up', offRun.ctx.reads.sessions === 0, JSON.stringify(offRun.ctx.reads));
check('off: the project is never scanned', offRun.ctx.reads.sessionQuery === 0, JSON.stringify(offRun.ctx.reads));
check('off: the request is exactly the pre-context request',
  offRun.ctx.calls[0].messages[0].content[0].text === `【原始草稿】\n${draft}\n\n请按上面的风格输出优化后的提示词正文。`);
check('off: the draft still reaches the model', offRun.ctx.calls[0].messages[0].content[0].text.includes(draft));

// The same switch has to govern auto mode, which shares this one method.
const autoWith = async (flag) => {
  const base = await studio.loadDocument();
  await studio.saveDocument({ ...base, settings: { ...base.settings, injectContext: flag, autoOptimize: true } });
  studio.forgetProjectHistory();
  const calls = [];
  let sessionReads = 0;
  const ctx = {
    get(name) {
      if (name === 'sessions') { sessionReads += 1; return { get: () => asSession(conversation, 'C:/proj') }; }
      if (name === 'sessionQuery') return projectPages().get('sessionQuery');
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'p', model: 'm' }) };
      if (name === 'llm') {
        return {
          stream(options) {
            calls.push(options);
            return (async function* generate() {
              yield { type: 'text-delta', index: 0, text: '改写结果' };
              yield { type: 'finish', reason: { kind: 'stop' } };
            })();
          },
        };
      }
      return null;
    },
  };
  const message = {
    id: `auto-${flag}`,
    role: 'user',
    content: [{ type: 'text', text: draft }],
    source: { kind: 'user', rpcId: 'rpc-1' },
  };
  const decision = await studio.handlePreStep(
    ctx,
    { agent: { session: { id: 'session-here', header: { cwd: 'C:/proj' }, requestHeader: () => undefined } }, signal: undefined },
    async () => ({ kind: 'enter', messages: [message] }),
  );
  return { calls, sessionReads, decision };
};

const autoOn = await autoWith(true);
check('on: auto mode carries the reference block',
  autoOn.calls[0].messages[0].content[0].text.includes('【参考上下文】'));
check('on: auto mode rewrites the message', autoOn.decision.messages[0].content[0].text === '改写结果');

const autoOff = await autoWith(false);
check('off: auto mode carries no reference block',
  !autoOff.calls[0].messages[0].content[0].text.includes('【参考上下文】'),
  JSON.stringify(autoOff.calls[0].messages[0].content[0].text));
check('off: auto mode never looks up a session', autoOff.sessionReads === 0, String(autoOff.sessionReads));
check('off: auto mode still rewrites', autoOff.decision.messages[0].content[0].text === '改写结果');

// Leave the shipped default behind for anything that runs after this file.
const restore = await studio.loadDocument();
await studio.saveDocument({
  ...restore,
  settings: { ...restore.settings, injectContext: true, autoOptimize: false },
});

await mkdir(join(home, 'unused'), { recursive: true });
await rm(home, { recursive: true, force: true });
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
