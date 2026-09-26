# 批次⑧ 实施规格：host 侧拆分

> **本文件是本批唯一实施依据。** 基线为 `ab723e4`（批次⑦ 完成后的工作树，`git status` 干净）。
> 本批**只动 host 侧**：改造 `src/index.ts`（262 行）+ 新建 `src/host/` 下的职责模块。

---

## 1. 目标与硬边界

把 `src/index.ts` 从「文件 IO + 中文 prompt 控制器 + 5 个端点处理内联在 108 行 `apply` 里」拆成职责模块，入口退化为装配层。对应计划第 6 节批次 8。

**硬边界**：

1. **零行为变化。** 端点协议（路径 `/api/width-slider`、5 个方法名）、响应信封、错误码、文件路径与文件名、损坏文件改名规则、**全部日志文案**、prompt section 名 `dsh-width-slider-think-zh` 与 order `-90`、`inject` 数组的**元素与顺序**、`ctx.effect` 的两条 name 字符串 —— 全部逐字保留。
2. **导出面保真。** `src/index.ts` 仍然导出：`inject`、`PROMPT_TEXT`、`apply`、`DEFAULT_FEATURE_SETTINGS`、`mergeSettings`、`FeatureSettings`（类型）。前两者必须是**值导出**（`lib/index.mjs` 的 `export` 列表会变，但名字集合不得变）。
3. **不碰**：`src/client/**`、`src/shared/**`、`test/**`、`tsdown.config.ts`、`package.json`。
4. **行尾 CRLF、无 BOM**（工作树 CRLF / index LF，`core.autocrlf=true`，无 `.gitattributes`）。
5. **不顺手修任何东西** —— 见 §10。

---

## 2. 现状实测（基线 `ab723e4`，`src/index.ts` 共 262 行）

| 行范围 | 内容 | 归属 |
|---|---|---|
| `:1-19` | 模块头注释（v0.3.0 三项职责、契约真源、`section` 名避让上游、MIT 归属声明） | 入口（**逐字保留**） |
| `:20-26` | `node:fs` / `node:path` / cordis `Context` / `resolveDshHome` / settings / `deleteSessionById` / `registerEndpointChannel` | 摊到各模块 |
| `:30-33` | `SETTINGS_DIR`（`join(resolveDshHome(), 'storages', 'dsh-plugin-width-slider')`）、`SETTINGS_FILE`、`GROUPS_FILE` | → `settingsStore.ts` / `workspaceGroupsStore.ts` |
| `:35-58` | `GroupFileItem` / `GroupsFile` 两个 interface + `normalizeGroups(raw)` | → `workspaceGroupsStore.ts` |
| `:60-76` | `readGroupsSync()`（缺失→`[]`；损坏→改名 `+ '.corrupt-' + ISO` + `console.warn` + `[]`） | → `workspaceGroupsStore.ts` |
| `:78-84` | `writeGroupsSync(groups)`（`mkdirSync` + tmp + `JSON.stringify({version:1, groups}, null, 2)` + `renameSync`） | → `workspaceGroupsStore.ts` |
| `:86-87` | `export { DEFAULT_FEATURE_SETTINGS, mergeSettings }` + `export type { FeatureSettings }` | 入口（**保留**） |
| `:89-107` | `readSettingsSync()`（缺失→`{...DEFAULT}`；损坏→改名 + `console.warn` + `{...DEFAULT}`） | → `settingsStore.ts` |
| `:109-115` | `writeSettingsSync(settings)`（原子写，无 version 包装） | → `settingsStore.ts` |
| `:117-124` | `webServer` 必需性的长注释 | 入口（**逐字保留**，紧贴 `inject`） |
| `:125` | `export const inject = ['systemPrompt', 'connection', 'subprocess', 'webServer']` | 入口（**保留**） |
| `:127-140` | `export const PROMPT_TEXT`（模板字符串，含多行中文） | → `chinesePrompt.ts`，入口 re-export |
| `:142-153` | `type RpcContext = Context & { systemPrompt?…; connection?… }` | 拆（见 §8 第 1 条） |
| `:155-262` | `apply(baseCtx: Context): void` | 拆（见 §5） |

**`apply` 内部逐段**：

| 行 | 内容 | 归属 |
|---|---|---|
| `:156-157` | `const ctx = baseCtx as RpcContext` / `const logger = baseCtx.logger` | 入口 |
| `:160` | `let current = readSettingsSync()` | 入口建 store |
| `:162` | `let currentGroups = readGroupsSync()` | 入口建 store |
| `:167-185` | `let promptDispose` + `const syncChinesePrompt = (cfg) => { try {…} catch {…} }` | → `chinesePrompt.ts` 的控制器工厂 |
| `:187-198` | `ctx.effect(…, 'width-slider: chinese prompt')` | 入口 |
| `:200-206` | 端点通道的长注释 | 入口（**逐字保留**，紧贴 effect） |
| `:207-259` | `ctx.effect(() => registerEndpointChannel(ctx, '/api/width-slider', handler), 'width-slider: rpc handler')`，handler 是 5 个 endpoint 的 if 链 | handler → `api.ts`；effect 留入口 |
| `:261` | `logger?.info?.('dsh-plugin-width-slider host loaded')` | 入口 |

---

## 3. 目标文件清单

| 文件 | 动作 | 估计行数 | 职责 |
|---|---|---:|---|
| `src/host/jsonFile.ts` | 新建 | ~70 | 通用原子 JSON 读写 + 损坏改名保现场 |
| `src/host/settingsStore.ts` | 新建 | ~55 | `settings.json` 的读写 + 内存当前值 |
| `src/host/workspaceGroupsStore.ts` | 新建 | ~110 | `workspace-groups.json` 的 `normalizeGroups` + 读写 + 内存当前值 |
| `src/host/chinesePrompt.ts` | 新建 | ~75 | `PROMPT_TEXT` + 中文强制注入控制器 |
| `src/host/api.ts` | 新建 | ~120 | `/api/width-slider` 的 5 个端点处理函数 |
| `src/index.ts` | 改造 | ~55 | 只留 `inject` / `PROMPT_TEXT` re-export / 导出面 re-export / `apply` 装配 |

**`src/host/` 现有 3 个文件**（`dshHome.ts` 40 行、`endpointChannel.ts` 92 行、`sessionDeleteService.ts`）**本批不动**。

---

## 4. 各文件规格

### 4.1 `src/host/jsonFile.ts`

抽出 `readGroupsSync` 与 `readSettingsSync` 中**逐字相同**的损坏改名逻辑（`renameSync` + `basename.corrupt-<ISO>` + 吞掉改名失败），以及两处原子写（`mkdirSync` + tmp + `writeFileSync` + `renameSync`）。

```ts
/** 原子写 JSON：mkdir -p → 写 <file>.tmp → rename 覆盖。失败向上抛。 */
export function writeJsonAtomic(file: string, value: unknown): void

/**
 * 读 JSON。`file` 不存在时返回 `onMissing()`；解析或读取抛错时把文件改名为
 * `<file>.corrupt-<ISO>` 保留现场、调用 `onCorrupt(err)`、返回 `onMissing()`。
 */
export function readJsonOrRecover(
  file: string,
  onMissing: () => unknown,
  onCorrupt: (err: unknown) => void,
): unknown
```

**逐字保真要求**：

- 时间戳格式：`new Date().toISOString().replace(/[:.]/g, '-')`。
- 改名失败**必须吞掉**（`catch { /* 忽略 */ }` / `catch { /* 改名失败不阻塞 */ }`）—— 两处注释文案不同，**不要统一**；改为让 `onCorrupt` 之外的改名 catch 用中性注释即可，但**行为必须一致**（吞掉）。
- 改名前的 `existsSync(file)` 判定必须保留。
- `readJsonOrRecover` **不负责**类型校验与 fallback 值 —— 那是调用方的事（`normalizeGroups` / `mergeSettings`）。
- **不要**把 `JSON.stringify(value, null, 2)` 的缩进参数做成选项：两处都是 `2`。

### 4.2 `src/host/settingsStore.ts`

```ts
import { join } from 'node:path'
import { resolveDshHome } from './dshHome.ts'
import { DEFAULT_FEATURE_SETTINGS, mergeSettings, type FeatureSettings } from '../shared/settings.ts'

const SETTINGS_DIR = join(resolveDshHome(), 'storages', 'dsh-plugin-width-slider')
const SETTINGS_FILE = join(SETTINGS_DIR, 'settings.json')

/** 读设置文件；缺失或损坏时回退默认。损坏文件改名保留现场（不静默覆盖）。 */
export function readSettingsFileSync(): FeatureSettings

/** 原子写设置文件（tmp + rename）。 */
export function writeSettingsFileSync(settings: FeatureSettings): void

/**
 * 每次 `apply` 一份的内存当前值。`commit` 先落盘、成功才换内存 —— 落盘抛错时
 * 内存必须保持旧值（端点据此返回 `write-failed` 而不改状态）。
 */
export interface SettingsStore {
  /** 当前生效设置（启动时读盘，写成功后热更新）。 */
  get: () => FeatureSettings
  /** 落盘并切换内存值；落盘失败向上抛，内存不变。 */
  commit: (next: FeatureSettings) => void
}

export function createSettingsStore(): SettingsStore
```

**逐字保真要求**：

- 日志文案：`'[width-slider] settings 文件损坏或不可读，已回退默认并保留现场'`，第二参数 `err`。
- 缺失/损坏的 fallback 都是 `{ ...DEFAULT_FEATURE_SETTINGS }`（**浅拷贝，带展开**，不是直接返回常量引用）。
- 成功路径用 `mergeSettings(parsed)`（白名单合并）。
- `createSettingsStore()` 的 `get()` 初值是 `readSettingsFileSync()`。

### 4.3 `src/host/workspaceGroupsStore.ts`

```ts
export interface WsGroup { id: string; name: string; workspaceIds: string[] }

/** 归一化分组文件对象形状（`{ version?, groups? }`）：丢空/重复/非字符串 id，空名保留为 `''`。 */
export function normalizeGroups(raw: unknown): WsGroup[]

/** 读分组文件；缺失返回空数组，损坏改名保留现场。 */
export function readGroupsFileSync(): WsGroup[]

/** 原子写分组文件（写 `{ version: 1, groups }`）。 */
export function writeGroupsFileSync(groups: WsGroup[]): void

export interface WorkspaceGroupsStore {
  get: () => WsGroup[]
  /** 落盘并切换内存值；落盘失败向上抛，内存不变。 */
  commit: (groups: WsGroup[]) => void
}

export function createWorkspaceGroupsStore(): WorkspaceGroupsStore
```

**逐字保真要求**：

- `normalizeGroups` **逐字搬移，一行不改**。特别是 `:48-50` 那三行注释（解释为何不做语言相关兜底、空名原样保留、由 client 的 `sanitize()` 补默认名）。
- 日志文案：`'[width-slider] workspace-groups.json 损坏或不可读，已按空分组处理并保留现场'`，第二参数 `err`。
- 写盘内容逐字：`JSON.stringify({ version: 1, groups }, null, 2)` —— **`version: 1` 与 `groups` 的键序都要保留**。
- 原 `readGroupsSync` / `writeGroupsSync` 的**函数名会变**（加 `File`），这是本批唯一允许的重命名；`normalizeGroups` 的名字**不得改**（它是 host/client 之间的契约名，见 §7）。

### 4.4 `src/host/chinesePrompt.ts`

```ts
/** 注入到每次组装系统提示的固定中文指令（结构化规则，覆盖关键场景与术语边界）。 */
export const PROMPT_TEXT = `…原样…`

/** 中文强制所需的 ctx 最小契约（运行时由 DSH 注入）。 */
export interface PromptCtx {
  systemPrompt?: {
    section: (opts: { name: string; order: number; text: string }) => () => void
  }
}

export interface LoggerLike { warn?: (...args: unknown[]) => void }

export interface ChinesePromptController {
  /** 按当前配置安装/卸载 prompt section。可反复调用（热切换）。 */
  sync: (enabled: boolean) => void
  /** 卸载（幂等）。 */
  dispose: () => void
}

export function createChinesePromptController(ctx: PromptCtx, logger?: LoggerLike): ChinesePromptController
```

**三种状态转移必须与基线逐字一致**（`:168-185`）：

1. `enabled && promptDispose === null && sys?.section` → 安装（`section({ name: 'dsh-width-slider-think-zh', order: -90, text: PROMPT_TEXT }) ?? null`）。
2. `!enabled && promptDispose !== null` → `promptDispose()` + 置 `null`。
3. 抛错 → `logger?.warn?.('[width-slider] 中文强制注入切换失败', err)` + `promptDispose = null`。

**注意**：基线传的是整个 `cfg: FeatureSettings`，内部读 `cfg.chinesePrompt`。控制器改为收 `enabled: boolean`（调用方传 `settings.get().chinesePrompt`）—— 这是**允许的签名收窄**，因为控制器不需要知道别的字段。**但三种状态转移与 `promptDispose` 的重置时机不得变。**

**`dispose()` 的语义**（对应基线 `:190-197` 的 effect cleanup）：`if (promptDispose !== null) { try { promptDispose() } catch { /* 忽略 */ } promptDispose = null }` —— **两条 catch 注释文案不同**（`/* 忽略 */`），逐字保留。

### 4.5 `src/host/api.ts`

```ts
import type { EndpointHandler } from './endpointChannel.ts'
import type { SettingsStore } from './settingsStore.ts'
import type { WorkspaceGroupsStore } from './workspaceGroupsStore.ts'
import { normalizeGroups } from './workspaceGroupsStore.ts'
import { mergeSettings } from '../shared/settings.ts'
import { deleteSessionById, type SessionDeleteCtx } from './sessionDeleteService.ts'

export interface HostApiDeps {
  settings: SettingsStore
  groups: WorkspaceGroupsStore
  logger?: { warn?: (...args: unknown[]) => void; info?: (...args: unknown[]) => void }
  /** 传给 `deleteSessionById` 的原始 host ctx（基线是 `baseCtx as unknown as SessionDeleteCtx`）。 */
  baseCtx: unknown
  /** 设置写入成功后热切换中文强制（基线 `:224` 的 `syncChinesePrompt(next)`）。 */
  onSettingsApplied: (next: FeatureSettings) => void
}

/** `/api/width-slider` 的方法分发器。 */
export function createHostApi(deps: HostApiDeps): EndpointHandler
```

**5 个分支逐字保真**（错误码、消息、载荷形状、分支顺序）：

| 分支 | 返回 |
|---|---|
| `readSettings` | `{ ok: true, value: { settings: deps.settings.get() } }` |
| `writeSettings` | `const next = mergeSettings(body.settings)`；落盘抛错 → `logger?.warn?.('[width-slider] writeSettings failed', message)` + `{ ok: false, error: { code: 'write-failed', message } }`；成功 → `commit(next)` + `onSettingsApplied(next)` + `{ ok: true, value: {} }` |
| `wsGroupsRead` | `{ ok: true, value: { groups: deps.groups.get() } }` |
| `wsGroupsWrite` | `const groups = normalizeGroups({ groups: (body as { groups?: unknown }).groups })`（**那层 `{ groups: … }` 包装与 `:231-233` 的三行注释必须保留**）；落盘抛错 → 同上文案 `'[width-slider] wsGroupsWrite failed'`；成功 → `commit(groups)` + `{ ok: true, value: {} }` |
| `sessionDelete` | `const id = body.id`；非字符串或空 → `{ ok: false, error: { code: 'invalid-id', message: 'id is required' } }`；否则 `await deleteSessionById(deps.baseCtx as SessionDeleteCtx, id)`，`result.ok` → `{ ok: true, value: {} }`，否则 `{ ok: false, error: { code: result.code ?? 'delete-failed', message: result.message ?? 'delete failed' } }` |
| 兜底 | `logger?.warn?.('[width-slider] unknown endpoint', endpoint)` + `{ ok: false, error: { code: 'unknown-endpoint', message: 'unknown endpoint: ' + endpoint } }` |

**注意**：`body` 的构造是 `(payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>` —— 逐字搬移。`message` 的提取是 `err instanceof Error ? err.message : String(err)` —— 逐字搬移（**两处，不要抽成共用的 `messageOf`**，那会改变产物行数与常量内联形态，收益不足；若你判断抽取更清晰，必须在交付报告里标为偏离并说明）。

### 4.6 `src/index.ts`（改造后）

```ts
/** …原模块头注释 `:1-19` 逐字保留… */
import type { Context } from '@deepseek-ai/cordis'
import { DEFAULT_FEATURE_SETTINGS, mergeSettings, type FeatureSettings } from './shared/settings.ts'
import { PROMPT_TEXT, createChinesePromptController, type PromptCtx } from './host/chinesePrompt.ts'
import { createSettingsStore } from './host/settingsStore.ts'
import { createWorkspaceGroupsStore } from './host/workspaceGroupsStore.ts'
import { createHostApi } from './host/api.ts'
import { registerEndpointChannel } from './host/endpointChannel.ts'

export { DEFAULT_FEATURE_SETTINGS, mergeSettings }
export type { FeatureSettings }
export { PROMPT_TEXT }

/** …`:119-124` 的 webServer 注释逐字保留… */
export const inject = ['systemPrompt', 'connection', 'subprocess', 'webServer']

export function apply(baseCtx: Context): void {
  const ctx = baseCtx as Context & PromptCtx
  const logger = baseCtx.logger

  const settings = createSettingsStore()
  const groups = createWorkspaceGroupsStore()
  const prompt = createChinesePromptController(ctx, logger)

  // 生命周期 1：中文强制（随 fiber 安装/卸载）。
  ctx.effect(() => {
    prompt.sync(settings.get().chinesePrompt)
    return () => prompt.dispose()
  }, 'width-slider: chinese prompt')

  // 生命周期 2：…`:200-206` 的长注释逐字保留…
  ctx.effect(
    () => registerEndpointChannel(ctx, '/api/width-slider', createHostApi({
      settings,
      groups,
      logger,
      baseCtx,
      onSettingsApplied: (next) => prompt.sync(next.chinesePrompt),
    })),
    'width-slider: rpc handler',
  )

  logger?.info?.('dsh-plugin-width-slider host loaded')
}
```

**行数目标：约 55 行**（含 19 行头注释 + 6 行长注释）。不要为凑行数填充。

---

## 5. 可变状态归属（本批最容易出错的点）

基线 `apply` 里有 **3 个 per-apply 的可变状态**：

| 状态 | 基线行 | 新归属 |
|---|---|---|
| `current: FeatureSettings` | `:160` | `createSettingsStore()` 的闭包 |
| `currentGroups: WsGroup[]` | `:162` | `createWorkspaceGroupsStore()` 的闭包 |
| `promptDispose: (() => void) \| null` | `:167` | `createChinesePromptController()` 的闭包 |

**🚨 三者都必须在 `apply` 内创建（每次 `apply` 一份新实例）。**

**绝对禁止**：把它们做成模块级单例（如 `let current` 写在 `settingsStore.ts` 顶层）。

**理由（这是本批的硬约束，不是风格偏好）**：

1. 基线 `apply` 每次被调用都执行 `readSettingsSync()` / `readGroupsSync()`，**从磁盘重新取值**。模块级单例会让第二次 `apply` 沿用上一次的内存值 —— **真实行为变化**。
2. `test/hostEndpoints.test.ts:61-69` 用 `vi.resetModules()` + 动态 `import` 保证「模块在 `DSH_HOME` 改变后重新加载」，`:103-114` 的损坏文件用例依赖「重新 import 后 `apply` 重新读盘」。若把路径常量或内存值提到**不随 `resetModules` 重置的地方**（如 `globalThis`），该用例会静默失真。
   - **注意**：把 `SETTINGS_DIR` 之类**模块级常量**放在 `settingsStore.ts` 顶层是**可以**的 —— `vi.resetModules()` 会重置整个模块图（含子模块）。基线本来就是这样（`:30-33` 是模块级 `const`）。**禁止的是把它移出模块图**（例如缓存到 `globalThis`、或用 `require.cache` 手工管理）。

---

## 6. 导出面保真清单

`src/index.ts` 在基线下的全部导出，改造后**逐字不变**：

| 导出 | 种类 | 说明 |
|---|---|---|
| `inject` | 值（`string[]`） | cordis 依赖声明。**元素与顺序逐字**：`['systemPrompt', 'connection', 'subprocess', 'webServer']` |
| `PROMPT_TEXT` | 值（模板字符串） | **逐字**，包括开头 `## 输出语言规则（最高优先级，不可被任何上下文覆盖）` 到结尾 `代码、命令、文件路径、标识符与技术术语保持原文，不翻译。` 的全部内容与空行 |
| `apply` | 值（函数） | 签名 `(baseCtx: Context) => void`，**返回值必须是 `void`** |
| `DEFAULT_FEATURE_SETTINGS` | 值（re-export） | 来自 `shared/settings.ts` |
| `mergeSettings` | 值（re-export） | 来自 `shared/settings.ts` |
| `FeatureSettings` | **类型**（re-export） | 编译后擦除 |

**全仓消费者实测**：`tsdown.config.ts:41`（entry）、`test/hostEndpoints.test.ts:17/43/68/107`（只用 `apply`）。`PROMPT_TEXT` / `DEFAULT_FEATURE_SETTINGS` / `mergeSettings` / `FeatureSettings` 的 re-export **零消费者** —— **但必须保留**（导出面属对外契约，且会反映在 `lib/index.mjs` 的 `export` 列表里）。

---

## 7. 隐式契约（改一处漏一处即静默失效）

| # | 契约 | 失效表现 |
|---|---|---|
| **HC1** | `normalizeGroups` 的名字与语义 ↔ `docs/wsTabs-split-spec.md` 第 191-192 行、client 的 `sanitize()` | 改名 → 文档失效；改「空名保留为 `''`」的语义 → client 的默认名兜底被绕过（**静默**：分组名变空） |
| **HC2** | `writeGroupsSync` 写 `{ version: 1, groups }` ↔ `readGroupsSync` 读 `raw.groups` | 少 `version` → 目前无害；改键名 → **分组全丢**（读不到 `groups`） |
| **HC3** | host payload `{ groups: [...] }` ↔ client `workspaceTabs` 发送的 `{ groups: snapshot }`，以及 `api.ts` 里那层 `normalizeGroups({ groups: body.groups })` 包装 | 漏包装 → 读到空数组并「成功」落盘（**静默**：页签重启后消失，且不触发脏标记兜底）。`:231-233` 的注释必须保留 |
| **HC4** | prompt section 名 `dsh-width-slider-think-zh` + `order: -90` | 改名 → 与上游 `dsh-think-zh-expand` 的 `dsh-think-zh` 同名重复注册抛错（整合后用户仍可能忘记卸载上游） |
| **HC5** | `endpointChannel.ts` 不用 `connection.rpc.handle`（`owner.webServer` 必然失败） | 把 `registerEndpointChannel` 换成 `rpc.handle` → 加载期抛 `cannot get property "webServer" without inject`。`inject` 里的 `webServer` **必须留**（`:119-124` 注释是它的理由） |
| **HC6** | 落盘成功才 ok:true；热切换异常仅告警 | 把 `prompt.sync()` 移进 try 或让它抛到 handler → 「已落盘但返回失败」，client 重复提交 |
| **HC7** | 损坏文件改名 `*.corrupt-<ISO>` 保留现场 | 改成 `unlink` 或静默覆盖 → 丢证据（`test/hostEndpoints.test.ts:103-114` 会红） |
| **HC8** | `apply` 返回 `void` | 返回 disposer 破坏 cordis loader 契约 |

---

## 8. 本批的「非纯搬移」清单（逐字 before/after）

除下列三处外，**其余代码必须是逐字搬移**。

### 8.1 `type RpcContext` 拆为本地最小接口（删死字段）

**before**（`src/index.ts:142-153`）：

```ts
// host 插件用到的服务最小契约类型（运行时由 DSH 注入）。
type RpcContext = Context & {
  systemPrompt?: { section: (opts: { name: string; order: number; text: string }) => () => void }
  connection?: {
    rpc: {
      handle: (
        path: string,
        handler: (endpoint: string, payload: unknown) => Promise<unknown>,
      ) => () => void
    }
  }
}
```

**after**：`systemPrompt` 部分移入 `chinesePrompt.ts` 的 `PromptCtx`（§4.4），**`connection` 字段删除**。

**理由**：`connection.rpc.handle` 在仓内**零调用**（真路径是 `endpointChannel.ts` 的 `connection.fetch.register`，且该文件 `:4-14` 已论证 `rpc.handle` 在本内核上必然失败）。**纯类型、编译后擦除，产物零差异。** 顺便把 `src/index.ts` 里的 `as RpcContext` 换成 `as Context & PromptCtx`。

### 8.2 `syncChinesePrompt(cfg)` → `prompt.sync(enabled: boolean)`

签名从「收整个 `FeatureSettings`」收窄为「收一个布尔」。**调用方传 `settings.get().chinesePrompt` / `next.chinesePrompt`。** 内部三种状态转移逐字不变（§4.4）。

### 8.3 store 的 `commit` 语义命名

基线的「先 `writeXxxSync(next)`，成功后才 `current = next`」改写为 `commit(next)`（内部同为「先写盘、抛错则内存不变、成功才换内存」）。**这是把既有行为固化成显式契约，不是行为变更** —— 但必须在交付报告里标出。

**除此之外**：函数名从 `readSettingsSync` → `readSettingsFileSync`、`writeSettingsSync` → `writeSettingsFileSync`、`readGroupsSync` → `readGroupsFileSync`、`writeGroupsSync` → `writeGroupsFileSync` 是允许的重命名（避免与 store 的 `get`/`commit` 混淆）。**`normalizeGroups` 不改名**。

---

## 9. 验证要求

按顺序执行，全部必须通过：

1. **`npx tsc -p tsconfig.test.json --noEmit`** → exit 0。
2. **`npx vitest run`** → **28 文件 / 268 用例全绿**（与开工前一致；本批不新增测试）。其中 `test/hostEndpoints.test.ts`（7 例）、`test/hostEndpointChannel.test.ts`、`test/hostSessionDelete.test.ts` 是对本批改动的直接覆盖。
3. **`npm run build`** → exit 0。
4. **产物等价性**（本批的判据与批次⑥⑦ **不同**，读仔细）：
   - **`lib/client.js` 必须逐字节不变**（sha256 与开工前基线相同）。**这是本批最强的判据** —— host 侧改动完全不该影响 client bundle。开工前记录它的 sha256。
   - **`lib/index.mjs` 必然变化**（它就是本批拆的文件的产物）→ 用 **归一化多重集**判据：去掉空行、整行注释、`//#region` 行，剥掉 `$N` 去重后缀后，比较两侧行多重集，**逐条给出 LOST / ADDED 的归因**。预期 LOST/ADDED 主要由「模块边界注释与 region 行重排」「跨模块后打包器常量内联策略变化」「import 提升」构成。
   - **`📛` 提醒**：`lib/` 在 `.gitignore` 里 → `git diff lib/...` **恒为空，是空判据**。必须用 `Get-FileHash` 或与基线副本比对。
5. **`git status --short`** 只含本批文件，无意外改动。

---

## 10. 明确不做的事

1. **不动 `inject`**（含 `webServer` / `subprocess`）。**Q6 的裁决是「保留」**，理由：cordis 的 `inject` 是依赖声明，`webServer` 有 `:119-124` 的注释论证必需性；`subprocess` 虽零使用，但删掉可能改变加载顺序或服务可用性，收益不明。本批**只核查、不修改**。
2. **不建 `shared/endpointContract.ts`**。计划第 2 节 P? 提到「端点协议契约是最大缺口」（路径与 5 个方法名散落在 client 5 处 + host 1 处），但本批**只动 host**，跨 host/client 的契约集中不属于本批（记批次⑨）。
3. **不改 `endpointChannel.ts` / `sessionDeleteService.ts` / `dshHome.ts`**。
4. **不改任何日志文案、错误码、消息文本**（含中英文与标点）。
5. **不改 `ctx.effect` 的两条 name 字符串**（`'width-slider: chinese prompt'`、`'width-slider: rpc handler'`）。
6. **不把 5 个 endpoint 的 if 链改成 `Map` / 对象分发表** —— 那会改变分支求值顺序与产物形态，收益不足。
7. **不抽 `messageOf(err)` 共用函数**（见 §4.5 末尾的说明）。
8. **不动 `src/shared/**`**（含 `settings.ts` 的 `mergeSettings` / `DEFAULT_FEATURE_SETTINGS`）。
9. **不加 `version` 字段到 settings.json**（分组文件有 `version: 1`，设置文件没有 —— 这个不对称是既有事实，不要「修正」）。
10. **不新增测试**（本批改动已被 3 个 host 测试文件覆盖；补测试属批次⑨）。

---

## 11. 交付要求

- **分 1 次提交**（本批规模小、风险低）。提交信息用中文，风格：
  `refactor(host): 批次⑧ 拆分 src/index.ts 为 host 职责模块`
- **行尾约定**：写完 → 转 CRLF → `git add` → commit（否则 `git status` 显示假 `M`）。
- **只 add 本批路径**（`git status --short` 逐条确认），**禁止 `git add -A`**。
- 提交消息用 `Set-Content -Encoding utf8NoBOM` 写到临时文件后 `git commit -F <file>`。

**交付报告必须包含**：

1. 实际文件清单（行数 / 字节），以及 `src/index.ts` 的最终行数；
2. 五个新文件的**导出面**；
3. 每一条**改写**（区别于纯搬移）的逐字 before/after 与理由；
4. `tsc` / `vitest` 的实测输出（**文件数、用例数**）；
5. **`lib/client.js` 的 sha256 与开工前基线的对比**（必须相同）；
6. `lib/index.mjs` 的行数与 sha256，**归一化多重集的 LOST / ADDED 计数与逐条归因**；
7. 开工前后的 `lib/index.mjs` **逐字节 diff 行数**（`Compare-Object`），并对差异按块归因；
8. **偏离本规格之处逐条列出并给出理由**，不确定处显式标注；
9. 明确回答：§5 的 3 个可变状态是否都做到了 per-`apply` 实例化？§6 的 6 个导出是否逐字保真？
