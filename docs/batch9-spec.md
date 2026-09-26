# 批次⑨ 实施规格

> 本文件是批次⑨ 的**唯一实施依据**。批次⑨ 与前面八批都不同：**它是唯一一批会有真实行为面改动的收尾批**（死代码删除、导出面收敛、分层归位、类型收紧、文档同步）。
>
> 因此判据也必须换：**前面几批靠「产物逐字节不变 / 归一化多重集配平」自证，批次⑨ 不能** —— 它本来就要动 `lib/client.js`。
>
> 基线：`0cfe478`（批次⑧ 文档留档后）。
> 遗留项总清单：`docs/batch9-backlog.md`（7 类 26 条）。

---

## 0. 批次⑨ 分成四步走（本文件随每步追加）

| 步 | 内容 | 动生产代码？ | 风险 |
|---|---|---|---|
| **⑨-1** | **测试安全网** —— `MOTION_CSS` 字符串快照、`src/client/index.ts` 端到端覆盖 | **否**（只加测试） | 无 |
| ⑨-2 | 死代码与导出面收敛 + 命名同源（A1-A4、B1-B4） | 是 | 中 |
| ⑨-3 | 分层归位与类型收紧 + 端点契约（C1-C4、D1/D2、G1/F3） | 是 | 高 |
| ⑨-4 | 文档同步与升版（E1-E5、G2/G3） | 否（只改文档） | 无 |

**为什么 ⑨-1 必须排在最前**：`MOTION_CSS` 全仓零测试覆盖，而 ⑨-2 的 A1-A3 正要动它所在的 `src/client/motion/styles.ts`；`src/client/index.ts` 是全仓唯一零直接覆盖的源文件（28 个测试文件里没有任何一个 import 它），而 ⑨-2/⑨-3 都要动它的 `inject` 与 `sync()`。

**没有这两张网就开始改，改动只能靠肉眼审读 —— 这正是批次⑥⑦⑧ 一直避免的情形。**

---

## 1. ⑨-1 目标与边界

**唯一目标**：新增两个测试文件，把 ⑨-2 与 ⑨-3 会踩到的两处「零覆盖」补上。

### 硬边界

1. **禁止修改任何 `src/` 下的文件。** 本步产出只有 `test/` 下的新文件。若发现生产代码有 bug，**写进交付报告的「需裁决项」，不要顺手修**。
2. **禁止修改 `vitest.config.ts` / `tsconfig.test.json` / `package.json`。**
3. **禁止为了让断言通过而放宽断言。** 断言必须钉住**当前真实行为**（包括看起来奇怪的既有行为），而不是钉住「我认为应该的行为」。
4. 新增测试文件一律以 `// @vitest-environment jsdom` 开头（`src/client/index.ts` 走 DOM 与浏览器的 `CustomEvent`）。
5. CRLF、无 BOM。
6. **两个测试文件分两次提交**，消息用中文，`Set-Content -Encoding utf8NoBOM` + `git commit -F`，**只 add 本步路径，禁止 `git add -A`**。

---

## 2. 测试一：`test/motionStyles.test.ts`（对 B5 / F1）

### 2.1 被测对象

`src/client/motion/styles.ts` 的 `MOTION_CSS`（47 行文件，常量为 `:25-47`）。它是注入 `<head>` 的动效样式表，**当前全仓零测试覆盖**，唯一的回归网是产物比对 —— 而 ⑨-2 的 A2 正要把它里面的三处 `cubic-bezier(0.7, 0, 0.84, 0)` 收敛成常量。

### 2.2 必须有的断言

**断言 1（主判据）：整串快照。** 用 `expect(MOTION_CSS).toBe(...)` 钉住**完整字符串**，不用 `toMatchSnapshot()`（快照文件会被无意 `-u` 刷新，而这个常量的运行时取值必须与重构前逐字节一致）。

期望值 = 三个类名常量插值后的实际结果（`dsu-settings-panel` / `dsu-settings-closing` / `dsu-settings-mask-closing`），逐字如下（**注意第 1 行是空行、缩进两格、结尾有一个换行**）：

```
\n.dsu-settings-panel {\n  transform-origin: var(--dsu-settings-origin-x, 50%) var(--dsu-settings-origin-y, 50%);\n}\n.dsu-settings-closing {\n  opacity: 0;\n  scale: 0.62;\n  pointer-events: none;\n  transition:\n    opacity 160ms cubic-bezier(0.7, 0, 0.84, 0),\n    scale 280ms cubic-bezier(0.7, 0, 0.84, 0);\n}\n.dsu-settings-mask-closing {\n  opacity: 0;\n  transition: opacity 160ms cubic-bezier(0.7, 0, 0.84, 0);\n}\n@media (prefers-reduced-motion: reduce) {\n  .dsu-settings-closing,\n  .dsu-settings-mask-closing {\n    transition: opacity 120ms linear;\n  }\n}\n
```

**注意**：断言里的期望值要用**模板字符串加 `${SETTINGS_PANEL_CLASS}` 之类插值**写，**不要**把类名写成第二份字面量 —— 那样改类名时测试与实现会一起漂移，测试就失去意义。即：期望值应形如

```ts
const EXPECTED = `
.${SETTINGS_PANEL_CLASS} {
  transform-origin: ...
...
`
```

**断言 2：三处退出曲线的计数。** `expect(MOTION_CSS.match(/cubic-bezier\(0\.7, 0, 0\.84, 0\)/g)).toHaveLength(3)`。这样 A2 把它收敛成 `EASE_EXIT` 常量时，**这条断言仍会通过**（插值后计数不变），而误改成入场曲线时**会变红**。

**断言 3：退出曲线与入场曲线不同源。** 断言 `MOTION_CSS` **不含** `waapi.ts` 的 `EASE_SETTLE` / `EASE_SPRING` / `EASE_FADE` / `EASE_GLIDE` 四个常量值中的任何一个（从 `src/client/motion/waapi.ts` import 它们来比对）。批次③ 已核实 `cubic-bezier(0.7, 0, 0.84, 0)` 的 P1.y = P2.y = 0 ⇒ **accelerate（退出）**，与入场曲线方向相反，**当初没复用是设计意图**。这条断言把「不得合并」写成可执行的事实。

**断言 4：reduced-motion 分支存在且只覆盖关闭类。** 断言存在 `@media (prefers-reduced-motion: reduce)` 块，且块内只出现两个关闭类、不出现 `SETTINGS_PANEL_CLASS`。

**断言 5：关闭几何与入场帧对称。** `scale: 0.62` 必须与 `src/client/motion/settingsMotion.ts` 的 `PANEL_FRAMES` 首帧（`{ opacity: 0, scale: 0.62 }`）一致。由于该常量未导出，**用正则从源文件读**或**断言字面量 0.62 出现一次并附注释指向 `settingsMotion.ts`** —— 二选一，在报告里说明选了哪个与为什么。

### 2.3 不要做的事

- **不要**用 `toMatchSnapshot()` / `toMatchInlineSnapshot()`。
- **不要**把 `MOTION_CSS` 拆成多个 `toContain` 断言替代整串断言 —— 那样丢掉「多余字符」这一维度的保护。
- **不要**在本步顺手做 A2 的收敛（那是 ⑨-2）。

---

## 3. 测试二：`test/clientEntry.test.ts`（对 F2）

### 3.1 被测对象

`src/client/index.ts`（**150 行**，`export const inject` + `export function apply(ctx): void`）。

**它是全仓唯一零直接覆盖的源文件**：`grep "from '../src/client/index"` 在 `test/` 下零命中。

本步覆盖**入口自身的装配逻辑**（不是被它装配的那些功能 —— 那些各自已有测试）：

| 编号 | 必须覆盖的行为 | 依据写法 |
|---|---|---|
| E1 | `inject` 数组的内容与顺序 | `expect(inject).toEqual(['slots', 'locale', 'connection', 'sessions', 'workspaces'])` |
| E2 | `apply` 注册了 **5 条** effect，且 name 字符串逐字正确、**顺序与声明序一致** | 假 ctx 的 `effect(fn, name)` 记录 name；断言 `['width-slider: dictionaries', 'width-slider: upstream conflict probe', 'width-slider: feature lifecycles', 'width-slider: config load', 'width-slider: settings section']` |
| E3 | 第 1 条 effect 调 `ctx.locale.register(NS, { zh, en })` 并返回它的 disposer | `locale.register` 返回 disposer 桩，断言 cleanup === 它 |
| E4 | 第 2 条 effect 调 `warnIfUpstreamPresent()`，其 cleanup 是空函数 | 断言调用 + `typeof cleanup === 'function'` 且调用不抛 |
| E5 | 第 3 条 effect（feature lifecycles）：`sync()` 被**立即**执行一次，随后 `onSettingsChanged` 注册的回调就是同一个 `sync` | 断言 `onSettingsChanged` 收到 1 个函数，且触发它后 installer 再次被调用 |
| E6 | **8 个槽位的 want 矩阵**（表见下） | mock 掉 8 个 installer，断言各自的调用序列 |
| E7 | **会话账本适配器**：`motionSessions` 的三个方法 | 见 §3.3 |
| E8 | **`ledgerWarned` 只告警一次** | 见 §3.3 |
| E9 | 第 3 条 effect 的 cleanup：**`unsubscribe()` 先于 `disposeAll()`** | 断言调用次序（用 log 数组） |
| E10 | 第 4 条 effect（config load）：`rpcReadSettings()` resolve 后调 `applySettings(mergeSettings(raw))` | mock `core/rpc.ts` 与 `core/config.ts` |
| E11 | 第 4 条 effect 的 `cancelled` 标志：cleanup 先执行后，resolve 不再调 `applySettings` | 见 §3.4 |
| E12 | `raw === null` 时不调 `applySettings` | 同上 |
| E13 | 第 5 条 effect（settings section）：`slots.inject('settings.section', fn)` 的 **name / id / order / label / locale / inject 六项逐字** | `{ name: 'settings.section', id: 'width-slider', order: 600, label: 'Width Slider', locale: NS }` + `inject()` 返回 `{ writeSettings }`，且它调 `rpcWriteSettings` |
| E14 | `apply` 返回 `void`（不返回 cleanup） | `expect(apply(fakeCtx)).toBeUndefined()` |
| E15 | 卸载后再 `apply` 一次，两次的注册互不干扰（每次 `apply` 独立的 registry 与 `ledgerWarned`） | 用两套 tsc 记录的 log 分开断言 |

### 3.2 E6 的 want 矩阵（逐字来自 `src/client/index.ts:90-110`）

| 槽位 | want 表达式 | 备注 |
|---|---|---|
| `handle` | `s.widthSlider` | |
| `think` | `s.thinkRender` | |
| `resize` | `s.dialogResize` | |
| `nav` | `s.navScroll` | |
| `sessionDel` | `s.sessionDelete` | 装的是 `installSessionDelete(ctx as never)` |
| `wsTabs` | **恒 `true`** | 组件常驻，开关只切 wrapper 内 enabled |
| `toolsMerge` | **恒 `true`** | 常驻安装，installer 内读 `getSettings().sidebarToolsMerge`；返回 `() => merge.dispose()` |
| `motion` | `motionAllowed(s.motionMode, prefersReducedMotion())` | |

断言要覆盖两个方向：**默认设置**（`widthSlider/chinesePrompt/thinkRender/...` 的真假值，见 `src/shared/settings.ts:59-72`）与**一组全开 / 全关的设置**。

### 3.3 会话账本适配器（E7/E8）—— 本步最重要的一段

`features/motion` 与 `motion/` 都不接触宿主形状，入口的 `motionSessions`（`:60-84`）是**全仓唯一解构宿主会话账本形状的地方**（`:69-73` 的 `as unknown as` 形状断言）。必须覆盖：

- `subscribe(listener)` → 转调 `ctx.sessions.list.subscribe(listener)`（用同一个函数引用断言）；
- `currentSessionId()` → `ctx.sessions.list.getSnapshot().current`；
- `isBlank()` 的三条路径：
  1. **正常**：`snapshot.current !== undefined && snapshot.byId[snapshot.current]?.blank === true`。矩阵：`current` 为 `undefined` / 指向存在且 `blank: true` / 存在且 `blank: false` / 存在于 `byId` 但值为 `undefined`（`Record` 的 `| undefined`）→ 四种结果；
  2. **账本抛错**：`getSnapshot()` 抛 `Error` → `isBlank()` **返回 `false`**（退化为「非空白会话」，只影响新建对话入场，其余三组动效照常），且 `console.warn` 被调用**一次**，文案为 `'[width-slider] motion: session ledger unavailable'`（第一个参数），第二个参数是**原始错误对象**；
  3. **连续调用只告警一次**：连续调 `isBlank()` 3 次（都抛），`console.warn` 仍只被调 **1** 次。

**E8 与 E15 的交叉**：`ledgerWarned` 是 `apply` 体内 `let`（`:59`），**每次 `apply` 一份**。断言「第二次 `apply` 后账本仍抛错时，会**再次**告警一次」——这条钉住的是批次⑦ 裁定的「`ledgerWarned` 不随纯函数迁移、留在装配层」的后果。

### 3.4 `cancelled` 标志（E11）

`rpcReadSettings()` 返回一个**由测试控制 resolve 时机的 Promise**。两次场景：

1. resolve **之前**先执行第 4 条 effect 的 cleanup（`cancelled = true`）→ resolve 后 `applySettings` **不被调用**；
2. cleanup **未**执行 → resolve 后 `applySettings` 被调用**一次**，参数是 `mergeSettings(raw)` 的结果（用 `mergeSettings(JSON.parse(JSON.stringify(raw)))` 或直接比对结果对象）。

注：`rpcReadSettings()` 的契约是 `Promise<unknown>`，`raw === null` 是显式的短路条件（`:124`）。

### 3.5 mock 方案（**不要改生产代码来让它可测**）

用 `vi.mock` 顶掉这些模块（路径相对 `test/` 目录写全）：

- `../src/client/features/width/index.ts` → `installWidthFeature`
- `../src/client/features/think/index.ts` → `installThinkRenderer` / `warnIfUpstreamPresent`
- `../src/client/features/motion/index.ts` → `installMotionFeature`
- `../src/client/patches/settingsPanel/dialogWindow.ts` → `installDialogResizePatch`
- `../src/client/patches/settingsPanel/navScroll.ts` → `installNavScrollPatch`
- `../src/client/sessionDelete.ts` → `installSessionDelete`
- `../src/client/workspaceTabs.tsx` → `installWorkspaceTabs`
- `../src/client/sidebarToolsMerge.ts` → `installSidebarToolsMerge`
- `../src/client/core/rpc.ts` → `rpcReadSettings` / `rpcWriteSettings`
- `../src/client/core/config.ts` → `getSettings` / `applySettings` / `onSettingsChanged` / `mergeSettings`（**注意 `mergeSettings` 也从这里导入**，见 `src/client/index.ts:40`）
- `../src/client/WidthSliderSettings.tsx` → 一个最小组件占位（**不要**真的渲染它）
- `../src/client/motion/index.ts` → `prefersReducedMotion`
- **`core/features.ts` 建议用真实实现**（它已由 `test/features.test.ts` 覆盖，且入口与它的交互正是本步要测的）；若必须 mock，在报告里说明。

假 ctx 需要提供：`effect`（**记录并立即执行 fn**，把返回的 cleanup 存起来供断言）、`locale.register`、`slots.inject`、`slots.register`、`sessions.list.subscribe` / `.getSnapshot`、`logger`。

### 3.6 不要做的事

- **不要**为了可测而给 `src/client/index.ts` 加导出（如导出 `motionSessions` 的工厂）—— 那是改生产代码，属 ⑨-3 的 D1 范畴。
- **不要**用 `apply(ctx as never)` 掩盖假 ctx 的类型缺口 —— 假 ctx 用一个显式对象 + `as unknown as ClientContext`，并在文件顶部注释说明**为什么**这里可以这么做（`ClientContext` 是 `any` 桩）。
- **不要**断言 `console.warn` 的完整调用形态（`toHaveBeenCalledWith` 的第二个参数用 `expect.any(Error)` 或捕获到的同一个 error 对象）。
- **不要**真的渲染 `WidthSliderSettings`。
- **不要**在 jsdom 里断言样式真的生效（jsdom 不做 CSS 计算）—— 本步只断言**注册了什么**。

---

## 4. 验收判据（本步的唯一判据）

批次⑨-1 **不改 `src/`**，所以产物判据仍然适用且很强：

1. `npx tsc -p tsconfig.test.json --noEmit` → **exit 0**
2. `npx vitest run` → **30 文件 / ≥ 268 + 新增 用例**全绿（基线 28 文件 / 268 用例）
3. `npm run build` → exit 0
4. **`lib/index.mjs` 与 `lib/client.js` 的 sha256 与开工前逐字节相同**（本步不动生产代码 ⇒ 产物必须**完全不变**）：
   - `lib/index.mjs` = `122D91D3D75359ACF580DA8C6AB6E84BBEC2054BBCC054667D664B9D35F242D3` / 26 652 B
   - `lib/client.js` = `33704C254D893C66B40A8C3E715BF85B34E4EE81444018F4E8D6233818449CC7` / 269 989 B
   - **注意**：`lib/` 在 `.gitignore` 里，`git diff lib/...` **恒为空、是空判据**；用 `Get-FileHash` 与基线副本（`$env:TEMP\batch8-base\`）比对。
5. **变异探针（必须做，逐条）**：临时改一处生产代码，确认你新写的测试**会变红**，改回来。至少三条：
   - 改 `src/client/index.ts:44` 的 `inject`（删掉 `'sessions'`）→ E1 必须红；
   - 改 `:107-109` 的 `motionAllowed(...)` 为恒 `true` → E6 的 motion 行必须红；
   - 改 `:79` 的告警文案一个字 → E8 必须红。
   报告里给出每次的**失败断言原文**，并确认最后 `git status --short` 干净。

---

## 5. 交付要求

- **分 2 次提交**（每个测试文件一次），中文消息，风格：
  - `test: MOTION_CSS 字符串快照（批次⑨-1）`
  - `test: client 入口装配端到端覆盖（批次⑨-1）`
- 行尾 CRLF、无 BOM；`Set-Content -Encoding utf8NoBOM` + `git commit -F`。
- **只 add 本批路径**（`git status --short` 逐条确认），**禁止 `git add -A`**。

**交付报告必须包含**：

1. 两个文件的行数与用例数；
2. `tsc` / `vitest` / `build` 的实测输出（**文件数、用例数**）；
3. **两个产物的 sha256 与基线对比**（必须逐字节相同）；
4. **5 条变异探针的实测结果**（每条：改了什么、哪条断言变红、原文）；
5. 断言清单：E1-E15 逐条对应到具体的 `it(...)` 名字；
6. §2.2 断言 5 选了哪一种写法与为什么；
7. **偏离本规格之处逐条列出并给出理由**；
8. **拿不准 / 测不到的部分如实说明**（例如：哪些分支因为无法在 jsdom 里构造而没覆盖）。

---

## 6. 批次⑨ 的范围裁定（用户已确认）

**用户回复「按照你的想法来」，以下三项按主会话建议定案。**

### 6.1 C1 与 C3 排除

`docs/batch9-backlog.md` 的 **C1**（`patches/wsTabs/domContract.ts` 四个宿主 DOM 函数搬 `official/`）与 **C3**（`WidthSliderControl.tsx` 649 / `WidthSliderSettings.tsx` 522 / `sessionDelete.ts` 426 / `sidebarToolsMerge.ts` 374 搬 `features/`）**不纳入批次⑨**。

理由：两者都是**纯搬移**，合计约 2000 行，**零行为收益**，但要改大量 import 与测试路径。风险与收益不成比例。终局结构不要求在本次重构里一次性达成。

⇒ 在 `docs/batch9-backlog.md` 里把它们标注为「**已评估，明确不做**」，并留下这条理由，避免后续反复讨论。

### 6.2 E5 版本号 → `2.1.0`

`package.json` 现为 `2.0.2`，⑨-4 升到 **`2.1.0`**。

理由：八个批次全部零行为变化（产物哈希可证），但测试从 22 文件 228 用例涨到 28 文件 268 用例，且新增了 `features/`、`core/features.ts`、`host/` 五个职责模块 —— 新增的是「可维护性」这一能力，按语义化版本取 minor。

### 6.3 B1 `merge.sync()` 保留 + 加注释

**不删** `SidebarToolsMergeHandle.sync`（`src/client/sidebarToolsMerge.ts:154-158`）。

理由（主会话复核后推翻 backlog 的「死导出面」定性）：
- 生产代码确实零调用（`src/client/index.ts` 只取 `merge.dispose()`），但 **`sync()` 是测试驱动这个模块的唯一显式入口** —— `test/sidebarToolsMerge.test.ts` 有 8 处 `handle.sync()`（`:86`/`:176`/`:179`/`:189`/`:199`/`:202`/`:215`/`:227`），语义是「改开关后立即重同步」。
- 删掉它意味着这 8 处要从「显式同步」改成「等 observer 的 40ms」（`settle()`）—— **改动的是测试语义，不只是路径**，收益抵不上风险。
- **backlog 当初记它是「死导出面」，是只看生产调用方得出的结论。**

⇒ ⑨-2 只做一件事：在 `sidebarToolsMerge.ts` 的 `SidebarToolsMergeHandle` 上给 `sync` 加一行注释，说明「生产路径用 `enabled` 回调 + observer 自动重同步，`sync()` 是测试的显式重同步入口」。

### 6.4 另三条主会话复核后的裁定

**B4 → 假阳性，撤销。** `scripts/clean-lib.mjs:6`（「that is how stale `openWith/*.d.ts` and `assignSession.d.ts` reached the 1.0.2 tarball」）是**历史事实陈述**，`src/client/patches/wsTabs/index.tsx:13`（「会话级「分配工作区」已按用户确认废除（assignSession.ts 已删除）」）是**模型说明的一部分**。两处都是**正确的历史记录，不是陈旧引用**。⑨-2 不需要动它们，只在 backlog 里勾掉并注明原因。

**B2 → 删。** 依据 `src/client/official/menuInjection.ts:95` 的实测实现：

```ts
.find((el) => !el.hasAttribute(attr) && excludeAttrs.every((name) => !el.hasAttribute(name))) ?? null
```

**`attr` 本身已被 `!el.hasAttribute(attr)` 覆盖 ⇒ `excludeAttrs` 的语义是「除我自己的 attr 之外还要排除哪些别人的项」，不需要包含自己。** `assignMenuItem.ts:42` 的第二项 `'data-ws-assign-item'` 是**本插件旧版本的自有属性**（`assignSession.ts` 删除后全仓零写入方），不是上游属性 ⇒ 恒 `false` 的死条件，删除不可观测。

注意 `excludeAttrs` **全仓零测试覆盖**（`grep` 在 `test/` 下无命中），所以这条改动只有逻辑论证、没有测试保护 —— 但恒 `false` 条件的删除在定义上不可观测。保留第一项 `'data-session-delete-item'`（那是官方的删除会话项，`src/client/sessionDelete.ts:357` 用的 `MENU_DELETE_ATTR` 与之对应）。

**A1 → 改名。** `src/client/motion/settingsMotion.ts:76` 的**模块私有** `PANEL_FRAMES` 改名为 **`SETTINGS_PANEL_FRAMES`**（该文件 `:172` 与 `:305` 两处引用同步改），与 `src/client/motion/frames.ts:125` 的**导出** `PANEL_FRAMES` 区分开。

两处**已有**解释同名不同源的注释（`settingsMotion.ts:62-66` 与 `src/client/motion/styles.ts:21`），改名后这些注释要同步更新指向新名 —— 注意 `styles.ts:21` 是纯注释、`settingsMotion.ts:63-64` 也是。**A1/A3 的「加注释」那一半其实早已完成，剩下的只是改名。**

**A4 → 存疑，实施时重新定位。** `src/client/motion/styles.ts:1-11` 的顶部注释读起来是**当前状态**（描述「入场用命令式 WAAPI、这里保留声明式的只有关闭那一拍」），**可能已经不过时**。⑨-2 实施时先重新读它，确认无问题就把它从 backlog 勾掉并写明「已复核，无需动作」，**不要为了「有事可做」而改注释**。

---

## 7. ⑨-2 实施规格（死代码与命名）

**主会话已逐处定位完成，实施者按 7.1 逐条做、按 7.3 验证。**

### 7.1 七条改动的裁定与精确位置

| # | 动作 | 位置 | 内容 |
|---|---|---|---|
| A1 | **改名** | `src/client/motion/settingsMotion.ts:76` | `const PANEL_FRAMES` → `const SETTINGS_PANEL_FRAMES`；同步改 `:172` 与 `:305` 两处引用。**⚠ 还有一处测试耦合（主会话探针实测发现，见 §7.1.1）**：`test/motionStyles.test.ts` 的 `:115`（`it` 名）、`:120`（正则 `/const PANEL_FRAMES[^=]*=\s*\[/`）、`:121`（未命中时的提示文案）必须同步改名。 |
| A1b | **同步注释** | `settingsMotion.ts:62-66`、`src/client/motion/styles.ts:21` | 两处注释里指向旧名 `PANEL_FRAMES` 的表述改为新名（`styles.ts:21` 指的是**设置弹窗那个**，即新名） |
| A2 | **抽常量** | `src/client/motion/styles.ts` | 三处 `cubic-bezier(0.7, 0, 0.84, 0)`（`:34` / `:35` / `:39`）收敛为模块私有常量 |
| A3 | **无需动作** | `settingsMotion.ts:50-56` | 数值巧合的解释注释**已存在**（`PAGE_REPLAY_MS` 对 `MASK_ENTRANCE_MS`）；`settingsMotion.ts:58-67` 解释了 `PANEL_REPLAY_MS`（320）对 `PANEL_DURATION_MS`（320）。backlog 勾掉。 |
| A4 | **无需动作** | `src/client/motion/styles.ts:1-11` | 主会话复查后判定：这条注释描述的**就是当前状态**（「入场是命令式 Web Animations（见 waapi.ts）」「保留声明式的只有关闭那一拍」「类名不再手写，从 settingsMotion.ts 的 class 常量插值」）—— **全部与现状相符，是假阳性**。backlog 勾掉。 |
| B1 | **加注释** | `src/client/sidebarToolsMerge.ts:154-158` | 给 `SidebarToolsMergeHandle.sync` 加注释，说明生产路径走 `enabled` 回调 + observer 自动重同步，`sync()` 是**测试的显式重同步入口**（`test/sidebarToolsMerge.test.ts` 8 处）。**不改签名、不改行为。** |
| B2 | **删** | `src/client/patches/wsTabs/assignMenuItem.ts:42` | `excludeAttrs: ['data-session-delete-item', 'data-ws-assign-item']` → `excludeAttrs: ['data-session-delete-item']` |
| B3 | **无需动作** | `src/client/patches/wsTabs/groupsStore.ts:257` | 「`groupRevision` 刻意不重置」的注释**已存在**。backlog 勾掉。 |

### 7.1.1 A1 改名会撞上 ⑨-1 的源码读断言（主会话探针实测）

`test/motionStyles.test.ts` 的第 6 条断言（`:115-128`）**从源码读** `settingsMotion.ts` 里的 `PANEL_FRAMES` 首帧：

```ts
const frames = /const PANEL_FRAMES[^=]*=\s*\[([\s\S]*?)\]/.exec(source)
```

改名后源码里只有 `const SETTINGS_PANEL_FRAMES`，`/const PANEL_FRAMES/` **不再匹配** ⇒ `frames` 为 `null`。

**实测（主会话亲自跑，批次⑨-1 复核）**：把 `settingsMotion.ts` 里 5 处 `PANEL_FRAMES` 全量替换为 `SETTINGS_PANEL_FRAMES`（`git diff --stat` = 1 file / 5 insertions / 5 deletions），只跑该文件：

> **⚠ 更正（⑨-2 实施后补记）**：探针那次的「5 处全量替换」是**为了逼出红而做的粗暴模拟，不是 A1 的正确口径**。**正确的 A1 只改 4 处** —— `:64`（注释里指代本文件那个常量）、`:76`（声明）、`:172`、`:305`（两处引用）。**`:63` 的 `PANEL_FRAMES` 指的是 `motion/frames.ts` 的导出常量**（`opacity+translate`、`EASE_SETTLE`），改名后它**仍然叫 `PANEL_FRAMES`**，所以 `:63` **必须保持原名，改了反而错**。⑨-2 实施者据 A1b 的语义做出这个区分并如实报出，**判定正确**。

```
❯ test/motionStyles.test.ts (6 tests | 1 failed)
  ✓ is byte-for-byte the stylesheet with the class constants interpolated
  ✓ keeps the first/last-line shape the injection depends on
  ✓ uses the exit curve exactly three times
  ✓ shares no easing with the entrance curves
  ✓ scopes the reduced-motion branch to the two closing classes only
  × takes its closing scale from PANEL_FRAMES in settingsMotion.ts 5ms
AssertionError: settingsMotion.ts 里必须有 PANEL_FRAMES 数组字面量: expected null not to be null
```

**这不是测试的缺陷，而是 ⑨-1 想守的契约在起作用**：「两处必须一起改」在这里表现为「改名是必须显式完成的多点动作」。**但它意味着 A1 不是「改 3 处」而是「改 3 处生产代码 + 3 处测试」，漏掉测试侧就是漏做。** 同步改后该断言应重新全绿（正则改为 `/const SETTINGS_PANEL_FRAMES[^=]*=\s*\[/`，`it` 名与提示文案一并改名）。

### 7.2 A2 的实现约束（这条最容易做错）

```ts
/**
 * 关闭那一拍用的加速曲线（P1.y = P2.y = 0）。与 waapi.ts 的入场 `EASE_*`
 * 方向相反，当初没复用是设计意图 —— **不得与入场曲线合并**。
 */
const EASE_EXIT = 'cubic-bezier(0.7, 0, 0.84, 0)'
```

- **常量留在 `styles.ts` 本地、模块私有**，**不要**放到 `waapi.ts`（那个文件里全是入场曲线，把退出曲线塞进去会制造新的「同名不同物」）。
- **`MOTION_CSS` 的运行时取值必须与改动前逐字节一致** —— `styles.ts:23` 明确写了这条要求。模板串插值在编译期展开，所以只要常量值一模一样，运行时字符串就不变。
- **这条有测试保护**：⑨-1 的 `test/motionStyles.test.ts` 断言的是 `MOTION_CSS` 的值。**A2 做对 ⇒ 那个测试必须仍然全绿**；若它变红，说明改错了。

### 7.3 验收判据

本步**动了 `src/`**，所以与 ⑨-1 不同：

1. `npx tsc -p tsconfig.test.json --noEmit` → **exit 0**
2. `npx vitest run` → **全绿**。注意两条测试的关系：
   - **A2 做对 ⇒ `test/motionStyles.test.ts` 的曲线断言（第 3、4 条）必须仍绿**（这是 A2 正确性的直接证据）；
   - **A1 改名 ⇒ 该文件第 6 条断言会先红，必须在同一次提交里同步改测试**（见 §7.1.1），改完后全绿。**看到这条红就以为是「A1 做错了」而回退改名，是错判。**
3. `npx vitest run` 的**用例总数必须仍是 292**（⑨-1 之后的值）—— 本步不新增、不删除用例，只改 A1 涉及的那条的名字与正则。
4. `npm run build` → exit 0
5. **`lib/client.js` 会变**（本批必然）—— 用 `git diff --no-index -U0` 对基线做 hunk 归因，**每个 hunk 都必须能归入「A1 改名 / A2 常量内联 / B1 注释 / B2 删字面量」四类之一**，出现无法归因的 hunk 就是改到了不该改的地方。
6. **`lib/index.mjs` 必须逐字节不变** —— 本批只动 `src/client/`，host 产物不受影响。基线 `122D91D3D75359ACF580DA8C6AB6E84BBEC2054BBCC054667D664B9D35F242D3` / 26 652 B。
   - 注意：`lib/index.mjs` 里含 client 的 CSS 吗？**不含** —— client 代码全部在 `lib/client.js`。
7. **B2 无测试保护**（`excludeAttrs` 全仓零覆盖）。这条靠 7.1 表里的逻辑论证：`!el.hasAttribute(attr)` 已覆盖自身，且 `'data-ws-assign-item'` 全仓零写入方 ⇒ 恒 `false` 条件的删除**在定义上不可观测**。报告里如实说明这一点。

### 7.4 不要做的事

- **不要**顺手把 `settingsMotion.ts` 的 `PANEL_REPLAY_MS` 改名或与 `PANEL_DURATION_MS` 合并（A3 已裁定不合并）。
- **不要**给 `EASE_EXIT` 加导出（它是本文件实现细节）。
- **不要**动 `sidebarToolsMerge.ts` 里 `sync()` 的实现体 —— 只加注释。
- **不要**在 B2 里改 `excludeAttrs` 的第一项，也不要改 `WS_ASSIGN_MENU_ATTR`。
- **不要**为了「让 backlog 好看」而在 A3/A4/B3 上制造改动。

---

## 8. ⑨-3 / ⑨-4 的范围裁定（主会话复核后）

**主会话逐条复核 C/D/G 类后发现：⑨-3 有三条不成立或不该做，实际只剩 `C4` 与 `G1/F3`。**

### 8.1 C2 也要排除（关键推论）

backlog 的 C2 想把 `src/client/widthPrefs.ts` 迁入 `features/width/`。**但单独做 C2 会制造一个新的反向依赖：**

| | `features/width/index.ts` 的 import | `WidthSliderControl.tsx` 的 import |
|---|---|---|
| **现在** | `'../../widthPrefs.ts'` ← **features 依赖 `client/` 根**（已知且被接受的反向依赖） | `'./widthPrefs.ts'` ← 根内同级，正常 |
| **做完 C2** | `'./widthPrefs.ts'` ← 正向了 ✔ | `'./features/width/widthPrefs.ts'` ← **根依赖 features**，新的反向依赖 ✘ |

C2 的实测消费者共 **5 处**：`src/client/WidthSliderControl.tsx:36`、`src/client/features/width/index.ts:1`、`test/widthPrefs.test.ts:12`、`test/widthSliderKeyboard.test.ts:12-13`（`vi.mock` + `importOriginal<typeof import(...)>`）、`test/widthSliderKeyboard.test.ts:22`。

**⇒ `widthPrefs.ts` 归位必须与 C3 同批做**（做完 C3，`WidthSliderControl.tsx` 本身也在 `features/width/` 里，两个 import 就都正向了）。**C3 已排除 # ⇒ C2 一并排除**，理由写进 backlog：**「与 C3 绑定，单独做会制造新的反向依赖」。**

（backlog 给的另一个选项「或 `core/`」看似能同时消除两个反向依赖，但 `widthPrefs.ts` 是**宽度功能的持久化**、不是跨功能基础设施，放进 `core/` 与 `core/` 的定位不符 —— 不采用。）

### 8.2 D1 不做（外部条件不具备）

**D1（把 `src/env.d.ts:16` 的 `ClientContext = $TS_FIXME = any` 收紧）本批不做。** 三条依据：

1. **本仓拿不到真实类型。** `src/env.d.ts:4` 明写「作为外部插件，dsh-plugin-width-slider 不安装 DSH monorepo 内部包」；实测 `node_modules/@deepseek-ai/dsh-client-runtime` **路径不存在**。任何手写的 `ClientContext` 都是**猜的形状**。
2. **现有代码里有刻意的防御性写法，与「已知形状」直接冲突。** 例如 `src/client/patches/wsTabs/index.tsx:541` 的 `ctx.slots?.register`、`:571` 的 `typeof ctx.slots?.entries === 'function' ? … : []`、`:608` 的 `typeof ctx.slots?.subscribe === 'function'` —— 作者用可选链与运行时 `typeof` 检查**主动防了不同宿主版本**。一旦类型声称这些成员一定存在，这些检查要么被 tsc 判为恒真、要么只能删掉，**等于用类型去否认作者已经观察到的现实**。
3. **收益只在编译期，风险是误报或误导**：猜窄了让正确代码报错，猜宽了等于没猜。

**⇒ 正确的前置条件是拿到真实宿主类型**（安装 DSH 内部包，或在 `tsconfig` 里 `paths` 挂到 DSH 检出）。**在那之前 `any` 是诚实的选择。** 记入 `docs/batch9-backlog.md` 的 D 类，注明「需要外部条件，不是本仓内的重构任务」。

**D2 保留**（`src/client/index.ts` 里那 5 行账本形状断言是全仓唯一记录宿主账本形状的地方）—— ⑨-1 的入口测试正是围绕它建的，**不要动它**。

### 8.3 ⑨-3 的实际内容（缩水后）

只剩两条，都不大：

- **C4：删 `src/client/index.ts` `inject` 里的 `'connection'`。** 实测 client 侧全仓**零** `ctx.connection` / `ctx.get('connection')` 消费（`src/client/core/endpointChannel.ts` 明写不走 `connection.rpc.call`，用原生 fetch）。**host 侧的 `connection` / `webServer` 不要动**（`src/index.ts` 有必需性论证）。
  - **⚠ 测试耦合（⑨-1 子代理在交付报告的「需裁决项」里主动报出）**：`test/clientEntry.test.ts` 的 **E1**（`declares the five host services it reads, in order (E1)`）按现状钉住**五项**。删掉 `'connection'` 后 E1 会红：
    `AssertionError: expected [ 'slots', 'locale', …(2) ] to deeply equal [ 'slots', 'locale', …(3) ]`（这正是 ⑨-1 探针 P1 的实测输出形态，只是删的是另一项）。
  - **⇒ C4 必须与 E1 的期望值同步改**（五项 → 四项，`it` 名里的 `five` → `four`）。**这是设计意图而非障碍**：「删掉一个服务名必须是有意识动作」，E1 红就是那个提醒。
- **G1 + F3：建 `src/shared/endpointContract.ts` + 端点协议契约测试。** 路径 `/api/width-slider` 与 5 个方法名实测散落在 client **6 处**（`core/rpc.ts:9`、`core/rpc.ts:21`、`patches/wsTabs/index.tsx:471`、`patches/wsTabs/groupsStore.ts:144`、`patches/wsTabs/groupsStore.ts:185`、`client/sessionDelete.ts:90`）与 host **2 处**（`src/host/api.ts` 的 5 方法、`src/index.ts:64`），响应形状 `{ok,value}` / `{ok:false,error}` 只写在 client 的一处注释里。**实施前先做一次实测复核这些位置。**

**⇒ ⑨-3 可以并进 ⑨-2 作为同一步的第二个提交**，不必单列一步。

### 8.4 ⑨-4（文档与升版）—— 内容不变

E1（README 结构树）｜E2（README 测试计数 22/228 → 实测值）｜E3（`THIRD_PARTY_NOTICES.md:18` 的 `PROMPT_TEXT` 路径，批次⑧ 后应在 `src/host/chinesePrompt.ts`）｜E4（计划文件自身行号重测）｜E5（版本号 **`2.1.0`** + 更新日志）｜G2（`label: 'Width Slider'` —— **无证据不要改**）｜G3（`SETTINGS_DIALOG_SELECTOR` 的 `div` 前缀 —— 已记录风险，**不一定需要动作**）。

**E1/E2 在 ⑨-1-⑨-3 全部落地后再做**，否则数字又过期。

---

## 9. ⑨-1 实施结果（留档，主会话已独立复核）

### 9.1 提交与产物

| 提交 | 说明 | 变更 |
|---|---|---|
| `625716f` | `test: MOTION_CSS 字符串快照（批次⑨-1）` | 1 file, +129（`test/motionStyles.test.ts`） |
| `249f77c` | `test: client 入口装配端到端覆盖（批次⑨-1）` | 1 file, +595（`test/clientEntry.test.ts`） |

父提交 `dd62609`。两次都只 `git add` 本步一个路径。两文件 CRLF、无 BOM（实测 `bom=False loneLF=0`）。**`src/` 零改动**（`git diff --stat -- src/` 为空）。

| 文件 | 行数 | 用例 |
|---|---|---|
| `test/motionStyles.test.ts` | 129 | 6 |
| `test/clientEntry.test.ts` | 595 | 18 |
| **合计** | **724** | **24**（268 → 292） |

### 9.2 主会话独立复核（与子代理报告全部一致）

- `npx tsc -p tsconfig.test.json --noEmit` → **exit 0**
- `npx vitest run` → **`Test Files 30 passed (30)` / `Tests 292 passed (292)`**
- `npm run build` → **exit 0**
- **两个产物与基线逐字节相同**（本批最强判据）
  - `lib/index.mjs` = `122D91D3D75359ACF580DA8C6AB6E84BBEC2054BBCC054667D664B9D35F242D3` / 26 652 B
  - `lib/client.js` = `33704C254D893C66B40A8C3E715BF85B34E4EE81444018F4E8D6233818449CC7` / 269 989 B

### 9.3 5 条变异探针（子代理实测，主会话另行验了 P6）

| # | 改动 | 变红 | 关键失败断言 |
|---|---|---|---|
| P1 | `src/client/index.ts:44` 删 `'sessions'` | E1（其余 17 绿） | `expected [ 'slots', 'locale', …(2) ] to deeply equal [ 'slots', 'locale', …(3) ]` |
| P2 | `:108` `motionAllowed(...)` → `true` | E6 | diff 多出 `+ "install:motion"` |
| P3 | `:79` 文案 `unavailable` → `unavailabl` | E8 | `expected "warn" to be called with arguments` |
| P4 | 一处退出曲线 → `EASE_FADE` 值 | **3 条** | `expected [ …(2) ] to have a length of 3 but got 2` 等 |
| P5 | `PANEL_FRAMES` 首帧 `0.62` → `0.6` | 仅第 6 条 | `expected '…' to contain 'scale: 0.6;'` |
| **P6** | **主会话补**：`PANEL_FRAMES` → `SETTINGS_PANEL_FRAMES` 全量改名（A1 的预演） | 仅第 6 条 | `settingsMotion.ts 里必须有 PANEL_FRAMES 数组字面量: expected null not to be null` ⇒ 见 §7.1.1 |

每条探针后 `git checkout -- <file>` 还原，`git diff --stat -- src/` 最终为空，全量 292 用例再次全绿。

### 9.4 子代理的 7 项偏离（全部接受）

1. `test/motionStyles.test.ts` 多一条「首尾行形状」断言（规格 §2.2 为 5 条）—— 钉住 `style.textContent = MOTION_CSS` 的注入契约（首尾空白同属契约），且 P4 实测它与曲线断言不重合。
2. **规格的 `\n` 是对的，子代理开工前的 CRLF 预判错了**（如实记录）：vitest 转译把 CRLF 归一成 LF，运行时 `MOTION_CSS` **不含 `\r`**，首版 `toContain('\r\n')` 首轮即红。已改为钉「LF + 首尾形状」并保留 `not.toContain('\r')`。**附带结论：把源文件转成 LF 不会改变运行时取值**（规格里那条动机不成立，但断言仍值得存在）。
3. `mergeSettings` 走 `vi.importActual` 真实实现（规格 §3.5 把 `core/config.ts` 整个列进 mock 名单）—— 若连它也 mock，E10 会退化成「mock 输出 = mock 输出」的自证。真实实现还顺带覆盖了白名单式合并（脏键丢弃、缺键回落）。
4. 备份目录用 `$env:TEMP\batch9-base\`（规格 §4.4 笔误写成批次⑧ 的 `batch8-base`）。
5. 用例 18 而非 15：E7 拆 2 条、E15 拆 2 条、补 1 条 E6b（installer 入参）；规格只要求 E1–E15 逐条对应，未规定一 E 一用例。
6. 探针做 5 条（规格 §4.5 说「至少三条」，§5 报告要求 5 条）。
7. 断言 2 若三处曲线全改会以 TypeError 而非长度不符失败 —— 规格指定的 `String.match` 写法，未动。

### 9.5 需裁决项（子代理报出，主会话已并入 §8.3）

**未发现会改变行为的生产代码 bug。** 唯一可疑点：`src/client/index.ts:44` 的 `inject` 声明了 `'connection'`，但该文件除 `:26` 的 type-only import 外无任何 `ctx.connection` 读取点。**无法从代码判定是「刻意声明以保证服务激活/类型增强」还是历史残留** ⇒ 已并入 ⑨-3 的 C4，并注明「E1 会红、需显式改测试」（见 §8.3）。

### 9.6 仍未覆盖的部分（诚实记录）

- **`MOTION_CSS` 的注入点仍无测试**：`src/client/features/motion/index.ts:42`（`style.textContent = MOTION_CSS`）不在 ⑨-1 范围（规格只给常量 + 入口两个文件）。改前 `test/` 对该常量零引用。
- **jsdom 不做 CSS 计算**：所有样式断言只钉字符串，不断言样式真的生效（规格 §3.6 明文禁止）。
- `cancelled` 的**反向顺序**（resolve 先到、cleanup 后到）无副作用可观测，未单列。
- `inject` 里第 4 项之外的服务暂无保护，仅 E1 的五项定序保护。

---

## 10. ⑨-2 实施结果（留档，主会话已独立复核）

### 10.1 提交与改动

**提交 `05093ef`** `refactor(client): 批次⑨-2 命名收敛与死条件删除`（父提交 `ed88493`），5 files, +25 / −13：

| 文件 | 改动 | 精确位置 |
|---|---|---|
| `src/client/motion/settingsMotion.ts` | 4 行改 | `:64`（注释里指代本文件那个）、`:76`（声明）、`:172` / `:305`（引用） |
| `src/client/motion/styles.ts` | +6 / 改 5 | 新增 `:18-22`（`EASE_EXIT` JSDoc + 常量）；`:27`（注释 A1b）；`:40` / `:41` / `:45`（曲线 → `${EASE_EXIT}`） |
| `src/client/sidebarToolsMerge.ts` | 1 行 → 7 行 | `:155-161`（`sync` 的 JSDoc）；`:162` 的 `sync: () => void` 本体未动 |
| `src/client/patches/wsTabs/assignMenuItem.ts` | 1 行改 | `:42`（删 `excludeAttrs` 第二项） |
| `test/motionStyles.test.ts` | 3 行改 | `:115`（`it` 名）、`:120`（正则）、`:121`（提示文案）—— **§7.1.1 预言的耦合，已同步改** |

`EASE_EXIT` 实测**模块私有、无 `export`**，且**未放入 `waapi.ts`** ✔。

### 10.2 主会话独立复核（与子代理报告全部一致）

- `npx tsc -p tsconfig.test.json --noEmit` → **exit 0**
- `npx vitest run` → **`Test Files 30 passed (30)` / `Tests 292 passed (292)`**（**用例总数与 ⑨-1 之后完全相同**）
- `npm run build` → **exit 0**
- **`lib/index.mjs` 逐字节不变**：`122D91D3D75359ACF580DA8C6AB6E84BBEC2054BBCC054667D664B9D35F242D3` / 26 652 B（本步只动 client 侧）
- `lib/client.js` 按预期变化：`33704C25…49CC7` / 269 989 B → **`A6505482A868F8F7FFA8F73E032614E14382A73ABDF0245255829418748E88AE` / 270 205 B**
- **`git diff --no-index -U0` 得 11 个 hunk**，与子代理归因表一致

### 10.3 `lib/client.js` 的 11 个 hunk 归因（4 类，0 个落空）

| # | 归因 | 内容 |
|---|---|---|
| 1, 2 | **A1 连带** | `const PANEL_FRAMES$1 = [{` → `const PANEL_FRAMES = [{`（`motion/frames.ts` 的导出侧） |
| 3, 8 | **A1b** | 两处注释里的指向 |
| 4, 5, 6 | **A1** | `const PANEL_FRAMES` → `const SETTINGS_PANEL_FRAMES` + 两处引用 |
| 7 | **A2** | 插入 `const EASE_EXIT = "cubic-bezier(0.7, 0, 0.84, 0)";` + JSDoc |
| 9, 10 | **A2** | 三处字面量 → `${EASE_EXIT}` |
| 11 | **B2** | `excludeAttrs` 删第二项 |

**hunk 1/2 的解释（值得记下）**：基线产物里 `motion/frames.ts` 的**导出** `PANEL_FRAMES` 被 esbuild 重命名为 **`PANEL_FRAMES$1`**（与 `settingsMotion.ts` 的模块私有同名，需消歧）。A1 改名后重名消失，导出侧恢复原名。**语义等价，是 A1 在产物层的可解释连带效应。** 这也从产物侧反证了「`:63` 指的是 frames.ts 那个常量」的判断。

**B1 没有对应 hunk，不是漏改**：`SidebarToolsMergeHandle` 是 TS **interface（纯类型）**，esbuild 整体擦除，其成员 JSDoc 不进入产物。实测两版产物 grep B1 注释里的文本**均 0 命中** ⇒ B1 只动了注释，连产物文本都不影响。

### 10.4 两个需裁决项的裁定（子代理报出，主会话全部采纳）

**9.1 —— 采纳子代理判断：A1 正确的改动是 4 处，不是探测时的 5 处。**
`:63` 的 `PANEL_FRAMES` 指的是 `motion/frames.ts` 的导出常量（`opacity+translate`、`EASE_SETTLE`），改名后它仍叫 `PANEL_FRAMES`，故**必须保持原名**。子代理据 A1b 的语义做出该区分，**判定正确**；主会话探针那次的「5 处全量替换」是为逼出红而做的粗暴模拟。§7.1.1 已补更正说明。

**9.2 —— 采纳子代理指出，主会话补做：`test/motionStyles.test.ts:116` 与 `:124` 的旧名同步。**
规格 §7.1 只点了 `:115` / `:120` / `:121` 三处，漏了 `:116`（纯注释）与 `:124`（断言失败时的提示文案）。子代理按硬约束「只动规格点到的那几处」**没有自作主张改**，而是报上来 —— **这个边界守得对**。主会话补改后实测：该文件 6 用例全绿、CRLF 无 BOM、`lib/client.js` 哈希 `A6505482…8E88AE` **不变**（测试文件不进产物）。

### 10.5 A3 / A4 / B3 复核实测（确认为无需动作，未制造改动）

- **A3**：`settingsMotion.ts:50-56`（`PAGE_REPLAY_MS` 对 `MASK_ENTRANCE_MS`）与 `:58-67`（`PANEL_REPLAY_MS` 对 `motion/frames.ts` 的 `PANEL_DURATION_MS`）的解释注释**确实已存在** ✔
- **A4**：`motion/styles.ts:1-11` 顶部注释实读确认描述的**就是当前状态**（假阳性）✔
- **B3**：`patches/wsTabs/groupsStore.ts:257` 的「`groupRevision` 刻意不重置」注释**确实已存在** ✔

### 10.6 B2 无测试保护（如实记录）

`excludeAttrs` 在 `test/` 下**零命中**；全仓只出现在 `src/client/official/menuInjection.ts:63/90/95` 与 `src/client/patches/wsTabs/assignMenuItem.ts:42`。**B2 只有逻辑论证、没有测试保护**。论证（子代理逐点实测复核过）：`menuInjection.ts:95` 的 `.find((el) => !el.hasAttribute(attr) && excludeAttrs.every((name) => !el.hasAttribute(name))) ?? null` 表明 `attr` 已被第一个条件覆盖 ⇒ `excludeAttrs` 无需包含自己；`'data-ws-assign-item'` 在 `src/` 下**唯一命中就是该排除字面量本身**、零写入方，且与 `WS_ASSIGN_MENU_ATTR = 'data-ws-assign-tab-item'` 拼写不同 ⇒ 恒 `false`，删除**在定义上不可观测**。第一项 `'data-session-delete-item'` 保留。

---

## 11. ⑨-3 实施规格（C4 + G1/F3）

### 11.1 两个提交的切分

| 提交 | 内容 | 产物影响 |
|---|---|---|
| 第 1 个 | **C4**：删 `inject` 的 `'connection'` + 同步改 E1 | `lib/index.mjs` **逐字节不变**（host 侧不动）；`lib/client.js` **变** |
| 第 2 个 | **G1** 新建 `src/shared/endpointContract.ts` + 改 8 处消费者；**F3** 新建 `test/endpointContract.test.ts` | **两个产物都变**（host 侧首次 import 这个共享模块） |

### 11.2 C4 的确切改动（第 1 个提交）

1. `src/client/index.ts:44`：`export const inject = ['slots', 'locale', 'connection', 'sessions', 'workspaces']` → **删 `'connection'`**，变四项。
2. `test/clientEntry.test.ts` 的 **E1**（`it` 名 `declares the five host services it reads, in order (E1)`）：`five` → `four`，期望数组五元 → 四元。
   - **⚠ 这是设计意图，不是障碍。** ⑨-1 的 E1 存在的意义就是让「删掉一个服务名」变成必须显式进行的动作。**E1 变红是预期行为 —— 要同步改期望值，绝不允许把删除回退掉。**
3. **不要动 `src/index.ts`（host）的 `inject`** —— 那里的 `connection` / `webServer` 有必需性论证（`src/index.ts:119-124`）。
4. **不要动 `src/client/index.ts:26` 的 `import type {} from '@deepseek-ai/dsh-client-connection/client'`** —— 那是类型增强声明，与 `inject` 是两回事。

### 11.3 新建 `src/shared/endpointContract.ts`（第 2 个提交）

```ts
/**
 * 端点协议契约：`/api/width-slider` 的路径、5 个方法名与响应信封。
 *
 * host（`src/host/api.ts` 的分发器 + `src/index.ts` 的注册）与 client
 * （`core/rpc.ts`、`patches/wsTabs/`、`sessionDelete.ts`）各自独立打包，
 * 但这个协议是**两者共用的唯一真源** —— 此前它散落在 8 处以字符串字面量
 * 的形式存在，改一处漏一处不会有任何编译期或运行时提示。
 *
 * 注意 host 与 client 是两个独立 bundle，本模块会被各自打进一份。
 * 这是刻意的：契约的值必须两端一致，而类型约束只在编译期起作用。
 */

/** `/api/width-slider` 的挂载路径（host 注册、client 调用共用）。 */
export const WIDTH_SLIDER_ENDPOINT = '/api/width-slider'

/**
 * 端点方法名。键名即方法名，值也即方法名 —— 用具名键是为了让 host 的分发器
 * 与 client 的调用点都能被 grep 到，同时避免两端拼写漂移。
 */
export const ENDPOINT_METHOD = {
  readSettings: 'readSettings',
  writeSettings: 'writeSettings',
  wsGroupsRead: 'wsGroupsRead',
  wsGroupsWrite: 'wsGroupsWrite',
  sessionDelete: 'sessionDelete',
} as const

export type EndpointMethod = (typeof ENDPOINT_METHOD)[keyof typeof ENDPOINT_METHOD]

/** host 成功响应：`value` 的形状由各方法自行约定。 */
export interface EndpointOk<T = unknown> {
  ok: true
  value: T
}

/** host 失败响应：`error` 是 `{code, message}` 对象（不是字符串）。 */
export interface EndpointErr {
  ok: false
  error: { code: string; message: string }
}

export type EndpointResult<T = unknown> = EndpointOk<T> | EndpointErr
```

**⚠ 关键事实（实现前必读）**：`src/host/api.ts` 的所有失败分支返回的是 `{ ok: false, error: { code, message } }` —— **`error` 是对象，不是字符串**。例如 `:41` 的 `{ ok: false, error: { code: 'write-failed', message } }`、`:67` 的 `{ code: 'invalid-id', message: 'id is required' }`、`:74` 的 `{ code: 'unknown-endpoint', message: 'unknown endpoint: ' + endpoint }`。**契约类型必须如实反映这一点，不要写成 `error: string`。**

**不要**把两个 `endpointChannel.ts`（host 92 行 / client 36 行）里的传输层错误码（`bad-json` / `bad-request` / `handler-failed`）并进本模块 —— 那属于 HTTP 层，与端点方法契约不是一回事。

### 11.4 八处消费者的改造表

| # | 文件:行 | 现状 | 改为 |
|---|---|---|---|
| 1 | `src/index.ts:64` | `registerEndpointChannel(ctx, '/api/width-slider', createHostApi({…}))` | `registerEndpointChannel(ctx, WIDTH_SLIDER_ENDPOINT, createHostApi({…}))` |
| 2-6 | `src/host/api.ts:31` / `:34` / `:46` / `:49` / `:63` | `if (endpoint === 'readSettings')` 等 5 处 | `if (endpoint === ENDPOINT_METHOD.readSettings)` 等 5 处 |
| 7 | `src/client/core/rpc.ts:9` | `callEndpoint('/api/width-slider', 'readSettings', {})` | `callEndpoint(WIDTH_SLIDER_ENDPOINT, ENDPOINT_METHOD.readSettings, {})` |
| 8 | `src/client/core/rpc.ts:21` | `callEndpoint('/api/width-slider', 'writeSettings', { settings })` | `callEndpoint(WIDTH_SLIDER_ENDPOINT, ENDPOINT_METHOD.writeSettings, { settings })` |
| 9 | `src/client/patches/wsTabs/index.tsx:471` | `callEndpoint('/api/width-slider', method, payload \|\| {})` | `callEndpoint(WIDTH_SLIDER_ENDPOINT, method, payload \|\| {})`（`method` 是运行时值，只在路径上收敛） |
| 10 | `src/client/patches/wsTabs/groupsStore.ts:144` | `call('wsGroupsWrite', { groups: snapshot })` | `call(ENDPOINT_METHOD.wsGroupsWrite, { groups: snapshot })` |
| 11 | `src/client/patches/wsTabs/groupsStore.ts:185` | `rpcCall('wsGroupsRead')` | `rpcCall(ENDPOINT_METHOD.wsGroupsRead)` |
| 12 | `src/client/sessionDelete.ts:90` | `callEndpoint('/api/width-slider', 'sessionDelete', { id: sessionId })` | `callEndpoint(WIDTH_SLIDER_ENDPOINT, ENDPOINT_METHOD.sessionDelete, { id: sessionId })` |

**⚠ `groupsStore.ts` 的 `call` / `rpcCall` 是注入进来的**（`:132` `const call = rpcCall`；`loadGroups` 直接用 `rpcCall`）。它们是 `EndpointCall` 风格但**路径已绑定**的函数（由 `wsTabs/index.tsx:471` 那一层提供）。**只换方法名，不要改这两个函数的签名或注入方式。**

**纯注释残留不要顺手改**：`src/client/core/endpointChannel.ts:19`、`src/client/core/config.ts:6`、`src/client/sessionDelete.ts:14`、`src/client/patches/wsTabs/index.tsx:21`、`src/host/api.ts:2`、`src/index.ts:6-9` 等处都提到端点路径或方法名，**它们是文档而不是契约**，本批不动。

### 11.5 F3：`test/endpointContract.test.ts`

新建一个测试文件（**10-14 个用例**），只依赖 3 个 import：`../src/shared/endpointContract.ts`、`../src/host/api.ts`、`../src/client/core/endpointChannel.ts`。建议覆盖：

1. **字面量钉住**：`WIDTH_SLIDER_ENDPOINT === '/api/width-slider'`；`ENDPOINT_METHOD` 的 5 个键值逐条 `toBe` 自己的字面量。**这是对外契约，必须钉死字面量**（不能用常量自己比自己）。
2. **方法名两两不同**：`new Set(Object.values(ENDPOINT_METHOD)).size === 5` —— 防止将来复制粘贴出重名键。
3. **host 分发器认每个方法**：用假的 `HostApiDeps`（参照 `test/hostEndpoints.test.ts:33-42` 的假 ctx 形状）调 `createHostApi(deps)`，对 `Object.values(ENDPOINT_METHOD)` 逐个调用，断言**没有任何一个**返回 `error.code === 'unknown-endpoint'`。
4. **未知方法仍被拒**：`createHostApi(deps)('no-such-method', {})` → `ok: false` 且 `error.code === 'unknown-endpoint'`。
5. **信封形状**：成功分支有 `ok: true` 与 `value` 键；失败分支的 `error.code` / `error.message` 都是字符串。
6. **client 请求形状**：`// @vitest-environment jsdom`，stub `global.fetch`，调 `callEndpoint(WIDTH_SLIDER_ENDPOINT, ENDPOINT_METHOD.readSettings, {})`，断言 `fetch` 的第一个参数是 **`'/api/width-slider'`**、第二个参数是 `{ method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"method":"readSettings","payload":{}}' }`；再断言非 2xx 时抛 `endpoint /api/width-slider failed: HTTP 500`。

**⚠ 不要用 `toMatchSnapshot()`**（⑨-1 已立的规矩）。断言写成显式字面量。

### 11.6 验收判据（本步与前面各批的关键差别）

- `npx tsc -p tsconfig.test.json --noEmit` → exit 0
- `npx vitest run` → 全绿；**用例总数从 292 增加**（C4 不改数量，F3 新增）
- `npm run build` → exit 0
- **第 1 个提交后**：`lib/index.mjs` 的 sha256 必须**仍为** `122D91D3D75359ACF580DA8C6AB6E84BBEC2054BBCC054667D664B9D35F242D3`（26 652 B）；`lib/client.js` 会变（预期）
- **第 2 个提交后：两个产物都会变，这是预期，不再是失败信号。** 判据改为：
  - 两个产物的行数/字节数变化**可归因**（新增一份模块定义 + 8 处引用改成常量名）
  - **产物里 `'/api/width-slider'` 仍然存在**（host 与 client 各一份），且 5 个方法名字符串都还在
  - **F3 全绿** —— 这是「集中化没有改变协议」的实证
- **备份基线**到 `$env:TEMP\batch9-3-base\`（`lib/index.mjs` + `lib/client.js` 的副本）
- **至少 3 条变异探针**，每条实测后 `git checkout -- <file>` 还原：

| 探针 | 改动 | 预期变红 |
|---|---|---|
| P1 | `endpointContract.ts` 的 `WIDTH_SLIDER_ENDPOINT` → `'/api/width-slidr'` | F3 的字面量断言 + fetch 形状断言 |
| P2 | `ENDPOINT_METHOD.readSettings` 的值 → `'readSetting'` | F3 的字面量断言 + 键集/值集一致断言 + fetch 形状断言（**实测 4 红 9 绿**） |
| P3 | 删 `src/client/index.ts` 的 `'sessions'`（而非 `'connection'`） | E1（⑨-1 的网仍应有效） |

### 11.7 不要做的事

1. **不要动 host 侧 `inject`**（`connection` / `webServer` 必需）。
2. **不要改两个 `endpointChannel.ts`** —— 它们的 `path` 参数本来就是泛型 `string`，不是契约的一部分。
3. **不要给 `createHostApi` 加 `switch` / 查表** —— 5 个 `if` 的**顺序**是隐式契约（`docs/host-split-spec.md` §7 记录过），保持现有形状。
4. **不要改错误码与消息文本**（`write-failed` / `invalid-id` / `unknown-endpoint` / `delete-failed`）。
5. **不要把注释里提到的路径字面量一起改掉**（见 §11.4 末尾）。
6. **不要新增 `EndpointResult` 以外的导出**，也不要给 `ENDPOINT_METHOD` 加 `satisfies` 之类的装饰。
7. **不要顺手升级版本号或改 README** —— 那是 ⑨-4。

### 11.8 实施留档（实测）

**过程**：⑨-3 委派给子代理后，它完成了 §11.4 的全部 12 处改造与 `src/shared/endpointContract.ts` 的新建，**但在写 F3 测试之前失败**（未提交，改动留在工作树里）。主会话接手：核对了这 6 个文件的 diff（逐处与 §11.4 表格一致，相对路径 import 全部正确），然后按 §11.5 补写 `test/endpointContract.test.ts`（129 行 / 13 用例）并跑完全部验证。

**纠正一处规格笔误**：§11.6 探针表原先写 P2 的预期是「F3 字面量断言 + **host 认每个方法**断言」。**实测该断言不会变红** —— host 与 client 读的是同一个 `ENDPOINT_METHOD`，值一起漂移，两端仍然一致。P2 实际红的是：字面量断言、键集/值集一致断言、fetch 形状断言（4 红 9 绿）。
**这不是缺陷，恰恰是集中化的效果**：也正因如此，**对外契约只能由「与实现无关地独立写下的字面量」来守**——如果测试也用 `ENDPOINT_METHOD.readSettings` 去比自己，P2 会让 13 条全绿。这是 F3 必须写死 `'/api/width-slider'` 与 `'readSettings'` 等原始字面量的理由。

**三条探针实测结果**（每条跑完即还原，`git status` 确认无残留）：
| 探针 | 实测 |
|---|---|
| P1 路径改成 `'/api/width-slidr'` | **3 红 10 绿** —— 字面量断言 ×2 + fetch 形状断言（错误消息里也带路径） |
| P2 `readSettings` 值改成 `'readSetting'` | **4 红 9 绿** —— 字面量断言 + 键集/值集一致 + fetch body 断言；**「host 认每个方法」保持绿**（见上） |
| P3 删 `src/client/index.ts` 的 `'sessions'` | **1 红 17 绿** —— ⑨-1 的 E1 在 C4 之后仍然有效 |

**验证结果**：`tsc -p tsconfig.test.json --noEmit` exit 0；`vitest run` **31 文件 / 305 用例全绿**（292 + 13）；`npm run build` exit 0。

**产物**（基线 = C4 提交 `b7e72e2` 后的 `lib/`，已备份到 `%TEMP%\batch9-3-base\`）：
| 产物 | 基线 | 现在 | 差 |
|---|---|---|---|
| `lib/index.mjs` | `122D91D3…F242D3` / 26 652 B / 743 L | `9CF6941D…ED7289` / 27 935 B / 769 L | +1283 B / +26 L |
| `lib/client.js` | `36687727…C1094E` / 270 188 B / 6468 L | `673D9E22…45CABBF` / 271 529 B / 6494 L | +1341 B / +26 L |

**两个产物都恰好 +26 行**：各多出一份 `endpointContract` 模块定义（14 行实体 + 注释），8 处引用由字面量改为常量名但行数不变。**契约字符串仍在**：两份产物各有 `const WIDTH_SLIDER_ENDPOINT = "/api/width-slider";` 与 `const ENDPOINT_METHOD = {` 五个键值。`lib/types/shared/endpointContract.d.ts` 已生成（39 行）。

**⚠ 一处与预期不同的实测**：rollup **没有**把 `ENDPOINT_METHOD.readSettings` 折叠回字面量，产物里保留为属性访问（`lib/index.mjs:602` 等 5 处、`lib/client.js:3556/3565/4206/5988`）。值相同故行为等价，但**产物不再是「字面量比较」**——这是本批唯一进入产物的运行时代码形状变化，已由 F3 的 fetch 形状断言与「host 认每个方法」断言实证等价。

**新增的对外契约事实（F3 钉住的）**：host 失败信封的 `error` 是 `{ code, message }` **对象**而非字符串；client 的 `callEndpoint` 只看 `response.ok`，非 2xx 抛 `endpoint <path> failed: HTTP <status>`（正文为空时无后缀）。

---

## 12. ⑨-4 实施规格（文档同步与升版）

> **本节的实测数据采集于 `5b37023`（⑨-3 实施之前）。** ⑨-3 完成后会新增 `src/shared/endpointContract.ts` 与 `test/endpointContract.test.ts`（用例数随之增加）—— 实施 ⑨-4 时必须先重跑 `npx vitest run` 取**当时的**实际数字，不要照抄本节里「29 文件 / 292 用例」这类旧值。

### 12.1 改动清单

| # | 文件 | 动作 |
|---|---|---|
| E1 | `README.md:319-352` | 结构化重写「项目结构」树（见 §12.2 全文） |
| E2 | `README.md:309`、`:271-283` | 测试计数改为实测值；「验证状态」表加 2.1.0 一行；`:283` 的「五个 client 服务」需处置（见 §12.3） |
| E3 | `THIRD_PARTY_NOTICES.md:16`、`:18`、`:57`、`:59`、`:62` | 六处过期路径（见 §12.4） |
| E4 | `docs/refactor-plan.md:1-48` | 在 §1 顶部加「本节是重构起点的基线」标注（见 §12.5） |
| E5 | `package.json`、`README.md:374` | 版本号 `2.0.2` → `2.1.0`；新增 `### 2.1.0` 更新日志段（见 §12.6） |
| G2 | — | **不做**。`label: 'Width Slider'` 的先决条件是确认宿主是否支持 label 走词典，**本仓库内没有证据**，无证据不改。 |
| G3 | — | **不做**。`SETTINGS_DIALOG_SELECTOR` 的 `div` 前缀风险已在 §8.4 记录，本步无新证据。 |

### 12.2 E1：README 结构树的新全文（替换 `README.md:319-352` 的整个代码块）

```
dsh-plugin-width-slider/
├── src/
│   ├── index.ts                     # Host 端入口：注入装配 + 端点注册
│   ├── host/
│   │   ├── api.ts                   # 五个端点的分发器（readSettings / writeSettings / wsGroupsRead / wsGroupsWrite / sessionDelete）
│   │   ├── chinesePrompt.ts         # 中文强制注入（systemPrompt.section 的三态装卸）
│   │   ├── dshHome.ts               # $DSH_HOME 解析
│   │   ├── endpointChannel.ts       # /api 下 JSON 端点注册（connection.fetch.register）
│   │   ├── jsonFile.ts              # JSON 读写、损坏文件的改名保留与回落
│   │   ├── sessionDeleteService.ts  # 会话删除链（停任务、删目录、清投影缓存、工作区记账）
│   │   ├── settingsStore.ts         # settings.json 的 per-apply store
│   │   └── workspaceGroupsStore.ts  # workspace-groups.json 的 per-apply store
│   ├── shared/
│   │   ├── settings.ts              # 功能开关契约（host/client 唯一真源）
│   │   ├── motionSettings.ts        # 动效总闸三态与四档风格
│   │   ├── endpointContract.ts      # 端点路径、五个方法名与响应信封
│   │   └── types.ts                 # Disposer 等最小共享类型
│   ├── env.d.ts                     # 运行时模块类型桩
│   └── client/
│       ├── index.ts                 # Client 端入口：locale 注册 + 受控功能生命周期
│       ├── sessionDelete.ts         # 会话删除菜单项与确认框
│       ├── sidebarToolsMerge.ts     # 侧边栏工具并入
│       ├── widthPrefs.ts            # 宽度偏好读写/发布与启动恢复
│       ├── WidthSliderControl.tsx   # 宽度滑块组件（按下预览、rAF 拖动、释放惯性与持久化）
│       ├── WidthSliderSettings.tsx  # 设置区块：功能总控页
│       ├── workspaceTabs.tsx        # 兼容转发壳（真正的实现在 patches/wsTabs/）
│       ├── core/                    # 跨功能基础设施
│       │   ├── config.ts            # FeatureSettings 契约 + client 配置 store
│       │   ├── domObserver.ts       # DOM 变更观察的统一封装
│       │   ├── endpointChannel.ts   # /api 端点调用（POST { method, payload }）
│       │   ├── features.ts          # 受控功能注册表
│       │   ├── lang.ts              # 界面语言判定
│       │   ├── locales.ts           # zh / en 文案
│       │   ├── overlayState.ts      # 浮层状态
│       │   ├── primitives.ts        # ui-primitives 的取用封装
│       │   └── rpc.ts               # 设置读写的端点薄封装
│       ├── features/                # 受控功能的装配层
│       │   ├── motion/index.ts      # 动效引擎的装卸与槽位绑定
│       │   ├── think/index.ts       # 思考块渲染器注册与样式注入
│       │   └── width/index.ts       # 宽度启动恢复与手柄隐藏样式
│       ├── official/                # 官方 DOM 与契约的适配层
│       │   ├── chatDom.ts           # 对话区 DOM 锚点
│       │   ├── menuInjection.ts     # 会话行菜单项注入
│       │   └── settingsDom.ts       # 设置面板 DOM 锚点
│       ├── patches/                 # 官方界面的补丁
│       │   ├── settingsPanel/       # 面板补丁：弹窗窗口化 + 左侧导航滚动
│       │   └── wsTabs/              # 工作区分页：页签栏、分组 store、树过滤
│       ├── motion/                  # 入场动效引擎（对话/侧边栏/新建对话/设置面板）
│       └── think/                   # 思考块渲染器
├── test/                            # 单元测试（含 jsdom 动效用例）
├── scripts/fix-dts-imports.mjs      # 构建后修正 d.ts 相对导入
├── docs/                            # 重构计划、各批实施规格与留档（非运行时依赖）
├── cordis.patch.yml                 # bundle patch：insert width-slider
├── tsdown.config.ts
├── tsconfig.json
└── package.json
```

**同时必须修的两处**：`README.md:347` 的 `├── env.d.ts` 是错的（实际在 `src/env.d.ts`，已并入上面的树）；`:343` 的 `locales.ts` 实为 `core/locales.ts`（已在上面修正）。**注意 `src/client/think/thinkView.tsx` 仍在 `think/` 下，不要把它也挪走。**

### 12.3 E2：测试计数与验证状态

1. `README.md:309` 的「（22 个用例文件、228 项：……全部通过）」→ 改为**实施 ⑨-4 时 `npx vitest run` 的实测值**（⑨-3 之后应为 31 文件 / 300+ 项，**必须实测，不要推算**）。括号里的功能枚举也要按现状调整（删掉已下线的「界面中文化」等，补上「端点协议契约」「client 入口装配」「MOTION_CSS 快照」）。
2. **`README.md:283` 的「五个 client 服务（`slots`/`locale`/`connection`/`sessions`/`workspaces`）」需要处置**：⑨-3 的 C4 删掉了 `inject` 里的 `'connection'`，现在是四项。但这一行是**「0.1.7-rc.2 内核适配已逐项核对」的历史记录**，写成四项会与当时的事实不符。**建议改法**：保留五个的名字但补一句括号说明 —— `（`connection` 已在 2.1.0 移除：client 侧零消费者，端点调用走原生 `fetch` 而非 `connection.rpc.call`）`。**不要缩写掉 `connection`，那会让读者以为从没声明过。**
3. `README.md:271-283` 的「验证状态」表加一行：`| 端点契约集中化与入口服务收敛（2.1.0） | 已由本仓测试覆盖（端点契约测试 + client 入口装配用例）；**未在真实 DSH 进程里加载过** |`。**这一行必须写明未做进程内加载验证** —— 批次⑦⑧⑨ 都只做了 tsc/vitest/build 与产物核对，没有任何一步在真实 DSH 里跑过。

### 12.4 E3：`THIRD_PARTY_NOTICES.md` 的六处

| 行 | 现状 | 实际 |
|---|---|---|
| `:16` | `src/client/index.ts —— 对应上游 lib/parts/apply.part.js（装配：样式注入/assistant-step 渲染器注册）` | 样式注入与渲染器注册已移到 `src/client/features/width/index.ts` 与 `src/client/features/think/index.ts`；`src/client/index.ts` 现在只做装配协调 |
| `:18` | `src/index.ts —— 对应上游 lib/index.js（PROMPT_TEXT 与注入方式）` | `PROMPT_TEXT` 已移到 `src/host/chinesePrompt.ts` |
| `:57` | `src/client/motion/motion.ts` | **该文件已不存在**（批次② 已拆成 `motion/` 下的 **12** 个模块 —— 实测值，别写成 13） |
| `:59` | `src/client/motion/animate.ts` | **该文件已不存在**，对应物是 `src/client/motion/waapi.ts` |
| `:62` | `src/client/locales.ts` | 实际是 `src/client/core/locales.ts` |
| `:14`、`:58`、`:60`、`:61` | `src/client/think/thinkView.tsx`、`motion/settingsMotion.ts`、`motion/styles.ts`、`src/shared/motionSettings.ts` | **都还存在，不改** |

**⚠ `:18` 的措辞要小心**：`src/index.ts` 仍然是 host 端入口、仍然负责「注入方式」（它调用 `chinesePrompt` 的 controller）。**只把 `PROMPT_TEXT` 的归属指出来，不要说 `src/index.ts` 不再对应上游。**

**改法建议**：把「本地转写文件」这一列表从「一个文件对应一个上游文件」放宽为「本地文件（及它承载的上游对应物）」，逐条写清楚，例如 `src/client/motion/waapi.ts —— 对应上游 animate.ts（批次② 拆分后改名）`。**`motion.ts` 那一行不能简单删掉** —— 它是许可归属的凭证，必须说明它被拆到了哪里。

### 12.5 E4：`docs/refactor-plan.md` 的 §1

§1「现状实测」的整节（`:25-48` 及后续）是**重构起点 `823a98a` 的基线快照**（`src/` 26 文件 / 7686 行、`test/` 22 文件 / 3151 行、最大文件 `workspaceTabs.tsx` 1690 等），这些数字**作为历史基线是正确的，不要更新它们**（更新会让「重构究竟改了什么」失去参照）。

**要做的只有一件**：在 `### 1.1 规模` 之前插入一行醒目的标注，例如：

> **⚠ 本节是重构起点（`823a98a`）的实测值，用于对照「重构前后差异」。重构过程中文件已大量拆分，当前结构请看 [README 的项目结构](../README.md#项目结构)，不要拿本节的数字当现状。**

`:39` 那句「（README 结构树与任务描述全部偏低，重构时以本表为准）」**要改**：README 结构树即将（E1 后）以实测为准，这句会变成误导。改为「（旧文档的行数与任务描述全部偏低，重构时以本表为准）」。

### 12.6 E5：版本号与更新日志

1. `package.json` 的 `"version": "2.0.2"` → `"2.1.0"`（**只改这一行**；`package-lock.json` 若存在同名 version 字段也需同步，先 grep 确认）。
2. `README.md:374` 的 `## 更新日志` 下方的 `### 2.0.2` 之前插入 `### 2.1.0`。**内容要点（每条都要能落到具体文件，不要写空话）**：
   - **端点协议集中化**：`/api/width-slider` 的路径与五个方法名原以字符串字面量散落在 host 与 client 八处，改一处漏一处既无编译期也无运行时提示；现在集中在 `src/shared/endpointContract.ts`，并由新增的端点契约测试钉住字面量与请求形状。
   - **client 入口服务收敛**：`inject` 移除零消费者的 `connection`（client 侧的端点调用一直走原生 `fetch`，从不经过 `connection.rpc.call`）；host 侧的 `connection` / `webServer` 依赖不变，有必需性论证。
   - **命名收敛**：`settingsMotion.ts` 里那个模块私有的 `PANEL_FRAMES`（起点 `opacity 0` / `scale 0.62`）改名为 `SETTINGS_PANEL_FRAMES`，以区别于引擎里同名的面板入场帧表（`motion/frames.ts` 的 `PANEL_FRAMES`，起点 `opacity 0.5` / `translate 0 6px`）——两者同名不同物，此前只靠注释区分。
   - **删除恒 false 的菜单排除项**：`assignMenuItem.ts` 的 `excludeAttrs` 里有一个本插件旧版本自己的属性名，删掉后语义不变（排除表不需要包含自己的 `attr`，`menuInjection.ts` 的查找条件已覆盖）。
   - **测试**：新增 `MOTION_CSS` 快照、client 入口装配端到端覆盖（E1–E15）、端点契约测试；测试规模从 22 文件 / 228 项增至**（填实测值）**。
   - **文档**：README 结构树按当前实际的文件组织重写；第三方声明里六处已失效的文件路径更正。
   - **⚠ 结尾必须加一句诚实交代**：`以上改动由 tsc、vitest 与构建产物核对验证；本版本未在真实 DSH 进程里加载过端到端验证。`

### 12.7 不要做的事

1. **不要动 `dsh-src/`**（上游源码副本）。
2. **不要「顺手」更新 `docs/refactor-plan.md` 第 2 节以后各批的行号** —— 那是历史记录，E4 只加标注。
3. **不要重写 README 里任何历史版本的更新日志条目**（包括 `:386` 里 2.0.1 条目的 `PANEL_FRAMES`）—— 它们是当时的记录。**但 §12.6 的 2.1.0 新条目必须说明这次改名**，读者从新条目能追到旧名，这就够了。
4. **不要改 `README.md:267` 的 host 入口依赖表** —— 那是 host 侧，⑨-3 没动。
5. **不要新增或删除 README 的章节结构**（只改内容，不重组目录）。
6. **不要碰 `G2` / `G3`**（见 §12.1）。

### 12.8 验收判据

- `npx tsc -p tsconfig.test.json --noEmit` → exit 0（⑨-4 只改文档与 `package.json`，理论上不引入类型错误；跑它是为了证明「什么都没碰坏」）
- `npx vitest run` → 全绿，且**用例数与 ⑨-3 结束时完全一致**（本步不增删测试）
- `npm run build` → exit 0
- **两个产物 `lib/index.mjs` 与 `lib/client.js` 必须逐字节不变** —— ⑨-4 不动 `src/`，这是本步最强也最该成立的判据。开工前备份到 `$env:TEMP\batch9-4-base\`。
- **`git diff` 逐条审读**：预期只出现 `README.md`、`THIRD_PARTY_NOTICES.md`、`docs/refactor-plan.md`、`package.json`（以及可能的 `package-lock.json`）四个（或五个）文件。
- **README 结构树里的每个路径都要实测存在**：用一条命令对树里出现的所有 `src/...` 路径逐个 `Test-Path`，把结果写进报告。**这是 E1 的核心验收，不能靠肉眼。**
