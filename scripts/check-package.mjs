#!/usr/bin/env node
/**
 * 发布自检：验证包结构与发布契约（不替代 GitHub 连通性和真机启动测试）。
 *
 * 为什么需要它：DSH 的插件安装走 pnpm 的 git 依赖通道——先把仓库的
 * codeload tarball 整包拉下来，再用 npm-packlist 按 package.json 的
 * `files` 过滤一遍。于是有两条只靠肉眼看代码发现不了的坑：
 *
 *   1. `files` 漏了一个运行时文件（例如 locale/），
 *      源码目录里一切正常，用户装完却少了东西。
 *   2. package.json 里出现了 `prepare` / `postinstall` 之类的构建脚本，
 *      pnpm 11 会直接以 GIT_DEP_PREPARE_NOT_ALLOWED 拒绝安装，
 *      用户看到的是「装不上」，而不是「装上了有点小问题」。
 *
 * 还有一类是**改了 A 忘了改 B** 的静默失效：patch 行的 id 与客户端槽位 id 不一致
 * （设置页读不到值）、README 里的 tag 没跟着版本走（用户照文档装到旧版）、
 * README 站内锚点指空、本地图片路径写错。这些都渲染正常、不报错，只能靠断言拦。
 *
 * 用法：node scripts/check-package.mjs
 * 退出码：0 全部通过；1 有检查项失败。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

const failures = []
const notes = []

function ok(label, detail = '') {
  console.log(`  \u2713 ${label}${detail ? ` — ${detail}` : ''}`)
}

function fail(label, detail) {
  failures.push(`${label}：${detail}`)
  console.log(`  \u2717 ${label} — ${detail}`)
}

function section(title) {
  console.log(`\n${title}`)
}

/**
 * 跑一个子进程，遇到瞬时失败（EBUSY / EAGAIN）自动重试。
 *
 * 为什么需要它：这台机器上 `spawnSync git` 偶发 `EBUSY`——进程已经创建但资源
 * 一时拿不到，跟命令本身无关，隔一会儿再跑就好。真踩过：一次自检里
 * `git ls-files` 撞上 EBUSY，脚本把异常咽掉、把**安全检查降级成一行提示**，
 * 结果「本机私有路径」那一栏什么都没扫，却照样打出全绿。
 * 安全检查悄悄不跑，比没有检查更糟——它给人虚假的安心。
 *
 * 所以这里重试，且**调用方必须把最终的失败当成失败**，不许再降级成提示。
 */
function runWithRetry(command, args, options, attempts = 4) {
  let last
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return execFileSync(command, args, options)
    } catch (error) {
      last = error
      if (error.code !== 'EBUSY' && error.code !== 'EAGAIN') throw error
      // 同步阻塞一小会儿再试（脚本是同步流程，不能用 await）。
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120 * (attempt + 1))
    }
  }
  throw last
}

/** 扫描时跳过的目录：不是源码，也不该进仓库。 */
const SKIP_DIRS = new Set(['.git', 'node_modules', '.workbuddy-ai'])

/** 递归列出工作区里的文件（相对路径，正斜杠）。git 用不了时的兜底。 */
function walkFiles(dir, prefix = '', out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) walkFiles(join(dir, entry.name), rel, out)
    else if (entry.isFile()) out.push(rel)
  }
  return out
}

/**
 * 打包产物里「必须出现」的文件。少任何一个都会让用户装到残包。
 * 前六个是运行时真正要读的；后四个是给人看的，装进 node_modules 里也能翻。
 */
const REQUIRED_IN_PACKAGE = [
  'package.json',
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'icon.svg',
  'locale/zh.json',
  'locale/en.json',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
]

/**
 * 刻意**不进包**的开发期资产。断言它们不在产物里，是为了防止以后有人
 * 「顺手把 icons 也加进 files 吧」——那些是 emit-icons.mjs 生成给人看的预览产物，
 * 运行时一个字节都不读（图标几何内联在 client.js 里），进包只是白背体积。
 */
const DELIBERATELY_UNPACKED = ['icons/', 'test/', 'scripts/']

/** pnpm 11 遇到这些脚本会要求 allowBuilds 授权，一键安装会被打断。 */
const FORBIDDEN_SCRIPTS = [
  'preinstall',
  'install',
  'postinstall',
  'prepare',
  'prepublish',
  'prepublishOnly',
  'prepack',
]

/** 三个测试：客户端激活、宿主语义、改写质量。发布前必须全绿。 */
const TEST_FILES = ['test/smoke.mjs', 'test/client-smoke.mjs', 'test/quality.mjs']

// ---------------------------------------------------------------- 元数据

section('package.json 元数据')
for (const field of ['name', 'version', 'description', 'license', 'main', 'icon']) {
  if (typeof pkg[field] === 'string' && pkg[field] !== '') ok(field, pkg[field])
  else fail(field, '缺失或不是非空字符串')
}

if (pkg.private === true) {
  fail('private', '为 true 会挡住 npm 发布；从 GitHub 安装虽不受影响，但建议删掉')
} else {
  ok('private', '未设置（可发布）')
}

if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version ?? '')) {
  ok('version', '符合 SemVer，可直接作为 tag')
} else {
  fail('version', `"${pkg.version}" 不是 SemVer，无法生成 v<version> 标签`)
}

if (pkg.author && typeof pkg.author === 'object' && pkg.author.name) {
  ok('author', `${pkg.author.name}${pkg.author.url ? ` <${pkg.author.url}>` : ''}`)
} else {
  fail('author', '缺失；npm 页面和 git 历史之外的地方会显示成匿名')
}

for (const field of ['repository', 'homepage', 'bugs']) {
  if (pkg[field]?.url || typeof pkg[field] === 'string') ok(field, pkg[field].url ?? pkg[field])
  else fail(field, '缺失；npm 页面与「从哪装的」线索会断')
}

// ---------------------------------------------------------------- dsh 声明

section('dsh 声明')
const dsh = pkg.dsh ?? {}
if (dsh.manifestVersion === 1) ok('dsh.manifestVersion', '1')
else fail('dsh.manifestVersion', '应为 1；缺失时部分 DSH 版本不会把它当插件处理')

const patch = dsh.bundle?.patch
const patchList = Array.isArray(patch) ? patch : patch === undefined ? [] : [patch]
if (patchList.length === 0) {
  fail('dsh.bundle.patch', '未声明，用户装完不会有任何 Host 半区')
} else {
  for (const rel of patchList) {
    if (existsSync(join(ROOT, rel))) ok('dsh.bundle.patch', rel)
    else fail('dsh.bundle.patch', `${rel} 在仓库里不存在`)
  }
}

if (dsh.client?.platform === 'web') ok('dsh.client.platform', 'web')
else fail('dsh.client.platform', '应为 web')

if (Array.isArray(dsh.client?.inject)) ok('dsh.client.inject', `长度 ${dsh.client.inject.length}`)
else fail('dsh.client.inject', '应为数组')

// ---------------------------------------------------------------- exports

section('exports 契约')
for (const key of ['.', './client', './package.json']) {
  if (typeof pkg.exports?.[key] === 'string') ok(`exports["${key}"]`, pkg.exports[key])
  else fail(`exports["${key}"]`, '缺失；DSH 靠它定位 Host 与浏览器半区')
}

// exports 指向了不在 files 里的路径 ⇒ 消费者 import 必然 ENOENT。
// 真踩过：exports 里留着 ./icons/* 和 ./scripts/*，而那两个目录已经从 files 里去掉。
const exportedPaths = Object.values(pkg.exports ?? {}).filter((v) => typeof v === 'string')
const exportedDirs = [...new Set(exportedPaths.map((v) => v.replace(/^\.\//, '').split('/')[0]))]
const unpackedExportDirs = exportedDirs.filter((dir) =>
  !dir.includes('.') && !(pkg.files ?? []).some((f) => f === dir || f.startsWith(`${dir}/`)))
if (unpackedExportDirs.length === 0) {
  ok('exports 指向的文件都在 files 白名单里')
} else {
  fail(
    'exports 指向了不进包的文件',
    `${unpackedExportDirs.join('、')}；要么把它加进 files，要么从 exports 里删掉`,
  )
}

// ---------------------------------------------------------------- 构建脚本

section('构建脚本（pnpm 11 allowBuilds）')
const declared = Object.keys(pkg.scripts ?? {})
const forbidden = declared.filter((name) => FORBIDDEN_SCRIPTS.includes(name))
if (forbidden.length === 0) {
  ok('无构建脚本', declared.length ? `已声明：${declared.join(', ')}` : '未声明任何脚本')
} else {
  for (const name of forbidden) {
    fail(`scripts.${name}`, 'pnpm 11 会以 GIT_DEP_PREPARE_NOT_ALLOWED 拒绝安装，必须移除')
  }
}

// ---------------------------------------------------------------- peer 依赖

section('peerDependencies')
const peers = pkg.peerDependencies ?? {}
if (Object.keys(peers).length === 0) {
  fail('peerDependencies', '空；建议声明 @deepseek-ai/cordis 以便兼容性检查通过')
} else {
  for (const [name, range] of Object.entries(peers)) {
    const optional = pkg.peerDependenciesMeta?.[name]?.optional === true
    if (optional) ok(name, `${range}（optional，宿主不满足也不会拦住安装）`)
    else {
      ok(name, `${range}（必需）`)
      notes.push(`${name} 是必需 peer（${range}），宿主版本不满足时安装会被判为不兼容`)
    }
  }
}

// --------------------------------------------- 入口 id 契约（patch ↔ index ↔ client）

section('入口 id 契约')
// 三处必须说的是同一个名字，否则设置页读不到自己那份表单、槽位注册不上。
//   cordis.patch.yml 的 insert 行  id   ←→  index.js 的 export const name
//                                   name ←→  package.json 的 name（包名）
//   client.js 里每个 slots.register 的 id ←→ 上面那个 id
//   client.js 的 __ModuleLoader__.load id ←→ 包名
const patchText = patchList.map((rel) => readFileSync(join(ROOT, rel), 'utf8')).join('\n')
const patchIds = [...patchText.matchAll(/^\s*-\s*id:\s*(\S+)\s*$/gm)].map((m) => m[1])
const patchNames = [...patchText.matchAll(/^\s*name:\s*(\S+)\s*$/gm)].map((m) => m[1])

const indexText = readFileSync(join(ROOT, 'index.js'), 'utf8')
const hostName = /export const name = '([^']+)'/.exec(indexText)?.[1]

const clientText = readFileSync(join(ROOT, 'client.js'), 'utf8')
const slotIds = [...clientText.matchAll(/ctx\.slots\.register\(\{[\s\S]{0,120}?\bid:\s*'([^']+)'/g)].map((m) => m[1])
const loaderId = /__ModuleLoader__\.load\(\{[\s\S]{0,80}?\bid:\s*'([^']+)'/.exec(clientText)?.[1]

if (!hostName) {
  fail('index.js export const name', '未找到；patch 行就没法对照了')
} else if (patchIds.includes(hostName)) {
  ok('patch id ↔ index.js name', hostName)
} else {
  fail('patch id 与 index.js name 不一致', `patch 里是 [${patchIds.join(', ')}]，index.js 里是 "${hostName}"`)
}

if (patchNames.length === 0) {
  fail('patch 行的 name', '未找到；它应该是包名')
} else if (patchNames.every((n) => n === pkg.name)) {
  ok('patch name ↔ 包名', pkg.name)
} else {
  fail('patch 行的 name 与包名不一致', `patch 里是 [${patchNames.join(', ')}]，包名是 "${pkg.name}"`)
}

if (slotIds.length === 0) {
  fail('client.js 槽位 id', '一个 slots.register 都没解析到，正则可能已失效')
} else if (slotIds.every((id) => id === hostName)) {
  ok('client.js 槽位 id', `${slotIds.length} 处均为 ${hostName}`)
} else {
  fail(
    'client.js 槽位 id 与 patch id 不一致',
    `槽位里是 [${[...new Set(slotIds)].join(', ')}]，patch 里是 [${patchIds.join(', ')}]；设置页会读不到值`,
  )
}

if (!loaderId) {
  fail('client.js 模块加载器 id', '未找到 __ModuleLoader__.load 的 id')
} else if (loaderId === pkg.name) {
  ok('client.js 加载器 id ↔ 包名', loaderId)
} else {
  fail('client.js 加载器 id 与包名不一致', `是 "${loaderId}"，包名是 "${pkg.name}"`)
}

// ------------------------------------------------- README 里的版本号

section('README 安装命令的版本号')
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
const wanted = `#v${pkg.version}`
if (readme.includes(wanted)) {
  ok('README 指向当前版本', wanted)
} else {
  const found = [...new Set([...readme.matchAll(/#v(\d+\.\d+\.\d+)/g)].map((m) => m[0]))]
  fail(
    'README 指向的不是当前版本',
    found.length > 0
      ? `README 里是 ${found.join('、')}，当前版本是 ${wanted}；发版脚本会一起改，手改时别漏`
      : `README 里找不到 ${wanted}，安装章节的 tag 可能被改坏了`,
  )
}

// 「版本对应与升级」表里那一格是裸版本号（没有 #），发版脚本单独改它；
// 漏改的后果是安装命令写着新版本、表格却还写旧版本，用户不知道信哪个。
if (readme.includes(`| **${pkg.version}** |`)) {
  ok('README 版本对应表', `**${pkg.version}**`)
} else {
  const row = /^\|\s*\*\*(\d+\.\d+\.\d+)\*\*\s*\|/m.exec(readme)?.[1]
  fail(
    'README 版本对应表的版本号不是当前版本',
    row ? `表格里是 **${row}**，当前版本是 **${pkg.version}**` : '找不到 `| **<版本号>** |` 形式的表格行',
  )
}

// 站内锚点：改写标题会让 `](#旧锚点)` **静默**失效——渲染出来照常是个链接，点了没反应。
// 真踩过：把「方式 A（推荐）：一行装完」改成别的标题后，「怎么升级」里的链接就指空了。
// 按 GitHub 的 slug 规则（小写、去掉标点、空格转连字符）校验一遍。
const slug = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-')
const headings = new Set([...readme.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slug(m[1])))
const anchors = [...readme.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1])
const deadAnchors = anchors.filter((anchor) => !headings.has(anchor))
if (deadAnchors.length === 0) {
  ok('README 站内锚点', `${anchors.length} 个全部有效`)
} else {
  fail('README 站内锚点失效', `${deadAnchors.join('、')}；标题被改过就会这样，链接要跟着改`)
}

// README 里的本地图片：路径写错在 GitHub 上只是「图裂」，不报错，很容易一直没人发现。
// 只校验相对路径（外链跳过），并剥掉可能存在的 #anchor。
const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)]
  .map((m) => m[1].trim())
  .filter((src) => !/^(?:https?:)?\/\//i.test(src))
const missingImages = images.filter((src) => !existsSync(join(ROOT, src.replace(/^\.\//, '').split('#')[0])))
if (missingImages.length === 0) {
  ok('README 图片', images.length > 0 ? `${images.length} 个本地图片都在` : '无本地图片引用')
} else {
  fail('README 图片路径失效', `${missingImages.join('、')}；在 GitHub 上会显示成图裂`)
}

// ---------------------------------------------------------------- 打包产物

section('打包产物（npm pack，与 pnpm 的 git 依赖同一套 packlist）')
let packed = null
try {
  const raw = runWithRetry('npm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
  const start = raw.indexOf('[')
  packed = JSON.parse(raw.slice(start))[0]?.files?.map((f) => f.path) ?? null
} catch (error) {
  // 不降级成提示：产物清单是这条闸门最核心的检查——`files` 白名单漏了运行时文件，
  // 源码目录里完全看不出来，用户装到的是残包。跑不了就说跑不了。
  fail('npm pack 无法执行', `${error.message.split('\n')[0]}；产物清单与 files 白名单没有被验证`)
}

if (packed) {
  ok('产物文件数', String(packed.length))
  for (const rel of REQUIRED_IN_PACKAGE) {
    if (packed.includes(rel)) ok(`产物含 ${rel}`)
    else fail(`产物缺 ${rel}`, 'package.json 的 files 里补上它，否则用户装到的是残包')
  }

  const leaked = DELIBERATELY_UNPACKED.filter((dir) => packed.some((p) => p.startsWith(dir)))
  if (leaked.length === 0) {
    ok('产物不含开发期资产', DELIBERATELY_UNPACKED.map((d) => d.replace(/\/$/, '')).join('、'))
  } else {
    fail('开发期资产混进了产物', `${leaked.join('、')}；它们运行时用不到，进包只是白背体积`)
  }
}

// ---------------------------------------------------------------- 测试

section('测试（客户端激活 / 宿主语义 / 改写质量）')
for (const rel of TEST_FILES) {
  if (!existsSync(join(ROOT, rel))) {
    fail(`测试缺 ${rel}`, 'CI 会跑它，别删')
    continue
  }
  try {
    execFileSync(process.execPath, [rel], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    })
    ok(rel)
  } catch (error) {
    const tail = String(`${error.stdout ?? ''}${error.stderr ?? ''}`)
      .trim()
      .split('\n')
      .filter((line) => /fail|Error|error/i.test(line))
      .slice(-3)
      .join(' / ')
    fail(rel, tail || error.message.split('\n')[0])
  }
}

// --------------------------------------------- 本机私有路径（不该出现在公开仓库）

section('本机私有路径')
// 一行 YAML 示例里的真实路径，在 diff 里毫不起眼，但推上去就永久留在公开仓库和 git 历史里。
// 真漏过一次：DoneVoice 的 NATIVE.md 的 hmr 示例里写着开发机的实际路径。
//
// ⚠️ 这里**刻意不维护「私有字符串黑名单」**。DoneVoice 的第一版就是那么写的——把开发机的
//    目录名列进脚本里，结果脚本自己成了泄漏源：为了检测某个私有名字而把它抄进公开仓库，
//    等于帮倒忙。所以改成**结构判断**：盘符绝对路径的**第一段**不在通用名单里，就视为
//    「本机真实路径」。
//
//    这份名单装的是**通用词（放行）**，不是私有词（拦截）——前者可以公开，后者不能。
//    真踩过：第一版只放行了 users/windows 这些系统目录，于是测试夹具里的
//    `C:/proj`、`C:/quality` 被当成泄漏报了出来。夹具本来就用假路径，
//    而**一段式的盘符路径（`C:/proj`）根本指认不到任何人**，没必要拦。
const GENERIC_PATH_SEGMENTS = new Set([
  // 系统目录
  'users', 'windows', 'program files', 'program files (x86)', 'programdata', 'appdata',
  // 占位符与文档里常见的通用词
  'path', 'to', 'public', 'temp', 'tmp', 'ds', 'dsh',
  // 夹具 / 示例里常见的通用词（写测试时的假路径）
  'proj', 'project', 'projects', 'quality', 'test', 'tests', 'src', 'app', 'apps',
  'repo', 'repos', 'workspace', 'workspaces', 'example', 'examples', 'sample', 'samples',
  'sandbox', 'foo', 'bar', 'some', 'your', 'my', 'x', 'y',
])
// 前一个字符不能是字母数字或连字符，否则会误伤 `dsh-app://app`、`https://…` 这类协议串。
const DRIVE_PATH = /(?<![-\w])[A-Za-z]:[\\/][^\s`"'|,;)\]}]*/g
const SCANNED_EXTENSIONS = /\.(?:md|js|mjs|json|yml|yaml|txt|svg|html|css)$/i

let trackedFiles = []
let scanSource = ''
try {
  trackedFiles = runWithRetry('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
  scanSource = 'git ls-files'
} catch (gitError) {
  // 兜底：直接走工作区。语义上不如 git ls-files 准（会带上被 .gitignore 忽略的本地
  // 文件，可能多报），但**绝不跳过**——扫描宁可多报，不可不跑。
  // 把失败原因写进结论里：换了一种扫法却不说，等于另一种静默降级。
  try {
    trackedFiles = walkFiles(ROOT)
    const why = gitError.code ?? gitError.message.split('\n')[0]
    scanSource = `工作区遍历（git ls-files 失败：${why}；可能含被忽略的本地文件）`
  } catch (error) {
    fail('本机私有路径扫描未能执行', `${error.message.split('\n')[0]}；这一项没有被验证`)
  }
}

if (trackedFiles.length > 0) {
  const suspiciousPaths = []
  for (const rel of trackedFiles) {
    if (!SCANNED_EXTENSIONS.test(rel)) continue
    const text = readFileSync(join(ROOT, rel), 'utf8')
    for (const match of text.matchAll(DRIVE_PATH)) {
      const raw = match[0]
      const segments = raw.slice(2).split(/[\\/]+/).filter(Boolean)
      if (segments.length === 0) continue
      const head = segments[0].toLowerCase()
      if (!GENERIC_PATH_SEGMENTS.has(head)) {
        suspiciousPaths.push(`${rel} → ${raw}`)
        continue
      }
      // `C:\Users\<你>\…`（占位符）与 `C:\Users\Public\…`（系统）放行；
      // 换成真实用户名的写法就要拦——这是最容易漏的一类（Windows 用户名往往就是真名）。
      if (head === 'users' && segments.length > 1) {
        const user = segments[1]
        if (!user.startsWith('<') && user.toLowerCase() !== 'public') suspiciousPaths.push(`${rel} → ${raw}`)
      }
    }
  }
  if (suspiciousPaths.length === 0) {
    ok('无本机私有路径', `${scanSource}，共 ${trackedFiles.length} 个文件`)
  } else {
    fail('检出疑似本机私有路径', `${[...new Set(suspiciousPaths)].join('；')}；改成 <你的…> 这类占位符再提交`)
  }
}

// ---------------------------------------------------------------- 结论

console.log('')
if (notes.length > 0) {
  console.log('提示：')
  for (const note of notes) console.log(`  · ${note}`)
  console.log('')
}

if (failures.length === 0) {
  console.log(`\u2713 自检通过：${pkg.name}@${pkg.version} 包结构、入口 id 契约与三个测试均正常（GitHub 网络及 DSH 实际启动须另验）`)
  process.exit(0)
}

console.error(`\u2717 自检失败 ${failures.length} 项：`)
for (const item of failures) console.error(`  · ${item}`)
process.exit(1)
