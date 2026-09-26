import type { Disposer } from '../../shared/types.ts'

export type { Disposer }

/** 可独立装卸的功能槽位。名单同时约束 `sync()` 的安装序与 `UNINSTALL_ORDER` 的卸载序。 */
export type Slot =
  | 'handle' | 'think' | 'resize' | 'nav'
  | 'sessionDel' | 'wsTabs' | 'motion' | 'toolsMerge'

/**
 * 卸载次序。**刻意与安装次序不同** —— `sync()` 的安装序是 `… wsTabs, toolsMerge, motion`，
 * 这里是 `… wsTabs, motion, toolsMerge`（既有行为：基线 `:330-347` 对 `:354`）。
 * 两者无共享状态，实际无害；但改成遍历 `installed` 会按插入序卸载、把这处差异变成
 * 随运行漂移的值，故用显式常量固化。
 */
export const UNINSTALL_ORDER: readonly Slot[] = [
  'handle', 'think', 'resize', 'nav', 'sessionDel', 'wsTabs', 'motion', 'toolsMerge',
]

export interface FeatureRegistry {
  /**
   * 按需装卸一个功能：`want` 为真且未安装时调用 `installer`；为假且已安装时先卸载再清记录。
   * `installer` 抛错时吞掉并告警，槽位保持未安装 —— 于是下次调用会**重试**。
   */
  ensureSafe: (slot: Slot, want: boolean, installer: () => Disposer) => void
  /** 按 `UNINSTALL_ORDER` 卸载全部已装功能并清空记录。 */
  disposeAll: () => void
}

/** 创建一份功能注册表。每份注册表持有自己的 `installed` 记录（一个 effect 一份）。 */
export function createFeatureRegistry(): FeatureRegistry {
  const installed: Partial<Record<Slot, Disposer>> = {}

  const ensure = (slot: Slot, want: boolean, installer: () => Disposer): void => {
    if (want && installed[slot] === undefined) installed[slot] = installer()
    if (!want && installed[slot] !== undefined) {
      installed[slot]!()
      installed[slot] = undefined
    }
  }

  /**
   * 单个功能安装/卸载失败只影响它自己：异常若逃出 effect setup，cordis 会丢弃整条
   * cleanup 链，已安装的其它功能将无法卸载，还可能让插件整体被判为加载失败。
   */
  const ensureSafe = (slot: Slot, want: boolean, installer: () => Disposer): void => {
    try {
      ensure(slot, want, installer)
    } catch (err) {
      console.warn('[width-slider] feature lifecycle failed: ' + slot, err)
    }
  }

  const disposeAll = (): void => {
    for (const slot of UNINSTALL_ORDER) {
      if (installed[slot] !== undefined) {
        installed[slot]!()
        installed[slot] = undefined
      }
    }
  }

  return { ensureSafe, disposeAll }
}
