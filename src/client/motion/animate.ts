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
