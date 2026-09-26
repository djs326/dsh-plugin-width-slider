/** Longest buffered batch queue while the feature is disabled. */
export const MAX_PENDING_BATCHES = 8
/**
 * Buffered batches older than this (ms) are dropped at flush: their rows have
 * been on screen long enough that replaying the entrance would read as a
 * pop-in, not an arrival. Covers slow settings resolution and re-enables.
 */
export const FRESHNESS_WINDOW_MS = 400
/** Delay before the session-switch replay scans the transcript (host commit). */
export const SWITCH_REPLAY_MS = 60
/** Retry interval while the transcript rows have not mounted yet. */
export const SWITCH_RETRY_MS = 80
/** Max replay retries before giving up on an empty transcript. */
export const MAX_SWITCH_RETRIES = 12
/**
 * A row animated within this window is not replayed again. The observer already
 * animates freshly mounted rows; the session-switch replay exists to cover rows
 * it could not correlate, so replaying a row that just started its entrance
 * would restart it mid-flight — the visible double flash.
 */
export const REPLAY_GRACE_MS = 400

/** One observed row batch: the rows + whether it is a load (stagger) batch. */
export interface PendingBatch {
  rows: HTMLElement[]
  load: boolean
  /** Epoch ms when the rows were observed (freshness gate at flush). */
  time: number
}
