/**
 * Settings-panel motion (feature: motion).
 *
 * The host settings dialog is a modal dialog that owns a <nav> rail
 * (ui-settings-general SettingsRoot). This module:
 * - marks the panel with an entrance class whose declaration carries both the
 *   transition and its @starting-style start state, so the browser animates the
 *   panel on its first style resolution - no replay, no forced reflow;
 * - anchors that entrance to the trigger button by writing the button's centre
 *   as the panel's transform-origin;
 * - replays a page cross-fade whenever the active nav row changes (the page
 *   column is reused, so that replay is imperative);
 * - intercepts the host's three close paths (the header button, a mask click,
 *   and Escape) and shrinks the REAL panel before letting the close through, so
 *   the exit animates the element the user was looking at rather than a
 *   detached clone.
 *
 * The dialog is identified by structure (role=dialog + a <nav> child) because
 * the host's class names are CSS-module hashes; nothing in the host markup has
 * to change.
 */
import { EASE_FADE, EASE_GLIDE, EASE_SPRING, prefersReducedMotion, replayEntrance, whenTransitionSettles } from './waapi.ts'
import { isPreviewOpen } from '../core/overlayState.ts'
// 弹窗结构契约（选择器、遮罩、关闭控件、内层浮层）统一由 official/ 层描述，这里只
// 消费、不再自带一份 —— 原先 settingsPanelPatch.ts 与这里各写一份，两份已经漂移
// （dialog 选择器一份带 div 前缀、一份不带）。
import {
  contentOf,
  findSettingsDialog,
  innerLayerOpen,
  isCloseButton,
  isHeaderCloseButton,
  isSettingsDialog,
  maskOf,
  triggerOrigin,
} from '../official/settingsDom.ts'

/** Panel entrance class; its CSS declaration also carries the transition. */
export const SETTINGS_PANEL_CLASS = 'dsu-settings-panel'
/** Page cross-fade marker; the replay itself is the imperative animation. */
export const SETTINGS_PAGE_CLASS = 'dsu-settings-page'
/** Mask entrance marker; the fade itself is the imperative animation. */
export const SETTINGS_MASK_CLASS = 'dsu-settings-mask'
/** Applied to the live panel while it shrinks out, before the close lands. */
export const SETTINGS_CLOSING_CLASS = 'dsu-settings-closing'
/** Applied to the live mask while the panel shrinks out. */
export const SETTINGS_MASK_CLOSING_CLASS = 'dsu-settings-mask-closing'

/** Upper bound for the exit transition (opacity 160ms + scale 280ms, plus margin). */
export const EXIT_TIMEOUT_MS = 380
/**
 * Page cross-fade duration (ms); a lightweight swap, so it sits in the `fast` band.
 *
 * 与 MASK_ENTRANCE_MS 同为 200 但不同源：这条是内容列的交叉淡入（位移 4px、
 * EASE_GLIDE，随 nav 切换反复重播），那条是遮罩的纯不透明度淡入（EASE_FADE，
 * 每次开面板只跑一次）。数值重合只是因为两者都落在 `fast` 设计带（150–200ms）。
 */
const PAGE_REPLAY_MS = 200
/**
 * Panel re-entrance duration when the toggle is switched back on; `standard` for a
 * surface this large.
 *
 * 与 motion/frames.ts 的 PANEL_DURATION_MS 同为 320 但不同源：那是对话里面板的
 * 重播（PANEL_FRAMES 为 opacity+translate、EASE_SETTLE），这条是设置弹窗的重播
 * （下面的 PANEL_FRAMES 为 opacity+scale 0.62、EASE_SPRING）—— 元素、关键帧与
 * 曲线都不同，320 只是同一 `standard` 设计带的重合。合并两者会让两个独立决策
 * 被一次改动同时推动。
 */
const PANEL_REPLAY_MS = 320

/** Page cross-fade frames for the reused content column. */
const PAGE_FRAMES: readonly Keyframe[] = [
  { opacity: 0, translate: '0 4px' },
  { opacity: 1, translate: '0 0' },
]
/** Panel entrance frames, replayed when the toggle is switched back on. */
const PANEL_FRAMES: readonly Keyframe[] = [
  { opacity: 0, scale: 0.62 },
  { opacity: 1, scale: 1 },
]
/** Mask entrance frames. */
const MASK_FRAMES: readonly Keyframe[] = [{ opacity: 0 }, { opacity: 1 }]
/** 遮罩淡入时长；与 PAGE_REPLAY_MS 同为 200 的关系见该常量的说明（不同源）。 */
const MASK_ENTRANCE_MS = 200

/** Engine wiring: the settings-motion toggle. */
export interface SettingsMotionOptions {
  /** Read the current settings-motion toggle (default on until resolved). */
  enabled: () => boolean
  /** Subscribe to toggle changes; returns the disposer. */
  subscribe: (listener: () => void) => () => void
}

/** Installed settings-motion handle. */
export interface SettingsMotionHandle {
  /** Stop observing and drop every applied class. */
  dispose: () => void
}

/**
 * Install the settings-panel motion observer.
 * @param options - the settings-motion toggle access.
 * @returns the handle that removes the observer and the applied classes.
 */
export function installSettingsMotion(options: SettingsMotionOptions): SettingsMotionHandle {
  let panel: HTMLElement | null = null
  let mask: HTMLElement | null = null
  let navObserver: MutationObserver | null = null
  let pressedButton: HTMLElement | null = null
  let lastEnabled: boolean | undefined
  let closing = false
  let bypass = false
  let disposed = false

  // The trigger is whatever button the pointer pressed last: the panel is
  // opened by that button, and reading it here avoids depending on the shell's
  // class names or on a single global selector.
  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target
    pressedButton = target instanceof Element ? target.closest('button') : null
  }
  document.addEventListener('pointerdown', onPointerDown, true)

  const dropClasses = (dialog: HTMLElement): void => {
    dialog.classList.remove(SETTINGS_PANEL_CLASS, SETTINGS_CLOSING_CLASS)
    contentOf(dialog)?.classList.remove(SETTINGS_PAGE_CLASS)
    mask?.classList.remove(SETTINGS_MASK_CLASS, SETTINGS_MASK_CLOSING_CLASS)
  }

  const detach = (): void => {
    navObserver?.disconnect()
    navObserver = null
    if (panel !== null) dropClasses(panel)
    panel = null
    mask = null
    closing = false
  }

  /** Replay the page cross-fade on the reused content column. */
  const replayPage = (content: HTMLElement): void => {
    content.classList.add(SETTINGS_PAGE_CLASS)
    replayEntrance(content, PAGE_FRAMES, { duration: PAGE_REPLAY_MS, easing: EASE_GLIDE })
  }

  const attach = (dialog: HTMLElement): void => {
    if (disposed || panel === dialog) return
    detach()
    panel = dialog
    mask = maskOf(dialog)
    lastEnabled = options.enabled()
    if (!lastEnabled) return
    const origin = triggerOrigin(dialog, pressedButton)
    if (origin !== null) {
      dialog.style.setProperty('--dsu-settings-origin-x', origin.x + 'px')
      dialog.style.setProperty('--dsu-settings-origin-y', origin.y + 'px')
    }
    // The class is the state marker; the entrance is imperative. Measuring the
    // trigger above resolves the panel's style before a @starting-style
    // transition could see the class, so a declarative start state would never
    // apply - the panel would simply appear.
    dialog.classList.add(SETTINGS_PANEL_CLASS)
    replayEntrance(dialog, PANEL_FRAMES, { duration: PANEL_REPLAY_MS, easing: EASE_SPRING })
    if (mask !== null) {
      mask.classList.add(SETTINGS_MASK_CLASS)
      replayEntrance(mask, MASK_FRAMES, { duration: MASK_ENTRANCE_MS, easing: EASE_FADE })
    }
    navObserver = new MutationObserver((mutations) => {
      if (disposed || panel !== dialog || !options.enabled()) return
      for (const mutation of mutations) {
        if (mutation.type !== 'attributes' || mutation.attributeName !== 'aria-current') continue
        const content = contentOf(dialog)
        if (content !== null) replayPage(content)
        return
      }
    })
    navObserver.observe(dialog, { subtree: true, attributes: true, attributeFilter: ['aria-current'] })
  }

  /**
   * Shrink the live panel and mask, then run the intercepted close. The real
   * element animates, so the exit is the panel the user was looking at.
   * @param run - the close action to let through once the exit settles.
   */
  const closeWithAnimation = (run: () => void): void => {
    const dialog = panel
    if (dialog === null || closing) return
    if (prefersReducedMotion()) {
      run()
      return
    }
    closing = true
    dialog.classList.add(SETTINGS_CLOSING_CLASS)
    mask?.classList.add(SETTINGS_MASK_CLOSING_CLASS)
    void whenTransitionSettles(dialog, EXIT_TIMEOUT_MS).then(() => {
      closing = false
      // The engine may have been disposed during the exit (the settings row
      // toggles motion, which tears the engine down and rebuilds it). The
      // close itself was already intercepted — preventDefault plus
      // stopImmediatePropagation — so the host never saw it. Replaying it into
      // the torn-down engine is safe: its listeners are gone, and dropping it
      // would leave the settings panel stuck in its shrunk, unclickable state.
      // The replayed event must reach the host this time.
      bypass = true
      try {
        run()
      } finally {
        bypass = false
      }
    })
  }

  // Close paths are intercepted in the capture phase: the host's Escape
  // listener sits on document in the bubble phase, and its button handlers ride
  // React's delegated listener on the root container.
  const onClick = (event: MouseEvent): void => {
    if (disposed || bypass || closing || panel === null || !options.enabled()) return
    const target = event.target
    if (!(target instanceof Element)) return
    const dialog = panel
    // A panel the host unmounted or replaced must not keep intercepting clicks;
    // re-check the structure so a stale reference can never swallow a close.
    if (!dialog.isConnected || !isSettingsDialog(dialog)) {
      detach()
      return
    }
    if (mask !== null && !mask.isConnected) mask = null
    const button = target.closest('button')
    const onMask = mask !== null && (target === mask || mask.contains(target))
    const onClose = button !== null && dialog.contains(button)
      && (isCloseButton(button) || isHeaderCloseButton(dialog, button))
    if (!onMask && !onClose) return
    // A Menu or a nested modal consumes this click itself; shrinking the whole
    // panel would close the wrong layer.
    if (innerLayerOpen(dialog)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    // 快照遮罩元素：退出动画期间引擎可能被卸载（detach 会把 mask 置空），
    // 关闭动作仍要落到用户点的那一层上。
    const maskEl = mask
    closeWithAnimation(() => {
      if (onMask) maskEl?.click()
      else button?.click()
    })
  }
  document.addEventListener('click', onClick, true)

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || disposed || bypass || closing || panel === null || !options.enabled()) return
    // 预览（拖宽度时面板被隐藏）开着时，这次 Escape 属于预览：既不拦、也不放行关闭，
    // 否则一次按键会同时退出预览并关掉整个设置面板。
    if (isPreviewOpen()) return
    // Escape belongs to an open Menu or nested modal first.
    if (innerLayerOpen(panel)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    closeWithAnimation(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
  }
  document.addEventListener('keydown', onKeyDown, true)

  const scan = (): void => {
    if (disposed) return
    // A mounted, still-connected panel is already tracked. Streaming output
    // mutates the DOM constantly, and a full-document dialog query on every
    // mutation would be wasted work.
    if (panel !== null && panel.isConnected) return
    const dialog = findSettingsDialog()
    if (dialog !== null) {
      if (dialog !== panel) attach(dialog)
      return
    }
    detach()
  }

  const observer = new MutationObserver(scan)
  observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true })
  scan()

  const unsubscribe = options.subscribe(() => {
    if (disposed || panel === null) return
    const on = options.enabled()
    // The scope notifies on every snapshot change (its first resolve lands
    // after the dialog opened). Replaying then would restart the entrance the
    // panel is already playing - the visible double flash. Only a real toggle
    // edge re-animates.
    if (on === lastEnabled) return
    lastEnabled = on
    if (!on) {
      dropClasses(panel)
      return
    }
    panel.classList.add(SETTINGS_PANEL_CLASS)
    mask?.classList.add(SETTINGS_MASK_CLASS)
    replayEntrance(panel, PANEL_FRAMES, { duration: PANEL_REPLAY_MS, easing: EASE_SPRING })
    const content = contentOf(panel)
    if (content !== null) replayPage(content)
  })

  return {
    dispose: () => {
      disposed = true
      observer.disconnect()
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      unsubscribe()
      detach()
    },
  }
}
