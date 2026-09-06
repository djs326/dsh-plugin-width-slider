/**
 * Client-side plugin entry（v0.3.0 收编后）。
 *
 * 职责（全部挂独立开关，默认开、热生效，见 config.ts FeatureSettings）：
 * 1. 对话宽度滑块设置区块 —— 总控页（WidthSliderSettings）；
 * 2. 思考块增强渲染（assistant-step 覆盖，收编 dsh-think-zh-expand）；
 * 3. 界面硬编码英文中文化；
 * 4. 隐藏官方原生宽度拖拽手柄（跟随「宽度滑块」开关联动）。
 *
 * 生命周期模型：apply 内建一个受控生命周期 effect —— sync() 依据
 * config store 当前值安装/卸载各功能（installX 返回 disposer）；配置变化
 * （总控页切换 / host 读回）经 onSettingsChanged 触发 sync 即时热切换。
 * 插件禁用/卸载时统一清理，无残留。
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
import { installDialogResizePatch, installNavScrollPatch } from './settingsPanelPatch.ts'
import { applySettings, getSettings, mergeSettings, onSettingsChanged } from './config.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    widthSlider: WidthSliderKey
  }
}

const NS = 'widthSlider'

type Disposer = () => void

/** 隐藏官方原生宽度拖拽手柄（稳定属性选择器，升级不失效）。 */
const HANDLE_HIDE_CSS = `
[data-width-handle]{display:none!important}
`

// ── 各功能安装器（返回 disposer，与 config 开关一一对应）──────────────

/** 注入隐藏原生手柄的样式（宽度滑块开关=开时）。 */
function installHandleHide(): Disposer {
  const style = document.createElement('style')
  style.id = 'dsh-plugin-width-slider-hide-handles'
  style.textContent = HANDLE_HIDE_CSS
  // 幂等：热重载/重复实例时先清掉旧同 id 样式，避免开关只移除自己那份。
  document.getElementById(style.id)?.remove()
  document.head.appendChild(style)
  return () => { style.remove() }
}

/** 注入思考块样式 + 注册 assistant-step 渲染器（思考块增强=开时）。 */
function installThinkRenderer(ctx: ClientContext): Disposer {
  const disposers: Disposer[] = []
  const style = document.createElement('style')
  style.id = 'dsh-plugin-width-slider-think-styles'
  style.textContent = THINK_STYLES
  document.getElementById(style.id)?.remove()
  document.head.appendChild(style)
  disposers.push(() => { style.remove() })
  // 渲染回调每次读最新 thinkMode：模式切换无需重建注册，下次渲染即生效。
  const disposeInject = ctx.slots.inject('conversation.chat.node', () =>
    ctx.slots.register(
      {
        name: 'conversation.chat.node',
        key: 'assistant-step',
        priority: -1,
        registrant: 'dsh-plugin-width-slider',
      },
      (props: { node?: unknown; renderMessageImages?: unknown }) =>
        createElement(AssistantStepView, {
          node: props.node as never,
          renderMessageImages: props.renderMessageImages as never,
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

/** 界面英文中文化（界面中文化=开时）。 */
function installLocalize(): Disposer {
  return installUiLocalize()
}

/** 上游 dsh-think-zh-expand 冲突提示（仅提示，不阻断）。 */
function warnIfUpstreamPresent(): void {
  try {
    const hit = Array.from(document.querySelectorAll('style')).some((el) =>
      (el.textContent || '').indexOf('dsh-think-zh-expand-') !== -1)
    if (hit) {
      console.warn(
        '[width-slider] 检测到上游 dsh-think-zh-expand 仍启用：其 assistant-step 渲染器' +
        '与本插件同 key 注册会互相覆盖。请卸载 dsh-think-zh-expand（本插件已收编其全部能力）。',
      )
    }
  } catch { /* 忽略 */ }
}

// ── RPC 封装（settings 读写，host 文件为持久化真源）───────────────────

type RpcClientContext = ClientContext & {
  connection: {
    rpc: {
      call: (path: string, method: string, payload?: Record<string, unknown>) => Promise<unknown>
    }
  }
}

async function rpcReadSettings(ctx: RpcClientContext): Promise<unknown> {
  try {
    const result = await ctx.connection.rpc.call('/width-slider', 'readSettings', {})
    if (result && typeof result === 'object' && (result as { ok?: boolean }).ok === true) {
      return (result as { value?: { settings?: unknown } }).value?.settings ?? null
    }
    return null
  } catch {
    return null
  }
}

async function rpcWriteSettings(ctx: RpcClientContext, settings: unknown): Promise<void> {
  await ctx.connection.rpc.call('/width-slider', 'writeSettings', { settings })
}

export const inject = ['slots', 'locale', 'connection']

export function apply(ctx: RpcClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'width-slider: dictionaries')

  // 上游冲突提示（激活即探测一次）。
  ctx.effect(() => {
    warnIfUpstreamPresent()
    return () => {}
  }, 'width-slider: upstream conflict probe')

  // 受控生命周期：依据配置开关安装/卸载各功能；配置变化即时热切换。
  ctx.effect(() => {
    type Slot = 'handle' | 'think' | 'localize' | 'resize' | 'nav'
    const installed: Partial<Record<Slot, Disposer>> = {}

    const ensure = (slot: Slot, want: boolean, installer: () => Disposer): void => {
      if (want && installed[slot] === undefined) installed[slot] = installer()
      if (!want && installed[slot] !== undefined) {
        installed[slot]!()
        installed[slot] = undefined
      }
    }

    const sync = (): void => {
      const s = getSettings()
      ensure('handle', s.widthSlider, () => installHandleHide())
      ensure('think', s.thinkRender, () => installThinkRenderer(ctx))
      ensure('localize', s.uiLocalize, () => installLocalize())
      ensure('resize', s.dialogResize, () => installDialogResizePatch())
      ensure('nav', s.navScroll, () => installNavScrollPatch())
    }

    const unsubscribe = onSettingsChanged(sync)
    sync()
    return () => {
      unsubscribe()
      for (const slot of ['handle', 'think', 'localize', 'resize', 'nav'] as const) {
        if (installed[slot] !== undefined) {
          installed[slot]!()
          installed[slot] = undefined
        }
      }
    }
  }, 'width-slider: feature lifecycles')

  // 启动时从 host 拉取一次持久化配置，同步进 store 触发生命周期 sync。
  ctx.effect(() => {
    let cancelled = false
    rpcReadSettings(ctx).then((raw) => {
      if (cancelled || raw === null) return
      applySettings(mergeSettings(raw))
    })
    return () => {
      cancelled = true
    }
  }, 'width-slider: config load')

  // 设置区块：功能总控页（props 注入 host 配置读写）。
  ctx.effect(
    () => ctx.slots.inject('settings.section', () => ctx.slots.register(
      {
        name: 'settings.section',
        id: 'width-slider',
        order: 600,
        label: 'Width Slider',
        locale: NS,
        // 单一读源：client 入口启动时经 config load 拉取一次；总控页只写。
        inject: () => ({
          writeSettings: (settings: unknown) => rpcWriteSettings(ctx, settings),
        }),
      },
      WidthSliderSettings,
    )),
    'width-slider: settings section',
  )
}
