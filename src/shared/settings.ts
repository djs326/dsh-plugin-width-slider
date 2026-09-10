/**
 * settings.ts — 功能开关契约（host 与 client 共享的唯一真源）。
 *
 * host（src/index.ts）与 client（src/client/config.ts）都从本文件 import，
 * 避免两端各自维护 DEFAULTS / mergeSettings 造成静默漂移。
 * 本文件无运行时依赖（纯类型 + 纯函数），tsdown 会分别打进两端 bundle。
 */

import {
  DEFAULT_MOTION_STYLE,
  DEFAULT_NEW_CHAT_MOTION_STYLE,
  DEFAULT_SIDEBAR_MOTION_STYLE,
  isMotionStyle,
  isNewChatMotionStyle,
  isSidebarMotionStyle,
  type MotionStyle,
  type NewChatMotionStyle,
  type SidebarMotionStyle,
} from './motionSettings.ts'

export interface FeatureSettings {
  /** 1 对话宽度滑块（含隐藏原生手柄） */
  widthSlider: boolean
  /** 2 思考/回复强制中文（host 端 systemPrompt 注入） */
  chinesePrompt: boolean
  /** 3 思考块增强渲染（assistant-step 覆盖；外观同官方，仅展开/收起行为定制） */
  thinkRender: boolean
  /** 4 界面硬编码英文中文化 */
  uiLocalize: boolean
  /** 5 思考块模式：思考完自动收起 / 保持展开（上游语义） */
  thinkMode: 'auto-collapse' | 'keep-expanded'
  /** 6 官方设置弹窗可拖拽调宽 */
  dialogResize: boolean
  /** 7 官方设置左侧 tab 栏超高滚动 */
  navScroll: boolean
  /** 8 会话行 ⋯ 菜单"删除会话"项（克隆官方菜单项，二次确认后 host 永久删除） */
  sessionDelete: boolean
  /** 9 工作区分页 tab 栏（官方标题行原位替换为「默认+分组文件夹」页签；工作区唯一归属默认或某页签，行菜单「分配标签」移动归属；删除页签时其中工作区自动回默认；重启后回到默认页签） */
  workspaceTabs: boolean
  /** 10 对话入场动效（整合自 dsh-client-ui-custom） */
  motionEnabled: boolean
  /** 11 对话内容入场样式 */
  motionStyle: MotionStyle
  /** 12 侧边栏动效（初次载入 + 工作区分组展开） */
  sidebarMotionEnabled: boolean
  /** 13 侧边栏入场样式 */
  sidebarMotionStyle: SidebarMotionStyle
  /** 14 新建对话（空白会话）入场动效 */
  newChatMotionEnabled: boolean
  /** 15 新建对话入场样式 */
  newChatMotionStyle: NewChatMotionStyle
  /** 16 设置面板动效（展开/页面淡入/关闭缩回） */
  settingsMotionEnabled: boolean
}

export const DEFAULT_FEATURE_SETTINGS: FeatureSettings = {
  widthSlider: true,
  chinesePrompt: true,
  thinkRender: true,
  uiLocalize: true,
  thinkMode: 'auto-collapse',
  dialogResize: true,
  navScroll: true,
  sessionDelete: true,
  workspaceTabs: true,
  motionEnabled: true,
  motionStyle: DEFAULT_MOTION_STYLE,
  sidebarMotionEnabled: true,
  sidebarMotionStyle: DEFAULT_SIDEBAR_MOTION_STYLE,
  newChatMotionEnabled: true,
  newChatMotionStyle: DEFAULT_NEW_CHAT_MOTION_STYLE,
  settingsMotionEnabled: true,
}

/** 白名单式合并任意来源（host 文件 / 缺键 / 未知类型）为完整配置。 */
export function mergeSettings(raw: unknown): FeatureSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    widthSlider: o.widthSlider !== false,
    chinesePrompt: o.chinesePrompt !== false,
    thinkRender: o.thinkRender !== false,
    uiLocalize: o.uiLocalize !== false,
    thinkMode: o.thinkMode === 'keep-expanded' ? 'keep-expanded' : 'auto-collapse',
    dialogResize: o.dialogResize !== false,
    navScroll: o.navScroll !== false,
    sessionDelete: o.sessionDelete !== false,
    workspaceTabs: o.workspaceTabs !== false,
    motionEnabled: o.motionEnabled !== false,
    motionStyle: isMotionStyle(o.motionStyle) ? o.motionStyle : DEFAULT_MOTION_STYLE,
    sidebarMotionEnabled: o.sidebarMotionEnabled !== false,
    sidebarMotionStyle: isSidebarMotionStyle(o.sidebarMotionStyle) ? o.sidebarMotionStyle : DEFAULT_SIDEBAR_MOTION_STYLE,
    newChatMotionEnabled: o.newChatMotionEnabled !== false,
    newChatMotionStyle: isNewChatMotionStyle(o.newChatMotionStyle) ? o.newChatMotionStyle : DEFAULT_NEW_CHAT_MOTION_STYLE,
    settingsMotionEnabled: o.settingsMotionEnabled !== false,
  }
}
