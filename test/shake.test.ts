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
})
