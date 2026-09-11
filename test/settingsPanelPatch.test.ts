// @vitest-environment jsdom
/**
 * Settings-dialog window patch: the handle it injects, the legacy width migration,
 * the "only the settings dialog is touched" guard, and the fully reversible teardown
 * (handle removed, inline styles cleared, memory dropped) — the behaviour a user sees
 * as "turn the switch off and the dialog is official again".
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearPanelRect, installDialogResizePatch } from '../src/client/settingsPanelPatch.ts'

const RECT_KEY = 'dsh.conversation.settingsPanelWindow'
const LEGACY_WIDTH_KEY = 'dsh.conversation.settingsPanelWidth'
const HANDLE_ATTR = 'data-width-slider-resize-handle'

let dispose: (() => void) | null = null

/** The host's settings dialog shape: role=dialog + aria-modal + a direct <nav> child. */
function mountSettingsDialog(): HTMLElement {
  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  const nav = document.createElement('nav')
  const navList = document.createElement('div')
  const button = document.createElement('button')
  navList.appendChild(button)
  nav.appendChild(navList)
  dialog.appendChild(nav)
  const content = document.createElement('div')
  dialog.appendChild(content)
  document.body.appendChild(dialog)
  return dialog
}

beforeEach(() => {
  window.localStorage.clear()
  document.body.replaceChildren()
})

afterEach(() => {
  dispose?.()
  dispose = null
  window.localStorage.clear()
})

describe('installDialogResizePatch', () => {
  it('injects its resize handle into the settings dialog', () => {
    const dialog = mountSettingsDialog()
    dispose = installDialogResizePatch()
    expect(dialog.querySelector(`[${HANDLE_ATTR}]`)).not.toBeNull()
  })

  it('leaves dialogs that are not the settings panel alone', () => {
    const other = document.createElement('div')
    other.setAttribute('role', 'dialog')
    other.setAttribute('aria-modal', 'true')
    document.body.appendChild(other)
    dispose = installDialogResizePatch()
    expect(other.querySelector(`[${HANDLE_ATTR}]`)).toBeNull()
  })

  it('migrates the legacy width-only memory onto the dialog', () => {
    window.localStorage.setItem(LEGACY_WIDTH_KEY, '900')
    const dialog = mountSettingsDialog()
    dispose = installDialogResizePatch()
    expect(dialog.style.width).toBe('900px')
    // 位置由调用方换算（旧记忆只有宽度）：应当被摆在视口内。
    expect(Number.parseFloat(dialog.style.top)).toBeGreaterThanOrEqual(0)
  })

  it('applies a stored window rectangle', () => {
    window.localStorage.setItem(RECT_KEY, JSON.stringify({ w: 720, h: 600, left: 40, top: 30, auto: false }))
    const dialog = mountSettingsDialog()
    dispose = installDialogResizePatch()
    expect(dialog.style.width).toBe('720px')
    expect(dialog.style.height).toBe('600px')
  })

  it('tears everything back down, including the memory', () => {
    const dialog = mountSettingsDialog()
    dispose = installDialogResizePatch()
    expect(dialog.querySelector(`[${HANDLE_ATTR}]`)).not.toBeNull()
    window.localStorage.setItem(RECT_KEY, JSON.stringify({ w: 700, h: 600, left: 20, top: 20, auto: false }))

    dispose()
    dispose = null
    expect(dialog.querySelector(`[${HANDLE_ATTR}]`)).toBeNull()
    expect(dialog.style.width).toBe('')
    expect(dialog.style.height).toBe('')
    expect(dialog.style.position).toBe('')
    // 关闭开关 = 回官方原样：记忆也一并清掉，重开不会又套回旧尺寸。
    expect(window.localStorage.getItem(RECT_KEY)).toBeNull()
  })
})

describe('clearPanelRect', () => {
  it('drops the current key and the legacy one', () => {
    window.localStorage.setItem(RECT_KEY, JSON.stringify({ w: 700, h: 600, left: 20, top: 20, auto: true }))
    window.localStorage.setItem(LEGACY_WIDTH_KEY, '820')
    clearPanelRect()
    expect(window.localStorage.getItem(RECT_KEY)).toBeNull()
    expect(window.localStorage.getItem(LEGACY_WIDTH_KEY)).toBeNull()
  })
})
