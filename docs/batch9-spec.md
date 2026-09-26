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
