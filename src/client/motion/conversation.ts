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
  type MotionStyle, type NewChatMotionStyle, type SidebarMotionStyle,
} from '../../shared/motionSettings.ts'
import {
  ENTRANCE, ENTRANCE_CLASSES, PANEL_DURATION_MS, PANEL_FRAMES, ROLE_ENTRANCE, ROW_IN_CLASS,
  roleOf, styleClass,
} from './frames.ts'
import {
  FRESHNESS_WINDOW_MS, MAX_PENDING_BATCHES, MAX_SWITCH_RETRIES, REPLAY_GRACE_MS,
  SWITCH_REPLAY_MS, SWITCH_RETRY_MS, type PendingBatch,
} from './schedule.ts'
import { staggerDelay } from './stagger.ts'
import { EASE_SETTLE, replayEntrance } from './waapi.ts'
import { revealTextBlock } from './textReveal.ts'

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
 * The thought (reasoning) body. It mounts when the block is expanded or starts
 * streaming open, and it is printed in line by line rather than faded as a whole
 * - the only surface in the transcript whose text arrives once and stays.
 */
const THINK_BODY = '.dsh-ws-think-body'
/**
 * The welcome headline. Matched by the CSS-module name segment the host keeps
 * across builds (`*_headline`); if the host renames it the query misses and the
 * seat entrance simply plays alone.
 */
const HERO_HEADLINE = '[class*="headline"]'

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
  /**
   * Whether transcript rows arrive by role (user message sideways, assistant
   * prose in the chosen style, process rows lightly) instead of every row using
   * the chosen style. Gated by motionRoleEntrance; false = one style for all.
   */
  roleEntrance: boolean
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
  // 键是 DOM 元素且只增不减：容器每次被替换都会留下一个强引用（旁边的 marked 有 delete
  // 清理，这里没有）。WeakMap 语义等价（只 get/set），容器回收后条目随之消失。
  const lastCount = new WeakMap<Element, number>()
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
      row.classList.remove(ROW_IN_CLASS, ...ENTRANCE_CLASSES)
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
      // Role-based arrivals apply to transcript rows only: sidebar tree items
      // have no flow kind, and the rail keeps its own style selection.
      const role = state.roleEntrance && !isTree ? roleOf(row) : undefined
      const byRole = role === undefined ? undefined : ROLE_ENTRANCE[role]
      // The marker records that the row has had its entrance; the animation is
      // imperative because the host may already have resolved the row's style.
      row.classList.add(ROW_IN_CLASS, byRole?.cls ?? styleCls)
      replayEntrance(row, byRole?.frames ?? entrance.frames, {
        duration: byRole?.durationMs ?? entrance.durationMs,
        easing: byRole?.easing ?? entrance.easing,
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
    if (items.length === 0) {
      // 树还没挂上来：继续重试，而不是把 bootScanned 置真 —— 否则重试耗尽之后侧边栏的
      // 首次入场就永久不再补扫。开新链前清掉旧定时器（syncEnabled 每次都开一条，只记
      // 最后一个会留下孤儿链）。
      if (bootAttempts >= MAX_SWITCH_RETRIES) return
      bootAttempts += 1
      if (bootTimer !== 0) window.clearTimeout(bootTimer)
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

  /**
   * Print a thought body in line by line (the expansion moment). Only bodies
   * belonging to a row the engine has ALREADY marked take part: a body arriving
   * together with its row is covered by the row entrance, and animating both
   * would expose the same text twice.
   */
  function revealThinkBodies(bodies: readonly HTMLElement[]): void {
    for (const body of bodies) {
      const row = body.closest(ANCHOR)
      if (row === null || !row.classList.contains(ROW_IN_CLASS)) continue
      revealTextBlock(body)
    }
  }

  /** 新建对话入场的一次性观察器/帧回调，dispose 时一并收口。 */
  let composerObserver: MutationObserver | null = null
  let composerRafId = 0

  const observer = new MutationObserver((mutations) => {
    const byParent = new Map<Element, HTMLElement[]>()
    const removedByParent = new Set<Element>()
    const touched: Element[] = []
    // Thought bodies that mounted in this commit (see revealThinkBodies).
    const thinkBodies: HTMLElement[] = []

    // Rows may be reachable through several mutations in one commit (a subtree
    // mount collects rows their own mutations also report); each row joins
    // exactly one batch, on first sight.
    const seen = new Set<HTMLElement>()
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue
        // A thought body arrives when its block expands or when reasoning starts
        // streaming; it is collected here, separately from the row batches (it is
        // never a row and carries no stagger).
        if (node.matches(THINK_BODY)) thinkBodies.push(node)
        else for (const body of node.querySelectorAll<HTMLElement>(THINK_BODY)) thinkBodies.push(body)
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

    if (thinkBodies.length > 0 && state.transcript) revealThinkBodies(thinkBodies)

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
    replayEntrance(el, PANEL_FRAMES, { duration: PANEL_DURATION_MS, easing: EASE_SETTLE })
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
      replayEntrance(current, entrance.frames, { duration: entrance.durationMs, easing: entrance.easing })
      // The welcome headline is printed in on top of the surface entrance: the
      // seat carries the arrival, the words carry the reading order. It starts
      // once the surface is mostly in, so the two do not fight.
      const headline = current.querySelector<HTMLElement>(HERO_HEADLINE)
      if (headline !== null) revealTextBlock(headline, { delayMs: Math.round(entrance.durationMs * 0.4) })
    }
    // The welcome dialog renders INSIDE the seat (deeper than direct children —
    // the composer stack persists), so observe the whole subtree: the mutation
    // lands in the same microtask as the host's commit (after React's render,
    // before paint), so the content never paints at rest before the entrance
    // starts.
    // 单槽观察器：连续两次 notifySessionSwitch（快速切会话）会覆盖前一个实例，而它仍在
    // 观察、可能补播一次入场，且 dispose 只断得到最后一个。开新的之前先断旧的。
    composerObserver?.disconnect()
    composerObserver = null
    const composerWatch = new MutationObserver(() => {
      composerWatch.disconnect()
      if (composerObserver === composerWatch) composerObserver = null
      const latest = options.getState()
      if (!latest.blank || !latest.newChat) return
      apply()
    })
    composerObserver = composerWatch
    composerWatch.observe(composer, { childList: true, subtree: true })
    // Fallback: the welcome dialog may already be rendered (signal arrived
    // after the commit). Gate on a fresh blank read — by next frame the session
    // ledger is settled, and ordinary switches are skipped.
    composerRafId = requestAnimationFrame(() => {
      composerRafId = 0
      composerWatch.disconnect()
      // 只在槽里仍是自己时才清空：期间可能已经开了新的观察器。
      if (composerObserver === composerWatch) composerObserver = null
      const latest = options.getState()
      if (latest.blank && latest.newChat) apply()
    })
  }

  return {
    dispose: () => {
      disposed = true
      observer.disconnect()
      composerObserver?.disconnect()
      composerObserver = null
      if (composerRafId !== 0) {
        cancelAnimationFrame(composerRafId)
        composerRafId = 0
      }
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
