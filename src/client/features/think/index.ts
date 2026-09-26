import { createElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { AssistantStepView, THINK_STYLES } from '../../think/thinkView.tsx'
import { getSettings } from '../../core/config.ts'
import type { Disposer } from '../../../shared/types.ts'

/** 注入思考块样式 + 注册 assistant-step 渲染器（思考块增强=开时）。 */
export function installThinkRenderer(ctx: ClientContext): Disposer {
  const disposers: Disposer[] = []
  const style = document.createElement('style')
  style.id = 'dsh-plugin-width-slider-think-styles'
  style.textContent = THINK_STYLES
  document.getElementById(style.id)?.remove()
  document.head.appendChild(style)
  disposers.push(() => { style.remove() })
  // 渲染回调每次读最新 thinkMode：显示方式切换无需重建注册，下次渲染即生效。
  const disposeInject = ctx.slots.inject('conversation.chat.node', () =>
    ctx.slots.register(
      {
        name: 'conversation.chat.node',
        key: 'assistant-step',
        priority: -1,
        registrant: 'dsh-plugin-width-slider',
      },
      (props: { node?: unknown; renderMessageImages?: unknown; groupPart?: unknown }) =>
        createElement(AssistantStepView, {
          node: props.node as never,
          renderMessageImages: props.renderMessageImages as never,
          // 0.1.7 起宿主把同一个 assistant-step 分别以 'reasoning'（过程折叠组
          // 成员）与 'response'（正文条目）渲染两次，必须透传，渲染器才能按
          // 官方语义过滤块——不透传会让思考块与回复在两处各出现一遍。
          groupPart: props.groupPart as never,
          collapseAfterRun: getSettings().thinkMode === 'auto-collapse',
        }),
    ),
  )
  disposers.push(disposeInject)
  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch { /* 清理异常忽略 */ }
    }
  }
}

/** 上游 dsh-think-zh-expand 冲突提示（仅提示，不阻断）。 */
export function warnIfUpstreamPresent(): void {
  try {
    const hit = Array.from(document.querySelectorAll('style')).some((el) =>
      (el.textContent || '').indexOf('dsh-think-zh-expand-') !== -1)
    if (hit) {
      console.warn(
        '[width-slider] 检测到上游 dsh-think-zh-expand 仍启用：其 assistant-step 渲染器' +
        '与本插件同 key 注册会互相覆盖。请卸载 dsh-think-zh-expand（本插件已整合其全部能力）。',
      )
    }
  } catch { /* 忽略 */ }
}
