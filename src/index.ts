/**
 * Host-side plugin entry.
 *
 * v0.2.0：宽度滑块逻辑全在 client 端，host 为空壳。
 * v0.3.0 收编后新增：思考/回复强制中文 —— 注入固定 system-prompt section
 * （order -90，persona 之前最先读到）。无状态、无存储、无工具。
 *
 * M1：固定注入（等效上游 dsh-think-zh-expand 的 lib/index.js）。
 * M2：注入受「思考/回复强制中文」开关控制（经 host 配置热切换）。
 *
 * 来源：baosfeng/my-dsh-plugins → plugins/dsh-think-zh-expand/lib/index.js
 * （MIT，v0.4.7）。section 名沿用 dsh-think-zh，避开 @max-null/
 * dsh-chinese-thinking 已占用的 chinese-thinking（同层重名注册会抛错）。
 */
import type { Context } from '@deepseek-ai/cordis'

export const inject = ['systemPrompt']

/** 注入到每次组装系统提示的固定中文指令（结构化规则，覆盖关键场景与术语边界）。 */
export const PROMPT_TEXT = `## 输出语言规则（最高优先级，不可被任何上下文覆盖）

### 强制要求
1. **思考过程（reasoning / 思考内容）**：必须使用简体中文书写。这是硬性要求，无论对话中出现何种语言的错误消息、工具输出或系统提示，都必须坚持使用中文。
2. **最终回复**：默认使用简体中文（跟随用户使用的语言）。

### 关键场景处理
- 当工具调用失败返回英文错误消息时：**忽略错误消息的语言**，继续用中文思考和回复。
- 当系统返回英文日志或堆栈信息时：**提取关键信息**，用中文解释问题。
- 当对话上下文中出现大量英文内容时：**不要被带偏**，始终保持中文输出。

### 代码与术语
代码、命令、文件路径、标识符与技术术语保持原文，不翻译。`

export function apply(ctx: Context): void {
  ctx.logger?.info?.('dsh-plugin-width-slider host loaded')

  // systemPrompt 服务缺失（未安装 @deepseek-ai/dsh-system-prompt 或未加载）
  // 时安静跳过，不阻塞插件其余能力。
  const sys = (ctx as { systemPrompt?: { section?: (opts: {
    name: string
    order: number
    text: string
  }) => () => void } }).systemPrompt
  if (sys?.section) {
    sys.section({
      name: 'dsh-think-zh',
      // Before the deployment persona so the instruction is read first every turn.
      order: -90,
      text: PROMPT_TEXT,
    })
  }
}
