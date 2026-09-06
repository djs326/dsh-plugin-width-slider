/**
 * Client-side plugin entry.
 *
 * 职责（v0.3.0 收编后）：
 * 1. 宽度滑块设置区块（原 v0.2.0 功能，保留）；
 * 2. 思考块增强渲染（收编 dsh-think-zh-expand）：替换官方 assistant-step
 *    渲染器 —— reasoning 块「思考中展开、思考完自动收起」、text 块统一
 *    MarkdownView、image 块相邻分组复用宿主渲染；
 * 3. 界面硬编码英文中文化（MutationObserver 精准替换）；
 * 4. 隐藏官方原生宽度拖拽手柄（稳定属性选择器，升级不失效）。
 *
 * 所有功能的独立开关（settings 总控页）在 M2 接入；M1 阶段先固定默认行为
 * （全部开启、思考块 auto-collapse 模式），装配结构已为开关化预留位置。
 */
import { createElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { WidthSliderSettings } from './WidthSliderSettings.tsx'
import { en, zh, type WidthSliderKey } from './locales.ts'
import { AssistantStepView, THINK_STYLES } from './think/thinkView.tsx'
import { installUiLocalize } from './think/uiLocalize.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    widthSlider: WidthSliderKey
  }
}

const NS = 'widthSlider'

/**
 * 全局样式：隐藏官方原生宽度拖拽手柄（data-width-handle 稳定属性，官方
 * hash 类名每次升级会变、该属性不变）+ 思考块/assistant 样式
 * （THINK_STYLES，dsh-ws- 前缀，随激活注入、fiber teardown 卸载）。
 */
const HANDLE_HIDE_CSS = `
[data-width-handle]{display:none!important}
`

/**
 * 冲突检测：若检测到上游 dsh-think-zh-expand 仍启用（其样式带
 * dsh-think-zh-expand- 前缀），提示卸载以免双注册 assistant-step。
 */
function warnIfUpstreamPresent(): void {
  try {
    const upstreamStyles = Array.from(document.querySelectorAll('style')).some((el) =>
      (el.textContent || '').indexOf('dsh-think-zh-expand-') !== -1)
    if (upstreamStyles) {
      console.warn(
        '[width-slider] 检测到上游 dsh-think-zh-expand 仍处于启用状态：其 assistant-step ' +
        '渲染器与本插件同 key 注册会互相覆盖。请卸载 dsh-think-zh-expand 后重载页面。',
      )
    }
  } catch { /* 忽略检测异常 */ }
}

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'width-slider: dictionaries')

  // 全局样式注入：隐藏原生宽度手柄（独立于设置面板常驻生效）+
  // 思考块/assistant 样式。M2 开关化：宽度滑块与思考块渲染各挂独立开关。
  ctx.effect(() => {
    const style = document.createElement('style')
    style.id = 'dsh-plugin-width-slider-styles'
    style.textContent = HANDLE_HIDE_CSS + THINK_STYLES
    document.head.appendChild(style)
    return () => { style.remove() }
  }, 'width-slider: inject styles')

  // 冲突检测（仅提示，不阻断）。
  ctx.effect(() => {
    warnIfUpstreamPresent()
    return () => {}
  }, 'width-slider: upstream conflict probe')

  // 思考块增强渲染：替换官方 assistant-step 渲染器（priority -1 < 官方 0，
  // 与 dsh-better-sidebar 覆盖内置席位同机制）。M2 开关化后此 effect 受
  // 「思考块增强渲染」开关控制；M1 固定注册（默认行为）。
  ctx.effect(
    () => ctx.slots.inject('conversation.chat.node', () => ctx.slots.register(
      {
        name: 'conversation.chat.node',
        key: 'assistant-step',
        priority: -1,
        registrant: 'dsh-plugin-width-slider',
      },
      (props: { node?: unknown; renderMessageImages?: unknown }) => {
        // 渲染器组件入参（node/renderMessageImages）由 slot 宿主注入。
        const cast = props
        // slot 宿主注入的运行时 props 与本地最小契约不同构，经 never 透传
        // （组件内部按需断言），保持注册函数签名与官方一致。
        return createElement(AssistantStepView, {
          node: cast.node as never,
          renderMessageImages: cast.renderMessageImages as never,
        })
      },
    )),
    'width-slider: assistant-step renderer',
  )

  // 界面硬编码英文中文化（MutationObserver，fiber teardown 断开）。
  ctx.effect(() => installUiLocalize(), 'width-slider: ui localization')

  // 注入自定义设置区块（宽度滑块设置页；M2 重构为功能总控页）。
  ctx.effect(
    () => ctx.slots.inject('settings.section', () => ctx.slots.register(
      {
        name: 'settings.section',
        id: 'width-slider',
        order: 600,
        label: 'Width Slider',
        locale: NS,
      },
      WidthSliderSettings,
    )),
    'width-slider: settings section',
  )
}
