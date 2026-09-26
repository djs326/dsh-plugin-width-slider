import type { FeatureSettings } from '../../shared/settings.ts'
import { motionAllowed, motionLookOf } from '../../shared/motionSettings.ts'
import type { MotionEngineState } from './conversation.ts'
import { prefersReducedMotion } from './waapi.ts'

/**
 * 从 config store 快照 + 会话是否空白派生引擎状态。
 *
 * **纯函数**：不读会话账本、不写任何模块级状态。"账本读不到"的降级与一次性告警在
 * 装配层的适配器里（`client/index.ts`）—— `motion/` 不该知道会话业务事实。
 */
export function motionStateOf(settings: FeatureSettings, blank: boolean): MotionEngineState {
  // 总闸先行：`off` 一律不放行，`system` 档读系统的「减少动态效果」。总闸
  // 放行即三处场景全开——场景不再单独暴露（见 shared/motionSettings.ts 顶部
  // 说明）；样式则整组来自当前风格档，不再逐场景各读一个字段。
  const on = motionAllowed(settings.motionMode, prefersReducedMotion())
  const look = motionLookOf(settings.motionLook)
  return {
    transcript: on,
    sidebar: on,
    newChat: on,
    style: look.motionStyle,
    sidebarStyle: look.sidebarMotionStyle,
    newChatStyle: look.newChatMotionStyle,
    roleEntrance: on,
    blank,
  }
}
