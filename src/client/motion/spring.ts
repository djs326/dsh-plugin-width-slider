/**
 * Release handfeel for the width slider: a drag does not stop dead where the
 * pointer happened to leave the track. The release carries its velocity into a
 * projected landing point and the column glides there, so a flick overshoots
 * slightly and settles back instead of snapping. Pure math only (no DOM, no
 * timers): the caller drives {@link stepSpring} from rAF.
 *
 * The integrator is the underdamped step from the handfeel notes —
 * `vel += (target - x) * k * dt; vel *= damping; x += vel * dt` — with the
 * damping made frame-rate independent by raising it to `dt * 60`, so a 120Hz
 * display settles in the same wall-clock time as a 60Hz one.
 */

/** How far ahead the release velocity is projected (ms): the flick's "throw". */
export const PROJECT_MS = 120
/**
 * Spring stiffness (1/s²) and per-frame damping at 60fps. The pair is tuned for
 * a column that is also a live layout: ωn = √260 ≈ 16.1 1/s with an effective
 * damping ratio ζ ≈ 0.67 settles inside ~0.4s, so the width is usable right
 * after a throw while the ~5% overshoot still reads as momentum. (The handfeel
 * notes' 0.86/0.60 damping presets pair with a much softer k = 60–90 and would
 * leave the column oscillating for over a second at this stiffness.)
 */
export const SPRING_STIFFNESS = 260
export const SPRING_DAMPING = 0.66
/** Rest thresholds: below BOTH, the spring has landed. */
export const REST_DISTANCE = 1.5
export const REST_VELOCITY = 30
/** The velocity sample window (ms); older pointer samples are too stale to use. */
export const VELOCITY_WINDOW_MS = 120
/** Below this release speed (width px/ms) a gesture is a stop, not a flick. */
export const FLICK_MIN_VELOCITY = 0.05

/** One pointer sample on the track axis (client-X px, epoch ms). */
export interface PointerSample {
  x: number
  t: number
}

/** One spring state: position (px) and velocity (px/s). */
export interface SpringState {
  x: number
  vel: number
}

/** Pure: the landing point a release is thrown to, from its velocity (px/ms). */
export function projectLanding(value: number, velocityPerMs: number, projectMs: number = PROJECT_MS): number {
  return value + velocityPerMs * projectMs
}

/**
 * Pure: one frame of the underdamped step. `dtSec` is clamped: a stalled frame
 * (backgrounded tab, long task) must not integrate a huge step and fling the
 * column across the range.
 */
export function stepSpring(state: SpringState, target: number, dtSec: number): SpringState {
  const dt = Math.min(Math.max(dtSec, 0), 0.05)
  if (dt === 0) return state
  const vel = (state.vel + (target - state.x) * SPRING_STIFFNESS * dt) * Math.pow(SPRING_DAMPING, dt * 60)
  return { x: state.x + vel * dt, vel }
}

/** Pure: whether the spring has landed on the target (distance AND speed at rest). */
export function isSettled(state: SpringState, target: number): boolean {
  return Math.abs(target - state.x) < REST_DISTANCE && Math.abs(state.vel) < REST_VELOCITY
}

/**
 * Pure: the release velocity (px/ms) from recent pointer samples. The oldest
 * sample inside the window is the baseline, which keeps a long drag from being
 * averaged into a false zero at the end of a fast flick.
 */
export function dragVelocity(
  samples: readonly PointerSample[],
  now: number,
  windowMs: number = VELOCITY_WINDOW_MS,
): number {
  const first = samples.find((sample) => now - sample.t <= windowMs) ?? samples[0]
  const last = samples[samples.length - 1]
  if (first === undefined || last === undefined || last === first) return 0
  const dt = last.t - first.t
  // A single frame of travel cannot tell a flick from a jitter.
  if (dt < 4) return 0
  return (last.x - first.x) / dt
}
