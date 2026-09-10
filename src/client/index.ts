/**
 * Client-side plugin entry（v0.3.0 起整合上游能力）。
 *
 * 职责（全部挂独立开关，默认开、热生效，见 config.ts FeatureSettings）：
 * 1. 对话宽度滑块设置区块 —— 总控页（WidthSliderSettings）；
 * 2. 思考块增强渲染（assistant-step 覆盖，整合自 dsh-think-zh-expand）：
 *    只为思考块提供展开/收起（外观同官方）；正式回复走官方 MarkdownText，不接管围栏；
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
import { callEndpoint } from './endpointChannel.ts'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { WidthSliderSettings } from './WidthSliderSettings.tsx'
import { en, zh, type WidthSliderKey } from './locales.ts'
import { AssistantStepView, THINK_STYLES } from './think/thinkView.tsx'
import { installUiLocalize } from './think/uiLocalize.ts'
import { applySavedWidth } from './widthPrefs.ts'
import { installDialogResizePatch, installNavScrollPatch } from './settingsPanelPatch.ts'
import { installSessionDelete } from './sessionDelete.ts'
import { installWorkspaceTabs } from './workspaceTabs.tsx'
import { isZhInterface } from './lang.ts'
import { applySettings, getSettings, mergeSettings, onSettingsChanged } from './config.ts'
import { installConversationEntrance, type MotionEngineState } from './motion/motion.ts'
import { installSettingsMotion } from './motion/settingsMotion.ts'
import { MOTION_CSS } from './motion/styles.ts'

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

/**
 * 宽度滑块功能安装器（开关=开时）：
 * - 启动即恢复上次宽度偏好（applySavedWidth：follow 起全局跟随 watcher；
 *   fixed 值等对话根出现后发布一次）——修复"重启后偏好不生效、打开插件页
 *   才生效"（应用曾只挂在 WidthSliderControl 组件生命周期内）；
 * - 注入隐藏原生手柄的样式；
 * - 卸载时（开关关闭）：停全局 watcher/发布、移除样式、清除插件写在各
 *   对话根上的内联 --dsh-chat-user-width——立即回到官方默认/其自身持久值。
 */
function installWidthFeature(): Disposer {
  const disposers: Disposer[] = []
  try {
    disposers.push(applySavedWidth())
  } catch { /* 偏好缺失/环境异常时不阻塞开关安装 */ }
  const style = document.createElement('style')
  style.id = 'dsh-plugin-width-slider-hide-handles'
  style.textContent = HANDLE_HIDE_CSS
  // 幂等：热重载/重复实例时先清掉旧同 id 样式，避免开关只移除自己那份。
  document.getElementById(style.id)?.remove()
  document.head.appendChild(style)
  disposers.push(() => { style.remove() })
  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch { /* 清理异常忽略 */ }
    }
    try {
      document.querySelectorAll<HTMLElement>('[data-phase]').forEach((el) => {
        el.style.removeProperty('--dsh-chat-user-width')
      })
    } catch { /* 忽略 */ }
  }
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
  // 渲染回调每次读最新 thinkMode：显示方式切换无需重建注册，下次渲染即生效。
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

// ── 动效（整合自 dsh-client-ui-custom）────────────────────────────────

/** 会话账本不可用的告警只打一次（getState 会被频繁调用）。 */
let ledgerWarned = false

/**
 * 从 config store + 会话账本派生引擎状态；空白会话决定新建对话入场是否播放。
 * @param ctx - client 上下文（读会话账本的 current/blank）。
 */
function motionStateOf(ctx: RpcClientContext): MotionEngineState {
  const settings = getSettings()
  // 会话账本读取失败不应让动效整块失效：退化为"非空白会话"（不播放新建
  // 对话入场），其余三组动效照常。
  let blank = false
  try {
    const snapshot = (ctx as unknown as {
      sessions: {
        list: { getSnapshot: () => { current?: string; byId: Record<string, { blank?: boolean } | undefined> } }
      }
    }).sessions.list.getSnapshot()
    blank = snapshot.current !== undefined && snapshot.byId[snapshot.current]?.blank === true
  } catch (err) {
    // getState 会被频繁调用；账本持续不可用时只提示一次。
    if (!ledgerWarned) {
      ledgerWarned = true
      console.warn('[width-slider] motion: session ledger unavailable', err)
    }
  }
  return {
    transcript: settings.motionEnabled,
    sidebar: settings.sidebarMotionEnabled,
    newChat: settings.newChatMotionEnabled,
    style: settings.motionStyle,
    sidebarStyle: settings.sidebarMotionStyle,
    newChatStyle: settings.newChatMotionStyle,
    roleEntrance: settings.motionRoleEntrance,
    blank,
  }
}

/**
 * 动效安装器（任一动效开关开启时安装；全部关闭即整体卸载）：
 * - 注入动效样式表；
 * - 对话/侧边栏/新建对话入场引擎（installConversationEntrance）；
 * - 设置面板动效引擎（installSettingsMotion）；
 * - 会话切换信号：宿主整段重挂载对话时强制重放入场。
 */
function installMotionFeature(ctx: RpcClientContext): Disposer {
  const disposers: Disposer[] = []
  const cleanup = (): void => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch { /* 清理异常忽略 */ }
    }
    disposers.length = 0
  }

  try {
    const style = document.createElement('style')
    style.id = 'dsh-plugin-width-slider-motion-styles'
    style.textContent = MOTION_CSS
    document.getElementById(style.id)?.remove()
    document.head.appendChild(style)
    disposers.push(() => { style.remove() })

    const engine = installConversationEntrance({
      getState: () => motionStateOf(ctx),
      subscribe: (listener) => {
        const offSettings = onSettingsChanged(listener)
        const offSessions = ctx.sessions.list.subscribe(listener)
        return () => {
          offSettings()
          offSessions()
        }
      },
    })
    disposers.push(engine.dispose)

    const settingsMotion = installSettingsMotion({
      enabled: () => getSettings().settingsMotionEnabled,
      subscribe: (listener) => onSettingsChanged(listener),
    })
    disposers.push(settingsMotion.dispose)

    let lastSessionId: string | undefined
    const syncSession = (): void => {
      const current = ctx.sessions.list.getSnapshot().current
      if (current === lastSessionId) return
      lastSessionId = current
      if (current !== undefined) engine.notifySessionSwitch()
    }
    syncSession()
    disposers.push(ctx.sessions.list.subscribe(syncSession))
  } catch (err) {
    // 中途失败（例如会话服务尚未就绪）不留半装的样式表/引擎。
    cleanup()
    throw err
  }

  return cleanup
}

/** 界面英文中文化（开关=开 且 界面语言为中文时生效）。 */
function installLocalize(): Disposer {
  // 语言门控：en 界面默认不中文化官方标签，避免中英混杂（开关保留，供
  // 中文界面用户控制）。
  if (!isZhInterface()) {
    console.info('[width-slider] 界面语言非中文，界面中文化未启用')
    return () => {}
  }
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
        '与本插件同 key 注册会互相覆盖。请卸载 dsh-think-zh-expand（本插件已整合其全部能力）。',
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
    const result = await callEndpoint('/api/width-slider', 'readSettings', {})
    if (result && typeof result === 'object' && (result as { ok?: boolean }).ok === true) {
      return (result as { value?: { settings?: unknown } }).value?.settings ?? null
    }
    return null
  } catch {
    return null
  }
}

async function rpcWriteSettings(ctx: RpcClientContext, settings: unknown): Promise<void> {
  await callEndpoint('/api/width-slider', 'writeSettings', { settings })
}

export const inject = ['slots', 'locale', 'connection', 'sessions', 'workspaces']

export function apply(ctx: RpcClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'width-slider: dictionaries')

  // 上游冲突提示（激活即探测一次）。
  ctx.effect(() => {
    warnIfUpstreamPresent()
    return () => {}
  }, 'width-slider: upstream conflict probe')

  // 受控生命周期：依据配置开关安装/卸载各功能；配置变化即时热切换。
  ctx.effect(() => {
    type Slot = 'handle' | 'think' | 'localize' | 'resize' | 'nav' | 'sessionDel' | 'wsTabs' | 'motion'
    const installed: Partial<Record<Slot, Disposer>> = {}

    const ensure = (slot: Slot, want: boolean, installer: () => Disposer): void => {
      if (want && installed[slot] === undefined) installed[slot] = installer()
      if (!want && installed[slot] !== undefined) {
        installed[slot]!()
        installed[slot] = undefined
      }
    }

    /**
     * 单个功能安装/卸载失败只影响它自己：异常若逃出 effect setup，cordis 会
     * 丢弃整条 cleanup 链，已安装的其它功能将无法卸载，还可能让插件整体
     * 被判为加载失败。
     */
    const ensureSafe = (slot: Slot, want: boolean, installer: () => Disposer): void => {
      try {
        ensure(slot, want, installer)
      } catch (err) {
        console.warn('[width-slider] feature lifecycle failed: ' + slot, err)
      }
    }

    const sync = (): void => {
      const s = getSettings()
      ensureSafe('handle', s.widthSlider, () => installWidthFeature())
      ensureSafe('think', s.thinkRender, () => installThinkRenderer(ctx))
      ensureSafe('localize', s.uiLocalize, () => installLocalize())
      ensureSafe('resize', s.dialogResize, () => installDialogResizePatch())
      ensureSafe('nav', s.navScroll, () => installNavScrollPatch())
      ensureSafe('sessionDel', s.sessionDelete, () => installSessionDelete(ctx as never))
      // 工作区分页：组件常驻（启动即包裹一次），开关只切换 wrapper 内 enabled
      // 状态（显示标签/过滤），不再反复安装/卸载组件——开关即时生效。
      ensureSafe('wsTabs', true, () => installWorkspaceTabs(ctx as never))
      // 动效：任一开关开启即安装引擎（引擎内部再按各开关分别门控）。
      ensureSafe('motion', s.motionEnabled || s.sidebarMotionEnabled || s.newChatMotionEnabled || s.settingsMotionEnabled,
        () => installMotionFeature(ctx))
    }

    const unsubscribe = onSettingsChanged(sync)
    sync()
    return () => {
      unsubscribe()
      for (const slot of ['handle', 'think', 'localize', 'resize', 'nav', 'sessionDel', 'wsTabs', 'motion'] as const) {
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
