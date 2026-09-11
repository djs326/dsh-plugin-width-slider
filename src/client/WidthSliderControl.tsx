/**
 * WidthSliderControl: the in-panel width slider (extracted from the v0.2.0
 * WidthSliderSettings when the settings section became a feature control
 * page). Replaces the native width handles with a slider control.
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
 *
 * Layout (v0.7.0): the control renders inline inside the settings row
 * (display: contents) — follow toggle, slider track and the px readout share
 * the group's single row.  Styles live in WidthSliderSettings.tsx (.dsws-*).
 */
import { createPortal } from 'react-dom'
import { setPreviewOpen } from './previewState.ts'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  EDGE_BUDGET,
  MIN_WIDTH,
  defaultWidth,
  persistFollowPreference,
  persistWidth,
  publishChatWidth,
  readColumnWidth,
  readFollowPreference,
  readPreference,
  setFollowEnabled,
} from './widthPrefs.ts'
import { prefersReducedMotion } from './motion/animate.ts'
import {
  FLICK_MIN_VELOCITY,
  VELOCITY_WINDOW_MS,
  dragVelocity,
  isSettled,
  projectLanding,
  stepSpring,
  type PointerSample,
  type SpringState,
} from './motion/spring.ts'

// ── Panel slider geometry ────────────────────────────────────────────────────
// The knob diameter equals the track height so the knob fully hides the fill
// bar's rounded end — no flat edge ever shows through the round knob.
// 8px radius = the 16px track/knob height declared by .dsws-track / .dsws-knob.
const PANEL_THUMB_R = 8
/** Overlay preview slider knob radius in px (28px knob / 2). */
const OVERLAY_THUMB_R = 14
/** Overlay track height equals the knob diameter. */
const OVERLAY_TRACK_H = OVERLAY_THUMB_R * 2

// 宽度偏好读写与发布统一见 ./widthPrefs.ts（组件与启动恢复共用）。

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
/**
 * Preview 期间被我们隐藏过的元素。还原必须只碰这一批 —— 原来每次 restore 都重新计算
 * targets，锚点链或 `[data-shell-overlay]` 集合一旦变化，被置 `opacity:0` 的元素就再也
 * 回不来（面板整块不可见、不可点）。
 */
let hiddenByPreview: HTMLElement[] = []

function hideSettingsOverlay(hide: boolean, origin?: HTMLElement | null): void {
  if (!hide) {
    for (const el of hiddenByPreview) {
      el.style.setProperty('opacity', '')
      el.style.setProperty('pointer-events', '')
    }
    hiddenByPreview = []
    return
  }

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

  hiddenByPreview = [...targets]
  for (const el of hiddenByPreview) {
    el.style.setProperty('opacity', '0')
    el.style.setProperty('pointer-events', 'none')
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export interface WidthSliderControlProps extends PropsLocale<'widthSlider'> {
  /** 总控页关闭「宽度滑块」时禁用交互并置灰。 */
  disabled?: boolean
}

export function WidthSliderControl({ t, disabled = false }: WidthSliderControlProps): JSX.Element {
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
  /** Recent pointer samples on the track axis (release velocity). */
  const samplesRef = useRef<PointerSample[]>([])
  /** The release-glide rAF handle (null when no glide is running). */
  const glideRef = useRef<number | null>(null)

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

  /**
   * End a gesture: stop any pending frame work, leave preview, then publish and
   * persist the final width once. Both a plain release and a finished glide land
   * here, so persistence stays a single write per gesture.
   */
  const finishGesture = useCallback((final: number) => {
    if (glideRef.current !== null) {
      cancelAnimationFrame(glideRef.current)
      glideRef.current = null
    }
    if (rAFRef.current !== null) {
      cancelAnimationFrame(rAFRef.current)
      rAFRef.current = null
    }
    if (previewRef.current) hideSettingsOverlay(false, panelTrackRef.current)
    setPreview(false)
    latestRef.current = final
    publishChatWidth(final)
    persistWidth(final)
    setValue(final)
  }, [])

  /**
   * Glide from the release point to its projected landing point (see
   * motion/spring.ts). Preview stays on until the spring settles: leaving preview
   * at pointerup would put the settings overlay back mid-flight, so the travel
   * that makes the flick readable would happen behind it. Reduced motion never
   * reaches here (the caller lands the gesture directly).
   */
  const startGlide = useCallback((from: number, velocityPerMs: number, max: number) => {
    const target = Math.round(Math.max(MIN_WIDTH, Math.min(projectLanding(from, velocityPerMs), max)))
    let state: SpringState = { x: from, vel: velocityPerMs * 1000 }
    let last = performance.now()
    const tick = (now: number): void => {
      state = stepSpring(state, target, (now - last) / 1000)
      last = now
      const px = Math.round(state.x)
      if (px !== latestRef.current) {
        latestRef.current = px
        publishChatWidth(px)
        setValue(px)
      }
      if (isSettled(state, target)) {
        glideRef.current = null
        finishGesture(target)
        return
      }
      glideRef.current = requestAnimationFrame(tick)
    }
    glideRef.current = requestAnimationFrame(tick)
  }, [finishGesture])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Follow mode owns the width — manual drag / preview is disabled.
    if (followRef.current) return
    // 重入保护：上一次拖动未结束（多指/快速二击）忽略新按下，防止锚点覆盖跳变。
    if (dragRef.current !== null) return
    // 甩动惯性可能还在跑（此时 dragRef 已清空）：它的每一帧仍在发布宽度，落定时还会
    // finishGesture(target) —— 会把用户这次新拖的宽度覆盖掉。先按 release 路径的方式取消它。
    if (glideRef.current !== null) {
      cancelAnimationFrame(glideRef.current)
      glideRef.current = null
    }
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
    // Fresh velocity history for this gesture (the release reads it).
    samplesRef.current = [{ x: e.clientX, t: performance.now() }]

    // Enter preview immediately (no long-press).  Hide the settings overlay
    // so the conversation becomes visible behind the floating slider.
    setPreview(true)
    hideSettingsOverlay(true, panelTrackRef.current)

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.trackWidth <= 0) return
      // Keep a short pointer history: the release velocity is measured over the
      // last VELOCITY_WINDOW_MS, so samples older than the window are dropped
      // (the newest two always stay, they are the ones being measured).
      const now = performance.now()
      const samples = samplesRef.current
      samples.push({ x: ev.clientX, t: now })
      while (samples.length > 2 && now - samples[0]!.t > VELOCITY_WINDOW_MS) samples.shift()
      const range = drag.maxValue - MIN_WIDTH
      const delta = (ev.clientX - drag.startX) / drag.trackWidth * range
      const newVal = Math.round(drag.startValue + delta)
      const clamped = Math.max(MIN_WIDTH, Math.min(newVal, drag.maxValue))
      // Sync latest synchronously so pointerup flush always has the newest value
      latestRef.current = clamped
      applyWidth(clamped)
    }

    const onUp = () => {
      const drag = dragRef.current
      dragRef.current = null
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      try { target.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
      const from = latestRef.current
      // A flick continues: the release velocity is projected into a landing
      // point and the column glides there, so a fast throw overshoots slightly
      // and settles instead of stopping dead under the pointer. The pointer
      // velocity is on the track axis, so it is rescaled into width px by the
      // same mapping the drag itself uses.
      const velocity = dragVelocity(samplesRef.current, performance.now())
      const max = drag !== null ? drag.maxValue : Math.max(MIN_WIDTH, readColumnWidth() - EDGE_BUDGET)
      const widthVelocity = velocity * (max - MIN_WIDTH) / Math.max(1, drag?.trackWidth ?? 1)
      if (!prefersReducedMotion() && Math.abs(widthVelocity) >= FLICK_MIN_VELOCITY) {
        startGlide(from, widthVelocity, max)
        return
      }
      // A plain stop (or reduced motion) lands exactly where the pointer left it.
      finishGesture(from)
    }

    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }, [value, applyWidth, startGlide, finishGesture])

  // ── preview 标记：让设置面板动效引擎在预览期间让出 Escape ──

  useEffect(() => {
    setPreviewOpen(preview)
    return () => { setPreviewOpen(false) }
  }, [preview])

  // ── keyboard: Escape exits preview ──

  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Exit preview AND stop the gesture: drop the drag anchor (further
        // pointermove is ignored until pointerup cleans up), cancel any pending
        // glide, then land on the last previewed width so it sticks.
        dragRef.current = null
        finishGesture(latestRef.current)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [preview, finishGesture])

  // Cleanup on unmount: cancel any pending rAF, then restore overlay visibility.
  useEffect(() => {
    return () => {
      if (glideRef.current !== null) {
        cancelAnimationFrame(glideRef.current)
        glideRef.current = null
      }
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
    // 与全局跟随 watcher 同步：面板开着时组件 effect 即时发布；面板关闭
    // （组件卸载）后由全局 watcher 按此开关继续/停止（重启恢复的兜底，
    // 修复"重启后不生效、要打开插件页才生效"）。
    setFollowEnabled(next)
    if (next) {
      const w = Math.round(Math.max(MIN_WIDTH, readColumnWidth()))
      setColumn(w)
      publishChatWidth(w)
    } else {
      // Restore the last manual width, clamped to the current column limits
      // so value / DOM / localStorage stay consistent even if the column
      // shrank while follow mode was on.
      const col = readColumnWidth()
      const restored = Math.round(Math.max(MIN_WIDTH, Math.min(latestRef.current, col - EDGE_BUDGET)))
      latestRef.current = restored
      setColumn(col)
      setValue(restored)
      publishChatWidth(restored)
      persistWidth(restored)
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
    // Fallback when no conversation root exists yet (e.g. follow enabled from
    // an empty state): republish once a [data-phase] element appears.
    let knownRoots = document.querySelectorAll('[data-phase]').length
    // 只需感知"根元素出现/消失"：rAF 节流计数，避免流式输出每 token 都做
    // 全文档扫描（宽度跟随本身由 ResizeObserver 负责）。
    let rafId = 0
    const checkRoots = () => {
      rafId = 0
      const roots = document.querySelectorAll('[data-phase]').length
      if (roots !== knownRoots) {
        knownRoots = roots
        apply()
      }
    }
    const mo = new MutationObserver(() => {
      if (rafId === 0) rafId = requestAnimationFrame(checkRoots)
    })
    mo.observe(document.body, { childList: true, subtree: true })
    return () => {
      ro.disconnect()
      mo.disconnect()
      if (rafId !== 0) cancelAnimationFrame(rafId)
      window.removeEventListener('resize', apply)
    }
  }, [follow])

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

  // ── render: 行内控件（跟随开关 + 滑块 + 数值）──
  // 根节点 display:contents，让子元素直接参与设置页那一行的 flex 布局。

  return (
    <div className="dsws-contents">
      <label
        className={'dsws-item' + (disabled ? ' is-disabled' : '')}
        title={t('followInfo')}
      >
        <span className="dsws-label">{t('followLabel')}</span>
        <input
          id="dsh-plugin-width-slider-follow"
          className="dsws-sw"
          type="checkbox"
          checked={follow}
          disabled={disabled}
          onChange={onToggleFollow}
        />
      </label>
      {follow
        ? (
          <span className="dsws-num" title={t('followInfo')}>
            {Math.round(column)}{t('unit')}
          </span>
        )
        : (
          <div className={'dsws-slider-inline' + (disabled ? ' is-disabled' : '')} title={t('info')}>
            <div ref={panelTrackRef} className="dsws-track" onPointerDown={onPointerDown}>
              {/* Fill bar: left edge at the track left, right edge at the knob
                  center plus one thumb radius, so the fill's right end is a
                  semicircle whose center aligns with the knob center.  The knob
                  (same radius) fully covers it — no flat edge shows through. */}
              <div
                className="dsws-fill"
                style={{ width: `calc(${pct}% + ${PANEL_THUMB_R}px)` }}
              />
              <div className="dsws-knob" style={{ left: `${pct}%` }} />
            </div>
            <span className="dsws-num">{Math.round(value)}{t('unit')}</span>
          </div>
        )}
      {preview && previewOverlay}
      {preview && <style>{'body{overflow:hidden!important}'}</style>}
    </div>
  )
}
