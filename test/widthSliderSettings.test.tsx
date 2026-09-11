// @vitest-environment jsdom
/**
 * 设置页。断言落在用户可见后果上：开关真的生效并落盘、开关关着时相关控件不可点、
 * 「恢复默认」清掉宽度与弹窗记忆后才刷新、连点开关不会用旧配置覆盖新配置。
 * 滑块本身由 WidthSliderControl 自己的套件覆盖，这里只关心设置页的编排。
 */
import { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cfg = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  listeners: new Set<(next: Record<string, unknown>) => void>(),
}))

vi.mock('../src/client/config.ts', () => ({
  getSettings: () => cfg.current,
  applySettings: (next: Record<string, unknown>) => {
    cfg.current = next
    for (const listener of cfg.listeners) listener(next)
  },
  onSettingsChanged: (listener: (next: Record<string, unknown>) => void) => {
    cfg.listeners.add(listener)
    return () => {
      cfg.listeners.delete(listener)
    }
  },
}))

vi.mock('../src/client/WidthSliderControl.tsx', () => ({ WidthSliderControl: () => null }))

import { WidthSliderSettings } from '../src/client/WidthSliderSettings.tsx'
import { DEFAULT_FEATURE_SETTINGS } from '../src/shared/settings.ts'

const RECT_KEY = 'dsh.conversation.settingsPanelWindow'
const WIDTH_KEY = 'dsh.conversation.contentWidth'

let roots: Root[] = []
let reload: ReturnType<typeof vi.fn>

async function renderSettings(
  overrides: Record<string, unknown> = {},
): Promise<{ container: HTMLElement; writeSettings: ReturnType<typeof vi.fn> }> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  const writeSettings = vi.fn(async () => {})
  await act(async () => {
    root.render(
      createElement(WidthSliderSettings, {
        writeSettings,
        t: (key: string) => key,
        ...overrides,
      } as never),
    )
  })
  return { container, writeSettings }
}

const toggle = (container: HTMLElement, id: string): HTMLInputElement => {
  const el = container.querySelector<HTMLInputElement>(`#dsh-plugin-width-slider-${id}`)
  if (el === null) throw new Error(`missing switch ${id}`)
  return el
}

beforeEach(() => {
  cfg.current = { ...DEFAULT_FEATURE_SETTINGS }
  cfg.listeners.clear()
  localStorage.clear()
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  reload = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  })
})

afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount())
  roots = []
  document.body.innerHTML = ''
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('渲染', () => {
  it('renders the page head and every group', async () => {
    const { container } = await renderSettings()
    expect(container.querySelector('.dsws-page-title')?.textContent).toBe('pageTitle')
    // 宽度 / 思考与输出 / 动效 / 界面
    expect(container.querySelectorAll('.dsws-group')).toHaveLength(4)
  })

  it('disables the think-mode segmented control while think rendering is off', async () => {
    cfg.current = { ...DEFAULT_FEATURE_SETTINGS, thinkRender: false }
    const { container } = await renderSettings()
    const seg = container.querySelector('.dsws-seg')
    expect(seg?.classList.contains('is-disabled')).toBe(true)
    for (const button of Array.from(seg?.querySelectorAll('button') ?? [])) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('disables a style select while its motion toggle is off', async () => {
    cfg.current = { ...DEFAULT_FEATURE_SETTINGS, motionEnabled: false }
    const { container } = await renderSettings()
    const select = container.querySelector<HTMLSelectElement>('.dsws-select')
    expect(select?.disabled).toBe(true)
  })
})

describe('改动落盘', () => {
  it('applies a toggle to the store and writes it back', async () => {
    const { container, writeSettings } = await renderSettings()
    const sw = toggle(container, 'enable-think')
    const before = sw.checked
    await act(async () => {
      sw.click()
    })
    expect(cfg.current.thinkRender).toBe(!before)
    expect(writeSettings).toHaveBeenCalledTimes(1)
    expect((writeSettings.mock.calls[0]?.[0] as Record<string, unknown>).thinkRender).toBe(!before)
  })

  it('writes only the newest snapshot when toggles come in fast', async () => {
    const { container, writeSettings } = await renderSettings()
    const think = toggle(container, 'enable-think')
    const chinese = toggle(container, 'enable-chinese')
    // 同步 act：两次改动都赶在第一个写盘链节执行之前入队，中间那份必须被判为过期。
    act(() => {
      think.click()
    })
    act(() => {
      chinese.click()
    })
    await act(async () => {})
    expect(writeSettings).toHaveBeenCalledTimes(1)
    const last = writeSettings.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(last.thinkRender).toBe(!DEFAULT_FEATURE_SETTINGS.thinkRender)
    expect(last.chinesePrompt).toBe(!DEFAULT_FEATURE_SETTINGS.chinesePrompt)
  })

  it('applies a whole preset in one go', async () => {
    const { container } = await renderSettings()
    const presetButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('.dsws-seg button'))
    // 最后一组是预设按钮（fluid / elegant / minimal）。
    const elegant = presetButtons.at(-2)
    await act(async () => {
      elegant?.click()
    })
    expect(cfg.current.motionStyle).toBe('blur-in')
    expect(cfg.current.sidebarMotionStyle).toBe('fade')
    expect(cfg.current.newChatMotionStyle).toBe('bloom')
  })
})

describe('恢复默认', () => {
  it('clears the width and panel memory, then reloads after the write settles', async () => {
    localStorage.setItem(WIDTH_KEY, '1120')
    localStorage.setItem(RECT_KEY, JSON.stringify({ w: 900, h: 600, auto: false }))
    const { container, writeSettings } = await renderSettings()
    const reset = container.querySelector<HTMLButtonElement>('.dsws-ghost')
    await act(async () => {
      reset?.click()
    })
    await act(async () => {})
    expect(localStorage.getItem(WIDTH_KEY)).toBeNull()
    // 弹窗记忆也要清：否则刷新后弹窗又被套回旧尺寸。
    expect(localStorage.getItem(RECT_KEY)).toBeNull()
    expect(writeSettings).toHaveBeenCalledWith({ ...DEFAULT_FEATURE_SETTINGS })
    // 先写回再刷新：刷新会打断在途写盘，刷新后仍旧读回旧配置。
    expect(reload).toHaveBeenCalled()
  })
})
