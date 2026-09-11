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
 *
 * `fixed` rather than `absolute`: the tool containers sit inside ancestors that
 * clip with `overflow: hidden` (section header, region area, sidebar column), so
 * an absolutely positioned child across that chain is painted nowhere. `fixed`
 * brings its own trap - a transformed element takes over as the containing block
 * - and the host animates one: `_regionArea` carries the `rail-in` keyframes with
 * `translate(49px)`. The guard in `apply` therefore walks the chain of the pinned
 * elements themselves, never the button's: the tools live in the workspace region,
 * a *sibling* of the new-chat button, so a check rooted at the button cannot see
 * it. In the host this was written against, that region unmounts in the very frame
 * the animation starts (and a rail column is too narrow for the tools anyway), so
 * the guard is a backstop for a host that keeps it mounted rather than a live path.
 * The keyframes end with `animationend`, not `transitionend`, hence that listener.
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

/** Body-level fallback observation: it catches a rebuilt column. */
const BODY_OBSERVE: MutationObserverInit = { childList: true, subtree: true }
/**
 * Column-level observation. `attributes` is not optional: a rail toggle and the
 * search's expand/collapse are pure class changes, which `childList` cannot see.
 */
const CLASS_OBSERVE: MutationObserverInit = { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }

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
 * left padding, the injected 0 right padding, and the host's 0.5px border on each
 * side (1px together). The label's own room starts after this.
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
 * Read one computed pixel value, treating an unparsable one as 0.
 * @param value - the computed style value.
 * @returns the length in pixels, or 0 when it is not a number.
 */
function px(value: string): number {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Whether `el` itself or an ancestor establishes a containing block for `fixed`
 * descendants. Only `transform` is checked - it is the property the host animates;
 * `will-change`, `filter` and `contain: paint` would have the same effect and are
 * deliberately not covered, so this is a single-purpose guard, not a general
 * predicate.
 * @param el - the element to start from (itself included).
 * @returns true when the element or an ancestor up to `body` is transformed.
 */
function hasTransformedAncestor(el: Element | null): boolean {
  for (let node = el; node !== null && node !== document.body; node = node.parentElement) {
    const transform = getComputedStyle(node).transform
    // `none` is the computed value for every connected element; the empty string
    // only appears where the property is not computed at all (jsdom, detached
    // trees), and is not a transform either.
    if (transform !== 'none' && transform !== '') return true
  }
  return false
}

/**
 * The placement stylesheet, or an empty string to leave the host layout alone.
 * @param place - the measured viewport coordinates.
 * @param gutter - the width the new-chat button gives up, matching `place`.
 * @param gap - the inset `place` was measured with.
 * @param searchExpanded - whether the search owns the row right now.
 */
function placementCss(place: Placement, gutter: number, gap: number, searchExpanded: boolean): string {
  const tools = `${SECTION_HEADER}>${SEARCH_SLOT},${SECTION_HEADER}>${HEADER_ACTIONS}`
  // An expanded search takes the row; the button yields instead of showing
  // through under the search field, whose own background is not guaranteed.
  const yields = searchExpanded ? ';visibility:hidden' : ''
  return `
${tools}{position:fixed;display:flex;align-items:center;gap:${gap}px;z-index:60}
${SECTION_HEADER}>${HEADER_ACTIONS}{top:${place.top}px;right:${place.actionsRight}px}
${SECTION_HEADER}>${SEARCH_SLOT}{top:${place.top}px;right:${place.searchRight}px}
${SECTION_HEADER}>${SEARCH_SLOT_EXPANDED}{left:${place.left}px;right:${place.actionsRight}px}
${NEW_SESSION}{width:calc(100% - ${gutter}px);max-width:calc(100% - ${gutter}px);min-width:fit-content;padding-right:0${yields}}
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
 * Install the tools placement. One installation at a time: a second one takes the
 * stylesheet id over and the first one's writes go to a detached node.
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
  let observing = false
  let boundColumn: Element | null = null
  let observedColumn: Element | null = null

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

  const observer = new MutationObserver(schedule)
  // A rail toggle and the search's expand/collapse change classes without touching
  // the DOM, so the observer above can see them only through `attributes`; the size
  // observer is what catches a width that changes without either.
  const sizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null

  /**
   * Point the mutation observer at the live column, keeping a body-level fallback:
   * a MutationObserver follows the node it was given, so if the host replaces the
   * column outright, a column-only binding would sit on a detached node and nothing
   * would ever schedule another measure.
   */
  const bindObserver = (column: Element | null): void => {
    if (column === boundColumn) return
    boundColumn = column
    observer.disconnect()
    observer.observe(document.body ?? document.documentElement, BODY_OBSERVE)
    observer.observe(column ?? document.body ?? document.documentElement, CLASS_OBSERVE)
  }

  /** Keep the size observer on the live column. */
  const trackColumn = (column: Element | null): void => {
    if (column === observedColumn) return
    if (observedColumn !== null) sizeObserver?.unobserve(observedColumn)
    observedColumn = column
    if (observing && column !== null) sizeObserver?.observe(column)
  }

  /**
   * Follow the toggle with the observers themselves: while the feature is off the
   * sidebar's markup edits must not keep scheduling re-measures.
   */
  const setObserving = (on: boolean): void => {
    if (on === observing) return
    observing = on
    observer.disconnect()
    if (!on) {
      sizeObserver?.disconnect()
      observedColumn = null
      boundColumn = null
      return
    }
    observer.observe(document.body ?? document.documentElement, BODY_OBSERVE)
    observer.observe(boundColumn ?? document.body ?? document.documentElement, CLASS_OBSERVE)
  }

  const apply = (): void => {
    if (!options.enabled()) {
      setObserving(false)
      publish('')
      return
    }
    setObserving(true)
    const button = document.querySelector<HTMLElement>(NEW_SESSION)
    const header = document.querySelector<HTMLElement>(SECTION_HEADER)
    // The host is mid-remount: keep the last placement rather than clearing it.
    // The stylesheet is a set of global selectors, so it applies again by itself
    // once the nodes are back, while clearing it would flash the tools home.
    if (button === null || header === null) return
    // A transformed element takes over as the containing block for `fixed`
    // descendants, which invalidates both the viewport coordinates we publish and
    // the rects we would measure. The pinned elements are checked - not the button
    // alone, since the tools live in the workspace region, a sibling of the button.
    const pinned = [button, ...[SEARCH_SLOT, HEADER_ACTIONS].map((s) => document.querySelector<HTMLElement>(s))]
    if (pinned.some((el) => el !== null && hasTransformedAncestor(el))) return
    // The button's parent is the sidebar column: the shell renders the button as
    // a direct child (the tooltip wrapper clones it instead of wrapping it).
    const column = button.parentElement
    if (column === null) {
      publish('')
      return
    }
    bindObserver(column)
    trackColumn(column)
    const columnRect = column.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    // Rail mode, or a column the host has not laid out yet: there is no row to
    // share, so the host layout stands and nothing is positioned.
    if (columnRect.width < MIN_COLUMN_WIDTH || buttonRect.height === 0) {
      publish('')
      return
    }
    // The label is measured first and keeps its full width; what is left over is
    // the room the tools may take. Measuring it as 0 would read as "plenty of
    // room" and narrow the button back into the clipping this exists to prevent,
    // so a missing label leaves the host layout alone.
    const label = button.querySelector<HTMLElement>(NEW_SESSION_LABEL)
    if (label === null) {
      publish('')
      return
    }
    const columnStyle = getComputedStyle(column)
    const columnContent = columnRect.width - px(columnStyle.paddingLeft) - px(columnStyle.paddingRight)
    const needed = BUTTON_LEAD + BUTTON_CHROME + label.scrollWidth
    // A column that cannot afford the widest inset falls back to a tighter gap, and
    // only a column that cannot fit the tools at all keeps the host layout.
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
    }, gutter, gap, document.querySelector(SEARCH_SLOT_EXPANDED) !== null))
  }

  const sync = (): void => {
    if (!disposed) apply()
  }

  apply()

  // Re-measure on DOM edits, viewport changes, and on any animation or transition
  // that settles: a rail toggle animates the column (and its region), and either
  // observer can fire before the final layout lands. `animationend` is the one the
  // host's keyframes dispatch - `transitionend` never arrives for them.
  window.addEventListener('resize', schedule, { passive: true })
  document.addEventListener('transitionend', schedule, true)
  document.addEventListener('animationstart', schedule, true)
  document.addEventListener('animationend', schedule, true)

  // The label's width is also what the fit above depends on, and neither observer
  // fires when a font finishes loading.
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
  if (fonts !== undefined) fonts.addEventListener('loadingdone', schedule)

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
      document.removeEventListener('animationstart', schedule, true)
      document.removeEventListener('animationend', schedule, true)
      if (fonts !== undefined) fonts.removeEventListener('loadingdone', schedule)
      unsubscribe()
      style.remove()
    },
  }
}
