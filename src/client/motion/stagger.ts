/** Per-row stagger step on load batches (ms); the 70–80ms "standard list" step from the motion-tokens scale. */
export const STAGGER_STEP_MS = 70
/** Stagger cap: rows beyond this wait no longer (the tail joins together), so a long history still lands quickly. */
export const STAGGER_CAP_MS = 420

/** Pure: the entrance delay for the i-th row of a load batch (0-based). */
export function staggerDelay(index: number): number {
  const i = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0
  return Math.min(i * STAGGER_STEP_MS, STAGGER_CAP_MS)
}
