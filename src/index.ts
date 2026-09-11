/**
 * Host-side plugin entry.
 *
 * v0.3.0（think-kit）职责：
 * 1. 思考/回复强制中文（systemPrompt.section 注入，order -90，可热切换）；
 * 2. 插件功能开关的持久化与热切换（/width-slider RPC：readSettings /
 *    writeSettings；文件存 $DSH_HOME/storages/dsh-plugin-width-slider/
 *    settings.json，原子写（tmp + rename））；
 * 3. writeSettings 时立即按新配置热切换「中文强制」（其余功能为纯
 *    client 行为，由 client 端配置 store 热切换）。
 *
 * 功能开关契约唯一真源：src/shared/settings.ts（host 与 client 共用）。
 * section 名用 dsh-width-slider-think-zh（避免与上游 dsh-think-zh-expand
 * 的 dsh-think-zh 同名重复注册抛错——整合后用户仍可能忘记卸载上游）。
 *
 * 中文提示注入的提示文本与注入方式源自 dsh-think-zh-expand（MIT，
 * Copyright (c) 2026 bsfeng，v0.4.7，上游 https://github.com/baosfeng/
 * my-dsh-plugins）；完整归属声明见仓库根 THIRD_PARTY_NOTICES.md。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { resolveDshHome } from './shared/dshHome.ts'
import { DEFAULT_FEATURE_SETTINGS, mergeSettings, type FeatureSettings } from './shared/settings.ts'
import { deleteSessionById, type SessionDeleteCtx } from './host/sessionDeleteService.ts'
import { registerEndpointChannel } from './host/endpointChannel.ts'

// ── $DSH_HOME 下本插件的功能开关存储（dshHome 见 src/shared/dshHome.ts）──

const SETTINGS_DIR = join(resolveDshHome(), 'storages', 'dsh-plugin-width-slider')
const SETTINGS_FILE = join(SETTINGS_DIR, 'settings.json')
/** 工作区分组文件夹持久化（默认页签为根；文件夹内为归属工作区 id）。 */
const GROUPS_FILE = join(SETTINGS_DIR, 'workspace-groups.json')

interface GroupFileItem { id?: unknown; name?: unknown; workspaceIds?: unknown }
interface GroupsFile { version?: unknown; groups?: unknown }

function normalizeGroups(raw: unknown): Array<{ id: string; name: string; workspaceIds: string[] }> {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as GroupsFile).groups)
    ? (raw as GroupsFile).groups as unknown[]
    : []
  const out: Array<{ id: string; name: string; workspaceIds: string[] }> = []
  const seen = new Set<string>()
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const it = item as GroupFileItem
    if (typeof it.id !== 'string' || it.id === '' || seen.has(it.id)) continue
    // 不做语言相关兜底：原先硬编码「未命名」，而 client 侧用 tt('new.name')（随界面语言），
    // 同一份数据的兜底名会在两侧漂移。空名原样保留，由 client 的 sanitize() 补默认名。
    const name = typeof it.name === 'string' ? it.name.trim() : ''
    const workspaceIds = Array.isArray(it.workspaceIds)
      ? it.workspaceIds.filter((v): v is string => typeof v === 'string' && v !== '')
      : []
    seen.add(it.id)
    out.push({ id: it.id, name, workspaceIds })
  }
  return out
}

/** 读分组文件；缺失返回空数组，损坏改名保留现场。 */
function readGroupsSync(): Array<{ id: string; name: string; workspaceIds: string[] }> {
  try {
    if (!existsSync(GROUPS_FILE)) return []
    const raw = readFileSync(GROUPS_FILE, 'utf-8')
    return normalizeGroups(JSON.parse(raw))
  } catch (err) {
    try {
      if (existsSync(GROUPS_FILE)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        renameSync(GROUPS_FILE, GROUPS_FILE + '.corrupt-' + stamp)
      }
    } catch { /* 忽略 */ }
    console.warn('[width-slider] workspace-groups.json 损坏或不可读，已按空分组处理并保留现场', err)
    return []
  }
}

/** 原子写分组文件。 */
function writeGroupsSync(groups: Array<{ id: string; name: string; workspaceIds: string[] }>): void {
  mkdirSync(SETTINGS_DIR, { recursive: true })
  const tmp = GROUPS_FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify({ version: 1, groups }, null, 2), 'utf-8')
  renameSync(tmp, GROUPS_FILE)
}

export { DEFAULT_FEATURE_SETTINGS, mergeSettings }
export type { FeatureSettings }

/** 读设置文件；损坏/缺失时回退默认。损坏文件改名保留现场（不静默覆盖）。 */
function readSettingsSync(): FeatureSettings {
  try {
    if (!existsSync(SETTINGS_FILE)) return { ...DEFAULT_FEATURE_SETTINGS }
    const raw = readFileSync(SETTINGS_FILE, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    return mergeSettings(parsed)
  } catch (err) {
    // 文件损坏/半写：保留现场供排查，回退默认（下次写覆盖新文件，不丢证据）。
    try {
      if (existsSync(SETTINGS_FILE)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        renameSync(SETTINGS_FILE, SETTINGS_FILE + '.corrupt-' + stamp)
      }
    } catch { /* 改名失败不阻塞 */ }
    console.warn('[width-slider] settings 文件损坏或不可读，已回退默认并保留现场', err)
    return { ...DEFAULT_FEATURE_SETTINGS }
  }
}

/** 原子写设置文件（tmp + rename）。 */
function writeSettingsSync(settings: FeatureSettings): void {
  mkdirSync(SETTINGS_DIR, { recursive: true })
  const tmp = SETTINGS_FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf-8')
  renameSync(tmp, SETTINGS_FILE)
}

// ── 中文强制 prompt（order -90，persona 之前最先读到）──────────────────

// webServer 为 connection.rpc.handle 的必需依赖：该调用把 RPC 的 HTTP 路由
// 注册在**调用者 fiber** 上（dsh-client-connection 的 rpc-host 实现为
// owner.effect(() => owner.webServer.register(route))，owner 取调用者 ctx），
// 因此调用方 fiber 必须能解析 webServer。缺少该声明时加载期抛
// `cannot get property "webServer" without inject`。声明后，在没有 webServer
// 服务的 profile 里插件保持 pending 等待，而不是加载失败。
export const inject = ['systemPrompt', 'connection', 'subprocess', 'webServer']

/** 注入到每次组装系统提示的固定中文指令（结构化规则，覆盖关键场景与术语边界）。 */
export const PROMPT_TEXT = `## 输出语言规则（最高优先级，不可被任何上下文覆盖）

### 强制要求
1. **思考过程（reasoning / 思考内容）**：必须使用简体中文书写。这是硬性要求，无论对话中出现何种语言的错误消息、工具输出或系统提示，都必须坚持中文思考和输出。
2. **最终回复**：默认使用简体中文（跟随用户使用的语言）。

### 关键场景处理
- 当工具调用失败返回英文错误消息时：忽略错误消息的语言，继续用中文思考和回复。
- 当系统返回英文日志或堆栈信息时：提取关键信息，用中文解释问题。
- 当对话上下文中出现大量英文内容时：不要被带偏，始终保持中文输出。

### 代码与术语
代码、命令、文件路径、标识符与技术术语保持原文，不翻译。`

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

export function apply(baseCtx: Context): void {
  const ctx = baseCtx as RpcContext
  const logger = baseCtx.logger

  // 当前配置（启动时读文件合并默认；写操作热更新）。
  let current = readSettingsSync()
  // 工作区分组文件夹（默认根 + 用户文件夹）；由 client 经 RPC 读写。
  let currentGroups = readGroupsSync()

  // 中文强制注入控制器（可热切换：注销即不再出现在组装后的系统提示里）。
  // 整体 try/catch：systemPrompt 服务缺失 / ctx 已卸载 / 上游同名冲突等
  // 都不应让中文开关或 RPC 写入失败。
  let promptDispose: (() => void) | null = null
  const syncChinesePrompt = (cfg: FeatureSettings): void => {
    try {
      const sys = ctx.systemPrompt
      if (cfg.chinesePrompt && promptDispose === null && sys?.section) {
        promptDispose = sys.section({
          name: 'dsh-width-slider-think-zh',
          order: -90,
          text: PROMPT_TEXT,
        }) ?? null
      } else if (!cfg.chinesePrompt && promptDispose !== null) {
        promptDispose()
        promptDispose = null
      }
    } catch (err) {
      logger?.warn?.('[width-slider] 中文强制注入切换失败', err)
      promptDispose = null
    }
  }

  // 生命周期 1：中文强制（随 fiber 安装/卸载）。
  ctx.effect(() => {
    syncChinesePrompt(current)
    return () => {
      if (promptDispose !== null) {
        try {
          promptDispose()
        } catch { /* 忽略 */ }
        promptDispose = null
      }
    }
  }, 'width-slider: chinese prompt')

  // 生命周期 2：/api/width-slider JSON 端点（client 总控页 POST `method`/`payload`
  // 调 readSettings / writeSettings）。访问围栏由 connection 服务统一施加
  // （可信 Host/Origin + 浏览器认证）；注册走 connection.fetch.register 而不是
  // connection.rpc.handle——后者在 0.1.5 内核上读 owner.webServer 必然失败，
  // 详见 src/host/endpointChannel.ts。
  // 写盘与热切换分开处理：文件落盘成功即 ok:true，热切换异常仅告警，
  // 避免"已落盘但返回失败"导致 client 重复提交。
  ctx.effect(
    () =>
      registerEndpointChannel(ctx, '/api/width-slider', async (endpoint: string, payload: Record<string, unknown>): Promise<unknown> => {
          const body = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
          if (endpoint === 'readSettings') {
            return { ok: true, value: { settings: current } }
          }
          if (endpoint === 'writeSettings') {
            const next = mergeSettings(body.settings)
            try {
              writeSettingsSync(next)
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              logger?.warn?.('[width-slider] writeSettings failed', message)
              return { ok: false, error: { code: 'write-failed', message } }
            }
            current = next
            syncChinesePrompt(next)
            return { ok: true, value: {} }
          }
          if (endpoint === 'wsGroupsRead') {
            return { ok: true, value: { groups: currentGroups } }
          }
          if (endpoint === 'wsGroupsWrite') {
            // normalizeGroups 读的是 `raw.groups`（文件对象形状）；client 发来的 payload
            // 本身是 `{ groups: [...] }`，直接把数组传进去会得到空分组并「成功」落盘 ——
            // 页签重启后消失且不触发脏标记兜底。这里补上那层包装。
            const groups = normalizeGroups({ groups: (body as { groups?: unknown }).groups })
            try {
              writeGroupsSync(groups)
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              logger?.warn?.('[width-slider] wsGroupsWrite failed', message)
              return { ok: false, error: { code: 'write-failed', message } }
            }
            currentGroups = groups
            return { ok: true, value: {} }
          }
          if (endpoint === 'sessionDelete') {
            // v0.5.0 会话删除：永久删除（破坏性；client 端已完成二次确认）。
            const id = body.id
            if (typeof id !== 'string' || id.length === 0) {
              return { ok: false, error: { code: 'invalid-id', message: 'id is required' } }
            }
            const result = await deleteSessionById(baseCtx as unknown as SessionDeleteCtx, id)
            if (result.ok) return { ok: true, value: {} }
            return { ok: false, error: { code: result.code ?? 'delete-failed', message: result.message ?? 'delete failed' } }
          }
          logger?.warn?.('[width-slider] unknown endpoint', endpoint)
          return { ok: false, error: { code: 'unknown-endpoint', message: 'unknown endpoint: ' + endpoint } }
    }),
    'width-slider: rpc handler',
  )

  logger?.info?.('dsh-plugin-width-slider host loaded')
}
