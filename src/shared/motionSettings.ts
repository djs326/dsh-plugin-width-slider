/**
 * 动效设置契约（整合自 dsh-client-ui-custom）。
 *
 * 这里只有两个可调项，各管一件事：
 * - 总闸（MotionMode）：动不动。三态，`system` 档把决定权交给操作系统的
 *   「减少动态效果」设置，而不是让用户去猜什么算"多"；
 * - 风格档（MotionLookId）：怎么动。四档，每档给出一整套入场样式，覆盖
 *   对话内容、侧边栏与新建对话三个场景。
 *
 * 这里**没有**「哪些地方动」的开关。场景细分是引擎的实现切面——对话、侧边栏、
 * 新建对话、设置面板各有自己的观察器与生命周期——但用户心智里只有一件事：
 * 动效整体的样子。把实现切面暴露成开关，等于要求用户先学会代码结构才能设置。
 * 所以场景一律跟随总闸，样式一律由风格档决定，两者都不再单独暴露。
 *
 * 设置值本身存放在本插件的 FeatureSettings（shared/settings.ts）里，
 * 引擎与设置页都从那份配置读取。
 */

/** 对话内容的入场样式 id。 */
export const MOTION_STYLES = ['fade-up', 'fade', 'rise-scale', 'slide-in', 'blur-in', 'scale-in'] as const

/** 对话内容入场样式。 */
export type MotionStyle = typeof MOTION_STYLES[number]

/** 对话入场样式守卫（未知值回落到默认）。 */
export const isMotionStyle = (value: unknown): value is MotionStyle =>
  typeof value === 'string' && (MOTION_STYLES as readonly string[]).includes(value)

/** 侧边栏会话树的入场样式 id（横向为主）。 */
export const SIDEBAR_MOTION_STYLES = ['slide-left', 'fade', 'expand', 'slide-down'] as const

/** 侧边栏入场样式。 */
export type SidebarMotionStyle = typeof SIDEBAR_MOTION_STYLES[number]

/** 侧边栏入场样式守卫。 */
export const isSidebarMotionStyle = (value: unknown): value is SidebarMotionStyle =>
  typeof value === 'string' && (SIDEBAR_MOTION_STYLES as readonly string[]).includes(value)

/** 新建对话欢迎界面的入场样式 id（大表面，动得更轻）。 */
export const NEW_CHAT_MOTION_STYLES = ['reveal', 'fade', 'bloom', 'zoom'] as const

/** 新建对话入场样式。 */
export type NewChatMotionStyle = typeof NEW_CHAT_MOTION_STYLES[number]

/** 新建对话入场样式守卫。 */
export const isNewChatMotionStyle = (value: unknown): value is NewChatMotionStyle =>
  typeof value === 'string' && (NEW_CHAT_MOTION_STYLES as readonly string[]).includes(value)

// ── 总闸：动不动 ─────────────────────────────────────────────────────

/**
 * 动效总闸的三态取值：关闭 / 跟随系统 / 开启。
 *
 * 三态而不是一个开关，是因为「关」与「跟随系统」不是同一件事：系统要求减少
 * 动态的人需要的是后者，而 `prefers-reduced-motion: no-preference` 并不代表
 * 用户想要全量动效（它也可能只是没设过），所以只有 `reduce` 能被信任，必须
 * 有一个档位把这件事交给系统。
 */
export const MOTION_MODES = ['off', 'system', 'on'] as const

/** 动效总闸取值。 */
export type MotionMode = typeof MOTION_MODES[number]

/** 总闸默认值：关闭。本插件不默认改写官方界面的表现，动效要用户自己开。 */
export const DEFAULT_MOTION_MODE: MotionMode = 'off'

/** 总闸取值守卫。 */
export const isMotionMode = (value: unknown): value is MotionMode =>
  typeof value === 'string' && (MOTION_MODES as readonly string[]).includes(value)

/**
 * 纯函数：总闸是否放行动效。
 *
 * `off` 一律不放行；`system` 把决定权交给操作系统的「减少动态效果」设置，
 * 由调用方读 `prefers-reduced-motion` 后传入——判定留在共享层而不依赖 DOM，
 * host / client / 测试共用同一份，不会各写一套。
 * @param mode - 总闸取值。
 * @param systemReducesMotion - 系统当前是否要求减少动态。
 */
export function motionAllowed(mode: MotionMode, systemReducesMotion: boolean): boolean {
  if (mode === 'off') return false
  if (mode === 'system') return !systemReducesMotion
  return true
}

// ── 风格档：怎么动 ───────────────────────────────────────────────────

/** 一档风格：它给三个场景各选的入场样式。 */
export interface MotionLook {
  id: MotionLookId
  motionStyle: MotionStyle
  sidebarMotionStyle: SidebarMotionStyle
  newChatMotionStyle: NewChatMotionStyle
}

/**
 * 四档风格的 id。
 *
 * 四档是按"动作感觉"切的，不是按位移方向或实现细节：只变透明度、纵向浮起、
 * 横向进入、由虚到实。每档都能一句话说完，因为设置页会给它配实时预览——
 * 名字只用来回认，不用来传达效果。
 */
export const MOTION_LOOKS = ['soft', 'rise', 'glide', 'veil'] as const

/** 风格档 id。 */
export type MotionLookId = typeof MOTION_LOOKS[number]

/** 风格档默认值：上浮。最经典的一支，也是本插件早期的默认样式。 */
export const DEFAULT_MOTION_LOOK: MotionLookId = 'rise'

/** 风格档取值守卫。 */
export const isMotionLook = (value: unknown): value is MotionLookId =>
  typeof value === 'string' && (MOTION_LOOKS as readonly string[]).includes(value)

/**
 * 四档风格（标签与说明在 locales.ts）：
 *
 * - `soft` 轻柔：只有透明度变化，位移与缩放都不做。系统「减少动态效果」
 *   打开时动画会降级成这个样子，所以它也是这套档位里最安全的一支；
 * - `rise` 上浮：对话内容从下方 8px 浮起并在 300ms 内落定，侧边栏自上而下
 *   落下，欢迎界面走大表面的 reveal；
 * - `glide` 滑入：横向进入。对话内容从右侧 12px 滑入，侧边栏从左侧滑入，
 *   欢迎界面用缩放，读起来是"被推上来"的；
 * - `veil` 显影：由虚到实。内容带 6px 模糊淡入，侧边栏纵向展开，欢迎界面
 *   轻微绽放——三处都是"表面自己成形"，没有方向。
 *
 * 每档只决定样式取值，不含开关：「哪些地方动」由总闸统一负责。
 */
export const MOTION_LOOK_PRESETS: readonly MotionLook[] = [
  {
    id: 'soft',
    motionStyle: 'fade',
    sidebarMotionStyle: 'fade',
    newChatMotionStyle: 'fade',
  },
  {
    id: 'rise',
    motionStyle: 'fade-up',
    sidebarMotionStyle: 'slide-down',
    newChatMotionStyle: 'reveal',
  },
  {
    id: 'glide',
    motionStyle: 'slide-in',
    sidebarMotionStyle: 'slide-left',
    newChatMotionStyle: 'zoom',
  },
  {
    id: 'veil',
    motionStyle: 'blur-in',
    sidebarMotionStyle: 'expand',
    newChatMotionStyle: 'bloom',
  },
]

/** 按 id 取一档风格（未知 id 回落默认档）。 */
export function motionLookOf(id: MotionLookId): MotionLook {
  return MOTION_LOOK_PRESETS.find((look) => look.id === id)
    ?? MOTION_LOOK_PRESETS.find((look) => look.id === DEFAULT_MOTION_LOOK)
    ?? MOTION_LOOK_PRESETS[0]!
}
