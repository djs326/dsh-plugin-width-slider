// @vitest-environment jsdom
/**
 * Width-slider keyboard path: the track is a real slider control (role + aria value)
 * and the arrow keys land through the same publish+persist path a pointer gesture
 * uses, so keyboard and mouse cannot drift apart.
 */
import { createElement as h } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/client/widthPrefs.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/widthPrefs.ts')>()
  return {
    ...actual,
    // jsdom has no layout: pin the column so `max` (column - EDGE_BUDGET) is predictable.
    readColumnWidth: () => 1200,
  }
})

import { WidthSliderControl } from '../src/client/WidthSliderControl.tsx'
import { MIN_WIDTH, WIDTH_PREF_KEY } from '../src/client/widthPrefs.ts'

/** Stand-in for the locale seat: keys come back verbatim. */
const t = (key: string): string => key

const COLUMN = 1200
const MAX = COLUMN - 176

let root: Root | null = null
let container: HTMLElement | null = null

beforeEach(() => {
  window.localStorage.clear()
  document.body.replaceChildren()
  // `readColumnWidth` walks [data-phase] roots; the column width itself is mocked.
  const conversationRoot = document.createElement('div')
  conversationRoot.setAttribute('data-phase', '')
  document.body.appendChild(conversationRoot)
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  const mounted = root
  if (mounted !== null) act(() => { mounted.unmount() })
  root = null
  container = null
})

/** Mount the control and return its slider track. */
async function mount(): Promise<HTMLElement> {
  const host = container as HTMLElement
  root = createRoot(host)
  const mounted = root
  await act(async () => {
    mounted.render(h(WidthSliderControl as never, { t }))
  })
  const track = host.querySelector<HTMLElement>('[role="slider"]')
  expect(track).not.toBeNull()
  return track as HTMLElement
}

/** Press one key on the track; resolves with the persisted width. */
async function press(track: HTMLElement, key: string, shiftKey = false): Promise<number> {
  await act(async () => {
    track.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }))
  })
  return Number(window.localStorage.getItem(WIDTH_PREF_KEY))
}

const ariaValue = (track: HTMLElement): number => Number(track.getAttribute('aria-valuenow'))

describe('width slider keyboard path', () => {
  it('exposes the track as a slider with a live value', async () => {
    const track = await mount()
    expect(track.getAttribute('role')).toBe('slider')
    expect(track.tabIndex).toBe(0)
    expect(Number(track.getAttribute('aria-valuemin'))).toBe(MIN_WIDTH)
    expect(Number(track.getAttribute('aria-valuemax'))).toBe(MAX)
    expect(ariaValue(track)).toBeGreaterThanOrEqual(MIN_WIDTH)
  })

  it('steps and persists with the arrow keys', async () => {
    const track = await mount()
    const start = ariaValue(track)
    expect(await press(track, 'ArrowRight')).toBe(start + 1)
    expect(await press(track, 'ArrowLeft')).toBe(start)
    expect(await press(track, 'ArrowRight', true)).toBe(start + 10)
    // The aria value follows the same steps.
    expect(ariaValue(track)).toBe(start + 10)
  })

  it('jumps to the ends with Home and End, clamped to the range', async () => {
    const track = await mount()
    expect(await press(track, 'End')).toBe(MAX)
    expect(await press(track, 'Home')).toBe(MIN_WIDTH)
    // Already at the low end: further steps must not go below the minimum.
    expect(await press(track, 'ArrowLeft')).toBe(MIN_WIDTH)
  })

  it('ignores keys it does not own', async () => {
    const track = await mount()
    const start = ariaValue(track)
    await act(async () => {
      track.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    })
    expect(window.localStorage.getItem(WIDTH_PREF_KEY)).toBeNull()
    expect(ariaValue(track)).toBe(start)
  })
})
