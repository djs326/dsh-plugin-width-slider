/**
 * config.ts — 插件功能开关的 client 端配置 store。
 *
 * 与 host 端（src/index.ts）的 FeatureSettings 契约保持一致：
 * - 持久化真源 = host 端文件（$DSH_HOME/storages/dsh-plugin-width-slider/
 *   settings.json），经 /width-slider RPC readSettings/writeSettings 读写；
 * - 进程内热切换源 = 本模块 current（setSettings 通知订阅者即时生效）；
 * - 默认值两端必须一致（见本文件 DEFAULT_FEATURE_SETTINGS）。
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
  /** 6 官方设置弹窗可拖拽调宽（M3 接线） */
  dialogResize: boolean
  /** 7 官方设置左侧 tab 栏超高滚动（M3 接线） */
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

/** 合并任意来源（host 文件 / 缺失键）为完整配置。 */
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

// ── 进程内 store（订阅者：client 功能生命周期；热切换即时生效）──────────

type SettingsListener = (settings: FeatureSettings) => void

let current: FeatureSettings = { ...DEFAULT_FEATURE_SETTINGS }
const listeners = new Set<SettingsListener>()

export function getSettings(): FeatureSettings {
  return current
}

/** 应用一份完整配置并通知订阅者（用于 host 读回与总控页本地切换）。 */
export function applySettings(next: FeatureSettings): void {
  current = next
  for (const listener of listeners) {
    try {
      listener(current)
    } catch (err) {
      console.warn('[width-slider] settings listener threw', err)
    }
  }
}

/** 订阅配置变化；返回退订函数。 */
export function onSettingsChanged(listener: SettingsListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
