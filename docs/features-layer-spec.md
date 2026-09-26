# 批次⑦ 实施规格：入口装配层剥离

> **依据**：`docs/refactor-plan.md` 第 5 章（分层规则）、第 6 章批次 7，以及同文件第 6 章的「批次⑦ 的九项裁定」。**本文件是批次⑦ 的唯一实施依据**，与旧计划描述冲突处一律以本文件为准。
> **行号口径**：`(Get-Content <path>).Count`（真行数），实测于 `feat/motion-settings-followup` @ `c93e738`，`git status --porcelain` 0 行。
> **本批所有基线行号均指 `src/client/index.ts`，除注明文件外。**

---

## 1. 目标与边界

**唯一目标**：把 `src/client/index.ts` 从「4 个内联实现 + 101 行 `apply`」变成**纯装配**，全仓其它文件的行为逐字不变。

**量化目标**：`src/client/index.ts` 从 **393 行**降到 **约 145 行**（实测落地 **144 行** —— 实施期把 §1 原写的「150–200 行」下调：§4.8 骨架是规范性内容，按它逐字落地即得 144 行，原区间是估算值，**不得靠填充凑数**）。

**本批不碰**：`src/index.ts`（host）、`src/host/**`、`src/client/official/**`、`src/client/patches/**`、`src/client/sessionDelete.ts`、`src/client/sidebarToolsMerge.ts`、`src/client/WidthSlider{Control,Settings}.tsx`、`src/client/think/**`、`src/client/core/*`（除新增 `features.ts`、`rpc.ts`）、`src/client/motion/*`（除新增 `state.ts` 与 `index.ts` 一行）、`test/**`（除新增测试文件）。`src/client/widthPrefs.ts` **只允许一处改动**：删掉 `:27` 的本地 `type Disposer` 改从 `shared/types.ts` import（见 §4.1 与实施期裁定 3 —— 该清单原先把它整文件列为「不碰」，与裁定 3 冲突，已对齐）。

**行为变化：无。** 本批是「搬移 + 装配重排」，不得出现任何运行时行为差异（第 10 节给出判据）。

---

## 2. 现状实测

### 2.1 `src/client/index.ts` 逐段归属（393 行 = 375 行有内容 + 18 空行）

| 行 | 内容 | 归属 |
|---|---|---|
| `:1-14` | 头注释（只列 3 项职责，实测编排 8 个开关 → **注释已过期，需订正**） | `client/index.ts` |
| `:15-39` | import 19 条 | 拆分到各新文件 |
| `:41-45` | `declare module` → `LocaleNamespaceMap { widthSlider: WidthSliderKey }` | **`core/locales.ts`**（裁定 9） |
| `:47` | `const NS = 'widthSlider'` | **`core/locales.ts`**（裁定 9） |
| `:49` | `type Disposer = () => void` | `shared/types.ts` |
| `:51-54` | `HANDLE_HIDE_CSS` | `features/width/index.ts` |
| `:58-91` | `installWidthFeature(): Disposer` | `features/width/index.ts` |
| `:93-131` | `installThinkRenderer(ctx: ClientContext): Disposer` | `features/think/index.ts` |
| `:135-136` | `let ledgerWarned = false` | **留装配层**（裁定 1） |
| `:138-176` | `motionStateOf(ctx: RpcClientContext): MotionEngineState` | 拆：`:164-175` → `motion/state.ts`；`:143`、`:146-160` → 装配层适配器 |
| `:178-249` | `installMotionFeature(ctx: RpcClientContext): Disposer` | `features/motion/index.ts`（改收端口） |
| `:251-263` | `warnIfUpstreamPresent()` | `features/think/index.ts`（裁定 5） |
| `:267-273` | `type RpcClientContext` | **删**（裁定 10） |
| `:275-285` | `rpcReadSettings(ctx)` | `core/rpc.ts`（去 ctx） |
| `:287-289` | `rpcWriteSettings(ctx, settings)` | `core/rpc.ts`（去 ctx） |
| `:291` | `export const inject = ['slots','locale','connection','sessions','workspaces']` | 留入口左右（**本批不动**，见 §9.4） |
| `:293-393` | `apply(ctx)` 101 行 | `:304-326` → `core/features.ts`；其余留装配 |

### 2.2 `ctx.*` 访问分类（11 个 `ctx.` 属性访问 + 6 个 ctx 传参）

| 行 | 表达式 | 分类 | 归属 |
|---|---|---|---|
| `:103` | `ctx.slots.inject('conversation.chat.node', …)` | 框架端口 | 随 `installThinkRenderer` |
| `:104` | `ctx.slots.register({…}, renderer)` | 框架端口 | 同上 |
| `:208` | `ctx.sessions.list.subscribe(listener)` | **业务状态** | 端口注入 |
| `:235` | `ctx.sessions.list.getSnapshot().current` | **业务状态** | 端口注入 |
| `:241` | `ctx.sessions.list.subscribe(syncSession)` | **业务状态** | 端口注入 |
| `:294` | `ctx.effect` + `ctx.locale.register(NS, {zh, en})` | 框架端口 | 留 E1 |
| `:297` | `ctx.effect(… 'upstream conflict probe')` | 框架端口 | 留 E2 |
| `:303` | `ctx.effect(… 'feature lifecycles')` | 框架端口 | 留 E3 |
| `:364` | `ctx.effect(… 'config load')` | 框架端口 | 留 E4 |
| `:376` | `ctx.effect(… 'settings section')` | 框架端口 | 留 E5 |
| `:377` | `ctx.slots.inject('settings.section', …)` | 框架端口 | 留 E5 |

传参：`:331 installThinkRenderer(ctx)`、`:334 installSessionDelete(ctx as never)`、`:337 installWorkspaceTabs(ctx as never)`、`:345 installMotionFeature(ctx)`、`:366 rpcReadSettings(ctx)`、`:386 rpcWriteSettings(ctx, settings)`。

**无「无法归类」的用法。**

---

## 3. 目标文件清单

**7 新建 + 4 修改。**

| # | 文件 | 动作 | 内容 |
|---|---|---|---|
| 1 | `src/shared/types.ts` | 新建 | `export type Disposer = () => void` |
| 2 | `src/client/core/features.ts` | 新建 | `Disposer` 转发、`Slot`、`UNINSTALL_ORDER`、`FeatureRegistry`、`createFeatureRegistry` |
| 3 | `src/client/core/rpc.ts` | 新建 | `rpcReadSettings()`、`rpcWriteSettings(settings)` |
| 4 | `src/client/motion/state.ts` | 新建 | `motionStateOf(settings, blank)` |
| 5 | `src/client/features/width/index.ts` | 新建 | `HANDLE_HIDE_CSS`、`installWidthFeature()` |
| 6 | `src/client/features/think/index.ts` | 新建 | `installThinkRenderer(ctx)`、`warnIfUpstreamPresent()` |
| 7 | `src/client/features/motion/index.ts` | 新建 | `MotionSessionsPort`、`installMotionFeature(sessions)` |
| 8 | `src/client/index.ts` | 改 | 装配 + 会话账本适配器 |
| 9 | `src/client/core/locales.ts` | 改 | 收 `declare module` 与 `NS`（裁定 9） |
| 10 | `src/client/motion/index.ts` | 改 | barrel 加一行 `export { motionStateOf } from './state.ts'` |
| 11 | `src/client/widthPrefs.ts` | 改 | 删本地 `type Disposer`，改从 `shared/types.ts` import（§4.1，**唯一允许改动**） |

`src/client/features/` 目录当前**不存在**，需新建（含 `width/`、`think/`、`motion/` 三个子目录）。

---

## 4. 各文件规格

### 4.1 `src/shared/types.ts`（新建）

```ts
/**
 * 跨 `host/` 与 `client/` 的公共类型。
 *
 * 本批只收 `Disposer`（原先在 `client/index.ts:49` 与 `widthPrefs.ts:27` 各写一份）。
 * `features/*` 的最小 ctx 接口留批次⑨ —— 见 `docs/refactor-plan.md` 批次⑦ 裁定第 10 条：
 * `src/env.d.ts:15-17` 的 `ClientContext` 权宜桩使 ctx 全局为 `any`，收紧类型是独立课题。
 */

/** 卸载函数：由各 `install*` 返回，统一由功能注册表持有并调用。 */
export type Disposer = () => void
```

**同时**把 `src/client/widthPrefs.ts:27` 的本地 `type Disposer` 改为从 `shared/types.ts` import（消掉重复声明）。**不要保留 `export type { Disposer }` 再导出行** —— 实施期核对：该符号在基线本非导出（`widthPrefs.ts` 的公开面是另外 11 个符号），且全仓零消费者，保留它等于新增公开面。**这是本批对 `widthPrefs.ts` 的唯一允许改动，且必须逐字等价。**

### 4.2 `src/client/core/features.ts`（新建）

```ts
import type { Disposer } from '../../shared/types.ts'

export type { Disposer }

/** 可独立装卸的功能槽位。名单同时约束 `sync()` 的安装序与 `UNINSTALL_ORDER` 的卸载序。 */
export type Slot =
  | 'handle' | 'think' | 'resize' | 'nav'
  | 'sessionDel' | 'wsTabs' | 'motion' | 'toolsMerge'

/**
 * 卸载次序。**刻意与安装次序不同** —— `sync()` 的安装序是 `… wsTabs, toolsMerge, motion`，
 * 这里是 `… wsTabs, motion, toolsMerge`（既有行为：基线 `:330-347` 对 `:354`）。
 * 两者无共享状态，实际无害；但改成遍历 `installed` 会按插入序卸载、把这处差异变成
 * 随运行漂移的值，故用显式常量固化。
 */
export const UNINSTALL_ORDER: readonly Slot[] = [
  'handle', 'think', 'resize', 'nav', 'sessionDel', 'wsTabs', 'motion', 'toolsMerge',
]

export interface FeatureRegistry {
  /**
   * 按需装卸一个功能：`want` 为真且未安装时调用 `installer`；为假且已安装时先卸载再清记录。
   * `installer` 抛错时吞掉并告警，槽位保持未安装 —— 于是下次调用会**重试**。
   */
  ensureSafe: (slot: Slot, want: boolean, installer: () => Disposer) => void
  /** 按 `UNINSTALL_ORDER` 卸载全部已装功能并清空记录。 */
  disposeAll: () => void
}

/** 创建一份功能注册表。每份注册表持有自己的 `installed` 记录（一个 effect 一份）。 */
export function createFeatureRegistry(): FeatureRegistry {
  const installed: Partial<Record<Slot, Disposer>> = {}

  const ensure = (slot: Slot, want: boolean, installer: () => Disposer): void => {
    if (want && installed[slot] === undefined) installed[slot] = installer()
    if (!want && installed[slot] !== undefined) {
      installed[slot]!()
      installed[slot] = undefined
    }
  }

  /**
   * 单个功能安装/卸载失败只影响它自己：异常若逃出 effect setup，cordis 会丢弃整条
   * cleanup 链，已安装的其它功能将无法卸载，还可能让插件整体被判为加载失败。
   */
  const ensureSafe = (slot: Slot, want: boolean, installer: () => Disposer): void => {
    try {
      ensure(slot, want, installer)
    } catch (err) {
      console.warn('[width-slider] feature lifecycle failed: ' + slot, err)
    }
  }

  const disposeAll = (): void => {
    for (const slot of UNINSTALL_ORDER) {
      if (installed[slot] !== undefined) {
        installed[slot]!()
        installed[slot] = undefined
      }
    }
  }

  return { ensureSafe, disposeAll }
}
```

**逐字保真要求**（三处绝不能"顺手优化"）：
1. `ensure` 的 `want=false` 分支里 **`installed[slot]!()` 在 `installed[slot] = undefined` 之前** —— dispose 抛错时记录保持"已装"（基线 `:309-312` 的次序）。
2. `disposeAll` **不套 try/catch**（基线 `:354-359` 无 try）—— 某个 dispose 抛错会中断后续卸载，这是既有行为。
3. `console.warn` 的文案逐字 `'[width-slider] feature lifecycle failed: ' + slot`（**无方括号外的空格差异**，基线 `:324`）。

### 4.3 `src/client/core/rpc.ts`（新建）

```ts
import { callEndpoint } from './endpointChannel.ts'

/**
 * 读 host 侧持久化设置。返回 `null` 表示"读不到/读失败" —— 调用方据此**不改配置**
 * （内存默认值已经生效），见基线 `:366-369` 的 `raw === null` 短路。
 */
export async function rpcReadSettings(): Promise<unknown> {
  try {
    const result = await callEndpoint('/api/width-slider', 'readSettings', {})
    if (result && typeof result === 'object' && (result as { ok?: boolean }).ok === true) {
      return (result as { value?: { settings?: unknown } }).value?.settings ?? null
    }
    return null
  } catch {
    return null
  }
}

/** 写 host 侧持久化设置（**只落盘**，不广播 —— 热切换由 `applySettings` 负责）。 */
export async function rpcWriteSettings(settings: unknown): Promise<void> {
  await callEndpoint('/api/width-slider', 'writeSettings', { settings })
}
```

函数体逐字搬自 `:275-285` 与 `:287-289`，**只去掉未使用的 `ctx` 参数**。

### 4.4 `src/client/motion/state.ts`（新建）

```ts
import type { FeatureSettings } from '../../shared/settings.ts'
import { motionAllowed, motionLookOf } from '../../shared/motionSettings.ts'
import type { MotionEngineState } from './conversation.ts'
import { prefersReducedMotion } from './waapi.ts'

/**
 * 从 config store 快照 + 会话是否空白派生引擎状态。
 *
 * **纯函数**：不读会话账本、不写任何模块级状态。"账本读不到"的降级与一次性告警在
 * 装配层的适配器里（`client/index.ts`）—— `motion/` 不该知道会话业务事实。
 */
export function motionStateOf(settings: FeatureSettings, blank: boolean): MotionEngineState {
  // 总闸先行：`off` 一律不放行，`system` 档读系统的「减少动态效果」。总闸
  // 放行即三处场景全开——场景不再单独暴露（见 shared/motionSettings.ts 顶部
  // 说明）；样式则整组来自当前风格档，不再逐场景各读一个字段。
  const on = motionAllowed(settings.motionMode, prefersReducedMotion())
  const look = motionLookOf(settings.motionLook)
  return {
    transcript: on,
    sidebar: on,
    newChat: on,
    style: look.motionStyle,
    sidebarStyle: look.sidebarMotionStyle,
    newChatStyle: look.newChatMotionStyle,
    roleEntrance: on,
    blank,
  }
}
```

`return` 块逐字搬自 `:166-175`（**字段顺序不变** —— 产物比对时它决定字面量顺序）。

### 4.5 `src/client/features/width/index.ts`（新建）

`HANDLE_HIDE_CSS`（`:51-54`）+ `installWidthFeature(): Disposer`（`:58-91`）**整段逐字搬移**。

**签名保持无参**（裁定 8）：它不注册槽位、不读设置、只用 `document` 与 `applySavedWidth()`。

import：`applySavedWidth` 自 `../../widthPrefs.ts`、`Disposer` 自 `../../../shared/types.ts`（**实施期订正**：本节与 §4.6 原写 `../../shared/types.ts`，从 `src/client/features/X/` 出发会解析到不存在的 `src/client/shared/`，tsc 报 `TS2307`）。

### 4.6 `src/client/features/think/index.ts`（新建）

两部分：

1. `installThinkRenderer(ctx: ClientContext): Disposer` —— `:93-131` **逐字搬移**（含 3 处 `as never` 与 `collapseAfterRun: getSettings().thinkMode === 'auto-collapse'`）。`ctx` 类型保持 `ClientContext`（裁定 15）。
2. `warnIfUpstreamPresent(): void` —— `:251-263` **逐字搬移**（含中文告警文案与 `'dsh-think-zh-expand-'` 字面量）。

import：`createElement` 自 `react`、`AssistantStepView`/`THINK_STYLES` 自 `../../think/thinkView.tsx`、`getSettings` 自 `../../core/config.ts`、`ClientContext` 类型自 `@deepseek-ai/dsh-client-runtime/client`、`Disposer` 自 `../../../shared/types.ts`（见 §4.5 实施期订正）。

### 4.7 `src/client/features/motion/index.ts`（新建）

```ts
/** 会话账本端口：由装配层从 `ctx.sessions` 适配。`features/` 层不接触宿主 ctx 形状。 */
export interface MotionSessionsPort {
  /** 订阅会话账本变化（切换 / blank 变化 / 列表刷新）。返回退订函数。 */
  subscribe: (listener: () => void) => () => void
  /** 当前会话 id；账本不可用或未选中会话时为 `undefined`。 */
  currentSessionId: () => string | undefined
  /** 当前会话是否空白会话；账本不可用降级为 `false`。 */
  isBlank: () => boolean
}

export function installMotionFeature(sessions: MotionSessionsPort): Disposer
```

函数体搬自 `:185-249`，**四处改写**（其余逐字）：

| 基线 | 改写为 |
|---|---|
| `:205 getState: () => motionStateOf(ctx)` | `getState: () => motionStateOf(getSettings(), sessions.isBlank())` |
| `:208 ctx.sessions.list.subscribe(listener)` | `sessions.subscribe(listener)` |
| `:235 const current = ctx.sessions.list.getSnapshot().current` | `const current = sessions.currentSessionId()` |
| `:241 ctx.sessions.list.subscribe(syncSession)` | `sessions.subscribe(syncSession)` |

**逐字保真要求**：
- `:204-214` 的 subscribe 端口**必须两个退订都返回、都调用**（`:209-213` 的 `() => { offSettings(); offSessions() }`）。
- `:228-231` 的 `applySettings({ ...getSettings() })` **自我广播原样保留** + 既有注释 —— 删掉它会让「跟随系统」档在系统偏好切换后静默失效。
- `:187-194` 的 `cleanup` 清空 `disposers`（`disposers.length = 0`）保留；`:242-246` 的 `catch → cleanup() → throw` 保留。
- `:233 lastSessionId` 与 `syncSession` 的 `if (current === lastSessionId) return` 逻辑逐字保留。

import：`MOTION_CSS` 自 `../../motion/styles.ts`、`installConversationEntrance` 自 `../../motion/conversation.ts`、`installSettingsMotion` 自 `../../motion/settingsMotion.ts`、`prefersReducedMotion` 自 `../../motion/waapi.ts`、`motionStateOf` 自 `../../motion/state.ts`、`applySettings`/`getSettings`/`onSettingsChanged` 自 `../../core/config.ts`、`isPreviewOpen` 自 `../../core/overlayState.ts`、`motionAllowed` 自 `../../../shared/motionSettings.ts`、`Disposer` 自 `../../../shared/types.ts`（**实施期订正**：删掉原清单里的 `type MotionEngineState` —— `getState` 的返回类型靠推断，该 import 在本文件零引用）。

### 4.8 `src/client/index.ts`（改造成装配）

保留：头注释（**订正职责清单为 8 个开关**）、import、`:291 inject`、5 条 `ctx.effect`。

```ts
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'width-slider: dictionaries')

  // 上游冲突提示（激活即探测一次）。
  ctx.effect(() => {
    warnIfUpstreamPresent()
    return () => {}
  }, 'width-slider: upstream conflict probe')

  // ── 会话账本适配器 ──────────────────────────────────────────────
  // features/motion 与 motion/ 都不接触宿主形状（它们只认 MotionSessionsPort）；
  // 把 `ctx.sessions` 翻译成端口是本层职责，也是全仓唯一解构宿主账本形状的地方。
  // 注：`motionStateOf` 是纯函数，"读账本失败降级为 false + 只告警一次"落在这里。
  let ledgerWarned = false
  const motionSessions: MotionSessionsPort = {
    subscribe: (listener) => ctx.sessions.list.subscribe(listener),
    currentSessionId: () => ctx.sessions.list.getSnapshot().current,
    isBlank: () => {
      // 会话账本读取失败不应让动效整块失效：退化为"非空白会话"（不播放新建
      // 对话入场），其余三组动效照常。
      try {
        // 形状断言逐字搬自基线 `:148-152`：`ClientContext` 是 `any` 桩，这个
        // `as unknown as` 是本仓唯一记录宿主账本形状的地方（批次⑨ 收紧类型时以它为准）。
        const snapshot = (ctx as unknown as {
          sessions: {
            list: { getSnapshot: () => { current?: string; byId: Record<string, { blank?: boolean } | undefined> } }
          }
        }).sessions.list.getSnapshot()
        return snapshot.current !== undefined && snapshot.byId[snapshot.current]?.blank === true
      } catch (err) {
        // getState 会被频繁调用；账本持续不可用时只提示一次。
        if (!ledgerWarned) {
          ledgerWarned = true
          console.warn('[width-slider] motion: session ledger unavailable', err)
        }
        return false
      }
    },
  }

  // 受控生命周期：依据配置开关安装/卸载各功能；配置变化即时热切换。
  ctx.effect(() => {
    const registry = createFeatureRegistry()

    const sync = (): void => {
      const s = getSettings()
      registry.ensureSafe('handle', s.widthSlider, () => installWidthFeature())
      registry.ensureSafe('think', s.thinkRender, () => installThinkRenderer(ctx))
      registry.ensureSafe('resize', s.dialogResize, () => installDialogResizePatch())
      registry.ensureSafe('nav', s.navScroll, () => installNavScrollPatch())
      registry.ensureSafe('sessionDel', s.sessionDelete, () => installSessionDelete(ctx as never))
      // 工作区分页：组件常驻（启动即包裹一次），开关只切换 wrapper 内 enabled
      // 状态（显示标签/过滤），不再反复安装/卸载组件——开关即时生效。
      registry.ensureSafe('wsTabs', true, () => installWorkspaceTabs(ctx as never))
      // 侧边栏工具并入新建会话行：同样常驻安装，模块内部按开关搬运/还原。
      registry.ensureSafe('toolsMerge', true, () => {
        const merge = installSidebarToolsMerge({ enabled: () => getSettings().sidebarToolsMerge })
        return () => merge.dispose()
      })
      // 动效：总闸放行即安装引擎。场景不再有独立开关，引擎拿到 on 之后
      // 三处入场与设置面板动效一齐生效，总闸关闭时整块卸载。
      registry.ensureSafe('motion',
        motionAllowed(s.motionMode, prefersReducedMotion()),
        () => installMotionFeature(motionSessions))
    }

    const unsubscribe = onSettingsChanged(sync)
    sync()
    return () => {
      unsubscribe()
      registry.disposeAll()
    }
  }, 'width-slider: feature lifecycles')

  // … E4 原样、E5 原样（仅 `rpcReadSettings()` / `rpcWriteSettings(settings)` 去 ctx）…
}
```

**次序契约（绝不能变）**：
1. 五条 `ctx.effect` 的**声明次序** = 执行次序（cordis 的 setup 同步执行）：字典 → 上游探测 → 功能生命周期 → 配置拉取 → 设置区块。
2. E3 内 `onSettingsChanged(sync)` **先于**首次 `sync()`。
3. E3 的 cleanup 里 `unsubscribe()` **先于** `disposeAll()` —— 否则卸载途中任一 installer 的内部写设置会触发 `sync()` 把刚卸的功能重装。
4. `apply` **必须返回 `void`**（不接受 disposer；`tsdown.config.ts:73-75` 的 ModuleLoader `module.exports` 握手 + cordis client loader 契约）。

---

## 5. 依赖方向

```
client/index.ts ─┬─> core/{config,endpointChannel,locales,overlayState,rpc,features}
                 ├─> features/{width,think,motion}/index.ts        (新边)
                 ├─> motion/index.ts (barrel: prefersReducedMotion, MOTION_CSS)
                 ├─> shared/motionSettings.ts, shared/settings.ts
                 └─> 既有特性模块（WidthSliderSettings / sessionDelete / sidebarToolsMerge / workspaceTabs / patches/* / think/thinkView）

features/width/index.ts  ─> widthPrefs.ts, shared/types.ts
features/think/index.ts  ─> think/thinkView.tsx, core/config.ts, shared/types.ts
features/motion/index.ts ─> motion/{conversation,settingsMotion,state,styles,waapi}
                          , core/{config,overlayState}, shared/{motionSettings,types}
core/features.ts         ─> shared/types.ts                       (零 client 依赖)
core/rpc.ts              ─> core/endpointChannel.ts
motion/state.ts          ─> shared/{settings,motionSettings}, motion/{conversation,waapi}

motion/index.ts (barrel) ─> motion/state.ts                       (新增一行)
core/locales.ts          ─> (新增 declare module + NS，无新 import)
```

**必须无环**（`features/*` 之间不得互相 import；`core/` 不得 import `official/`、`features/`、`patches/`、`motion/`）。

**已知的可接受反向依赖**：`features/width/index.ts → widthPrefs.ts`（`widthPrefs.ts` 属尚未搬迁的 `client/` 根，批次⑨ 归位）。

---

## 6. 隐式契约（改一处漏一处即静默失效）

| # | 契约 | 失效表现 |
|---|---|---|
| **IC1** | slot 名单：`Slot` 类型 ∪ 8 个 `ensureSafe` ∪ `UNINSTALL_ORDER` | 漏 `UNINSTALL_ORDER` 项 → **静默**泄漏（style / observer / 槽位注册跨 effect 存活）。本批已用「类型 + 常量」把三处收成两处 |
| **IC2** | 安装序（`:330-347`）与卸载序（`:354`）**本就不一致**（`motion` ↔ `toolsMerge` 互换） | 用 `UNINSTALL_ORDER` 常量固化；改成遍历即漂移 |
| **IC3** | `inject = ['slots','locale','connection','sessions','workspaces']` ↔ 实际消费者 | 删 `sessions` → 账本读取抛错但被 catch 降级（**静默**）；删 `workspaces` → `ctx.get?.('workspaces')` 返回 undefined、页签分组不工作（**静默**）。`connection` **零消费者**（`core/endpointChannel.ts:4-7` 明写不走 `connection.rpc.call`，`:25-35` 用原生 fetch）→ 记批次⑧。**本批不动 `inject`** |
| **IC4** | `:379-388` 注册选项 ↔ 宿主槽位契约 | `label: 'Width Slider'` 是硬编码英文而与 `locale: NS` 并存；宿主是否支持 label 走词典**无证据** → 本批不动 |
| **IC5** | 设置页 write/apply 分工 | E5 注入的 `writeSettings` **只落盘**；热切换靠 `WidthSliderSettings.tsx:276 applySettings(...)`。接错成 `applySettings` → 「点开关不热切换」或「热切换不落盘」（均静默） |
| **IC6** | `setPreviewOpen`（`WidthSliderControls.tsx:363-364`）↔ `isPreviewOpen`（`:221-222` 注入） | 搬迁时若让 `motion/` 直读预览状态即是回退批次④ 的成果。**零测试覆盖** → 第 10 节补测第 3 条 |
| **IC7** | `apply` 返回值必须是 `void` | 返回 disposer 破坏 cordis loader 契约且 tsdown 不报错 |
| **IC8** | `declare module` ↔ `WidthSliderKey` ↔ `NS` ↔ `locale: NS` | 改一处漏一处 → TS 报错（`PropsLocale<'widthSlider'>` 失配），**不静默** |

---

## 7. 时序与微任务敏感点

1. **`onSettingsChanged(sync)` 先于首次 `sync()`**（`:350` / `:351`）—— 否则首次 sync 与订阅之间存在无人监听窗口。**中风险**（窗口极窄，无测试能发现反序）。
2. **卸载数组硬编码**（`:354`）→ 见 IC2。
3. **`:228-231` 的自我广播**是故意的，见 §4.7。
4. **`:242-246` 先 `cleanup()` 再 `throw`** —— 漏 cleanup 泄漏；漏 throw 让 `ensureSafe` 误判成功。
5. **三个 cleanup 的重入语义不一致**：`installMotionFeature` 清空 `disposers`（可重入 no-op），另两个不清（不可重入）。当前不可达 —— **逐字保留，不得统一**。
6. **`onReduceMotionChange` → `applySettings` 会同步重入 `sync()`**（`core/config.ts:31` 同步遍历监听器）。因为 wsTabs/toolsMerge 的 gate 恒真，它们的 installer 不会重入 —— **这是 Q2 保持常驻语义的第二个理由**。
7. **`:365-372` 的 `cancelled` 标志**必须保留（`rpcReadSettings().then` 与 effect 销毁的竞态）。
8. **`:204-214` 的两个退订都要调用**（见 §4.7）。
9. **`installConversationEntrance` 安装期同步调用 `options.getState()`**（`motion/conversation.ts:117-118`）—— 此时 `lastSessionId` 尚未初始化（`:240` 才 `syncSession()`）。现状无害（getState 只读 settings + blank + prefersReducedMotion），**搬迁时 getState 不得依赖 `syncSession` 的状态**。

---

## 8. 风险表

| # | 位置 | 风险 | 对策 |
|---|---|---|---|
| R1 | 三个 cleanup 的重入语义 | "顺手统一"是静默行为变更 | 逐字搬运三家差异，写进本规格 |
| R2 | `:228-231` | 删自我广播 → 「跟随系统」档静默失效 | 原样保留 + 注释 + 手工验证项 |
| R3 | `:242-246` | 漏 cleanup 泄漏；漏 throw 误判成功 | 逐字搬运 + 补「引擎抛错」单测 |
| R4 | `:339-342` + `sidebarToolsMerge.ts:371` | 改成真门控会跳过 `style.remove()` | gate 恒 `true` |
| R5 | `:337` | 同上 | 保留 `true` 与注释 |
| R6 | `:208`/`:235`/`:241` | 随 `features/motion/` 走会把宿主形状依赖扩散 | 端口注入（裁定 2） |
| R7 | `:135-136` | 与 Q1 原口径冲突 | 留装配层（裁定 1） |
| R8 | `:304`/`:330-347`/`:354` | 三处同名单，漏卸载数组静默泄漏 | `Slot` + `UNINSTALL_ORDER`（裁定 4） |
| R9 | `:354` | 安装序 ≠ 卸载序 | 显式常量固化（裁定 4） |
| R10 | `:291` 的 `connection` | 零消费者 | 本批不动，记批次⑧ |
| R11 | 三个 style id 字面量 | "顺手规范化"改变幂等基线 | 逐字保留（裁定 13） |
| R12 | `:196 try` → `:242 catch` | style 注入挪出 try → catch 不再移除它 | 保持包夹；**不建 `core/styleTag.ts`** |
| R13 | `:204-214` | 漏一个退订 = 静默失效 | 补单测 |
| R14 | `:205` | getState 在 `lastSessionId` 初始化前被调用 | getState 保持无状态 |
| R15 | `:220-222` | 预览状态直读回 `motion/` 即回退 | 注入线留在 `features/motion/`；补 Escape 用例 |
| R16 | `:293` | `apply` 返回 disposer | 签名逐字 `: void` |
| R17 | 全仓 | `client/index.ts` **零测试覆盖** → 搬迁错误不会让 247 项测试变红 | 第 10 节补测 + 手工验证 + 产物比对 |
| R18 | `src/env.d.ts:15-17` | `ClientContext = any` ⇒ ctx 本就零类型保护 | 本批不引入最小接口（裁定 10），记批次⑨ |

---

## 9. 明确不做的事

1. **不新建 `core/sessionLedger.ts`**（裁定 1）。
2. **不建 `core/styleTag.ts`、不统一 5 处 `<style>` 注入**（裁定 13）。
3. 不动 `src/client/sidebarToolsMerge.ts`（除本规格允许的零改动）与 `src/client/patches/**`。
4. **不动 `inject`**（含零消费者的 `connection`）→ 批次⑧。
5. 不改 `motion/`、`official/`、`patches/` 任何既有文件的实现。
6. 不改三个 style id 字符串、`HANDLE_HIDE_CSS` 内容、8 个 `Slot` 名、5 个 effect name 字符串（**diff 归因锚点**）。
7. 不统一三个 cleanup 的重入语义。
8. 不把 `:354` 的卸载数组改成遍历 `installed`。
9. 不把 wsTabs/toolsMerge 的 `true` gate 改成真门控。
10. 不修计划第 9 节已列的既有笔误（如 `sessionDelete` 兜底按钮的 `'alignItems:center'`）。
11. 不升级依赖、不改 `tsdown.config.ts`、不动 `package.json`。
12. 不新增 vitest 全局配置 → 新测试逐文件加 `// @vitest-environment jsdom`。
13. 不改 `:41-45` 的 `declare module` **内容**（只搬落点到 `core/locales.ts`）。
14. 不修 `:379` 的 `label: 'Width Slider'`。
15. 不删 `motion/index.ts` 的既有导出行。

---

## 10. 验证要求

### 10.1 每步必跑

```powershell
npx tsc -p tsconfig.test.json --noEmit      # 必须 exit 0
npx vitest run                              # 必须全绿（开工前 25 文件 / 247 用例）
npm run build                               # 必须 exit 0
```

### 10.2 产物等价性（**行为敏感批次**判据）

**开工前先备份基线**（`lib/` 在 `.gitignore` 里，`git diff --stat lib/...` 是**空判据**）：

```powershell
npm run build
New-Item -ItemType Directory -Force $env:TEMP\batch7-base | Out-Null
Copy-Item lib/index.mjs,lib/client.js $env:TEMP\batch7-base\
Get-FileHash $env:TEMP\batch7-base\index.mjs   # 记下 sha256
```

完工后：

1. `lib/index.mjs` 与基线 **sha256 逐字节相同**（本批不碰 host）。若不同，**必须逐行归因并解释**。
2. `lib/client.js` 用 `git diff --no-index -U0` 切 hunk 后逐条归因。
3. 归一化多重集比对：去掉空行、整行注释、`//#region` 行、`$N` 后缀后按行排序比对，两侧未配对行必须全部能归到「搬移 / 常量内联 / region 改名 / 注释挪位」四类之一。
4. 归一化脚本与批次⑥ 同款，落 `$env:TEMP`，**不入库**。

### 10.3 补测试（与重构**分开提交**）

新建 3 个文件，全部带 `// @vitest-environment jsdom`：

1. **`test/features.test.ts`** —— 注册表开关矩阵：假 installer 计数，断言①`want=true` 装一次、重复 `sync` 不重装；②`want=false` 卸载一次；③installer 抛错 → 槽位保持未安装、下次 `sync` **重试**、告警文案命中；④`disposeAll` 按 `UNINSTALL_ORDER` 卸载（用假 installer 记录调用序）。**这是「注册表拆错就静默失效」的唯一网。**
2. **`test/motionState.test.ts`** —— `motionStateOf` 派生矩阵：`motionMode`（`off`/`on`/`system`）× `prefersReducedMotion` 桩 × `blank`；断言 8 个字段的全组合，且 `off` 档一律不放行。
3. **`test/settingsMotion.test.ts` 补一条**（或就近新增）—— `isPreviewOpen` 注入线：预览开启（`documentElement` 带 `data-dsw-preview`）时按 Escape **应放行**，不关闭弹窗。**这是批次④ 遗留项的收口。**

### 10.4 手工验证清单（无法自动化）

1. 开关矩阵：8 个开关逐个开关，界面即时响应（尤其 `wsTabs`/`toolsMerge` 的「常驻 + 内部门控」）。
2. 「跟随系统」档：切换系统「减少动态效果」，动效即时跟随（验 R2）。
3. 会话切换：新建对话入场动画重播；空白会话不播放。
4. 设置页打开/关闭动效 + Escape 关闭 + 预览拖宽时 Escape 归预览。
5. 插件禁用/卸载：无残留 style / observer。

---

## 11. 交付要求

- **分 2 次提交**：① 搬移（7 新建 + 3 修改，`tsc`/`vitest`/`build` 全绿 + 产物归因）；② 补测试（3 个测试文件）。**禁止把补测试混进搬移提交。**
- **提交信息用中文**，风格沿用：`refactor(client): 批次⑦ 抽出 features/ 与 core/features.ts，入口退化为装配`。
- **行尾约定**：写完 → 转 CRLF → `git add` → commit（工作树 CRLF / index LF，`core.autocrlf=true`，无 `.gitattributes`）。
- **交付报告必须包含**：
  1. 实际文件清单（行数 / 字节）；
  2. 三个新文件的导出面；
  3. `src/client/index.ts` 的最终行数；
  4. 每一条**改写**（区别于纯搬移）的逐字 before/after 与理由；
  5. tsc / vitest 的实测输出（文件数、用例数）；
  6. `lib/index.mjs` 的 sha256 与基线对比；
  7. `lib/client.js` 的 hunk 数与逐条归因；
  8. 归一化多重集的 lost / added 计数与配对说明；
  9. **偏离本规格之处逐条列出并给出理由**，不确定处显式标注。

---

## 12. 实施结果（已交付，供复查）

**提交链**：`a948e23`（搬移）→ `f609d62`（实施期裁定补正）→ `0e14f86`（补测试）。后者是本次实施为落实裁定 3/4/6 而额外拆出的一次提交，未混进搬移提交。

| 提交 | 内容 | 变更 |
|---|---|---|
| `a948e23` | 搬移：7 新建 + 4 修改 | 11 files, +386 / −308 |
| `f609d62` | 补正：恢复账本形状断言、删未用 type import、删 `widthPrefs.ts` 再导出 | 3 files, +8 / −4 |
| `0e14f86` | 补测 3 个文件 | 3 files, +434 |

**度量**：`src/client/index.ts` **393 → 144 行**（`f609d62` 恢复形状断言后为 **150 行**）。

| 文件 | 行数 | 字节 |
|---|---:|---:|
| `src/shared/types.ts` | 10 | 522 |
| `src/client/core/features.ts` | 64 | 2599 |
| `src/client/core/rpc.ts` | 22 | 928 |
| `src/client/motion/state.ts` | 28 | 1308 |
| `src/client/features/width/index.ts` | 42 | 1797 |
| `src/client/features/think/index.ts` | 59 | 2618 |
| `src/client/features/motion/index.ts` | 92 | 3988 |
| `src/client/index.ts` | 150 | 7718 |

**验证**（主会话独立复现）：`tsc -p tsconfig.test.json --noEmit` exit 0；`vitest` **28 文件 / 268 用例**（25/247 → 28/268，+21 = 10 + 8 + 3，无关用例数不变）；`npm run build` exit 0。

**产物等价性**：
- `lib/index.mjs` = `22715745A86B9C89A9E469FB50C3288DEF6D0253CC781D4CF43D8179E0FD2410`（25039 B）**与基线逐字节相同**；三次提交后各测一次均不变。
- `lib/client.js` = `33704C254D893C66B40A8C3E715BF85B34E4EE81444018F4E8D6233818449CC7`（269989 B，+772 B）；**15 个 hunk** 全部归入「搬移 / 常量内联 / region 改名 / 注释挪位」四类。
- 归一化多重集（去空行 / 整行注释 / `//#region` / `$N` 后缀）：base 5029 / new 5045，**LOST 23 / ADDED 39**，净差 +16 配平，未配对 0 条。
- `f609d62` 与 `0e14f86` 之后 `lib/client.js` 与 `a948e23` 的产物**逐字节相同** —— 三处补正被编译器擦除、测试不进 bundle，运行时零差异。

**实施期对规格的订正**（已回修 §1 / §4.1 / §4.5 / §4.6 / §4.7 / §4.8）：`Disposer` 的 import 路径 `'../../shared/types.ts'` → `'../../../shared/types.ts'`（从 `src/client/features/X/` 出发前者的父目录不存在，tsc 实测 `error TS2307`）；行数目标「150–200」→「约 145」（骨架是规范性内容，按它落地即 144 行，估算值不得靠填充凑数）；§4.7 删掉零引用的 `type MotionEngineState`；§4.1 明确**不保留** `widthPrefs.ts` 的再导出行；§4.8 恢复基线的账本形状断言（裁定 6）。

**已知副作用（接受，不作为缺陷）**：`lib/client.js` 不再包含入口模块的头注释。根因由四次对照实验定位 —— rolldown/oxc **只在模块首个 import 是外部 value import 时发射该模块头注释**；基线入口首 import 是 `import { createElement } from 'react'`，而新入口已无任何外部 value import（`createElement` 随渲染器搬进 `features/think/`）。纯注释、零运行时影响；两条修法（留死 import / 把头注释挪到 `const inject`）都更差，故源文件顶部保持不动。

**测试的覆盖边界**（实施者如实上报，记以备查）：
- `test/features.test.ts`（10 例）**测不到**五个真实 installer 的行为；不跑 cordis effect 链，故「异常逃出 effect setup 会丢整条 cleanup 链」只有注释、无端到端用例。
- `test/motionState.test.ts`（8 例）**测不到** `motionAllowed` 自身的 bug —— 矩阵用例以它为判据来源（刻意避免重写真值表），它由 `test/motionSettings.test.ts` 覆盖。
- `test/settingsMotionPreview.test.ts`（3 例）钉的是**读侧**契约：没有任何东西真的调用 `setPreviewOpen(true)`（滑块层写标记那一侧未覆盖，标记本身由 `test/overlayState.test.ts` 覆盖）；断言点是退出的**开始**而非退出后对宿主的延后送达（后者由 `test/settingsMotion.test.ts` 覆盖）；`matchMedia` 打桩成 `matches:false`，`prefersReducedMotion()` 的直通分支未触发。
- **变异探针**（改坏实现 → 用例应变红，源文件均已复原、`git diff` 为空）：`test/features.test.ts` 3 次（`installed[slot]!()` 与置空对调 → 2 例红；`UNINSTALL_ORDER` 前两项对调 → 3 例红；`disposeAll` 套 try/catch → 1 例红）；`test/settingsMotionPreview.test.ts` 2 次（`isPreviewOpen` 接成恒 `false` → 例 1 红、恒 `true` → 例 2 红）。
- 三份新测试均落在 `test/settingsMotionPreview.test.ts` 而非并入 `settingsMotion.test.ts`：该断言要真装 features 层并读配置 store，就近合并会把 features 反向引进引擎测试文件。
