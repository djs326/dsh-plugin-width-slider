import { ROLE_PROCESS_CLASS, ROLE_USER_CLASS, type EntranceStyle, type RowRole } from '../official/chatDom.ts'
import { EASE_FADE, EASE_GLIDE, EASE_SETTLE } from './waapi.ts'

// 写回宿主行的类名（ROW_IN_CLASS、dsu-motion-* 样式/角色类）与行角色判定都由
// official/chatDom.ts 描述，本文件只消费：留下的只是 frames / 时长 / 缓动。

/**
 * Entrance keyframes, duration, and easing per style. Opacity always arrives on
 * the shorter side and travel or scale on the longer one, which reads as the row
 * settling rather than sliding to a stop.
 *
 * Durations follow the motion-tokens scale by intent: a transient row is
 * `standard` (280–350ms), a full welcome surface is `medium` (400–500ms), and an
 * opacity-only fade is `fast` (150–200ms). Travel and scale styles land on
 * EASE_SETTLE (3% overshoot), sideways travel and the large welcome surface stay
 * on EASE_GLIDE, and opacity-only work uses EASE_FADE.
 */
export const ENTRANCE: Record<EntranceStyle, { frames: Keyframe[]; durationMs: number; easing: string }> = {
  'fade-up': {
    frames: [{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }],
    durationMs: 300,
    easing: EASE_SETTLE,
  },
  fade: {
    frames: [{ opacity: 0 }, { opacity: 1 }],
    durationMs: 200,
    easing: EASE_FADE,
  },
  'rise-scale': {
    frames: [
      { opacity: 0, translate: '0 8px', scale: 0.98 },
      { opacity: 1, translate: '0 0', scale: 1 },
    ],
    durationMs: 320,
    easing: EASE_SETTLE,
  },
  'slide-in': {
    frames: [{ opacity: 0, translate: '12px 0' }, { opacity: 1, translate: '0 0' }],
    durationMs: 280,
    easing: EASE_GLIDE,
  },
  'blur-in': {
    frames: [
      { opacity: 0, filter: 'blur(6px)', translate: '0 4px' },
      { opacity: 1, filter: 'blur(0px)', translate: '0 0' },
    ],
    durationMs: 300,
    easing: EASE_GLIDE,
  },
  'scale-in': {
    frames: [{ opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1 }],
    durationMs: 320,
    easing: EASE_SETTLE,
  },
  'slide-left': {
    frames: [{ opacity: 0, translate: '-10px 0' }, { opacity: 1, translate: '0 0' }],
    durationMs: 280,
    easing: EASE_GLIDE,
  },
  expand: {
    frames: [
      { opacity: 0, scale: '1 0.8', transformOrigin: 'top' },
      { opacity: 1, scale: '1 1', transformOrigin: 'top' },
    ],
    durationMs: 320,
    easing: EASE_SETTLE,
  },
  'slide-down': {
    frames: [{ opacity: 0, translate: '0 -10px' }, { opacity: 1, translate: '0 0' }],
    durationMs: 280,
    easing: EASE_GLIDE,
  },
  reveal: {
    frames: [{ opacity: 0, translate: '0 4px' }, { opacity: 1, translate: '0 0' }],
    durationMs: 480,
    easing: EASE_GLIDE,
  },
  bloom: {
    frames: [{ opacity: 0, scale: 0.99 }, { opacity: 1, scale: 1 }],
    durationMs: 480,
    easing: EASE_SETTLE,
  },
  zoom: {
    frames: [{ opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1 }],
    durationMs: 460,
    easing: EASE_SETTLE,
  },
}

/**
 * Pure: the entrance spec (keyframes, duration, easing) for a transcript style.
 *
 * Exported so the settings page can play the very same entrance in its preview
 * instead of keeping a second copy of the keyframes — a preview that drifts from
 * the engine is worse than no preview, because it teaches the wrong thing.
 */
export function entranceSpec(style: EntranceStyle): { frames: Keyframe[]; durationMs: number; easing: string } {
  return ENTRANCE[style]
}

/**
 * Role entrances. The user's message travels sideways on the glide curve (280ms,
 * `standard` band): it reads as having been sent from the composer, and sideways
 * travel is too directional for the 3% overshoot of EASE_SETTLE. Process rows
 * get the lightest arrival in the set — 3px of travel on an opacity-only curve
 * (200ms, `fast` band) — because a busy turn mounts several of them and anything
 * stronger turns the transcript into a slideshow.
 */
export const ROLE_ENTRANCE: Record<RowRole, { frames: Keyframe[]; durationMs: number; easing: string; cls: string }> = {
  user: {
    frames: [{ opacity: 0, translate: '10px 0' }, { opacity: 1, translate: '0 0' }],
    durationMs: 280,
    easing: EASE_GLIDE,
    cls: ROLE_USER_CLASS,
  },
  process: {
    frames: [{ opacity: 0, translate: '0 3px' }, { opacity: 1, translate: '0 0' }],
    durationMs: 200,
    easing: EASE_FADE,
    cls: ROLE_PROCESS_CLASS,
  },
}

/** Transcript-column entrance; the column stays mounted across switches. */
export const PANEL_FRAMES: readonly Keyframe[] = [
  { opacity: 0.5, translate: '0 6px' },
  { opacity: 1, translate: '0 0' },
]
export const PANEL_DURATION_MS = 320
