// @vitest-environment jsdom
/**
 * animate.ts 的入场原语。这些行为都直接决定用户看到什么：关掉动效后是否还位移、
 * 快速重放是否叠加、面板退出时较长的过渡是否被截断。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  canAnimate,
  prefersReducedMotion,
  reducedFrames,
  replayEntrance,
  whenTransitionSettles,
} from '../src/client/motion/animate.ts'

const FRAMES: Keyframe[] = [
  { opacity: 0, translate: '0 8px' },
  { opacity: 1, translate: '0 0' },
]

interface AnimateCall {
  frames: Keyframe[]
  options: KeyframeAnimationOptions
}

/** animate() 的替身：jsdom 没有 WAAPI，记录收到的帧与参数，并返回可观察的 Animation。 */
function stubAnimate(el: HTMLElement): { calls: AnimateCall[]; cancels: Array<ReturnType<typeof vi.fn>> } {
  const calls: AnimateCall[] = []
  const cancels: Array<ReturnType<typeof vi.fn>> = []
  ;(el as unknown as { animate: unknown }).animate = (
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) => {
    calls.push({ frames: frames.map(frame => ({ ...frame })), options })
    const cancel = vi.fn()
    cancels.push(cancel)
    return { cancel, playState: 'running' }
  }
  return { calls, cancels }
}

function setReducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

/** 观察一个 promise 是否已经落定（微任务队列排空后再读）。 */
function track(promise: Promise<void>): { state: { done: boolean }; flush: () => Promise<void> } {
  const state = { done: false }
  void promise.then(() => {
    state.done = true
  })
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 3; i += 1) await Promise.resolve()
  }
  return { state, flush }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('canAnimate', () => {
  it('is false where the element has no WAAPI', () => {
    expect(canAnimate(document.createElement('div'))).toBe(false)
  })

  it('is true once the element can animate', () => {
    const el = document.createElement('div')
    stubAnimate(el)
    expect(canAnimate(el)).toBe(true)
  })
})

describe('prefersReducedMotion', () => {
  it('is false when the platform has no matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(prefersReducedMotion()).toBe(false)
  })

  it('follows the platform preference', () => {
    setReducedMotion(true)
    expect(prefersReducedMotion()).toBe(true)
    setReducedMotion(false)
    expect(prefersReducedMotion()).toBe(false)
  })
})

describe('reducedFrames', () => {
  it('keeps only opacity, so nothing travels', () => {
    expect(reducedFrames(FRAMES)).toEqual([{ opacity: 0 }, { opacity: 1 }])
  })

  it('defaults a frame without opacity to fully visible', () => {
    expect(reducedFrames([{ translate: '0 8px' }])).toEqual([{ opacity: 1 }])
  })
})

describe('replayEntrance', () => {
  it('returns null where the environment cannot animate', () => {
    expect(replayEntrance(document.createElement('div'), FRAMES, { duration: 100 })).toBeNull()
  })

  it('holds the start frame across a stagger delay', () => {
    const el = document.createElement('div')
    const rec = stubAnimate(el)
    replayEntrance(el, FRAMES, { duration: 240, delay: 70 })
    expect(rec.calls[0]?.options).toMatchObject({ fill: 'backwards', duration: 240, delay: 70 })
    expect(rec.calls[0]?.frames).toEqual(FRAMES)
  })

  it('cancels the previous entrance so a replay retargets instead of stacking', () => {
    const el = document.createElement('div')
    const rec = stubAnimate(el)
    replayEntrance(el, FRAMES, { duration: 100 })
    replayEntrance(el, FRAMES, { duration: 100 })
    expect(rec.cancels[0]).toHaveBeenCalledTimes(1)
    expect(rec.cancels[1]).not.toHaveBeenCalled()
    expect(rec.calls).toHaveLength(2)
  })

  it('leaves entrances on other elements alone', () => {
    const first = document.createElement('div')
    const second = document.createElement('div')
    const recA = stubAnimate(first)
    const recB = stubAnimate(second)
    replayEntrance(first, FRAMES, { duration: 100 })
    replayEntrance(second, FRAMES, { duration: 100 })
    expect(recA.cancels[0]).not.toHaveBeenCalled()
    expect(recB.cancels[0]).not.toHaveBeenCalled()
  })

  it('drops travel under reduced motion but still plays', () => {
    setReducedMotion(true)
    const el = document.createElement('div')
    const rec = stubAnimate(el)
    const animation = replayEntrance(el, FRAMES, { duration: 100 })
    expect(animation).not.toBeNull()
    expect(rec.calls[0]?.frames).toEqual([{ opacity: 0 }, { opacity: 1 }])
  })
})

describe('whenTransitionSettles', () => {
  it('ignores a transitionend bubbling up from a descendant', async () => {
    const el = document.createElement('div')
    el.append(document.createElement('span'))
    const t = track(whenTransitionSettles(el, 5000))
    el.firstElementChild?.dispatchEvent(new Event('transitionend', { bubbles: true }))
    await t.flush()
    expect(t.state.done).toBe(false)
    el.dispatchEvent(new Event('transitionend'))
    await t.flush()
    expect(t.state.done).toBe(true)
  })

  it('keeps waiting while a longer transition on the same element is still running', async () => {
    const el = document.createElement('div')
    let animations: Array<{ playState: string }> = [{ playState: 'running' }]
    ;(el as unknown as { getAnimations: unknown }).getAnimations = () => animations
    const t = track(whenTransitionSettles(el, 5000))
    // 面板退出是 opacity 160ms + scale 280ms：最短那条结束时不能放行。
    el.dispatchEvent(new Event('transitionend'))
    await t.flush()
    expect(t.state.done).toBe(false)
    animations = [{ playState: 'finished' }]
    el.dispatchEvent(new Event('transitionend'))
    await t.flush()
    expect(t.state.done).toBe(true)
  })

  it('treats a throwing getAnimations as settled', async () => {
    const el = document.createElement('div')
    ;(el as unknown as { getAnimations: unknown }).getAnimations = () => {
      throw new Error('not supported')
    }
    const t = track(whenTransitionSettles(el, 5000))
    el.dispatchEvent(new Event('transitionend'))
    await t.flush()
    expect(t.state.done).toBe(true)
  })

  it('falls back to the timeout when nothing ever fires', async () => {
    vi.useFakeTimers()
    const el = document.createElement('div')
    const t = track(whenTransitionSettles(el, 400))
    await vi.advanceTimersByTimeAsync(399)
    expect(t.state.done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(t.state.done).toBe(true)
  })

  it('stops listening once it settles', async () => {
    const el = document.createElement('div')
    const remove = vi.spyOn(el, 'removeEventListener')
    const t = track(whenTransitionSettles(el, 5000))
    el.dispatchEvent(new Event('transitionend'))
    await t.flush()
    expect(remove).toHaveBeenCalledWith('transitionend', expect.any(Function))
  })
})
