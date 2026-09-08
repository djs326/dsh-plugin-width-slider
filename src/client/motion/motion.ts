/**
 * Conversation entrance-motion engine (feature: motion).
 *
 * Watches two host surfaces:
 * - The transcript chat rows — the host renders one `[data-chat-anchor-key]`
 *   wrapper per message (user / assistant / tool, all kinds) inside a
 *   `[data-chat-flow]` column that stays mounted across conversation switches.
 * - The sidebar session tree — `[role="treeitem"]` rows (workspace groups and
 *   sessions) inside `[role="tree"]` containers.
 *
 * Every entrance runs imperatively through the Web Animations API:
 * - A CSS `@starting-style` transition only fires on an element's FIRST style
 *   resolution, and the host forces one while it mounts a row (layout effects,
 *   scroll-into-view, measurement) before this observer's microtask can mark the
 *   element. The declarative start state therefore never applied and rows
 *   appeared at rest.
 * - Web Animations runs whenever it is asked to, retargets from the live value
 *   instead of restarting, and needs no forced reflow. `fill: 'backwards'` holds
 *   the start frame across a stagger delay, so a row never flashes at its
 *   resting style before its turn.
 *
 * Batch classification: a "load" batch (the container was empty before, or rows
 * were removed in the same batch = first render / conversation switch) gets a
 * per-row stagger so the surface cascades in instead of popping; an
 * "incremental" batch (streaming turns, older-history paging, search results,
 * group expand) gets no delay and, for the tree, no entrance at all — only
 * wholesale loads animate the sidebar.
 *
 * The observer starts before the settings scope resolves, buffering batches
 * until the feature state lands, so even a slow settings load still captures the
 * very first conversation render.
 */
import {
  MOTION_STYLES, NEW_CHAT_MOTION_STYLES, SIDEBAR_MOTION_STYLES,
  type MotionStyle, type NewChatMotionStyle, type SidebarMotionStyle,
} from '../../shared/motionSettings.ts'
import { EASE_GLIDE, replayEntrance } from './animate.ts'

/** Chat-row selector: the host renders one anchored row per message. */
const ANCHOR = '[data-chat-anchor-key]'
/** Sidebar tree items: session/workspace rows inside a `role="tree"`. */
const TREE_ITEM = '[role="tree"] [role="treeitem"]'
/**
 * Anything inside the conversation view. The trajectory JSON tree
 * (ui-primitives JsonTree) and the subagent lineage tree also render
 * role="tree"/"treeitem", but they belong to the transcript, not the sidebar
 * rail - without this guard they would take the sidebar entrance.
 */
const CONVERSATION_VIEW = '[data-conversation-scroll], [data-chat-flow]'
/** Every tracked item on a container (rows + tree items, one kind per container). */
const ITEM_SELECTOR = `${ANCHOR}, ${TREE_ITEM}`

/**
 * Transcript-column entrance marker. The class records that the column has had
 * its arrival; the fade-and-drop itself is the imperative animation in
 * panelEntrance, not a CSS rule.
 */
export const PANEL_ANIMATION_CLASS = 'dsu-motion-panel'

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
 * Entrance keyframes and duration per style. Opacity always arrives on the
 * shorter side and travel or scale on the longer one, which reads as the row
 * settling rather than sliding to a stop.
 */
const ENTRANCE: Record<EntranceStyle, { frames: Keyframe[]; durationMs: number }> = {
  'fade-up': {
    frames: [{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }],
    durationMs: 300,
  },
  fade: {
    frames: [{ opacity: 0 }, { opacity: 1 }],
    durationMs: 220,
  },
  'rise-scale': {
    frames: [
      { opacity: 0, translate: '0 8px', scale: 0.98 },
      { opacity: 1, translate: '0 0', scale: 1 },
    ],
    durationMs: 300,
  },
  'slide-in': {
    frames: [{ opacity: 0, translate: '12px 0' }, { opacity: 1, translate: '0 0' }],
    durationMs: 280,
  },
  'blur-in': {
    frames: [
      { opacity: 0, filter: 'blur(6px)', translate: '0 4px' },
      { opacity: 1, filter: 'blur(0px)', translate: '0 0' },
    ],
    durationMs: 280,
  },
  'scale-in': {
    frames: [{ opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1 }],
    durationMs: 280,
  },
  'slide-left': {
    frames: [{ opacity: 0, translate: '-10px 0' }, { opacity: 1, translate: '0 0' }],
    durationMs: 280,
  },
  expand: {
    frames: [
      { opacity: 0, scale: '1 0.8', transformOrigin: 'top' },
      { opacity: 1, scale: '1 1', transformOrigin: 'top' },
    ],
    durationMs: 280,
  },
  'slide-down': {
    frames: [{ opacity: 0, translate: '0 -10px' }, { opacity: 1, translate: '0 0' }],
    durationMs: 280,
  },
  reveal: {
    frames: [{ opacity: 0, translate: '0 4px' }, { opacity: 1, translate: '0 0' }],
    durationMs: 460,
  },
  bloom: {
    frames: [{ opacity: 0, scale: 0.99 }, { opacity: 1, scale: 1 }],
    durationMs: 460,
  },
  zoom: {
    frames: [{ opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1 }],
    durationMs: 440,
  },
}

/** Transcript-column entrance; the column stays mounted across switches. */
const PANEL_FRAMES: readonly Keyframe[] = [
  { opacity: 0.5, translate: '0 6px' },
  { opacity: 1, translate: '0 0' },
]
const PANEL_DURATION_MS = 300

/** Per-row stagger step on load batches (ms). */
export const STAGGER_STEP_MS = 40
/** Stagger cap: rows beyond this wait no longer (the tail joins together). */
export const STAGGER_CAP_MS = 320
/** Longest buffered batch queue while the feature is disabled. */
const MAX_PENDING_BATCHES = 8
/**
 * Buffered batches older than this (ms) are dropped at flush: their rows have
 * been on screen long enough that replaying the entrance would read as a
 * pop-in, not an arrival. Covers slow settings resolution and re-enables.
 */
const FRESHNESS_WINDOW_MS = 400
/** Delay before the session-switch replay scans the transcript (host commit). */
const SWITCH_REPLAY_MS = 60
/** Retry interval while the transcript rows have not mounted yet. */
const SWITCH_RETRY_MS = 80
/** Max replay retries before giving up on an empty transcript. */
const MAX_SWITCH_RETRIES = 12
/**
 * A row animated within this window is not replayed again. The observer already
 * animates freshly mounted rows; the session-switch replay exists to cover rows
 * it could not correlate, so replaying a row that just started its entrance
 * would restart it mid-flight — the visible double flash.
 */
const REPLAY_GRACE_MS = 400

/** Pure: the entrance delay for the i-th row of a load batch (0-based). */
export function staggerDelay(index: number): number {
  const i = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0
  return Math.min(i * STAGGER_STEP_MS, STAGGER_CAP_MS)
}

/** Pure: whether an added node is a top-level chat row (not nested in one). */
export function isChatRow(node: Node): node is HTMLElement {
  return node instanceof HTMLElement
    && node.matches(ANCHOR)
    && node.parentElement?.closest(ANCHOR) === null
}

/**
 * Pure: whether a node is a sidebar rail row. Two host surfaces use
 * role="tree"/"treeitem" without being the rail, and both are excluded:
 * - trees rendered inside the conversation view (the trajectory JSON tree);
 * - trees portaled straight onto document.body (the subagent lineage
 *   dropdown), whose own parent element is the body.
 * Nested items are still allowed: session rows live INSIDE their workspace
 * group row (the host nests them), so a top-level-only check would silently
 * drop them.
 * @param node - a candidate element.
 */
export function isTreeItem(node: Node): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false
  if (!node.matches(TREE_ITEM)) return false
  if (node.closest(CONVERSATION_VIEW) !== null) return false
  // A portal target is the body itself; the rail always has a real ancestor.
  return node.closest('[role="tree"]')?.parentElement !== document.body
}

/** Engine wiring: the current feature state (scope-driven). */
export interface MotionEngineState {
  /** Transcript entrance (rows + column panel), gated by motionEnabled. */
  transcript: boolean
  /** Sidebar tree entrance (initial load + group expand), gated by sidebarMotionEnabled. */
  sidebar: boolean
  /** Blank-session (new conversation) entrance, gated by newChatMotionEnabled. */
  newChat: boolean
  /** The entrance style new transcript rows should use. */
  style: MotionStyle
  /** The entrance style the blank-session (new conversation) dialog uses. */
  newChatStyle: NewChatMotionStyle
  /** The entrance style new sidebar tree items should use. */
  sidebarStyle: SidebarMotionStyle
  /**
   * Whether the current session is blank (a brand-new conversation): the
   * composer seat — which hosts the blank-session hero — animates in only for
   * these, so a new conversation's main dialog visibly appears while ordinary
   * switches leave the seat alone.
   */
  blank: boolean
}

/** Whether any motion toggle is on (the engine stays inert only when all are off). */
export function anyMotionEnabled(state: MotionEngineState): boolean {
  return state.transcript || state.sidebar || state.newChat
}

/** Engine wiring: reads the feature state and subscribes to its changes. */
export interface MotionEngineOptions {
  /** The current feature state (scope-driven). */
  getState: () => MotionEngineState
  /** Subscribe to state changes (settings scope); returns the disposer. */
  subscribe: (listener: () => void) => () => void
}

/** One observed row batch: the rows + whether it is a load (stagger) batch. */
interface PendingBatch {
  rows: HTMLElement[]
  load: boolean
  /** Epoch ms when the rows were observed (freshness gate at flush). */
  time: number
}

/** The installed engine handle: teardown + the session-switch replay signal. */
export interface MotionEngine {
  /** Tear the engine down (disconnect, unsubscribe, unmark rows). */
  dispose: () => void
  /**
   * Force-replay the entrance on every mounted row. Called on conversation
   * switches: the host remounts the whole transcript, and this covers every way
   * those rows may reach the DOM (including ones the observer cannot
   * correlate), so every open/switch animates — not just the first.
   */
  notifySessionSwitch: () => void
}

/**
 * Install the entrance-motion engine. Starts observing immediately (batches
 * buffer while disabled) and returns the engine handle: teardown plus the
 * session-switch replay signal (see {@link MotionEngine}).
 * @param options - feature-state access (scope-driven).
 */
export function installConversationEntrance(options: MotionEngineOptions): MotionEngine {
  let state = options.getState()
  let pending: PendingBatch[] = []
  const marked = new Set<HTMLElement>()
  /** When each marked row last started its entrance (the replay grace window). */
  const markedAt = new WeakMap<HTMLElement, number>()
  // Per-container anchor-row count from the last observed batch, used to tell
  // a first render (empty before) from an incremental append.
  const lastCount = new Map<Element, number>()
  // Session-switch replay bookkeeping.
  let switchTimer = 0
  let switchAttempts = 0
  let bootTimer = 0
  let bootAttempts = 0
  let disposed = false
  // One-shot boot scan: marks tree items the observer missed (the sidebar tree
  // can mount before the engine installs); never re-runs on switches.
  let bootScanned = false

  const clearMarked = (): void => {
    for (const row of marked) {
      row.classList.remove(ROW_IN_CLASS, ...STYLE_CLASSES)
      row.style.removeProperty('--dsu-motion-delay')
    }
    marked.clear()
  }

  function applyBatch(rows: readonly HTMLElement[], load: boolean): void {
    // Document-order the batch so the stagger cascades top-down.
    const ordered = [...rows].sort((a, b) => {
      if (a === b) return 0
      return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1
    })
    // Batches are homogeneous (transcript rows or sidebar tree items); each
    // surface carries its own style selection.
    const isTree = ordered[0] !== undefined && isTreeItem(ordered[0])
    const style = isTree ? state.sidebarStyle : state.style
    const styleCls = styleClass(style)
    const entrance = ENTRANCE[style]
    for (let i = 0; i < ordered.length; i++) {
      const row = ordered[i]!
      const delay = load ? staggerDelay(i) : 0
      // Observable marker for tests and debugging; the visible stagger comes
      // from the animation's own delay below.
      row.style.setProperty('--dsu-motion-delay', `${delay}ms`)
      // The marker records that the row has had its entrance; the animation is
      // imperative because the host may already have resolved the row's style.
      row.classList.add(ROW_IN_CLASS, styleCls)
      replayEntrance(row, entrance.frames, {
        duration: entrance.durationMs,
        easing: EASE_GLIDE,
        delay,
      })
      marked.add(row)
      markedAt.set(row, performance.now())
    }
  }

  function syncEnabled(): void {
    const next = options.getState()
    if (!anyMotionEnabled(next)) {
      pending = []
      clearMarked()
    }
    // Style changes only affect rows mounted from now on; already-marked rows
    // keep the animation they started with.
    state = next
    // Flush whenever anything is active (idempotent): covers the initial scope
    // resolve (buffered first load) and every re-enable after a toggle.
    if (anyMotionEnabled(state)) {
      flush()
      scanTreeBoot()
    }
  }

  /**
   * One-shot boot scan for the sidebar tree: the tree can mount before the
   * engine installs (page-restored session), so its items would never reach the
   * observer. Marks whatever the observer missed with the load stagger. Retries
   * briefly until the tree has mounted.
   */
  function scanTreeBoot(): void {
    if (disposed || !anyMotionEnabled(state)) return
    const items = [...document.querySelectorAll<HTMLElement>(TREE_ITEM)].filter(isTreeItem)
    if (items.length === 0 && bootAttempts < MAX_SWITCH_RETRIES) {
      bootAttempts += 1
      bootTimer = window.setTimeout(scanTreeBoot, SWITCH_RETRY_MS)
      return
    }
    if (bootScanned) return
    bootScanned = true
    const fresh = items.filter((item) => !item.classList.contains(ROW_IN_CLASS))
    if (fresh.length > 0 && state.sidebar) applyBatch(fresh, true)
  }

  function flush(): void {
    if (pending.length === 0) return
    const now = performance.now()
    const fresh = pending.filter((batch) => now - batch.time <= FRESHNESS_WINDOW_MS)
    for (const batch of fresh) {
      const isTree = batch.rows[0] !== undefined && isTreeItem(batch.rows[0])
      if (isTree ? !state.sidebar : !state.transcript) continue
      applyBatch(batch.rows, batch.load)
    }
    pending = []
  }

  const observer = new MutationObserver((mutations) => {
    const byParent = new Map<Element, HTMLElement[]>()
    const removedByParent = new Set<Element>()
    const touched: Element[] = []

    // Rows may be reachable through several mutations in one commit (a subtree
    // mount collects rows their own mutations also report); each row joins
    // exactly one batch, on first sight.
    const seen = new Set<HTMLElement>()
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue
        // The host may attach rows inside a wrapper element (sidebar session
        // rows mount inside a span): collect direct rows AND rows nested in the
        // added subtree. (Direct matches, not the type-guard helpers: their
        // `is HTMLElement` predicates would narrow the else branch to never.)
        const rows: HTMLElement[] = []
        if (node.matches(ANCHOR) || node.matches(TREE_ITEM)) {
          rows.push(node)
        } else {
          for (const inner of node.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) rows.push(inner)
        }
        for (const row of rows) {
          // Trees inside the conversation view match TREE_ITEM but are
          // transcript content; the rail guard drops them here as well.
          if (row.matches(TREE_ITEM) && !isTreeItem(row)) continue
          if (seen.has(row)) continue
          seen.add(row)
          const parent = row.parentElement
          if (parent === null) continue
          const list = byParent.get(parent)
          if (list === undefined) byParent.set(parent, [row])
          else list.push(row)
          touched.push(parent)
        }
      }
      for (const node of mutation.removedNodes) {
        if (!(node instanceof HTMLElement)) continue
        const hadItems = node.matches(ANCHOR) || node.querySelector(ANCHOR) !== null
          || node.matches(TREE_ITEM) || node.querySelector(TREE_ITEM) !== null
        if (!hadItems) continue
        // Release the references: a marked row that left the DOM must not stay
        // pinned in `marked` (an unbounded Set) for the life of the page.
        if (node.matches(ANCHOR) || node.matches(TREE_ITEM)) marked.delete(node)
        for (const gone of node.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) marked.delete(gone)
        // Direct item removal: the items' container is the mutation target (the
        // removed node is detached by the time this callback runs, so its
        // parentElement is null). Wholesale subtree removal (conversation
        // switch): the container is the removed node itself.
        const parent = node.matches(ANCHOR) || node.matches(TREE_ITEM) ? mutation.target : node
        if (!(parent instanceof Element)) continue
        removedByParent.add(parent)
        touched.push(parent)
      }
    }

    // Decide load vs incremental from the PRE-mutation counts, then refresh.
    const batches: PendingBatch[] = []
    for (const [parent, rows] of byParent) {
      const wasEmpty = (lastCount.get(parent) ?? 0) === 0
      batches.push({ rows, load: removedByParent.has(parent) || wasEmpty, time: performance.now() })
    }
    for (const parent of touched) {
      lastCount.set(parent, parent.querySelectorAll(ITEM_SELECTOR).length)
    }

    if (state.transcript || state.sidebar) {
      for (const batch of batches) {
        // Sidebar tree: wholesale loads stagger; incremental batches (group
        // expand, search results) fade in immediately with no delay — rows
        // appear when the group opens.
        if (batch.rows[0] !== undefined && isTreeItem(batch.rows[0])) {
          if (!state.sidebar) continue
          applyBatch(batch.rows, batch.load)
          continue
        }
        if (state.transcript) applyBatch(batch.rows, batch.load)
      }
    } else {
      pending.push(...batches.filter((batch) => {
        if (batch.load) return true
        // While disabled, only transcript batches are worth buffering.
        return batch.rows[0] !== undefined && !isTreeItem(batch.rows[0])
      }))
      if (pending.length > MAX_PENDING_BATCHES) {
        pending.splice(0, pending.length - MAX_PENDING_BATCHES)
      }
    }
  })

  // The app renders into #root, so the body exists by the time the plugin
  // applies; the fallback keeps a pre-bootstrap boot from crashing.
  observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true })

  const unsubscribe = options.subscribe(syncEnabled)
  syncEnabled() // initial: flush anything buffered before the first scope read

  /**
   * Force-replay the entrance on the transcript rows (load batch:
   * document-order stagger). Retries briefly while the host is still committing
   * the new transcript, so a slow switch still animates.
   */
  function tryReplay(): void {
    if (disposed || !anyMotionEnabled(state)) return
    const rows = [...document.querySelectorAll<HTMLElement>(ANCHOR)].filter(isChatRow)
    const flow = document.querySelector<HTMLElement>('[data-chat-flow]')
    if (rows.length === 0 && flow === null && switchAttempts < MAX_SWITCH_RETRIES) {
      switchAttempts += 1
      switchTimer = window.setTimeout(tryReplay, SWITCH_RETRY_MS)
      return
    }
    const now = performance.now()
    const fresh = rows.filter((row) => {
      const at = markedAt.get(row)
      return at === undefined || now - at > REPLAY_GRACE_MS
    })
    if (fresh.length > 0 && state.transcript) applyBatch(fresh, true)
    // The transcript column re-enters on every open/switch: one arrival (panel
    // fade + row stagger together).
    if (flow !== null && state.transcript) panelEntrance(flow)
  }

  function panelEntrance(el: HTMLElement): void {
    el.classList.add(PANEL_ANIMATION_CLASS)
    replayEntrance(el, PANEL_FRAMES, { duration: PANEL_DURATION_MS, easing: EASE_GLIDE })
  }

  /**
   * Schedule the blank-session (new conversation) entrance: play it the moment
   * the host renders the welcome dialog into the composer seat. One-shot per
   * signal; a same-frame fallback covers the case where the content was already
   * rendered before the signal arrived.
   */
  function scheduleComposerEntrance(style: NewChatMotionStyle): void {
    const composer = document.querySelector<HTMLElement>('[data-composer-seat]')
    if (composer === null) return
    let applied = false
    const apply = (): void => {
      if (disposed || applied) return
      // Re-resolve the seat: the host may REMOUNT it while the welcome dialog
      // renders, which would orphan the element captured above.
      const current = document.querySelector<HTMLElement>('[data-composer-seat]')
      if (current === null) return
      applied = true
      const entrance = ENTRANCE[style]
      current.classList.add(styleClass(style))
      replayEntrance(current, entrance.frames, { duration: entrance.durationMs, easing: EASE_GLIDE })
    }
    // The welcome dialog renders INSIDE the seat (deeper than direct children —
    // the composer stack persists), so observe the whole subtree: the mutation
    // lands in the same microtask as the host's commit (after React's render,
    // before paint), so the content never paints at rest before the entrance
    // starts.
    const observer = new MutationObserver(() => {
      observer.disconnect()
      const latest = options.getState()
      if (!latest.blank || !latest.newChat) return
      apply()
    })
    observer.observe(composer, { childList: true, subtree: true })
    // Fallback: the welcome dialog may already be rendered (signal arrived
    // after the commit). Gate on a fresh blank read — by next frame the session
    // ledger is settled, and ordinary switches are skipped.
    requestAnimationFrame(() => {
      observer.disconnect()
      const latest = options.getState()
      if (latest.blank && latest.newChat) apply()
    })
  }

  return {
    dispose: () => {
      disposed = true
      observer.disconnect()
      unsubscribe()
      window.clearTimeout(switchTimer)
      window.clearTimeout(bootTimer)
      pending = []
      clearMarked()
    },
    notifySessionSwitch: () => {
      if (disposed) return
      const latest = options.getState()
      if (latest.newChat) scheduleComposerEntrance(latest.newChatStyle)
      // Replay the transcript after the host commits the new rows; always
      // replay (interrupting an in-flight entrance is invisible — both end at
      // rest).
      window.clearTimeout(switchTimer)
      switchAttempts = 0
      switchTimer = window.setTimeout(tryReplay, SWITCH_REPLAY_MS)
    },
  }
}
