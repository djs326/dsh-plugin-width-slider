/**
 * 动效设置契约（整合自 dsh-client-ui-custom）。
 *
 * 样式 id、默认值与预设取值与上游逐字一致，便于对照上游代码；设置值本身
 * 存放在本插件的 FeatureSettings（shared/settings.ts）里，引擎与设置页都从
 * 那份配置读取，不再有独立的 ui-custom 命名空间。
 */

/** 对话内容的入场样式 id（默认第一项）。 */
export const MOTION_STYLES = ['fade-up', 'fade', 'rise-scale', 'slide-in', 'blur-in', 'scale-in'] as const

/** 对话内容入场样式。 */
export type MotionStyle = typeof MOTION_STYLES[number]

/** 对话入场样式的默认值。 */
export const DEFAULT_MOTION_STYLE: MotionStyle = 'fade-up'

/** 对话入场样式守卫（未知值回落到默认）。 */
export const isMotionStyle = (value: unknown): value is MotionStyle =>
  typeof value === 'string' && (MOTION_STYLES as readonly string[]).includes(value)

/** 侧边栏会话树的入场样式 id（横向为主）。 */
export const SIDEBAR_MOTION_STYLES = ['slide-left', 'fade', 'expand', 'slide-down'] as const

/** 侧边栏入场样式。 */
export type SidebarMotionStyle = typeof SIDEBAR_MOTION_STYLES[number]

/** 侧边栏入场样式的默认值。 */
export const DEFAULT_SIDEBAR_MOTION_STYLE: SidebarMotionStyle = 'slide-left'

/** 侧边栏入场样式守卫。 */
export const isSidebarMotionStyle = (value: unknown): value is SidebarMotionStyle =>
  typeof value === 'string' && (SIDEBAR_MOTION_STYLES as readonly string[]).includes(value)

/** 新建对话欢迎界面的入场样式 id（大表面，动得更轻）。 */
export const NEW_CHAT_MOTION_STYLES = ['reveal', 'fade', 'bloom', 'zoom'] as const

/** 新建对话入场样式。 */
export type NewChatMotionStyle = typeof NEW_CHAT_MOTION_STYLES[number]

/** 新建对话入场样式的默认值。 */
export const DEFAULT_NEW_CHAT_MOTION_STYLE: NewChatMotionStyle = 'reveal'

/** 新建对话入场样式守卫。 */
export const isNewChatMotionStyle = (value: unknown): value is NewChatMotionStyle =>
  typeof value === 'string' && (NEW_CHAT_MOTION_STYLES as readonly string[]).includes(value)

/** 一套预设应用的完整动效配置。 */
export interface MotionPresetConfig {
  motionEnabled: boolean
  motionStyle: MotionStyle
  sidebarMotionEnabled: boolean
  sidebarMotionStyle: SidebarMotionStyle
  newChatMotionEnabled: boolean
  newChatMotionStyle: NewChatMotionStyle
  settingsMotionEnabled: boolean
}

/** 预设 id。 */
export type MotionPresetId = 'fluid' | 'elegant' | 'minimal'

/** 三套预设（与动效插件的取值一致，标签在 locales.ts）。 */
export const MOTION_PRESETS: readonly { id: MotionPresetId; config: MotionPresetConfig }[] = [
  {
    id: 'fluid',
    config: {
      motionEnabled: true,
      motionStyle: 'rise-scale',
      sidebarMotionEnabled: true,
      sidebarMotionStyle: 'slide-left',
      newChatMotionEnabled: true,
      newChatMotionStyle: 'reveal',
      settingsMotionEnabled: true,
    },
  },
  {
    id: 'elegant',
    config: {
      motionEnabled: true,
      motionStyle: 'blur-in',
      sidebarMotionEnabled: true,
      sidebarMotionStyle: 'fade',
      newChatMotionEnabled: true,
      newChatMotionStyle: 'bloom',
      settingsMotionEnabled: true,
    },
  },
  {
    id: 'minimal',
    config: {
      motionEnabled: true,
      motionStyle: 'fade',
      sidebarMotionEnabled: true,
      sidebarMotionStyle: 'fade',
      newChatMotionEnabled: true,
      newChatMotionStyle: 'fade',
      settingsMotionEnabled: false,
    },
  },
]
