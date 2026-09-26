// @vitest-environment jsdom
/**
 * 功能注册表（批次⑦ 从入口内联块抽出）。它现在是「装了什么 / 谁卸的」唯一记账处，
 * 所以断言落在它替入口守住的那几件事上：
 *
 * - 一个槽位只装一次、只卸一次，开关反复翻转不留悬空或重复的记录；
 * - 单个功能装卸失败只影响它自己 —— 异常若逃出 effect setup，cordis 会丢弃整条
 *   cleanup 链，已装的其它功能将再也卸不掉；
 * - 卸载次序是显式常量，与安装次序**刻意不同**（既有事实，见 UNINSTALL_ORDER 注释）；
 * - `ensure`（不套 try/catch 的那条路径）不是公开面。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as registryModule from '../src/client/core/features.ts'
import {
  UNINSTALL_ORDER, createFeatureRegistry, type Slot,
} from '../src/client/core/features.ts'

/**
 * 装配层 `sync()` 的安装次序（基线 `:330-347`）。尾段与 `UNINSTALL_ORDER` 不同：
 * 这里是 `… wsTabs, toolsMerge, motion`，卸载序是 `… wsTabs, motion, toolsMerge`。
 */
const INSTALL_ORDER: readonly Slot[] = [
  'handle', 'think', 'resize', 'nav', 'sessionDel', 'wsTabs', 'toolsMerge', 'motion',
]

/** 一个假 installer：记录调用次序，可选前 N 次抛错，绝不碰真实 DOM。 */
function fakeInstaller(slot: Slot, log: string[], failTimes = 0): () => () => void {
  let calls = 0
  return () => {
    calls += 1
    log.push(`install:${slot}`)
    if (calls <= failTimes) throw new Error(`installer failed: ${slot}`)
    return () => {
      log.push(`dispose:${slot}`)
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('功能注册表', () => {
  it('installs a slot the first time it is wanted, and not on later passes', () => {
    const registry = createFeatureRegistry()
    const log: string[] = []
    const installer = fakeInstaller('handle', log)

    registry.ensureSafe('handle', true, installer)
    registry.ensureSafe('handle', true, installer)
    registry.ensureSafe('handle', true, installer)

    // 开关每变一次就重跑一遍 sync()：已装的槽位不能被重复安装。
    expect(log).toEqual(['install:handle'])
  })

  it('uninstalls exactly once when the toggle goes off, and reinstalls on the way back', () => {
    const registry = createFeatureRegistry()
    const log: string[] = []
    const installer = fakeInstaller('think', log)

    registry.ensureSafe('think', true, installer)
    registry.ensureSafe('think', false, installer)
    registry.ensureSafe('think', false, installer)
    registry.ensureSafe('think', true, installer)

    expect(log).toEqual(['install:think', 'dispose:think', 'install:think'])
  })

  it('never calls an installer for a slot that is not wanted', () => {
    const registry = createFeatureRegistry()
    const log: string[] = []

    registry.ensureSafe('nav', false, fakeInstaller('nav', log))

    // 安装器只在安装分支被调用：未装载的槽位不该因为 want=false 而被碰一下。
    expect(log).toEqual([])
  })

  it('keeps the records per registry, so one effect cannot touch another plugin installation', () => {
    const first = createFeatureRegistry()
    const second = createFeatureRegistry()
    const log: string[] = []

    first.ensureSafe('handle', true, fakeInstaller('handle', log))
    second.ensureSafe('handle', false, fakeInstaller('handle', log))

    // 每份注册表持有自己的 installed 记录（一个 effect 一份），互不相识。
    expect(log).toEqual(['install:handle'])
  })

  it('keeps a failing slot uninstalled so the next pass retries it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registry = createFeatureRegistry()
    const log: string[] = []
    const installer = fakeInstaller('think', log, 1)

    expect(() => {
      registry.ensureSafe('think', true, installer)
    }).not.toThrow()
    // 失败不留记录 —— 于是这次 want=false 没有可卸的东西，不会去调用残留的 installer。
    registry.ensureSafe('think', false, installer)
    expect(log).toEqual(['install:think'])

    registry.ensureSafe('think', true, installer)
    registry.ensureSafe('think', true, installer)
    // 重试成功；成功之后的重复 pass 不再重装。
    expect(log).toEqual(['install:think', 'install:think'])

    expect(warn).toHaveBeenCalledWith('[width-slider] feature lifecycle failed: think', expect.any(Error))
  })

  it('keeps the record when a disposer throws, so the next pass retries that same disposer', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registry = createFeatureRegistry()
    const log: string[] = []
    let throwing = true
    registry.ensureSafe('handle', true, () => () => {
      log.push('dispose:handle')
      if (throwing) {
        throwing = false
        throw new Error('dispose failed')
      }
    })

    registry.ensureSafe('handle', false, fakeInstaller('handle', log))
    // 卸载抛错 → 记录保持已装（`installed[slot]!()` 先于清记录），所以这一次既没重装、
    // 也没换安装器：下一次 want=false 还会调用同一个卸载函数。
    expect(log).toEqual(['dispose:handle'])

    registry.ensureSafe('handle', false, fakeInstaller('handle', log))
    expect(log).toEqual(['dispose:handle', 'dispose:handle'])
    expect(warn).toHaveBeenCalledWith('[width-slider] feature lifecycle failed: handle', expect.any(Error))
  })

  it('uninstalls in UNINSTALL_ORDER, only what is installed, and only once', () => {
    const registry = createFeatureRegistry()
    const log: string[] = []
    const installed = INSTALL_ORDER.filter((slot) => slot !== 'nav' && slot !== 'sessionDel')
    for (const slot of installed) registry.ensureSafe(slot, true, fakeInstaller(slot, log))
    expect(log).toHaveLength(installed.length)

    log.length = 0
    registry.disposeAll()
    expect(log).toEqual([
      'dispose:handle', 'dispose:think', 'dispose:resize',
      'dispose:wsTabs', 'dispose:motion', 'dispose:toolsMerge',
    ])

    registry.disposeAll()
    expect(log).toHaveLength(6)
  })

  it('lets a throwing disposer abort disposeAll instead of swallowing it', () => {
    // 逐字保真：`disposeAll` 刻意不套 try/catch（与 ensureSafe 不同）。于是抛出会中止
    // 剩余槽位的卸载 —— 这是既有行为，不是要修的东西，改动必须让这条断言变红。
    const registry = createFeatureRegistry()
    const log: string[] = []
    registry.ensureSafe('handle', true, () => () => {
      log.push('dispose:handle')
      throw new Error('boom')
    })
    registry.ensureSafe('think', true, fakeInstaller('think', log))

    expect(() => {
      registry.disposeAll()
    }).toThrow('boom')
    // 抛出中止了剩余的卸载：排在前面的 handle 卸掉了，think 还留在已装记录里。
    expect(log).toEqual(['install:think', 'dispose:handle'])
  })

  it('freezes the uninstall order as a constant that differs from the install order', () => {
    // 「安装序 ≠ 卸载序」这个既有事实的唯一固化点：换成遍历 installed 就会退回插入序，
    // 把这处差异变成随运行漂移的值，所以这里同时钉住常量内容与「两者不同」。
    expect([...UNINSTALL_ORDER]).toEqual([
      'handle', 'think', 'resize', 'nav', 'sessionDel', 'wsTabs', 'motion', 'toolsMerge',
    ])
    expect([...UNINSTALL_ORDER]).not.toEqual([...INSTALL_ORDER])
  })

  it('does not expose the unchecked ensure path', () => {
    // 裁定 3：只有 ensureSafe 是公开面，不套 try/catch 的 ensure 必须留在闭包里。
    expect(Object.keys(registryModule)).not.toContain('ensure')
    expect(Object.keys(registryModule).sort()).toEqual(['UNINSTALL_ORDER', 'createFeatureRegistry'])
  })
})
