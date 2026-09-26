/**
 * 中文强制注入：固定提示文本 + 可热切换的 prompt section 控制器。
 *
 * 控制器持有一份 per-`apply` 的卸载句柄（`promptDispose`），安装/卸载都走
 * 同一条状态机，任何异常只告警不影响调用方（中文开关与 RPC 写入都不该失败）。
 */

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

export function createChinesePromptController(ctx: PromptCtx, logger?: LoggerLike): ChinesePromptController {
  // 中文强制注入控制器（可热切换：注销即不再出现在组装后的系统提示里）。
  // 整体 try/catch：systemPrompt 服务缺失 / ctx 已卸载 / 上游同名冲突等
  // 都不应让中文开关或 RPC 写入失败。
  let promptDispose: (() => void) | null = null

  const sync = (enabled: boolean): void => {
    try {
      const sys = ctx.systemPrompt
      if (enabled && promptDispose === null && sys?.section) {
        promptDispose = sys.section({
          name: 'dsh-width-slider-think-zh',
          order: -90,
          text: PROMPT_TEXT,
        }) ?? null
      } else if (!enabled && promptDispose !== null) {
        promptDispose()
        promptDispose = null
      }
    } catch (err) {
      logger?.warn?.('[width-slider] 中文强制注入切换失败', err)
      promptDispose = null
    }
  }

  const dispose = (): void => {
    if (promptDispose !== null) {
      try {
        promptDispose()
      } catch { /* 忽略 */ }
      promptDispose = null
    }
  }

  return { sync, dispose }
}
