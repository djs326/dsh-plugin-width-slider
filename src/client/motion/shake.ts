import { prefersReducedMotion } from './waapi.ts'

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
