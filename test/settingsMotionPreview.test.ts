// @vitest-environment jsdom
/**
 * 「预览开着时，这一次 Escape 归预览」——批次④ 遗留项的收口。
 *
 * 断言的对象是**装配**，不是引擎本身：`settingsMotion.test.ts` 的 harness 恒传
 * `isPreviewOpen: () => false`（引擎侧那个分支已在那里覆盖），这里改成经
 * `installMotionFeature` 真装一遍，端口接上真实的 `core/overlayState.ts`。
 * 于是「装配层到底把哪个函数接进了引擎」也进入被测范围 —— 接成恒 `false`
 * （批次④ 的旧状态）或恒 `true` 都会让下面其中一条变红。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applySettings } from '../src/client/core/config.ts'
import { setPreviewOpen } from '../src/client/core/overlayState.ts'
import { installMotionFeature, type MotionSessionsPort } from '../src/client/features/motion/index.ts'
import { SETTINGS_CLOSING_CLASS, SETTINGS_PANEL_CLASS } from '../src/client/motion/settingsMotion.ts'
import { DEFAULT_FEATURE_SETTINGS } from '../src/shared/settings.ts'

let dispose: (() => void) | null = null

/** 会话账本端口：这些用例不关心会话，给一个恒定的空账本。 */
const sessions: MotionSessionsPort = {
  subscribe: () => () => {},
  currentSessionId: () => undefined,
  isBlank: () => false,
}

/**
 * 设置面板的识别形状（`official/settingsDom.ts` 的严口径）：`role="presentation"` 层里
 * 紧邻自己遮罩的 modal dialog，内部任意深度有 nav。缺任何一项引擎就不认这个面板，
 * 下面每条断言都会退化成空断言 —— 所以装完先钉住识别结果。
 */
function mountPanel(): HTMLElement {
  const overlay = document.createElement('div')
  overlay.setAttribute('role', 'presentation')
  const mask = document.createElement('div')
  mask.setAttribute('aria-hidden', 'true')
  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  const nav = document.createElement('nav')
  const content = document.createElement('div')
  const header = document.createElement('div')
  const close = document.createElement('button')
  close.textContent = '关闭'
  header.append(close)
  content.append(header)
  dialog.append(nav, content)
  overlay.append(mask, dialog)
  document.body.append(overlay)
  return dialog
}

/** 先挂面板、再装引擎：`installSettingsMotion` 装配时会同步扫一次，识别是确定性的。 */
function install(): HTMLElement {
  const dialog = mountPanel()
  dispose = installMotionFeature(sessions)
  expect(dialog.classList.contains(SETTINGS_PANEL_CLASS)).toBe(true)
  return dialog
}

/** 宿主的 Escape 监听器（冒泡相）：用来判断这次按键有没有被引擎吃掉。 */
function watchEscape(): () => number {
  let seen = 0
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') seen += 1
  })
  return () => seen
}

const pressEscape = (): void => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
}

beforeEach(() => {
  document.body.replaceChildren()
  // 引擎在装配时直接查 matchMedia 并挂 change 监听。这里固定成「未要求减少动效」，
  // 否则退出动画会走 prefersReducedMotion 的直通分支、不留缩回状态类。
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  // 动效总闸是引擎 enabled() 的真源，关着时它根本不拦事件。
  applySettings({ ...DEFAULT_FEATURE_SETTINGS, motionMode: 'on' })
})

afterEach(() => {
  dispose?.()
  dispose = null
  setPreviewOpen(false)
  // 配置 store 是模块级单例，复原后再离开。
  applySettings({ ...DEFAULT_FEATURE_SETTINGS })
  vi.unstubAllGlobals()
})

describe('设置面板动效 × 宽度预览', () => {
  it('hands Escape to the preview instead of shrinking the settings panel', () => {
    const dialog = install()
    const escapesSeenByHost = watchEscape()

    setPreviewOpen(true)
    pressEscape()

    // 这一次按键属于预览：面板不缩回，按键也继续走完（既不拦也不吞）。
    expect(dialog.classList.contains(SETTINGS_CLOSING_CLASS)).toBe(false)
    expect(escapesSeenByHost()).toBe(1)
  })

  it('shrinks the panel on Escape once the preview is over', () => {
    const dialog = install()
    const escapesSeenByHost = watchEscape()

    setPreviewOpen(true)
    setPreviewOpen(false)
    pressEscape()

    // 控制组：证明端口真的接上了，上一条不是恒真的空断言。
    expect(dialog.classList.contains(SETTINGS_CLOSING_CLASS)).toBe(true)
    // 被拦下的这次按键对宿主完全不可见（捕获阶段 stopImmediatePropagation）。
    expect(escapesSeenByHost()).toBe(0)
  })

  it('drops the interception when the config store turns motion off', () => {
    const dialog = install()
    const escapesSeenByHost = watchEscape()

    applySettings({ ...DEFAULT_FEATURE_SETTINGS, motionMode: 'off' })
    pressEscape()

    // enabled() 读的是配置 store 而不是常量：总闸关掉后连缩回都不做。
    expect(dialog.classList.contains(SETTINGS_CLOSING_CLASS)).toBe(false)
    expect(escapesSeenByHost()).toBe(1)
  })
})
