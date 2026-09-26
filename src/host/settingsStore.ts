/**
 * `settings.json` 的读写与 per-`apply` 内存当前值。
 *
 * 文件位置：`$DSH_HOME/storages/dsh-plugin-width-slider/settings.json`。
 * 读取一律过 `mergeSettings` 白名单合并；写入原子且写成功才换内存值 ——
 * 端点据此在落盘失败时返回 `write-failed` 而不改状态。
 */

import { join } from 'node:path'
import { resolveDshHome } from './dshHome.ts'
import { readJsonOrRecover, writeJsonAtomic } from './jsonFile.ts'
import { DEFAULT_FEATURE_SETTINGS, mergeSettings, type FeatureSettings } from '../shared/settings.ts'

const SETTINGS_DIR = join(resolveDshHome(), 'storages', 'dsh-plugin-width-slider')
const SETTINGS_FILE = join(SETTINGS_DIR, 'settings.json')

/** 读设置文件；缺失或损坏时回退默认。损坏文件改名保留现场（不静默覆盖）。 */
export function readSettingsFileSync(): FeatureSettings {
  const raw = readJsonOrRecover(
    SETTINGS_FILE,
    () => ({ ...DEFAULT_FEATURE_SETTINGS }),
    (err) => {
      // 文件损坏/半写：保留现场供排查，回退默认（下次写覆盖新文件，不丢证据）。
      console.warn('[width-slider] settings 文件损坏或不可读，已回退默认并保留现场', err)
    },
  )
  return mergeSettings(raw)
}

/** 原子写设置文件（tmp + rename）。 */
export function writeSettingsFileSync(settings: FeatureSettings): void {
  writeJsonAtomic(SETTINGS_FILE, settings)
}

/**
 * 每次 `apply` 一份的内存当前值。`commit` 先落盘、成功才换内存 —— 落盘抛错时
 * 内存必须保持旧值（端点据此返回 `write-failed` 而不改状态）。
 */
export interface SettingsStore {
  /** 当前生效设置（启动时读盘，写成功后热更新）。 */
  get: () => FeatureSettings
  /** 落盘并切换内存值；落盘失败向上抛，内存不变。 */
  commit: (next: FeatureSettings) => void
}

export function createSettingsStore(): SettingsStore {
  // 当前配置（启动时读文件合并默认；写操作热更新）。
  let current = readSettingsFileSync()
  return {
    get: () => current,
    commit: (next) => {
      writeSettingsFileSync(next)
      current = next
    },
  }
}
