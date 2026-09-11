/**
 * Release handfeel math for the width slider: velocity measurement, the
 * projected landing point, and the frame-rate-independent spring step.
 */
import { describe, expect, it } from 'vitest'
import {
  FLICK_MIN_VELOCITY,
  PROJECT_MS,
  REST_DISTANCE,
  REST_VELOCITY,
  SPRING_DAMPING,
  SPRING_STIFFNESS,
  dragVelocity,
  isSettled,
  projectLanding,
  stepSpring,
  type SpringState,
} from '../src/client/motion/spring.ts'

/** Integrate the spring at a fixed frame rate for `durationSec` (60fps by default). */
function integrate(from: number, target: number, velocity: number, durationSec: number, fps = 60): SpringState {
  const dt = 1 / fps
  let state: SpringState = { x: from, vel: velocity }
  for (let elapsed = 0; elapsed < durationSec - 1e-9; elapsed += dt) {
    state = stepSpring(state, target, dt)
  }
  return state
}

describe('projectLanding', () => {
  it('throws the value along the release velocity', () => {
    expect(projectLanding(500, 1)).toBe(500 + PROJECT_MS)
  })

  it('keeps a zero velocity where it was released', () => {
    expect(projectLanding(500, 0)).toBe(500)
  })

  it('projects backwards for a leftward flick', () => {
    expect(projectLanding(500, -0.5)).toBeLessThan(500)
  })
})

describe('stepSpring', () => {
  it('settles on the target', () => {
    const state = integrate(400, 600, 0, 0.8)
    expect(Math.abs(state.x - 600)).toBeLessThan(1)
    expect(isSettled(state, 600)).toBe(true)
  })

  it('carries an incoming velocity past the target before settling', () => {
    // The whole point of the glide: a flick overshoots and comes back, so the
    // release reads as momentum rather than a snap to a computed value.
    let state: SpringState = { x: 400, vel: 2400 }
    let peak = 400
    for (let i = 0; i < 48; i++) {
      state = stepSpring(state, 600, 1 / 60)
      peak = Math.max(peak, state.x)
    }
    expect(peak).toBeGreaterThan(600)
    expect(isSettled(state, 600)).toBe(true)
  })

  it('does not overshoot noticeably without incoming velocity', () => {
    const overshoot = Math.max(...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      .map((frames) => {
        let state: SpringState = { x: 400, vel: 0 }
        for (let i = 0; i < frames; i++) state = stepSpring(state, 600, 1 / 60)
        return state.x - 600
      }))
    // A rest-to-target glide stays far below the damping's theoretical peak.
    expect(overshoot).toBeLessThan(REST_DISTANCE * 40)
  })

  it('settles in the same wall-clock time at 60fps and 120fps', () => {
    const at60 = integrate(400, 600, 1200, 0.8, 60)
    const at120 = integrate(400, 600, 1200, 0.8, 120)
    expect(Math.abs(at60.x - at120.x)).toBeLessThan(1)
    expect(isSettled(at60, 600)).toBe(true)
    expect(isSettled(at120, 600)).toBe(true)
  })

  it('ignores a zero step', () => {
    const state: SpringState = { x: 100, vel: 50 }
    expect(stepSpring(state, 600, 0)).toBe(state)
  })

  it('clamps a stalled frame so a long task cannot fling the column', () => {
    const stalled = stepSpring({ x: 400, vel: 0 }, 600, 5)
    const clamped = stepSpring({ x: 400, vel: 0 }, 600, 0.05)
    expect(stalled).toEqual(clamped)
  })

  it('never moves backwards against a positive velocity in the first frame', () => {
    const state = stepSpring({ x: 400, vel: 600 }, 1000, 1 / 60)
    expect(state.x).toBeGreaterThan(400)
  })
})

describe('isSettled', () => {
  it('is false while the distance is above the threshold', () => {
    expect(isSettled({ x: 600 - REST_DISTANCE - 0.5, vel: 0 }, 600)).toBe(false)
    expect(isSettled({ x: 600 - REST_DISTANCE + 0.5, vel: 0 }, 600)).toBe(true)
  })

  it('is false while the speed is above the threshold', () => {
    expect(isSettled({ x: 600, vel: REST_VELOCITY * 2 }, 600)).toBe(false)
  })

  it('is true at rest on the target', () => {
    expect(isSettled({ x: 600, vel: 0 }, 600)).toBe(true)
  })
})

describe('dragVelocity', () => {
  it('measures px/ms from the oldest sample inside the window', () => {
    const samples = [{ x: 100, t: 0 }, { x: 160, t: 100 }, { x: 220, t: 200 }]
    expect(dragVelocity(samples, 200)).toBeCloseTo(0.6, 5)
  })

  it('ignores samples older than the window', () => {
    const samples = [{ x: 0, t: 0 }, { x: 500, t: 400 }, { x: 600, t: 500 }]
    expect(dragVelocity(samples, 500)).toBeCloseTo(1, 5)
  })

  it('reports no velocity without at least one measurable interval', () => {
    expect(dragVelocity([], 100)).toBe(0)
    expect(dragVelocity([{ x: 100, t: 100 }], 100)).toBe(0)
    expect(dragVelocity([{ x: 100, t: 100 }, { x: 140, t: 102 }], 102)).toBe(0)
  })

  it('reports a leftward flick as negative', () => {
    const samples = [{ x: 400, t: 0 }, { x: 300, t: 100 }]
    expect(dragVelocity(samples, 100)).toBeCloseTo(-1, 5)
  })
})

describe('tuning constants', () => {
  it('lands a real throw fast enough for live layout', () => {
    // The column reflows the conversation as it moves, so a throw has to be
    // usable about half a second later: 500px of travel thrown at 1500px/s.
    expect(isSettled(integrate(400, 900, 1500, 0.55), 900)).toBe(true)
  })

  it('keeps the overshoot visible', () => {
    // A glide that never passes the target is a snap with extra steps.
    let state: SpringState = { x: 400, vel: 2000 }
    let peak = 400
    for (let i = 0; i < 30; i++) {
      state = stepSpring(state, 600, 1 / 60)
      peak = Math.max(peak, state.x)
    }
    expect(peak).toBeGreaterThan(600)
  })

  it('stays underdamped so the release keeps momentum', () => {
    // ζ = -ln(damping) * 60 / (2√k) ≈ 0.77: the overshoot is visible while the
    // oscillation dies out instead of ringing for a second. The band is tight
    // enough to catch a noticeably under-damped pair (a 0.5 lower bound let
    // "nearly no damping" and "clearly too little" both pass).
    const zeta = -Math.log(SPRING_DAMPING) * 60 / (2 * Math.sqrt(SPRING_STIFFNESS))
    expect(zeta).toBeGreaterThan(0.7)
    expect(zeta).toBeLessThan(0.85)
  })

  it('pins the release knobs to a usable magnitude', () => {
    // 原先三条 `toBeGreaterThan(0)` 对写死的常量恒真，把数量级改坏也不会红。这里钉住它们
    // 实际所在的量级。
    expect(FLICK_MIN_VELOCITY).toBeGreaterThan(0.01) // 太灵敏会把轻推当成甩动
    expect(FLICK_MIN_VELOCITY).toBeLessThan(0.2) // 太钝则甩不动
    expect(PROJECT_MS).toBeGreaterThanOrEqual(50)
    expect(PROJECT_MS).toBeLessThanOrEqual(300)
    expect(REST_VELOCITY).toBeGreaterThan(1) // px/s；太低会让余振拖很久
    expect(REST_VELOCITY).toBeLessThan(200)
  })
})
