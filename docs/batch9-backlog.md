# 批次⑨ 待办清单（汇总）

> 批次⑨ 是「统一命名与导出面 + 文档同步」收尾批。本文件把散落在 `docs/refactor-plan.md`、`docs/wsTabs-split-spec.md`、`docs/features-layer-spec.md`、`docs/host-split-spec.md` 与批次③④⑤⑥⑦ 裁定里的**全部遗留项**汇总成一份可勾选清单。
>
> **本文件刻意不写行号** —— 批次⑧ 会再动一次 host 侧，行号必然偏移；每条只写「职责 / 问题」，实施时重新定位。
>
> 汇总时间：批次⑧ 规格提交后（`c48d437`），批次⑧ 实施进行中。

---

## A. 命名与同源（消除同名不同物 / 重复字面量）

- [ ] **A1 `PANEL_FRAMES` 同名不同物** —— `src/client/motion/frames.ts` 的是「对话内嵌面板」（opacity + `translate` + `EASE_SETTLE`），`src/client/motion/settingsMotion.ts` 的是「设置弹窗重播」（opacity + `scale 0.62` + `EASE_SPRING`）。**这不是重复，是两个不同的东西共用一个名字**（批次③ 已核实元素、属性、曲线全不同）。要么改名区分，要么加注释说明。
- [ ] **A2 三处 `cubic-bezier(0.7, 0, 0.84, 0)` 字面量**（全在 `src/client/motion/styles.ts`）—— 服务的是 panel 关闭 opacity 160ms、panel 关闭 scale 280ms、mask 关闭 opacity 160ms。P1.y = P2.y = 0 ⇒ **accelerate（退出）曲线**，与 `waapi.ts` 里全是入场曲线的 `EASE_*` 常量方向相反，**当初没复用是设计意图**。可收敛为 `EASE_EXIT` 常量或 CSS 变量，**但不得与入场曲线合并**。
- [ ] **A3 `320ms` 与 `200ms` 的四处/两处出现** —— 批次③ 已核实为**数值巧合**（元素、属性、缓动全不同），**裁定不合并**。此处只做「加注释说明为何不同源」，不做常量统一。**若认为注释已足够，可勾掉。**
- [ ] **A4 `src/client/motion/styles.ts` 顶部存在一条过时注释** —— 内容引用了批次③ 前的结构，需按现状改写。

## B. 死代码与导出面收敛

- [ ] **B1 `merge.sync()` 死导出面** —— 生产代码**零调用**，但 `test/sidebarToolsMerge.test.ts` 有 8 处（`:86`、`:176`、`:179`、`:189`、`:199`、`:202`、`:215`、`:227`）。批次⑦ 裁定「本批不动」（改它会动 `lib/client.js` 字节）。收敛时**必须同步改那 8 处测试**。
- [ ] **B2 `'data-ws-assign-item'` 死条件** —— `src/client/patches/wsTabs/assignMenuItem.ts` 的模板排除表第二项与自身 `WS_ASSIGN_MENU_ATTR = 'data-ws-assign-tab-item'` 不同，`hasAttribute` **恒为 `false`**（自身排除由第一项 `data-session-delete-item` 承担）。批次⑤ D2 裁定「逐字保留」。
- [ ] **B3 `groupRevision` 在 disposer 不重置** —— `src/client/patches/wsTabs/groupsStore.ts` 的 disposer 重置了 `rpcCall` / `groupReady` / `groupLoadFailed` / `groups` 四项而**独漏 `groupRevision`**。看不出是刻意的；它只影响「读回时用起始 revision 判是否被覆盖」这一条判据。批次⑥ Q8 裁定「逐字保留」。**若确认无害可勾掉并补一行注释说明。**
- [ ] **B4 `workspaceTabs.tsx:13` 与 `scripts/clean-lib.mjs:6` 的注释提到了已删除的 `assignSession`** —— 陈旧引用。
- [ ] **B5 `MOTION_CSS` 全仓零测试覆盖** —— 批次③ 把它从字符串拼接改为常量插值，唯一的回归网是产物比对。建议**先补一条字符串快照断言，再做 A1-A3 的改动**，否则收敛过程中没有安全网。

## C. 分层余留

- [ ] **C1 `patches/wsTabs/domContract.ts` 的四个宿主 DOM 函数搬 `official/`** —— `locateHeader`、`isLabelNode`、`findOpenProjectRow`、`workspaceInfoFromRow`。第 5 节的终局目标是「`official/` 是宿主 DOM 唯一声明处」，批次⑥ Q4 因该批风险太高且这四个函数夹带中英文硬编码文案数组（`LABEL_WORDS`、`SEARCH_PLACEHOLDERS`）而不符合 `official/` 的纯契约定位，**未搬**。搬之前需要先决定那两组文案的去处。
- [ ] **C2 `src/client/widthPrefs.ts` 归位** —— `features/width/index.ts → widthPrefs.ts` 是当前**已知且被接受的反向依赖**（`widthPrefs.ts` 仍留在 `client/` 根）。按终局结构它应迁入 `features/width/` 或 `core/`。
- [ ] **C3 `src/client/WidthSliderControl.tsx` / `WidthSliderSettings.tsx` / `sessionDelete.ts` / `sidebarToolsMerge.ts` 仍在 `client/` 根** —— 终局结构里应分别归入 `features/width/`、`features/sessionDelete/`、`features/sidebarTools/`（或 `patches/`）。**注**：批次⑦ 的 Q5 口径只覆盖了 `client/index.ts`，这三个组件不在任何已批准批次里 —— **若要做，需先确认是否属批次⑨ 范围。**
- [ ] **C4 `inject` 里零消费者的 `connection`** —— `src/client/index.ts` 的 `inject = ['slots','locale','connection','sessions','workspaces']` 中 `connection` 零使用（`core/endpointChannel.ts` 明写不走 `connection.rpc.call`，用原生 fetch）。批次⑦ 裁定 10 的配套项。**#注意**：host 侧 `src/index.ts` 的 `inject` 里的 `connection` / `webServer` 是**必需的**（有注释论证），**不要动 host 侧**。

## D. 类型收紧

- [ ] **D1 `src/env.d.ts` 的 `ClientContext = $TS_FIXME = any`** —— 导致 `ctx.*` 的 TS 保护完全退化（`any & X = any`）。批次⑦ 裁定 10：给 `features/*/index.ts` 定义最小本地接口属**新增抽象**，本批范围外。收紧时**必须先建立安全网**（`src/client/index.ts` 是全仓唯一零测试覆盖的源文件）。
- [ ] **D2 账本形状断言** —— `src/client/index.ts` 里那 5 行 `ctx as unknown as { sessions: { list: { getSnapshot: () => { current?: string; byId: Record<string, { blank?: boolean } | undefined> } } } }` 是**全仓唯一记录宿主会话账本形状的地方**（批次⑦ 裁定 6 坚持恢复的）。**D1 收紧类型时以它为准**，不要删。

## E. 文档同步

- [ ] **E1 `README.md` 的项目结构树已过期** —— 仍写着 `workspaceTabs.tsx` 338 行、`WidthSliderSettings.tsx` 477 行等批次① 前的数字。需按现状重写（`src/` 的 8 批重构后的真实树）。
- [ ] **E2 `README.md` 的测试计数** —— 仍写 22 文件 / 228 项；现状是 **28 文件 / 268 用例**。验证状态段（含 2.0.1 / 2.0.2 行）也需更新。
- [ ] **E3 `THIRD_PARTY_NOTICES.md:18`** —— 写「`src/index.ts` —— 对应上游 `lib/index.js`（`PROMPT_TEXT` 与注入方式）」。批次⑧ 后 `PROMPT_TEXT` 移到 `src/host/chinesePrompt.ts`，**需同步路径**。
- [ ] **E4 计划文件自身** —— 第 1、2 节的 client 侧行号是批次① 前的口径，已整体偏移（批次③④⑦ 各更正过一次）。收尾时应重跑一次实测口径并统一。
- [ ] **E5 `package.json` 版本号** —— 当前 2.0.2；整仓重构完成后应升版（并写更新日志）。

## F. 测试补充

- [ ] **F1 `MOTION_CSS` 字符串快照断言** —— 同 B5。
- [ ] **F2 `src/client/index.ts` 的端到端覆盖** —— 全仓唯一零直接覆盖的源文件（对照：`src/index.ts` 有 `test/hostEndpoints.test.ts:17/:43` 的直接覆盖）。批次⑦ 的 `test/features.test.ts` 只覆盖注册表抽象，**没覆盖入口自身的装配逻辑**。这是本仓最大的测试缺口。
- [ ] **F3 端点协议契约测试**（见 G1）。

## G. 其他

- [ ] **G1 建 `src/shared/endpointContract.ts`** —— 计划第 2 节把「端点协议契约散落」列为最大结构缺口之一：路径 `/api/width-slider` 与 5 个方法名散落在 client 5 处 + host 1 处，响应形状 `{ok,value}` / `{ok:false,error}` 只写在 client 的一处注释里。host 与 client 同时需要的**纯契约**应集中为常量 + 类型。批次⑧ 裁定「只动 host，不做跨端契约集中」，留给批次⑨。
- [ ] **G2 `label: 'Width Slider'` 硬编码英文与并存的 `locale: NS`** —— 宿主是否支持 label 走词典**无证据**（批次⑦ 裁定 15）。**无证据不要改。**
- [ ] **G3 `SETTINGS_DIALOG_SELECTOR` 的 `div` 前缀** —— 批次③ 唯一的潜在行为面收窄：宿主若改用非 `div` 容器，严口径会静默失效。**属已记录风险，不一定需要动作。**

---

## 批次⑨ 的验证策略（预先记下）

批次⑨ 与前面所有批次都不同：**它会有真实行为面改动**（死代码删除、导出面收敛、`widthPrefs` 归位），因此：

- **不能再靠「`lib/client.js` 逐字节不变」当判据** —— 那一批本来就要动 client bundle。
- 判据改为：**测试全绿 + `git diff` 逐条审读 + 每一处删除都先在测试里找到覆盖**。
- **B1（`merge.sync()`）必须先确认那 8 处测试断言的是真实行为**，而不是「抄了实现」。
- **B5 / F1（`MOTION_CSS` 快照）必须在 A1-A3 改动之前落地**，否则 A1-A3 没有回归网。
