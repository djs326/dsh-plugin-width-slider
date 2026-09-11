// @vitest-environment jsdom
/**
 * Impact channel (shake): the guards that keep it from running where it cannot
 * animate or where the user asked for reduced motion. The amplitude arithmetic is
 * exercised in the live browser, whose WAAPI jsdom does not provide.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { shakeElement } from '../src/client/motion/animate.ts'

/** Let one animation frame pass. */
const frame = (): Promise<void> => new Promise((resolve) => { requestAnimationFrame(() => resolve()) })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('shakeElement', () => {
  it('runs without throwing where a frame loop exists', async () => {
    expect(() => shakeElement(document.createElement('div'), 3, 200)).not.toThrow()
    await frame()
  })

  it('does nothing under reduced motion', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
    const el = document.createElement('div')
    shakeElement(el, 3, 200)
    await frame()
    expect(el.style.translate).toBe('')
  })

  it('does nothing without requestAnimationFrame', () => {
    // Server-side rendering and any non-visual environment must stay a no-op.
    vi.stubGlobal('requestAnimationFrame', undefined)
    expect(() => shakeElement(document.createElement('div'), 3, 200)).not.toThrow()
  })

  it('keeps each axis inside the requested amplitude', async () => {
    const el = document.createElement('div')
    shakeElement(el, 4, 200)
    await frame()
    const axes = el.style.translate.split(' ').map((part) => Math.abs(Number.parseFloat(part)))
    expect(axes).toHaveLength(2)
    expect(Math.max(...axes)).toBeGreaterThan(0)
    expect(Math.max(...axes)).toBeLessThanOrEqual(4.01)
  })

  it('does not amplify the amplitude when a longer impact is absorbed', async () => {
    const el = document.createElement('div')
    shakeElement(el, 2, 60)
    // 吸收分支会延长 end；衰减的分母必须跟着走 —— 原先用首次调用的 duration，会算出
    // decay > 1 并把振幅放大到超过传入值。
    shakeElement(el, 2, 300)
    await frame()
    const axes = el.style.translate.split(' ').map((part) => Math.abs(Number.parseFloat(part)))
    expect(Math.max(...axes)).toBeLessThanOrEqual(2.01)
  })
})
