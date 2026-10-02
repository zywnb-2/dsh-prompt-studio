# 提示词工坊 · dsh-prompt-studio

DSH 的提示词优化插件。给「随手说的一句话」套上一种风格，改写成模型更容易一次做对的提示词。

- **输入框一键优化**：输入框右侧发送键前多出一组控件，选中风格 → 点「优化」，草稿被替换成优化结果，可一键撤销。
- **发送前自动优化**：打开开关后，每次发送都按所选风格改写「送给模型的内容」，对话记录里保留你的原话。
- **风格自由增删改**：`设置 → 提示词工坊` 里可以新增、编辑、停用、删除、复制、排序风格，也能改全局优化框架；内置 7 套风格，删完还能一键恢复。

## 改写质量与回归检查

运行时在用户保存的基底提示词后追加一份共享改写约束，不覆盖基底、风格库或用户配置：
短请求保持短；保留否定条件与范围；不把助手建议当成已确认事实；上下文只补本轮相关缺口；
输出前自行检查遗漏、扩写和编造，只返回正文。这是同一次模型调用中的指令，不增加第二次调用。

本轮同时修复：长草稿在截断前去重；项目缓存按当前会话隔离；上下文两种来源共用总字符预算；
自动改写保留图片/文件并读取全部文本块；截断输出不替换草稿（自动模式保留原文）。
这些是正确性改进，不代表已测得模型质量提升比例。

```sh
node test/smoke.mjs
node test/client-smoke.mjs
node test/quality.mjs
```

界面、图标、开关和单次调用流程保持不变。宿主代码变更需要完整重启 DSH。

## 安装

**安装到你自己的电脑，不是安装到作者的下载目录。** 在 Windows 10/11、DSH 桌面版 0.2.0-rc.2 上，
从 GitHub 安装时，DSH 会自动把插件放进当前用户的 profile：

```
%USERPROFILE%\.dsh\profiles\<profile>\node_modules\dsh-prompt-studio\
```

（`DSH_HOME` 改过的话，就是 `<DSH_HOME>\profiles\<profile>\node_modules\dsh-prompt-studio\`。）

### 方式 A（推荐）：一行装完

1. 打开 DSH：`设置 → 插件 → 添加插件`
2. 在「包名或地址」里粘贴这一行：

   ```
   github:zywnb-2/dsh-prompt-studio#v1.0.0
   ```

3. 点「安装」，安装后 `application: applied` 即生效
4. **重启 DSH**——宿主半区的新代码要重启才加载

`#` 后面的 `v1.0.0` **不要删**。不写 tag 会拉到 main 的最新提交，那不是一次「发布」，出了问题也无从对照。

> 本包**尚未发布到 npm**，所以「包名或地址」里填 `dsh-prompt-studio` 是装不上的——请用上面这行。

### 方式 B：命令行

```bash
dsh plugin --profile desktop add github:zywnb-2/dsh-prompt-studio#v1.0.0
```

（个别 DSH 版本不认 `add`，用 `install` 代替。）

### 方式 C：本地目录（离线 / 开发）

把仓库下载解压后，在插件页填**内层那个含 `package.json` 的目录**的绝对路径。

⚠️ 本地路径安装通常引用该目录，**之后移走或删除它可能导致插件失效**——长期使用请走方式 A。

### 生效时机

| 改了什么 | 怎么生效 |
|---|---|
| 客户端（`client.js`） | **刷新页面** |
| 宿主（`index.js`） | **必须重启 DSH** |
| 设置页里的风格 / 开关 | 立即生效（那是普通用户数据，不是代码） |

### 系统要求

| 项目 | 要求 |
|---|---|
| 操作系统 | Windows 10/11（开发与验证都在这个平台；macOS / Linux 未测） |
| DSH 桌面版 | **0.2.0-rc.2**。换别的版本可能因接口变化而失效 |
| Node | 运行时**无需你安装**：插件只用 Node 内置模块 |
| 网络 | 运行时无需联网；**从 GitHub 安装时需要联网** |

### 版本对应与升级

| 提示词工坊 | 对应 DSH | 说明 |
|---|---|---|
| **1.0.0** | 0.2.0-rc.2 | 当前已发布的 GitHub 版本。安装规格：`github:zywnb-2/dsh-prompt-studio#v1.0.0` |

DSH 的插件入口**没有自动更新**。升级就是换一个 tag：

1. 在插件页**卸载**旧版
2. 按方式 A 装新版（只改 `#` 后面那串）
3. **重启 DSH**

完整更新记录见 [CHANGELOG.md](./CHANGELOG.md)。

### 这个插件是独立的

- **零运行时依赖**：宿主半区只用 Node 内置模块（`node:fs/promises`、`node:os`、`node:path`），浏览器半区只 `require('react')`（由宿主提供）。`package.json` 里没有 `dependencies`。
- **不依赖任何其它插件**：不 import、不读取、不修改任何插件；配置只写自己的 `$DSH_HOME/prompt-studio/config.json`。
- **不会拖累邻居**：两个插槽入口都不声明 `locale` / `hooks` / `children` 这类装配要求 —— 装配错误会被 DSH 的槽位边界**故意重新抛出**并击穿共用父节点，声明了就可能在宿主 locale 面缺失时把同排的其它插件一起卸掉。
- **命名空间自带前缀**：CSS 全部 `dsh-ps-`，locale 命名空间 `prompt-studio`，localStorage 键 `dsh-prompt-studio:*`，不与任何人相撞。
- **可选服务全部防御式读取**：没有 locale、没有 remote、服务查询抛异常，都只是降级，不会导致激活失败。

---

## 功能

### 输入框（`conversation.input.right`）

**只有一个入口**：`优化 ▾`。点它展开面板，风格选择、本次额外要求、自动优化开关、开始优化全在面板里 ——
不再有第二个「选择风格」的按钮。

| 控件 | 作用 |
| --- | --- |
| `✦ 优化 ›` | 唯一的入口，点开面板。四角星为**彩色镂空描边**（渐变色沿轮廓流动，不旋转）+ 轻微呼吸 |
| 面板 ·「风格」 | 单选列表，**每行只有图标 + 名称**；顶部同时显示当前选中的风格（入口收起后这里是唯一能看到当前风格的地方） |
| 面板 ·「本次额外要求」 | 可选，回车等价于点「开始优化」 |
| 面板 ·「发送前自动优化」 | 开关，写回宿主配置，与设置页同一份值 |
| 面板 ·「参考本项目对话」 | 开关，控制优化时是否读取本项目已有对话；与命令行脚本写的是同一份值 |
| 面板 ·「开始优化」 | 用选中的风格改写草稿；优化中显示转圈，失败在面板里报错，不会改坏草稿 |
| `↩ 撤销` | 优化后出现在入口旁，一键回到优化前的原稿（可在设置里关闭）。**只活在「已改写、还没发出」这段时间** |

**撤销的寿命**：它回退的是「这次改写之前输入框里的原文」，所以输入框一空它就失去意义 —— 而发送
恰恰会把草稿清空（宿主在 submit 里 `setDraft("")`）。因此：

- 改写完还没发出 → 撤销在；
- **发出之后 → 撤销自动消失**；
- 自己把输入框清空 → 同样消失（框里已经没有可回退的东西）。

实现上是**清掉状态**而不只是隐藏按钮：只隐藏的话，你接着打下一句话时它会**诈尸**回来，提议把上一条
已经发出去的草稿恢复出来。渲染层另有一道 `draft 非空` 的判断兜底，所以即便状态没来得及清，也不会闪一下。

**面板刻意不放说明文字**：它是一个「选一下就走」的控件，不是说明书。风格说明、开关的含义都写在
`设置 → 提示词工坊` 里 —— 那里才是你编辑它们的地方；放在面板里只会让列表变高、把选项挤下去。

风格选择记在浏览器本地，新会话沿用；自动优化开关存在宿主，跟着 profile 走。

### 设置页（`设置 → 提示词工坊`）

- **常规**：发送前自动优化、自动优化风格、输入框默认风格、是否显示输入框入口、是否保留一键撤销、**优化模型（下拉选择当前可用的模型，默认跟随当前默认模型）**、温度、最大输出 tokens。
- **风格库**：每条风格含名称、图标、说明与「优化指令」；支持启用/停用、上下移动、复制、删除、新增、恢复内置风格。
- **优化器提示词**：所有风格共用的框架，可用 `{{styleName}}`、`{{styleInstruction}}` 占位符；可恢复默认。
- 顶部工具条显示未保存状态，`保存设置` 才会落盘，`放弃更改` 还原。

「自动优化风格」和「输入框默认风格」**不是原生 `<select>`**：原生下拉的 `<option>` 里放不下 SVG，
七个线稿会退回字段里存的 emoji。这两处用自绘的 `StyleSelect` 列表框，触发器与每个选项都画真正的线稿。

### 内置风格

| 风格 | 用途 |
| --- | --- |
| ✨ 轻润色 | 只修错别字、语序、口水话，保持原意与篇幅 |
| 🧱 结构化需求 | 改写成规格书：目标 / 背景 / 约束 / 交付物 / 验收标准 |
| 🗺️ 步骤规划 | 拆成有先后依赖、带检查点的执行计划 |
| 🎓 领域专家 | 补上专家才会写出的术语、隐含约束与边界条件 |
| 🎨 视觉风格增强 | 把「好看点」翻译成风格、构图、材质光影、配色、氛围、避免项 |
| ✅ 验收标准 | 在保留原需求之上补齐可验证的完成定义 |
| 🔨 硬邦邦 | 老哥拍桌子派活的口吻：越快越好、画质拉满、别替我规划，结尾吼一嗓子 |

「视觉风格增强」是专门为图像 / 3D / UI 类生成任务准备的：像「做个 3D 科幻巨构场景，好看点」这种草稿，会被补全到镜头、材质、光比、实例化与 draw call 级别的具体描述。

「硬邦邦」是把一句话需求改成糙话直给的动员令：保留原稿全部事实（细节塞进括号），换成
「你好老哥们。是这样的，我时间不多了，钱也不够了……这一次任务是：……你懂了把？……要硬邦邦的！！！」
这套口气。实测：

> 你好老哥们。是这样的，我时间不多了，钱也不够了，这次就得干一票大的，你懂么？这一次任务是：给我整一个单文件 HTML 的 3D 体素场景，主题就是巨大橡树上的幻想树屋（完整浮空岛屿上杵着一棵巨大橡树，每个大枝干上都有独立房屋，枝干之间拿吊桥连起来……），无外部资源，浏览器直接打开就能跑，你懂了把？……别管我的显卡，目的就一个——建个贼拉牛逼的，让我装个逼，要硬邦邦的！！！

---

## 两条路径，一份实现

| | 一键优化（面板按钮） | 自动优化（发送前） |
| --- | --- | --- |
| 触发 | 点击 `优化` | 每次发送 |
| 改写对象 | 输入框里的草稿（你可以先看再发） | 进入模型的那批消息 |
| 对话记录 | 显示优化后的文本 | **保留你的原话**，只有模型看到改写版 |
| 实现 | 浏览器 → `POST /optimize` | 宿主 `agent/pre-step` 瀑布 |

两条路径在宿主上调用同一个 `optimizePrompt()`，风格、框架、模型、温度完全一致，不会各走一套。

自动优化为什么放在宿主：客户端没有「提交前改写」的钩子（DSH 客户端事件只有 4 个，`inputActions.submit()` 也不接受参数），而 `agent/pre-step` 是官方支持的「替换进入这一步的消息」瀑布。改写在模型请求提交之前完成，原话完整留在会话日志里，fork / 回放 / 继续都不失真。

自动优化失败不会挡住这一轮：捕获后按原稿发送，并在宿主日志里记一条警告。

---

## 架构

```
prompt-studio/
├── package.json          dsh.bundle.patch + dsh.client(platform: web)
├── cordis.patch.yml      插入 Host 行 id: prompt-studio
├── index.js              Host 半区：配置持久化、模型改写、agent/pre-step
├── client.js             浏览器半区：输入框控件 + 设置页（window.__ModuleLoader__）
├── locale/{zh,en}.json   插件卡片的标题与说明
├── icon.svg
└── test/smoke.mjs        Host 半区冒烟测试
```

### 路由（同源；写请求额外要求 `application/json`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/plugins/dsh-prompt-studio/config.json` | 当前配置文档 |
| PUT | `/plugins/dsh-prompt-studio/config.json` | 校验并落盘 |
| GET | `/plugins/dsh-prompt-studio/defaults.json` | 内置风格与默认框架（供「恢复默认」使用） |
| GET | `/plugins/dsh-prompt-studio/models.json` | 当前可用模型（按 provider 分组）＋部署默认；`?fresh=1` 跳过缓存 |
| POST | `/plugins/dsh-prompt-studio/optimize` | `{ text, styleId?, extra?, sessionId? }` → `{ ok, text, ... }` |

每个路由先问 `ctx.connection.requestRejection(req)`，再用同源 / `Sec-Fetch-Site` / `Origin` 栅栏兜一层。

### 优化模型从哪里来

设置页的「优化模型」下拉有**两个数据源，按顺序尝试**：

1. **`ctx.remote.session.modelCatalog()`** —— 应用自己的、已鉴权的客户端可调用目录，也就是输入框那个模型选择器读的同一份数据。首选它，因为它是现成的，不需要额外宿主路由；
2. 本插件的 `GET /models.json` —— 走 `ctx.llm.listProviders()` + `listModels()`，供远程命名空间不可用的组合兜底。

两个来源都归一化成同一种形状，某个 provider 列不出来时只记下它自己的失败，不会把整个下拉清空（这与宿主 `buildModelCatalog` 的口径一致）。两个来源都拿不到时才退回手填 Provider / Model。

`modelCatalog()` 顺带返回 `default`，所以「跟随当前默认模型」那项能直接显示成 `deepseek-account / deepseek-flash`。已保存但目录里已经没有的模型会作为额外一项保留，不会静默改掉用户的选择。

### 数据

配置存在 `$DSH_HOME/prompt-studio/config.json`（原子写：临时文件 + rename）。**刻意不放在包目录里**——npm / 插件升级会整体替换包目录，写在那里每次升级都会丢。文档读取带 2 秒缓存，保存直接写穿缓存，所以自动优化不会每一步都读盘。

### 项目上下文（优化时自动读取，界面无感）

优化时会把**本项目已有对话**作为参考材料塞进改写请求。用户全程看不到任何中间细节，只有结果。

**前提已核实**（不是假设）：

| 能力 | 读数来源 | 结论 |
| --- | --- | --- |
| 当前会话的对话 | `session.deriveMessages()` | 模型可见历史，官方推荐读取器（`snapshotEvents()` 已废弃，禁止新代码使用） |
| 同项目其他会话 | `sessionQuery.filterSessions([{kind:'cwd'}])` + `readSurface(id)` | 以 `header.cwd` 界定「本项目」 |

`_recon/probe-real-session.mjs` 会构造一个**真实的** `dsh-session` 实例、append 真实事件，再把插件的
`sessionHistory()` 跑在 `deriveMessages()` 的真实输出上 —— 契约不是靠猜的。

**取什么**（见 `CONTEXT_LIMITS`）：本次会话最近 10 条、单条最多 1200 字、整块 6000 字；
同项目另外最多 3 个会话、每个最多 400 字。

**过滤规则**：只要 `user` / `assistant`；丢掉 system 提示、工具结果、以及 `source.kind !== 'user'`
的注入上下文（那些不是人说的话）；**丢掉草稿本身** —— 自动优化时草稿就是最后一条 user 消息，
重复它只会浪费预算。

**怎么进入**：作为请求 user turn 里一个带硬规则的 `【参考上下文】` 段落，**不动用户可编辑的基底提示词**：

```
- 优先用它把草稿里说不清的地方补成确定的要求；
- 不得据它新增草稿没有提出的要求，也不得引入它之外的事实；
- 它与草稿冲突时，以草稿为准。
```

**降级**：读不到会话 / 没有 `sessionQuery` / 项目里没有其它会话 —— 一律静默走**无上下文的老路径**，
请求与加这个功能之前**逐字节一致**（有测试盯着）。单个会话读失败只跳过它，不影响其它。
会话检索按 cwd 缓存 60 秒；`forgetProjectHistory()` 可清。

**为什么取这些值不做成设置项**：需求要求「只控制开关，不改变既有逻辑」。边界值仍是常量，改就改代码。

**开关**：`settings.injectContext`，**默认开启**，全局生效（和 `autoOptimize` 一样属于配置文档的
`settings`，不是按会话）。

**界面开关**：在**输入框右侧「✦ 优化」按钮弹出的优化面板**里，紧随「发送前自动优化」之下，
标题「参考本项目对话」（`client.js` 的 `ComposerTools`，绑定 `settings.injectContext`）。
开关与「发送前自动优化」共用同一个 `patchSettings()` 写盘路径：乐观更新 → `PUT /config.json`
→ 用宿主返回的文档对齐；写失败则回滚到上一份文档，所以界面状态不会和文件里的值跑偏。

```sh
node scripts/toggle-context.mjs status   # 看当前状态
node scripts/toggle-context.mjs off      # 关
node scripts/toggle-context.mjs on       # 开
```

**界面开关与脚本是同一个字段、同一条优先级**：两者都只是读写 `config.json` 的
`settings.injectContext`，没有先后或覆盖关系，谁后写以谁为准；脚本的 `status` 与界面显示必然一致
（脚本读的就是宿主 `loadDocument()` 读的那份文档）。

这个设置**不用重启**：宿主每 2 秒重读配置文档，改完 2 秒内生效（和代码改动不一样）。
也可以直接改 `$DSH_HOME/prompt-studio/config.json` 里的 `settings.injectContext`。

**关闭时是彻底跳过**，不是读完再过滤：不查会话、不扫项目，请求逐字节回到加这个功能之前。

开关读在 `optimizePrompt()` 里那**唯一一处**（`if (settings.injectContext) { ... }`）；手动 `POST /optimize`
与自动 `agent/pre-step` 共用这一处，所以一个设置同时管住两条路径。

**以后想加到设置页也不冲突**：客户端的 `patch()` 是整体深拷贝（`clone(current)` → PUT 整份文档），
`settings` 里的未知字段会被原样带回，不会被保存动作抹掉。

### 模型解析顺序

1. 调用方显式给的路由（自动优化时取 `agent.session.requestHeader().config`）；
2. 设置页里填写的 Provider / Model；
3. 该会话已提交的路由（`ctx.agents.get(sessionId).session.requestHeader().config`）；
4. `ctx.agentDefaultModel.currentSelection()`。

**每一档都必须把 `reasoningEffort` 一起带过来**，这不是可选项：一个「始终思考」的模型收到关掉思考的
请求会直接 `400 / 1210 — This model always engages in thinking and cannot be disabled`，而
**省略 effort 就会被适配器编码成「关掉思考」**。所以：

- 会话路由与部署默认都从各自的 config 里原样带上 effort；
- 只有设置页手填 Provider / Model 时没有 effort，此时问适配器要该模型自己的默认值
  （`llm.resolveModelInfo().reasoning.defaultEffort`，没有默认就用第一个档），适配器答不出来才不带。
  这条兜底是为了让「thinking-only 模型 + 手填模型」也能跑通，而不是靠猜一个档位。

诊断用：`POST /optimize` 的返回里带 `reasoningEffort`（没用到时为 `null`）。

### 消息识别

自动优化只改**真人从界面发出的**消息：`role === 'user'` 且 `source.kind === 'user'` 且 `source.rpcId` 是字符串。`agent.inject()` 注入的上下文、子代理消息、工具结果都不会被改写；`/` 开头的命令走宿主原有命令通道。已改写过的消息 id 记在集合里，同一步重入不会重复调用模型。

---

## 发布

安装方式见顶部「安装」。发版的完整流程（仓库要满足的条件、四条命令、GitHub Release 怎么建、
出问题怎么排查）在 [RELEASE.md](./RELEASE.md)，这里只说结论：

- 包内**没有 `dependencies`、没有构建步骤**：`npm publish` 出来的就是可运行的源码。
- 发布闸门是一条命令：`node scripts/check-package.mjs`。它会校验 `package.json` 元数据、
  `dsh` 声明、`exports` 契约、**入口 id 三处一致**（patch ↔ `index.js` ↔ `client.js`）、
  README 里的版本号与站内锚点、`npm pack` 产物是否齐全，并跑完三个测试。
- 发版：`node scripts/release.mjs --bump patch --apply --push`（不加 `--apply` 是预演）。
- **本包尚未发布到 npm。** 想发的话直接 `npm publish --access public` 即可，
  发上去之后安装规格可以简化成 `dsh-prompt-studio@1.0.0`。

## 开发

```sh
node --check index.js        # Host 半区语法
node --check client.js       # 浏览器半区语法
node test/smoke.mjs          # 宿主：文档归一化、持久化、路由栅栏、模型调用、自动优化折叠
node test/client-smoke.mjs   # 浏览器：真实激活 + 组件渲染 + 样式表自检
node test/quality.mjs        # 改写质量：自定义框架、占位符替换、长草稿去重、截断处理
node scripts/check-package.mjs   # 发布自检：包结构 + 入口 id 契约 + README + 上面三个测试
node scripts/sync-builtins.mjs   # 把改动后的内置风格 / 框架推进运行中的配置
```

`check-package.mjs` 是**发布闸门**：CI 跑它，`release.mjs` 发版前也跑它。
它把上面三个测试一起跑了，所以本地只跑这一条就够。

`sync-builtins.mjs` 先走宿主配置路由；路由是同源鉴权的，终端里直接请求会 401，所以它自动
回退成直接写 `$DSH_HOME/prompt-studio/config.json`（用本包自己的 `saveDocument`）。加 `--file`
可强制走文件路径。两种路径都是幂等的，且只按 id 覆盖内置风格、保留你自建的风格。

`test/client-smoke.mjs` 用一个极小的 React 桩和 `__ModuleLoader__` 桩把 `client.js` 真正跑起来：
按真实顺序调用 `apply()`、等宿主配置落进插件的 store、再递归渲染两个组件，覆盖抽屉展开、
风格库折叠/展开、空风格库、保存中报错等分支；同时检查每个类名都有对应样式规则、
圆形控件退出了全局超椭圆、边框是 .5px、保存按钮用的是宿主 settings-form 的配色配方，
以及样式表里没有硬编码颜色。没有浏览器也能挡住「插槽被组件异常清空」这类问题。

### 设计基线（改样式前先看一眼）

界面不是凭感觉调的，三条来源：

| 来源 | 取了什么 |
| --- | --- |
| 平台令牌 | `--dsw-alias-*`、`--dsw-radius-*`；**暗色下 `--dsw-alias-brand-primary` 是近白色**，所以主按钮不能写 `color:#fff` |
| 宿主 primitives 的 CSS | `Button` / `Input` / `Switch` / `settings-form` 的逐条声明：.5px 描边、`bg-layer-3` 输入框、`label-tertiary` 辅助文字、`aria-checked` 驱动开关外观 |
| 同宿主已装插件的设置页 | 版式：面板底色上按 .5px 发丝线分组的「组」，不加卡片盒子、不做 sticky 栏、页面 `max-width: 760px` |

另外平台对**所有元素**套了 `corner-shape: superellipse(1.5)`；圆形和胶囊控件必须显式
`corner-shape: round` 退出，否则开关圆点会变成超椭圆方块（宿主自己的 Switch / Pill 就是这么做的）。

### 图标规范

| 类别 | 做法 |
| --- | --- |
| 界面内所有控件图标 | `Glyph` 组件：16 视图框、`fill="none"`、`stroke="currentColor"`、`.5px` 级线宽的圆头线条，透明度镂空无填充。用 `currentColor` 所以跟随主题 —— 浅色主题下就是黑线，暗色主题下自动变浅，不会消失 |
| 输入框「优化」按钮 | 唯一彩色项：`StarIcon` 四角星，蓝→紫渐变填充 + 描边，外层 `scale` 呼吸、内层 9s 匀速旋转；`prefers-reduced-motion: reduce` 时两个动画都停 |
| 每个风格的图标 | **黑边线条七件套**（见下），按语义一对一替换了原来的 emoji；字段本身仍接受任意 emoji，自定义值原样渲染 |

#### 黑边线条七件套（`icons/`）

图标几何取自一份**外部基准线稿**（原作者提供的 7 枚黑边线条图标 HTML），此处按几何 1:1 复刻；复刻结果由 `scripts/verify-against-reference.mjs <基准文件>` 校验。

| 序号 | 名称 | 文件 | 对应风格 |
| --- | --- | --- | --- |
| 1 | 星芒 | `icons/sparkle.svg` | 轻润色 |
| 2 | 砖墙 | `icons/brick.svg` | 结构化需求 |
| 3 | 打开的书 | `icons/book.svg` | 步骤规划 |
| 4 | 学士帽 | `icons/cap.svg` | 领域专家 |
| 5 | 调色盘 | `icons/palette.svg` | 视觉风格增强 |
| 6 | 勾选 | `icons/check.svg` | 验收标准 |
| 7 | 锤子 | `icons/hammer.svg` | 硬邦邦 |

- **几何 1:1 照搬基准**：56 单元格、`fill="none"`、2 单位圆头描边；`scripts/verify-against-reference.mjs`
  会逐条比对 `d` / `rect` / `circle` / `transform`，基准改动而这边没跟上就会报错。
- **唯一偏离是描边颜色**：文件里保持基准的固定 `#1f2328`（适合浅色底），插件内渲染时把同一份几何绑到
  `currentColor`，否则暗色主题下纯黑会消失。
- **单一数据源**：几何只写在 `client.js` 的 `BASE_GLYPHS` / `SOURCE_GLYPHS` 里，`scripts/emit-icons.mjs`
  由它生成全部 `.svg` 和 `icons/preview.html`；测试会比对代码与文件，防止两边漂移。
- **老数据自动升级**：风格里存的旧 emoji（✨🧱🗺️🎓🎨✅🔨）在渲染时映射到对应线稿，不需要改配置文档。

#### 提示词风格图标 28 枚（`icons/` 共 35 枚）

图标几何取自一份**外部线稿集**（28 枚提示词风格图标 HTML），按其自带四组、原顺序全部纳入；由 `scripts/verify-icon-source.mjs <来源文件>` 校验。

| 分组 | 枚数 | key |
| --- | --- | --- |
| 基础（原有七件套） | 7 | `sparkle` `brick` `book` `cap` `palette` `check` `hammer` |
| 表达结构 | 7 | `structure` `template` `checklist` `steps` `dialogue` `roleplay` `narrative` |
| 语气风格 | 7 | `academic` `artistic` `concise` `vivid` `formal` `casual` `persuasive` |
| 推理技巧 | 7 | `chain-of-thought` `few-shot` `self-check` `analogy` `meta-prompt` `prompt-chain` `brainstorm` |
| 输出控制 | 7 | `format` `length` `citation` `code` `table` `image` `multilingual` |

- 来源里 `pc1` / `pc7` / `pc8` / `pc9` 画的正是基础七件套里的砖墙 / 书 / 学士帽 / 调色盘，
  所以这 4 个 key **共用同一份几何**（改基础那个会同时改到它们 —— 源文件本来就画得一模一样）。
- 图标库按分组展示、带搜索框：可按中文名、英文 key 或分组名过滤，无结果时给出提示而不是空一块。
- **默认收起成一行（7 枚），点「展开全部 35 枚」才展开**，再点「收起」还原：
  - 收起态没有搜索框、没有分组标题，只占一行；展开态才出现搜索框 + 五个分组，并套上
    `max-height: 288px` 的滚动区，不会把编辑区撑长。
  - 收起行**一定包含当前选中的那枚**（选中的来自基础组之外时它排在最前），所以选择永远不会被
    提供选择的控件藏起来；选择本身是上游传入的 prop，收起/展开不会动它。
  - 展开状态是组件内状态，不落盘、不进配置 —— 打开编辑器时总是收起的紧凑形态。
- **`icon` 字段的边界规则只在一个地方**：`index.js` 的 `normalizeIcon()`。它放行整段 key（`palette` 这类
  小写词）、把旧的两位截断（`sp`/`br`/…）修回原 key，其余内容才按 emoji 截到两个码点。
  **不要在别处再截这个字段** —— 曾经的 `[...].slice(0, 2)` 把 `sparkle` 存成了 `sp`，
  界面上就显示成两个字母，这正是「选中图标后变字母缩写」那个 bug 的根因。
- key 全部满足宿主的 `^[a-z][a-z0-9_-]{0,23}$`（最长 `chain-of-thought` 16 字符），带连字符的 key
  在表里加引号。
- 两位前缀还原**只认白名单** `LEGACY_ICON_KEYS`，不再按前缀猜：35 枚里 `ca` 同时是 `cap` 和 `casual`
  的开头，靠猜会认错。

```sh
node scripts/emit-icons.mjs                                  # 由代码重新生成全部 svg + 预览页
node scripts/verify-against-reference.mjs "<七件套基准路径>"   # 基础 7 枚与基准逐条比对
node scripts/verify-icon-source.mjs "<28 枚来源路径>"          # 新增 28 枚与来源逐条比对
```

插件卡片图标 `icon.svg` 是个例外，而且**不能**用 `currentColor`：宿主 `dsh-client-ui-plugin-manager`
的 `PackageArtwork` 是用 `<img src>` 渲染清单图标的，那是个隔离文档，读不到页面的
`currentColor`；而文件内部的 `prefers-color-scheme` 跟的是**操作系统**配色，不是应用的
`data-ds-dark-theme`。这台机器 OS 浅色 + 应用暗色，纯黑描边在卡片上必然隐形，所以卡片图标
用了一个两种底色都读得出来的中性墨色 `#7d858f`，依然是透明、镂空、无填充、纯线条。
官方 bundle（voice-input）同样因为这个原因用的是固定渐变填充。

### 不要在 `apply()` 里碰可选服务（已踩过的坑）

客户端 `apply()` 里**一次** `ctx.get('remote')`，加上随后访问 `remote.session`，就足以让整个客户端
条目激活失败。宿主启动时报：

```
web boot: 1 entry did not activate
dsh-prompt-studio: failed
```

插件 UI 会整个消失（插槽 occupant 变空），设置页也进不去。日志在
`%APPDATA%\@deepseek-ai\dsh-desktop\logs\crash-*-web-boot.log`；用 `cordis_inspect_query`
看 `conversation.input.right` 的 `occupants` 是不是空的，可以立刻确认。

原因是 `ctx.get(name)` 和 `ctx[name]` 对**未挂载的服务会抛异常**，而激活期的异常会让整个条目失败。
所以：

- 可选服务一律走 `optionalService(ctx, name)`（内部两层 try/catch），**并且延迟到真正用到时再取**，不要放在 `apply` 里；
- `ctx.remote.session` 这类命名空间属性也要包在 try/catch 里（远程命名空间可能还在挂载）；
- `dsh.client.inject` 里补上 `@deepseek-ai/dsh-api-remotes`，让远程命名空间先就位；
- `test/client-smoke.mjs` 里有一条「敌意上下文」回归测试：服务查询全部抛异常、`locale`/`remote`
  都不存在时，`apply` 仍必须成功注册两个插槽、加载配置、并渲染出页面。

### 样式表：一个自持的 `<head>` 标签，谁都不许动（已踩过两次的坑）

CSS **不能**挂在任何会被拆掉的东西上，否则表现是「组件还在渲染、但整个 UI 变成浏览器默认控件」——
优化按钮变成带边框的方框、面板在文档流里竖排。这个坑踩了两次：

| 投递方式 | 为什么会丢 |
| --- | --- |
| `h('style', …)` 当 React 子节点 | 样式表是插槽子树里的一个普通节点，宿主一重渲染那棵子树（**重载任何其它客户端插件就足以触发**）就会把它移除再插回 |
| `styles.insert(css)`（运行器的按包接缝） | 它的标签登记在 `DynamicCordisStyles.tags` 里，包一卸载 `dispose()` 就把它们**全部移除** —— 于是 UI 还挂着、样式已经没了 |

现在的做法：**一个按 id 幂等、且我们自己从不移除的 `<head>` 标签**。

```js
const STYLE_ID = 'dsh-prompt-studio-style';
function installStylesheet() {
  const doc = globalThis.document;
  if (doc === null || doc.head === null || typeof doc.createElement !== 'function') return;
  if (doc.getElementById(STYLE_ID) !== null) return;   // 幂等：重复激活不会叠第二份
  const tag = doc.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  doc.head.append(tag);                                 // 不登记、不返回 disposer
}
```

**「从不移除」是刻意的**：漏掉样式会让整个界面不可用，而卸载后残留一份 `dsh-ps-` 前缀的样式表是完全无害的
（纯新增、命名空间隔离）。刷新页面自然清掉。

控制台里确认：

```js
document.getElementById('dsh-prompt-studio-style')   // 应当存在，且 <head> 里只有一份
```

回归测试盯着六条：激活时恰好插入一份、插的确实是本插件样式表、带稳定 id、**重复激活不叠加**、
代码里**没有任何移除路径**（`tag.remove()` / `styles.insert` / `StyleTag` 都不许出现）、
以及没有任何地方再把样式表当 React 子节点渲染。（断言会先剥掉注释再匹配 —— 注释里写了这些被否决的做法，散文不该让检查通过。）
### 改了代码之后什么时候生效

| 改动 | 生效方式 |
| --- | --- |
| `client.js` | 客户端模块 HMR，刷新页面即可 |
| 内置风格、默认框架（`index.js` 里的 `BUILTIN_STYLES` / `DEFAULT_BASE_PROMPT`） | **重启应用**加载新的模块代次；不想重启就用 `scripts/sync-builtins.mjs` 走配置通道立即生效 |
| `index.js` 的其它逻辑（路由、`agent/pre-step`） | **必须重启应用**，第三方插件的宿主模块不会热加载新的 JavaScript 代次 |

`scripts/sync-builtins.mjs` 按 id 覆盖内置风格、保留用户自建的风格，并且只在框架文本仍是默认值时才替换它 —— 所以它不会覆盖你在设置页里改过的东西。

浏览器半区只 `require('react')`（平台模块表里的那一份），不引入任何 Harness 客户端包，样式只用 `--dsw-alias-*` 主题令牌，因此跟随明暗主题，也不会因为内部 API 变动而炸掉插槽。

### 已知边界

- 自动优化会为每一次发送多调用一次模型（用量计入宿主监控）；关闭开关即恢复原状。
- 输入框入口与撤销状态存在浏览器本地，换浏览器不跟随；风格库与开关存在宿主，跟着 profile 走。
- 优化只处理当前草稿，不读取附件与历史。
