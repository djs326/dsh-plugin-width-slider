// @vitest-environment jsdom
/**
 * Width preferences: the publish/persist pair, and the start-up restore that used to
 * be the reason a saved width only took effect after opening the settings page —
 * follow mode starts a live watcher, a fixed width lands once a conversation root
 * exists (now or later), and the returned disposer really detaches both.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FOLLOW_PREF_KEY, MIN_WIDTH, WIDTH_PREF_KEY, applySavedWidth, persistFollowPreference, persistWidth,
  publishChatWidth, readFollowPreference, readPreference,
} from '../src/client/widthPrefs.ts'

const WIDTH_VAR = '--dsh-chat-user-width'

/** Add a conversation root and return its inline width var. */
function addRoot(): string {
  const el = document.createElement('div')
  el.setAttribute('data-phase', '')
  document.body.appendChild(el)
  return el.style.getPropertyValue(WIDTH_VAR)
}

/** One macrotask turn, enough for the observer + rAF pair to settle. */
const settle = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 20) })

beforeEach(() => {
  window.localStorage.clear()
  document.body.replaceChildren()
  // jsdom has no ResizeObserver; the follow watcher only needs an observable stub.
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const rootWidth = (index = 0): string =>
  document.querySelectorAll<HTMLElement>('[data-phase]')[index]?.style.getPropertyValue(WIDTH_VAR) ?? ''

describe('width preferences', () => {
  it('publishes the clamped width to every conversation root', () => {
    const el = document.createElement('div')
    el.setAttribute('data-phase', '')
    document.body.appendChild(el)
    const other = document.createElement('div')
    other.setAttribute('data-phase', '')
    document.body.appendChild(other)

    publishChatWidth(100) // below the floor
    expect(rootWidth(0)).toBe(`${MIN_WIDTH}px`)
    expect(rootWidth(1)).toBe(`${MIN_WIDTH}px`)

    publishChatWidth(912)
    expect(rootWidth(0)).toBe('912px')
    expect(rootWidth(1)).toBe('912px')
  })

  it('round-trips both stored preferences and ignores junk', () => {
    expect(readPreference()).toBeNull()
    expect(readFollowPreference()).toBe(false)

    persistWidth(848)
    expect(readPreference()).toBe(848)
    persistFollowPreference(true)
    expect(readFollowPreference()).toBe(true)
    persistFollowPreference(false)
    expect(readFollowPreference()).toBe(false)

    window.localStorage.setItem(WIDTH_PREF_KEY, 'not-a-number')
    expect(readPreference()).toBeNull()
  })

  it('restores a fixed width as soon as a root exists', () => {
    persistWidth(900)
    addRoot()
    applySavedWidth()
    expect(rootWidth()).toBe('900px')
  })

  it('waits for the conversation root when it is not mounted yet', async () => {
    persistWidth(880)
    const dispose = applySavedWidth()
    // 没有根：先不动
    expect(document.querySelectorAll('[data-phase]')).toHaveLength(0)
    addRoot()
    await settle()
    expect(rootWidth()).toBe('880px')
    dispose()
  })

  it('starts the follow watcher in follow mode and detaches on dispose', async () => {
    addRoot()
    persistFollowPreference(true)
    const dispose = applySavedWidth()
    // 跟随模式把内容宽度钉在当前列宽；jsdom 没有布局（根的 offsetWidth 为 0），于是
    // 落到下限 —— 这条断言验证的是「钉住」这条路径确实跑了，而不是具体列宽数值。
    expect(rootWidth()).toBe(`${MIN_WIDTH}px`)

    dispose()
    const el = document.querySelector<HTMLElement>('[data-phase]')
    el?.style.removeProperty(WIDTH_VAR)
    // 卸载后窗口变化不再改写宽度：监听确实被摘掉了
    window.dispatchEvent(new Event('resize'))
    await settle()
    expect(rootWidth()).toBe('')
  })

  it('does nothing when no preference is stored', () => {
    addRoot()
    const dispose = applySavedWidth()
    expect(rootWidth()).toBe('')
    dispose()
    expect(FOLLOW_PREF_KEY).toBe('dsh.conversation.contentWidthFollow')
  })
})
