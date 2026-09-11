/**
 * Sidebar tools merge.
 *
 * The workspace header carries three 28px icon buttons - search, view options,
 * add workspace - on the same row as the workspace tabs, which leaves the tabs
 * roughly 130px on a 280px sidebar. This moves the two tool containers next to
 * the "new chat" button instead, so the tab row owns the full width.
 *
 * The host owns that markup, so this is a pure DOM patch: each moved node's
 * original parent and next sibling are recorded so the move can be undone, and a
 * MutationObserver re-applies it whenever a re-render takes the nodes back.
 * Anything unexpected - a missing node, a sidebar in rail mode, a changed
 * structure - leaves the sidebar exactly as the host rendered it.
 */

import { onSettingsChanged } from './config.ts'

/** The new-chat button; the row it lives in becomes the toolbar row. */
const NEW_SESSION = '[class*="_newSession"]'/** The search control container (its button plus the collapsible input). */
const SEARCH_SLOT = '[class*="_searchSlot"]'
/** The view-options + add-workspace container. */
const HEADER_ACTIONS = '[class*="_headerActions"]'

/** The injected stylesheet id. */
export const TOOLS_MERGE_STYLE_ID = 'dsh-ws-tools-merge-style'
/** Our row wrapper attribute: `[data-dsh-tools-merge] > (new chat + tools)`. */
export const MERGED_ATTR = 'data-dsh-tools-merge'

const STYLE = `
[data-dsh-tools-merge]{display:flex;align-items:center;gap:4px;width:100%;box-sizing:border-box}
/* The new-chat button owns the free space; the search slot's own flex:1 must not
   compete with it while collapsed. */
[data-dsh-tools-merge]>:first-child{flex:1 1 auto;min-width:0;max-width:100%;transition:max-width 180ms ease,opacity 120ms ease}
[data-dsh-tools-merge]>:nth-child(2){flex:0 0 auto}
/* An expanded search takes the whole row, exactly as the host does on its own row
   (there it hides its actions; here the new-chat button yields instead). */
[data-dsh-tools-merge]:has(> [class*="_searchSlotExpanded"])>:first-child{flex:0 0 auto;max-width:0;overflow:hidden;opacity:0}
[data-dsh-tools-merge]:has(> [class*="_searchSlotExpanded"])>:nth-child(2){flex:1 1 auto}
`

/** Where one moved node came from, so it can be put back. */
interface Origin {
  parent: Node
  next: Node | null
}

/** Wiring for the sidebar tools merge. */
export interface SidebarToolsMergeOptions {
  /** Read the toggle (default on until resolved). */
  enabled: () => boolean
}

/** The installed handle: re-evaluate the toggle, or undo and stop. */
export interface SidebarToolsMergeHandle {
  /** Re-evaluate the toggle now. */
  sync: () => void
  /** Undo the move and stop observing. */
  dispose: () => void
}

/** Inject the row stylesheet once. */
function ensureStyle(): void {
  if (document.getElementById(TOOLS_MERGE_STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = TOOLS_MERGE_STYLE_ID
  style.textContent = STYLE
  document.head.appendChild(style)
}

/**
 * Install the tools merge.
 * @param options - the toggle access.
 * @returns the handle that re-syncs or tears the patch down.
 */
export function installSidebarToolsMerge(options: SidebarToolsMergeOptions): SidebarToolsMergeHandle {
  const moved = new Map<HTMLElement, Origin>()
  let wrapper: HTMLElement | null = null
  let frame = 0
  let disposed = false

  const putBack = (el: HTMLElement, origin: Origin): void => {
    // A stale `next` (the host rebuilt that part) falls back to the end, which
    // is where the host's own append would land anyway.
    if (origin.next !== null && origin.next.parentNode === origin.parent) origin.parent.insertBefore(el, origin.next)
    else origin.parent.appendChild(el)
  }

  const revert = (): void => {
    if (wrapper === null) return
    for (const [el, origin] of moved) putBack(el, origin)
    moved.clear()
    wrapper.remove()
    wrapper = null
  }

  const apply = (): void => {
    const newSession = document.querySelector<HTMLElement>(NEW_SESSION)
    const search = document.querySelector<HTMLElement>(SEARCH_SLOT)
    const actions = document.querySelector<HTMLElement>(HEADER_ACTIONS)
    if (newSession === null || search === null || actions === null) return
    if (wrapper !== null && wrapper.isConnected
      && wrapper.contains(newSession) && wrapper.contains(search) && wrapper.contains(actions)) return
    const row = newSession.parentElement
    if (row === null) return
    // A wrapper the host emptied still owns the nodes it kept: put those back
    // first so the move below starts from the host's own layout.
    if (wrapper !== null) revert()
    for (const el of [newSession, search, actions]) {
      const parent = el.parentNode
      if (parent === null) return
      moved.set(el, { parent, next: el.nextSibling })
    }
    const box = document.createElement('div')
    box.setAttribute(MERGED_ATTR, '')
    row.insertBefore(box, newSession)
    box.append(newSession, search, actions)
    wrapper = box
  }

  // The observer fires for our own edits too; the frame guard plus the
  // "already merged" check keep that from becoming a loop.
  const schedule = (): void => {
    if (disposed || frame !== 0) return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (disposed) return
      if (options.enabled()) apply()
      else if (wrapper !== null) revert()
    })
  }

  const sync = (): void => {
    if (disposed) return
    if (!options.enabled()) {
      revert()
      return
    }
    ensureStyle()
    apply()
  }

  ensureStyle()
  sync()

  const observer = new MutationObserver(schedule)
  observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true })

  // The toggle lives in the plugin settings; react to it without a remount.
  let unsubscribe = (): void => {}
  try {
    unsubscribe = onSettingsChanged(sync)
  } catch { /* 配置尚未就绪时按初始值生效 */ }

  return {
    sync,
    dispose: () => {
      disposed = true
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
      observer.disconnect()
      unsubscribe()
      revert()
      document.getElementById(TOOLS_MERGE_STYLE_ID)?.remove()
    },
  }
}
