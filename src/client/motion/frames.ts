import {
  MOTION_STYLES, NEW_CHAT_MOTION_STYLES, SIDEBAR_MOTION_STYLES,
  type MotionStyle, type NewChatMotionStyle, type SidebarMotionStyle,
} from '../../shared/motionSettings.ts'
import { EASE_FADE, EASE_GLIDE, EASE_SETTLE } from './waapi.ts'

/**
 * Entrance classes applied to marked rows. Literal (global) classes on purpose:
 * the engine runs identically in the browser and in jsdom tests, independent of
 * CSS-module processing. ROW_IN_CLASS is the "already animated" marker used for
 * reuse detection and cleanup; the style class records which entrance ran.
 */
export const ROW_IN_CLASS = 'dsu-motion-row-in'
/** Every entrance style id the engine may apply (transcript + sidebar + new-chat). */
export type EntranceStyle = MotionStyle | SidebarMotionStyle | NewChatMotionStyle

/**
 * Every style class the engine may apply (for cleanup). The style sets share
 * the `fade` id, so the union is deduplicated.
 */
export const STYLE_CLASSES: readonly string[] =
  [...new Set([...MOTION_STYLES, ...SIDEBAR_MOTION_STYLES, ...NEW_CHAT_MOTION_STYLES])]
    .map((style) => styleClass(style))

/** Pure: the class that records which entrance style a row ran. */
export function styleClass(style: EntranceStyle): string {
  return `dsu-motion-${style}`
}

/**
 * Role-based arrivals: rather than one entrance for every transcript row, the
 * row's flow kind picks how it arrives — the user's own message comes in from
 * the side (it left the composer), the assistant's prose keeps whatever style
 * the user chose, and process rows (tool calls/results, commands, compaction,
 * errors) only settle in lightly so they never compete with the prose.
 */
export type RowRole = 'user' | 'process'

/** Class recording that a row arrived with the user-role entrance. */
export const ROLE_USER_CLASS = 'dsu-motion-role-user'
/** Class recording that a row arrived with the process-role entrance. */
export const ROLE_PROCESS_CLASS = 'dsu-motion-role-process'

/** Every role class (cleanup, alongside the style classes). */
export const ROLE_CLASSES: readonly string[] = [ROLE_USER_CLASS, ROLE_PROCESS_CLASS]

/**
 * Every class an entrance may leave on a row. The cleanup pass must remove the
 * role classes too: a replayed row can arrive as user first and as process
 * after a re-render, and a stale role class would linger otherwise.
 */
export const ENTRANCE_CLASSES: readonly string[] = [...STYLE_CLASSES, ...ROLE_CLASSES]

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

/**
 * Pure: the entrance role of a transcript row, from the flow kind the host
 * publishes on the row (`data-chat-flow-kind`). The assistant's own prose
 * (`assistant-step`) returns undefined so it keeps the user's chosen style; a row
 * without a kind (the host changed its data attributes) also falls back to the
 * chosen style rather than guessing.
 *
 * Kind values seen from the host: user, steering, assistant-step, tool-call,
 * turn-process, turn-tail, context, compaction. The user's own words are `user`
 * and a mid-turn interjection is `steering`; everything else - tool rows, turn
 * framing, injected context, compaction notices - is process output. (Note the
 * anchor key uses the node kind `input-message` for the same rows, which is NOT
 * the flow kind, so it must not be matched here.)
 */
export function roleOf(row: HTMLElement): RowRole | undefined {
  const kind = row.dataset.chatFlowKind
  if (kind === undefined || kind === 'assistant-step') return undefined
  return kind === 'user' || kind === 'steering' ? 'user' : 'process'
}

/** Transcript-column entrance; the column stays mounted across switches. */
export const PANEL_FRAMES: readonly Keyframe[] = [
  { opacity: 0.5, translate: '0 6px' },
  { opacity: 1, translate: '0 0' },
]
export const PANEL_DURATION_MS = 320
