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
import { EASE_FADE, EASE_GLIDE, prefersReducedMotion, replayEntrance, whenTransitionSettles } from './animate.ts'

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

/** The settings dialog: a modal dialog that owns a nav rail. */
const DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]'
/** The settings trigger: the shell button that opens the dialog. */
const TRIGGER_SELECTOR = 'button[aria-haspopup="dialog"]'
/** Upper bound for the exit transition (motion.module.css: 220ms). */
const EXIT_TIMEOUT_MS = 320
/** Page cross-fade duration (ms); the imperative animation supplies it. */
const PAGE_REPLAY_MS = 240
/** Panel re-entrance duration when the toggle is switched back on. */
const PANEL_REPLAY_MS = 340

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
const MASK_ENTRANCE_MS = 200

/**
 * Words that name a close control. The host close button carries its
 * accessible name as visually-hidden slot text, so the button's own text IS
 * the localized word for "close". The length cap keeps a long paragraph that
 * happens to start with one of these words from matching.
 */
const CLOSE_LABEL = /^(close|dismiss|关闭|關閉|閉じる|닫기|schließen|fermer|cerrar|chiudi|sluiten|zamknij|fechar|закрыть|kapat|đóng)/i

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
 * True for the host settings dialog (modal dialog + nav rail).
 * @param node - a candidate dialog element.
 */
function isSettingsDialog(node: Element): boolean {
  return node.matches(DIALOG_SELECTOR) && node.querySelector('nav') !== null
}

/** The mounted settings dialog, or null. */
function findSettingsDialog(): HTMLElement | null {
  for (const dialog of document.querySelectorAll<HTMLElement>(DIALOG_SELECTOR)) {
    if (isSettingsDialog(dialog)) return dialog
  }
  return null
}

/**
 * The scale anchor for the panel: the centre of the settings trigger in the
 * panel's own coordinate space, so the panel grows out of the button instead
 * of the viewport centre. Returns null when neither a recently pressed button
 * nor the shell trigger is measurable (jsdom, detached markup).
 * @param dialog - the live settings dialog.
 * @param pressed - the most recent button pressed by the pointer, if any.
 */
function triggerOrigin(dialog: HTMLElement, pressed: HTMLElement | null): { x: number; y: number } | null {
  const trigger = pressed?.isConnected === true ? pressed : document.querySelector<HTMLElement>(TRIGGER_SELECTOR)
  if (trigger === null) return null
  const panelRect = dialog.getBoundingClientRect()
  const triggerRect = trigger.getBoundingClientRect()
  if (panelRect.width === 0 || panelRect.height === 0 || triggerRect.width === 0 || triggerRect.height === 0) {
    return null
  }
  return {
    x: triggerRect.left + triggerRect.width / 2 - panelRect.left,
    y: triggerRect.top + triggerRect.height / 2 - panelRect.top,
  }
}

/** The panel's scrolling content column (the nav rail's sibling). */
function contentOf(dialog: HTMLElement): HTMLElement | null {
  const content = dialog.querySelector('nav')?.nextElementSibling
  return content instanceof HTMLElement ? content : null
}

/** Whether a button names itself as a close control. */
function isCloseButton(button: HTMLElement): boolean {
  const label = (button.getAttribute('aria-label') ?? button.getAttribute('title') ?? button.textContent ?? '').trim()
  return label.length > 0 && label.length <= 24 && CLOSE_LABEL.test(label)
}

/**
 * Whether the button is the dialog header's own close control. The header is
 * the content column's first child and the close button is its direct child
 * (the action seat sits in a nested element); this structural check keeps the
 * exit working when the localized label changes.
 * @param dialog - the live settings dialog.
 * @param button - the pressed button.
 */
function isHeaderCloseButton(dialog: HTMLElement, button: HTMLElement): boolean {
  const header = contentOf(dialog)?.firstElementChild
  return header instanceof HTMLElement && button.parentElement === header
}

/**
 * Whether an inner floating layer owns the interaction: an open Menu (the
 * settings page renders several, portaled to the body) or a nested modal.
 * Those consume Escape and outside-clicks themselves, so the close paths must
 * let the event through instead of shrinking the whole panel.
 * @param dialog - the live settings dialog.
 */
function innerLayerOpen(dialog: HTMLElement): boolean {
  if (document.querySelector('[role="menu"]') !== null) return true
  for (const other of document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')) {
    if (other !== dialog) return true
  }
  return false
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
    const overlay = dialog.parentElement
    mask = overlay?.querySelector<HTMLElement>('[aria-hidden="true"]') ?? null
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
    replayEntrance(dialog, PANEL_FRAMES, { duration: PANEL_REPLAY_MS, easing: EASE_GLIDE })
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
    closeWithAnimation(() => {
      if (onMask) mask?.click()
      else button?.click()
    })
  }
  document.addEventListener('click', onClick, true)

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || disposed || bypass || closing || panel === null || !options.enabled()) return
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
    replayEntrance(panel, PANEL_FRAMES, { duration: PANEL_REPLAY_MS, easing: EASE_GLIDE })
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
