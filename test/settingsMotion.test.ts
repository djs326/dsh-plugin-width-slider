// @vitest-environment jsdom
/**
 * Settings-panel motion engine: dialog detection by structure, the entrance
 * class, the nav-switch page replay, toggle gating and teardown.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  installSettingsMotion, SETTINGS_CLOSING_CLASS, SETTINGS_PAGE_CLASS, SETTINGS_PANEL_CLASS,
  type SettingsMotionOptions,
} from '../src/client/motion/settingsMotion.ts'

beforeEach(() => {
  document.body.replaceChildren()
})

/** Flush the MutationObserver microtask queue. */
const flushObserver = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0) })

/** A DOMRect stand-in for the jsdom measurements. */
const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  left, top, width, height, right: left + width, bottom: top + height, x: left, y: top,
  toJSON: () => ({}),
}) as DOMRect

/** Harness: a mutable toggle plus the captured listeners. */
function harness(enabled = true): { options: SettingsMotionOptions; setEnabled: (value: boolean) => void } {
  let on = enabled
  const listeners: (() => void)[] = []
  return {
    options: {
      enabled: () => on,
      subscribe: (listener) => {
        listeners.push(listener)
        return () => {
          const i = listeners.indexOf(listener)
          if (i !== -1) listeners.splice(i, 1)
        }
      },
    },
    setEnabled: (value) => {
      on = value
      for (const listener of [...listeners]) listener()
    },
  }
}

/** Mount a host-shaped settings surface: overlay > (mask + dialog > nav + content). */
function mountDialog(): {
  overlay: HTMLElement
  dialog: HTMLElement
  content: HTMLElement
  navButton: HTMLButtonElement
  closeButton: HTMLButtonElement
  actionButton: HTMLButtonElement
  mask: HTMLElement
} {
  const overlay = document.createElement('div')
  const mask = document.createElement('div')
  mask.setAttribute('aria-hidden', 'true')
  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  const nav = document.createElement('nav')
  const navButton = document.createElement('button')
  navButton.setAttribute('aria-current', 'true')
  navButton.textContent = '外观'
  nav.append(navButton)
  const content = document.createElement('div')
  // The host renders the close button as a direct child of the content header,
  // with the action seat in a nested element; the engine's structural fallback
  // relies on that, so the fixture mirrors it.
  const header = document.createElement('div')
  const actions = document.createElement('div')
  const actionButton = document.createElement('button')
  actionButton.textContent = '重置'
  actions.append(actionButton)
  const closeButton = document.createElement('button')
  closeButton.textContent = '关闭'
  header.append(actions, closeButton)
  content.append(header)
  dialog.append(nav, content)
  overlay.append(mask, dialog)
  document.body.append(overlay)
  return { overlay, dialog, content, navButton, closeButton, actionButton, mask }
}

describe('installSettingsMotion', () => {
  it('marks the settings dialog with the entrance class', async () => {
    const h = harness()
    const handle = installSettingsMotion(h.options)
    const { dialog } = mountDialog()
    await flushObserver()
    expect(dialog.classList.contains(SETTINGS_PANEL_CLASS)).toBe(true)
    handle.dispose()
  })

  it('ignores modal dialogs that own no nav rail', async () => {
    const h = harness()
    const handle = installSettingsMotion(h.options)
    const plain = document.createElement('div')
    plain.setAttribute('role', 'dialog')
    plain.setAttribute('aria-modal', 'true')
    document.body.append(plain)
    await flushObserver()
    expect(plain.classList.contains(SETTINGS_PANEL_CLASS)).toBe(false)
    handle.dispose()
  })

  it('replays the page cross-fade when the active nav row changes', async () => {
    const h = harness()
    const handle = installSettingsMotion(h.options)
    const { content, navButton } = mountDialog()
    await flushObserver()
    expect(content.classList.contains(SETTINGS_PAGE_CLASS)).toBe(false)
    navButton.setAttribute('aria-current', 'false')
    await flushObserver()
    expect(content.classList.contains(SETTINGS_PAGE_CLASS)).toBe(true)
    handle.dispose()
  })

  it('drops the classes when the toggle turns off and re-applies on re-enable', async () => {
    const h = harness()
    const handle = installSettingsMotion(h.options)
    const { dialog, content } = mountDialog()
    await flushObserver()
    expect(dialog.classList.contains(SETTINGS_PANEL_CLASS)).toBe(true)
    h.setEnabled(false)
    expect(dialog.classList.contains(SETTINGS_PANEL_CLASS)).toBe(false)
    h.setEnabled(true)
    expect(dialog.classList.contains(SETTINGS_PANEL_CLASS)).toBe(true)
    expect(content.classList.contains(SETTINGS_PAGE_CLASS)).toBe(true)
    handle.dispose()
  })

  it('leaves the dialog alone while the toggle is off at mount', async () => {
    const h = harness(false)
    const handle = installSettingsMotion(h.options)
    const { dialog } = mountDialog()
    await flushObserver()
    expect(dialog.classList.contains(SETTINGS_PANEL_CLASS)).toBe(false)
    handle.dispose()
  })

  it('shrinks the live panel before letting a close-button click through', async () => {
    const h = harness()
    const handle = installSettingsMotion(h.options)
    const { dialog, closeButton } = mountDialog()
    await flushObserver()
    let closed = false
    closeButton.addEventListener('click', () => { closed = true })

    closeButton.click()
    // The host's own handler is held back until the exit settles, so the
    // user sees the real panel shrink instead of a detached clone.
    expect(dialog.classList.contains(SETTINGS_CLOSING_CLASS)).toBe(true)
    expect(closed).toBe(false)

    await new Promise((resolve) => { setTimeout(resolve, 360) })
    expect(closed).toBe(true)
    handle.dispose()
  })

  it('does not treat a nested header button as the close control', async () => {
    const h = harness()
    const handle = installSettingsMotion(h.options)
    const { dialog, actionButton } = mountDialog()
    await flushObserver()
    // The action seat is nested inside the header: only a DIRECT child button
    // is the close control, so this click must not start the exit.
    actionButton.click()
    expect(dialog.classList.contains(SETTINGS_CLOSING_CLASS)).toBe(false)
    handle.dispose()
  })

  it('recognises the header close button even when its label is not a close word', async () => {
    const h = harness()
    const handle = installSettingsMotion(h.options)
    const { dialog, closeButton } = mountDialog()
    await flushObserver()
    // A label the text heuristic cannot match: only the header position saves it.
    closeButton.textContent = '×'
    let closed = false
    closeButton.addEventListener('click', () => { closed = true })

    closeButton.click()
    expect(dialog.classList.contains(SETTINGS_CLOSING_CLASS)).toBe(true)
    await new Promise((resolve) => { setTimeout(resolve, 360) })
    expect(closed).toBe(true)
    handle.dispose()
  })

  it('lets Escape through to an open menu instead of closing the panel', async () => {
    const h = harness()
    const handle = installSettingsMotion(h.options)
    const { dialog } = mountDialog()
    await flushObserver()
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.append(menu)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(dialog.classList.contains(SETTINGS_CLOSING_CLASS)).toBe(false)
    handle.dispose()
  })

  it('lets a mask click through while a menu is open', async () => {
    const h = harness()
    const handle = installSettingsMotion(h.options)
    const { dialog, mask } = mountDialog()
    await flushObserver()
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.append(menu)

    mask.click()
    expect(dialog.classList.contains(SETTINGS_CLOSING_CLASS)).toBe(false)
    handle.dispose()
  })

  it('leaves the panel alone when a non-close button is clicked', async () => {
    const h = harness()
    const handle = installSettingsMotion(h.options)
    const { dialog, navButton } = mountDialog()
    await flushObserver()
    navButton.click()
    expect(dialog.classList.contains(SETTINGS_CLOSING_CLASS)).toBe(false)
    handle.dispose()
  })

  it('shrinks the panel on Escape before the host closes it', async () => {
    const h = harness()
    const handle = installSettingsMotion(h.options)
    const { dialog } = mountDialog()
    await flushObserver()
    let escaped = false
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') escaped = true })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(dialog.classList.contains(SETTINGS_CLOSING_CLASS)).toBe(true)
    expect(escaped).toBe(false)

    await new Promise((resolve) => { setTimeout(resolve, 360) })
    expect(escaped).toBe(true)
    handle.dispose()
  })

  it('shrinks the panel on a mask click before the host closes it', async () => {
    const h = harness()
    const handle = installSettingsMotion(h.options)
    const { dialog, mask } = mountDialog()
    await flushObserver()
    let closed = false
    mask.addEventListener('click', () => { closed = true })

    mask.click()
    expect(dialog.classList.contains(SETTINGS_CLOSING_CLASS)).toBe(true)

    await new Promise((resolve) => { setTimeout(resolve, 360) })
    expect(closed).toBe(true)
    handle.dispose()
  })

  it('skips the exit while the toggle is off', async () => {
    const h = harness()
    const handle = installSettingsMotion(h.options)
    const { dialog, closeButton } = mountDialog()
    await flushObserver()
    h.setEnabled(false)
    let closed = false
    closeButton.addEventListener('click', () => { closed = true })

    closeButton.click()
    expect(dialog.classList.contains(SETTINGS_CLOSING_CLASS)).toBe(false)
    expect(closed).toBe(true)
    handle.dispose()
  })

  it('anchors the scale to the pressed trigger button', async () => {
    const h = harness()
    const handle = installSettingsMotion(h.options)
    const trigger = document.createElement('button')
    trigger.setAttribute('aria-haspopup', 'dialog')
    document.body.append(trigger)
    trigger.getBoundingClientRect = () => rect(900, 700, 40, 40)
    trigger.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    const { dialog } = mountDialog()
    dialog.getBoundingClientRect = () => rect(100, 100, 800, 800)
    await flushObserver()
    expect(dialog.style.getPropertyValue('--dsu-settings-origin-x')).toBe('820px')
    expect(dialog.style.getPropertyValue('--dsu-settings-origin-y')).toBe('620px')
    handle.dispose()
  })

  it('falls back to the shell trigger when nothing was pressed', async () => {
    const h = harness()
    const handle = installSettingsMotion(h.options)
    const trigger = document.createElement('button')
    trigger.setAttribute('aria-haspopup', 'dialog')
    document.body.append(trigger)
    trigger.getBoundingClientRect = () => rect(0, 0, 20, 20)
    const { dialog } = mountDialog()
    dialog.getBoundingClientRect = () => rect(0, 0, 800, 800)
    await flushObserver()
    expect(dialog.style.getPropertyValue('--dsu-settings-origin-x')).toBe('10px')
    expect(dialog.style.getPropertyValue('--dsu-settings-origin-y')).toBe('10px')
    handle.dispose()
  })

  it('removes the classes and stops observing on dispose', async () => {
    const h = harness()
    const handle = installSettingsMotion(h.options)
    const { dialog } = mountDialog()
    await flushObserver()
    expect(dialog.classList.contains(SETTINGS_PANEL_CLASS)).toBe(true)
    handle.dispose()
    expect(dialog.classList.contains(SETTINGS_PANEL_CLASS)).toBe(false)
  })

  // 本插件把引擎接到功能开关上：任一开关翻转都会先卸载再重装引擎，因此
  // "退出动画进行中引擎被卸载"是本整合的常态路径，而不是上游的极端情况。
  // 关闭事件此时已被拦截（preventDefault + stopImmediatePropagation），必须
  // 补发，否则设置面板停在缩回态且点不动。
  it('still delivers the close-button click when the engine is disposed mid-exit', async () => {
    const h = harness()
    const handle = installSettingsMotion(h.options)
    const { dialog, closeButton } = mountDialog()
    await flushObserver()
    let closed = false
    closeButton.addEventListener('click', () => { closed = true })

    closeButton.click()
    expect(dialog.classList.contains(SETTINGS_CLOSING_CLASS)).toBe(true)
    handle.dispose()
    await new Promise((resolve) => { setTimeout(resolve, 360) })
    expect(closed).toBe(true)
    expect(dialog.classList.contains(SETTINGS_CLOSING_CLASS)).toBe(false)
  })

  it('still delivers a mask click when the engine is disposed mid-exit', async () => {
    const h = harness()
    const handle = installSettingsMotion(h.options)
    const { mask } = mountDialog()
    await flushObserver()
    let closed = false
    mask.addEventListener('click', () => { closed = true })

    mask.click()
    handle.dispose()
    await new Promise((resolve) => { setTimeout(resolve, 360) })
    expect(closed).toBe(true)
  })
})
