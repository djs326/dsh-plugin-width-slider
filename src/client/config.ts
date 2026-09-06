/**
 * config.ts — 插件功能开关的 client 端配置 store。
 *
 * 契约（类型/默认值/合并）唯一真源 = src/shared/settings.ts（host 共用）。
 * - 持久化真源 = host 端文件（$DSH_HOME/storages/dsh-plugin-width-slider/
 *   settings.json），经 /width-slider RPC readSettings/writeSettings 读写；
 * - 进程内热切换源 = 本模块 current（applySettings 通知订阅者即时生效）；
 * - 读取只发生一次（client 入口启动时）；总控页开关改动即写 host。
 */
import {
  DEFAULT_FEATURE_SETTINGS,
  mergeSettings,
  type FeatureSettings,
} from '../shared/settings.ts'

export type { FeatureSettings }
export { DEFAULT_FEATURE_SETTINGS, mergeSettings }

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
