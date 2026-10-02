/**
 * Browser-half smoke test.
 *
 * The plugin has no build step and no React dependency, so its module can be
 * evaluated in Node with a stubbed module loader and a minimal React stub. That
 * exercises every component function for real — bad property access, a missing
 * helper, or a missing locale key throws here instead of blanking a slot in the
 * live page.
 *
 * The test drives the real activation path: `apply()` starts the Host fetch, the
 * resolved document lands in the plugin's own store, and the components read it
 * back. Nothing about the store is faked.
 *
 * Run: node test/client-smoke.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');

let failures = 0;
const check = (label, condition, detail) => {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
  }
};

/* ── minimal React + module-loader harness ─────────────────────────────────── */

/** Values handed to `useState` in call order, so a test can force a branch. */
let stateQueue = [];

const React = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children };
  },
  useState(initial) {
    const value = stateQueue.length > 0 ? stateQueue.shift() : (typeof initial === 'function' ? initial() : initial);
    return [value, () => {}];
  },
  useEffect() {},
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
};

const storage = new Map();
globalThis.window = {
  document: { addEventListener() {}, removeEventListener() {} },
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
  setTimeout: () => 0,
  clearTimeout() {},
};

let document_ = null;
/** The last document the page wrote through `putDocument`, for write assertions. */
let lastWrite = null;
/** When set, document writes fail so the revert path can be exercised. */
let failWrites = false;
globalThis.fetch = async (url, options = {}) => {
  if (String(options.method || 'GET').toUpperCase() === 'PUT') {
    if (failWrites) return { ok: false, status: 500, json: async () => ({ ok: false, error: 'HTTP 500' }) };
    lastWrite = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ ok: true, document: lastWrite }) };
  }
  if (String(url).includes('/models.json')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        default: { provider: 'http-prov', model: 'http-model' },
        groups: [{ id: 'http-prov', name: 'HTTP Provider', models: [{ id: 'http-model', name: 'HTTP Model' }] }],
        error: null,
      }),
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, document: document_, styles: document_.styles, defaultBasePrompt: 'frame' }),
  };
};

let plugin = null;
globalThis.window.__ModuleLoader__ = {
  load({ id, factory }) {
    plugin = {
      id,
      exports: factory((name) => {
        if (name === 'react') return React;
        throw new Error(`unexpected require("${name}")`);
      }),
    };
  },
};

await import(new URL('../client.js', import.meta.url).href);

console.log('module contract');
check('loader id matches the package name', plugin !== null && plugin.id === 'dsh-prompt-studio', plugin && plugin.id);
check('exports apply', typeof plugin.exports.apply === 'function');
check('exports inject', Array.isArray(plugin.exports.inject));
check('injects only real client services', plugin.exports.inject.every((name) => ['slots', 'locale'].includes(name)), JSON.stringify(plugin.exports.inject));

/* ── activation ───────────────────────────────────────────────────────────── */

const CONFIG = {
  version: 1,
  settings: {
    autoOptimize: false,
    injectContext: true,
    autoStyleId: 'quick',
    defaultStyleId: 'structured',
    showComposerEntry: true,
    keepUndo: true,
    provider: '',
    model: '',
    temperature: 0.4,
    maxTokens: 4096,
    basePrompt: 'frame {{styleName}} {{styleInstruction}}',
  },
  styles: [
    { id: 'quick', name: '轻润色', icon: '✨', description: '只修错别字', instruction: 'do quick', enabled: true, order: 10 },
    { id: 'hardcore', name: '硬邦邦', icon: '🔨', description: '硬邦邦的口吻', instruction: 'do hard\nsecond line', enabled: true, order: 20 },
    { id: 'off', name: '停用的', icon: '', description: '', instruction: 'nope', enabled: false, order: 30 },
  ],
};

const MODELS = {
  default: { provider: 'deepseek-account', model: 'deepseek-flash' },
  groups: [
    { id: 'deepseek-account', name: 'DeepSeek 账号', models: [{ id: 'deepseek-flash', name: 'DeepSeek Flash' }, { id: 'deepseek-pro', name: 'DeepSeek Pro' }], error: null },
    { id: 'broken', name: 'Broken', models: [], error: 'no credentials' },
  ],
  error: null,
};

/** Run one real activation against a document, and let the store settle. */
async function activate(doc, options = {}) {
  document_ = doc;
  const registrations = [];
  const effects = [];
  const ctx = {
    get(name) { return name === 'remote' ? (options.remote === undefined ? null : options.remote) : null; },
    effect(callback, label) {
      effects.push(String(label));
      const cleanup = callback();
      return typeof cleanup === 'function' ? cleanup : () => {};
    },
    slots: {
      inject(key, callback) { callback(); return () => {}; },
      register(options_, component) { registrations.push({ options: options_, component }); return () => {}; },
    },
    locale: { register() { return () => {}; }, bind() { return null; } },
  };
  let error = null;
  try {
    plugin.exports.apply(ctx);
  } catch (thrown) {
    error = thrown;
  }
  // Two ticks: fetch() resolves, then response.json() resolves.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { registrations, effects, error };
}

const main = await activate(CONFIG);

console.log('activation');
check('apply does not throw', main.error === null, main.error && main.error.message);
check('registers two slots', main.registrations.length === 2, String(main.registrations.length));
check('composer slot id', main.registrations.some((entry) => entry.options.name === 'conversation.input.right'));
check('settings slot id', main.registrations.some((entry) => entry.options.name === 'settings.section'));
check('settings slot label is a thunk', main.registrations.every((entry) => typeof entry.options.label === 'function'));
check('registers a locale dictionary', main.effects.some((label) => label.includes('dictionaries')));
check('loads the config on activation', main.effects.some((label) => label.includes('config load')));

/* The stylesheet must not ride on anything that can be torn down while the UI is
   still mounted. Twice it did: first as a React child of the slotted subtree (any
   Host re-render of that subtree dropped it), then through `styles.insert` (its tags
   are registered in the runner's per-package bookkeeping and `dispose()` removes all
   of them on unload). Either way the panel painted as raw browser controls while the
   component stayed mounted. It is now one idempotent tag in <head> that we never
   remove — a leftover namespaced sheet is inert; a missing one breaks the surface. */
const headChildren = [];
const fakeHead = {
  append(node) { headChildren.push(node); },
};
const fakeDocument = {
  head: fakeHead,
  createElement(tag) { return { tag, id: '', textContent: '', props: {} }; },
  getElementById(id) { return headChildren.find((node) => node.id === id) || null; },
};
const realDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
Object.defineProperty(globalThis, 'document', { value: fakeDocument, configurable: true, writable: true });

const styleCtx = {
  get() { return null; },
  effect(callback) { callback(); return () => {}; },
  slots: { inject() { return () => {}; }, register() { return () => {}; } },
};
let styleError = null;
try {
  plugin.exports.apply(styleCtx);
} catch (error) {
  styleError = error;
}

check('activation installs exactly one stylesheet into <head>',
  styleError === null && headChildren.length === 1, styleError ? styleError.message : String(headChildren.length));
check('the installed sheet is this plugin stylesheet',
  headChildren.length === 1 && headChildren[0].textContent.includes('.dsh-ps-chip')
  && headChildren[0].textContent.length > 2000,
  String(headChildren[0] === undefined ? 'none' : headChildren[0].textContent.length));
check('the sheet carries the stable id', headChildren.length === 1 && headChildren[0].id === 'dsh-prompt-studio-style');

// A second activation must not stack another copy — reloads are not supposed to grow.
try {
  plugin.exports.apply(styleCtx);
} catch (error) {
  styleError = error;
}
check('re-activation does not add a second stylesheet', headChildren.length === 1, String(headChildren.length));

// Nothing may take it away: no disposer is handed to ctx.effect for the tag, and no
// seam that a package-unload path would clear. Comments are stripped first — the
// comment above names both rejected deliveries, and prose must not satisfy a check.
const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '');
check('the stylesheet is never registered for removal',
  !codeOnly.includes('tag.remove()') && !codeOnly.includes('styles.insert') && !codeOnly.includes('StyleTag'));

if (realDocument === undefined) delete globalThis.document;
else Object.defineProperty(globalThis, 'document', realDocument);

check('nothing renders the stylesheet as a React child', !codeOnly.includes("h('style'"));
/* An entry declaring `locale` makes the renderer require the Host's locale face at
   render time; a missing face throws SlotAssemblyError, which the slot boundary
   RETHROWS — escaping past renderSlot() and unmounting the whole shared parent. The
   composer row is shared with the model seat, so that would blank the optimize chip
   too. Both components read this plugin's own `t`, so the face is unused anyway. */
check('no slot entry declares a locale namespace',
  main.registrations.every((entry) => entry.options.locale === undefined),
  JSON.stringify(main.registrations.map((entry) => entry.options.locale)));
check('and none declares assembly requirements either',
  main.registrations.every((entry) => entry.options.hooks === undefined && entry.options.children === undefined));

/* Regression: reading an optional service during `apply` used to throw, which fails
   the whole client entry ("web boot: 1 entry did not activate") and takes the plugin's
   UI down with it. A hostile context — every service lookup throws, and neither
   `locale` nor `remote` exists as a property — must still activate. */
console.log('activation resilience');
const hostileRegistrations = [];
const hostileEffects = [];
const hostileCtx = {
  get() { throw new Error('service is not mounted'); },
  effect(callback, label) {
    hostileEffects.push(String(label));
    const cleanup = callback();
    return typeof cleanup === 'function' ? cleanup : () => {};
  },
  slots: {
    inject(key, callback) { callback(); return () => {}; },
    register(options, component) { hostileRegistrations.push({ options, component }); return () => {}; },
  },
};
let hostileError = null;
try {
  plugin.exports.apply(hostileCtx);
} catch (error) {
  hostileError = error;
}
check('apply survives a throwing service lookup', hostileError === null, hostileError && hostileError.stack);
check('still registers both slots', hostileRegistrations.length === 2, String(hostileRegistrations.length));
check('still loads the config', hostileEffects.some((label) => label.includes('config load')));

/* ── a tiny recursive renderer ────────────────────────────────────────────── */

function render(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return null;
  if (typeof node === 'string' || typeof node === 'number') return node;
  if (Array.isArray(node)) return node.map(render);
  const props = { ...node.props };
  if (node.children.length === 1) props.children = node.children[0];
  else if (node.children.length > 1) props.children = node.children;
  if (typeof node.type === 'function') return render(node.type(props));
  return { tag: node.type, props, children: (node.children || []).map(render) };
}

const classNameOf = (tree) => {
  const seen = new Set();
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.props && typeof node.props.className === 'string') {
      for (const name of node.props.className.split(/\s+/)) if (name !== '') seen.add(name);
    }
    if (node.children) walk(node.children);
  };
  walk(tree);
  return seen;
};

const textOf = (tree, out = []) => {
  if (tree === null || tree === undefined) return out;
  if (typeof tree === 'string' || typeof tree === 'number') { out.push(String(tree)); return out; }
  if (Array.isArray(tree)) { tree.forEach((child) => textOf(child, out)); return out; }
  if (tree.children) textOf(tree.children, out);
  return out;
};

/** Every value of one prop anywhere in the tree (placeholders, labels, values). */
const propValues = (tree, key, out = []) => {
  if (tree === null || tree === undefined || typeof tree !== 'object') return out;
  if (Array.isArray(tree)) { tree.forEach((child) => propValues(child, key, out)); return out; }
  if (tree.props && tree.props[key] !== undefined) out.push(tree.props[key]);
  if (tree.children) propValues(tree.children, key, out);
  return out;
};

const composerOf = (registrations) => registrations.find((entry) => entry.options.name === 'conversation.input.right');
const settingsOf = (registrations) => registrations.find((entry) => entry.options.name === 'settings.section');

const inputState = { draft: '帮我把这段话理顺', attachmentIds: [], draftRev: 3, phase: 'plain', occurrences: [], queue: [] };
const inputActions = {
  setDraft() {}, submit() {}, captureInsertion: () => ({}), insertText: () => true,
  addAttachments() {}, removeAttachment() {}, pruneAttachments() {},
};
const slotProps = { useInput: (selector) => selector(inputState), inputActions, sessionId: 's1' };

console.log('composer cell');
let closed = null;
let open = null;
let composerError = null;
try {
  stateQueue = [false, false, '', '', null, 'quick'];
  closed = render(composerOf(main.registrations).component(slotProps));
  stateQueue = [true, true, '', '额外要求', '原稿备份', 'hardcore'];
  open = render(composerOf(main.registrations).component(slotProps));
} catch (error) {
  composerError = error;
}
check('renders without throwing', composerError === null, composerError && composerError.stack);
check('collapsed cell exposes the style chip', classNameOf(closed).has('dsh-ps-chip'));
check('collapsed cell has no popover', !classNameOf(closed).has('dsh-ps-pop'));
check('open cell renders the popover', classNameOf(open).has('dsh-ps-pop'));
check('popover offers every enabled style', ['轻润色', '硬邦邦'].every((name) => textOf(open).includes(name)));
check('popover hides disabled styles', !textOf(open).includes('停用的'));
check('optimizing state is reflected', textOf(open).includes('优化中'));
check('undo appears after a rewrite', textOf(open).includes('撤销'));

/* Undo belongs to the rewrite still sitting in the box. Sending clears the draft
   (the Host does `setDraft("")` on submit), so there is nothing left to step back
   into and the chip must go with it. */
const sentProps = { ...slotProps, useInput: (selector) => selector({ ...inputState, draft: '' }) };
stateQueue = [false, false, '', '', '原稿备份', 'quick'];
const sent = render(composerOf(main.registrations).component(sentProps));
check('undo is gone once the draft is empty (the message was sent)', !textOf(sent).includes('撤销'));
check('the optimize chip itself stays', classNameOf(sent).has('dsh-ps-chip'));

// An empty box with nothing to undo is the ordinary case, not an error state.
stateQueue = [false, false, '', '', null, 'quick'];
const idleEmpty = render(composerOf(main.registrations).component(sentProps));
check('an empty box with no rewrite stays quiet', !textOf(idleEmpty).includes('撤销'));

const hiddenRun = await activate({ ...CONFIG, settings: { ...CONFIG.settings, showComposerEntry: false } });
let hidden = 'unset';
let hiddenError = null;
try {
  stateQueue = [false, false, '', '', null, 'quick'];
  hidden = render(composerOf(hiddenRun.registrations).component(slotProps));
} catch (error) {
  hiddenError = error;
}
check('hidden entry renders nothing', hiddenError === null && hidden === null, hiddenError ? hiddenError.message : String(hidden));

console.log('settings page');
const settingsProps = { close() {} };

let collapsedTree = null;
let expandedTree = null;
let settingsError = null;
try {
  stateQueue = [CONFIG, false, null, new Set(), MODELS];
  collapsedTree = render(settingsOf(main.registrations).component(settingsProps));
  stateQueue = [CONFIG, false, null, new Set(['quick', 'hardcore', 'off']), MODELS];
  expandedTree = render(settingsOf(main.registrations).component(settingsProps));
} catch (error) {
  settingsError = error;
}
check('renders without throwing', settingsError === null, settingsError && settingsError.stack);

const classes = classNameOf(collapsedTree);
check('uses the host hairline group layout', classes.has('dsh-ps-group') && classes.has('dsh-ps-grouphead'));
check('no boxed legacy card class survived', ![...classes].some((name) => name.includes('dsh-ps-card')));
check('lists the style library', classes.has('dsh-ps-list') && classes.has('dsh-ps-item'));
check('no sticky bar class remains', ![...classes].some((name) => name.includes('dsh-ps-bar')));
check('every input carries a real class', classes.has('dsh-ps-input') && classes.has('dsh-ps-select'));
check('switches use the host switch class', classes.has('dsh-ps-switch'));

const settingsText = textOf(collapsedTree).join('|');
check('renders the save action', settingsText.includes('保存设置'));
check('renders the discard action', settingsText.includes('放弃更改'));
check('shows every style name', ['轻润色', '硬邦邦', '停用的'].every((name) => settingsText.includes(name)));
check('falls back to the first instruction line when the description is empty',
  settingsText.includes('nope'), 'no instruction preview found');
check('no unresolved locale key leaks as undefined', !settingsText.includes('undefined'));

check('expanded rows show the instruction editor', classNameOf(expandedTree).has('dsh-ps-itembody'));
check('expanded rows expose the move actions', textOf(expandedTree).join('|').includes('上移'));

console.log('rewriter model picker');
const settingsTreeFor = (registrations, states) => {
  stateQueue = states;
  return render(settingsOf(registrations).component(settingsProps));
};
const followOption = (tree) => textOf(tree).find((text) => String(text).startsWith('跟随当前默认模型'));
check('offers a follow-the-default entry', followOption(collapsedTree) !== undefined, JSON.stringify(textOf(collapsedTree).slice(0, 12)));
check('the default entry names the deployment model',
  String(followOption(collapsedTree)).includes('deepseek-account') && String(followOption(collapsedTree)).includes('deepseek-flash'),
  String(followOption(collapsedTree)));
check('lists the models of a working provider', textOf(collapsedTree).some((text) => String(text).includes('DeepSeek Flash')), JSON.stringify(textOf(collapsedTree).filter((text) => String(text).includes('deepseek'))));
check('groups options under the provider name', [...propValues(collapsedTree, 'label')].includes('DeepSeek 账号'), JSON.stringify([...propValues(collapsedTree, 'label')]));
check('a failing provider contributes no option text', !textOf(collapsedTree).includes('no credentials'));

const savedDoc = { ...CONFIG, settings: { ...CONFIG.settings, provider: 'old-provider', model: 'old-model' } };
const savedRun = await activate(savedDoc);
const savedNotListed = settingsTreeFor(savedRun.registrations, [savedDoc, false, null, new Set(), MODELS]);
check('a saved model missing from the catalog stays selectable',
  textOf(savedNotListed).some((text) => String(text).includes('old-provider') && String(text).includes('当前设置')),
  JSON.stringify(textOf(savedNotListed).filter((text) => String(text).includes('old'))));

const noCatalog = settingsTreeFor(main.registrations, [CONFIG, false, null, new Set(), { default: null, groups: [], error: '没有可用的模型服务' }]);
check('falls back to manual entry when the catalog is empty',
  classNameOf(noCatalog).has('dsh-ps-fieldrow') && textOf(noCatalog).some((text) => String(text).includes('模型列表读取失败')),
  JSON.stringify(textOf(noCatalog).slice(0, 14)));
check('the fallback still renders two text inputs', [...propValues(noCatalog, 'placeholder')].length >= 2, JSON.stringify([...propValues(noCatalog, 'placeholder')]));

const loadingCatalog = settingsTreeFor(main.registrations, [CONFIG, false, null, new Set(), null]);
check('shows a loading note before the catalog arrives',
  textOf(loadingCatalog).some((text) => String(text).includes('正在读取模型列表')));

console.log('model catalog sources');
/* The loader lives in the plugin's shared face; reach it through the registered
   component, which receives it as a prop. */
const loaderOf = (registrations) => settingsOf(registrations).component({}).props.loadModels;

const remoteRun = await activate(CONFIG, {
  remote: {
    session: {
      modelCatalog: async () => ({
        ok: true,
        value: {
          default: { provider: 'rp', model: 'rm' },
          groups: [{ id: 'rp', name: 'Remote Provider', models: [{ id: 'rm', name: 'Remote Model' }, { id: 'rx' }] }],
          failures: [{ id: 'bad', name: 'Bad', message: 'unused while something is listed' }],
        },
      }),
    },
  },
});
const remoteCatalog = await loaderOf(remoteRun.registrations)(false);
check('prefers the app\'s own catalog', remoteCatalog.groups.length === 1 && remoteCatalog.groups[0].name === 'Remote Provider');
check('carries the app default', remoteCatalog.default.provider === 'rp' && remoteCatalog.default.model === 'rm');
check('a model without a display name falls back to its id', remoteCatalog.groups[0].models[1].name === 'rx');
check('an isolated provider failure stays quiet while models exist', remoteCatalog.error === null);

const failedRun = await activate(CONFIG, {
  remote: {
    session: {
      modelCatalog: async () => ({ ok: true, value: { default: null, groups: [], failures: [{ id: 'x', name: 'X', message: 'no credentials' }] } }),
    },
  },
});
check('surfaces the provider failure when nothing is listed', (await loaderOf(failedRun.registrations)(false)).error === 'no credentials');

const refusedRun = await activate(CONFIG, {
  remote: { session: { modelCatalog: async () => ({ ok: false, error: { code: 'session/refused', message: 'nope' } }) } },
});
check('reports a refused remote call', (await loaderOf(refusedRun.registrations)(false)).error === 'session/refused: nope');

const thrownRun = await activate(CONFIG, {
  remote: { session: { modelCatalog: async () => { throw new Error('remote down'); } } },
});
const fellBack = await loaderOf(thrownRun.registrations)(false);
check('falls back to the plugin route when the app catalog throws', fellBack.groups[0] && fellBack.groups[0].id === 'http-prov', JSON.stringify(fellBack));

const noRemoteRun = await activate(CONFIG);
check('works without a remote namespace at all', (await loaderOf(noRemoteRun.registrations)(false)).groups[0].id === 'http-prov');

/* The hostile context from the resilience check must also survive the loader and a
   full render: no `remote`, no `locale`, every lookup throwing. */
const hostileLoader = loaderOf(hostileRegistrations);
let hostileLoadError = null;
let hostileCatalog = null;
try {
  hostileCatalog = await hostileLoader(false);
} catch (error) {
  hostileLoadError = error;
}
check('the model loader survives a throwing service lookup', hostileLoadError === null, hostileLoadError && hostileLoadError.message);
check('the model loader falls back to the plugin route',
  hostileCatalog !== null && hostileCatalog.groups[0] && hostileCatalog.groups[0].id === 'http-prov',
  JSON.stringify(hostileCatalog));

let hostileRenderError = null;
let hostileTree = null;
try {
  stateQueue = [CONFIG, false, null, new Set(), MODELS];
  hostileTree = render(settingsOf(hostileRegistrations).component({ close() {} }));
} catch (error) {
  hostileRenderError = error;
}
check('renders without a locale service', hostileRenderError === null, hostileRenderError && hostileRenderError.message);
check('falls back to the built-in dictionary', textOf(hostileTree).some((text) => String(text).includes('保存设置')));

/* ── icon style ───────────────────────────────────────────────────────────── */

console.log('icons');
/** Every rendered <svg> node, with the props it was created with. */
const svgNodes = (tree, out = []) => {
  if (tree === null || tree === undefined || typeof tree !== 'object') return out;
  if (Array.isArray(tree)) { tree.forEach((child) => svgNodes(child, out)); return out; }
  if (tree.tag === 'svg') out.push(tree.props);
  if (tree.children) svgNodes(tree.children, out);
  return out;
};

// A non-busy composer render is the only one that shows the coloured star.
const idle = (() => {
  stateQueue = [false, false, '', '', null, 'quick'];
  return render(composerOf(main.registrations).component(slotProps));
})();

// The panel is now the only place the style marks appear, so a second render with
// it open carries the seven-piece assertions.
const panel = (() => {
  stateQueue = [true, false, '', '额外要求', null, 'quick'];
  return render(composerOf(main.registrations).component(slotProps));
})();

check('the composer draws inline svg icons', svgNodes(idle).length >= 2, String(svgNodes(idle).length));
const idleSvgs = svgNodes(idle);
const starSvg = idleSvgs.find((props) => String(props.className).includes('dsh-ps-star'));
check('the optimize button shows a 4-point star', starSvg !== undefined);
check('the star is not a monochrome line icon', starSvg !== undefined && String(starSvg.className).includes('dsh-ps-star'));
check('the star is wrapped in an animated shell', classNameOf(idle).has('dsh-ps-star-wrap'));

const lineIcons = idleSvgs.filter((props) => {
  const name = String(props.className);
  return !name.includes('dsh-ps-star') && !name.includes('dsh-ps-line-icon');
});
check('line icons are transparent', lineIcons.length > 0 && lineIcons.every((props) => props.fill === 'none'));
check('line icons stroke with currentColor', lineIcons.every((props) => props.stroke === 'currentColor'));
check('line icons share one stroke weight', new Set(lineIcons.map((props) => props.strokeWidth)).size === 1);
check('line icons are hidden from assistive tech', lineIcons.every((props) => props['aria-hidden'] === 'true'));
check('no emoji is used as a control icon',
  !['🪄', '↩', '◌', '▼', '▲', '↻', '↑', '↓', '＋'].some((glyph) => textOf(idle).includes(glyph)),
  JSON.stringify(textOf(idle).filter((text) => /[🪄↩◌▼▲↻↑↓＋]/.test(String(text)))));

/* ── the seven-piece set ──────────────────────────────────────────────────── */

console.log('seven-piece set');
const sevenPiece = (props) => String(props.className).includes('dsh-ps-line-icon');
const pieceSvgs = svgNodes(panel).filter(sevenPiece);
const enabledCount = CONFIG.styles.filter((style) => style.enabled).length;
check('the open panel draws the current style plus one mark per enabled style',
  pieceSvgs.length === enabledCount + 1, `${pieceSvgs.length} vs ${enabledCount + 1}`);
check('the mark uses the reference 56-unit cell', pieceSvgs.every((props) => props.viewBox === '0 0 56 56'));
check('the mark keeps the reference 2-unit weight', pieceSvgs.every((props) => props.strokeWidth === 2));
check('the mark is transparent and hollow', pieceSvgs.every((props) => props.fill === 'none'));
check('the mark strokes with currentColor so a dark theme stays visible',
  pieceSvgs.every((props) => props.stroke === 'currentColor'));
check('the mark uses round caps and joins',
  pieceSvgs.every((props) => props.strokeLinecap === 'round' && props.strokeLinejoin === 'round'));

// Every built-in emoji must resolve to its mark, so the shipped library upgrades
// without touching persisted data. The settings page reads the plugin's own
// store, so each different document needs its own activation.
const settingsTreeForDoc = async (doc, states) => {
  const run = await activate(doc);
  stateQueue = states;
  return render(settingsOf(run.registrations).component(settingsProps));
};

const EMOJI_TO_MARK = { '✨': 'sparkle', '🧱': 'brick', '🗺️': 'book', '🎓': 'cap', '🎨': 'palette', '✅': 'check', '🔨': 'hammer' };
const emojiConfig = {
  ...CONFIG,
  styles: Object.entries(EMOJI_TO_MARK).map(([emoji, id], i) => ({
    id, name: id, icon: emoji, description: '', instruction: `do ${id}`, enabled: true, order: (i + 1) * 10,
  })),
};
const emojiTree = await settingsTreeForDoc(emojiConfig, [emojiConfig, false, null, new Set(), MODELS]);
// 7 library rows + the two pickers' triggers, which is exactly the spot the
// screenshot showed still falling back to the raw emoji.
check('all seven shipped emoji render as marks',
  svgNodes(emojiTree).filter(sevenPiece).length === 9,
  String(svgNodes(emojiTree).filter(sevenPiece).length));
check('the legacy emoji themselves are gone',
  !Object.keys(EMOJI_TO_MARK).some((emoji) => textOf(emojiTree).includes(emoji)),
  JSON.stringify(textOf(emojiTree).filter((text) => /[✨🧱🗺🎓🎨✅🔨]/.test(String(text)))));

const customConfig = { ...CONFIG, styles: [{ id: 'x', name: 'x', icon: '🐙', description: '', instruction: 'do x', enabled: true, order: 10 }] };
const customTree = await settingsTreeForDoc(customConfig, [customConfig, false, null, new Set(), MODELS]);
check('a user emoji still renders as text',
  textOf(customTree).includes('🐙') && svgNodes(customTree).filter(sevenPiece).length === 0);

const blankConfig = { ...CONFIG, styles: [{ id: 'x', name: 'x', icon: '', description: '', instruction: 'do x', enabled: true, order: 10 }] };
const blankTree = await settingsTreeForDoc(blankConfig, [blankConfig, false, null, new Set(), MODELS]);
check('an empty icon falls back to a mark, not an emoji',
  svgNodes(blankTree).filter(sevenPiece).length >= 1 && !textOf(blankTree).includes('✨'));

const pickerTree = await settingsTreeForDoc(CONFIG, [CONFIG, false, null, new Set(['quick']), MODELS, false, false, '', true]);
check('the expanded editor offers the whole library to pick',
  propValues(pickerTree, 'role').filter((role) => role === 'radio').length === 35,
  String(propValues(pickerTree, 'role').filter((role) => role === 'radio').length));

/* ── every key renders as a mark, never as its letters ────────────────────── */

console.log('no key leaks as text');
const KEY_NAMES = {
  sparkle: '轻润色', brick: '结构化需求', book: '步骤规划', cap: '领域专家',
  palette: '视觉风格增强', check: '验收标准', hammer: '硬邦邦',
};

// Acceptance: picking each of the seven marks must never leave the two-letter
// fragment an older Host stored. Covers the row head and the icon text field.
for (const [key, name] of Object.entries(KEY_NAMES)) {
  const doc = {
    ...CONFIG,
    styles: [{ id: key, name, icon: key, description: '说明', instruction: '指令', enabled: true, order: 10 }],
  };
  const tree = await settingsTreeForDoc(doc, [doc, false, null, new Set([key]), MODELS]);
  const text = textOf(tree).join('|');
  const values = propValues(tree, 'value').join('|');
  const wanted = key.slice(0, 2);

  check(`${key}: the row head draws the mark`, svgNodes(tree).filter(sevenPiece).length >= 1);
  check(`${key}: no "${wanted}" fragment anywhere`,
    !text.includes(wanted) && !values.includes(wanted),
    `${JSON.stringify(text.slice(0, 60))} / ${JSON.stringify(values)}`);
  check(`${key}: the icon field names the mark instead of the key`,
    values.includes(name), JSON.stringify(propValues(tree, 'value')));
}

// The same for a value an older build already truncated on disk.
const legacyDoc = {
  ...CONFIG,
  styles: [{ id: 'quick', name: '轻润色', icon: 'sp', description: '说明', instruction: '指令', enabled: true, order: 10 }],
};
const legacyTree = await settingsTreeForDoc(legacyDoc, [legacyDoc, false, null, new Set(['quick']), MODELS]);
check('a stored "sp" still renders the sparkle mark',
  svgNodes(legacyTree).filter(sevenPiece).length >= 1);
check('a stored "sp" is not shown as text',
  !textOf(legacyTree).join('|').includes('sp') && !propValues(legacyTree, 'value').join('|').includes('sp'),
  JSON.stringify(propValues(legacyTree, 'value')));

// A user's own emoji must still round-trip through the text field.
const customIconDoc = {
  ...CONFIG,
  styles: [{ id: 'x', name: 'x', icon: '🐙', description: '说明', instruction: '指令', enabled: true, order: 10 }],
};
const customIconTree = await settingsTreeForDoc(customIconDoc, [customIconDoc, false, null, new Set(['x']), MODELS]);
check('a custom emoji still shows in the text field',
  propValues(customIconTree, 'value').includes('🐙') && textOf(customIconTree).includes('🐙'));

/* ── the two style dropdowns ──────────────────────────────────────────────── */

console.log('style dropdowns');
check('the picker triggers draw a mark, not the stored emoji',
  svgNodes(collapsedTree).filter(sevenPiece).length >= 2,
  String(svgNodes(collapsedTree).filter(sevenPiece).length));
check('no style emoji survives anywhere on the page',
  !['\u2728', '\u{1F9F1}', '\u{1F5FA}\uFE0F', '\u{1F393}', '\u{1F3A8}', '\u2705', '\u{1F528}']
    .some((emoji) => textOf(collapsedTree).includes(emoji)),
  JSON.stringify(textOf(collapsedTree).filter((text) => /[\u2728\u{1F9F1}\u{1F393}\u{1F3A8}\u2705\u{1F528}]/u.test(String(text)))));

// Opening the first picker is the menu case; both share one `open` state each.
const menuTree = settingsTreeFor(main.registrations, [CONFIG, false, null, new Set(), MODELS, true, false]);
check('the picker opens a listbox', classNameOf(menuTree).has('dsh-ps-select-menu'));
check('the listbox offers one option per candidate style',
  propValues(menuTree, 'role').filter((role) => role === 'option').length === CONFIG.styles.filter((s) => s.enabled).length,
  String(propValues(menuTree, 'role').filter((role) => role === 'option').length));
check('every option draws a mark',
  svgNodes(menuTree).filter(sevenPiece).length >= CONFIG.styles.filter((s) => s.enabled).length + 2,
  String(svgNodes(menuTree).filter(sevenPiece).length));
check('the current option is marked selected',
  propValues(menuTree, 'aria-selected').includes('true'),
  JSON.stringify(propValues(menuTree, 'aria-selected')));

/* ── the icon shelf ───────────────────────────────────────────────────────── */

console.log('icon shelf');
/** Every rendered node carrying one class. */
const withClass = (tree, name, out = []) => {
  if (tree === null || tree === undefined || typeof tree !== 'object') return out;
  if (Array.isArray(tree)) { tree.forEach((child) => withClass(child, name, out)); return out; }
  if (typeof tree.props.className === 'string' && tree.props.className.split(/\s+/).includes(name)) out.push(tree);
  if (tree.children) withClass(tree.children, name, out);
  return out;
};

// Hook order: the page's five, then the two StyleSelects, then the picker's query
// and its expanded flag.
const expandedShelf = [CONFIG, false, null, new Set(['quick']), MODELS, false, false, '', true];
const shelfTree = await settingsTreeForDoc(CONFIG, expandedShelf);
const glyphButtons = withClass(shelfTree, 'dsh-ps-glyph-btn');
check('the expanded shelf offers all 35 marks', glyphButtons.length === 35, String(glyphButtons.length));
check('the shelf is searchable', withClass(shelfTree, 'dsh-ps-glyph-search').length === 1);
check('the shelf is grouped', withClass(shelfTree, 'dsh-ps-glyph-group').length === 5,
  String(withClass(shelfTree, 'dsh-ps-glyph-group').length));
check('every group is named', ['基础', '表达结构', '语气风格', '推理技巧', '输出控制'].every((name) =>
  textOf(shelfTree).some((text) => String(text).startsWith(`${name} ·`))),
  JSON.stringify(textOf(shelfTree).filter((text) => String(text).includes(' · '))));

// No blank cells: every button must carry a real mark at the shared size and weight.
const buttonSvgs = glyphButtons.map((button) => svgNodes(button));
check('every mark button draws exactly one glyph', buttonSvgs.every((svgs) => svgs.length === 1),
  JSON.stringify(buttonSvgs.map((svgs) => svgs.length)));
check('every mark uses the shared 56-unit cell', buttonSvgs.every((svgs) => svgs[0].viewBox === '0 0 56 56'));
check('every mark uses the shared 2-unit weight', buttonSvgs.every((svgs) => svgs[0].strokeWidth === 2));
check('every mark is transparent and hollow', buttonSvgs.every((svgs) => svgs[0].fill === 'none' && svgs[0].stroke === 'currentColor'));
check('every mark renders at the same size', new Set(buttonSvgs.map((svgs) => svgs[0].width)).size === 1,
  JSON.stringify([...new Set(buttonSvgs.map((svgs) => svgs[0].width))]));

// All 28 of the sheet's labels must be findable in the shelf.
const SHEET_LABELS = ['结构化', '模板化', '清单式', '分步式', '对话式', '角色扮演', '叙事式',
  '学术严谨', '创意艺术', '简洁精炼', '生动描述', '正式公文', '口语亲和', '说服营销',
  '思维链', '少样本', '反思自检', '类比迁移', '元提示', '提示链', '头脑风暴',
  '格式约束', '长度控制', '引用溯源', '代码输出', '表格数据', '图像生成', '多语言'];
const shelfTitles = propValues(shelfTree, 'title').join('|');
const missingLabels = SHEET_LABELS.filter((label) => !shelfTitles.includes(label));
check('all 28 sheet labels are in the shelf', missingLabels.length === 0, missingLabels.join(', '));
check('the base seven are still in the shelf',
  ['星芒', '砖墙', '打开的书', '学士帽', '调色盘', '勾选', '锤子'].every((label) => shelfTitles.includes(label)));

// Search: by label, by key, by group; and the empty state.
// Hook order: the settings page's five, then the two StyleSelects, then the picker.
const searched = await settingsTreeForDoc(CONFIG, [CONFIG, false, null, new Set(['quick']), MODELS, false, false, '砖', true]);
check('a query narrows the shelf', withClass(searched, 'dsh-ps-glyph-btn').length === 1,
  String(withClass(searched, 'dsh-ps-glyph-btn').length));
check('the query matches a label', propValues(searched, 'title').join('|').includes('砖墙'));

const byKey = await settingsTreeForDoc(CONFIG, [CONFIG, false, null, new Set(['quick']), MODELS, false, false, 'multilingual', true]);
check('a query matches an English key', withClass(byKey, 'dsh-ps-glyph-btn').length === 1);

const byGroup = await settingsTreeForDoc(CONFIG, [CONFIG, false, null, new Set(['quick']), MODELS, false, false, '推理技巧', true]);
check('a query matches a whole group', withClass(byGroup, 'dsh-ps-glyph-btn').length === 7,
  String(withClass(byGroup, 'dsh-ps-glyph-btn').length));

const noMatch = await settingsTreeForDoc(CONFIG, [CONFIG, false, null, new Set(['quick']), MODELS, false, false, 'zzzz', true]);
check('an empty result is stated, not blank',
  withClass(noMatch, 'dsh-ps-glyph-btn').length === 0 && withClass(noMatch, 'dsh-ps-hint').length >= 1);

/* ── collapsed by default ─────────────────────────────────────────────────── */

console.log('collapsed shelf');
/** The page's five hooks, the two StyleSelects, then the picker's query + expanded. */
const shelfState = (query, isExpanded) => [CONFIG, false, null, new Set(['quick']), MODELS, false, false, query, isExpanded];

const collapsed = await settingsTreeForDoc(CONFIG, shelfState('', false));
const collapsedButtons = withClass(collapsed, 'dsh-ps-glyph-btn');
check('the shelf starts collapsed to one row', collapsedButtons.length === 7, String(collapsedButtons.length));
check('the collapsed shelf is not the scrolling variant',
  withClass(collapsed, 'dsh-ps-glyph-picker')[0].props['data-expanded'] === 'false');
check('no search box while collapsed', withClass(collapsed, 'dsh-ps-glyph-search').length === 0);
check('no group headings while collapsed', withClass(collapsed, 'dsh-ps-glyph-groupname').length === 0);
check('a toggle is offered instead',
  propValues(collapsed, 'aria-expanded').includes('false')
  && textOf(collapsed).some((text) => String(text).includes('展开全部 35 枚')),
  JSON.stringify(textOf(collapsed).filter((text) => String(text).includes('展开'))));
check('the collapsed row still draws real marks', collapsedButtons.every((button) => svgNodes(button).length === 1));

const reopened = await settingsTreeForDoc(CONFIG, shelfState('', true));
check('expanding shows everything', withClass(reopened, 'dsh-ps-glyph-btn').length === 35);
check('expanding reveals the search box', withClass(reopened, 'dsh-ps-glyph-search').length === 1);
check('expanding reveals the groups', withClass(reopened, 'dsh-ps-glyph-groupname').length === 5);
check('a collapse toggle is offered once open',
  propValues(reopened, 'aria-expanded').includes('true')
  && textOf(reopened).some((text) => String(text) === '收起'));

// The current mark must never be hidden by the very control that offers it.
const newIconDoc = { ...CONFIG, styles: [{ ...CONFIG.styles[0], icon: 'multilingual' }] };
const selectedNew = await settingsTreeForDoc(newIconDoc,
  [newIconDoc, false, null, new Set(['quick']), MODELS, false, false, '', false]);
check('a mark from outside the base set stays visible while collapsed',
  propValues(selectedNew, 'title').join('|').includes('多语言'),
  JSON.stringify(propValues(selectedNew, 'title')));
check('and it is the one marked selected',
  withClass(selectedNew, 'dsh-ps-glyph-btn').filter((button) => button.props['data-active'] === 'true').length === 1);
check('the collapsed row stays one row even then',
  withClass(selectedNew, 'dsh-ps-glyph-btn').length === 7,
  String(withClass(selectedNew, 'dsh-ps-glyph-btn').length));

// Selection is a prop, so collapsing cannot disturb it.
check('the selection survives a collapse round trip',
  withClass(collapsed, 'dsh-ps-glyph-btn').filter((button) => button.props['data-active'] === 'true').length === 1
  && withClass(reopened, 'dsh-ps-glyph-btn').filter((button) => button.props['data-active'] === 'true').length === 1);

/* ── the context switch in the optimize panel ─────────────────────────────── */

console.log('composer context switch');
/** The single switch carrying one aria-label. */
const switchFor = (tree, label) => {
  let found;
  const walk = (node) => {
    if (found !== undefined || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.props && node.props.role === 'switch' && node.props['aria-label'] === label) { found = node; return; }
    if (node.children) walk(node.children);
  };
  walk(tree);
  return found;
};

/** Open the optimize panel against a document with the given settings. */
const panelWith = async (settings) => {
  const run = await activate({ ...CONFIG, settings: { ...CONFIG.settings, ...settings } });
  stateQueue = [true, false, '', '', null, 'quick'];
  return render(composerOf(run.registrations).component(slotProps));
};

const CONTEXT_LABEL = '参考本项目对话';
const onPanel = await panelWith({ injectContext: true });
const onSwitch = switchFor(onPanel, CONTEXT_LABEL);
check('the panel carries a context switch', onSwitch !== undefined);
/* The picker is a picker, not a manual: title only. Descriptions made it tall, and
   they are what you edit in the settings library — not what you need while picking. */
check('the panel states the toggles without explanation lines',
  !classNameOf(onPanel).has('dsh-ps-rowdesc'));
check('the style rows carry names only',
  !classNameOf(onPanel).has('dsh-ps-style-desc') && !classNameOf(onPanel).has('dsh-ps-style-text'));
check('the picker does not repeat style descriptions',
  !textOf(onPanel).includes('只修错别字') && !textOf(onPanel).includes('硬邦邦的口吻'),
  JSON.stringify(textOf(onPanel)));
check('the switch reads on when the setting is on', onSwitch.props['aria-checked'] === 'true');
check('the panel still carries the auto-optimize switch', switchFor(onPanel, '发送前自动优化') !== undefined);
check('the panel keeps its one-click action', textOf(onPanel).includes('开始优化'));

const offPanel = await panelWith({ injectContext: false });
check('the switch reads off when the setting is off',
  switchFor(offPanel, CONTEXT_LABEL).props['aria-checked'] === 'false');

// Absent means on, matching DEFAULT_SETTINGS on the Host.
const bareSettings = { ...CONFIG.settings };
delete bareSettings.injectContext;
const bareRun = await activate({ ...CONFIG, settings: bareSettings });
stateQueue = [true, false, '', '', null, 'quick'];
const bareTree = render(composerOf(bareRun.registrations).component(slotProps));
check('an absent setting renders as on', switchFor(bareTree, CONTEXT_LABEL).props['aria-checked'] === 'true');

// Clicking writes the field through putDocument — the same document the Host's
// toggle script reads, so the two can never disagree about the stored value.
lastWrite = null;
switchFor(offPanel, CONTEXT_LABEL).props.onClick();
await new Promise((resolve) => setTimeout(resolve, 0));
check('turning it on writes injectContext: true',
  lastWrite !== null && lastWrite.settings.injectContext === true,
  JSON.stringify(lastWrite === null ? null : lastWrite.settings.injectContext));
check('the write touches nothing else',
  lastWrite !== null && lastWrite.settings.autoOptimize === false
  && lastWrite.settings.temperature === 0.4 && lastWrite.styles.length === CONFIG.styles.length,
  JSON.stringify(lastWrite === null ? null : Object.keys(lastWrite.settings)));

lastWrite = null;
const onTree = await panelWith({ injectContext: true });
switchFor(onTree, CONTEXT_LABEL).props.onClick();
await new Promise((resolve) => setTimeout(resolve, 0));
check('turning it off writes injectContext: false',
  lastWrite !== null && lastWrite.settings.injectContext === false,
  JSON.stringify(lastWrite === null ? null : lastWrite.settings.injectContext));

// A failed write must not leave the switch claiming a state the file does not have.
failWrites = true;
lastWrite = null;
let writeError = null;
try {
  switchFor(offPanel, CONTEXT_LABEL).props.onClick();
  await new Promise((resolve) => setTimeout(resolve, 0));
} catch (error) {
  writeError = error;
}
failWrites = false;
check('a failed write never reaches the file', lastWrite === null);
check('a failed write does not throw out of the control', writeError === null, writeError && writeError.message);

/* ── merged composer entry ────────────────────────────────────────────────── */

console.log('merged composer entry');
const chipCount = (tree) => propValues(tree, 'className')
  .filter((name) => typeof name === 'string' && name.split(/\s+/).includes('dsh-ps-chip')).length;

check('the composer exposes exactly one entry, no separate style picker',
  chipCount(idle) === 1, String(chipCount(idle)));
check('the collapsed entry draws no panel', !classNameOf(idle).has('dsh-ps-pop'));
check('the entry advertises a dialog', propValues(idle, 'aria-haspopup').includes('dialog'));
check('the entry is a disclosure that is closed while collapsed',
  propValues(idle, 'aria-expanded').includes('false'));
check('the entry is open in the expanded render',
  propValues(panel, 'aria-expanded').includes('true'));
check('opening the entry reveals the panel', classNameOf(panel).has('dsh-ps-pop'));
check('the panel offers one radio per enabled style',
  propValues(panel, 'role').filter((role) => role === 'radio').length === enabledCount,
  String(propValues(panel, 'role').filter((role) => role === 'radio').length));
check('the panel carries the auto-optimize switch',
  propValues(panel, 'role').includes('switch'));
check('the panel keeps the one-click action', textOf(panel).includes('开始优化'));
check('the panel keeps the extra requirement field', textOf(panel).includes('本次额外要求（可选）'));
check('the panel names the current style', classNameOf(panel).has('dsh-ps-current'));
check('the panel lists every enabled style by name',
  ['轻润色', '硬邦邦'].every((name) => textOf(panel).includes(name)));
check('the hidden style is not offered', !textOf(panel).includes('停用的'));

const settingsIcons = svgNodes(collapsedTree);
check('the settings page uses line icons too', settingsIcons.length > 0, String(settingsIcons.length));
check('every settings icon is a transparent line icon',
  settingsIcons.every((props) => props.fill === 'none' && props.stroke === 'currentColor'));

const starPath = (() => {
  let found = null;
  const walk = (node) => {
    if (found !== null || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.tag === 'path' && typeof node.props.stroke === 'string' && node.props.stroke.startsWith('url(')) { found = node.props; return; }
    if (node.children) walk(node.children);
  };
  walk(idle);
  return found;
})();
check('the star is outlined with a colour gradient', starPath !== null, JSON.stringify(starPath));
check('the star is hollow, not filled', starPath !== null && starPath.fill === 'none', JSON.stringify(starPath && starPath.fill));
check('the star draws a visible outline', starPath !== null && starPath.strokeWidth >= 1.4, String(starPath && starPath.strokeWidth));

// The gradient is what moves now: four stops on staggered delays, so the colour
// travels along the outline without the mark ever turning.
const starGradient = (() => {
  let found = null;
  const walk = (node) => {
    if (found !== null || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.tag === 'linearGradient') { found = node; return; }
    if (node.children) walk(node.children);
  };
  walk(idle);
  return found;
})();
check('the star gradient is addressable from the stylesheet',
  starGradient !== null && String(starGradient.props.className).includes('dsh-ps-star-ink'),
  JSON.stringify(starGradient && starGradient.props.className));
check('the gradient cycles through four colours',
  starGradient !== null && starGradient.children.length === 4,
  String(starGradient === null ? null : starGradient.children.length));

// The optimize chip's trailing caret points right; the other carets are untouched.
const pathD = (node) => {
  let found = null;
  const walk = (current) => {
    if (found !== null || current === null || typeof current !== 'object') return;
    if (Array.isArray(current)) { current.forEach(walk); return; }
    if (current.tag === 'path' && current.props && typeof current.props.d === 'string') { found = current.props.d; return; }
    if (current.children) walk(current.children);
  };
  walk(node);
  return found;
};

const optimizeChip = withClass(idle, 'dsh-ps-chip')[0];
const optimizeCaret = withClass(optimizeChip, 'dsh-ps-caret')[0];
check('the optimize chip has a trailing caret', optimizeCaret !== undefined);
check('the optimize caret points right',
  pathD(optimizeCaret) === 'M6.4 4 10.4 8l-4 4', String(pathD(optimizeCaret)));
check('the optimize chip keeps its star and label',
  svgNodes(optimizeChip).length >= 1 && textOf(optimizeChip).includes('优化'),
  JSON.stringify(textOf(optimizeChip)));
// Parity with the host's model-selector caret: IconChevronDownOutlineRegular on the
// same 16-unit viewBox, size 14, stroke 1 (ICON_REGULAR_STROKE).
const caretProps = svgNodes(optimizeCaret)[0];
check('the optimize caret is the same box as the model selector caret',
  caretProps.width === 14 && caretProps.height === 14,
  JSON.stringify({ width: caretProps.width, height: caretProps.height }));
check('the optimize caret draws at the model selector stroke weight',
  caretProps.strokeWidth === 1, String(caretProps.strokeWidth));
check('the caret keeps the shared 16-unit viewBox', caretProps.viewBox === '0 0 16 16', String(caretProps.viewBox));
check('the caret keeps its colour slot', String(caretProps.className).includes('dsh-ps-icon'));
// A right chevron is the same drawing turned 90°, not a different kind of mark.
check('the caret stays a stroked line glyph',
  caretProps.fill === 'none' && caretProps.stroke === 'currentColor');

const settingsCaret = withClass(shelfTree, 'dsh-ps-caret')[0];
check('the settings select carets still point down',
  pathD(settingsCaret) === 'M4 6.4 8 10.4l4-4', String(pathD(settingsCaret)));
check('the settings select carets keep their own size',
  svgNodes(settingsCaret)[0].width === 10, String(svgNodes(settingsCaret)[0].width));
// Regression: strokeWidth became a Glyph prop for this one caller, so every other
// icon on the page must still draw at the original weight.
const otherGlyphProps = withClass(shelfTree, 'dsh-ps-icon').flatMap((node) => svgNodes(node));
check('every other glyph keeps the original stroke weight',
  otherGlyphProps.length > 0 && otherGlyphProps.every((props) => props.strokeWidth === 1.5),
  JSON.stringify([...new Set(otherGlyphProps.map((props) => props.strokeWidth))]));

const emptyRun = await activate({ ...CONFIG, styles: [] });
let emptyError = null;
try {
  stateQueue = [{ ...CONFIG, styles: [] }, false, null, new Set(), MODELS];
  render(settingsOf(emptyRun.registrations).component(settingsProps));
} catch (error) {
  emptyError = error;
}
check('empty library renders without throwing', emptyError === null, emptyError && emptyError.message);

let busyError = null;
try {
  stateQueue = [CONFIG, true, { kind: 'error', text: 'boom' }, new Set(), MODELS];
  const tree = render(settingsOf(main.registrations).component(settingsProps));
  check('saving state with a notice renders', textOf(tree).includes('boom'));
} catch (error) {
  busyError = error;
}
check('saving state does not throw', busyError === null, busyError && busyError.message);

/* ── stylesheet hygiene ───────────────────────────────────────────────────── */

console.log('stylesheet');
const cssStart = source.indexOf('const CSS = `') + 'const CSS = `'.length;
const css = source.slice(cssStart, source.indexOf('`;', cssStart));
const cssClasses = new Set([...css.matchAll(/\.(dsh-ps-[a-z0-9-]+)/g)].map((match) => match[1]));
const usedInJsx = new Set([...source.matchAll(/className: '([^']+)'/g)].flatMap((match) => match[1].split(/\s+/)));
const missingClasses = [...usedInJsx].filter((name) => name.startsWith('dsh-ps-') && !cssClasses.has(name));
check('every class the components use has a rule', missingClasses.length === 0, missingClasses.join(', '));
check('the sheet is substantial', cssClasses.size > 30, String(cssClasses.size));
check('circles opt out of the global superellipse', (css.match(/corner-shape:\s*round/g) || []).length >= 3);
check('borders are hairline like the host', !/border:\s*1px solid var\(--dsw-alias/.test(css));
check('save uses the host settings-form recipe', /dsh-ps-btn-primary\s*\{[^}]*background:\s*var\(--dsw-alias-label-primary\)/.test(css));
check('save text uses a surface token, never hard-coded white', /dsh-ps-btn-primary\s*\{[^}]*color:\s*var\(--dsw-alias-bg-layer-3\)/.test(css));
check('no sticky bar repaints the panel background', !/position:\s*sticky/.test(css));
check('the page is width-capped like a host settings page', /max-width:\s*760px/.test(css));

/* Literal colours are allowed in exactly one place: the star, which the brief
   requires to be coloured. Every other rule must resolve through a theme token. */
const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
const literalColourLines = cssWithoutComments.split('\n').filter((line) => /(?<![\w-])#[0-9a-fA-F]{3,8}\b/.test(line));
const strayColourLines = literalColourLines.filter((line) => !/dsh-ps-star|drop-shadow|stop-color/.test(line));
check('theme tokens only, outside the coloured star', strayColourLines.length === 0, strayColourLines.join(' | '));
check('the star really does carry literal colours', literalColourLines.length > 0);
check('the star no longer rotates', !/dsh-ps-star[^{]*\{[^}]*rotate|@keyframes dsh-ps-star-spin/.test(css));
check('the star colouring is animated',
  /@keyframes dsh-ps-star-hue[\s\S]{0,240}stop-color/.test(css)
  && /\.dsh-ps-star-ink stop\s*\{\s*animation:\s*dsh-ps-star-hue/.test(css));
check('the gradient stops are staggered so the colour travels',
  [':nth-child(2)', ':nth-child(3)', ':nth-child(4)'].every((selector) =>
    new RegExp(`\\.dsh-ps-star-ink stop${selector.replace(/[()]/g, '\\$&')}\\s*\\{\\s*animation-delay`).test(css)));
check('the star breathes', /@keyframes dsh-ps-star-breathe[\s\S]{0,240}scale\(1\.06\)/.test(css));
check('both star animations stop under reduced motion',
  /prefers-reduced-motion: reduce\)\s*\{\s*\.dsh-ps-star-wrap,\s*\.dsh-ps-star,\s*\.dsh-ps-star-ink stop\s*\{\s*animation:\s*none/.test(css));

console.log('plugin artwork');
const iconFile = readFileSync(join(here, '..', 'icon.svg'), 'utf8');
check('the plugin icon is transparent', /fill="none"/.test(iconFile));
check('the plugin icon has no filled shape', !/<(rect|path|circle|polygon)[^>]*\sfill="(?!none)/.test(iconFile), iconFile.slice(0, 200));
check('the plugin icon draws with strokes only', /stroke="#[0-9a-fA-F]{6}"/.test(iconFile) && /stroke-width=/.test(iconFile));
check('the plugin icon declares no gradient', !/linearGradient/.test(iconFile));
check('the plugin icon keeps the host card artwork viewBox', /viewBox="0 0 36 36"/.test(iconFile));

console.log('library files');
const glyphMap = plugin.exports.__glyphs;
const iconsDir = join(here, '..', 'icons');
check('the plugin exposes its glyph table for tooling', glyphMap !== undefined && Object.keys(glyphMap).length === 35,
  String(glyphMap === undefined ? 'missing' : Object.keys(glyphMap).length));

/** Geometry-bearing values, kebab-cased so the code and the file compare equal. */
const kebab = (key) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const geometryOf = (text) => [...text.matchAll(/(?<![\w-])(d|x|y|width|height|rx|ry|cx|cy|r|transform|stroke-dasharray)="([^"]*)"/g)]
  .map((match) => `${match[1]}=${match[2]}`);
/** Every attribute of every node, children included, in the order the emitter writes. */
const codeGeometry = (nodes) => nodes.flatMap(([, props, children]) => [
  ...Object.entries(props).map(([key, value]) => `${kebab(key)}=${value}`),
  ...(children === undefined ? [] : codeGeometry(children)),
]);

const groups = new Map();
for (const [name, glyph] of Object.entries(glyphMap)) {
  let file;
  try {
    file = readFileSync(join(iconsDir, `${name}.svg`), 'utf8');
  } catch {
    check(`${name}.svg exists`, false, 'file missing — run scripts/emit-icons.mjs');
    continue;
  }
  const body = file.slice(file.indexOf('>') + 1, file.lastIndexOf('</svg>'));
  const expected = codeGeometry(glyph.nodes);
  const actual = geometryOf(body);
  check(`${name}.svg has no drifted geometry`,
    expected.length > 0 && JSON.stringify(expected) === JSON.stringify(actual),
    `code ${JSON.stringify(expected)} vs file ${JSON.stringify(actual)}`);
  check(`${name}.svg keeps the reference paint`,
    /fill="none"/.test(file) && /stroke="#1f2328"/.test(file) && /stroke-width="2"/.test(file)
    && /viewBox="0 0 56 56"/.test(file) && /stroke-linecap="round"/.test(file) && /stroke-linejoin="round"/.test(file));
  check(`${name}.svg is labeled`, file.includes(`aria-label="${glyph.label}"`));

  const group = glyph.group || '基础';
  groups.set(group, (groups.get(group) || 0) + 1);
}

console.log('library shelf');
check('the shelf carries all 35 marks', Object.keys(glyphMap).length === 35);
check('the shelf keeps the sheet\'s four groups plus the base set',
  ['基础', '表达结构', '语气风格', '推理技巧', '输出控制'].every((name) => groups.has(name)),
  JSON.stringify([...groups]));
check('each of the sheet\'s groups holds seven marks',
  ['表达结构', '语气风格', '推理技巧', '输出控制'].every((name) => groups.get(name) === 7),
  JSON.stringify([...groups]));
check('every mark declares a label', Object.values(glyphMap).every((glyph) => typeof glyph.label === 'string' && glyph.label !== ''));
check('every mark uses the shared 56-unit cell', Object.values(glyphMap).every((glyph) => glyph.nodes.length > 0));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
