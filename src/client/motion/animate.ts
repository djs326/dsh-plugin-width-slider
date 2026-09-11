/**
 * Imperative animation primitives shared by the motion engines.
 *
 * The engines run outside React: they observe host markup and mark it, and they
 * cannot re-render a component to replay an entrance. Every entrance is
 * therefore imperative, because a CSS @starting-style transition only fires on
 * an element's FIRST style resolution - and the host forces one while it mounts
 * a row or a panel (layout effects, scroll-into-view, measurement) before the
 * observer microtask can mark the element.
 *
 * Every helper degrades to a no-op where the environment has no Web Animations
 * API (jsdom), so the engines stay testable through their class markers.
 */

/** Easing shared with motion.module.css: fast start, long settle. */
export const EASE_GLIDE = 'cubic-bezier(0.22, 1, 0.36, 1)'
/** Easing for opacity-only work. */
export const EASE_FADE = 'cubic-bezier(0.33, 1, 0.68, 1)'
/**
 * Landing curves written with `linear()`, because `cubic-bezier()` cannot
 * overshoot and settle.
 *
 * EASE_SETTLE is the reference spring-settle curve (3% peak) for travel and
 * scale entrances that arrive repeatedly - a row settles instead of stopping
 * dead, without turning into jitter. EASE_SPRING is sampled from an underdamped
 * response `1 - e^(-zeta*w*t) * (cos(wd*t) + (zeta*w/wd) * sin(wd*t))` at
 * zeta 0.62 (~8% peak): it belongs to low-frequency surfaces (the settings
 * panel, a welcome screen) where visible weight reads as quality and there is
 * no repetition to make it noisy. Opacity-only work keeps EASE_FADE, since an
 * overshooting alpha flickers.
 */
export const EASE_SETTLE = 'linear(0, 0.32 8%, 0.79 20%, 1.03 30%, 1.01 46%, 1)'
export const EASE_SPRING =
  'linear(0, 0.108 7.1%, 0.338 14.3%, 0.588 21.4%, 0.8 28.6%, 0.95 35.7%, 1.038 42.9%, 1.077 50%, 1.083 57.1%, 1.069 64.3%, 1.049 71.4%, 1.029 78.6%, 1.012 85.7%, 1.001 92.9%, 1)'

/** Whether the element can run an imperative animation here. */
export function canAnimate(el: Element): boolean {
  return typeof (el as HTMLElement).animate === 'function'
}

/** Whether the user asked the platform for reduced motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Pure: the reduced-motion variant of an entrance - opacity only. */
export function reducedFrames(frames: readonly Keyframe[]): Keyframe[] {
  return frames.map(frame => ({ opacity: frame.opacity ?? 1 }))
}

/** The entrance each element is currently running, so a replay replaces it. */
const RUNNING = new WeakMap<Element, Animation>()

/**
 * Play an entrance on an element. A previous entrance on the same element is
 * cancelled first, so a rapid replay retargets from the live value instead of
 * stacking; host animations on that element are left alone.
 *
 * \`fill: 'backwards'\` holds the start frame across a stagger delay - without it
 * the element would paint at its resting style and then jump to the start.
 * @param el - the element to animate.
 * @param frames - the entrance keyframes (the first frame is the start state).
 * @param options - timing; a duration is required.
 * @returns the started animation, or null where animation is unavailable.
 */
export function replayEntrance(
  el: HTMLElement,
  frames: readonly Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | null {
  if (!canAnimate(el)) return null
  RUNNING.get(el)?.cancel()
  const animation = el.animate(prefersReducedMotion() ? reducedFrames(frames) : [...frames], {
    fill: 'backwards',
    ...options,
  })
  RUNNING.set(el, animation)
  return animation
}

/**
 * Resolve once the element's transitions settle, or after \`timeoutMs\` when none
 * fires (reduced motion, a hidden element, jsdom). The bound keeps a close path
 * from stalling on a transition that never starts.
 * @param el - the element whose transitions to await.
 * @param timeoutMs - upper bound in milliseconds.
 * @returns a promise that settles when the element reaches its target style.
 */
export function whenTransitionSettles(el: HTMLElement, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      el.removeEventListener('transitionend', onEnd)
      window.clearTimeout(timer)
      resolve()
    }
    const onEnd = (event: TransitionEvent): void => {
      if (event.target === el) finish()
    }
    el.addEventListener('transitionend', onEnd)
    const timer = window.setTimeout(finish, timeoutMs)
  })
}

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

/** Longest shake the impact channel will ever run. */
const MAX_SHAKE_MS = 350

/** One element's pending impact: the loudest source wins, sources are never summed. */
interface ShakeState {
  amp: number
  /**
   * First frame of the entire run. The decay divides by `end - start` (not by the first
   * caller's duration): an absorbed impact extends `end`, and dividing by the old
   * duration would compute a decay above 1 - amplifying the shake past the loudest
   * amplitude any caller asked for.
   */
  start: number
  end: number
}

const SHAKING = new WeakMap<HTMLElement, ShakeState>()

/**
 * Impact channel: a short two-frequency shake on a wrapper element.
 *
 * Rules taken from the handfeel reference, each of which is a failure mode when
 * skipped: amplitudes are combined with `max`, never summed (three impacts in one
 * frame otherwise turn into a seizure); the axes run different frequencies with a
 * phase offset (one frequency on both axes traces a circle, which reads as a
 * wobble); amplitude decays linearly to zero and nothing outlasts 350ms. It
 * writes `translate`, so the target must not carry a `translate` animation of its
 * own, and it is gated on reduced motion. Never shake text the user is reading -
 * use a container that holds an error line, not the message body.
 * @param el - the wrapper to shake.
 * @param amp - loudest offset in px (the reference ladder spans ~5x, smallest to largest).
 * @param durationMs - impact length, clamped to 350ms.
 */
export function shakeElement(el: HTMLElement, amp: number, durationMs: number): void {
  if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') return
  if (prefersReducedMotion()) return
  const duration = Math.min(Math.max(durationMs, 1), MAX_SHAKE_MS)
  const now = performance.now()
  const pending = SHAKING.get(el)
  if (pending !== undefined) {
    // Absorb into the running shake: strongest amplitude, latest expiry.
    pending.amp = Math.max(pending.amp, amp)
    pending.end = Math.max(pending.end, now + duration)
    return
  }
  const state: ShakeState = { amp, start: now, end: now + duration }
  SHAKING.set(el, state)
  const step = (): void => {
    const t = performance.now()
    const left = state.end - t
    if (left <= 0) {
      el.style.translate = ''
      SHAKING.delete(el)
      return
    }
    // 分母是这一整段的实际时长（吸收会延长 end），并夹到 1 以内：用首次调用的 duration
    // 会让后续更长的影响算出 decay > 1，把振幅放大到超过传入值。
    const span = Math.max(1, state.end - state.start)
    const decay = Math.min(1, left / span)
    const s = t / 1000
    el.style.translate =
      `${(Math.sin(s * 47) * state.amp * decay).toFixed(2)}px ${(Math.sin(s * 31 + 1.3) * state.amp * decay).toFixed(2)}px`
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
