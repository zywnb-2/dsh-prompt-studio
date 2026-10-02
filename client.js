/**
 * dsh-prompt-studio — browser half.
 *
 * Two contributions, both through ordinary Slots:
 *
 *   conversation.input.right   the composer cell in front of Send: a style picker,
 *                              the one-click optimize button, an optional extra
 *                              requirement, one-step undo, and a live mirror of the
 *                              "auto optimize on send" switch.
 *   settings.section           the whole management page: general settings, the
 *                              editable style library, and the optimizer frame.
 *
 * Everything the page shows comes from the Host route
 * `/plugins/dsh-prompt-studio/config.json`; the rewrite itself is
 * `POST /plugins/dsh-prompt-studio/optimize`, so the manual button and auto mode
 * run the exact same code path on the Host.
 *
 * Styling uses only `--dsw-alias-*` theme tokens, so light/dark switch with the Host.
 */
window.__ModuleLoader__.load({
  id: 'dsh-prompt-studio',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;

    const ROUTE_BASE = '/plugins/dsh-prompt-studio';
    const NS = 'prompt-studio';
    /** Browser-local preference: the style the composer currently points at. */
    const ACTIVE_STYLE_KEY = 'prompt-studio.activeStyleId';
    /** Fallback frame when the Host document has not arrived yet. */
    const FALLBACK_STYLE = { id: 'quick', name: '轻润色', icon: '✨' };

    /* ── locale ───────────────────────────────────────────────────────────── */

    const DICTS = {
      zh: {
        'title': '提示词工坊',
        'intro': '为发送的提示词挑选一种优化风格：输入框里一键优化，也可以在发送时自动优化。',
        'composer.optimize': '优化',
        'composer.optimizing': '优化中',
        'composer.style': '风格',
        'composer.extra': '本次额外要求（可选）',
        'composer.extraPlaceholder': '例如：保留英文术语 / 输出控制在 200 字内',
        'composer.auto': '发送前自动优化',
        'composer.context': '参考本项目对话',
        'composer.start': '开始优化',
        'composer.undo': '撤销',
        'composer.empty': '请先输入内容',
        'composer.failed': '优化失败',
        'settings.tab': '提示词工坊',
        'settings.save': '保存设置',
        'settings.saving': '保存中…',
        'settings.saved': '已保存',
        'settings.revert': '放弃更改',
        'settings.dirty': '有未保存的更改',
        'settings.section.general': '常规',
        'settings.section.generalDesc': '入口位置、自动优化与优化所用模型。',
        'settings.section.styles': '风格库',
        'settings.section.stylesDesc': '每个风格就是一段优化指令；可新增、编辑、停用、删除、调整顺序。',
        'settings.section.frame': '优化器提示词',
        'settings.section.frameDesc': '所有风格共用的框架。{{styleName}} 与 {{styleInstruction}} 会替换为所选风格。',
        'settings.auto': '发送前自动优化',
        'settings.autoDesc': '开启后，每次发送时先按「自动优化风格」改写提示词，再交给模型；对话记录中保留原话。',
        'settings.autoStyle': '自动优化风格',
        'settings.defaultStyle': '输入框默认风格',
        'settings.defaultStyleDesc': '打开新会话时输入框预选的风格。',
        'settings.showEntry': '在输入框显示入口',
        'settings.showEntryDesc': '关闭后隐藏输入框中的风格选择与优化按钮，自动优化仍然生效。',
        'settings.keepUndo': '保留一键撤销',
        'settings.keepUndoDesc': '优化后在输入框提供「撤销」，一键回到优化前的原稿。',
        'settings.provider': 'Provider',
        'settings.modelTitle': '优化模型',
        'settings.model': 'Model',
        'settings.modelHint': '不改就跟随当前默认模型。',
        'settings.modelFollow': '跟随当前默认模型',
        'settings.modelRefresh': '刷新模型列表',
        'settings.modelEmpty': '没读到可用模型，先手动填写。',
        'settings.modelSaved': '当前设置（不在模型列表里）',
        'settings.modelFailed': '模型列表读取失败',
        'settings.modelLoading': '正在读取模型列表…',
        'settings.temperature': '温度',
        'settings.maxTokens': '最大输出 Tokens',
        'settings.style.new': '新增风格',
        'settings.style.restore': '恢复内置风格',
        'settings.style.name': '名称',
        'settings.style.icon': '图标',
        'settings.style.desc': '说明',
        'settings.style.instruction': '优化指令',
        'settings.style.instructionHint': '写给优化模型的风格要求，越具体越稳定。',
        'settings.style.enabled': '启用',
        'settings.style.duplicate': '复制',
        'settings.style.edit': '展开编辑',
        'settings.style.iconPick': '图标（黑色线条七件套）',
        'settings.style.iconHint': '铁线描边，跟随主题；也可以直接填任意 emoji。',
        'settings.style.iconSearch': '搜索图标（名称或分组）',
        'settings.style.iconExpand': '展开全部 {count} 枚',
        'settings.style.iconCollapse': '收起',
        'settings.style.iconNoMatch': '没有匹配的图标。',
        'settings.iconTruncated': '宿主版本较旧，把图标名截断了 —— 完整退出并重开应用后再选新图标。',
        'settings.style.delete': '删除',
        'settings.style.up': '上移',
        'settings.style.down': '下移',
        'settings.style.confirmDelete': '删除风格「{name}」？此操作在保存后生效。',
        'settings.frame.reset': '恢复默认框架',
        'settings.frame.placeholders': '可用占位符：{{styleName}}、{{styleInstruction}}',
        'settings.about': '关于',
        'settings.aboutText': '配置保存在 $DSH_HOME/prompt-studio/config.json，升级插件不会丢失。',
        'settings.emptyStyles': '风格库为空，请新增一个风格。',
        'settings.unnamed': '未命名风格',
      },
      en: {
        'title': 'Prompt Studio',
        'intro': 'Pick a rewrite style for outbound prompts: one click in the composer, or automatically on send.',
        'composer.optimize': 'Rewrite',
        'composer.optimizing': 'Rewriting',
        'composer.style': 'Style',
        'composer.extra': 'Extra requirement for this run (optional)',
        'composer.extraPlaceholder': 'e.g. keep English terms / stay under 200 words',
        'composer.auto': 'Rewrite before send',
        'composer.context': 'Use the project conversation',
        'composer.start': 'Rewrite now',
        'composer.undo': 'Undo',
        'composer.empty': 'Type something first',
        'composer.failed': 'Rewrite failed',
        'settings.tab': 'Prompt Studio',
        'settings.save': 'Save settings',
        'settings.saving': 'Saving…',
        'settings.saved': 'Saved',
        'settings.revert': 'Discard changes',
        'settings.dirty': 'Unsaved changes',
        'settings.section.general': 'General',
        'settings.section.generalDesc': 'Composer entry, automatic rewriting, and which model rewrites.',
        'settings.section.styles': 'Style library',
        'settings.section.stylesDesc': 'A style is one rewriting instruction. Add, edit, disable, delete, reorder.',
        'settings.section.frame': 'Optimizer frame',
        'settings.section.frameDesc': 'Shared by every style. {{styleName}} and {{styleInstruction}} are replaced per style.',
        'settings.auto': 'Rewrite before send',
        'settings.autoDesc': 'Before each send, rewrite the prompt with the automatic style; the transcript keeps the original.',
        'settings.autoStyle': 'Automatic style',
        'settings.defaultStyle': 'Composer default style',
        'settings.defaultStyleDesc': 'Pre-selected in the composer for new sessions.',
        'settings.showEntry': 'Show the composer entry',
        'settings.showEntryDesc': 'Hides the style picker and rewrite button; automatic rewriting still applies.',
        'settings.keepUndo': 'Keep one-step undo',
        'settings.keepUndoDesc': 'Offer Undo in the composer right after a rewrite.',
        'settings.provider': 'Provider',
        'settings.modelTitle': 'Rewriter model',
        'settings.model': 'Model',
        'settings.modelHint': 'Leave it alone to follow the current default model.',
        'settings.modelFollow': 'Follow the current default model',
        'settings.modelRefresh': 'Refresh the model list',
        'settings.modelEmpty': 'No models were listed — enter them by hand.',
        'settings.modelSaved': 'Current setting (not in the list)',
        'settings.modelFailed': 'Could not read the model list',
        'settings.modelLoading': 'Reading the model list…',
        'settings.temperature': 'Temperature',
        'settings.maxTokens': 'Max output tokens',
        'settings.style.new': 'New style',
        'settings.style.restore': 'Restore built-in styles',
        'settings.style.name': 'Name',
        'settings.style.icon': 'Icon',
        'settings.style.desc': 'Description',
        'settings.style.instruction': 'Instruction',
        'settings.style.instructionHint': 'What this style tells the rewriter. Specific beats clever.',
        'settings.style.enabled': 'Enabled',
        'settings.style.duplicate': 'Duplicate',
        'settings.style.edit': 'Expand to edit',
        'settings.style.iconPick': 'Icon (the seven-piece line set)',
        'settings.style.iconHint': 'Black-line marks that follow the theme; any emoji still works here.',
        'settings.style.iconSearch': 'Search icons (name or group)',
        'settings.style.iconExpand': 'Show all {count}',
        'settings.style.iconCollapse': 'Collapse',
        'settings.style.iconNoMatch': 'No icon matches.',
        'settings.iconTruncated': 'The installed Host truncated the icon name — restart the app before picking a new mark.',
        'settings.style.delete': 'Delete',
        'settings.style.up': 'Move up',
        'settings.style.down': 'Move down',
        'settings.style.confirmDelete': 'Delete style “{name}”? It applies once you save.',
        'settings.frame.reset': 'Restore the default frame',
        'settings.frame.placeholders': 'Placeholders: {{styleName}}, {{styleInstruction}}',
        'settings.about': 'About',
        'settings.aboutText': 'Stored in $DSH_HOME/prompt-studio/config.json; plugin upgrades keep it.',
        'settings.emptyStyles': 'The library is empty — add a style.',
        'settings.unnamed': 'Untitled style',
      },
    };

    /* ── tiny external store (no Harness Client package is importable) ────── */

    function createStore(initial) {
      let value = initial;
      const listeners = new Set();
      return {
        get: () => value,
        set: (next) => {
          value = next;
          for (const listener of [...listeners]) listener();
        },
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
    }

    const useStoreValue = (store) => useSyncExternalStore(store.subscribe, store.get, store.get);

    /**
     * Read an optional client service without ever throwing.
     *
     * Both `ctx.get(name)` and `ctx[name]` can throw for a service this
     * composition does not mount, and an exception during `apply` fails the whole
     * client entry — the Host reports it as "web boot: N entries did not activate"
     * and the plugin's UI never appears. Optional services are therefore resolved
     * through here, lazily, instead of being touched during activation.
     */
    function optionalService(ctx, name) {
      try {
        if (typeof ctx.get === 'function') {
          const value = ctx.get(name);
          if (value !== undefined && value !== null) return value;
        }
      } catch {
        /* not mounted in this composition */
      }
      try {
        const value = ctx[name];
        if (value !== undefined && value !== null) return value;
      } catch {
        /* not mounted in this composition */
      }
      return null;
    }

    /* ── host I/O ─────────────────────────────────────────────────────────── */

    async function fetchDocument() {
      const response = await fetch(`${ROUTE_BASE}/config.json`, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload || payload.ok !== true || !payload.document) throw new Error('malformed response');
      return payload.document;
    }

    async function putDocument(document) {
      const response = await fetch(`${ROUTE_BASE}/config.json`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(document),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.ok !== true) {
        throw new Error((payload && payload.error) || `HTTP ${response.status}`);
      }
      return payload.document;
    }

    /**
     * The seeded library and frame live on the Host (one source of truth); the page
     * fetches them only when the user asks to restore defaults.
     */
    async function fetchDefaults() {
      const response = await fetch(`${ROUTE_BASE}/defaults.json`, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload || payload.ok !== true) throw new Error('malformed response');
      return payload;
    }

    async function requestOptimize(body) {
      const response = await fetch(`${ROUTE_BASE}/optimize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) throw new Error(`HTTP ${response.status}`);
      if (payload.ok !== true) throw new Error(payload.error || 'optimize failed');
      return payload;
    }

    /**
     * Normalize the Host's own model catalog (`session.modelCatalog`) into the
     * shape both sources share.
     */    function normalizeCatalog(value) {
      const catalog = value || {};
      const groups = (Array.isArray(catalog.groups) ? catalog.groups : []).map((group) => ({
        id: group.id,
        name: group.name,
        error: null,
        models: (Array.isArray(group.models) ? group.models : []).map((model) => ({ id: model.id, name: model.name || model.id })),
      }));
      const failures = Array.isArray(catalog.failures) ? catalog.failures : [];
      const listed = groups.some((group) => group.models.length > 0);
      const first = failures.find((failure) => failure && failure.message);
      return {
        default: catalog.default && catalog.default.provider
          ? { provider: catalog.default.provider, model: catalog.default.model }
          : null,
        groups,
        error: listed || first === undefined ? null : first.message,
      };
    }

    /**
     * Load the models this deployment currently exposes.
     *
     * Preferred source is the app's own client-callable catalog — the same one the
     * composer's model selector reads, already authenticated and live, so the picker
     * needs no extra Host route. The plugin's own `/models.json` is the fallback for
     * compositions where the remote namespace is unavailable.
     *
     * The remote namespace is resolved lazily, per call, through `optionalService`:
     * reading an unmounted service during `apply` is exactly what makes a client
     * entry fail to activate, and a boot failure takes the whole plugin down.
     */
    function createModelLoader(ctx) {
      return async function load(fresh) {
        let session = null;
        try {
          const remote = optionalService(ctx, 'remote');
          const namespace = remote === null ? null : remote.session;
          if (namespace !== null && namespace !== undefined && typeof namespace.modelCatalog === 'function') session = namespace;
        } catch {
          // A remote namespace that is still mounting is not an error; fall through.
          session = null;
        }
        // The remote catalog is rebuilt per call, so it is already fresh; `fresh`
        // only matters for the plugin's own cached route below.
        if (session !== null) {
          try {
            const response = await session.modelCatalog();
            if (response && response.ok === true) return normalizeCatalog(response.value);
            if (response && response.error) {
              return { default: null, groups: [], error: `${response.error.code}: ${response.error.message}` };
            }
          } catch {
            /* fall through to the plugin's own route */
          }
        }
        return fetchModels(fresh);
      };
    }

    /**
     * The models this deployment currently exposes, grouped by provider, plus the
     * deployment default. Transport failures throw; a Host that answered `ok:false`
     * (no `llm` service, listing refused) comes back as an empty catalog with the
     * reason, so the page can fall back to manual entry instead of erroring out.
     */
    async function fetchModels(fresh) {
      const response = await fetch(`${ROUTE_BASE}/models.json${fresh ? '?fresh=1' : ''}`, {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload) throw new Error('malformed response');
      return {
        default: payload.default || null,
        groups: Array.isArray(payload.groups) ? payload.groups : [],
        error: payload.ok === true ? null : (payload.error || 'unknown'),
      };
    }

    /* ── styles ───────────────────────────────────────────────────────────── */

    /** Stable id for the one <head> tag this plugin owns; see installStylesheet. */
    const STYLE_ID = 'dsh-prompt-studio-style';

    const CSS = `
/* ─────────────────────────────────────────────────────────────────────────
   Prompt Studio styles.

   Every rule here follows one of three sources:
     1. the platform design tokens (--dsw-alias-*, --dsw-radius-*) so light and
        dark themes both work;
     2. the host primitives' own CSS (Button/Input/Switch/settings-form) copied
        at the declaration level, so controls match the shell;
     3. the reference third-party settings page layout: plain hairline-separated
        groups on the panel background, no boxed cards, no sticky bar.
   The platform applies corner-shape: superellipse(1.5) to every element, so
   circular and pill controls opt out explicitly, exactly as the host's own
   Switch and Pill do.
   ───────────────────────────────────────────────────────────────────────── */

.dsh-ps-scope, .dsh-ps-page { box-sizing: border-box; }
.dsh-ps-scope *, .dsh-ps-scope *::before, .dsh-ps-scope *::after,
.dsh-ps-page *, .dsh-ps-page *::before, .dsh-ps-page *::after { box-sizing: border-box; }

/* ── composer cell ──────────────────────────────────────────────────────── */

.dsh-ps-scope { position: relative; display: inline-flex; align-items: center; gap: 2px; }
.dsh-ps-chip {
  display: inline-flex; align-items: center; gap: 4px; max-width: 150px;
  height: 28px; padding: 0 8px;
  border: 0; border-radius: var(--dsw-radius-sm); corner-shape: round;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12px; line-height: 18px; white-space: nowrap; cursor: pointer;
}
.dsh-ps-chip:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-ps-chip[data-open="true"] {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-button-ghost-active-fill, var(--dsw-alias-interactive-bg-hover));
  box-shadow: inset 0 0 0 1px var(--dsw-alias-button-ghost-active-border, var(--dsw-alias-border-l3));
}
.dsh-ps-chip:disabled { opacity: .4; cursor: default; }
.dsh-ps-chip:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.dsh-ps-chip-label { overflow: hidden; text-overflow: ellipsis; }
.dsh-ps-caret { color: var(--dsw-alias-label-tertiary); font-size: 9px; line-height: 1; }
.dsh-ps-spin { display: inline-block; animation: dsh-ps-rotate 900ms linear infinite; }
@keyframes dsh-ps-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .dsh-ps-spin { animation: none; } }

.dsh-ps-pop {
  position: absolute; right: 0; bottom: calc(100% + 8px); z-index: 40;
  width: 320px; max-width: min(320px, calc(100vw - 24px));
  padding: 12px; border-radius: var(--dsw-radius-lg);
  background: var(--dsw-menu-surface-fill, var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2)));
  backdrop-filter: var(--dsw-menu-backdrop-filter, none);
  border: .5px solid var(--dsw-alias-border-l3);
  box-shadow: var(--dsw-elevation-shadow, 0 16px 40px rgba(0, 0, 0, .32));
  color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 1.5; text-align: left;
}
.dsh-ps-pop-label { margin: 0 0 6px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dsh-ps-pop-label + .dsh-ps-style-list, .dsh-ps-pop-label + .dsh-ps-input { margin-bottom: 12px; }
.dsh-ps-pop-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.dsh-ps-pop-head .dsh-ps-pop-label { margin: 0; }
.dsh-ps-current { display: inline-flex; align-items: center; gap: 5px; color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 18px; }
.dsh-ps-current-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px; }

/* A style picker that can draw glyphs where a native <select> cannot. */
.dsh-ps-selectbox { position: relative; width: 100%; }
.dsh-ps-select-trigger {
  display: flex; align-items: center; gap: 8px; width: 100%; height: 34px; padding: 0 12px;
  border: .5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px; line-height: 1.5; text-align: left; cursor: pointer;
}
.dsh-ps-select-trigger:hover { border-color: var(--dsw-alias-border-l3); }
.dsh-ps-select-trigger:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.dsh-ps-select-glyph { flex: none; }
.dsh-ps-select-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-ps-select-trigger .dsh-ps-caret { flex: none; }
.dsh-ps-select-menu {
  position: absolute; z-index: 30; top: calc(100% + 4px); left: 0; right: 0;
  max-height: 264px; overflow-y: auto; padding: 4px;
  border: .5px solid var(--dsw-alias-border-l3); border-radius: var(--dsw-radius-md);
  background: var(--dsw-menu-surface-fill, var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2)));
  backdrop-filter: var(--dsw-menu-backdrop-filter, none);
  box-shadow: var(--dsw-elevation-shadow, 0 12px 32px rgba(0, 0, 0, .28));
}
.dsh-ps-select-option {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px;
  border: 0; border-radius: var(--dsw-radius-xs); background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 20px;
  text-align: left; cursor: pointer;
}
.dsh-ps-select-option:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-ps-select-option[data-active="true"] {
  background: var(--dsw-alias-button-ghost-active-fill, var(--dsw-alias-interactive-bg-hover));
}
.dsh-ps-select-option:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}

.dsh-ps-style-list { display: flex; flex-direction: column; gap: 2px; max-height: 208px; overflow-y: auto; }
/* One line per style: icon + name. Descriptions live in the settings library, where
   they are what you actually edit — in the picker they only made the list taller. */
.dsh-ps-style-item {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  padding: 6px 8px; border: 0; border-radius: var(--dsw-radius-sm);
  background: transparent; color: inherit; font: inherit; cursor: pointer;
}
.dsh-ps-style-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-ps-style-item[aria-checked="true"] {
  background: var(--dsw-alias-button-ghost-active-fill, var(--dsw-alias-interactive-bg-hover));
  box-shadow: inset 0 0 0 1px var(--dsw-alias-button-ghost-active-border, var(--dsw-alias-border-l3));
}
.dsh-ps-style-item:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}
.dsh-ps-style-icon { flex: none; width: 18px; text-align: center; font-size: 14px; line-height: 20px; }
.dsh-ps-style-name { min-width: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }

/* ── form controls (declaration-for-declaration from the host primitives) ── */

.dsh-ps-input, .dsh-ps-textarea, .dsh-ps-select {
  box-sizing: border-box; width: 100%;
  border: .5px solid var(--dsw-alias-border-l4);
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  border-radius: var(--dsw-radius-sm);
  padding: 0 12px;
  font: inherit; font-size: 13px; line-height: 1.5;
}
.dsh-ps-input, .dsh-ps-select { height: 34px; }
.dsh-ps-textarea { padding: 8px 12px; min-height: 96px; resize: vertical; font-size: 12px; line-height: 1.6; }
.dsh-ps-input:focus, .dsh-ps-textarea:focus, .dsh-ps-select:focus {
  border-color: var(--dsw-alias-state-business-primary); outline: none;
}
.dsh-ps-input::placeholder, .dsh-ps-textarea::placeholder { color: var(--dsw-alias-label-dimmed); }
.dsh-ps-input:disabled, .dsh-ps-textarea:disabled, .dsh-ps-select:disabled { opacity: .6; cursor: default; }
.dsh-ps-select {
  appearance: none; cursor: pointer; padding-right: 32px;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--dsw-alias-label-tertiary) 50%),
    linear-gradient(135deg, var(--dsw-alias-label-tertiary) 50%, transparent 50%);
  background-position: calc(100% - 17px) calc(50% + 1px), calc(100% - 12px) calc(50% + 1px);
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}

.dsh-ps-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  flex: none; height: 28px; padding: 0 10px;
  border: 0; border-radius: var(--dsw-radius-sm);
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12px; line-height: 18px; white-space: nowrap; cursor: pointer;
}
.dsh-ps-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-ps-btn:disabled { opacity: .4; cursor: default; }
.dsh-ps-btn:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.dsh-ps-btn-danger { color: var(--dsw-alias-state-error-primary); }
.dsh-ps-btn-danger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover-danger, var(--dsw-alias-interactive-bg-hover));
  color: var(--dsw-alias-state-error-primary);
}
/* The settings form's own save recipe: primary label on the raised layer. Both
   theme directions stay legible, unlike a hard-coded white on a brand fill. */
.dsh-ps-btn-primary {
  height: 32px; padding: 0 14px; border-radius: var(--dsw-radius-md);
  font-size: 13px; border: 1px solid transparent;
  background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-layer-3);
}
.dsh-ps-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-label-primary); opacity: .88; color: var(--dsw-alias-bg-layer-3); }
.dsh-ps-btn-icon { width: 28px; padding: 0; }

.dsh-ps-switch {
  box-sizing: border-box; position: relative; flex: 0 0 auto;
  width: 36px; height: 20px; padding: 2px;
  border: 0; border-radius: 999px; corner-shape: round;
  background: var(--dsw-alias-border-l3); cursor: pointer;
}
.dsh-ps-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-ps-switch:disabled { cursor: default; opacity: .5; }
.dsh-ps-switch:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
.dsh-ps-thumb {
  display: block; width: 16px; height: 16px;
  border-radius: 50%; corner-shape: round;
  background: var(--dsw-alias-label-primary-foreground);
  transition: transform 120ms ease;
}
.dsh-ps-switch[aria-checked="false"] .dsh-ps-thumb { background: var(--dsw-alias-switch-thumb); }
.dsh-ps-switch[aria-checked="true"] .dsh-ps-thumb { transform: translateX(16px); }
@media (prefers-reduced-motion: reduce) { .dsh-ps-thumb { transition: none; } }

/* ── line icons ─────────────────────────────────────────────────────────────
   Transparent, hollow, single-colour strokes. currentColor makes them follow
   the surrounding text colour, so they are black in a light theme and light in a
   dark one — never invisible. The only coloured, filled mark is the rewriter's
   4-point star, which is explicitly exempt. */
.dsh-ps-icon { display: inline-block; vertical-align: middle; flex: none; }
.dsh-ps-line-icon { display: block; }

/* The seven-piece picker: one outlined cell per mark, active cell filled like a
   host ghost button. */
.dsh-ps-glyph-row { display: flex; flex-direction: column; gap: 6px; }
.dsh-ps-glyph-search { max-width: 240px; }
/* Collapsed the shelf is one row and takes no scroll box; expanded it scrolls
   inside its own box so 35 marks cannot push the editor past the fold. */
.dsh-ps-glyph-picker {
  display: flex; flex-direction: column; gap: 10px;
}
.dsh-ps-glyph-picker[data-expanded="true"] {
  max-height: 288px; overflow-y: auto; padding-right: 2px;
}
.dsh-ps-glyph-actions { display: flex; align-items: center; gap: 8px; }
.dsh-ps-glyph-group { display: flex; flex-direction: column; gap: 6px; }
.dsh-ps-glyph-groupname {
  margin: 0; font-size: 11px; line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-ps-glyph-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-ps-glyph-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; padding: 0;
  border: .5px solid var(--dsw-alias-border-l3); border-radius: var(--dsw-radius-sm);
  background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.dsh-ps-glyph-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-ps-glyph-btn[data-active="true"] {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-button-ghost-active-fill, var(--dsw-alias-interactive-bg-hover));
  box-shadow: inset 0 0 0 1px var(--dsw-alias-button-ghost-active-border, var(--dsw-alias-border-l3));
}
.dsh-ps-glyph-btn:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}

.dsh-ps-star-wrap {
  display: inline-flex; align-items: center; justify-content: center;
  line-height: 0;
  filter: drop-shadow(0 0 3px color-mix(in srgb, #8f7bff 55%, transparent));
  animation: dsh-ps-star-breathe 2.8s ease-in-out infinite;
}
/* Hollow: the mark is an outline, so the colour lives on the stroke. It does not
   turn; the motion is the gradient itself travelling along the outline. */
.dsh-ps-star { display: block; }
.dsh-ps-star-ink stop { animation: dsh-ps-star-hue 4.8s linear infinite; }
.dsh-ps-star-ink stop:nth-child(2) { animation-delay: -1.2s; }
.dsh-ps-star-ink stop:nth-child(3) { animation-delay: -2.4s; }
.dsh-ps-star-ink stop:nth-child(4) { animation-delay: -3.6s; }
@keyframes dsh-ps-star-hue {
  0% { stop-color: #6aa8ff; }
  25% { stop-color: #8f7bff; }
  50% { stop-color: #dc7dff; }
  75% { stop-color: #6ce0ff; }
  100% { stop-color: #6aa8ff; }
}
@keyframes dsh-ps-star-breathe {
  0%, 100% { transform: scale(1); opacity: .9; }
  50% { transform: scale(1.06); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-ps-star-wrap, .dsh-ps-star, .dsh-ps-star-ink stop { animation: none; }
  .dsh-ps-star-wrap { filter: none; }
}

.dsh-ps-badge {
  display: inline-flex; align-items: center; height: 24px; padding: 0 8px;
  border-radius: 999px; corner-shape: round;
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);
  font-size: 12px; line-height: 18px;
}

/* ── settings page ──────────────────────────────────────────────────────── */

.dsh-ps-page {
  display: flex; flex-direction: column; gap: 12px;
  width: 100%; max-width: 760px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px; line-height: 1.5;
}
.dsh-ps-title { margin: 0; font-size: 18px; font-weight: 600; line-height: 26px; }
.dsh-ps-intro { margin: 0; color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 1.5; }
.dsh-ps-toolbar { display: flex; align-items: center; gap: 8px; min-height: 32px; }
.dsh-ps-spacer { flex: 1 1 auto; }

.dsh-ps-group {
  display: flex; flex-direction: column; gap: 8px;
  padding: 12px 0; border-bottom: .5px solid var(--dsw-alias-border-l2);
}
.dsh-ps-group:last-child { border-bottom: none; padding-bottom: 4px; }
.dsh-ps-grouphead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dsh-ps-grouphead h3 { margin: 0; font-size: 14px; font-weight: 500; line-height: 22px; color: var(--dsw-alias-label-primary); }
.dsh-ps-hint { margin: 0; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 1.5; }
.dsh-ps-note { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
.dsh-ps-note[data-kind="error"] { color: var(--dsw-alias-state-error-primary); }
.dsh-ps-note[data-kind="ok"] { color: var(--dsw-alias-state-success-primary); }

.dsh-ps-row { display: flex; align-items: center; gap: 12px; padding: 4px 0; }
.dsh-ps-rowtext { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dsh-ps-rowtitle { font-size: 13px; font-weight: 500; line-height: 20px; color: var(--dsw-alias-label-primary); }
.dsh-ps-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dsh-ps-rowcontrol { flex: none; display: inline-flex; align-items: center; gap: 8px; }
.dsh-ps-rowcontrol .dsh-ps-select, .dsh-ps-rowcontrol .dsh-ps-selectbox { width: 176px; }
/* The picker's rows carry a bare title (no rowtext column), so the title takes the
   free space itself and sits on the switch's centre line. */
.dsh-ps-row > .dsh-ps-rowtitle { flex: 1 1 auto; min-width: 0; }
/* Panel-only rhythm: one gap between the two toggles, one before the action row.
   Scoped to .dsh-ps-pop because the settings page reuses .dsh-ps-toolbar. */
.dsh-ps-pop-rows { display: flex; flex-direction: column; gap: 2px; margin-top: 12px; }
.dsh-ps-pop .dsh-ps-toolbar { margin-top: 12px; }
.dsh-ps-num { width: 96px; }

.dsh-ps-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.dsh-ps-fieldlabel { font-size: 13px; font-weight: 500; color: var(--dsw-alias-label-secondary); }
.dsh-ps-fieldrow { display: flex; align-items: center; gap: 8px; }
.dsh-ps-fieldrow .dsh-ps-input { flex: 0 1 200px; }

.dsh-ps-list { display: flex; flex-direction: column; }
.dsh-ps-item { border-bottom: .5px solid var(--dsw-alias-border-l2); }
.dsh-ps-item:last-child { border-bottom: none; }
.dsh-ps-itemhead { display: flex; align-items: center; gap: 10px; padding: 10px 0; }
.dsh-ps-itemicon {
  flex: none; width: 26px; height: 26px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-layer-3);
  font-size: 14px; line-height: 1;
}
.dsh-ps-itemtext {
  flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px;
  border: 0; background: transparent; padding: 0; text-align: left;
  font: inherit; color: inherit; cursor: pointer;
}
.dsh-ps-itemtext:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px; border-radius: var(--dsw-radius-xs);
}
.dsh-ps-itemname {
  font-size: 13px; font-weight: 500; line-height: 20px; color: var(--dsw-alias-label-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-ps-itemdesc {
  font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-ps-item[data-disabled="true"] .dsh-ps-itemname { color: var(--dsw-alias-label-tertiary); }
.dsh-ps-item[data-disabled="true"] .dsh-ps-itemicon { opacity: .55; }
.dsh-ps-chevron {
  flex: none; width: 24px; height: 24px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; border-radius: var(--dsw-radius-xs); background: transparent;
  color: var(--dsw-alias-label-tertiary); font-size: 10px; line-height: 1; cursor: pointer;
}
.dsh-ps-chevron:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-ps-chevron:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.dsh-ps-itembody { display: flex; flex-direction: column; gap: 12px; padding: 2px 0 16px 36px; }
.dsh-ps-itembody .dsh-ps-fieldrow .dsh-ps-input { flex: 1 1 auto; }
.dsh-ps-icon-input { flex: 0 0 56px !important; text-align: center; }
.dsh-ps-btnrow { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
`;

    /* ── shared controls (host-matching) ──────────────────────────────────── */

    /** Persistent, namespaced head sheet; component remounts must not own its lifetime. */
    function installStylesheet() {
      const doc = globalThis.document;
      if (doc === null || doc === undefined || doc.head === null || typeof doc.createElement !== 'function') return;
      if (typeof doc.getElementById === 'function' && doc.getElementById(STYLE_ID) !== null) return;
      const tag = doc.createElement('style');
      tag.id = STYLE_ID;
      tag.textContent = CSS;
      doc.head.append(tag);
    }

    /** The host's switch: `aria-checked` drives the visual so the two cannot disagree. */
    function Switch({ checked, onChange, label, disabled }) {
      return h('button', {
        type: 'button',
        className: 'dsh-ps-switch',
        role: 'switch',
        'aria-checked': checked ? 'true' : 'false',
        'aria-label': label,
        disabled: disabled === true,
        onClick: () => onChange(!checked),
      }, h('span', { className: 'dsh-ps-thumb' }));
    }

    /* ── line icons ───────────────────────────────────────────────────────── */

    /**
     * The seven style marks, traced 1:1 from the accepted reference
     * `黑边线条图标七件套.html`: a 56-unit cell, no fill, one 2-unit round-capped
     * stroke. Geometry is copied verbatim — only the stroke colour is rebound to
     * `currentColor`, so the marks stay visible in a dark theme.
     *
     * This is the single source of truth: `scripts/emit-icons.mjs` regenerates
     * `icons/*.svg` from it, and the test suite fails if the two ever drift.
     */
    const BASE_GLYPHS = {
      sparkle: {
        label: '星芒',
        nodes: [
          ['path', { d: 'M28 6 C30.2 16 33.8 19.6 44 22 C33.8 24.4 30.2 28 28 38 C25.8 28 22.2 24.4 12 22 C22.2 19.6 25.8 16 28 6 Z' }],
          ['path', { d: 'M45 30 C46 35 47.6 36.6 52 37.5 C47.6 38.4 46 40 45 45 C44 40 42.4 38.4 38 37.5 C42.4 36.6 44 35 45 30 Z' }],
          ['path', { d: 'M13 36 C13.6 38.6 14.8 39.8 17.5 40.5 C14.8 41.2 13.6 42.4 13 45 C12.4 42.4 11.2 41.2 8.5 40.5 C11.2 39.8 12.4 38.6 13 36 Z' }],
        ],
      },
      brick: {
        label: '砖墙',
        nodes: [
          ['rect', { x: 6, y: 15, width: 44, height: 27, rx: 1.5 }],
          ['path', { d: 'M6 24 H50 M6 33 H50 M28 15 V24 M17 24 V33 M39 24 V33 M28 33 V42' }],
        ],
      },
      book: {
        label: '打开的书',
        nodes: [
          ['path', { d: 'M28 17 C23 12.5 15 10.5 7 11.5 L7 40 C15 39 23 41 28 45.5 C33 41 41 39 49 40 L49 11.5 C41 10.5 33 12.5 28 17 Z' }],
          ['path', { d: 'M28 17 V45.5' }],
        ],
      },
      cap: {
        label: '学士帽',
        nodes: [
          ['path', { d: 'M28 12 L50 23 L28 34 L6 23 Z' }],
          ['path', { d: 'M13 27.5 V37 C13 41.5 19.5 44 28 44 C36.5 44 43 41.5 43 37 V27.5' }],
          ['path', { d: 'M50 23 V32.5' }],
          ['circle', { cx: 50, cy: 36, r: 3 }],
        ],
      },
      palette: {
        label: '调色盘',
        nodes: [
          ['path', { d: 'M28 8 C14 8 5 17 5 28 C5 39 14 48 27 48 C32 48 35 45 35 41 C35 38 33 36 33 33 C33 30 35.5 29 39 29 H44 C48 29 51 26 51 21 C51 13 41 8 28 8 Z' }],
          ['circle', { cx: 18, cy: 33, r: 4.5 }],
          ['circle', { cx: 17, cy: 17, r: 2.5 }],
          ['circle', { cx: 28, cy: 14, r: 2.5 }],
          ['circle', { cx: 38, cy: 18.5, r: 2.5 }],
          ['circle', { cx: 44.5, cy: 24.5, r: 2 }],
        ],
      },
      check: {
        label: '勾选',
        nodes: [
          ['rect', { x: 6, y: 6, width: 44, height: 44, rx: 11 }],
          ['path', { d: 'M17 28.5 L25 36.5 L40 20' }],
        ],
      },
      hammer: {
        label: '锤子',
        nodes: [
          ['g', { transform: 'rotate(35 28 28)' }, [
            ['path', { d: 'M13 9 H43 C45.2 9 46.5 10.3 46.5 12.5 V19.5 C46.5 21.7 45.2 23 43 23 H13 C10.8 23 9.5 21.7 9.5 19.5 V12.5 C9.5 10.3 10.8 9 13 9 Z' }],
            ['path', { d: 'M24.5 23 H31.5 V45 A3.5 3.5 0 0 1 24.5 45 Z' }],
          ]],
        ],
      },
    };

    /**
     * The twenty-eight marks of the sheet `提示词风格图标_28枚.html`, in its own four
     * groups and order. Geometry is copied verbatim from the source file.
     */
    const SOURCE_GLYPHS = {
      'structure': {
        label: '结构化',
        group: '表达结构',
        // Geometry is the base set's brick; see the sharing loop below.
      },
      'template': {
        label: '模板化',
        group: '表达结构',
        nodes: [
          ['rect', { x: 6, y: 8, width: 44, height: 40, rx: 4, strokeDasharray: '5 4' }],
          ['rect', { x: 14, y: 17, width: 28, height: 8, rx: 2 }],
          ['rect', { x: 14, y: 31, width: 17, height: 8, rx: 2 }],
        ],
      },
      'checklist': {
        label: '清单式',
        group: '表达结构',
        nodes: [
          ['path', { d: 'M6 9 L10 13 L17 5 M6 28 L10 32 L17 24 M6 47 L10 51 L17 43' }],
          ['path', { d: 'M24 9 H50 M24 28 H50 M24 47 H50' }],
        ],
      },
      'steps': {
        label: '分步式',
        group: '表达结构',
        nodes: [
          ['path', { d: 'M8 50 V37 H22 V24 H36 V11 H50' }],
        ],
      },
      'dialogue': {
        label: '对话式',
        group: '表达结构',
        nodes: [
          ['path', { d: 'M50 34 A4 4 0 0 1 46 38 H18 L6 45 V12 A4 4 0 0 1 10 8 H46 A4 4 0 0 1 50 12 Z' }],
          ['circle', { cx: 19, cy: 23, r: 2 }],
          ['circle', { cx: 28, cy: 23, r: 2 }],
          ['circle', { cx: 37, cy: 23, r: 2 }],
        ],
      },
      'roleplay': {
        label: '角色扮演',
        group: '表达结构',
        nodes: [
          ['path', { d: 'M10 14 C10 14 10 30 17 38 C21 42.5 26 41 28 37.5 C30 41 35 42.5 39 38 C46 30 46 14 46 14 Z' }],
          ['ellipse', { cx: 20, cy: 23, rx: 5, ry: 3.5 }],
          ['ellipse', { cx: 36, cy: 23, rx: 5, ry: 3.5 }],
        ],
      },
      'narrative': {
        label: '叙事式',
        group: '表达结构',
        // Geometry is the base set's book; see the sharing loop below.
      },
      'academic': {
        label: '学术严谨',
        group: '语气风格',
        // Geometry is the base set's cap; see the sharing loop below.
      },
      'artistic': {
        label: '创意艺术',
        group: '语气风格',
        // Geometry is the base set's palette; see the sharing loop below.
      },
      'concise': {
        label: '简洁精炼',
        group: '语气风格',
        nodes: [
          ['path', { d: 'M6 8 H50 L33 27 V46 H23 V27 Z' }],
        ],
      },
      'vivid': {
        label: '生动描述',
        group: '语气风格',
        nodes: [
          ['path', { d: 'M48 6 C34 8 22 16 14 30 L10 44 L20 40 C34 34 44 22 48 6 Z' }],
          ['path', { d: 'M10 44 L36 14' }],
        ],
      },
      'formal': {
        label: '正式公文',
        group: '语气风格',
        nodes: [
          ['path', { d: 'M22 8 H34 V16 C34 20 38 22 38 26 V30 H18 V26 C18 22 22 20 22 16 Z' }],
          ['rect', { x: 12, y: 34, width: 32, height: 8, rx: 2 }],
          ['path', { d: 'M8 47 H48' }],
        ],
      },
      'casual': {
        label: '口语亲和',
        group: '语气风格',
        nodes: [
          ['circle', { cx: 28, cy: 28, r: 22 }],
          ['circle', { cx: 20, cy: 22, r: 2.5 }],
          ['circle', { cx: 36, cy: 22, r: 2.5 }],
          ['path', { d: 'M17 33 C20 39 36 39 39 33' }],
        ],
      },
      'persuasive': {
        label: '说服营销',
        group: '语气风格',
        nodes: [
          ['path', { d: 'M8 24 H18 L38 10 V46 L18 32 H8 Z' }],
          ['path', { d: 'M18 32 V44 A5 5 0 0 0 28 44 V35' }],
          ['path', { d: 'M43 20 C46 24 46 32 43 36' }],
          ['path', { d: 'M49 14 C54 21 54 35 49 42' }],
        ],
      },
      'chain-of-thought': {
        label: '思维链',
        group: '推理技巧',
        nodes: [
          ['ellipse', { cx: 18, cy: 28, rx: 12, ry: 7 }],
          ['ellipse', { cx: 38, cy: 28, rx: 12, ry: 7 }],
        ],
      },
      'few-shot': {
        label: '少样本',
        group: '推理技巧',
        nodes: [
          ['rect', { x: 4, y: 16, width: 16, height: 24, rx: 2, transform: 'rotate(-8 12 28)' }],
          ['rect', { x: 20, y: 14, width: 16, height: 26, rx: 2 }],
          ['rect', { x: 36, y: 16, width: 16, height: 24, rx: 2, transform: 'rotate(8 44 28)' }],
        ],
      },
      'self-check': {
        label: '反思自检',
        group: '推理技巧',
        nodes: [
          ['path', { d: 'M16 46 V24 A12 12 0 0 1 40 24 V38' }],
          ['path', { d: 'M33 31 L40 38 L47 31' }],
        ],
      },
      'analogy': {
        label: '类比迁移',
        group: '推理技巧',
        nodes: [
          ['circle', { cx: 28, cy: 9, r: 2.5 }],
          ['path', { d: 'M28 11.5 V46 M16 46 H40 M10 23 H46' }],
          ['path', { d: 'M10 23 V31 M46 23 V31' }],
          ['path', { d: 'M4 31 A6 6 0 0 1 16 31' }],
          ['path', { d: 'M40 31 A6 6 0 0 1 52 31' }],
        ],
      },
      'meta-prompt': {
        label: '元提示',
        group: '推理技巧',
        nodes: [
          ['rect', { x: 4, y: 4, width: 48, height: 48, rx: 6 }],
          ['rect', { x: 13, y: 13, width: 30, height: 30, rx: 4 }],
          ['rect', { x: 22, y: 22, width: 12, height: 12, rx: 3 }],
        ],
      },
      'prompt-chain': {
        label: '提示链',
        group: '推理技巧',
        nodes: [
          ['rect', { x: 3, y: 19, width: 20, height: 18, rx: 3 }],
          ['rect', { x: 33, y: 19, width: 20, height: 18, rx: 3 }],
          ['path', { d: 'M25 28 H33 M28 23 L33 28 L28 33' }],
        ],
      },
      'brainstorm': {
        label: '头脑风暴',
        group: '推理技巧',
        nodes: [
          ['circle', { cx: 28, cy: 28, r: 5 }],
          ['circle', { cx: 28, cy: 8, r: 3 }],
          ['circle', { cx: 28, cy: 48, r: 3 }],
          ['circle', { cx: 8, cy: 28, r: 3 }],
          ['circle', { cx: 48, cy: 28, r: 3 }],
          ['path', { d: 'M28 13 V23 M28 33 V45 M13 28 H23 M33 28 H43' }],
        ],
      },
      'format': {
        label: '格式约束',
        group: '输出控制',
        nodes: [
          ['path', { d: 'M20 8 C14 8 14 14 14 20 C14 26 8 28 8 28 C8 28 14 30 14 36 C14 42 14 48 20 48' }],
          ['path', { d: 'M36 8 C42 8 42 14 42 20 C42 26 48 28 48 28 C48 28 42 30 42 36 C42 42 42 48 36 48' }],
          ['rect', { x: 25, y: 25, width: 6, height: 6, rx: 1.5 }],
        ],
      },
      'length': {
        label: '长度控制',
        group: '输出控制',
        nodes: [
          ['rect', { x: 4, y: 20, width: 48, height: 16, rx: 3 }],
          ['path', { d: 'M13 20 V28 M22 20 V25 M31 20 V28 M40 20 V25 M49 20 V28' }],
        ],
      },
      'citation': {
        label: '引用溯源',
        group: '输出控制',
        nodes: [
          ['path', { d: 'M6 26 C6 18 11 13 18 12 V18 C14 19 12 21 12 24 H18 V34 H6 Z' }],
          ['path', { d: 'M30 26 C30 18 35 13 42 12 V18 C38 19 36 21 36 24 H42 V34 H30 Z' }],
        ],
      },
      'code': {
        label: '代码输出',
        group: '输出控制',
        nodes: [
          ['path', { d: 'M19 17 L6 28 L19 39 M37 17 L50 28 L37 39 M32 12 L24 44' }],
        ],
      },
      'table': {
        label: '表格数据',
        group: '输出控制',
        nodes: [
          ['rect', { x: 6, y: 10, width: 44, height: 36, rx: 4 }],
          ['path', { d: 'M6 22 H50 M6 34 H50 M21 10 V46 M36 10 V46' }],
        ],
      },
      'image': {
        label: '图像生成',
        group: '输出控制',
        nodes: [
          ['rect', { x: 6, y: 10, width: 44, height: 36, rx: 5 }],
          ['circle', { cx: 19, cy: 22, r: 4 }],
          ['path', { d: 'M6 40 L20 28 L29 36 L37 29 L50 40' }],
        ],
      },
      'multilingual': {
        label: '多语言',
        group: '输出控制',
        nodes: [
          ['circle', { cx: 28, cy: 28, r: 22 }],
          ['path', { d: 'M6 28 H50 M28 6 C36 15 36 41 28 50 C20 41 20 15 28 6 Z' }],
          ['path', { d: 'M10 15 C18 21 38 21 46 15 M10 41 C18 35 38 35 46 41' }],
        ],
      },
    };

    /**
     * Every mark the library can draw: the base set first, then the sheet's four
     * groups. A glyph without its own `group` belongs to the base set.
     */
    const STYLE_GLYPHS = { ...BASE_GLYPHS, ...SOURCE_GLYPHS };

    // The sheet redraws four marks the base set already carries, so the geometry is
    // shared rather than stored twice. Editing the base mark changes both, which is
    // correct: the source file draws them identically.
    for (const [key, from] of [['structure', 'brick'], ['narrative', 'book'], ['academic', 'cap'], ['artistic', 'palette']]) {
      SOURCE_GLYPHS[key].nodes = BASE_GLYPHS[from].nodes;
    }
    /**
     * A style's stored `icon` may be one of the seven names above, the emoji the
     * built-in styles shipped with before, or a user's own emoji. Only the first
     * two resolve to a line glyph; anything else keeps rendering as text.
     */
    const STYLE_GLYPH_ALIASES = {
      '✨': 'sparkle',
      '🧱': 'brick',
      '🗺️': 'book',
      '🎓': 'cap',
      '🎨': 'palette',
      '✅': 'check',
      '🔨': 'hammer',
    };

    const stripVariation = (value) => String(value).replace(/[\uFE0E\uFE0F]/g, '');

    /**
     * An older Host kept only the first two code points of an icon, so these seven
     * fragments are the ones that can actually be sitting in a stored document.
     * Listed explicitly rather than matched by prefix: with 35 marks on the shelf a
     * prefix is no longer unambiguous (`ca` is both cap and casual).
     */
    const LEGACY_ICON_KEYS = {
      sp: 'sparkle',
      br: 'brick',
      bo: 'book',
      ca: 'cap',
      pa: 'palette',
      ch: 'check',
      ha: 'hammer',
    };

    /** The picker's groups, in table order: the base set first, then the sheet's four. */
    const GLYPH_GROUPS = [];
    for (const [key, glyph] of Object.entries(STYLE_GLYPHS)) {
      const name = typeof glyph.group === 'string' && glyph.group !== '' ? glyph.group : '基础';
      const bucket = GLYPH_GROUPS.find((entry) => entry.name === name);
      if (bucket === undefined) GLYPH_GROUPS.push({ name, keys: [key] });
      else bucket.keys.push(key);
    }

    /** Whether one glyph matches a picker query, by key, label or group. */
    function glyphMatches(key, query) {
      if (query === '') return true;
      const glyph = STYLE_GLYPHS[key];
      return key.includes(query)
        || String(glyph.label).toLowerCase().includes(query)
        || String(glyph.group || '基础').toLowerCase().includes(query);
    }

    /** Resolve a stored icon value to a glyph name, or null when it is plain text. */
    function styleGlyphName(value) {
      if (typeof value !== 'string' || value === '') return null;
      if (Object.prototype.hasOwnProperty.call(STYLE_GLYPHS, value)) return value;
      const bare = stripVariation(value);
      if (Object.prototype.hasOwnProperty.call(STYLE_GLYPHS, bare)) return bare;
      for (const [emoji, name] of Object.entries(STYLE_GLYPH_ALIASES)) {
        if (stripVariation(emoji) === bare) return name;
      }
      // A Host build that bounded every icon to two code points stored a key as its
      // fragment; those seven are known, so recover the key rather than render text.
      if (Object.prototype.hasOwnProperty.call(LEGACY_ICON_KEYS, bare)) return LEGACY_ICON_KEYS[bare];
      return null;
    }

    /** Render one spec node; the spec is `[tag, props]` or `[tag, props, children]`. */
    function glyphNode(spec) {
      const [tag, props, children] = spec;
      if (children === undefined) return h(tag, props);
      return h(tag, props, ...children.map(glyphNode));
    }

    /**
     * One style mark. Transparent, hollow, `currentColor` strokes at the reference's
     * own 2/56 weight ratio — the same cell every mark on the shelf shares.
     */
    function LineGlyph({ name, size = 18, className }) {
      const glyph = STYLE_GLYPHS[name];
      if (glyph === undefined) return null;
      return h('svg', {
        className: className ? `dsh-ps-line-icon ${className}` : 'dsh-ps-line-icon',
        viewBox: '0 0 56 56',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      }, glyph.nodes.map(glyphNode));
    }

    /**
     * A style icon: a line glyph when the value names one (or is empty, which
     * falls back to the sparkle), otherwise the user's own text.
     */
    function StyleIcon({ value, size = 18, className = 'dsh-ps-style-icon' }) {
      const name = styleGlyphName(value) || (value ? null : 'sparkle');
      return h('span', { className, 'aria-hidden': true },
        name === null ? String(value) : h(LineGlyph, { name, size }));
    }

    /** How many marks the collapsed row shows: exactly one line of them. */
    const GLYPH_COLLAPSED_COUNT = 7;
    /** Marks shown while collapsed before anything is selected. */
    const GLYPH_BASE_KEYS = GLYPH_GROUPS[0].keys;

    /**
     * The icon library, collapsed to one row until asked for more.
     *
     * A collapsed row keeps the editor compact; the current mark is always in it, so
     * the choice is never hidden by the very control that offers it. Expanding adds
     * the search box and the sheet's own groups.
     *
     * `query` and `expanded` live here rather than in the settings page so the page's
     * hook order never depends on the shelf.
     */
    function GlyphPicker({ value, label, onPick, t }) {
      const [query, setQuery] = useState('');
      const [expanded, setExpanded] = useState(false);
      const active = styleGlyphName(value);
      const needle = query.trim().toLowerCase();
      const groups = GLYPH_GROUPS
        .map((group) => ({ name: group.name, keys: group.keys.filter((key) => glyphMatches(key, needle)) }))
        .filter((group) => group.keys.length > 0);
      const found = groups.reduce((total, group) => total + group.keys.length, 0);
      const total = Object.keys(STYLE_GLYPHS).length;

      // Current mark first when it comes from outside the base set, so it survives
      // the cap; otherwise the base row in its own order.
      const collapsedKeys = (active !== null && !GLYPH_BASE_KEYS.includes(active)
        ? [active, ...GLYPH_BASE_KEYS]
        : GLYPH_BASE_KEYS).slice(0, GLYPH_COLLAPSED_COUNT);

      const markButton = (key) => h('button', {
        key,
        type: 'button',
        role: 'radio',
        className: 'dsh-ps-glyph-btn',
        'aria-checked': active === key ? 'true' : 'false',
        'data-active': active === key ? 'true' : 'false',
        title: `${STYLE_GLYPHS[key].label}（${key}）`,
        'aria-label': STYLE_GLYPHS[key].label,
        onClick: () => onPick(key),
      }, h(LineGlyph, { name: key, size: 22 }));

      return h('div', { className: 'dsh-ps-glyph-row' },
        expanded
          ? h('input', {
            className: 'dsh-ps-input dsh-ps-glyph-search',
            type: 'search',
            value: query,
            placeholder: t('settings.style.iconSearch'),
            'aria-label': t('settings.style.iconSearch'),
            onChange: (event) => setQuery(event.target.value),
          })
          : null,
        h('div', {
          className: 'dsh-ps-glyph-picker',
          role: 'radiogroup',
          'aria-label': label,
          'data-expanded': expanded ? 'true' : 'false',
        },
          expanded
            ? (found === 0
              ? h('p', { className: 'dsh-ps-hint' }, t('settings.style.iconNoMatch'))
              : groups.map((group) => h('div', { key: group.name, className: 'dsh-ps-glyph-group' },
                h('p', { className: 'dsh-ps-glyph-groupname' }, `${group.name} · ${group.keys.length}`),
                h('div', { className: 'dsh-ps-glyph-grid' }, group.keys.map(markButton)))))
            : h('div', { className: 'dsh-ps-glyph-grid' }, collapsedKeys.map(markButton))),
        h('div', { className: 'dsh-ps-glyph-actions' },
          h('button', {
            type: 'button',
            className: 'dsh-ps-btn',
            'aria-expanded': expanded ? 'true' : 'false',
            onClick: () => setExpanded((current) => !current),
          },
            h(Glyph, { name: expanded ? 'chevronUp' : 'chevronDown', size: 12 }),
            expanded ? t('settings.style.iconCollapse') : t('settings.style.iconExpand', { count: total }))),
        h('p', { className: 'dsh-ps-rowdesc' }, t('settings.style.iconHint')));
    }

    /**
     * Close a popup when the pointer lands outside it, or on Escape.
     *
     * Both the style select and the composer panel need exactly this, capture phase
     * and cleanup included, so it is written once here. `setOpen` is a state setter
     * and therefore stable, which keeps the subscription tied to `open` alone.
     */
    function useDismiss(rootRef, open, setOpen) {
      useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
          if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
        };
        const onKeyDown = (event) => { if (event.key === 'Escape') setOpen(false); };
        window.document.addEventListener('mousedown', onPointerDown, true);
        window.document.addEventListener('keydown', onKeyDown, true);
        return () => {
          window.document.removeEventListener('mousedown', onPointerDown, true);
          window.document.removeEventListener('keydown', onKeyDown, true);
        };
      }, [rootRef, open, setOpen]);
    }

    /**
     * The settings page's style picker.
     *
     * A native `<select>` cannot hold an SVG inside its options, so the seven-piece
     * marks would fall back to whatever emoji the field stores — the one place the
     * line set could not reach. This is a listbox instead: the trigger and every
     * option draw the real glyph.
     */
    function StyleSelect({ value, options, onChange, label }) {
      const [open, setOpen] = useState(false);
      const rootRef = useRef(null);
      const current = options.find((style) => style.id === value) || options[0] || null;

      useDismiss(rootRef, open, setOpen);

      return h('div', { className: 'dsh-ps-selectbox', ref: rootRef },
        h('button', {
          type: 'button',
          className: 'dsh-ps-select-trigger',
          'aria-haspopup': 'listbox',
          'aria-expanded': open ? 'true' : 'false',
          'aria-label': label,
          onClick: () => setOpen((current_) => !current_),
        },
          current === null ? null : h(StyleIcon, { value: current.icon, size: 17, className: 'dsh-ps-select-glyph' }),
          h('span', { className: 'dsh-ps-select-name' }, current === null ? '' : current.name),
          h('span', { className: 'dsh-ps-caret' }, h(Glyph, { name: 'chevronDown', size: 10 }))),
        open
          ? h('div', { className: 'dsh-ps-select-menu', role: 'listbox', 'aria-label': label },
            options.map((style) => h('button', {
              key: style.id,
              type: 'button',
              role: 'option',
              'aria-selected': style.id === value ? 'true' : 'false',
              className: 'dsh-ps-select-option',
              'data-active': style.id === value ? 'true' : 'false',
              onClick: () => { onChange(style.id); setOpen(false); },
            },
              h(StyleIcon, { value: style.icon, size: 17, className: 'dsh-ps-select-glyph' }),
              h('span', { className: 'dsh-ps-select-name' }, style.name))))
          : null);
    }

    /**
     * Every control glyph is a 16-unit outline drawn with `currentColor`: transparent
     * background, no fill, one stroke weight. They inherit the surrounding text
     * colour, so a light theme renders black lines and a dark theme light ones.
     */
    const GLYPHS = {
      /** Undo: an arrow curving back to the left. */
      undo: 'M6.5 3.5 3 7l3.5 3.5M3 7h6.4a3.6 3.6 0 0 1 0 7.2H6.6',
      chevronDown: 'M4 6.4 8 10.4l4-4',
      chevronUp: 'M4 9.6 8 5.6l4 4',
      chevronRight: 'M6.4 4 10.4 8l-4 4',
      /** Refresh: a nearly closed circle with an arrow head. */
      refresh: 'M13 8a5 5 0 1 1-1.6-3.7M13.2 2.9v3.2H10',
      arrowUp: 'M8 13.2V3.2M4.2 7 8 3.2 11.8 7',
      arrowDown: 'M8 2.8v10M4.2 9 8 12.8 11.8 9',
      plus: 'M8 3.2v9.6M3.2 8h9.6',
      /** Busy: an open ring, spun by CSS. */
      spinner: 'M8 2.6a5.4 5.4 0 1 1-5.1 3.6',
    };

    function Glyph({ name, size = 14, className, strokeWidth = 1.5 }) {
      return h('svg', {
        className: className ? `dsh-ps-icon ${className}` : 'dsh-ps-icon',
        viewBox: '0 0 16 16',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      }, h('path', { d: GLYPHS[name] }));
    }

    /**
     * The rewriter's mark: a four-point star, hollow, the one coloured icon here.
     *
     * The outline carries a gradient whose four stops cycle on staggered delays, so
     * the colour travels around the star. It deliberately does not rotate — the
     * wrapper only breathes. Both stop under `prefers-reduced-motion`.
     */
    function StarIcon({ size = 16 }) {
      return h('span', { className: 'dsh-ps-star-wrap' },
        h('svg', {
          className: 'dsh-ps-star',
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          'aria-hidden': 'true',
          focusable: 'false',
        },
          h('defs', null,
            h('linearGradient', { id: 'dsh-ps-star-ink', className: 'dsh-ps-star-ink', x1: '0', y1: '0', x2: '1', y2: '1' },
              h('stop', { offset: '0%', stopColor: '#6aa8ff' }),
              h('stop', { offset: '33%', stopColor: '#8f7bff' }),
              h('stop', { offset: '66%', stopColor: '#dc7dff' }),
              h('stop', { offset: '100%', stopColor: '#6ce0ff' }))),
          h('path', {
            d: 'M12 1.8c0.72 5.5 3.3 8.08 8.8 8.8-5.5 0.72-8.08 3.3-8.8 8.8-0.72-5.5-3.3-8.08-8.8-8.8 5.5-0.72 8.08-3.3 8.8-8.8Z',
            // Hollow: no fill, the animated gradient is the stroke only. The weight
            // is scaled for this 24-unit cell so the outline reads as thick as the
            // 16-unit control glyphs sitting next to it.
            fill: 'none',
            stroke: 'url(#dsh-ps-star-ink)',
            strokeWidth: 1.9,
            strokeLinejoin: 'round',
          })));
    }

    /** Label on the left, one compact control on the right. */
    function Row({ title, desc, children }) {
      return h('div', { className: 'dsh-ps-row' },
        h('div', { className: 'dsh-ps-rowtext' },
          h('span', { className: 'dsh-ps-rowtitle' }, title),
          desc ? h('span', { className: 'dsh-ps-rowdesc' }, desc) : null),
        h('div', { className: 'dsh-ps-rowcontrol' }, children));
    }

    /**
     * Label above a wide control (text inputs, textareas).
     *
     * A `div`, not a `label`: one field here holds two inputs (provider + model),
     * and a label may only be associated with a single control. Every control it
     * wraps therefore carries its own `aria-label`.
     */
    function Field({ label, hint, children }) {
      return h('div', { className: 'dsh-ps-field' },
        h('span', { className: 'dsh-ps-fieldlabel' }, label),
        children,
        hint ? h('span', { className: 'dsh-ps-rowdesc' }, hint) : null);
    }

    /* ── composer cell ────────────────────────────────────────────────────── */

    function ComposerTools(props) {
      const { useInput, inputActions, store, t } = props;
      const config = useStoreValue(store);

      const draft = typeof useInput === 'function' ? useInput((state) => state.draft) : '';
      const [open, setOpen] = useState(false);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      const [extra, setExtra] = useState('');
      const [undo, setUndo] = useState(null);
      const [activeId, setActiveId] = useState(() => {
        try {
          return window.localStorage.getItem(ACTIVE_STYLE_KEY) || '';
        } catch {
          return '';
        }
      });
      const rootRef = useRef(null);

      const styles = config && Array.isArray(config.styles) ? config.styles : [];
      const enabled = styles.filter((style) => style.enabled);
      const settings = config && config.settings ? config.settings : null;
      const styleKey = enabled.map((style) => style.id).join('|');

      // Keep the selection valid as the library changes.
      useEffect(() => {
        if (enabled.length === 0) return;
        if (enabled.some((style) => style.id === activeId)) return;
        const preferred = (settings && settings.defaultStyleId) || enabled[0].id;
        const next = enabled.some((style) => style.id === preferred) ? preferred : enabled[0].id;
        setActiveId(next);
        try {
          window.localStorage.setItem(ACTIVE_STYLE_KEY, next);
        } catch {
          /* private mode */
        }
      }, [styleKey, activeId, settings && settings.defaultStyleId]);

      useDismiss(rootRef, open, setOpen);

      const selectStyle = useCallback((id) => {
        setActiveId(id);
        try {
          window.localStorage.setItem(ACTIVE_STYLE_KEY, id);
        } catch {
          /* private mode */
        }
      }, []);

      const active = enabled.find((style) => style.id === activeId) || enabled[0] || FALLBACK_STYLE;

      const applyOptimized = useCallback(
        (text) => {
          if ((settings === null || settings.keepUndo !== false) && typeof draft === 'string' && draft !== '') setUndo(draft);
          if (typeof inputActions.setDraft === 'function') inputActions.setDraft(text);
        },
        [draft, inputActions, settings],
      );

      const run = useCallback(
        async (styleId) => {
          const text = typeof draft === 'string' ? draft : '';
          if (text.trim() === '') {
            setError(t('composer.empty'));
            return;
          }
          setBusy(true);
          setError('');
          try {
            const result = await requestOptimize({ text, styleId: styleId || active.id, extra, sessionId: props.sessionId });
            applyOptimized(result.text);
            setOpen(false);
          } catch (failure) {
            setError(failure && failure.message ? failure.message : String(failure));
          } finally {
            setBusy(false);
          }
        },
        [draft, extra, active.id, applyOptimized, props.sessionId, t],
      );

      /**
       * Write settings fields through the one path the composer owns.
       *
       * Optimistic, then reconciled with what the Host stored; a failed write puts
       * the previous document back so the switch can never drift from the file.
       */
      const patchSettings = useCallback(async (changes) => {
        if (!config || !settings) return;
        const next = { ...config, settings: { ...settings, ...changes } };
        store.set(next);
        try {
          store.set(await putDocument(next));
          setError('');
        } catch (failure) {
          store.set(config);
          setError(failure && failure.message ? failure.message : String(failure));
        }
      }, [config, settings, store]);

      const toggleAuto = useCallback(() => {
        void patchSettings({ autoOptimize: !settings.autoOptimize });
      }, [patchSettings, settings]);

      // Absent means on, matching DEFAULT_SETTINGS on the Host.
      const contextOn = settings ? settings.injectContext !== false : true;
      const toggleContext = useCallback(() => {
        void patchSettings({ injectContext: !contextOn });
      }, [patchSettings, contextOn]);

      if (config === null) return h('span', { className: 'dsh-ps-scope' });
      if (settings && settings.showComposerEntry === false) return null;

      /**
       * Undo steps back to what the box held before this rewrite, so it stops being
       * meaningful the moment the box is empty — which is exactly what sending leaves
       * behind (the Host clears the draft on submit).
       *
       * Clearing the state, not merely hiding the chip, is the point: a hidden-only
       * undo would come back the next time you type and offer to restore a draft from
       * a message you already sent.
       */
      useEffect(() => {
        if (undo === null) return;
        if (typeof draft === 'string' && draft !== '') return;
        setUndo(null);
      }, [draft, undo]);

      const canRun = busy === false && enabled.length > 0;
      const showsUndo = undo !== null
        && (settings === null || settings.keepUndo !== false)
        && typeof draft === 'string' && draft !== '';

      return h('span', { className: 'dsh-ps-scope', ref: rootRef },
        h('button', {
          type: 'button',
          className: 'dsh-ps-chip',
          'data-open': open ? 'true' : 'false',
          'aria-haspopup': 'dialog',
          'aria-expanded': open ? 'true' : 'false',
          title: t('composer.optimize'),
          onClick: () => { setOpen((value) => !value); setError(''); },
        },
          busy ? h(Glyph, { name: 'spinner', className: 'dsh-ps-spin' }) : h(StarIcon, { size: 16 }),
          h('span', { className: 'dsh-ps-chip-label' }, busy ? t('composer.optimizing') : t('composer.optimize')),
          // Same box and same stroke weight as the model selector's caret sitting
          // next to it (host: IconChevronDownOutlineRegular, size 14, stroke 1).
          h('span', { className: 'dsh-ps-caret' }, h(Glyph, { name: 'chevronRight', size: 14, strokeWidth: 1 }))),

        showsUndo
          ? h('button', {
            type: 'button',
            className: 'dsh-ps-chip',
            title: t('composer.undo'),
            onClick: () => {
              if (typeof inputActions.setDraft === 'function') inputActions.setDraft(undo);
              setUndo(null);
            },
          }, h(Glyph, { name: 'undo' }), h('span', { className: 'dsh-ps-chip-label' }, t('composer.undo')))
          : null,

        open
          ? h('div', { className: 'dsh-ps-pop', role: 'dialog', 'aria-label': t('composer.optimize') },
            // The chip no longer carries the style name, so the panel states it.
            h('div', { className: 'dsh-ps-pop-head' },
              h('p', { className: 'dsh-ps-pop-label' }, t('composer.style')),
              h('span', { className: 'dsh-ps-current' },
                h(StyleIcon, { value: active.icon, size: 15 }),
                h('span', { className: 'dsh-ps-current-name' }, active.name))),
            enabled.length === 0
              ? h('p', { className: 'dsh-ps-hint' }, t('settings.emptyStyles'))
              : h('div', { className: 'dsh-ps-style-list', role: 'radiogroup', 'aria-label': t('composer.style') },
                enabled.map((style) => h('button', {
                  key: style.id,
                  type: 'button',
                  role: 'radio',
                  'aria-checked': style.id === active.id ? 'true' : 'false',
                  className: 'dsh-ps-style-item',
                  onClick: () => selectStyle(style.id),
                },
                  h(StyleIcon, { value: style.icon, size: 17 }),
                  h('span', { className: 'dsh-ps-style-name' }, style.name)))),

            h('p', { className: 'dsh-ps-pop-label' }, t('composer.extra')),
            h('input', {
              className: 'dsh-ps-input',
              type: 'text',
              value: extra,
              placeholder: t('composer.extraPlaceholder'),
              onChange: (event) => setExtra(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void run(active.id);
                }
              },
            }),

            h('div', { className: 'dsh-ps-pop-rows' },
              h('div', { className: 'dsh-ps-row' },
                h('span', { className: 'dsh-ps-rowtitle' }, t('composer.auto')),
                h('div', { className: 'dsh-ps-rowcontrol' },
                  h(Switch, { checked: settings ? settings.autoOptimize === true : false, label: t('composer.auto'), onChange: () => { void toggleAuto(); } }))),

              h('div', { className: 'dsh-ps-row' },
                h('span', { className: 'dsh-ps-rowtitle' }, t('composer.context')),
                h('div', { className: 'dsh-ps-rowcontrol' },
                  h(Switch, { checked: contextOn, label: t('composer.context'), onChange: () => { void toggleContext(); } })))),

            h('div', { className: 'dsh-ps-toolbar' },
              h('button', {
                type: 'button',
                className: 'dsh-ps-btn dsh-ps-btn-primary',
                disabled: !canRun,
                onClick: () => { void run(active.id); },
              }, busy ? t('composer.optimizing') : t('composer.start')),
              error ? h('span', { className: 'dsh-ps-note', 'data-kind': 'error', role: 'alert' }, `${t('composer.failed')}：${error}`) : null))
          : null);
    }

    /* ── settings page ────────────────────────────────────────────────────── */

    const clone = (value) => JSON.parse(JSON.stringify(value));

    function newStyleId(existing) {
      const taken = new Set(existing.map((style) => style.id));
      let index = existing.length + 1;
      let id = `custom-${index}`;
      while (taken.has(id)) {
        index += 1;
        id = `custom-${index}`;
      }
      return id;
    }

    function SettingsPanel(props) {
      const { store, t, loadModels } = props;
      const config = useStoreValue(store);
      const [draft, setDraft] = useState(null);
      const [busy, setBusy] = useState(false);
      const [notice, setNotice] = useState(null);
      const [expanded, setExpanded] = useState(() => new Set());
      /** null while loading, else { default, groups, error }. */
      const [models, setModels] = useState(null);

      useEffect(() => {
        if (config !== null && draft === null) setDraft(clone(config));
      }, [config, draft]);

      const refreshModels = useCallback(async (fresh) => {
        setModels(null);
        try {
          setModels(await loadModels(fresh));
        } catch (failure) {
          setModels({ default: null, groups: [], error: failure && failure.message ? failure.message : String(failure) });
        }
      }, [loadModels]);

      useEffect(() => { void refreshModels(false); }, [refreshModels]);

      const dirty = useMemo(
        () => config !== null && draft !== null && JSON.stringify(config) !== JSON.stringify(draft),
        [config, draft],
      );

      const patch = useCallback((mutate) => {
        setDraft((current) => {
          if (current === null) return current;
          const next = clone(current);
          mutate(next);
          return next;
        });
        setNotice(null);
      }, []);

      const save = useCallback(async () => {
        if (draft === null) return;
        setBusy(true);
        setNotice(null);
        try {
          const saved = await putDocument(draft);
          store.set(saved);
          setDraft(clone(saved));
          // A Host build that still bounds `icon` to two code points would answer
          // with a fragment, which renders as a different mark. Say so instead of
          // reporting a save that silently changed the user's choice.
          const sent = JSON.stringify(draft.styles.map((style) => [style.id, style.icon]));
          const kept = JSON.stringify(saved.styles.map((style) => [style.id, style.icon]));
          setNotice(sent === kept
            ? { kind: 'ok', text: t('settings.saved') }
            : { kind: 'error', text: t('settings.iconTruncated') });
        } catch (failure) {
          setNotice({ kind: 'error', text: failure && failure.message ? failure.message : String(failure) });
        } finally {
          setBusy(false);
        }
      }, [draft, store, t]);

      /* Both restore actions read the seeded library from the Host, so the page
         never carries a second copy of it. */
      const restore = useCallback(async (mutate) => {
        try {
          const defaults = await fetchDefaults();
          patch((next) => mutate(next, defaults));
        } catch (failure) {
          setNotice({ kind: 'error', text: failure && failure.message ? failure.message : String(failure) });
        }
      }, [patch]);

      const toggleExpanded = useCallback((id) => setExpanded((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }), []);

      if (config === null || draft === null) {
        return h('div', { className: 'dsh-ps-page' }, h('h2', { className: 'dsh-ps-title' }, t('title')));
      }

      const settings = draft.settings;
      const enabledStyles = draft.styles.filter((style) => style.enabled);
      const styleOptions = enabledStyles.length > 0 ? enabledStyles : draft.styles;

      const updateStyle = (index, mutate) => patch((next) => { mutate(next.styles[index]); });

      const moveStyle = (index, delta) => patch((next) => {
        const target = index + delta;
        if (target < 0 || target >= next.styles.length) return;
        const [moved] = next.styles.splice(index, 1);
        next.styles.splice(target, 0, moved);
        next.styles.forEach((style, position) => { style.order = (position + 1) * 10; });
      });

      /* ── rewriter model: pick from what this deployment actually exposes ──
         The value of an option is JSON [provider, model]; '' is "follow the
         deployment default". A saved pair the catalog no longer lists stays
         selectable rather than silently resetting the user's choice. */
      const encodeModel = (provider, model) => JSON.stringify([provider, model]);
      const groups = models !== null && Array.isArray(models.groups) ? models.groups : [];
      const listed = groups.some((group) => group.models.length > 0);
      const savedProvider = settings.provider || '';
      const savedModel = settings.model || '';
      const savedIsListed = groups.some((group) => group.id === savedProvider && group.models.some((model) => model.id === savedModel));
      const defaultLabel = models !== null && models.default
        ? `${t('settings.modelFollow')}（${models.default.provider} / ${models.default.model}）`
        : t('settings.modelFollow');

      const modelOptionNodes = [h('option', { key: '__follow', value: '' }, defaultLabel)];
      for (const group of groups) {
        if (group.models.length === 0) continue;
        modelOptionNodes.push(h('optgroup', { key: group.id, label: group.name },
          group.models.map((model) => h('option', {
            key: `${group.id}\u0000${model.id}`,
            value: encodeModel(group.id, model.id),
          }, model.name === model.id ? model.id : `${model.name} · ${model.id}`))));
      }
      if (savedProvider !== '' && savedModel !== '' && !savedIsListed) {
        modelOptionNodes.push(h('option', { key: '__saved', value: encodeModel(savedProvider, savedModel) },
          `${savedProvider} / ${savedModel} — ${t('settings.modelSaved')}`));
      }
      const modelValue = savedProvider !== '' && savedModel !== '' ? encodeModel(savedProvider, savedModel) : '';
      const modelNote = models === null
        ? t('settings.modelLoading')
        : listed
          ? null
          : (models.error ? `${t('settings.modelFailed')}：${models.error}` : t('settings.modelEmpty'));

      /** One library entry: a scannable row, with the editor behind the disclosure. */
      const styleItem = (style, index) => {
        const open = expanded.has(style.id);
        const glyphName = styleGlyphName(style.icon);
        return h('div', { key: style.id, className: 'dsh-ps-item', 'data-disabled': style.enabled ? 'false' : 'true' },
          h('div', { className: 'dsh-ps-itemhead' },
            h(StyleIcon, { value: style.icon, size: 21, className: 'dsh-ps-itemicon' }),
            h('button', {
              type: 'button',
              className: 'dsh-ps-itemtext',
              'aria-expanded': open ? 'true' : 'false',
              onClick: () => toggleExpanded(style.id),
            },
              h('span', { className: 'dsh-ps-itemname' }, style.name || t('settings.unnamed')),
              h('span', { className: 'dsh-ps-itemdesc' },
                style.description || (style.instruction || '').split('\n')[0] || '—')),
            h(Switch, {
              checked: style.enabled,
              label: t('settings.style.enabled'),
              onChange: (value) => updateStyle(index, (entry) => { entry.enabled = value; }),
            }),
            h('button', {
              type: 'button',
              className: 'dsh-ps-chevron',
              'aria-label': t('settings.style.edit'),
              'aria-expanded': open ? 'true' : 'false',
              onClick: () => toggleExpanded(style.id),
            }, h(Glyph, { name: open ? 'chevronUp' : 'chevronDown', size: 10 }))),

          open
            ? h('div', { className: 'dsh-ps-itembody' },
              h('div', { className: 'dsh-ps-fieldrow' },
                h('input', {
                  className: 'dsh-ps-input',
                  value: style.name,
                  'aria-label': t('settings.style.name'),
                  placeholder: t('settings.style.name'),
                  onChange: (event) => updateStyle(index, (entry) => { entry.name = event.target.value; }),
                }),
                h('input', {
                  className: 'dsh-ps-input dsh-ps-icon-input',
                  // A key is a machine name, never something to show. While a mark is
                  // selected this field is empty and names it; it is here for custom
                  // text, and typing into it switches the style off the key.
                  value: glyphName === null ? (style.icon || '') : '',
                  'aria-label': t('settings.style.icon'),
                  placeholder: glyphName === null ? t('settings.style.icon') : STYLE_GLYPHS[glyphName].label,
                  onChange: (event) => updateStyle(index, (entry) => { entry.icon = event.target.value; }),
                })),
              h(GlyphPicker, {
                value: style.icon,
                label: t('settings.style.iconPick'),
                onPick: (key) => updateStyle(index, (entry) => { entry.icon = key; }),
                t,
              }),
              h(Field, { label: t('settings.style.desc') },
                h('input', {
                  className: 'dsh-ps-input',
                  value: style.description || '',
                  'aria-label': t('settings.style.desc'),
                  onChange: (event) => updateStyle(index, (entry) => { entry.description = event.target.value; }),
                })),
              h(Field, { label: t('settings.style.instruction'), hint: t('settings.style.instructionHint') },
                h('textarea', {
                  className: 'dsh-ps-textarea',
                  rows: 7,
                  value: style.instruction || '',
                  'aria-label': t('settings.style.instruction'),
                  onChange: (event) => updateStyle(index, (entry) => { entry.instruction = event.target.value; }),
                })),
              h('div', { className: 'dsh-ps-btnrow' },
                h('button', {
                  type: 'button',
                  className: 'dsh-ps-btn',
                  disabled: index === 0,
                  onClick: () => moveStyle(index, -1),
                }, h(Glyph, { name: 'arrowUp', size: 12 }), t('settings.style.up')),
                h('button', {
                  type: 'button',
                  className: 'dsh-ps-btn',
                  disabled: index === draft.styles.length - 1,
                  onClick: () => moveStyle(index, 1),
                }, h(Glyph, { name: 'arrowDown', size: 12 }), t('settings.style.down')),
                h('button', {
                  type: 'button',
                  className: 'dsh-ps-btn',
                  onClick: () => {
                    const id = newStyleId(draft.styles);
                    patch((next) => {
                      const copy = clone(style);
                      copy.id = id;
                      copy.name = `${style.name} 2`;
                      copy.order = (next.styles.length + 1) * 10;
                      next.styles.push(copy);
                    });
                    setExpanded((current) => new Set(current).add(id));
                  },
                }, t('settings.style.duplicate')),
                h('button', {
                  type: 'button',
                  className: 'dsh-ps-btn dsh-ps-btn-danger',
                  onClick: () => {
                    if (!window.confirm(t('settings.style.confirmDelete').replace('{name}', style.name))) return;
                    patch((next) => { next.styles = next.styles.filter((entry) => entry.id !== style.id); });
                  },
                }, t('settings.style.delete'))))
            : null);
      };

      return h('div', { className: 'dsh-ps-page' },
        h('h2', { className: 'dsh-ps-title' }, t('title')),
        h('p', { className: 'dsh-ps-intro' }, t('intro')),
        h('div', { className: 'dsh-ps-toolbar' },
          dirty ? h('span', { className: 'dsh-ps-badge' }, t('settings.dirty')) : null,
          notice !== null ? h('span', { className: 'dsh-ps-note', 'data-kind': notice.kind, role: 'status' }, notice.text) : null,
          h('span', { className: 'dsh-ps-spacer' }),
          h('button', {
            type: 'button',
            className: 'dsh-ps-btn',
            disabled: !dirty || busy,
            onClick: () => setDraft(clone(config)),
          }, t('settings.revert')),
          h('button', {
            type: 'button',
            className: 'dsh-ps-btn dsh-ps-btn-primary',
            disabled: busy,
            onClick: () => { void save(); },
          }, busy ? t('settings.saving') : t('settings.save'))),

        h('section', { className: 'dsh-ps-group' },
          h('div', { className: 'dsh-ps-grouphead' }, h('h3', null, t('settings.section.general'))),
          h('p', { className: 'dsh-ps-hint' }, t('settings.section.generalDesc')),
          h(Row, { title: t('settings.auto'), desc: t('settings.autoDesc') },
            h(Switch, {
              checked: settings.autoOptimize === true,
              label: t('settings.auto'),
              onChange: (value) => patch((next) => { next.settings.autoOptimize = value; }),
            })),
          h(Row, { title: t('settings.autoStyle') },
            h(StyleSelect, {
              value: settings.autoStyleId,
              options: styleOptions,
              label: t('settings.autoStyle'),
              onChange: (id) => patch((next) => { next.settings.autoStyleId = id; }),
            })),
          h(Row, { title: t('settings.defaultStyle'), desc: t('settings.defaultStyleDesc') },
            h(StyleSelect, {
              value: settings.defaultStyleId,
              options: styleOptions,
              label: t('settings.defaultStyle'),
              onChange: (id) => patch((next) => { next.settings.defaultStyleId = id; }),
            })),
          h(Row, { title: t('settings.showEntry'), desc: t('settings.showEntryDesc') },
            h(Switch, {
              checked: settings.showComposerEntry !== false,
              label: t('settings.showEntry'),
              onChange: (value) => patch((next) => { next.settings.showComposerEntry = value; }),
            })),
          h(Row, { title: t('settings.keepUndo'), desc: t('settings.keepUndoDesc') },
            h(Switch, {
              checked: settings.keepUndo !== false,
              label: t('settings.keepUndo'),
              onChange: (value) => patch((next) => { next.settings.keepUndo = value; }),
            })),
          h(Row, { title: t('settings.modelTitle'), desc: modelNote || t('settings.modelHint') },
            listed || models === null
              ? h('select', {
                className: 'dsh-ps-select',
                value: modelValue,
                disabled: models === null,
                'aria-label': t('settings.model'),
                onChange: (event) => {
                  const raw = event.target.value;
                  if (raw === '') {
                    patch((next) => { next.settings.provider = ''; next.settings.model = ''; });
                    return;
                  }
                  const [provider, model] = JSON.parse(raw);
                  patch((next) => { next.settings.provider = provider; next.settings.model = model; });
                },
              }, modelOptionNodes)
              // No catalog (no llm service, listing refused): stay usable by hand.
              : h('div', { className: 'dsh-ps-fieldrow' },
                h('input', {
                  className: 'dsh-ps-input',
                  value: savedProvider,
                  placeholder: t('settings.provider'),
                  'aria-label': t('settings.provider'),
                  onChange: (event) => patch((next) => { next.settings.provider = event.target.value; }),
                }),
                h('input', {
                  className: 'dsh-ps-input',
                  value: savedModel,
                  placeholder: t('settings.model'),
                  'aria-label': t('settings.model'),
                  onChange: (event) => patch((next) => { next.settings.model = event.target.value; }),
                })),
            h('button', {
              type: 'button',
              className: 'dsh-ps-btn dsh-ps-btn-icon',
              title: t('settings.modelRefresh'),
              'aria-label': t('settings.modelRefresh'),
              onClick: () => { void refreshModels(true); },
            }, h(Glyph, { name: 'refresh' }))),
          h(Row, { title: t('settings.temperature') },
            h('input', {
              className: 'dsh-ps-input dsh-ps-num',
              type: 'number',
              step: '0.1',
              min: '0',
              max: '2',
              'aria-label': t('settings.temperature'),
              value: String(settings.temperature),
              onChange: (event) => patch((next) => { next.settings.temperature = Number(event.target.value); }),
            })),
          h(Row, { title: t('settings.maxTokens') },
            h('input', {
              className: 'dsh-ps-input dsh-ps-num',
              type: 'number',
              step: '128',
              min: '128',
              max: '32768',
              'aria-label': t('settings.maxTokens'),
              value: String(settings.maxTokens),
              onChange: (event) => patch((next) => { next.settings.maxTokens = Number(event.target.value); }),
            }))),

        h('section', { className: 'dsh-ps-group' },
          h('div', { className: 'dsh-ps-grouphead' },
            h('h3', null, t('settings.section.styles')),
            h('span', { className: 'dsh-ps-hint' }, `${draft.styles.length}`)),
          h('p', { className: 'dsh-ps-hint' }, t('settings.section.stylesDesc')),
          draft.styles.length === 0
            ? h('p', { className: 'dsh-ps-hint' }, t('settings.emptyStyles'))
            : h('div', { className: 'dsh-ps-list' }, draft.styles.map(styleItem)),
          h('div', { className: 'dsh-ps-btnrow' },
            h('button', {
              type: 'button',
              className: 'dsh-ps-btn',
              onClick: () => {
                const id = newStyleId(draft.styles);
                patch((next) => {
                  next.styles.push({
                    id,
                    name: t('settings.unnamed'),
                    icon: 'sparkle',
                    description: '',
                    instruction: '',
                    enabled: true,
                    order: (next.styles.length + 1) * 10,
                  });
                });
                setExpanded((current) => new Set(current).add(id));
              },
            }, h(Glyph, { name: 'plus', size: 12 }), t('settings.style.new')),
            h('button', {
              type: 'button',
              className: 'dsh-ps-btn',
              onClick: () => { void restore((next, defaults) => { next.styles = defaults.styles; }); },
            }, t('settings.style.restore')))),

        h('section', { className: 'dsh-ps-group' },
          h('div', { className: 'dsh-ps-grouphead' },
            h('h3', null, t('settings.section.frame')),
            h('button', {
              type: 'button',
              className: 'dsh-ps-btn',
              onClick: () => { void restore((next, defaults) => { next.settings.basePrompt = defaults.defaultBasePrompt; }); },
            }, t('settings.frame.reset'))),
          h('p', { className: 'dsh-ps-hint' }, t('settings.section.frameDesc')),
          h('textarea', {
            className: 'dsh-ps-textarea',
            rows: 12,
            'aria-label': t('settings.section.frame'),
            value: settings.basePrompt,
            onChange: (event) => patch((next) => { next.settings.basePrompt = event.target.value; }),
          }),
          h('p', { className: 'dsh-ps-hint' }, t('settings.frame.placeholders'))),

        h('section', { className: 'dsh-ps-group' },
          h('div', { className: 'dsh-ps-grouphead' }, h('h3', null, t('settings.about'))),
          h('p', { className: 'dsh-ps-hint' }, t('settings.aboutText'))));
    }
    /* ── plugin ───────────────────────────────────────────────────────────── */

    const name = 'prompt-studio';
    const inject = ['slots', 'locale'];

    function apply(ctx) {
      const store = createStore(null);
      // First, and independent of every other lifecycle: the stylesheet must not ride
      // on a component, nor on the run's unload path (see installStylesheet).
      installStylesheet();
      // Read the locale service defensively too: `t` already falls back to the
      // built-in dictionary, so a composition without it degrades instead of failing.
      const locale = optionalService(ctx, 'locale');
      if (locale && typeof locale.register === 'function') {
        ctx.effect(() => locale.register(NS, DICTS), 'prompt-studio: dictionaries');
      }
      const bound = locale && typeof locale.bind === 'function' ? locale.bind(NS) : null;
      const t = (key, vars) => {
        let text = bound ? bound(key) : key;
        if (typeof text !== 'string' || text === key) {
          const table = DICTS.zh;
          text = table[key] !== undefined ? table[key] : key;
        }
        if (vars) for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
        return text;
      };

      // Load the Host document once, then keep the store authoritative for both slots.
      // The Host registers its routes a moment after activation, so a page that loads
      // first retries briefly instead of showing an empty composer forever.
      ctx.effect(() => {
        let cancelled = false;
        let timer = null;
        let attempts = 0;
        const attempt = () => {
          fetchDocument()
            .then((config) => {
              if (!cancelled) store.set(config);
            })
            .catch((error) => {
              if (cancelled) return;
              attempts += 1;
              if (attempts < 12) {
                timer = window.setTimeout(attempt, 400);
                return;
              }
              console.warn('[prompt-studio] 读取配置失败：', error && error.message ? error.message : error);
            });
        };
        attempt();
        return () => {
          cancelled = true;
          if (timer !== null) window.clearTimeout(timer);
          store.set(null);
        };
      }, 'prompt-studio: config load');

      // The model catalog source is resolved lazily inside the loader; touching an
      // optional service here is what breaks activation.
      const shared = { store, t, loadModels: createModelLoader(ctx) };

      ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
        name: 'conversation.input.right',
        id: 'prompt-studio',
        order: 40,
        // The single entry is the rewriter; style choice lives inside its panel.
        label: () => t('composer.optimize'),
      }, (slotProps) => h(ComposerTools, { ...slotProps, ...shared })));

      // Neither entry declares `locale`.
      //
      // Declaring it makes the renderer require the Host's locale face at render
      // time, and a missing face throws `SlotAssemblyError` — which the slot error
      // boundary deliberately RETHROWS, so it escapes past `renderSlot()` and takes
      // the whole shared parent down with it. Both components read their own `t`
      // (spread over the slot kit), so that face would be unused anyway; the
      // dictionary below is registered on its own and is enough.
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'prompt-studio',
        order: 40,
        label: () => t('settings.tab'),
      }, () => h(SettingsPanel, shared)));
    }

    // `__glyphs` is a tooling seam, not a runtime API: `scripts/emit-icons.mjs`
    // reads it to regenerate `icons/*.svg`, and the test suite reads it to prove
    // the shipped files and the in-code geometry cannot drift.
    return { name, inject, apply, __glyphs: STYLE_GLYPHS, __aliases: STYLE_GLYPH_ALIASES };
  },
});
