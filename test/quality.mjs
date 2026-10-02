/** Additional quality regressions; original smoke assertions remain untouched. */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const previousHome = process.env.DSH_HOME;
const home = await mkdtemp(join(tmpdir(), 'prompt-studio-quality-'));
process.env.DSH_HOME = home;
const studio = await import('../index.js');
try {
  const frame = studio.renderBasePrompt('用户框架 {{styleInstruction}}', { name: '自定义', instruction: '保持简洁' });
  assert.ok(frame.startsWith('用户框架 保持简洁'));
  assert.ok(frame.includes('助手的建议不是用户确认的决定'));
  assert.ok(frame.includes('不回答或执行请求'));
  assert.ok(frame.includes('自行核对'));
  assert.ok(!studio.renderBasePrompt('{{styleName}}', { name: '{{styleInstruction}}', instruction: '错误替换' }).startsWith('错误替换'));

  const draft = '长草稿'.repeat(900);
  assert.deepEqual(studio.sessionHistory({ deriveMessages: () => [
    { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: draft }] },
  ] }, draft), []);

  studio.forgetProjectHistory();
  const reads = [];
  const project = { header: { cwd: 'C:/quality' } };
  const queryCtx = { get: () => ({
    filterSessions: async () => ['a', 'b', 'c'].map((id) => ({ header: { id } })),
    readSurface: async (id) => {
      reads.push(id);
      return { events: [{ type: 'user/message', data: { content: [{ type: 'text', text: id }] } }] };
    },
  }) };
  const a = await studio.projectHistory(queryCtx, project, 'a');
  const b = await studio.projectHistory(queryCtx, project, 'b');
  assert.ok(!a.some((entry) => entry.label === 'a'));
  assert.ok(!b.some((entry) => entry.label === 'b'));
  assert.ok(b.some((entry) => entry.label === 'a'));
  const readCount = reads.length;
  await studio.projectHistory(queryCtx, project, 'b');
  assert.equal(reads.length, readCount);
  const denseSession = { ...project, deriveMessages: () => Array.from({ length: 5 }, () => ({
    role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'x'.repeat(1200) }],
  })) };
  const bounded = await studio.buildContext(queryCtx, denseSession, 'b', '草稿');
  assert.ok([...bounded.history, ...bounded.siblings].reduce((sum, entry) => sum + entry.text.length, 0) <= studio.CONTEXT_LIMITS.totalChars);

  await studio.saveDocument({ settings: { autoOptimize: true, injectContext: false }, styles: studio.BUILTIN_STYLES });
  const calls = [];
  const ctx = { get(name) {
    if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'test', model: 'test' }) };
    if (name === 'llm') return { stream: async function* (options) {
      calls.push(options);
      yield { type: 'text-delta', text: '优化后的完整请求' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    } };
    return null;
  } };
  const image = { type: 'image', attachment: { attachmentId: 'image-1' } };
  const file = { type: 'file', attachment: { attachmentId: 'file-1' } };
  const content = [{ type: 'text', text: '第一段' }, image, { type: 'text', text: '补充约束' }, file];
  const decision = await studio.handlePreStep(ctx, {}, async () => ({ kind: 'enter', messages: [
    { id: 'quality-message', role: 'user', source: { kind: 'user', rpcId: 'quality' }, content },
  ] }));
  assert.ok(calls[0].messages[0].content[0].text.includes('补充约束'));
  assert.equal(decision.messages[0].content[1], image);
  assert.equal(decision.messages[0].content[2], file);
  assert.equal(content[0].text, '第一段');

  const truncatedCtx = { get(name) {
    if (name === 'llm') return { stream: async function* () {
      yield { type: 'text-delta', text: '未完成的半句话' };
      yield { type: 'finish', reason: { kind: 'max-tokens' } };
    } };
    return ctx.get(name);
  } };
  await assert.rejects(studio.optimizePrompt(truncatedCtx, { text: '草稿' }), /被截断/);
  const unchanged = { kind: 'enter', messages: [{ id: 'quality-truncated', role: 'user', source: { kind: 'user', rpcId: 'quality' }, content }] };
  assert.equal(await studio.handlePreStep(truncatedCtx, {}, async () => unchanged), unchanged);
  console.log('QUALITY PASS: custom frames, substitution, long-draft deduplication, per-session cache, attachments, truncation');
} finally {
  process.env.DSH_HOME = previousHome;
  if (previousHome === undefined) delete process.env.DSH_HOME;
  await rm(home, { recursive: true, force: true });
}
