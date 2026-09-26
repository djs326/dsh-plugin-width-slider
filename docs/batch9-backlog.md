# 批次⑨ 待办清单（汇总）

> **✅ 批次⑨ 全部完成（11 次提交）。** 本清单 26 条全部关闭：⑨-1 测试安全网（`625716f` / `249f77c`）、⑨-2 命名与死条件收敛（`05093ef`）、⑨-3 端点契约集中化（`b7e72e2` / `71eabc3`）、⑨-4 文档同步与升版（`d5a25ab`）。测试由 28 文件 / 268 用例增至 **31 文件 / 305 用例**；版本号升到 **`2.1.0`**。范围裁定与实施留档见 `docs/batch9-spec.md` §6–§12。
>
> 批次⑨ 是「统一命名与导出面 + 文档同步」收尾批。本文件把散落在 `docs/refactor-plan.md`、`docs/wsTabs-split-spec.md`、`docs/features-layer-spec.md`、`docs/host-split-spec.md` 与批次③④⑤⑥⑦ 裁定里的**全部遗留项**汇总成一份可勾选清单。
>
> **本文件刻意不写行号** —— 批次⑧ 会再动一次 host 侧，行号必然偏移；每条只写「职责 / 问题」，实施时重新定位。
>
> 汇总时间：批次⑧ 规格提交后（`c48d437`），批次⑧ 实施进行中。

---

## A. 命名与同源（消除同名不同物 / 重复字面量）

> **A1–A4 全部关闭（⑨-2 已完成，提交 `05093ef`）。** A1（改名）与 A2（抽 `EASE_EXIT`）已实施；A3、A4 经实读复核为**无需动作**（注释早已存在 / 假阳性）。**A1 的实测口径更正**：正确的改动是 **4 处**（`:64` 注释 / `:76` 声明 / `:172` / `:305`），**`:63` 的 `PANEL_FRAMES` 指的是 `motion/frames.ts` 的导出常量，必须保持原名**。详见 `docs/batch9-spec.md` §10。

- [x] **A1 `PANEL_FRAMES` 同名不同物** —— `src/client/motion/frames.ts` 的是「对话内嵌面板」（opacity + `translate` + `EASE_SETTLE`），`src/client/motion/settingsMotion.ts` 的是「设置弹窗重播」（opacity + `scale 0.62` + `EASE_SPRING`）。**这不是重复，是两个不同的东西共用一个名字**（批次③ 已核实元素、属性、曲线全不同）。要么改名区分，要么加注释说明。
  - **裁定（用户已确认）：改名。** `settingsMotion.ts:76` 的模块私有 `PANEL_FRAMES` → **`SETTINGS_PANEL_FRAMES`**（`:172` / `:305` 两处引用同步改）。**两处解释同名不同源的注释其实早已存在**（`settingsMotion.ts:62-66`、`src/client/motion/styles.ts:21`），所以要做的是「改名 + 同步这两处注释的指向」，不是「补注释」。
  - **⚠ 测试耦合（主会话探针实测发现）**：`test/motionStyles.test.ts` 的第 6 条断言用 `/const PANEL_FRAMES[^=]*=\s*\[/` **从源码读**该常量，改名后**失配**（`expected null not to be null`）⇒ 改名必须同时改 `:115` 的 `it` 名、`:120` 的正则、`:121` 的提示文案。实测输出与全文见 `docs/batch9-spec.md` §7.1.1。
- [x] **A2 三处 `cubic-bezier(0.7, 0, 0.84, 0)` 字面量**（全在 `src/client/motion/styles.ts`）—— 服务的是 panel 关闭 opacity 160ms、panel 关闭 scale 280ms、mask 关闭 opacity 160ms。P1.y = P2.y = 0 ⇒ **accelerate（退出）曲线**，与 `waapi.ts` 里全是入场曲线的 `EASE_*` 常量方向相反，**当初没复用是设计意图**。可收敛为 `EASE_EXIT` 常量或 CSS 变量，**但不得与入场曲线合并**。
  - **裁定：抽 `EASE_EXIT` 常量，留在 `styles.ts` 本地且不导出。** **不要**放进 `waapi.ts`（那里全是入场曲线，塞进去会制造新的「同名不同物」）。`MOTION_CSS` 的运行时取值必须**逐字节不变**（`styles.ts:23` 明写此要求）—— 模板串插值在编译期展开，常量值一样则字符串一样。**这条有 ⑨-1 的 `test/motionStyles.test.ts` 保护。**
- [x] **A3 `320ms` 与 `200ms` 的四处/两处出现** —— 批次③ 已核实为**数值巧合**（元素、属性、缓动全不同），**裁定不合并**。此处只做「加注释说明为何不同源」，不做常量统一。**若认为注释已足够，可勾掉。**
- [x] **A4 `src/client/motion/styles.ts` 顶部存在一条过时注释** —— 内容引用了批次③ 前的结构，需按现状改写。
  - **裁定：存疑，实施时重新定位。** 主会话读 `styles.ts:1-11` 后认为它描述的是**当前状态**（「入场是命令式 Web Animations，这里保留的声明式只有关闭那一拍」），**可能已经不过时**。⑨-2 实施时先重读，确认无问题就勾掉本行并写明「已复核，无需动作」—— **不要为了「有事可做」而改注释**。

## B. 死代码与导出面收敛

> **B1–B3 全部关闭（⑨-2 已完成，提交 `05093ef`）。** B1（加注释）与 B2（删死条件）已实施；**B3 经实读复核为无需动作**（`groupsStore.ts:257` 的注释确实已存在）。**B1 的产物侧特点**：`SidebarToolsMergeHandle` 是 TS interface，esbuild 整体擦除，故 B1 **不产生任何 `lib/client.js` hunk** —— 实测两版产物 grep 其注释文本均 0 命中。

- [x] **B1 `merge.sync()`** —— 生产代码**零调用**，但 `test/sidebarToolsMerge.test.ts` 有 8 处（`:86`、`:176`、`:179`、`:189`、`:199`、`:202`、`:215`、`:227`）。批次⑦ 裁定「本批不动」（改它会动 `lib/client.js` 字节）。
  - **裁定（用户已确认）：保留 + 加注释，不删。** 它是**测试驱动该模块的唯一显式入口**（语义是「改开关后立即重同步」）；删掉它意味着那 8 处要从「显式同步」改成「等 observer 的 40ms」（`settle()`）—— **改动的是测试语义，不只是路径**，收益抵不上风险。本行原定性「死导出面」是**只看生产调用方**得出的结论。⇒ ⑨-2 只给 `SidebarToolsMergeHandle.sync` 加一行注释说明这一点。
- [x] **B2 `'data-ws-assign-item'` 死条件** —— `src/client/patches/wsTabs/assignMenuItem.ts:42` 的模板排除表第二项与自身 `WS_ASSIGN_MENU_ATTR = 'data-ws-assign-tab-item'` 不同，`hasAttribute` **恒为 `false`**。批次⑤ D2 裁定「逐字保留」。
  - **裁定：删。** 依据 `src/client/official/menuInjection.ts:95` 的实测实现 —— `.find((el) => !el.hasAttribute(attr) && excludeAttrs.every((name) => !el.hasAttribute(name)))`：**`attr` 本身已被第一个条件覆盖 ⇒ `excludeAttrs` 的语义是「除我自己的 `attr` 之外还要排除哪些别人的项」，不需要包含自己。** 而 `'data-ws-assign-item'` 是**本插件旧版本的自有属性**（`assignSession.ts` 删除后全仓零写入方，见 `docs/refactor-plan.md:119`），不是上游属性 ⇒ 恒 `false` 的死条件，删除不可观测。**保留第一项 `'data-session-delete-item'`**（对应 `src/client/sessionDelete.ts:357` 的 `MENU_DELETE_ATTR`）。注意 `excludeAttrs` **全仓零测试覆盖**（`grep` 在 `test/` 下无命中）—— 这条只有逻辑论证、没有测试保护。
- [x] **B3 `groupRevision` 在 disposer 不重置** —— `src/client/patches/wsTabs/groupsStore.ts` 的 disposer 重置了 `rpcCall` / `groupReady` / `groupLoadFailed` / `groups` 四项而**独漏 `groupRevision`**。看不出是刻意的；它只影响「读回时用起始 revision 判是否被覆盖」这一条判据。批次⑥ Q8 裁定「逐字保留」。**若确认无害可勾掉并补一行注释说明。**
- [x] ~~**B4 `workspaceTabs.tsx:13` 与 `scripts/clean-lib.mjs:6` 的注释提到了已删除的 `assignSession`**~~ —— **已复核为假阳性，撤销本行。** `scripts/clean-lib.mjs:6`（「that is how stale `openWith/*.d.ts` and `assignSession.d.ts` reached the 1.0.2 tarball」）是**历史事实陈述**；`src/client/patches/wsTabs/index.tsx:13`（「会话级「分配工作区」已按用户确认废除（assignSession.ts 已删除）」）是**模型说明的一部分**，解释为什么当前语义里没有会话级分配。两处都是**正确的历史记录，不是陈旧引用**，无需动作。（另注：原行把路径写成 `workspaceTabs.tsx:13`，实际在 `patches/wsTabs/index.tsx:13`。）
- [x] **B5 `MOTION_CSS` 全仓零测试覆盖** —— 批次③ 把它从字符串拼接改为常量插值，唯一的回归网是产物比对。**⑨-1 已落地**（`test/motionStyles.test.ts`），本行与 F1 合并关闭。

## C. 分层余留

- [x] ~~**C1 `patches/wsTabs/domContract.ts` 的四个宿主 DOM 函数搬 `official/`**~~ —— **已评估，明确不做（用户已确认）。** 理由：纯搬移，**零行为收益**，但要改大量 import 与测试路径；而它夹带的 `LABEL_WORDS` / `SEARCH_PLACEHOLDERS` 两组中英文文案数组与 `official/` 的纯契约定位不符，搬之前还得先决定文案去处 —— 风险与收益不成比例。终局结构不要求在本次重构里一次性达成。**本条不再重新讨论。**
- [x] ~~**C2 `src/client/widthPrefs.ts` 归位**~~ —— **排除，与 C3 绑定。** 单独做 C2 会**制造一个新的反向依赖**：`features/width/index.ts` 的 import 会转向 ✔，但仍在 `client/` 根的 `src/client/WidthSliderControl.tsx:36` 会从「根内同级 `'./widthPrefs.ts'`」变成「**根依赖 features** `'./features/width/widthPrefs.ts'`」✘。必须与 C3 同批做（做完 C3，`WidthSliderControl.tsx` 本身也在 `features/width/` 里）—— **C3 已排除，故 C2 一并排除。** 实测消费者 5 处：`src/client/WidthSliderControl.tsx:36`、`src/client/features/width/index.ts:1`、`test/widthPrefs.test.ts:12`、`test/widthSliderKeyboard.test.ts:12-13`、`:22`。（backlog 的另一个选项「或 `core/`」能同时消除两个反向依赖，但 `widthPrefs.ts` 是**宽度功能的持久化**、不是跨功能基础设施，与 `core/` 定位不符，不采用。）
- [x] ~~**C3 `src/client/WidthSliderControl.tsx` / `WidthSliderSettings.tsx` / `sessionDelete.ts` / `sidebarToolsMerge.ts` 仍在 `client/` 根**~~ —— **已评估，明确不做（用户已确认）。** 四个文件实测 649 + 522 + 426 + 374 = **1971 行**，纯搬移、零行为收益，但要改大量 import 与测试路径。风险与收益不成比例。**本条不再重新讨论。**
- [x] **C4 `inject` 里零消费者的 `connection`** —— **⑨-3 已落地**（提交 `b7e72e2`）。`src/client/index.ts` 的 `inject` 由五项减为四项（`slots`/`locale`/`sessions`/`workspaces`）；**host 侧的 `connection` / `webServer` 未动**（有必需性论证）。`lib/index.mjs` 在本次提交后 sha256 仍为 `122D91D3…F242D3` / 26 652 B，逐字节不变 —— 证明 host 侧确实没被误动。
  - **⚠ 测试耦合（⑨-1 子代理在「需裁决项」里主动报出）**：`test/clientEntry.test.ts` 的 E1 按现状钉住**五项**，删掉 `'connection'` 后 E1 会红（形态见 `docs/batch9-spec.md` §9.3 的探针 P1）⇒ **必须与 E1 的期望值同步改**（五项 → 四项、`it` 名里 `five` → `four`）。这正是 ⑨-1 想守的契约：删一个服务名必须是有意识动作。

## D. 类型收紧

- [x] ~~**D1 `src/env.d.ts` 的 `ClientContext = $TS_FIXME = any`**~~ —— **不做：需要外部条件，不是本仓内的重构任务。** 三条依据：① **本仓拿不到真实类型** —— `src/env.d.ts:4` 明写「作为外部插件…不安装 DSH monorepo 内部包」，实测 `node_modules/@deepseek-ai/dsh-client-runtime` 路径不存在，任何手写接口都是猜的形状；② **现有代码里有刻意的防御性写法，与「已知形状」直接冲突** —— `src/client/patches/wsTabs/index.tsx:541` 的 `ctx.slots?.register`、`:571` 的 `typeof ctx.slots?.entries === 'function' ? … : []`、`:608` 的 `typeof ctx.slots?.subscribe === 'function'`，作者用可选链与运行时 `typeof` 主动防了不同宿主版本；类型一旦声称这些成员必然存在，这些检查就只能删掉，等于用类型否认作者已观察到的现实；③ 收益只在编译期，风险是误报或误导。**正确的前置条件是拿到真实宿主类型**（安装 DSH 内部包，或在 `tsconfig` 里 `paths` 挂到 DSH 检出）。**在那之前 `any` 是诚实的选择。**
- [x] **D2 账本形状断言** —— **保留，不动（⑨-4 复核）。** `src/client/index.ts` 里那 5 行 `ctx as unknown as { sessions: { list: { getSnapshot: () => { current?: string; byId: Record<string, { blank?: boolean } | undefined> } } } }` 是**全仓唯一记录宿主会话账本形状的地方**（批次⑦ 裁定 6 坚持恢复的）。**D1 收紧类型时以它为准**，不要删。

## E. 文档同步

- [x] **E1 `README.md` 的项目结构树已过期** —— **⑨-4 已重写**（提交 `d5a25ab`）。新树按当前实际文件组织：host 侧补上批次⑧ 五个新模块、`shared/endpointContract.ts` 与 `shared/types.ts`、client 的 `core/`(9) / `features/`(3) / `official/`(3) / `patches/`(settingsPanel + wsTabs)，`env.d.ts` 归到 `src/` 下，`workspaceTabs.tsx` 标注为兼容转发壳。**验收方式是树里 55 个路径逐个 `Test-Path` 实测存在（全部 True），不靠肉眼。**
- [x] **E2 `README.md` 的测试计数** —— **⑨-4 已更新**为 **31 个用例文件、305 项**（⑨-1 后为 30 / 292；⑨-3 新增端点契约测试后为 31 / 305）。验证状态表补了一行「端点契约集中化与入口服务收敛（2.1.0）」。
- [x] **E3 `THIRD_PARTY_NOTICES.md` 的失效路径** —— **⑨-4 已更正六处**（提交 `d5a25ab`）。除原列的 `src/index.ts` → `src/host/chinesePrompt.ts` 外，实测还发现 `motion/motion.ts` 与 `motion/animate.ts` **两个文件已不存在**（前者拆成 `motion/` 下 12 个模块、后者改名 `waapi.ts`）—— 那是许可归属的凭证，**保留行并写清去向**，不删；另有 `src/client/locales.ts` → `core/locales.ts`；样式注入与渲染器注册 → `features/{width,think}/`。
- [x] **E4 计划文件自身** —— **⑨-4 已加标注**（提交 `d5a25ab`）。`docs/refactor-plan.md` §1 顶部插入「本节是重构起点 `823a98a` 的实测值，用于对照重构前后差异，不要拿它当现状」；`:39` 的措辞由「README 结构树与任务描述全部偏低」改为「旧文档的行数与任务描述全部偏低」。**§1 的历史数字一个都没改**（改了会让前后对照失去参照）。
- [x] **E5 `package.json` 版本号** —— **⑨-4 已升到 `2.1.0`**（提交 `d5a25ab`，共 3 处：`package.json:5`、`package-lock.json:3`、`:9`；`package-lock.json:1838` 的 `2.0.2` 是 `require-from-string` 的版本号，巧合，未动）。README 更新日志新增 `### 2.1.0`，结尾按规格写明「本版本未在真实 DSH 进程里加载过端到端验证」。

## F. 测试补充

- [x] **F1 `MOTION_CSS` 字符串快照断言** —— 同 B5。**⑨-1 已落地**（`test/motionStyles.test.ts`）。
- [x] **F2 `src/client/index.ts` 的端到端覆盖** —— **⑨-1 已落地**（`test/clientEntry.test.ts`，595 行 / 18 用例，覆盖 E1–E15：inject 五项、5 条 effect 的名字与序、8 槽位 want 矩阵、会话账本适配器含降级告警、`cancelled` 短路、settings.section 载荷）。原缺口描述：全仓唯一零直接覆盖的源文件（对照：`src/index.ts` 有 `test/hostEndpoints.test.ts:17/:43` 的直接覆盖）。批次⑦ 的 `test/features.test.ts` 只覆盖注册表抽象，**没覆盖入口自身的装配逻辑**。
  - **未覆盖的尾巴**：`MOTION_CSS` 的注入点（`src/client/features/motion/index.ts:42` 的 `style.textContent = MOTION_CSS`）仍无测试；`inject` 里第 4 项之外的服务也暂无保护。见 `docs/batch9-spec.md` §9.6。
- [x] **F3 端点协议契约测试** —— **⑨-3 已落地**（提交 `71eabc3`，`test/endpointContract.test.ts`，129 行 / 13 用例）。钉住：路径字面量、五个方法名（**独立写死的字面量，不是用常量比自己**）、键集与值集一致、host 分发器认得每一个方法、契约外的方法被拒、成功分支 `{ok:true,value}`、**失败分支的 `error` 是 `{code,message}` 对象而非字符串**、client 请求形状（POST + `content-type` + body 形状）、非 2xx 抛 `endpoint <path> failed: HTTP <status>`。三条变异探针实测：P1 路径改错字 → 3 红；P2 方法名改错字 → 4 红；P3 删 `'sessions'` → 1 红（⑨-1 的 E1 在 C4 之后仍有效）。

## G. 其他

- [x] **G1 建 `src/shared/endpointContract.ts`** —— **⑨-3 已落地**（提交 `71eabc3`）。新建 42 行契约模块：`WIDTH_SLIDER_ENDPOINT = '/api/width-slider'`、`ENDPOINT_METHOD`（5 键，`as const`）、`EndpointMethod`、`EndpointOk<T>` / `EndpointErr` / `EndpointResult<T>`。八处消费者全部改为引用常量。**⚠ 实现时钉住的事实**：host `src/host/api.ts` 的失败分支返回的是 `{ok:false, error:{code, message}}` —— **`error` 是对象，不是字符串**（早先笔记粗记为 `{ok:false,error}`，不准确）。两条产物各 +26 行（各多一份契约模块定义）；**rollup 没有把 `ENDPOINT_METHOD.readSettings` 折叠回字面量**，产物里保留属性访问 —— 值相同故行为等价，但这是本批唯一进入产物的运行时代码形状变化。
- [x] **G2 `label: 'Width Slider'` 硬编码英文与并存的 `locale: NS`** —— **不改（无证据）。** 宿主是否支持 label 走词典（批次⑦ 裁定 15）**仍无证据**，本仓拿不到宿主源码。**维持现状是诚实的选择。**
- [x] **G3 `SETTINGS_DIALOG_SELECTOR` 的 `div` 前缀** —— **已记录风险，不做动作。** 批次③ 唯一的潜在行为面收窄：宿主若改用非 `div` 容器，严口径会静默失效。宿主四个 modal 实测均为 `<div role="dialog" aria-modal="true">`；改成属性选择器会放宽口径、反而引入误命中风险。

---

## 批次⑨ 的验证策略（预先记下）

批次⑨ 与前面所有批次都不同：**它会有真实行为面改动**（死代码删除、命名收敛），因此：

- **不能再靠「`lib/client.js` 逐字节不变」当判据** —— ⑨-2 本来就要动 client bundle（⑨-3 若做 G1 也会动）。
- 判据改为：**测试全绿 + `git diff` 逐条审读 + 每一处删除都先在测试里找到覆盖**。
- **B1（`merge.sync()`）必须先确认那 8 处测试断言的是真实行为**，而不是「抄了实现」。
- ~~**B5 / F1（`MOTION_CSS` 快照）必须在 A1-A3 改动之前落地**~~ —— **✅ 已完成**：⑨-1 已落地 `test/motionStyles.test.ts`（6 用例）与 `test/clientEntry.test.ts`（18 用例），全量 **30 文件 / 292 用例**，`lib/index.mjs` 与 `lib/client.js` 与基线**逐字节相同**（`src/` 零改动）。**A1–A3 现在有回归网了。**
- **反向提醒（⑨-1 实测得出）**：新加的回归网**会让某些改动主动变红** —— A1 改名撞 `test/motionStyles.test.ts` 第 6 条的源码读正则、C4 删服务名撞 `test/clientEntry.test.ts` 的 E1。**这些红是契约在起作用，必须同步改测试，不是「改动做错了」**（详见 `docs/batch9-spec.md` §7.1.1 与 §8.3）。

---

## 批次⑨ 的实际验证结果（事后补记）

| 步骤 | 判据 | 结果 |
|---|---|---|
| ⑨-1 | `src/` 零改动 ⇒ 两个产物逐字节不变 | ✔ 两个产物均与基线相同；测试 28/268 → 30/292 |
| ⑨-2 | `lib/index.mjs` 逐字节不变（client-only 改动） | ✔ host 侧产物未变；测试维持 30/292 |
| ⑨-3 第 1 步（C4） | `lib/index.mjs` 逐字节不变 | ✔ `122D91D3…F242D3` / 26 652 B 不变 |
| ⑨-3 第 2 步（G1/F3） | 两个产物**都变**，须 hunk 可归因 | ✔ 各 +26 行 = 各多一份契约模块；契约字符串与五个方法名仍在；测试 30/292 → 31/305 |
| ⑨-4 | 只改文档与 `package.json` ⇒ 两个产物逐字节不变 | ✔ `9CF6941D…ED7289` / 27 935 B、`673D9E22…45CABBF` / 271 529 B |

**⑨-3 的意外发现（值得记）**：变异探针 P2（把 `readSettings` 的值改成 `readSetting`）**没有**让「host 分发器认得每一个方法」那条断言变红 —— 因为 host 与 client 读的是同一个 `ENDPOINT_METHOD`，值一起漂移、两端仍然一致。**这不是缺陷，恰是集中化的效果**；也正因如此，**对外契约只能由「与实现无关地独立写下的字面量」来守** —— 如果测试也用 `ENDPOINT_METHOD.readSettings` 去比自己，P2 会让 13 条全绿。

**全程未做的事（诚实交代）**：没有在真实 DSH 进程里加载过任何一批的产物。所有验证都是 tsc / vitest / 构建产物哈希 / 源码实读四类。
