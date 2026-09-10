// @vitest-environment jsdom
/**
 * Text-block reveal: the wipe is timed from the block's own box, bounded at both
 * ends, and never throws where the Web Animations API is missing.
 */
import { describe, expect, it } from 'vitest'
import { revealTextBlock } from '../src/client/motion/animate.ts'

/** Stub the one measurement the timing reads (jsdom has no layout). */
function withHeight(el: HTMLElement, height: number): HTMLElement {
  el.getBoundingClientRect = () => ({ height, width: 100, top: 0, left: 0, right: 100, bottom: height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  return el
}

describe('revealTextBlock', () => {
  it('reports the wipe duration it ran', () => {
    expect(revealTextBlock(document.createElement('div'))).toBeGreaterThan(0)
  })

  it('prints a long block for longer than a short one', () => {
    const short = withHeight(document.createElement('div'), 20)
    const long = withHeight(document.createElement('div'), 400)
    expect(revealTextBlock(long)).toBeGreaterThan(revealTextBlock(short))
  })

  it('never runs past the upper bound', () => {
    expect(revealTextBlock(withHeight(document.createElement('div'), 20_000), { maxMs: 500 })).toBe(500)
  })

  it('never runs under the lower bound', () => {
    expect(revealTextBlock(withHeight(document.createElement('div'), 20), { perLineMs: 1, minMs: 300 })).toBe(300)
  })

  it('keeps the delay out of the duration', () => {
    // The delay is the surface entrance's tail; folding it into the wipe would
    // make the wipe itself slower than the box justifies.
    expect(revealTextBlock(withHeight(document.createElement('div'), 20), { delayMs: 120, minMs: 200 })).toBe(200)
  })

  it('never throws where the Web Animations API is missing', () => {
    expect(() => revealTextBlock(document.createElement('div'))).not.toThrow()
  })
})
