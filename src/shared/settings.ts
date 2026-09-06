/**
 * settings.ts — 功能开关契约（host 与 client 共享的唯一真源）。
 *
 * host（src/index.ts）与 client（src/client/config.ts）都从本文件 import，
 * 避免两端各自维护 DEFAULTS / mergeSettings 造成静默漂移。
 * 本文件无运行时依赖（纯类型 + 纯函数），tsdown 会分别打进两端 bundle。
 */

export interface FeatureSettings {
  /** 1 对话宽度滑块（含隐藏原生手柄） */
  widthSlider: boolean
  /** 2 思考/回复强制中文（host 端 systemPrompt 注入） */
  chinesePrompt: boolean
  /** 3 思考块增强渲染（assistant-step 覆盖） */
  thinkRender: boolean
  /** 3a 思考块/回复文本 Markdown 渲染（依赖 dsh-md-render；关闭后纯文本，供接入其它渲染插件） */
  thinkMarkdown: boolean
  /** 4 界面硬编码英文中文化 */
  uiLocalize: boolean
  /** 5 思考块模式：思考完自动收起 / 保持展开（上游语义） */
  thinkMode: 'auto-collapse' | 'keep-expanded'
  /** 6 官方设置弹窗可拖拽调宽 */
  dialogResize: boolean
  /** 7 官方设置左侧 tab 栏超高滚动 */
  navScroll: boolean
  /** 8 对话头部 Open With 胶囊按钮（整合 dsh-plugin-open-with） */
  openWithButton: boolean
  /** 9 Open With 设置在总控页中的分组（整合 dsh-plugin-open-with） */
  openWithSettings: boolean
  /** 10 会话行 ⋯ 菜单"删除会话"项（克隆官方菜单项，二次确认后 host 永久删除） */
  sessionDelete: boolean
  /** 11 工作区分页 tab 栏（官方标题行原位替换为「默认+分组文件夹」页签；工作区唯一归属默认或某页签，行菜单「分配标签」移动归属；删除页签时其中工作区自动回默认；重启后回到默认页签） */
  workspaceTabs: boolean
}

export const DEFAULT_FEATURE_SETTINGS: FeatureSettings = {
  widthSlider: true,
  chinesePrompt: true,
  thinkRender: true,
  thinkMarkdown: true,
  uiLocalize: true,
  thinkMode: 'auto-collapse',
  dialogResize: true,
  navScroll: true,
  openWithButton: true,
  openWithSettings: true,
  sessionDelete: true,
  workspaceTabs: true,
}

/** 白名单式合并任意来源（host 文件 / 缺键 / 未知类型）为完整配置。 */
export function mergeSettings(raw: unknown): FeatureSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    widthSlider: o.widthSlider !== false,
    chinesePrompt: o.chinesePrompt !== false,
    thinkRender: o.thinkRender !== false,
    thinkMarkdown: o.thinkMarkdown !== false,
    uiLocalize: o.uiLocalize !== false,
    thinkMode: o.thinkMode === 'keep-expanded' ? 'keep-expanded' : 'auto-collapse',
    dialogResize: o.dialogResize !== false,
    navScroll: o.navScroll !== false,
    openWithButton: o.openWithButton !== false,
    openWithSettings: o.openWithSettings !== false,
    sessionDelete: o.sessionDelete !== false,
    workspaceTabs: o.workspaceTabs !== false,
  }
}
