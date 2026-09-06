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
  /** 4 界面硬编码英文中文化 */
  uiLocalize: boolean
  /** 5 思考块模式：思考完自动收起 / 保持展开（上游语义） */
  thinkMode: 'auto-collapse' | 'keep-expanded'
  /** 6 官方设置弹窗可拖拽调宽 */
  dialogResize: boolean
  /** 7 官方设置左侧 tab 栏超高滚动 */
  navScroll: boolean
}

export const DEFAULT_FEATURE_SETTINGS: FeatureSettings = {
  widthSlider: true,
  chinesePrompt: true,
  thinkRender: true,
  uiLocalize: true,
  thinkMode: 'auto-collapse',
  dialogResize: true,
  navScroll: true,
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
  }
}
