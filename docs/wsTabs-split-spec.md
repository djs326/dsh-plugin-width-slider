# 批次⑥ 实施规格：拆 `src/client/workspaceTabs.tsx`

**本文档是批次⑥ 的唯一实施依据。** 全部行号为工作树 `5700aa6` 实测（含 docs 追加），口径 `(Get-Content).Count`。批次⑥ 的裁定见 `docs/refactor-plan.md` 的「批次⑥ 的规格裁定」段。

**红线**：本批是**纯搬移**，除「唯一非纯搬移之处」一节列出的 5 行外，不得有任何行为变化。

---

## 1. 目标与产物

把 `src/client/workspaceTabs.tsx`（**1661 行**）拆成 `src/client/patches/wsTabs/` 下 8 个文件，**分 3 次提交**。

| 文件 | 职责（行号来源） | 预估行数 | 导出面 |
|---|---|---|---|
| `groupsStore.ts` | R2 `:169-394` + 常量 `:64`(DEFAULT_TAB) `:66`(FLAT_SESSION_ORDER_KEY) `:68` `:70` | ~230 | `useGroups, groupOf, commitGroups, loadGroups, getGroupSnapshot, subscribeGroups, sanitize, setRpcCall, resetGroupsStore, DEFAULT_TAB, FLAT_SESSION_ORDER_KEY` |
| `messages.ts` | `T:134-161` + `tt:162-168` + `T_WS:507-514` + `ttw:515-521` | ~60 | `tt, ttw` |
| `scope.ts` | R3 `:396-452` + `useWsTabsEnabled:388-394` + 三个类型 `:89-108` | ~95 | `filterSessions, filterWorkspaces, unownedSessionIds, useWsTabsEnabled` + 类型 |
| `domContract.ts` | R4 `:454-493` + `:524-552` | ~90 | `locateHeader, findOpenProjectRow, workspaceInfoFromRow` |
| `assignMenuItem.ts` | R5 的 `:554-601`（`I` 图标不在此，见下方更正） | 实测 **69**（原估 ~130 偏高） | `ensureWorkspaceAssignMenuItem, assignWsToTab, WS_ASSIGN_MENU_ATTR, ASSIGN_TAB_EVENT` |
| `TabStrip.tsx` | R7 `:679-886` + `TABS_CSS:76-87` | ~220 | `TabStrip, TABS_CSS` |
| `dialogs.tsx` | R8 `:888-1128` + `AssignTabPicker:604-677` | ~330 | `RenameDialog, MembersDialog, DeleteDialog, AssignTabPicker` |
| `index.tsx` | R1 余部（注释/import/类型/`WS_TABS_MARK`）+ R9 `:1130-1661` | ~400 | `installWorkspaceTabs, WS_TABS_MARK` + re-export `WsGroup, WsTabsCtx` |

**实施期更正（`I` 图标的归属）**：`I`（原 `:496`）**落 `TabStrip.tsx` 而非 `assignMenuItem.ts`**。上表的归属列写的是「行号来源」，是个描述性字段；照它字面执行会强制 `assignMenuItem.ts` 导出一个本该内部的常量，并凭空多一条 `TabStrip → assignMenuItem` 边。真正的判据是**「唯一消费者在哪」**——`I` 的唯一消费点是 `TabStrip` 的渲染。

`src/client/workspaceTabs.tsx` **退化为 re-export 壳**（约 4 行）：

```ts
export { installWorkspaceTabs, WS_TABS_MARK } from './patches/wsTabs/index.tsx'
export type { WsGroup, WsTabsCtx } from './patches/wsTabs/index.tsx'
```

这样 `src/client/index.ts:29`、`src/client/index.ts:337`、`test/workspaceTabsDialogs.test.ts:55` **三处零改动**。这是保留壳的唯一理由，不可省略。

### 三次提交的切分

- **提交 1（纯逻辑、零 UI）**：新建 `groupsStore.ts` + `messages.ts` + `scope.ts` + `domContract.ts`；`workspaceTabs.tsx` 改为 import 这四个。
- **提交 2（UI 组件）**：新建 `TabStrip.tsx` + `dialogs.tsx` + **`assignMenuItem.ts`**（**实施期更正**：原切分漏排此文件，但 `dialogs.tsx` 的 `AssignTabPicker` 调 `assignWsToTab`，而本规格禁止复制该逻辑，故提交 2 不建它就不编译）。
- **提交 3（壳与装配）**：新建 `index.tsx`；`workspaceTabs.tsx` 退化为 re-export 壳。

提交 1 的危险类型是**状态语义**，提交 2/3 是**时序与引用相等**；分开提交是为了让 `vitest` 失败能定位到更小范围。

### 现状 import 块（`:43-60`，拆分后要重新分配）

- `:43-54` `react` → `createElement as h, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode`
- `:55` `react-dom` → `createPortal`
- `:56` `./core/lang.ts` → `isZhInterface`
- `:57` `./core/config.ts` → `getSettings, onSettingsChanged`
- `:58` `./core/endpointChannel.ts` → `callEndpoint`
- `:59` `./core/primitives.ts` → `primitives`
- `:60` `./official/menuInjection.ts` → `findOpenMenu, injectMenuItem, MENU_ITEM_SELECTOR`

### 依赖方向（必须无环）

```
index.tsx  →  groupsStore, messages, scope, domContract, assignMenuItem, TabStrip, dialogs
dialogs    →  groupsStore, messages, assignMenuItem, scope
assignMenuItem → groupsStore, messages, domContract, official/menuInjection
TabStrip   →  groupsStore, messages
groupsStore → messages
messages   →  core/lang.ts        ← 只此一条，不得 import 任何其它 wsTabs 文件
```

最后一行的两条边（`TabStrip → groupsStore, messages`）与 `dialogs` 的后两条边（`→ assignMenuItem, scope`）是**实施期实测补齐**的：起草本图时按「行号来源」推断了归属，漏掉了 `AssignTabPicker` 调 `assignWsToTab`（`dialogs → assignMenuItem`）、`dialogs` 需要 `WorkspaceLike` 类型（`dialogs → scope`）、以及 `TabStrip` 读分组与 `ttw`（`TabStrip → groupsStore, messages`）。实测无环，方向不变。

`messages.ts` 若 import 其它 wsTabs 文件，会与 `groupsStore`（其 `sanitize` 依赖 `tt`）成环。

---

## 2. 唯一非纯搬移之处（提交 1 必须显式审查这 5 行）

`rpcCall`（`:177`）是模块级 `let`，install 在 `:1494` 赋值、disposer 在 `:1655` 置 `null`。拆出 `groupsStore.ts` 后 `index.tsx` 写不到它，**必须新增导出 `setRpcCall(fn | null)`**。

disposer 的 `:1656-1659` 直接在写 store 的模块级变量：

| 行 | 语句 |
|---|---|
| `:1655` | `rpcCall = null` |
| `:1656` | `groupReady = false` |
| `:1657` | `groupLoadFailed = false` |
| `:1658` | `groups = []` |
| `:1659` | `emitGroups()` |

后四行必须合成**一个**导出 `resetGroupsStore()`。

**除此之外不得有任何代码形状变化。** 尤其：`groupRevision`（`:175`）**不重置**是既有行为，逐字保留（见 §6 Q8）。

---

## 3. 九块职责的实测行号

| 块 | 范围 | 内容 |
|---|---|---|
| R1 契约/常量/文案/类型 | `:1-168` | 注释 `:1-42`、import `:43-60`、常量 `:63-87`、类型 `:89-131`、文案 `:134-168` |
| R2 分组持久化 store | `:169-394` | 内核 `:171-223`、localStorage 兜底 `:225-260`、写盘与读回 `:262-377`、hook `:379-394` |
| R3 作用域过滤 | `:396-452` | 缓存 `:401`/`:425`、`filterSessions:402-423`、`filterWorkspaces:426-441`、`unownedSessionIds:444-452` |
| R4 官方 header 定位 | `:454-493` | `LABEL_WORDS:455`、`SEARCH_PLACEHOLDERS:456`、`isLabelNode:458-461`、`locateHeader:463-493` |
| R5 菜单注入 + 归属写入 + Picker | `:495-677` | `I:496`、`WS_ASSIGN_MENU_ATTR:501`、`ASSIGN_TAB_EVENT:502`、`ASSIGN_ICON_PATH:503-505`、`T_WS:507`、`ttw:515`、`findOpenProjectRow:524-530`、`workspaceInfoFromRow:533-552`、`openAssignToTab:554-557`、`ensureWorkspaceAssignMenuItem:560-586`、`assignWsToTab:589-601`、`AssignTabPicker:604-677` |
| R6（旧调研的「归属写入原语」） | **已并入 R5** | 现为 `assignWsToTab:589-601` |
| R7 TabStrip | `:679-886` | |
| R8 对话框 | `:888-1128` | `btnStyle:889-912`、`RenameDialogProps:918-924`、`RenameDialog:926-1005`、`MembersDialog:1007-1094`、`DeleteDialog:1096-1128` |
| R9 壳与 install | `:1130-1661` | `ShellProps:1131-1138`、`WorkspaceTabsShell:1140-1477`、`installWorkspaceTabs:1480-1661` |

**两处旧调研错误（已更正）**：

1. 旧调研单列的 **R6「归属写入原语 `:617-630`」已不存在**，现为 `assignWsToTab:589-601`，紧贴菜单注入块。
2. 旧调研把 `AssignTabPicker` 归到 R8（写 `:632-706`），**实测它在 `:604-677`，属 R5 的范围**。若按旧图把它留在 R5 会与 R8 形成循环依赖 —— 裁定放 `dialogs.tsx`（见 §6 Q9）。

### 导出面（现状仅 4 个）

`export const WS_TABS_MARK :63`｜`export interface WsGroup :117`｜`export interface WsTabsCtx :123`｜`export function installWorkspaceTabs :1480`。

### 文案函数

`tt :162-168`（表 `T :134-161`，29 条）；`ttw :515-521`（表 `T_WS :507-514`，6 条）。两者都是 `isZhInterface()` 运行时取值，**首行都在 `let text = ...`**（`:165` / `:518`）。

---

## 4. 模块级可变状态全清单

| 变量 | 声明 | 类型 | 写点 | 读点 | 卸载清空 |
|---|---|---|---|---|---|
| `groupReady` | `:171` | boolean | `:302`、`:315`、`:321`、`:374`、loadGroups 失败分支 | `getGroupSnapshot:210-216` | ✅ `:1656` |
| `groupLoadFailed` | `:172` | boolean | `:332`、`:367`、`:372`、`:1657` | 同上 | ✅ `:1657` |
| `groups` | `:173` | `WsGroup[]` | `:300`、`:314`、`:320`、`:356`、`:362`、`:1658` | `:280`、`:300`、`:383`、`sanitize` 返回处 | ✅ `:1658` |
| `groupRevision` | `:175` | number | `:301` | `:310`、`:331` | ❌ **不重置（见 Q8）** |
| `groupSubs` | `:176` | `Set<() => void>` | `:218-223` | `:200`（emitGroups 遍历） | ❌ |
| `rpcCall` | `:177` | `((method, payload?) => Promise<unknown>) \| null` | `:1494`、`:1655` | `:273`、`:318`、`:326` | ✅ `:1655` |
| `groupSnapshot` | `:209` | `{ready, failed, groups} \| null` | `:210-216` | `:210-216` | ❌ |
| `writeSeq` | `:265` | number | `:278` | `:283` | ❌ |
| `writeChain` | `:270` | `Promise<void>` | `:281` | `:281` | ❌ |
| `sessionsFilterCache` | `:401` | `WeakMap<object, Map<string, SessionListState>>` | `:405-…` | `:405` | ❌ |
| `workspacesFilterCache` | `:425` | `WeakMap<object, Map<string, WsListState>>` | `:429-…` | `:429` | ❌ |

**install 内局部（非模块级）**：`assignRaf:1503`、`observing:1514`、`unsubAssignSetting:1532`、`originalComp:1543`、`wrappedEntry:1544`、`synced:1545`、`timer:1546`、`unsub:1629`。

**生命周期决定关系（拆分的核心约束）**：

- 「install 的 disposer `:1638-1660` 是 store 的唯一清空方」。`groupSubs` 的生命周期决定所有已挂载 `WorkspaceTabsShell` 的可见性 —— `resetGroupsStore()` 会经 `emitGroups` 抽空全部页签栏与对话框。
- `synced:1545` 的生命周期决定包裹只发生一次；`unwrap():1586` 是**唯一复位点**。

---

## 5. 隐式契约（复核后 **17 条**，旧调研 12 条）

### ① `data-session-delete-item`
本文件 `:574`（`excludeAttrs` 数组第一项）↔ `src/client/sessionDelete.ts:37`（`MENU_DELETE_ATTR`，用于 `:346`/`:357`/`:417`），测试 `test/sessionDelete.test.ts:15`。
**契约**：注入「分配标签」时不得克隆「删除会话」项。
**破坏**：两项互相继承图标/文本，或兜底清理误删槽项（1.5.1 线上回归）。
**拆分后**：字面量随 `ensureWorkspaceAssignMenuItem` 走，`sessionDelete.ts` 不动。

### ② `WS_TABS_MARK`
声明 `:63`、查重排除 `:1600`、打标 `:1611` ↔ 测试 `test/workspaceTabsDialogs.test.ts:55`（import）与 `:129`（`toBe(true)`）。
**契约**：wrapper 必须带标记，否则 `sync` 的 `entries.find` 会把已包裹的组件再包一层。
**破坏**：无限嵌套。
**拆分后**：留在 `index.tsx` 并 re-export。

### ③ `__dshNativeTabHost` / `__imConnectWrapped`
本文件 `:1604` ↔ **全仓无写入方**（grep 仅此一处）。
**契约**：官方槽组件已被别的插件包裹时放弃包裹并置 `synced=true`。
**破坏**：两层 wrapper 嵌套。
**这是跨插件（跨包）契约，仓内不可测。**
**拆分后**：随 `sync` 原位，**逐字保留字符串**。

### ④ `TABS_CSS` ↔ 渲染属性 ↔ `focusTab`
CSS `:76-87`（选择器 `[data-dsh-ws-tabs-bar]` / `[data-dsh-ws-tabs-group]` / `[data-dsh-ws-tab]` / `[data-dsh-ws-add]`）↔ 渲染 `:827`（bar）、`:750`（tab）、`:843`（add）、`:751`（`data-dsh-ws-id`）↔ 查询 `:726`/`:727`。
**破坏**：样式丢失或方向键不移动。
**拆分后**：`TABS_CSS` 与 `TabStrip` 同文件。

### ⑤ `commitGroups` 顺序 ↔ `loadGroups` 的 `groupRevision`
`:299-306`：`groups=:300` → `groupRevision+=1:301` → `groupReady=true:302` → `cacheWrite():303` → `emitGroups():304` → `persistGroups():305`；`loadGroups` 的 `startedRevision=groupRevision:310`、判据 `:331`。
**破坏**：顺序调换 → 读回覆盖新建页签（用户建的页签 1 秒后消失）。
**拆分后**：`commitGroups` / `loadGroups` / `groupRevision` **必须同一文件且保持行序**。

### ⑥ `retainAccountKeys` 补键
**实测 `:1396-1412`**（旧调研写 `:1434-1437` 已过期），补键行 **`:1407`**：`[...base, '', FLAT_SESSION_ORDER_KEY, ...]`；常量 `FLAT_SESSION_ORDER_KEY:66`。对方是官方 view store（宿主包内，仓内无源码）。
**破坏**：切页签清掉其它页签的手动排序/展开。
**拆分后**：随壳原位，依赖数组 `[innerProps.actions, itemsAll]` 不得改。

### ⑦ `wsPhaseReady`
**实测声明 `:1176`**，使用 `:1226`（孤儿清理门控）、`:1253`（自动归属基线作废）。旧调研写 `:1205/1255/1282` 已过期。
**破坏**：重载中间态被误判为删除 → 整组被踢出页签。
**拆分后**：随壳。

### ⑧ 唯一归属不变量 ↔ `membership` 首个出现者优先
`membership` useMemo `:1179-1183`，`if (!m.has(id)) m.set(id, g.id)` **`:1181`**；写入侧 `assignWsToTab:589-601`（先移除再插入）、`MembersDialog` toggle `:1020-1035`。
**破坏**：同一工作区出现在两个页签 → 会话重复。
**拆分后**：`membership` 在壳、`assignWsToTab` 在菜单块，**跨文件**，须保留「先从其它组移除」语义。

### ⑨ host payload `{ groups: snapshot }`
本文件 `:285` ↔ `src/index.ts:38`（`normalizeGroups`）与 `:234`（`normalizeGroups({ groups: body.groups })`）。
**契约**：`normalizeGroups` 丢弃空/重复/非字符串 id，**空名保留为 `''`**（`src/index.ts:48-50` 注释明确「由 client 的 `sanitize()` 补默认名」）。
**破坏**：改形状 → host 读空 → 页签全丢。
**拆分后**：随 `groupsStore.ts`。

### ⑩ 测试重抄源码选择器/常量
`test/workspaceTabsDialogs.test.ts:60` `CACHE_KEY` ↔ 源码 `:68`｜`:61` `DIRTY_KEY` ↔ `:70`｜`:183` `[data-dsh-ws-add]` ↔ `:843`｜`:196` `[data-dsh-ws-tab]` ↔ `:750`｜`:198` `aria-selected`+`data-dsh-ws-id` ↔ `:751`｜`:263` `toMatch(/^g-/)` ↔ `onAdd:1354-1356`｜`:301`/`:309`/`:312` 中文文案 ↔ `T:134-161`。
**破坏**：源码改一处测试仍绿（除非断言真失败）。
**拆分后**：只改测试 `:55` 的 import。

### ⑪ 空名兜底的两侧分工
本文件 `sanitize:189`（`tt('new.name')`）+ `RenameDialog` 草稿初值 `:931`（`useState(g?.name ?? '')`，注释 `:928-930` 说明为何不能用 `tt('new.name')`）↔ `src/index.ts:48-50`（host 刻意不兜底）。
**破坏**：host 与 client 都写死默认名 → 中英界面文案漂移；或草稿预填成「未命名」→ 用户顺手保存出重名。
**拆分后**：`sanitize` 进 `groupsStore`、`RenameDialog` 进 `dialogs`，**跨文件但语义独立**，无需同步改。

### ⑫ `ASSIGN_TAB_EVENT` 事件桥
声明 `:502`、监听 `WorkspaceTabsShell:1165-1166`、派发 `openAssignToTab:554-557`。
**契约**：菜单项点击 → window 事件 → 壳弹 Modal。
**破坏**：点「分配标签」无反应。
**跨文件**（菜单块 ↔ 壳），**必须共享同一常量**。

### ⑬ `WS_ASSIGN_MENU_ATTR` 的卸载清理
声明 `:501`、注入 `:570`、卸载清理 `:1653`（`querySelectorAll('[' + attr + ']').forEach(el => el.remove())`）。
**契约**：注入项挂在宿主菜单 DOM 上、不受 React 管理，卸载必须清掉。
**破坏**：关闭插件后菜单残留项。
**跨文件**（菜单块声明、install 清理）。

### ⑭ `STYLE_ID` 幂等注入
`:71` 声明、`:1537-1541`（先 `getElementById(STYLE_ID)?.remove()` 再 append）、`:1654` `style.remove()`。
**契约**：重复 install 不得留两份 `<style>`。

### ⑮ D2 死条件
`:574` 的第二项 `'data-ws-assign-item'` 与自身 `WS_ASSIGN_MENU_ATTR:501`（`'data-ws-assign-tab-item'`）不同，`hasAttribute` **恒 false**。计划 D2 裁定**逐字保留**，删它属批次⑨。

### ⑯ `__flat_session_order__` 双点
`:66` 与 `:1407`。属⑥ 同一契约，常量若迁移需一并搬。

### ⑰ `g-` id 前缀
`onAdd:1354-1356`（`'g-' + randomUUID()`）+ 注释 `:1353`「`g-` 前缀必须保留：active 校验 / sanitize 依赖」↔ 测试 `:263`。
**破坏**：新建页签被 `sanitize` 丢弃。

---

## 6. 时序与微任务敏感点（11 条）

1. **`kickRender` 的两个 `queueMicrotask` 必须在 `entry.component = Wrapper` 之后同一微任务批次**
   `:1552-1576`：`w.refresh?.()` 包在 `queueMicrotask :1556-1560`；瞬时注册的 `{name:'sidebar.footer.action', id:'ws-tabs-ping', order:9999}` 与 `dispose()` 的微任务 `:1566-1572`。
   **危险**：加 `await`/Promise 或把 `kickRender` 挪出本文件 → 包裹生效延迟到下一次渲染（表现为开关「要等几秒」）。
   **约束**：`kickRender` 与 `sync` 必须同文件（`index.tsx`）。

2. **包裹重试三条件**
   `trySyncOnce:1621-1626`（`setTimeout(..., 300)` `:1624`）＋ `ctx.slots.subscribe('sidebar.workspaces', …)` `:1630-1636` ＋ `synced` 复位仅在 `unwrap:1586`。
   **危险**：任一条丢失 → 官方槽晚挂载时永不包裹（功能静默不出现）。**全留 `index.tsx`**。

3. **Portal 目标每 400ms 重定位 + 引用相等**
   `useLayoutEffect:1306-1331`；`setInterval(tick, 400)` `:1329`；`setHeader((cur) => cur && cur.row === found.row ? cur : …)` **`:1324`**；清理 `:1330`。
   **危险**：去掉引用相等判断 → 每 400ms 新对象 setState → 无限重渲染 / 输入框失焦；漏清 interval → 卸载后仍 tick。**随壳**。

4. **`pointerdown` 必须 `capture=true` + 菜单自身放行**
   TabStrip 的 `useEffect:693-710`；`document.addEventListener('pointerdown', closeOnOutside, true)` **`:704`**；`keydown:705`；`closeOnOutside` 里 `t.closest('[data-dsh-ws-ctx-menu]')` **`:698`**。
   **危险**：`capture=false` 时菜单项 click 先被 React 处理再关菜单 → 点了没反应；漏 `closest` 放行 → 点菜单自身即关。**随 TabStrip**。

5. **命令式 `found.label.style.display = 'none'`**
   写 `:1323`；恢复 `:1318`（`!enabled` 分支）；**disposer `:1638-1660` 未恢复**。
   **实测确认**：无需在 disposer 恢复 —— `unwrap():1578-1588` 把官方组件换回，官方重渲染出全新 header，被隐藏的旧节点随树卸载。**这是既有行为，逐字保留**。写与恢复必须同在 `tick` 内。

6. **`phase === 'ready'` 门控 + 自动归属读 `activeIntentRef.current`**
   `wsPhaseReady:1176`；门控 `:1226`/`:1253`；`targetId = activeIntentRef.current` **`:1269`**；写点 `onPick:1345`、`createGroup:1366`；声明 `:1151`。
   **危险**：改成读渲染闭包的 `active` → 新建工作区含目录选择往返，期间切页签会归属错。**`activeIntentRef` 必须在壳内**。

7. **`useCallback` / WeakMap 缓存与壳同寿命（React #185）**
   `filteredUseSessions:1372-1380`、`filteredUseWorkspaces:1381-1389`、`scopeWsIds:1193-1203`、`scopeSessionIds:1206-1218`、`actionsWithFullRetain:1396-1412`；`getGroupSnapshot:210-216` + `groupSnapshot:209` 引用缓存；注释 `:207-208` 明写「每次新建字面量会触发无限重渲染 → React #185」。
   **危险**：`scopeWsIds` 每次渲染新建数组 → `filteredUseWorkspaces` 的 `useCallback` 依赖变化 → 官方子树全量重渲染；`getSnapshot` 返回新对象 → #185 白屏。
   **约束**：`filterSessions` / `filterWorkspaces` + 两个 WeakMap 可抽到 `scope.ts`，但 `scopeWsIds` / `scopeSessionIds` 的 useMemo 链**必须留在壳内**。

8. `useGroups:379-381` 的 `useSyncExternalStore` 依赖 `subscribeGroups:218-223` 返回的退订必须从 `groupSubs` 删除同一引用，否则泄漏。

9. `<style>` 注入 `:1537-1541` 在 install 同步执行，早于 `unwrap` / `sync`；若延后则首帧无样式。

10. `void loadGroups():1499` 不 await，与 `setAssignObserving:1531` 无依赖关系（顺序可保持即可）。

11. assign 观察器启停：初始 `:1531`、热切换 `:1532-1535`、`observing` 守卫 `:1516`；`on=false` 时必须 `assignObserver.disconnect()` `:1523` + `cancelAnimationFrame` `:1525-1526`。

---

## 7. 九项裁定（主会话已定，不再询问）

- **Q1 不套用 `observeBodyDebounced`**。`core/domObserver.ts` 只有「立即 observe」一种形态，套用要么给共享层加 `start`/`stop`（会波及 `sessionDelete.ts:412` 等消费方），要么把启停改写成「建/毁 + 补一次 `probe.schedule()`」；收益约 8 行，代价是语义改写与触碰共享层。
  **实施期更正（本规格内部口径冲突）**：本节原写「`assignRaf` / `scheduleAssign` / `assignObserver` 原样搬进 `assignMenuItem.ts`，启停留在 install」，与 §4 `:130` 把 `assignRaf`/`observing` 列为「install 内局部（非模块级）」冲突。**裁定按 §4 `:130` 执行：观察器整体留在 install，随 `index.tsx` 进提交 3。**理由：install 在 `:1231-1232` 读**并写** `assignRaf`（`if (assignRaf !== 0) cancelAnimationFrame(assignRaf)`），跨模块后 `tsc` 禁止对 import 绑定赋值，而 §1 `:19` 的导出面无任何探针出口。Q1 的可执行内核是**「不套用 `observeBodyDebounced`」**，两种落点都满足它。
- **Q2 `T` 与 `T_WS` 不合并**。合并要改 6 处调用点与两个函数，收益为 0。
- **Q3 `WS_ASSIGN_MENU_ATTR` 与 `ASSIGN_TAB_EVENT` 由 `assignMenuItem.ts` 导出**，`index.tsx` 显式 import。
- **Q4 四个宿主 DOM 函数本批放 `domContract.ts`**，**不搬 `official/`**。理由见计划文件。**记入批次⑨**。
- **Q5 分 3 次提交**（见 §1）。
- **Q6 `src/client/workspaceTabs.tsx` 保留为 re-export 壳**。
- **Q7 补 3 条测试，与重构分开提交**：`test/wsTabsScope.test.ts`、`test/wsTabsDomContract.test.ts`、`test/groupsStore.test.ts`（内容见 §9）。
- **Q8 `groupRevision` 不重置逐字保留**，记入批次⑨。
- **Q9 `AssignTabPicker` 落 `dialogs.tsx`**。

---

## 8. 拆分时最可能破坏运行时行为的 12 条

| # | 位置 | 为什么 | 怎么避免 |
|---|---|---|---|
| 1 | `:177` + `:1655` | `rpcCall` 是模块级 `let`，disposer 直接置空；拆 store 后壳写不到 | 改用 `setRpcCall()`；提交 1 显式审这 5 行 |
| 2 | `:300-305` | `commitGroups` 六步顺序承载「本地优先」语义 | 保持行序；测试 `:318` 是唯一网 |
| 3 | `:1612` 与 `:1556`/`:1568` | `entry.component = Wrapper` 后必须同一微任务批次促渲染器重读 | `kickRender` 与 `sync` 同文件，不加 `await` |
| 4 | `:1604` | `__dshNativeTabHost` / `__imConnectWrapped` 是跨插件契约，**仓内零写入方零测试** | 逐字保留字符串 |
| 5 | `:1324` | `setHeader` 的引用相等判断；去掉 → 每 400ms 重渲染、输入框失焦 | 保持 `cur.row === found.row` |
| 6 | `:189` + `:162` | `sanitize` 依赖 `tt`；`messages ↔ groupsStore` 成环 → 运行时报错或语言取错 | `messages.ts` 只 import `core/lang.ts` |
| 7 | `:1396-1412`（补键 `:1407`） | `retainAccountKeys` 包装的依赖数组 `[innerProps.actions, itemsAll]` | 依赖数组与 `itemsAll` 来源不动 |
| 8 | `:1653` | 卸载清理用 `WS_ASSIGN_MENU_ATTR`；常量搬走后忘 import | 由 `assignMenuItem.ts` 导出，index 显式 import |
| 9 | `:1516`/`:1531-1535` | assign 观察器启停守卫；丢掉 → 关闭后仍全树跑 rAF | 保留 `observing` 守卫 + `cancelAnimationFrame` |
| 10 | `:1176`/`:1226`/`:1253` | `wsPhaseReady` 门控；派生挪出壳外 → 重载中间态清空分组 | 门控三处随壳 |
| 11 | `:209-216` + `:379-381` | `groupSnapshot` 引用缓存 + `useSyncExternalStore`；返回新字面量 → React #185 白屏 | 「无变化返回同一对象」逐字保留 |
| 12 | `:1503` vs `:1624` | `assignRaf`（rAF）与 `timer`（timeout）两个句柄，disposer `:1652`/`:1639` 分别清理 | 不要合并成一个变量 |

---

## 9. 测试现状与要补的 3 条

`test/workspaceTabsDialogs.test.ts`（357 行，实测 **9** 用例 —— 原写 10，多算了一条）。

**已覆盖**：草稿三出口（保存 `:252-276` / 取消 `:278-285` / 宿主 onClose `:287-295`）；空名守卫 `:297-302`；重名判定含「未命名」不误判 `:304-316`；读回竞态保护 `:318-333`；写盘失败置 dirty `:335-344`；重复点加号幂等 `:346-356`。

**未覆盖**：`scope.ts` 整块（`filterSessions`/`filterWorkspaces` 零调用）；`domContract.ts` 整块；菜单注入（`ensureWorkspaceAssignMenuItem` 完全没跑 —— 测试的 `OfficialComp:87-97` 压根没有 `[role=menu]`）；包裹时序（只走同步一次 `sync`，`:1621-1626` 的 300ms 重试与 `:1630-1636` 的 subscribe 路径未测）；`retainAccountKeys` 包装 `:1396-1412`；孤儿清理 `:1225-1241`；自动归属 `:1248-1290`；`AssignTabPicker`、`MembersDialog`、`DeleteDialog`；`RenameDialog` 的**重命名分支**（测试只跑 `draft:true`，`:931` 的 `g?.name` 初值分支未跑）。

**要补的 3 条**（纯函数 / DOM 片段级，不需宿主）：

1. `test/wsTabsScope.test.ts` — 「同一 state + 同一 allowed 返回同一对象」：`expect(filterSessions(s, ['a'])).toBe(filterSessions(s, ['a']))`，钉住 `sessionsFilterCache:401` 的语义（React #185 的唯一网）；再加 `filterSessions` 不同 `allowed` 返回不同对象且 `byId` 正确收窄、空 `allowed` → 空 `ids`（对齐 `:402-423`）；`filterWorkspaces` 同样两条。
2. `test/wsTabsDomContract.test.ts` — `locateHeader` 对三种结构（placeholder 命中 `:464-467` / `isLabelNode` 命中 `:469-475` / 纯 `span` 兜底 `:486-491`）各返回预期 `row`/`label`；无匹配时返回 null；`findOpenProjectRow` 无菜单时返回 null。
3. `test/groupsStore.test.ts` — `commitGroups` 后 `getGroupSnapshot()` 在无变化时 `toBe` 同一对象；`loadGroups` 的 revision 竞态在 store 层直接测。

---

## 10. 验证要求

**每一批必跑**：

```bash
npx tsc -p tsconfig.test.json --noEmit
npx vitest run
npm run build
```

**产物等价性判据**：`workspaceTabs.tsx` 全在 client bundle（`src/index.ts:20-26` 的 import 不含任何 `client/` 路径），因此批次⑥ **只对 `lib/index.mjs` 逐字节不变**成立。`lib/client.js` 必然变化（模块边界与打包顺序），**不得**作为等价性判据 —— 本计划 7.2 对批次⑥ 的表述据此作废。

**每批额外的等价性核对**（**已更正** —— 原写的 `git diff --stat lib/index.mjs` 是无效判据）：

```powershell
# ❌ 作废：lib/ 在 .gitignore 里，这个命令恒为空，什么也没证明
# git diff --stat lib/index.mjs

# ✅ 唯一有效判据：与开工前的基线副本逐字节比对
$b = "$env:TEMP\wsTabs-base\index.mjs"
(Get-FileHash lib/index.mjs -Algorithm SHA256).Hash -eq (Get-FileHash $b -Algorithm SHA256).Hash
```

基线副本须在批次⑥ 开工前用 `Copy-Item lib/index.mjs "$env:TEMP\wsTabs-base\index.mjs"` 建立。批次⑥ 全程该 sha256 恒为 `22715745A86B9C89A9E469FB50C3288DEF6D0253CC781D4CF43D8179E0FD2410`（25039 B）。

**归因方法**：用 `git diff --no-index -U0` 把 `lib/client.js` 的差异切成 hunk 逐条归因（比 `Compare-Object` 的逐行计数更易定位），再加上「去空行/注释/region/`$N` 后缀」的归一化多重集比对，确认差异只落在 wsTabs 相关的 region 与调用点上。

---

## 11. 交付要求

1. 三次提交各自独立可编译、可测试；提交消息用中文，格式 `refactor(client): 批次⑥-N <内容>`。
2. 交付报告必须包含：每批的 `tsc` / `vitest` / `build` 实测结果、`lib/index.mjs` 的差异条数、`lib/client.js` 的 hunk 归因、以及本规格 §2 那 5 行的最终写法。
3. 任何与本文档不符的实现决定，**先停下来说明**，不要自行裁定。

---

## 12. 实施结果（批次⑥ 已完成，留档）

**4 次提交**（分支 `feat/motion-settings-followup`，起点 `8edc40e`，未 push）：

| 提交 | 内容 | 变更 |
|---|---|---|
| `a69c6d4` | ⑥-1 分组 store / 文案 / 作用域 / 宿主 DOM 契约 | 5 文件 +534/−452 |
| `03aaa65` | ⑥-2 页签栏与对话框组件 | 4 文件 +646/−609 |
| `033e4b3` | ⑥-3 壳与装配，原文件退化为 re-export | 2 文件 +639/−634 |
| `4a7d92b` | 补 3 条单测 | 3 文件 +281/−0 |

每次提交 `tsc` exit 0、`vitest` 全过、`build` exit 0、`lib/index.mjs` sha256 不变。测试由 22 文件 / 228 用例增至 **25 文件 / 247 用例**。

**最终文件度量**（行 / 字节）：`patches/wsTabs/index.tsx` 635/29059、`dialogs.tsx` 332/13567、`groupsStore.ts` 264/10376、`TabStrip.tsx` 240/10617、`scope.ts` 98/3893、`domContract.ts` 80/3706、`assignMenuItem.ts` 69/4147、`messages.ts` 63/3710、`src/client/workspaceTabs.tsx`（壳）4/371。合计 **1785 / 79446**（起点单文件 1661 / 54860）。

**`lib/client.js` hunk 数**：⑥-1 = 20（+223/−165）、⑥-2 = 8（+360/−331）、⑥-3 = 1（+1/−1），base→final 累计 28（+501/−414）。

**归一化多重集**（去空行 / 整行注释含 `//#region` / `$N` 后缀）：base 5118 → **lost 10 / added 16**，且**全部来自 ⑥-1**；⑥-2、⑥-3、补测提交各自 **lost 0 / added 0**。那 26 行差额 = 7 处 `DEFAULT_TAB` ↔ 字面量 `"__default__"` 的跨模块常量内联策略变化（新产物里 `const DEFAULT_TAB = "__default__"` 仍在、同值）+ §2 那 5 行改动的两侧对应写法 + 两个新函数声明与闭合括号。**提交 2/3/4 在代码行层面零增删。**

**最终 region 顺序**：`wsTabs/messages.ts` → `groupsStore.ts` → `TabStrip.tsx` → `domContract.ts` → `assignMenuItem.ts` → `dialogs.tsx` → `scope.ts` → `index.tsx` → `sidebarToolsMerge.ts` → `index.ts`。

**壳的最终全文**（4 行）：

```tsx
/** 兼容壳（批次⑥）：实现已搬到 ./patches/wsTabs/index.tsx，这里保留原路径的导出面，
 *  让 src/client/index.ts:29 与 test/workspaceTabsDialogs.test.ts:55 的 import 路径零改动。 */
export { WS_TABS_MARK, installWorkspaceTabs } from './patches/wsTabs/index.tsx'
export type { WsGroup, WsTabsCtx } from './patches/wsTabs/index.tsx'
```

三处外部引用零改动（实测）：`src/client/index.ts:29`、`src/client/index.ts:337`、`test/workspaceTabsDialogs.test.ts:55`。

**新测试须加 `// @vitest-environment jsdom`** —— `vitest.config.ts:8-18` 只配了 `exclude`，默认是 node 环境。`core/lang.ts` 可安全直导，无需 mock。
