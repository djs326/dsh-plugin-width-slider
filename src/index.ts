/**
 * Host-side plugin entry.
 *
 * v0.3.0（think-kit）职责：
 * 1. 思考/回复强制中文（systemPrompt.section 注入，order -90）；
 * 2. 插件功能开关的持久化与热切换（/width-slider RPC：readSettings /
 *    writeSettings；文件存 $DSH_HOME/storages/dsh-plugin-width-slider/
 *    settings.json，仿 dsh-plugin-open-with 的原子写模式）；
 * 3. writeSettings 时立即按新配置热切换「中文强制」（其余功能为纯
 *    client 行为，由 client 端配置 store 热切换）。
 *
 * 存储与协议契约（与 src/client/config.ts 保持同步）：
 *   FeatureSettings {
 *     widthSlider: boolean   // 1 对话宽度滑块（client）
 *     chinesePrompt: boolean // 2 思考/回复强制中文（host，此处热切换）
 *     thinkRender: boolean   // 3 思考块增强渲染（client）
 *     uiLocalize: boolean    // 4 界面英文中文化（client）
 *     thinkMode: 'auto-collapse' | 'keep-expanded' // 5 思考块模式
 *     dialogResize: boolean  // 6 设置弹窗可拖拽调宽（M3 接线，默认开）
 *     navScroll: boolean     // 7 设置左侧 tab 栏滚动（M3 接线，默认开）
 *   }
 * 两端 DEFAULTS 必须一致。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'

// ── $DSH_HOME 解析（与 open-with 同款：env DSH_HOME 优先，默认 ~/.dsh）──

function resolveDshHome(env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env.DSH_HOME
  return resolve(fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : join(homedir(), '.dsh'))
}
const SETTINGS_DIR = join(resolveDshHome(), 'storages', 'dsh-plugin-width-slider')
const SETTINGS_FILE = join(SETTINGS_DIR, 'settings.json')

// ── 功能开关契约（与 client/src/config.ts 的 DEFAULT_FEATURE_SETTINGS 一致）──

export interface FeatureSettings {
  widthSlider: boolean
  chinesePrompt: boolean
  thinkRender: boolean
  uiLocalize: boolean
  thinkMode: 'auto-collapse' | 'keep-expanded'
  dialogResize: boolean
  navScroll: boolean
}

export const DEFAULT_FEATURE_SETTINGS: FeatureSettings = {
  widthSlider: true,
  chinesePrompt: true,
  thinkRender: true,
  uiLocalize: true,
  thinkMode: 'auto-collapse',
  dialogResize: true,
  navScroll: true,
}

function mergeSettings(raw: unknown): FeatureSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    widthSlider: o.widthSlider !== false,
    chinesePrompt: o.chinesePrompt !== false,
    thinkRender: o.thinkRender !== false,
    uiLocalize: o.uiLocalize !== false,
    thinkMode: o.thinkMode === 'keep-expanded' ? 'keep-expanded' : 'auto-collapse',
    dialogResize: o.dialogResize !== false,
    navScroll: o.navScroll !== false,
  }
}

/** 读设置文件（不存在/损坏时回退默认），合并保证新键齐全。 */
function readSettingsSync(): FeatureSettings {
  try {
    if (!existsSync(SETTINGS_FILE)) return { ...DEFAULT_FEATURE_SETTINGS }
    return mergeSettings(JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8')))
  } catch {
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

export const inject = ['systemPrompt', 'connection']

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

// RPC 处理器里读取 connection 服务的最小契约类型（运行时由 DSH 注入）。
type RpcContext = Context & {
  systemPrompt?: { section: (opts: { name: string; order: number; text: string }) => () => void }
  connection?: {
    rpc: {
      handle: (
        path: string,
        handler: (endpoint: string, payload: unknown) => Promise<unknown>,
        opts?: { authority: string },
      ) => () => void
    }
  }
}

export function apply(baseCtx: Context): void {
  const ctx = baseCtx as RpcContext
  const logger = baseCtx.logger

  // 当前配置（启动时读文件合并默认；写操作热更新）。
  let current = readSettingsSync()

  // 中文强制注入控制器（可热切换：注销即不再出现在组装后的系统提示里）。
  let promptDispose: (() => void) | null = null
  const syncChinesePrompt = (cfg: FeatureSettings): void => {
    const sys = ctx.systemPrompt
    if (cfg.chinesePrompt && promptDispose === null && sys?.section) {
      promptDispose = sys.section({ name: 'dsh-think-zh', order: -90, text: PROMPT_TEXT }) ?? null
    } else if (!cfg.chinesePrompt && promptDispose !== null) {
      promptDispose()
      promptDispose = null
    }
  }

  // 生命周期 1：中文强制（随 fiber 安装/卸载）。
  ctx.effect(() => {
    syncChinesePrompt(current)
    return () => {
      if (promptDispose !== null) {
        promptDispose()
        promptDispose = null
      }
    }
  }, 'width-slider: chinese prompt')

  // 生命周期 2：/width-slider RPC（client 总控页经 ctx.connection.rpc.call
  // 调用 readSettings / writeSettings；loopback 围栏防外部访问）。
  ctx.effect(
    () =>
      ctx.connection?.rpc.handle(
        '/width-slider',
        async (endpoint: string, payload: unknown): Promise<unknown> => {
          const body = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
          if (endpoint === 'readSettings') {
            return { ok: true, value: { settings: current } }
          }
          if (endpoint === 'writeSettings') {
            const next = mergeSettings(body.settings)
            try {
              writeSettingsSync(next)
              current = next
              syncChinesePrompt(next)
              return { ok: true, value: {} }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              logger?.warn?.('[width-slider] writeSettings failed', message)
              return { ok: false, error: { code: 'write-failed', message } }
            }
          }
          logger?.warn?.('[width-slider] unknown endpoint', endpoint)
          return { ok: false, error: { code: 'unknown-endpoint', message: 'unknown endpoint: ' + endpoint } }
        },
        { authority: 'loopback' },
      ) ?? (() => {}),
    'width-slider: rpc handler',
  )

  logger?.info?.('dsh-plugin-width-slider host loaded')
}
