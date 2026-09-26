import { EASE_GLIDE, replayEntrance } from './waapi.ts'

/**
 * The wipe: the block is clipped to nothing and rises 4px, then the clip opens
 * bottom-up while the block lands. Opacity arrives on a shorter curve (0.4 start,
 * not 0) so the text is never fully invisible mid-wipe - a clip alone can look
 * like a rendering artifact on a slow frame. On a multi-line block the clip
 * sweeps the box from its first line to its last, which is what reads as text
 * being printed rather than pasted in.
 */
const TEXT_REVEAL_FRAMES: readonly Keyframe[] = [
  { clipPath: 'inset(0 0 100% 0)', opacity: 0.4, translate: '0 4px' },
  { clipPath: 'inset(0 0 0% 0)', opacity: 1, translate: '0 0' },
]

/** Timing for one block's reveal. */
export interface TextRevealOptions {
  /** How fast one line is wiped in (ms per line). */
  perLineMs?: number
  /** Lower bound on the wipe (ms). */
  minMs?: number
  /** Upper bound on the wipe (ms): a long block must not crawl. */
  maxMs?: number
  /** Delay before the wipe starts (ms). */
  delayMs?: number
}

/**
 * Reveal one text block line by line under a clip mask. Belongs to text that
 * appears ONCE - a thought body being expanded, a welcome headline - because text
 * the user is already reading must never be re-revealed.
 *
 * The wipe is timed from the block's own box: the line count is estimated from
 * its rendered height and its line-height, so a long thought prints slowly and a
 * two-line block does not crawl. Where there is no layout (jsdom) it degrades to
 * the lower bound, and without WAAPI it is a no-op that still reports the timing.
 * @param el - the block to reveal.
 * @param options - timing overrides.
 * @returns the wipe duration in ms.
 */
export function revealTextBlock(el: HTMLElement, options: TextRevealOptions = {}): number {
  const perLineMs = options.perLineMs ?? 70
  const minMs = options.minMs ?? 260
  const maxMs = options.maxMs ?? 900
  const computed = typeof getComputedStyle === 'function' ? getComputedStyle(el).lineHeight : ''
  const lineHeight = Number.parseFloat(computed) || 20
  const height = el.getBoundingClientRect().height || lineHeight
  const lines = Math.max(1, Math.round(height / lineHeight))
  const durationMs = Math.min(Math.max(lines * perLineMs, minMs), maxMs)
  replayEntrance(el, TEXT_REVEAL_FRAMES, {
    duration: durationMs,
    easing: EASE_GLIDE,
    delay: options.delayMs ?? 0,
  })
  return durationMs
}
