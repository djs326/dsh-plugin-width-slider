/**
 * WidthSliderSettings: settings-panel section that replaces the native width
 * handles with a slider control.
 *
 * Architecture fixes over v1:
 * 1. REAL-TIME WIDTH: write --dsh-chat-user-width as inline style on the
 *    conversation root element ([data-phase]), same as native code — previously
 *    wrote to documentElement which was shadowed by the root's own inline value.
 * 2. SMOOTH DRAG: rAF-throttled updates; column width cached at pointerdown
 *    (no DOM reads during render); no getComputedStyle in hot path.
 * 3. TRANSPARENT OVERLAY: in preview mode, hide the settings overlay layer
 *    ([data-shell-overlay] opacity:0) so the conversation area is visible
 *    behind the floating slider.  Restored on exit.
 */
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

// ── Constants ────────────────────────────────────────────────────────────────

const WIDTH_PREF_KEY = 'dsh.conversation.contentWidth'
const FOLLOW_PREF_KEY = 'dsh.conversation.contentWidthFollow'
const MIN_WIDTH = 640
const EDGE_BUDGET = 176
/**
 * Panel slider geometry. The knob diameter equals the track height so the
 * knob fully hides the fill bar's rounded end — no flat edge ever shows
 * through the round knob.  Radius in px (20px knob / 2).
 */
const PANEL_THUMB_R = 10
/** Track height equals the knob diameter (2 * radius). */
const PANEL_TRACK_H = PANEL_THUMB_R * 2
/** Overlay preview slider knob radius in px (28px knob / 2). */
const OVERLAY_THUMB_R = 14
/** Overlay track height equals the knob diameter. */
const OVERLAY_TRACK_H = OVERLAY_THUMB_R * 2

// ── Helpers ──────────────────────────────────────────────────────────────────

function readPreference(): number | null {
  try {
    const raw = localStorage.getItem(WIDTH_PREF_KEY)
    if (raw === null) return null
    const v = Number(raw)
    return Number.isFinite(v) && v > 0 ? v : null
  } catch { return null }
}

/** Follow-window mode persisted separately from the numeric width. */
function readFollowPreference(): boolean {
  try { return localStorage.getItem(FOLLOW_PREF_KEY) === '1' } catch { return false }
}

/** Read the current conversation column width from the DOM, or fall back. */
function readColumnWidth(): number {
  // Conversation root element has data-phase attribute and carries
  // --dsh-conversation-column-width as inline style set by native code.
  for (const el of document.querySelectorAll<HTMLElement>('[data-phase]')) {
    const col = Number.parseFloat(el.style.getPropertyValue('--dsh-conversation-column-width'))
    if (Number.isFinite(col) && col > 0) return col
    return el.offsetWidth
  }
  return window.innerWidth - 240
}

/** Compute the default adaptive width for a given column. */
function defaultWidth(column: number): number {
  return Math.max(680, Math.min(column * 0.64, 920))
}

/**
 * Write --dsh-chat-user-width to every conversation root element inline,
 * same as native onHandleDrag.  This is the ONLY way to get real-time layout
 * feedback — documentElement is shadowed by the root's own inline style.
 */
function publishChatWidth(px: number): void {
  const clamped = Math.round(Math.max(MIN_WIDTH, px))
  for (const el of document.querySelectorAll<HTMLElement>('[data-phase]')) {
    el.style.setProperty('--dsh-chat-user-width', `${clamped}px`)
  }
}

function persistWidth(px: number): void {
  try {
    localStorage.setItem(WIDTH_PREF_KEY, String(Math.round(Math.max(MIN_WIDTH, px))))
  } catch { /* quota */ }
}

function persistFollowPreference(follow: boolean): void {
  try { localStorage.setItem(FOLLOW_PREF_KEY, follow ? '1' : '0') } catch { /* quota */ }
}

/**
 * Snap the settings overlay layer hidden/visible.
 *
 * We are mounted inside the settings panel, so walk UP from our own DOM
 * subtree (not from the conversation root) to find the settings panel
 * container: shell overlay markers plus the closest role=dialog / aria-modal
 * or large fixed/absolute ancestor of our own mount point.  Hiding it lets
 * the conversation area show through the preview overlay.
 *
 * @param origin - any element inside the settings panel (e.g. our section root).
 */
function hideSettingsOverlay(hide: boolean, origin?: HTMLElement | null): void {
  const targets = new Set<HTMLElement>()

  // 1. Explicit shell overlay layers.
  document.querySelectorAll<HTMLElement>('[data-shell-overlay]').forEach(el => targets.add(el))

  // 2. From our own mount point, walk ancestors to find the panel container:
  //    the closest role=dialog / aria-modal host, or a large fixed/absolute
  //    overlay that hosts the panel.  Only containers on OUR ancestor chain
  //    are touched — unrelated dialogs elsewhere in the document stay visible.
  if (origin) {
    let parent: HTMLElement | null = origin
    while (parent && parent !== document.body) {
      if (parent.getAttribute('role') === 'dialog' ||
          parent.getAttribute('aria-modal') === 'true') {
        targets.add(parent)
        break
      }
      const cs = getComputedStyle(parent)
      if (cs.position === 'fixed' || cs.position === 'absolute') {
        // Large overlay hosting the settings panel.
        if (parent.offsetWidth > window.innerWidth * 0.5 ||
            parent.offsetHeight > window.innerHeight * 0.5) {
          targets.add(parent)
          break
        }
      }
      parent = parent.parentElement
    }
  }

  targets.forEach(el => {
    el.style.setProperty('opacity', hide ? '0' : '')
    el.style.setProperty('pointer-events', hide ? 'none' : '')
  })
}

// ── Component ────────────────────────────────────────────────────────────────

export type WidthSliderSettingsProps = PropsLocale<'widthSlider'>

export function WidthSliderSettings({ t }: WidthSliderSettingsProps): JSX.Element {
  // ── state ──
  const [value, setValue] = useState<number>(() => {
    const pref = readPreference()
    const column = readColumnWidth()
    const max = Math.max(MIN_WIDTH, column - EDGE_BUDGET)
    if (pref !== null) return Math.max(MIN_WIDTH, Math.min(pref, max))
    return defaultWidth(column)
  })
  const [preview, setPreview] = useState(false)
  /** Follow-window mode: content width == conversation column, live. */
  const [follow, setFollow] = useState<boolean>(readFollowPreference)

  // ── refs ──
  const panelTrackRef = useRef<HTMLDivElement>(null)
  const overlayTrackRef = useRef<HTMLDivElement>(null)
  const rAFRef = useRef<number | null>(null)
  /** Drag anchor: snapshots start position + track width + column-derived max. */
  const dragRef = useRef<{
    startX: number; startValue: number; trackWidth: number; maxValue: number
  } | null>(null)
  const previewRef = useRef(false)
  const followRef = useRef(follow)

  // Keep preview ref in sync for use in the rAF / pointer closures.
  previewRef.current = preview
  followRef.current = follow

  /** Track the latest applied width so pointerup can flush the final value. */
  const latestRef = useRef(value)

  // Keep in sync whenever value changes
  useEffect(() => { latestRef.current = value }, [value])
  // We cache column on mount and on pointerdown — never during render hot path.
  const [column, setColumn] = useState(readColumnWidth)
  // Refresh column on window resize
  useEffect(() => {
    const onResize = () => setColumn(readColumnWidth())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const maxValue = Math.max(MIN_WIDTH, column - EDGE_BUDGET)
  const pct = maxValue > MIN_WIDTH
    ? ((value - MIN_WIDTH) / (maxValue - MIN_WIDTH)) * 100
    : 0

  // ── pointer handlers ──

  /** rAF-throttled width update: live layout feedback only. localStorage is
      persisted once at gesture end (pointerup / Escape), not every frame. */
  const applyWidth = useCallback((px: number) => {
    const clamped = Math.round(Math.max(MIN_WIDTH, px))
    // De-duplicate via rAF (native code also uses rAF for drag feedback)
    if (rAFRef.current !== null) return
    rAFRef.current = requestAnimationFrame(() => {
      rAFRef.current = null
      publishChatWidth(clamped)
      setValue(clamped)
    })
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Follow mode owns the width — manual drag / preview is disabled.
    if (followRef.current) return
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)

    // Effective travel = the full track width (thin track, knob overhangs
    // both ends — the knob's center maps 1:1 onto the value range).
    const travel = Math.max(1, target.offsetWidth)

    // Snapshot drag state and column at pointerdown (not on every frame)
    const col = readColumnWidth()
    const max = Math.max(MIN_WIDTH, col - EDGE_BUDGET)
    setColumn(col)
    dragRef.current = {
      startX: e.clientX,
      startValue: value,
      trackWidth: travel,
      maxValue: max,
    }

    // Enter preview immediately (no long-press).  Hide the settings overlay
    // so the conversation becomes visible behind the floating slider.
    setPreview(true)
    hideSettingsOverlay(true, panelTrackRef.current)

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.trackWidth <= 0) return
      const range = drag.maxValue - MIN_WIDTH
      const delta = (ev.clientX - drag.startX) / drag.trackWidth * range
      const newVal = Math.round(drag.startValue + delta)
      const clamped = Math.max(MIN_WIDTH, Math.min(newVal, drag.maxValue))
      // Sync latest synchronously so pointerup flush always has the newest value
      latestRef.current = clamped
      applyWidth(clamped)
    }

    const onUp = () => {
      // Exit preview: restore settings overlay
      if (previewRef.current) hideSettingsOverlay(false, panelTrackRef.current)
      setPreview(false)
      // Flush the last throttled value so the final position is persisted
      if (rAFRef.current !== null) {
        cancelAnimationFrame(rAFRef.current)
        rAFRef.current = null
      }
      publishChatWidth(latestRef.current)
      persistWidth(latestRef.current)
      dragRef.current = null
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      try { target.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    }

    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }, [value, applyWidth])

  // ── keyboard: Escape exits preview ──

  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Exit preview AND stop the drag: drop the drag anchor (further
        // pointermove is ignored until pointerup cleans up), cancel any
        // pending rAF, then flush so the last previewed width sticks.
        if (rAFRef.current !== null) {
          cancelAnimationFrame(rAFRef.current)
          rAFRef.current = null
        }
        dragRef.current = null
        hideSettingsOverlay(false, panelTrackRef.current)
        publishChatWidth(latestRef.current)
        persistWidth(latestRef.current)
        setPreview(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [preview])

  // Cleanup on unmount: cancel any pending rAF, then restore overlay visibility.
  useEffect(() => {
    return () => {
      if (rAFRef.current !== null) {
        cancelAnimationFrame(rAFRef.current)
        rAFRef.current = null
      }
      if (previewRef.current) hideSettingsOverlay(false, panelTrackRef.current)
    }
  }, [])

  // ── follow-window mode ──

  /** Toggle follow mode: on = width tracks the conversation column live;
      off = restore the last manual slider value (DOM + localStorage stay
      consistent). */
  const onToggleFollow = useCallback(() => {
    const next = !followRef.current
    followRef.current = next
    persistFollowPreference(next)
    if (next) {
      const w = Math.round(Math.max(MIN_WIDTH, readColumnWidth()))
      setColumn(w)
      publishChatWidth(w)
    } else {
      publishChatWidth(latestRef.current)
    }
    setFollow(next)
  }, [])

  // While follow mode is on, keep the content width pinned to the current
  // conversation column. React to window resizes AND layout changes that
  // resize the conversation root (sidebar collapse, details panel, splits):
  // observe every [data-phase] element and republish on any change.
  useEffect(() => {
    if (!follow) return
    const apply = () => {
      const w = Math.round(Math.max(MIN_WIDTH, readColumnWidth()))
      setColumn(w)
      publishChatWidth(w)
      // Observe any conversation root that appears later too (observe() is
      // idempotent for already-observed elements).
      document.querySelectorAll<HTMLElement>('[data-phase]').forEach(el => ro.observe(el))
    }
    const ro = new ResizeObserver(apply)
    apply()
    window.addEventListener('resize', apply)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [follow])

  // ── render: in-panel slider ──

  const sliderContent = (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 8,
          fontSize: 13,
          lineHeight: '20px',
          color: 'var(--dsw-alias-label-primary, #e0e0e0)',
        }}
      >
        <span style={{ fontWeight: 500 }}>{t('label')}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--dsw-alias-label-caption, #999)' }}>
          {Math.round(value)}{t('unit')}
        </span>
      </div>

      <div
        ref={panelTrackRef}
        onPointerDown={onPointerDown}
        style={{
          position: 'relative',
          height: PANEL_TRACK_H,
          cursor: 'col-resize',
          userSelect: 'none',
          touchAction: 'none',
          background: 'var(--dsw-alias-interactive-bg-hover, #333)',
          borderRadius: PANEL_THUMB_R,
        }}
      >
        {/*
          Fill bar: left edge at the track left, right edge at the knob center
          plus one thumb radius, so the fill's right end is a semicircle whose
          center aligns with the knob center.  The knob (same radius) fully
          covers that semicircle — no flat edge ever shows through.
        */}
        <div
          style={{
            position: 'absolute',
            top: 0, bottom: 0, left: 0,
            width: `calc(${pct}% + ${PANEL_THUMB_R}px)`,
            background: 'var(--dsw-alias-state-business-primary, #4f9eff)',
            borderRadius: PANEL_THUMB_R,
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `${pct}%`,
            transform: 'translate(-50%, -50%)',
            width: PANEL_TRACK_H, height: PANEL_TRACK_H,
            borderRadius: '50%',
            background: 'var(--dsw-alias-state-business-primary, #4f9eff)',
            border: '2px solid var(--dsw-alias-bg-base, #1a1a1a)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
          }}
        />
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          lineHeight: '18px',
          color: 'var(--dsw-alias-label-caption, #888)',
        }}
      >
        {t('info')}
      </div>
    </>
  )

  // ── render: preview overlay (portal) ──

  const previewOverlay = preview && createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        // The settings overlay has been hidden by hideSettingsOverlay(true),
        // so the conversation area is visible underneath.  Our overlay's
        // background is transparent to let the conversation show through.
        background: 'transparent',
        cursor: 'col-resize',
        userSelect: 'none',
        touchAction: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 'min(60vw, 500px)',
          position: 'relative',
          padding: '0 12px',
        }}
      >
        {/* Large width indicator — always readable on any backdrop */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: 16,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              padding: '8px 20px',
              borderRadius: 12,
              fontSize: 28,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              color: '#fff',
              background: 'rgba(0,0,0,0.6)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
              backdropFilter: 'blur(4px)',
            }}
          >
            {Math.round(value)}{t('unit')}
          </span>
        </div>

        {/* Track: height equals the knob diameter.  The fill's right end is a
            semicircle of the same radius as the knob and centered on the knob
            center, so the knob fully hides the fill end — no flat edge
            shows through the round knob, and the bar is wide enough to
            click easily. */}
        <div
          ref={overlayTrackRef}
          onPointerDown={onPointerDown}
          style={{
            position: 'relative',
            height: OVERLAY_TRACK_H,
            cursor: 'col-resize',
            userSelect: 'none',
            touchAction: 'none',
            background: 'var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.3))',
            borderRadius: OVERLAY_THUMB_R,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0, bottom: 0, left: 0,
              width: `calc(${pct}% + ${OVERLAY_THUMB_R}px)`,
              background: 'var(--dsw-alias-state-business-primary, #4f9eff)',
              borderRadius: OVERLAY_THUMB_R,
              opacity: 0.6,
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: `${pct}%`,
              transform: 'translate(-50%, -50%)',
              width: OVERLAY_TRACK_H, height: OVERLAY_TRACK_H,
              borderRadius: '50%',
              background: 'var(--dsw-alias-state-business-primary, #4f9eff)',
              border: '3px solid var(--dsw-alias-bg-base, #1a1a1a)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
              pointerEvents: 'none',
            }}
          />
        </div>

        <div
          style={{
            textAlign: 'center',
            marginTop: 14,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              padding: '6px 14px',
              borderRadius: 999,
              fontSize: 13,
              lineHeight: '18px',
              color: '#fff',
              background: 'rgba(0,0,0,0.65)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
              backdropFilter: 'blur(2px)',
            }}
          >
            {t('previewHint')}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )

  return (
    <div style={{ padding: '4px 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
          fontSize: 13,
          lineHeight: '20px',
          color: 'var(--dsw-alias-label-primary, #e0e0e0)',
        }}
      >
        <input
          id="dsh-plugin-width-slider-follow"
          type="checkbox"
          checked={follow}
          onChange={onToggleFollow}
          style={{
            margin: 0,
            width: 15,
            height: 15,
            accentColor: 'var(--dsw-alias-state-business-primary, #4f9eff)',
            cursor: 'pointer',
          }}
        />
        <label
          htmlFor="dsh-plugin-width-slider-follow"
          style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 500 }}
        >
          {t('followLabel')}
        </label>
        {follow && (
          <span
            style={{
              marginLeft: 'auto',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--dsw-alias-label-caption, #999)',
            }}
          >
            {Math.round(column)}{t('unit')}
          </span>
        )}
      </div>
      {follow ? (
        <div
          style={{
            fontSize: 12,
            lineHeight: '18px',
            color: 'var(--dsw-alias-label-caption, #888)',
          }}
        >
          {t('followInfo')}
        </div>
      ) : (
        <>
          {sliderContent}
          {preview && previewOverlay}
        </>
      )}
      {preview && (
        <style>{`body{overflow:hidden!important}`}</style>
      )}
    </div>
  )
}