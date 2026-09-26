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
      if (event.target !== el) return
      // 同一元素常有多条并行过渡（面板退出是 opacity 160ms + scale 280ms）：只等最短的
      // 那条结束就放行，会让较长的那条被截断。仍有动画在跑就继续等，超时兜底。
      const running = (el as HTMLElement & { getAnimations?: () => Animation[] }).getAnimations
      if (typeof running === 'function') {
        try {
          if (running.call(el).some((animation) => animation.playState === 'running')) return
        } catch { /* 取不到动画列表时按已结束处理 */ }
      }
      finish()
    }
    el.addEventListener('transitionend', onEnd)
    const timer = window.setTimeout(finish, timeoutMs)
  })
}
