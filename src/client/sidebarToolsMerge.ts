/**
 * Sidebar tools placement.
 *
 * The workspace header carries three 28px icon buttons - search, view options,
 * add workspace - on the same row as the workspace tabs, which leaves the tabs
 * roughly 130px on a 280px sidebar. This pins the tools over the "new chat" row
 * instead, so the tab row owns the full width.
 *
 * The host's DOM is never touched. Reparenting the tool containers into a wrapper
 * of our own breaks the host's unmounting: the nodes no longer sit under the
 * parent React records, so collapsing the sidebar to the rail throws
 * `NotFoundError: removeChild` from the workspace region's unmount. Here the
 * containers stay where the host put them and are pinned by an injected
 * stylesheet, with the new-chat button padded to make room. A wrong measurement
 * only costs a wrong-looking row.
 *
 * The column is measured through the new-chat button's parent, not through a
 * class of the column itself: the shell adds and removes some of the column's
 * classes as the pointer enters and leaves the sidebar, so a query for one of
 * them fails exactly while the user is pointing at the sidebar - which is when a
 * re-measure is triggered. The button's own box cannot stand in for the column
 * either, since the injected rule narrows it.
 */
import { onSettingsChanged } from './config.ts'

/** The new-chat button whose row hosts the tools. */
const NEW_SESSION = '[class*="_newSession"]'
/** The new-chat button's label: the text the button must still fit in full. */
const NEW_SESSION_LABEL = '[class*="_newSessionLabel"]'
/** The workspace header that owns the two tool containers. */
const SECTION_HEADER = '[class*="_sectionHeader"]'
/** The search control's container (its button plus the collapsible input). */
const SEARCH_SLOT = '[class*="_searchSlot"]'
/** The view-options + add-workspace container. */
const HEADER_ACTIONS = '[class*="_headerActions"]'
/** The search container's own "expanded" class (hash-prefixed by the host). */
const SEARCH_SLOT_EXPANDED = '[class*="_searchSlotExpanded"]'

/** Injected stylesheet id. */
export const TOOLS_STYLE_ID = 'dsh-ws-tools-merge-style'
/** Below this column width the sidebar is a rail; the host layout stands. */
const MIN_COLUMN_WIDTH = 200
/** The tool icons are 28px tall in the host's own rows. */
const ICON_SIZE = 28
/** The search container's own width in the host layout (one 28px icon button). */
const SEARCH_WIDTH = 28
/** The view-options + add-workspace container's own width in the host layout. */
const ACTIONS_WIDTH = 60
/** The inset the tools keep from the column edge and from each other. */
const EDGE_GAP = 8
/** The inset a column too narrow for `EDGE_GAP` falls back to. */
const TIGHT_GAP = 4
/**
 * The button's horizontal chrome once the injected rule applies: the host's 16px
 * left padding, the injected 0 right padding, and the 1px border. The label's
 * own room starts after this.
 */
const BUTTON_CHROME = 17
/** The icon and the button's own gap, which the label's room starts after. */
const BUTTON_LEAD = 20

/** Where the tools sit for the current layout, in viewport coordinates. */
interface Placement {
  /** Vertical centre of the new-chat row. */
  top: number
  /** Distance from the viewport's right edge to the actions container. */
  actionsRight: number
  /** Distance from the viewport's right edge to the search container. */
  searchRight: number
  /** The new-chat button's left edge, for an expanded search's full-width row. */
  left: number
}

/**
 * The placement stylesheet, or an empty string to leave the host layout alone.
 *
 * `fixed` rather than `absolute`: the tool containers live inside the workspace
 * region, whose ancestors (section header, region area, sidebar column, frame)
 * all clip with `overflow: hidden`. An absolutely positioned child across that
 * chain is painted nowhere, so the tools are pinned to the viewport instead -
 * this sidebar never scrolls, and no ancestor sets a transform that would
 * re-anchor `fixed`.
 * @param place - the measured viewport coordinates.
 * @param gutter - the width the new-chat button gives up, matching `place`.
 * @param gap - the inset `place` was measured with.
 */
function placementCss(place: Placement, gutter: number, gap: number): string {
  const tools = `${SECTION_HEADER}>${SEARCH_SLOT},${SECTION_HEADER}>${HEADER_ACTIONS}`
  return `
${tools}{position:fixed;display:flex;align-items:center;gap:${gap}px;z-index:60}
${SECTION_HEADER}>${HEADER_ACTIONS}{top:${place.top}px;right:${place.actionsRight}px}
${SECTION_HEADER}>${SEARCH_SLOT}{top:${place.top}px;right:${place.searchRight}px}
${SECTION_HEADER}>${SEARCH_SLOT_EXPANDED}{left:${place.left}px;right:${place.actionsRight}px}
${NEW_SESSION}{width:calc(100% - ${gutter}px);max-width:calc(100% - ${gutter}px);min-width:fit-content;padding-right:0}
`
}

/** Wiring for the tools placement. */
export interface SidebarToolsMergeOptions {
  /** Read the toggle (default on until resolved). */
  enabled: () => boolean
}

/** The installed handle: re-evaluate the toggle, or tear the stylesheet down. */
export interface SidebarToolsMergeHandle {
  /** Re-evaluate the toggle now. */
  sync: () => void
  /** Remove the stylesheet and stop observing. */
  dispose: () => void
}

/**
 * Install the tools placement.
 * @param options - the toggle access.
 * @returns the handle that re-syncs or removes the placement.
 */
export function installSidebarToolsMerge(options: SidebarToolsMergeOptions): SidebarToolsMergeHandle {
  const style = document.createElement('style')
  style.id = TOOLS_STYLE_ID
  document.getElementById(TOOLS_STYLE_ID)?.remove()
  document.head.appendChild(style)

  let frame = 0
  let disposed = false
  let current = ''

  /** Write the stylesheet only when its text actually changes. */
  const publish = (css: string): void => {
    if (css === current) return
    current = css
    style.textContent = css
  }

  const schedule = (): void => {
    if (disposed || frame !== 0) return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (!disposed) apply()
    })
  }

  // A rail toggle is a class swap that changes the column's width without
  // touching the DOM, so the childList observer below cannot see it; the size
  // observer catches exactly that.
  const sizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
  let observedColumn: Element | null = null

  /** Keep the size observer on the live column (the host rebuilds it). */
  const trackColumn = (column: Element | null): void => {
    if (column === observedColumn) return
    if (observedColumn !== null) sizeObserver?.unobserve(observedColumn)
    observedColumn = column
    if (column !== null) sizeObserver?.observe(column)
  }

  const apply = (): void => {
    if (!options.enabled()) {
      trackColumn(null)
      publish('')
      return
    }
    const button = document.querySelector<HTMLElement>(NEW_SESSION)
    const header = document.querySelector<HTMLElement>(SECTION_HEADER)
    // The host is mid-remount: keep the last placement rather than clearing it.
    // The stylesheet is a set of global selectors, so it applies again by itself
    // once the nodes are back, while clearing it would flash the tools home.
    if (button === null || header === null) return
    // The button's parent is the sidebar column: the shell renders the button as
    // a direct child (the tooltip wrapper clones it instead of wrapping it).
    const column = button.parentElement
    trackColumn(column)
    if (column === null) {
      publish('')
      return
    }
    const columnRect = column.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    // Rail mode, or a column the host has not laid out yet: there is no row to
    // share, so the host layout stands and nothing is positioned.
    if (columnRect.width < MIN_COLUMN_WIDTH || buttonRect.height === 0) {
      publish('')
      return
    }
    // Narrowing the button costs its label room, and the host clips the overflow,
    // so the label is measured and given its full width first: what is left over
    // is the room the tools may take. A column that cannot afford the widest inset
    // falls back to a tighter gap, and only a column that cannot fit the tools at
    // all keeps the host layout. `min-width: fit-content` above is the backstop
    // against a late font or zoom change reintroducing the clip.
    const label = button.querySelector<HTMLElement>(NEW_SESSION_LABEL)
    const columnStyle = getComputedStyle(column)
    const columnContent = columnRect.width
      - parseFloat(columnStyle.paddingLeft) - parseFloat(columnStyle.paddingRight)
    const needed = BUTTON_LEAD + BUTTON_CHROME + (label?.scrollWidth ?? 0)
    const room = columnContent - needed
    const gap = room >= SEARCH_WIDTH + ACTIONS_WIDTH + 2 * EDGE_GAP ? EDGE_GAP : TIGHT_GAP
    const gutter = SEARCH_WIDTH + ACTIONS_WIDTH + 2 * gap
    if (room < gutter) {
      publish('')
      return
    }
    // Anchor to the column's right edge, not the button's: the button is narrowed
    // below, so anchoring to it would drag the tools along with it.
    const actionsRight = Math.round(window.innerWidth - columnRect.right + gap)
    publish(placementCss({
      top: Math.round(buttonRect.top + (buttonRect.height - ICON_SIZE) / 2),
      actionsRight,
      searchRight: actionsRight + ACTIONS_WIDTH + gap,
      left: Math.round(buttonRect.left),
    }, gutter, gap))
  }

  const sync = (): void => {
    if (!disposed) apply()
  }

  apply()

  // The host rebuilds the sidebar on a rail toggle, so re-measure on DOM edits,
  // viewport changes, and any transition that settles (a rail toggle animates the
  // column, and the size observer alone can fire before the final layout lands).
  const observer = new MutationObserver(schedule)
  observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true })
  window.addEventListener('resize', schedule, { passive: true })
  document.addEventListener('transitionend', schedule, true)

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
      sizeObserver?.disconnect()
      window.removeEventListener('resize', schedule)
      document.removeEventListener('transitionend', schedule, true)
      unsubscribe()
      style.remove()
    },
  }
}
