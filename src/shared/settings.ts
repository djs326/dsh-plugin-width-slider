/**
 * settings.ts — 功能开关契约（host 与 client 共享的唯一真源）。
 *
 * host（src/index.ts）与 client（src/client/config.ts）都从本文件 import，
 * 避免两端各自维护 DEFAULTS / mergeSettings 造成静默漂移。
 * 本文件无运行时依赖（纯类型 + 纯函数），tsdown 会分别打进两端 bundle。
 */

import {
  DEFAULT_MOTION_LOOK,
  DEFAULT_MOTION_MODE,
  isMotionLook,
  isMotionMode,
  type MotionLookId,
  type MotionMode,
} from './motionSettings.ts'

export interface FeatureSettings {
  /** 1 对话宽度滑块（含隐藏原生手柄） */
  widthSlider: boolean
  /** 2 思考/回复强制中文（host 端 systemPrompt 注入） */
  chinesePrompt: boolean
  /** 3 思考块增强渲染（assistant-step 覆盖；外观同官方，仅展开/收起行为定制） */
  thinkRender: boolean
  /** 4 思考块模式：思考完自动收起 / 保持展开（上游语义） */
  thinkMode: 'auto-collapse' | 'keep-expanded'
  /** 5 官方设置弹窗可拖拽调宽 */
  dialogResize: boolean
  /** 6 官方设置左侧 tab 栏超高滚动 */
  navScroll: boolean
  /** 7 设置弹窗尺寸按窗口比例自适应（关闭时未拖动就与官方尺寸一致） */
  dialogAdaptive: boolean
  /** 8 会话行 ⋯ 菜单"删除会话"项（克隆官方菜单项，二次确认后 host 永久删除） */
  sessionDelete: boolean
  /** 9 工作区分页 tab 栏（官方标题行原位替换为「默认+分组文件夹」页签；工作区唯一归属默认或某页签，行菜单「分配标签」移动归属；删除页签时其中工作区自动回默认；重启后回到默认页签） */
  workspaceTabs: boolean
  /** 10 动效总闸：关闭 / 跟随系统 / 开启。关闭时全部动效一律不生效；「跟随系统」跟随操作系统的「减少动态效果」设置 */
  motionMode: MotionMode
  /** 11 动效风格：轻柔 / 上浮 / 滑入 / 显影。一档同时决定对话内容、侧边栏与新建对话三处各用哪种入场样式；设置页会给每档配实时预览 */
  motionLook: MotionLookId
  /** 12 侧边栏工具并入新建会话行（工作区标题行的搜索/视图/添加工作区三按钮移到「新建会话」旁，页签行独占整行） */
  sidebarToolsMerge: boolean
}

/**
 * 默认值：默认只开「不改写官方界面已有元素」的功能。
 *
 * - 开：宽度滑块、强制中文、思考块增强、设置弹窗可拖拽、设置 tab 栏滚动、会话删除
 *   （前者只调对话宽度，后五项要么只注入提示词，要么只在官方界面上叠加新元素）；
 * - 关：工作区分页、侧边栏工具并入（这两项会整行替换或搬走官方已有元素）、
 *   设置弹窗尺寸自适应，以及动效总闸（会给所有内容叠加入场动画）。
 *
 * 动效只有总闸与风格两个字段：总闸默认 `off`（不动官方界面任何东西），
 * 风格只在总闸开启后起作用，默认「上浮」。场景与样式都不再单独暴露——
 * 把五个引擎的名字摆成五个开关是要求用户先学会代码结构才能设置自己。
 *
 * 判定与回落都走这里，改默认值只需改本对象。
 */
export const DEFAULT_FEATURE_SETTINGS: FeatureSettings = {
  widthSlider: true,
  chinesePrompt: true,
  thinkRender: true,
  thinkMode: 'auto-collapse',
  dialogResize: true,
  navScroll: true,
  dialogAdaptive: false,
  sessionDelete: true,
  workspaceTabs: false,
  motionMode: DEFAULT_MOTION_MODE,
  motionLook: DEFAULT_MOTION_LOOK,
  sidebarToolsMerge: false,
}

/**
 * 白名单式合并任意来源（host 文件 / 缺键 / 未知类型 / 脏值）为完整配置。
 *
 * 每个字段都以 DEFAULT_FEATURE_SETTINGS 为回落基准：布尔只认真正的布尔值，
 * 枚举由各自的守卫校验。以前布尔用的是 `!== false`（缺键即开），那与
 * DEFAULT 是两套判定、会静默漂移；现在默认值只有一个真源。
 *
 * 1.8.x 及更早的动效场景字段（motionEnabled / motionStyle / sidebarMotionEnabled /
 * sidebarMotionStyle / newChatMotionEnabled / newChatMotionStyle /
 * settingsMotionEnabled / motionRoleEntrance）不在白名单里，读到时一律丢弃，
 * 不做迁移——它们表达的「哪些地方动」已经并入总闸，旧值没有对应物。
 */
export function mergeSettings(raw: unknown): FeatureSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const D = DEFAULT_FEATURE_SETTINGS
  return {
    widthSlider: typeof o.widthSlider === 'boolean' ? o.widthSlider : D.widthSlider,
    chinesePrompt: typeof o.chinesePrompt === 'boolean' ? o.chinesePrompt : D.chinesePrompt,
    thinkRender: typeof o.thinkRender === 'boolean' ? o.thinkRender : D.thinkRender,
    thinkMode: o.thinkMode === 'keep-expanded' ? 'keep-expanded' : D.thinkMode,
    dialogResize: typeof o.dialogResize === 'boolean' ? o.dialogResize : D.dialogResize,
    navScroll: typeof o.navScroll === 'boolean' ? o.navScroll : D.navScroll,
    dialogAdaptive: typeof o.dialogAdaptive === 'boolean' ? o.dialogAdaptive : D.dialogAdaptive,
    sessionDelete: typeof o.sessionDelete === 'boolean' ? o.sessionDelete : D.sessionDelete,
    workspaceTabs: typeof o.workspaceTabs === 'boolean' ? o.workspaceTabs : D.workspaceTabs,
    motionMode: isMotionMode(o.motionMode) ? o.motionMode : D.motionMode,
    motionLook: isMotionLook(o.motionLook) ? o.motionLook : D.motionLook,
    sidebarToolsMerge: typeof o.sidebarToolsMerge === 'boolean' ? o.sidebarToolsMerge : D.sidebarToolsMerge,
  }
}
