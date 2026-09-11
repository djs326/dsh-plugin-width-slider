// @vitest-environment jsdom
/**
 * Sidebar tools placement: every branch of the injected stylesheet (toggle off,
 * rail, mid-remount, unmeasurable label, no room left, tight gap, placement),
 * the animation hold rule, and teardown.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installSidebarToolsMerge, TOOLS_STYLE_ID, type SidebarToolsMergeHandle,
} from '../src/client/sidebarToolsMerge.ts'

/** A DOMRect stand-in; jsdom reports zeroed rects for everything. */
const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  left, top, width, height, right: left + width, bottom: top + height, x: left, y: top,
  toJSON: () => ({}),
}) as DOMRect

/** Pin an element's measured box. */
const at = (el: Element, left: number, top: number, width: number, height: number): void => {
  el.getBoundingClientRect = () => rect(left, top, width, height)
}

/** The injected stylesheet's current text (empty when nothing is placed). */
const injected = (): string => document.getElementById(TOOLS_STYLE_ID)?.textContent ?? ''

/** Elements the stubbed `getComputedStyle` reports as transformed. */
const transformed = new Set<Element>()

interface Host {
  column: HTMLElement
  button: HTMLElement
  label: HTMLElement
  region: HTMLElement
  search: HTMLElement
}

/** Mount a host-shaped slice: column > (new-chat button, region > header > tools). */
function mountHost(): Host {
  const column = document.createElement('div')
  column.className = '_root_x1'
  column.style.paddingLeft = '12px'
  column.style.paddingRight = '12px'
  const button = document.createElement('button')
  button.className = '_newSession_x1'
  const label = document.createElement('span')
  label.className = '_newSessionLabel_x1'
  label.textContent = '新会话'
  button.appendChild(label)
  const region = document.createElement('div')
  region.className = '_regionArea_x1'
  const header = document.createElement('div')
  header.className = '_sectionHeader_x1'
  const search = document.createElement('div')
  search.className = '_searchSlot_x1'
  const actions = document.createElement('div')
  actions.className = '_headerActions_x1'
  header.append(search, actions)
  region.appendChild(header)
  column.append(button, region)
  document.body.appendChild(column)
  return { column, button, label, region, search }
}

/** The host geometry: a 280px column on a 1400px viewport, 42px-wide label. */
function measure(host: Host, columnWidth = 280, labelWidth = 42): void {
  at(host.column, 12, 0, columnWidth, 600)
  at(host.button, 12, 100, columnWidth - 24, 38)
  at(host.region, 12, 200, columnWidth - 24, 400)
  at(host.search, 200, 140, 28, 28)
  at(host.label, 0, 0, labelWidth, 22)
  Object.defineProperty(host.label, 'scrollWidth', { value: labelWidth, configurable: true })
  Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true })
}

/** Install with a mutable toggle, tracking the handle for teardown. */
const handles: SidebarToolsMergeHandle[] = []
function install(enabled = true): { handle: SidebarToolsMergeHandle; setEnabled: (on: boolean) => void } {
  let on = enabled
  const handle = installSidebarToolsMerge({ enabled: () => on })
  handles.push(handle)
  return {
    handle,
    setEnabled: (value) => {
      on = value
      handle.sync()
    },
  }
}

/** Wait out the observer microtask plus the scheduled animation frame. */
const settle = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 40) })

beforeEach(() => {
  document.body.replaceChildren()
  for (const el of Array.from(document.head.querySelectorAll('style'))) el.remove()
  handles.length = 0
  transformed.clear()
  // jsdom computes no `transform` value at all, so pin the three properties the
  // module reads and drive the transform case from the set above.
  vi.spyOn(window, 'getComputedStyle').mockImplementation(((el: Element) => {
    const style = (el as HTMLElement).style
    return {
      transform: transformed.has(el) ? 'translate(49px)' : 'none',
      paddingLeft: style?.paddingLeft || '0px',
      paddingRight: style?.paddingRight || '0px',
    }
  }) as unknown as typeof window.getComputedStyle)
})

afterEach(() => {
  for (const handle of handles.splice(0)) handle.dispose()
  vi.restoreAllMocks()
})

describe('installSidebarToolsMerge', () => {
  it('leaves the host layout alone while the toggle is off', () => {
    const host = mountHost()
    measure(host)
    install(false)
    expect(injected()).toBe('')
  })

  it('pins the tools to the new-chat row and narrows the button', () => {
    const host = mountHost()
    measure(host)
    install()
    const css = injected()
    expect(css).toContain('position:fixed')
    expect(css).toContain('width:calc(100% - 104px)')
    expect(css).toContain('min-width:fit-content')
    // 1400 (viewport) - 292 (column right edge) + 8 (gap).
    expect(css).toContain('right:1116px')
    expect(css).not.toContain('visibility:hidden')
  })

  it('keeps the host layout when the column is a rail', () => {
    const host = mountHost()
    measure(host, 56)
    install()
    expect(injected()).toBe('')
  })

  it('keeps the host layout when the label cannot be measured', () => {
    const host = mountHost()
    measure(host)
    host.label.remove()
    install()
    expect(injected()).toBe('')
  })

  it('falls back to the tight gap before giving the placement up', () => {
    const host = mountHost()
    measure(host, 205)
    install()
    expect(injected()).toContain('width:calc(100% - 96px)')
  })

  it('keeps the host layout when the label leaves no room for the tools', () => {
    const host = mountHost()
    measure(host, 280, 150)
    install()
    expect(injected()).toBe('')
  })

  it('holds the last placement while a pinned element is transformed', () => {
    const host = mountHost()
    measure(host)
    const { handle } = install()
    const placed = injected()
    expect(placed).toContain('position:fixed')
    // The geometry changes with it, so a guard that failed to fire would publish a
    // different stylesheet instead of leaving this one in place.
    transformed.add(host.region)
    measure(host, 300)
    handle.sync()
    expect(injected()).toBe(placed)
    transformed.delete(host.region)
    handle.sync()
    expect(injected()).toContain('right:1096px')
  })

  it('holds the last placement while the host is mid-remount', () => {
    const host = mountHost()
    measure(host)
    const { handle } = install()
    const placed = injected()
    host.column.remove()
    handle.sync()
    expect(injected()).toBe(placed)
  })

  it('yields the row to an expanded search, and takes it back when it collapses', () => {
    const host = mountHost()
    measure(host)
    const { handle } = install()
    expect(injected()).not.toContain('visibility:hidden')
    host.search.classList.add('_searchSlotExpanded_x1')
    handle.sync()
    expect(injected()).toContain('visibility:hidden')
    host.search.classList.remove('_searchSlotExpanded_x1')
    handle.sync()
    expect(injected()).not.toContain('visibility:hidden')
  })

  it('clears the placement when the toggle turns off and restores it after', () => {
    const host = mountHost()
    measure(host)
    const { setEnabled } = install()
    expect(injected()).toContain('position:fixed')
    setEnabled(false)
    expect(injected()).toBe('')
    setEnabled(true)
    expect(injected()).toContain('position:fixed')
  })

  it('removes the stylesheet on dispose', () => {
    const host = mountHost()
    measure(host)
    const { handle } = install()
    expect(document.getElementById(TOOLS_STYLE_ID)).not.toBeNull()
    handle.dispose()
    expect(document.getElementById(TOOLS_STYLE_ID)).toBeNull()
  })

  it('re-measures by itself when the search expands and collapses', async () => {
    const host = mountHost()
    measure(host)
    install()
    expect(injected()).not.toContain('visibility:hidden')
    host.search.classList.add('_searchSlotExpanded_x1')
    await settle()
    expect(injected()).toContain('visibility:hidden')
    host.search.classList.remove('_searchSlotExpanded_x1')
    await settle()
    expect(injected()).not.toContain('visibility:hidden')
  })

  it('re-measures after the host replaces the column', async () => {
    const host = mountHost()
    measure(host)
    install()
    expect(injected()).toContain('right:1116px')
    host.column.remove()
    const replacement = mountHost()
    measure(replacement, 300)
    await settle()
    expect(injected()).toContain('right:1096px')
  })

  it('stops watching once the toggle is off', async () => {
    const host = mountHost()
    measure(host)
    const { setEnabled } = install()
    setEnabled(false)
    host.search.classList.add('_searchSlotExpanded_x1')
    await settle()
    expect(injected()).toBe('')
  })
})
