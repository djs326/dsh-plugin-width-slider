# dsh-plugin-width-slider 整仓重构计划（待评审）

> 状态：**待评审**。分支 `feat/motion-settings-followup`（基点 `823a98a`），工作树干净。
> 本文件只描述方案，**未改动任何代码**。四路并行调研（client 平铺模块 / workspaceTabs / 动效子系统 / host 与构建链）已全部返回，结论已并入本文件。
> 所有结论均带 `相对路径:行号`，行号为调研时的实测值。

---

## 0. 目标与边界

**目标**：在不改变任何对外行为的前提下，把仓库整理成"分层清晰、模块边界明确、命名与文件组织一致、能被测试网覆盖"的结构。

**这不是什么**：不是功能迭代，不是视觉调整，不是依赖升级。判断标准只有一条——**重构前后，用户能观察到的行为逐条相同**。

**硬边界（重构过程中一律不动）**：

1. **对外契约**：包名、`exports` 三条路径、`main`/`types` 指向、`lib/` 产物名、`cordis.patch.yml` 的 id/name、`dsh.engines.dsh`、`files` 白名单（详见第 8 节）。
2. **运行期契约**：`/api/width-slider` 端点与 5 个 method 名、slot id、`data-*` 属性名、CSS 类名前缀 `dsu-*` / `dsws-*`、CSS 变量名、localStorage 键、`$DSH_HOME` 下的文件路径与 JSON 形状、prompt section 名 `dsh-width-slider-think-zh`。
3. **可观察行为**：动效帧表数值、缓动曲线、时长、缩放幅度；设置弹窗锚点三级优先与夹取；页签分组语义；会话删除链；宽度滑块手感。
4. **构建链**：`tsdown`、`tsconfig`、`vitest` 的版本与产物布局不变（内部配置可整理，产物必须逐字节等价或逐条核对差异）。
5. **不动** `dsh-src/`（上游参考源码）、`docs/` 下的既有上游文档。

---

## 1. 现状实测

### 1.1 规模

| 项目 | 实测值 |
|---|---|
| 源文件 | `src/` 26 个文件、7686 行 |
| 测试 | `test/` 22 个文件、3151 行 |
| 最大文件 | `workspaceTabs.tsx` 1690、`motion.ts` 740、`WidthSliderControl.tsx` 655、`settingsPanelPatch.ts` 635、`WidthSliderSettings.tsx` 523 |
| 依赖枢纽 | `src/client/index.ts`（15 个本地依赖）、`src/shared/settings.ts`（host/client 双侧） |
| 分层现状 | host → shared ← client 方向干净，**无循环依赖**（已实测 DAG） |
| 类型逃逸 | `as never` / `as unknown as` 共 13 处 |
| 最大函数 | `WidthSliderControl.tsx:135` 521 行、`motion.ts:383` 358 行、`workspaceTabs.tsx:1169` 338 行 |

**行数实测与旧文档的偏差**（README 结构树与任务描述全部偏低，重构时以本表为准）：

| 文件 | 旧文档 | 实测 |
|---|---|---|
| `src/client/index.ts` | 353 | **385** |
| `src/client/settingsPanelPatch.ts` | 589 | **635** |
| `src/client/sessionDelete.ts` | 436 | **468** |
| `src/client/sidebarToolsMerge.ts` | 347 | **371** |
| `src/client/WidthSliderControl.tsx` | 613 | **655** |
| `src/client/WidthSliderSettings.tsx` | 477 | **523** |
| `src/client/widthPrefs.ts` | 157 | **174** |
| `src/client/motion/motion.ts` | 699 | **740** |
| `src/client/motion/settingsMotion.ts` | 414 | **442** |
| `src/client/motion/animate.ts` | — | **238** |
| `src/shared/settings.ts` | 99 | **103** |
| `src/shared/motionSettings.ts` | — | **161** |
| `src/index.ts`（host） | 240 | **262** |
| `src/client/workspaceTabs.tsx` | — | **1690**（全仓最大） |

另外：`src/client/` 根目录实际是 **14 个文件**；`src/shared/` 是 3 个文件（含常被漏列的 `motionSettings.ts`）。

### 1.2 无测试覆盖的源码

| 文件 | 现状 |
|---|---|
| `src/client/index.ts`（385 行） | **零覆盖**，含 `apply`/`sync`/全部 `install*` 装配逻辑 |
| `src/client/motion/styles.ts` | 仅导出 `MOTION_CSS` 字符串，被 `src/client/index.ts:32` 引用 |
| `src/client/endpointChannel.ts` | 仅在 `test/workspaceTabsDialogs.test.ts:29` 被 `vi.mock` 桩掉，真实实现无测试 |
| `src/client/primitives.ts` | 仅在 `test/sessionDelete.test.ts:11` 与 `test/workspaceTabsDialogs.test.ts:50-51` 被 `vi.mock` |
| `src/index.ts`（host） | 仅间接覆盖（`test/hostEndpoints.test.ts` 用伪 cordis ctx 驱动） |

`workspaceTabs.tsx` 虽有 357 行测试，但只覆盖入口两个符号（`test/workspaceTabsDialogs.test.ts:55/124-129`），**作用域过滤、header 定位、菜单注入、包裹时序四块零覆盖**。

### 1.3 构建链现状

- `tsdown.config.ts` 分两段：host 段产 `lib/index.mjs`（ESM）、client 段产 `lib/client.js`（CJS + `.map`）。
- `dts: false`，类型由单独的 `tsc`（`tsconfig.json:12-13`，`declaration` + `emitDeclarationOnly`，`outDir: lib/types`）产出。
- 两个 config 都设 `clean: false`（避免后跑的 client 段抹掉 host 产物）。
- 无 CSS 管线（官方有 lightningcss 三虚拟模块），本仓样式为内联 TS 字符串。

---

## 2. 问题清单

### P1 · 文件承担多职责（拆分的首要目标）

| 文件 | 混装内容 |
|---|---|
| `src/client/workspaceTabs.tsx`（1690） | 9 块：契约注释与常量、分组持久化 store、作用域过滤、官方 header 定位、工作区行菜单注入、归属写入原语、页签栏 UI、四个对话框 + 分配选择器、壳与 install |
| `src/client/motion/motion.ts`（740） | 5 类：宿主 DOM 契约、角色策略、帧表与时长、批次时序调度、观察器生命周期 |
| `src/client/index.ts`（385） | 全部功能编排 + 4 个内联大函数（`installWidthFeature` `:62-86`、`installThinkRenderer` `:89-126`、`motionStateOf` `:128-171`、`installMotionFeature` `:180-241`）+ RPC 读写封装 |
| `src/client/settingsPanelPatch.ts`（635） | 弹窗探测、导航滚动补丁（`:76-172`）、尺寸调整补丁（`:177-635`）、面板几何记忆 |
| `src/client/WidthSliderSettings.tsx`（523） | 页面 + 全部 `.dsws-` CSS（`:68-161`）+ 小组件（`Group`/`SwitchItem`/`Segmented`，`:176-198`）三合一 |
| `src/client/WidthSliderControl.tsx`（655） | 内联宽度滑块 + 指针手势 + 键盘 + 甩动惯性 + 全屏预览 portal + 跟随模式 |
| `src/index.ts`（host，262） | 文件 IO、损坏保留现场、中文 prompt 控制器、5 个端点处理内联在一个 108 行的 `apply` 里（`:155-262`） |

### P2 · 同一算法多份实现（改一处必漏另一处）

**rAF 节流 + MutationObserver 写了 6 遍**：`settingsPanelPatch.ts:101-117`、`sessionDelete.ts:446-455`、`sidebarToolsMerge.ts:186-192`、`widthPrefs.ts:95-107`、**`widthPrefs.ts:144-159`（原清单遗漏，批次④ 实测补上）**、`WidthSliderControl.tsx:452-463`。**批次④ 已统一这 6 处并新建 `core/domObserver.ts`**；另外 5 处（`conversation.ts` 两处、`sidebarToolsMerge.ts` 两处、`settingsMotion.ts` 三处）经逐条核对语义不同——不做 rAF 合并、观察目标非 body、或需消费 `mutations` 列表——**保留原样**，理由写在 `domObserver.ts` 头注释里。

**四个 DOM 补丁模块共 3164 行，零共享抽象**——共享同一套模式（探测官方 DOM → 注入/克隆 → Observer + rAF 节流），却各自手写一遍。

其余重复：

- 菜单项克隆注入：`workspaceTabs.tsx:558-615` 与 `sessionDelete.ts:340-402` 完全同构。
- 「唯一归属」写操作三份：`workspaceTabs.tsx:618-630`、`:1049-1064`、`:1306-1312`。
- 弹窗结构假设四份：`settingsMotion.ts:37/192-195/211-214` 与 `settingsPanelPatch.ts:38/75-79/85-92/416-423`。
- 文件读写同构两份：`src/index.ts:60-84`（分组）与 `:89-115`（设置）。
- 跟随 watcher 两份：`widthPrefs.ts:83-114` 与 `WidthSliderControl.tsx:434-471`。
- inline 样式四份（`workspaceTabs.tsx:595-604/649-683/816-850/918-941`）、hover 改 `style.background` 四处、文案函数 `tt`(`:161-167`)/`ttw`(`:514-520`) 两份、过滤缓存两份（`:400-422`/`:424-440`）、`SwitchItem` 结构两份（`WidthSliderSettings.tsx:176-198` vs `WidthSliderControl.tsx:602-616`）。
- **i18n 双通道**：`locales.ts` 走官方 locale；`sessionDelete.ts:48-68` 与 `workspaceTabs.tsx:132-167` 各自建 `T` 表 + `tt()`。
- `Disposer` 类型两份：`client/index.ts:44` 与 `widthPrefs.ts:25`。
- 端点协议镜像两份：`host/endpointChannel.ts`（注册）与 `client/endpointChannel.ts`（调用）互不 import，靠字面量对齐。
- 最小 ctx 接口三份互不兼容：`sessionDelete.ts:23-30`（`SessCtx`）、`workspaceTabs.tsx`（`WsTabsCtx`）、`client/index.ts:259-265`（已废弃的 `RpcClientContext`）。

### P3 · 契约与常量散落

- **中文文案参与逻辑判定**：`workspaceTabs.tsx:611` 用 `text === '删除工作区' || text === 'Delete workspace'` 决定菜单项插入位置。
- **`data-ws-assign-item`**（`workspaceTabs.tsx:572`）**全仓无写入方**，是 `assignSession.ts` 删除后的死契约。
- **`[data-phase]` 在 11 处硬编码**：`widthPrefs.ts:46,62,87,94,98,138,143,149`、`WidthSliderControl.tsx:442,449,455`、`index.ts:81`。同属官方 DOM 契约的 `--dsh-chat-user-width`、`--dsh-conversation-column-width`、`data-width-handle`、`data-session-delete-*`、`.dsws-*` 同样无单一声明点。
- **localStorage 键硬编码**：`WidthSliderSettings.tsx:283-284` 直接写字面量，不用 `widthPrefs.ts:20-21` 的常量。
- **`'auto-collapse'` 字面量**：`shared/settings.ts:26,93` 定义，`WidthSliderSettings.tsx:406` 再判一次。
- **同一仓库两套相反策略**：`settingsPanelPatch.ts:1-31` 明确「类名 hash 不稳定，一律按语义锚点探测」；`sidebarToolsMerge.ts:40-50` 却整排用 hash 类名前缀（`[class*="_newSession"]`、`[class*="_headerActions"]`…）。
- **`data-session-delete-item` vs `data-session-delete-slotitem`**（`sessionDelete.ts:36-42`）：注释记录了复用会导致兜底清理误删槽项的线上回归。
- 时序魔数：fiber 深度 32（`workspaceTabs.tsx:542`）、header 扫描深度 4（`:476`）、轮询 400ms（`:1358`）、包裹重试 300ms（`:1653`）、zIndex 4100（`:897`）、菜单定位 220/180。
- **时长与曲线重复**：`320ms` 有 4 份语义（`motion.ts:254`、`settingsMotion.ts:51`、`WidthSliderSettings.tsx:343` setTimeout、`:84` CSS 300ms）；`200ms` 两份（`settingsMotion.ts:49`/`:65`）；**缓动曲线四套并存**（`animate.ts:16` EASE_GLIDE、`:18` EASE_FADE、`:32-34` EASE_SETTLE/EASE_SPRING、`styles.ts:17-21` 手写 `cubic-bezier(0.7, 0, 0.84, 0)`——既不引用 `EASE_*` 也不相等）。
- **`--dsu-motion-delay`**（`motion.ts:429` 写入）在 CSS 中无任何消费者，只有 `test/motionEngine.test.ts:113` 读它。

### P4 · `src/client/index.ts` 的结构问题

- 顶部注释（`:1-14`）只列 3 项职责，实际编排 8 个功能。
- 8 个 slot 字符串 `'handle'|'think'|'resize'|'nav'|'sessionDel'|'wsTabs'|'motion'|'toolsMerge'` 在类型联合（`:296`）、卸载数组（`:344-352`）、`sync()`（`:320-340`）里各写一遍。
- **入口替功能建 `<style>` 元素**：`:81-85`、`:89-99`、`:183-186` 都是入口建、disposer 删；而 `sidebarToolsMerge.ts:167-170` 已自己管样式，两种模式并存。
- **上游冲突探测属于 think 功能**：`:244-255`、`:289-292` 扫的是 `dsh-think-zh-expand-` 前缀样式。
- **动效状态派生属 `motion/` 适配层**：`:128-171` 把 `sessions` 快照翻译成 `MotionEngineState`。
- **`prefers-reduced-motion` 监视**（`:220-223`）用"写配置触发重渲染"绕开"引擎不该改配置"的边界，而 `motion/animate.ts:42` 已有 `prefersReducedMotion()`。
- `rpcReadSettings(ctx)`（`:267-277`）与 `rpcWriteSettings(ctx, ...)`（`:279`）的 `ctx` 参数未被使用（dead param）。
- `RpcClientContext`（`:259-265`）声明的 `connection.rpc.call` 与实际调用的 `callEndpoint('/api/width-slider', ...)` 不是同一条路径，是历史残留；且因 `ClientContext` 是 `any` 桩（`src/env.d.ts:15-17`）该类型未提供真实约束。
- 门控判定散落：`:320-340` 的 8 个 `ensureSafe` 里开关名与 `shared/settings.ts` 字段是同名不同源的两份；`wsTabs`/`toolsMerge` 写死 `true` 常驻再让模块自判。
- 配置读回（`:356-365`）放在入口，`config.ts` 只提供 store 不提供加载。
- `ledgerWarned`（`:131`）是模块级可变单例。

### P5 · 导出面过宽与类型逃逸

- `motion.ts` 导出 **15 个零生产调用、仅测试引用**的符号：`ROW_IN_CLASS`(71)、`STYLE_CLASSES`(79-81)、`styleClass`(84-86)、`RowRole`(95)、`ROLE_USER_CLASS`(98)、`ROLE_PROCESS_CLASS`(100)、`ROLE_CLASSES`(103)、`ENTRANCE_CLASSES`(110)、`roleOf`(243-247)、`STAGGER_STEP_MS`(257)、`STAGGER_CAP_MS`(259)、`staggerDelay`(283-286)、`isChatRow`(289-293)、`isTreeItem`(306-312)、`anyMotionEnabled`(344-346)。
- `widthPrefs.ts` 导出 13 个符号，其中键名常量（`WIDTH_PREF_KEY`/`FOLLOW_PREF_KEY`）与几何常量（`MIN_WIDTH`/`EDGE_BUDGET`）属内部。
- `animate.ts` 的 `canAnimate`(37-39)、`reducedFrames`(49-51)；`spring.ts` 的 5 个常量；`settingsMotion.ts` 的 5 个 class 常量(26-34) 与 `EXIT_TIMEOUT_MS`(47) 生产零引用——**而同一 DOM 契约在 `settingsPanelPatch.ts:38`/`:418-423` 另写一份字面量**。
- **类型逃逸 13 处**：`client/index.ts:108,109,113`（`props.x as never`）、`:143`、`:326,329`；`sessionDelete.ts:245`；`host/sessionDeleteService.ts:49`；`workspaceTabs.tsx:541,1459,1629,1639,1640`。另有 `sessionDelete.ts:99` `DeleteSessionDialog(): any`、`:299` `SessionDeleteMenuItem(props): any`、`primitives.ts:19` `type HostPrimitives = Record<string, any>`（整个宿主 API 面无类型）。
- 模块级可变单例 8 处：`client/index.ts:131`、`settingsPanelPatch.ts:137/289/553`、`sessionDelete.ts:74/211/289`（`menuSlotLive` 在渲染期被写）、`widthPrefs.ts:79`、`WidthSliderControl.tsx:79`、`primitives.ts:21`。

### P6 · 位置错放与隐式契约

- **反向依赖**：`motion/settingsMotion.ts:23` import `../previewState.ts`——动效引擎知道"宽度滑块预览"这一特性语义。
- **隐蔽的字符串跨界**：`motion/motion.ts:57` 的 `THINK_BODY = '.dsh-ws-think-body'` 依赖 `think/thinkView.tsx:47` 的 CSS 定义。
- `previewState.ts`（32 行）是宽度滑块特性状态，却放在 client 根。
- **`MotionEngineState`（`motion.ts:315-341`）把设置派生、开关派生、以及会话业务事实 `blank` 混装**——引擎因此知道"空白会话"这一会话账本概念（`blank` 来自 `client/index.ts:137-171` 的 `ctx.sessions.list.getSnapshot()`）。
- **`shared/dshHome.ts` 放错了**：只被 host 使用（`src/index.ts:23`、`host/sessionDeleteService.ts:18`），client 零引用；且 import `node:path`/`node:os`（`:4-5`），client 误引会污染浏览器 bundle。
- **端点协议契约（最大缺口）**：路径 `/api/width-slider` 与 5 个方法名散落在 `client/index.ts:269,280`、`client/sessionDelete.ts:88`、`client/workspaceTabs.tsx:1524`（及注释 `:21`）、`src/index.ts:209`；响应形状 `{ok,value}`/`{ok:false,error}` 只写在 `client/endpointChannel.ts:22` 的注释里。host 与 client 同时需要的纯契约，应集中为常量 + 类型。
- `sessionDelete.ts:406-425`：`ctx.get?.('sessions')` 是可选调用、缺失静默降级；`primitives()` 同样"读一次，失败则空对象"，调用方须自查（`sessionDelete.ts:410` 检查 `Modal`）。
- `settingsPanelPatch.ts:374`：87 行的 `buildResizeHandle` 内部读 `getSettings().dialogAdaptive`——把手行为依赖远在设置页的开关。
- `workspaceTabs.tsx:24-41`：一整段"官方内部结构依赖自检清单"写在注释里。
- `shared/settings.ts:81-84`：1.8.x 及更早的 8 个废弃字段"读到时一律丢弃、不做迁移"。

### P7 · 两处"必须同步改否则静默失效"（最高风险，来自 workspaceTabs 调研的 12 条）

拆分时必须成对搬运，否则编译通过、测试通过、运行时静默失效：

1. `data-session-delete-item`（`workspaceTabs.tsx:571` ↔ `sessionDelete.ts:35`）
2. `WS_TABS_MARK`（`:62` ↔ 测试 `:55/129`）与 `__dshNativeTabHost`/`__imConnectWrapped`（`:1633`）
3. `TABS_CSS`(`:76-86`) ↔ 渲染属性 `:779-780/856/872` ↔ `focusTab` 的 querySelector(`:755-756`)
4. `sanitize()` 空名兜底 `tt('new.name')`(`:188`) ↔ `RenameDialog` 草稿初值空串(`:958-960`)
5. `commitGroups` 顺序「cacheWrite → emitGroups → persistGroups」(`:302-304`) ↔ `loadGroups` 的 `groupRevision`(`:309/330`)
6. `retainAccountKeys`(`:1434-1437`) 补键 `''`/`__flat_session_order__`/全量 workspaceId ↔ 官方 view store 语义
7. `wsPhaseReady`(`:1205/1255/1282`) ↔ 官方 `phase` 语义
8. 「唯一归属」不变量 ↔ `membership` 首个出现者优先(`:1210`)
9. host payload `{ groups: snapshot }`(`:284`) ↔ `src/index.ts:234` 的 `normalizeGroups({ groups: ... })`
10. 测试重抄源码选择器（`test/workspaceTabsDialogs.test.ts:183/188/196/198`）
11. `settingsMotion.ts:47` 的 `EXIT_TIMEOUT_MS=380` ↔ `styles.ts:20-21` 的 `160ms + 280ms`
12. `motion.ts:306-312` 的 `isTreeItem` ↔ 测试 fixture `test/motionEngine.test.ts:88-101`

另有 workspaceTabs 的 12 条运行时风险（命令式改样式与恢复分散、Portal 每 400ms 重定位、`kickRender` 的两个 `queueMicrotask` 必须与 `entry.component` 赋值同批次、包裹重试三条件、`pointerdown` 的 capture 与放行规则、`useCallback` 与 WeakMap 缓存必须与壳同寿命否则 React #185 无限循环等）——已逐条记录在调研报告中，迁移时按条对照。

### P8 · 构建链 hack 与失效前提

| hack | 位置 | 现状 |
|---|---|---|
| 手抄 `PLATFORM_MODULES` 7 项 | `tsdown.config.ts:17-25` | 靠人工与官方基线对齐，**已缺 `client/store`、`ui-dockkit` 等基线项** |
| 硬编码 `HOST_EXTERNALS` | `tsdown.config.ts:30-33` | `['@deepseek-ai/cordis', /^@deepseek-ai\/dsh-/]` |
| `alwaysBundle` 取反实现"只外置白名单" | `tsdown.config.ts:64` | 官方用 `alwaysBundle: !isRequested(specifier)` + `clientExternals(id)`；本仓无 `dsh.client.external` 通道 |
| `define` 三键 | `tsdown.config.ts:66-70` | 对应官方 `:522-527` |
| 手写 ModuleLoader 包装 | `tsdown.config.ts:73-75` | banner/intro/footer 三行，对应官方 `:604-625`，**无编译期校验** |
| client 段无 `target` | `tsdown.config.ts:53-72` | 官方有 |
| `clean-lib.mjs` | `scripts/clean-lib.mjs:15` | 补 tsc 从不清理 emit 目录（1.0.2 tarball 曾带已删模块的 `.d.ts`） |
| `fix-dts-imports.mjs` | `scripts/fix-dts-imports.mjs:17-36` | 补 `allowImportingTsExtensions` 在 `.d.ts` 里留 `.ts` 说明符；**按文本正则改写，无类型感知** |

**失效前提（不需要现在处理，但要写进 README 的维护须知）**：

1. 官方基线表增项而 `PLATFORM_MODULES` 未同步 → 同一模块被打包私有，双实例/双 React。
2. 官方 loader 契约变化（`window.__ModuleLoader__.load` 形状、`factory(require)` 语义）→ 运行期才炸。
3. `tsdown`（`^0.22.14`）修改 banner/footer/intro 或 `outputOptions` 行为。
4. TypeScript 修改 `allowImportingTsExtensions` 的声明产出 → `fix-dts-imports.mjs` 正则失配。
5. 官方引入 bundle purity 校验（对未声明 external 的跨包 value import 直接抛错）→ 本仓"全内联"策略需 `dsh.client.external` 才能通过。

### P9 · 元数据与文档漂移

1. **`dsh.client.inject` 与实际注入不匹配**：manifest 只列 3 个包名（`package.json:30-34`），而 `client/index.ts:283` 声明 5 个服务名（slots/locale/connection/sessions/workspaces），后三者无对应包名条目。
2. **`@deepseek-ai/dsh-client-runtime` 完全未声明**：`client/index.ts:16` 从该包导入类型，`env.d.ts:15-17` 手写 `any` 桩，但它既不在 `peerDependencies` 也不在 `dsh.client.inject`。
3. **`keywords` 陈旧**（`package.json:53-65`）：无 session/workspace/motion/settings 相关词，而 `displayName`/`description` 已声明会话删除、工作区页签、动效。
4. **版本上限只存在于 README**：`dsh.engines.dsh: '>=0.1.5-rc.1'`（`package.json:24`）无上限，README 徽章写 `0.1.5-rc.1 ~ 0.1.7-rc.2`。
5. **README「项目结构」与实现不符**：把 `env.d.ts` 画在仓库根（实际 `src/env.d.ts`），且漏列 `previewState.ts`、`primitives.ts`、`sidebarToolsMerge.ts`。
6. **README 动效描述过期**：称「一个总闸 + 一档风格（流畅/优雅/极简），五处场景各自可开关」，实现是四档 look（soft/rise/glide/veil）。
7. **`src/host/endpointChannel.ts` 与 `src/client/endpointChannel.ts` 同名不同侧**，易误读。
8. README 由两个文件承载真相：仓库根 `README.md` 与 `package.json` 的元数据字段，二者多处不一致。

### P10 · 结构判断（决定第 3 节形状的核心结论）

真正的结构问题不是"文件太多"，而是两点：

1. **四个官方 DOM 补丁模块（3164 行）没有任何共享底座**——它们共享同一套"探测 → 注入 → 观察 → 节流"模式，却各自实现。
2. **入口承担了 5 类本该属于各功能的职责**——建 `<style>`、上游探测、动效状态派生、RPC 封装、功能开关门控。

只挪文件不解决这两点，所以第 3 节的结构要围绕"抽出共享底座"与"入口只做装配"来设计。

---

## 3. 目标结构

### 3.1 分类维度

结构按**代码与宿主的关系**分三层，这是本次重构的核心分类：

| 层 | 判据 | 版本升级时的脆弱度 |
|---|---|---|
| `features/` | 走官方**扩展点**（slot、locale、`settings.section`）接入 | 低（扩展点是稳定契约） |
| `patches/` | 直接**探测并修改官方 DOM** | 高（依赖内部结构，官方改版即坏） |
| `motion/` | 纯动效引擎，经端口注入状态 | 低（只依赖注入的端口） |

`official/` 是 `patches/` 与 `motion/` 的共同底座：**只负责"找到并描述节点"**（选择器、结构契约、几何测量），不负责决策。

### 3.2 目录树

```
src/
├── index.ts                     # host 入口：inject + apply（只装配）
├── env.d.ts
├── host/
│   ├── endpointChannel.ts       # /api 下 JSON 端点注册（保持）
│   ├── jsonFile.ts              # 原子写 + 损坏改名保留现场（合并两份同构实现）
│   ├── settingsStore.ts         # settings.json 读写与校验
│   ├── workspaceGroupsStore.ts  # workspace-groups.json 读写与 normalize
│   ├── chinesePrompt.ts         # systemPrompt.section 注入控制器
│   ├── sessionDeleteService.ts  # 会话删除链（保持）
│   ├── api.ts                   # 端点表：readSettings / writeSettings / wsGroupsRead / wsGroupsWrite / sessionDelete
│   └── dshHome.ts               # ← 从 shared/ 迁入（仅 host 使用，依赖 node:*）
├── shared/
│   ├── settings.ts              # 功能开关契约（host/client 唯一真源）
│   ├── motionSettings.ts        # 动效词表、守卫、预设（保持纯数据层）
│   ├── endpointContract.ts      # 新增：端点路径、5 个方法名、请求/响应信封类型
│   └── types.ts                 # 新增：Disposer、最小 ctx 接口
└── client/
    ├── index.ts                 # 只装配：功能表 + effect
    ├── core/                    # 与具体功能无关的基础设施
    │   ├── config.ts            # 配置 store
    │   ├── endpointChannel.ts   # /api 调用
    │   ├── features.ts          # 功能注册表（取代 8 个 slot 字符串 + ensure/ensureSafe）
    │   ├── lang.ts              # 界面语言判定
    │   ├── locales.ts           # 文案表（并入 sessionDelete / workspaceTabs 的自建表）
    │   ├── overlayState.ts      # 浮层/预览状态（中性位置，供面板与宽度特性共用）
    │   ├── primitives.ts        # 宿主 ui-primitives 取用
    │   ├── domSelectors.ts      # 批次④ 裁定不建：其内容全是宿主 DOM 契约，放 core/ 会与
    │   │                        #   official/「宿主 DOM 唯一声明处」的定位冲突（且 core 禁止
    │   │                        #   import official）。应并入 official/chatDom.ts，待后续批次
    │   └── domObserver.ts       # 已建（批次④）：rAF 节流 + MutationObserver（消掉 6 份重复）
    ├── official/                # 宿主 DOM 的唯一声明与适配
    │   ├── chatDom.ts           # 对话行/侧栏行选择器与谓词、角色读取（含 isTreeItem）
    │   ├── settingsDom.ts       # 设置弹窗外壳、掩码、导航、内容、关闭按钮、锚点几何
    │   └── menuInjection.ts     # 菜单项克隆注入（会话删除与页签共用）
    ├── features/
    │   ├── width/
    │   │   ├── WidthSliderSettings.tsx  # 设置页区块
    │   │   ├── WidthSliderControl.tsx   # 滑块渲染
    │   │   ├── gestures.ts              # ← 从 Control 抽出指针/键盘/甩动（:255-357）
    │   │   ├── previewOverlay.tsx       # ← 从 Control 抽出全屏预览 portal（:475-596）
    │   │   ├── follow.ts                # 合并 widthPrefs.ts:83-114 与 Control 434-471
    │   │   ├── widthPrefs.ts            # 偏好持久化与发布（收窄导出面）
    │   │   ├── styles.ts                # ← 从 Settings 抽出 SETTINGS_CSS（:68-161）
    │   │   └── widgets.tsx              # ← 抽出 Group / SwitchItem / Segmented
    │   └── think/
    │       └── thinkView.tsx
    ├── patches/
    │   ├── settingsPanel/
    │   │   ├── navScroll.ts             # ← settingsPanelPatch.ts:76-172
    │   │   └── dialogWindow.ts          # ← settingsPanelPatch.ts:177-635
    │   ├── sessionDelete/
    │   │   ├── index.ts                 # 安装与菜单注入（:406-468）
    │   │   └── dialog.tsx               # DeleteSessionDialog（:99-208）
    │   ├── wsTabs/
    │   │   ├── index.tsx                # 壳 + install（对外只暴露 installWorkspaceTabs 与 WS_TABS_MARK）
    │   │   ├── groupsStore.ts           # 分组数据单一真源（:169-393）
    │   │   ├── scope.ts                 # 作用域派生与引用稳定缓存（:395-451）
    │   │   ├── messages.ts              # 文案表（合并 T 与 T_WS）
    │   │   ├── TabStrip.tsx             # 页签栏 UI（:708-915）
    │   │   ├── dialogs.tsx              # 重命名/成员/删除对话框 + 分配选择器（:632-706, :917-1157）
    │   │   └── assignMenuItem.ts        # 工作区行菜单注入与事件桥（:494-630）
    │   └── sidebarToolsMerge/
    │       └── index.ts
    └── motion/
        ├── index.ts             # 收窄后的公开面
        ├── frames.ts            # 帧表与时长单一真相
        ├── stagger.ts           # 交错步长与上限
        ├── schedule.ts          # 批次计划与时间窗
        ├── spring.ts            # 弹簧手感（保持：唯一零 DOM 零 timer 模块）
        ├── waapi.ts             # 命令式动画原语（由 animate.ts 拆出）
        ├── textReveal.ts        # 文本逐行擦除（animate.ts:126-171）
        ├── shake.ts             # 抖动（animate.ts:174-238）
        ├── styles.ts            # 动效样式表（类名与 TS 常量同源）
        ├── conversation.ts      # 对话/侧栏/新对话入场引擎（原 motion.ts）
        └── settingsMotion.ts    # 设置面板动效
```

### 3.3 拆分边界说明

- `official/` 与 `patches/`：`patches/` 消费 `official/`，反之禁止。`settingsDom.ts` 同时供 `motion/settingsMotion.ts` 使用（消掉 4 份弹窗结构假设）；`chatDom.ts` 供 `motion/conversation.ts` 与 `patches/wsTabs/scope.ts` 使用。
- `client/core/domObserver.ts`：消掉 5 份 rAF 节流 + MutationObserver 重复。
- `features/width/` 拆成 8 文件的理由：`WidthSliderControl.tsx:135` 是 521 行的单函数（指针 + 键盘 + 惯性 + portal + 跟随全在里面），只挪文件无法降低复杂度。
- `patches/wsTabs/` 拆成 7 文件（保守方案 3 文件：`groupsStore` + `officialDom` + 壳）——见第 10 节待定项 2。
- **保持对外 re-export**：`client/index.ts:27` 与 `test/workspaceTabsDialogs.test.ts:55` 只 import `installWorkspaceTabs`/`WS_TABS_MARK`，拆分后仍是这两个符号，调用点不动。

---

## 4. 命名与文件组织约定

| 对象 | 约定 | 说明 |
|---|---|---|
| 目录 | 全小写单词，按层或功能域命名 | `core/`、`official/`、`features/`、`patches/`、`motion/`、`host/`、`shared/` |
| 含 React 组件的文件 | `.tsx`，PascalCase 文件名为组件名 | `TabStrip.tsx`、`WidthSliderControl.tsx` |
| 纯逻辑模块 | `.ts`，camelCase 文件名 | `groupsStore.ts`、`frames.ts` |
| 入口文件 | 目录内 `index.ts` / `index.tsx`，只做装配与 re-export | 不承载实现 |
| 导出面 | 每个模块只导出被外部真正使用的符号；内部常量一律不导出 | 用 `export type` 分离类型 |
| 类型 | 跨模块契约进 `shared/types.ts`；模块内部类型就地定义 | |
| 测试 | 文件名与被测模块同名，放 `test/` 平铺 | 沿用现状，不建 `test/` 子目录 |
| 注释 | 只写"为什么"，不写"是什么"；契约自检清单移入 `official/` 模块头 | |

---

## 5. 分层与依赖规则

1. `shared/` 只依赖自身，不得 import `host/` 或 `client/`；**不得 import `node:*`**。
2. `host/` 只向下依赖 `shared/`，不得 import `client/`。
3. `client/core/` 不得 import `official/`、`features/`、`patches/`、`motion/`。
4. `client/official/` 不得 import `features/`、`patches/`、`motion/`（只描述宿主 DOM）。
5. `client/patches/` 与 `client/features/` 可消费 `core/` 与 `official/`，彼此之间不得互相 import。
6. `client/motion/` 不得 import 任何特性目录（切断 `settingsMotion.ts → previewState.ts`），跨特性状态经端口注入。
7. 跨特性状态一律经端口注入——沿用现有 `MotionEngineOptions { getState, subscribe }`（`motion.ts:349-354`）与 `SettingsMotionOptions { enabled, subscribe }`（`settingsMotion.ts:76-81`）的注入风格，**这是本仓最好的既有设计，必须保留并推广**。
8. 新增依赖边前先问：能不能放进 `core/` 或 `official/`。

**现有边需要切断的**：
- `motion/settingsMotion.ts:23 → ../previewState.ts`：**批次④ 已切断**。实现为 `SettingsMotionOptions` 新增**必填** `isPreviewOpen: () => boolean`（`settingsMotion.ts:101`），由 `client/index.ts` 装配点注入 `core/overlayState.ts` 的 `isPreviewOpen`。命名取 `isPreviewOpen` 而非本计划原先建议的 `isInnerOverlayOpen`——后者与同文件既有的 `innerLayerOpen(panel)`（面板内 Menu / 嵌套 modal）语义撞车，而该端口替换的正是一处 `isPreviewOpen()` 调用；也未采用 `suppressEscape`，因为既有端口风格（`enabled`/`getState`/`subscribe`）都是「读状态」而非「做决策」。
- `motion/motion.ts:57` 的 `'.dsh-ws-think-body'`：**批次④ 已完成**，契约移入 `official/chatDom.ts:40` 的 `THINK_BODY_CLASS`，选择器与 `think/thinkView.tsx` 的 CSS 行、两处 `className` 三份字面量收敛为一份。

---

## 6. 迁移顺序

**原则**：每批独立一次提交，批内保持可编译、可测试；每批完成后跑完整验证（第 7 节），通过再进下一批；不积压跨批未验证的改动。

| 批次 | 内容 | 涉及文件数 | 行为变化 | 风险 |
|---|---|---|---|---|
| **1** | 建 `client/core/` 与 `shared/types.ts`、`shared/endpointContract.ts`；搬 `config.ts`、`endpointChannel.ts`、`lang.ts`、`locales.ts`、`primitives.ts`；`dshHome.ts` 迁入 `host/`；修正 import 路径 | 8 → 8 | 无 | 低 |
| **2** | `motion/` 内部拆分：抽 `frames.ts`、`stagger.ts`、`schedule.ts`；`animate.ts` 拆 `waapi.ts`/`textReveal.ts`/`shake.ts`；`motion.ts` 更名 `conversation.ts`；收窄导出面 | 7 → 12 | 无 | 中（3 个测试导入需同步） |
| **3** | 抽 `official/settingsDom.ts`：`settingsMotion.ts` 与 `patches/settingsPanel/` 改为消费同一模块；`styles.ts` 类名与 TS 常量同源；消掉 4 份弹窗结构假设与 `320ms`/`200ms` 重复 | 4 → 8 | 无 | 中 |
| **4** | 抽 `official/chatDom.ts` 与 `core/domObserver.ts`；`motion/conversation.ts`、四个补丁模块的 Observer 统一。**已做**（`patches/wsTabs/scope.ts` 当时尚不存在，留批次⑥） | 6 → 10 | 无 | 中 |
| **5** | 抽 `official/menuInjection.ts`，`patches/sessionDelete` 与 `patches/wsTabs/assignMenuItem` 共用 | 3 → 6 | 无 | 中 |
| **6** | `workspaceTabs.tsx`（1690）拆成 `patches/wsTabs/` 7 个文件 | 1 → 7 | 无 | **高（时序敏感，见 P7）** |
| **7** | `client/index.ts` 抽 `core/features.ts` 功能注册表，4 个内联大函数外移，`motionStateOf` 移入 `motion/`，清 dead param 与过期类型 | 3 → 8 | 无 | 中 |
| **8** | host 拆分：`jsonFile.ts`/`settingsStore.ts`/`workspaceGroupsStore.ts`/`chinesePrompt.ts`/`api.ts` | 1 → 7 | 无 | 低 |
| **9** | 统一命名与导出面；`shared/dshHome.ts` 迁入 `host/`；同步 README 结构树、更新日志、第三方声明 | 全仓 | 无 | 低 |

**进度**：批次① 已提交 `a241cac`（`core/` 与 `host/` 搬移，产物逐行 diff 仅 18 行注释差异，零代码差异）；批次② 已提交 `add30ca`（`motion/` 内部拆分，`lib/index.mjs` 逐行零差异）；批次③ 已提交 `e788062`（`official/settingsDom.ts` 抽取 + `settingsPanelPatch` 拆分，`lib/index.mjs` 逐行零差异）；批次④ 已提交 `281e60b`（`official/chatDom.ts` + `core/domObserver.ts`，`lib/index.mjs` 逐行零差异）。批次 9 里「`shared/dshHome.ts` 迁入 `host/`」已在批次① 一并完成。

**批次③ 的三处裁定**（记录以备复查）：① `320ms`（`frames.ts` 的 `PANEL_DURATION_MS` 对 `settingsMotion.ts` 的 `PANEL_REPLAY_MS`）与 `200ms`（`PAGE_REPLAY_MS` 对 `MASK_ENTRANCE_MS`）经核实均为**数值巧合** —— 元素、动画属性、缓动曲线全不同，**未合并**，只在各处加注释说明为何不同源；② 两份同名不同口径的 `findSettingsDialog` 合并后，宽口径改名 `findDialogWithNavRail`（严口径保留原名，它是"这是不是设置弹窗"的判定）；③ `SETTINGS_DIALOG_SELECTOR` 取带 `div` 前缀者（宿主四个 modal 实测均为 `<div role="dialog" aria-modal="true">`）—— 这是本批唯一的潜在行为面收窄，宿主若改用非 `div` 容器会让严口径静默失效。

**批次③ 新增的遗留项**：`PANEL_FRAMES` 在 `motion/frames.ts`（opacity + `translate`）与 `motion/settingsMotion.ts`（opacity + `scale 0.62`）同名不同物，留给批次⑨ 命名统一时处理；`MOTION_CSS` 全仓零测试覆盖，本批把它改为常量插值后唯一的回归网是产物比对，建议批次⑨ 前补一条字符串快照断言。

**批次④ 的两处裁定**（同样记录以备复查）：① 本计划 `:268` 的 `core/domSelectors.ts` **不建** —— 其内容全是宿主 DOM 契约，放进 `core/` 会与 `official/`「宿主 DOM 唯一声明处」的定位冲突（且 `core/` 又被禁止 import `official/`），应并入 `official/chatDom.ts`，待后续批次吸收；② 本计划第 4 批写的「四个补丁模块的 Observer 统一」名不副实 —— `patches/` 下当前只有 `navScroll.ts` 与 `dialogWindow.ts` 两个模块，实际统一的是 7 处调用点；`sessionDelete.ts`、`sidebarToolsMerge.ts`、`workspaceTabs.tsx` 仍在 `client/` 根，要等批次⑤⑥ 搬完才能一并收敛。另外 `widthPrefs.ts:144-159`（`publishSavedFixedWhenRootReady` 的一次性观察器）是本计划 `:97` 清单**遗漏的第 6 处**，批次④ 已补齐并统一。

**批次④ 新增的遗留项**：① `workspaceTabs.tsx:1532-1553` 的 `assignRaf` / `scheduleAssign` / `assignObserver` 与 `core/domObserver.ts` 的 `debouncedProbe` **完全同构**（只多一层 `setAssignObserving` 启停），批次⑥ 应直接套用、启停部分留在外层包装；② **`isPreviewOpen` 注入线零测试覆盖** —— `test/settingsMotion.test.ts` 的 harness 传 `() => false`，端口是否真接到 `core/overlayState.ts` 的 `isPreviewOpen` 既无单测也非产物比对能证，批次⑤ 起应补「预览开启（`documentElement` 带 `data-dsw-preview`）时按 Escape 应放行」用例；③ `settingsMotion.ts:286` 是全仓唯一「body 级 childList 却不做 rAF 合并」的观察器（套原语等于引入一帧延迟），已成 `domObserver` 不能一刀切的反例，理由写在该模块头注释里。

**批次 6 与 7 是风险最高、也是价值最高的两批**：前者是全仓最大文件与最密集的隐式契约，后者是入口的职责剥离。建议这两批之间留出一次完整手工验证。

**批次 9 之后**：可选补测试（第 10 节待定项 1）。

---

## 7. 验证与回归策略

### 7.1 每批必跑

```bash
npx tsc -p tsconfig.test.json --noEmit    # 类型检查
npx vitest run                            # 228 项测试
npm run build                             # tsdown + tsc d.ts
```

### 7.2 纯搬移批次（1、2、8、9）追加产物等价性检查

移动文件不改变打包结果，`lib/index.mjs` 与 `lib/client.js` 应与重构前**逐字节一致**（若仅注释中路径变化，允许差异并逐条核对）。这条检查是纯搬移批次最便宜、最强的回归网——**它能在没有任何测试覆盖的情况下发现 import 图错误**。

### 7.3 行为敏感批次（3、4、5、6、7）追加手工验证清单

1. 设置页打开/关闭的入场与退出动效（锚点三级优先与夹取、0.62 起缩放、过冲、320ms）。
2. 工作区页签：新建、重命名、成员管理、删除、拖拽排序、键盘导航、跨页签切换后其它页签顺序不丢。
3. 工作区行 ⋯ 菜单的「分配标签」与「删除会话」两项都不错位、不继承对方图标。
4. 会话删除二次确认与删除链。
5. 宽度滑块拖动惯性、按下预览、启动恢复、跟随模式。
6. 思考块展开/收起与分组过滤；中文强制开关热切换。
7. 设置弹窗的导航滚动与尺寸调整（拖拽、缩放、记忆恢复）。

### 7.4 需要同步改的测试路径

重构改路径会牵动这些测试（**不是改断言，只是改 import**）：

| 测试 | 牵动批次 |
|---|---|
| `test/settingsPanelPatch.test.ts` | 3 |
| `test/settingsMotion.test.ts` | 3 |
| `test/motionEngine.test.ts`、`test/motionRoles.test.ts` | 2、4 |
| `test/animate.test.ts`、`test/shake.test.ts`、`test/textReveal.test.ts` | 2 |
| `test/sessionDelete.test.ts` | 1、5 |
| `test/workspaceTabsDialogs.test.ts` | 1、6 |
| `test/sidebarToolsMerge.test.ts`、`test/widthSliderSettings.test.tsx`、`test/widthPrefs.test.ts`、`test/widthSliderKeyboard.test.ts` | 6、7 |
| `test/hostEndpoints.test.ts`、`test/hostEndpointChannel.test.ts`、`test/hostSessionDelete.test.ts` | 1、8 |
| `test/dshHome.test.ts` | 1、9 |

### 7.5 回归网缺口（重构放大风险的地方）

- `client/index.ts` 零覆盖 → 批次 7 只能靠手工验证与产物等价性兜底。
- `patches/wsTabs/` 的作用域过滤、header 定位、菜单注入、包裹时序零覆盖 → 批次 6 风险最高。

**建议**：在批次 6、7 之前先补几条**冒烟级**测试（作用域派生的纯函数、header 定位的纯 DOM 片段、功能注册表的开关矩阵、`domObserver` 的节流行为）。这是本计划唯一主动加测试的地方，见第 10 节待定项 1。

---

## 8. 不可破坏的对外契约（红线清单）

### 8.1 包与产物

1. **包名** `dsh-plugin-width-slider`（`package.json:2`），必须与 `cordis.patch.yml:10` 的 `name` 逐字符一致。
2. **`exports` 三条路径**：`'.'`（`:11-15`）、`'./client'`（`:16-19`）、`'./package.json'`（`:20`）；`main`（`:8`）→ `lib/index.mjs`、`types`（`:9`）→ `lib/types/index.d.ts`。
3. **`lib/` 产物布局**：`lib/index.mjs`（host ESM）、`lib/client.js`（+ `.map`）、`lib/types/**`（含 `types/client/**`、`types/host/**`、`types/shared/**`）。tsdown 的 `entryFileNames: 'client.js'`（`tsdown.config.ts:72`）与 ModuleLoader banner 内的 id 字符串（`:73`）同样是外部契约。
4. **`cordis.patch.yml`** 的 `insert` 项 id/name（`:8-10`）与 `dsh.bundle.patch` 指向（`package.json:27`）。
5. **`dsh.engines.dsh >= 0.1.5-rc.1`**（`package.json:24`）；README 声明已核对 `0.1.5-rc.1` 与 `0.1.7-rc.2`。
6. **`files` 白名单六项**（`:45-52`）；**`os: ['win32']`**（`:73-75`）；**`engines.node: '^22.11 || >=24'`**（`:71`）。

### 8.2 运行期契约（不入 manifest 但被宿主与用户数据依赖）

7. **端点**：路径 `/api/width-slider`（`src/index.ts:207`）与 5 个方法名；信封 `{ ok, value }` / `{ ok: false, error: { code } }`。
8. **存储**：`$DSH_HOME/storages/dsh-plugin-width-slider/settings.json`（`src/index.ts:30-31`）、`workspace-groups.json` 的 `{ version: 1, groups }`（`:33`、`:79-84`）、损坏文件改名 `*.corrupt-<ISO>` 保留现场（`:61-76`）。
9. **client 持久化与 DOM**：`dsh.conversation.contentWidth`、`dsh.conversation.contentWidthFollow`（`widthPrefs.ts:20-21`）、CSS 变量 `--dsh-chat-user-width`（`:60-65`）、隐藏规则 `[data-width-handle]{display:none!important}`（`client/index.ts:47-49`）、预览标记 `data-dsw-preview`（`previewState.ts:14`）。
10. **prompt section 名** `dsh-width-slider-think-zh` 与 order `-90`（`src/index.ts:168-185`）：**刻意避开上游 `dsh-think-zh`**，改名会改变与上游插件共存时的行为。
11. **`FeatureSettings` 字段集与 `mergeSettings` 白名单语义**（`shared/settings.ts:18-43`、`:86-103`）决定磁盘上已有 `settings.json` 的兼容性；1.8.x 及更早的动效场景字段一律丢弃、不迁移（`:74-85`）。

---

## 9. 明确不做的事

- 不改动效的视觉参数（帧表数值、曲线、时长、缩放幅度一律保持）。
- 不改任何对外契约与用户可见行为。
- 不升级 React、不引入新依赖、不改构建链版本、不改产物布局。
- 不为"看起来更现代"而重写实现（如把 WAAPI 换成 CSS `@starting-style`、把 `useSyncExternalStore` 换成别的状态库）——**注意：这会整体废掉 `test/motionEngine.test.ts:118-132` 那批打桩 `Element.prototype.animate` 的测试**。
- 不动 `dsh-src/`、`docs/` 下的既有上游文档。
- **不在本计划批准前改动任何源码**。
- 不做与结构无关的顺手改动（每一批只做该批的事）。

---

## 10. 待定项（需要决策）

| # | 问题 | 选项 | 我的建议 |
|---|---|---|---|
| 1 | **是否补冒烟测试** | A. 批次 6、7 前补 4~6 条冒烟测试；B. 不补，全靠手工验证 | **A**。批次 6 是全仓最大文件，无网迁移的风险远大于写几条纯函数测试的成本 |
| 2 | **`workspaceTabs.tsx` 拆几个文件** | A. 7 文件（`groupsStore`/`scope`/`messages`/`TabStrip`/`dialogs`/`assignMenuItem`/`index`）；B. 保守 3 文件（`groupsStore` + `officialDom` + 壳） | **A**，但分为两次提交：先抽 `groupsStore` 与 `scope`（纯逻辑、可测），再抽 UI |
| 3 | **`animate.ts` 是否拆三份** | A. 拆 `waapi.ts`/`textReveal.ts`/`shake.ts`；B. 保持单文件 | **A**。三个测试文件一一对应，边界天然清晰 |
| 4 | **`patches/` 命名** | A. `patches/`；B. `officialPatches/`；C. 并入 `features/` | **A**。`patches` 一词准确表达了"依赖官方内部结构、升级易坏"这一属性 |
| 5 | **`--dsu-motion-delay` 的处置** | A. 删除写入；B. 补上真正消费它的 CSS | **A**。它当前只有测试读，是纯死代码；删除属结构清理而非行为变更 |
| 6 | **构建链 hack 是否在本轮处理** | A. 不动，只在 README 补"维护须知"（5 条失效前提）；B. 同步 `PLATFORM_MODULES` 缺失项 | **A + B 的缺失项同步**：`PLATFORM_MODULES` 已缺 `client/store`/`ui-dockkit`，属真实缺陷，但同步它需要先确认当前构建产物没有双实例问题 |
| 7 | **元数据漂移是否在本轮修** | A. 全修（`dsh.client.inject`、`keywords`、README 结构树与动效描述）；B. 只修 README | **A**。P9 的 1、2 项是真实缺陷（未声明的依赖），不只是文案 |
| 8 | **版本号** | A. `2.1.0`（结构性变更）；B. `2.0.3`（无行为变更） | **B**。对用户零行为变化，按 patch 递增更诚实 |

---

## 附：调研出处

本计划的全部事实来自四路只读调研，均带 `相对路径:行号`：

| 路 | 范围 | 主要产出 |
|---|---|---|
| client 平铺模块 | `src/client/` 14 文件 + `shared/` 边界 | 职责表、跨文件 import 边、重复实现清单、目标目录建议 |
| workspaceTabs | `src/client/workspaceTabs.tsx` 1690 行 | 9 块职责、12 条静默失效契约、12 条运行时风险、拆分方案 |
| 动效子系统 | `src/client/motion/` 5 文件 + `shared/motionSettings.ts` | 依赖图、越层边、导出面清单、4 套曲线/重复帧表、层 A~E 拆分方案 |
| host 与构建链 | `src/index.ts`、`src/host/*`、`tsdown.config.ts`、`scripts/*`、`vitest.config.ts` | 双入口边界、构建链 hack 与失效前提、patch 契约、测试基建与无测试清单、8 条不可破坏契约 |

调研过程未修改任何文件（`git status --short` 为空）。
