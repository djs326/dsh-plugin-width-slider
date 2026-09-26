import { installConversationEntrance, type MotionEngineState } from '../../motion/conversation.ts'
import { installSettingsMotion } from '../../motion/settingsMotion.ts'
import { motionStateOf } from '../../motion/state.ts'
import { MOTION_CSS } from '../../motion/styles.ts'
import { prefersReducedMotion } from '../../motion/waapi.ts'
import { applySettings, getSettings, onSettingsChanged } from '../../core/config.ts'
import { isPreviewOpen } from '../../core/overlayState.ts'
import { motionAllowed } from '../../../shared/motionSettings.ts'
import type { Disposer } from '../../../shared/types.ts'

/** 会话账本端口：由装配层从 `ctx.sessions` 适配。`features/` 层不接触宿主 ctx 形状。 */
export interface MotionSessionsPort {
  /** 订阅会话账本变化（切换 / blank 变化 / 列表刷新）。返回退订函数。 */
  subscribe: (listener: () => void) => () => void
  /** 当前会话 id；账本不可用或未选中会话时为 `undefined`。 */
  currentSessionId: () => string | undefined
  /** 当前会话是否空白会话；账本不可用降级为 `false`。 */
  isBlank: () => boolean
}

/**
 * 动效安装器（任一动效开关开启时安装；全部关闭即整体卸载）：
 * - 注入动效样式表；
 * - 对话/侧边栏/新建对话入场引擎（installConversationEntrance）；
 * - 设置面板动效引擎（installSettingsMotion）；
 * - 会话切换信号：宿主整段重挂载对话时强制重放入场。
 */
export function installMotionFeature(sessions: MotionSessionsPort): Disposer {
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
      getState: () => motionStateOf(getSettings(), sessions.isBlank()),
      subscribe: (listener) => {
        const offSettings = onSettingsChanged(listener)
        const offSessions = sessions.subscribe(listener)
        return () => {
          offSettings()
          offSessions()
        }
      },
    })
    disposers.push(engine.dispose)

    const settingsMotion = installSettingsMotion({
      enabled: () => motionAllowed(getSettings().motionMode, prefersReducedMotion()),
      subscribe: (listener) => onSettingsChanged(listener),
      // 预览（拖宽度时设置面板被隐藏）开着时 Escape 归预览；经端口注入，
      // motion/ 不再直连 core 的预览状态。
      isPreviewOpen,
    })
    disposers.push(settingsMotion.dispose)

    // 「跟随系统」档要实时跟随系统的「减少动态效果」：matchMedia 的变化不经过
    // settings store，这里手动广播一次，让引擎与上面的安装条件重新判定。
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onReduceMotionChange = (): void => { applySettings({ ...getSettings() }) }
    reduceMotion.addEventListener('change', onReduceMotionChange)
    disposers.push(() => reduceMotion.removeEventListener('change', onReduceMotionChange))

    let lastSessionId: string | undefined
    const syncSession = (): void => {
      const current = sessions.currentSessionId()
      if (current === lastSessionId) return
      lastSessionId = current
      if (current !== undefined) engine.notifySessionSwitch()
    }
    syncSession()
    disposers.push(sessions.subscribe(syncSession))
  } catch (err) {
    // 中途失败（例如会话服务尚未就绪）不留半装的样式表/引擎。
    cleanup()
    throw err
  }

  return cleanup
}
