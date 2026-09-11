// @vitest-environment jsdom
/**
 * Workspace-tab dialogs, driven through the real wrapper component: the exits of the
 * new-tab draft (save / cancel / host close), the empty-name guard, the duplicate
 * check against an existing「未命名」tab, and the two rules that keep a tab from being
 * silently lost (the read-back must not overwrite a tab created while it was in
 * flight, and a rejected write must leave the local cache dirty).
 *
 * Failures here are silent - a tab created although the user cancelled, or a tab that
 * disappears after a reload - and none of it is reachable through the module's
 * exports, so the test mounts the wrapper the plugin installs into the host's
 * `sidebar.workspaces` entry and watches what reaches the plugin's endpoint.
 */
import { createElement as h, type ReactNode } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Every endpoint call the plugin made, in order. */
const calls: { method: string; payload?: Record<string, unknown> }[] = []
/** Groups the fake host answers `wsGroupsRead` with. */
let remoteGroups: unknown[] = []
/** When true, `wsGroupsRead` hangs until the test resolves it through `holdRead`. */
let deferRead = false
let holdRead: ((value: unknown) => void) | null = null
/** What `wsGroupsWrite` answers. */
let writeOk = true

vi.mock('../src/client/endpointChannel.ts', () => ({
  callEndpoint: vi.fn(async (_path: string, method: string, payload?: Record<string, unknown>) => {
    calls.push(payload === undefined ? { method } : { method, payload })
    if (method === 'wsGroupsRead') {
      if (deferRead) {
        return await new Promise((resolve) => { holdRead = resolve })
      }
      return { ok: true, value: { groups: remoteGroups } }
    }
    return writeOk ? { ok: true } : { ok: false, error: { code: 'rejected', message: 'nope' } }
  }),
}))

// Pin the interface language so the dialog copy the assertions look for is stable.
vi.mock('../src/client/lang.ts', () => ({ isZhInterface: () => true }))

import { DEFAULT_FEATURE_SETTINGS, applySettings } from '../src/client/config.ts'
import { WS_TABS_MARK, installWorkspaceTabs, setPrimitivesForTest } from '../src/client/workspaceTabs.tsx'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

/** The module's local group cache key and its write-failure marker. */
const CACHE_KEY = 'dsh-plugin-width-slider.wsg.cache'
const DIRTY_KEY = 'dsh-plugin-width-slider.wsg.dirty'

interface FakeModalProps {
  open?: boolean
  title?: string
  children?: ReactNode
  footer?: ReactNode
  onClose?: () => void
}

/**
 * Stands in for the host's Modal: renders the body and footer verbatim, plus a
 * control that fires `onClose` the way the host's mask click or Escape does.
 */
const FakeModal = (props: FakeModalProps): ReactNode => {
  if (props.open === false) return null
  return h(
    'div',
    { 'data-fake-modal': '', 'data-modal-title': props.title ?? '' },
    h('button', { type: 'button', 'data-modal-close': '', onClick: props.onClose }, '关闭'),
    h('div', { 'data-modal-body': '' }, props.children),
    h('div', { 'data-modal-footer': '' }, props.footer),
  )
}

/** The host's own component; it renders the header row the plugin locates. */
const OfficialComp = (): ReactNode =>
  h(
    'div',
    { 'data-official': '' },
    h(
      'div',
      { 'data-row': '' },
      h('span', { 'data-label': '' }, '工作区'),
      h('input', { type: 'text', placeholder: '搜索会话' }),
    ),
  )

/** Stand-ins for the two framework hooks the shell receives as props. */
const useSessions = (select: (state: unknown) => unknown): unknown =>
  select({ ids: [], byId: {}, current: null })
const useWorkspaces = (select: (state: unknown) => unknown): unknown =>
  select({ items: [], phase: 'ready' })

interface Mounted {
  container: HTMLElement
  root: Root
  cleanup: () => void
}

/** Install the plugin against a fake slot entry and render the wrapper it installs. */
async function mount(remote: unknown[] = []): Promise<Mounted> {
  remoteGroups = remote
  const entry: { component?: unknown } = { component: OfficialComp as unknown }
  const ctx = {
    get: () => ({ refresh: (): void => {} }),
    slots: {
      entries: (key: string): unknown[] => (key === 'sidebar.workspaces' ? [entry] : []),
      register: () => () => {},
      subscribe: () => () => {},
      inject: () => () => {},
    },
  }
  const dispose = installWorkspaceTabs(ctx as never)
  const wrapper = entry.component
  // Marked with the plugin's own stamp: the bare "is a function" check cannot tell the
  // installed wrapper from the official component an aborted install leaves behind.
  expect(typeof wrapper).toBe('function')
  expect((wrapper as Record<string, unknown>)[WS_TABS_MARK]).toBe(true)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(h(wrapper as never, { wide: true, useSessions, useWorkspaces }))
  })
  return {
    container,
    root,
    cleanup: (): void => {
      // Unmount first: `dispose` empties the store, and notifying a still-mounted
      // subscriber would be an update outside `act`.
      root.unmount()
      dispose()
      container.remove()
    },
  }
}

/** Poll an assertion until it holds, so a slow read-back fails readably. */
async function waitFor(check: () => void, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      check()
      return
    } catch (error) {
      if (Date.now() > deadline) throw error
      await act(async () => {
        await new Promise((resolve) => { setTimeout(resolve, 10) })
      })
    }
  }
}

/** Click an element through React's event system. */
async function click(el: Element | null): Promise<void> {
  expect(el).not.toBeNull()
  await act(async () => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/** Type into a React-controlled input the way a browser would. */
async function type(input: HTMLInputElement | null, value: string): Promise<void> {
  expect(input).not.toBeNull()
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input!.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const addButton = (m: Mounted): Element | null => m.container.querySelector('[data-dsh-ws-add]')
const modals = (m: Mounted): Element[] => Array.from(m.container.querySelectorAll('[data-fake-modal]'))
const modal = (m: Mounted): Element | null => modals(m)[0] ?? null
const modalTitle = (m: Mounted): string => modal(m)?.getAttribute('data-modal-title') ?? ''
const nameInput = (m: Mounted): HTMLInputElement | null =>
  m.container.querySelector<HTMLInputElement>('[data-modal-body] input[type="text"]')
const footerButton = (m: Mounted, label: string): HTMLButtonElement | null =>
  (Array.from(m.container.querySelectorAll('[data-modal-footer] button')).find(
    (el) => (el.textContent ?? '').trim() === label,
  ) ?? null) as HTMLButtonElement | null
const saveButton = (m: Mounted): HTMLButtonElement | null => footerButton(m, '保存')
const bodyText = (m: Mounted): string => m.container.querySelector('[data-modal-body]')?.textContent ?? ''
const tabNames = (m: Mounted): string[] =>
  Array.from(m.container.querySelectorAll('[data-dsh-ws-tab]')).map((el) => (el.textContent ?? '').trim())
const selectedTab = (m: Mounted): string | null =>
  m.container.querySelector('[data-dsh-ws-tab][aria-selected="true"]')?.getAttribute('data-dsh-ws-id') ?? null
const writes = (): { method: string; payload?: Record<string, unknown> }[] =>
  calls.filter((call) => call.method === 'wsGroupsWrite')
/** The group list of the last write, as the host would have stored it. */
const savedGroups = (): { id: string; name: string; workspaceIds: string[] }[] =>
  ((writes().at(-1)?.payload as { groups?: { id: string; name: string; workspaceIds: string[] }[] } | undefined)
    ?.groups ?? [])
const cachedGroupNames = (): string[] => {
  const raw = window.localStorage.getItem(CACHE_KEY)
  if (raw === null) return []
  return ((JSON.parse(raw) as { groups?: { name?: string }[] }).groups ?? []).map((g) => g.name ?? '')
}

let mounted: Mounted | null = null

beforeEach(() => {
  calls.length = 0
  remoteGroups = []
  deferRead = false
  holdRead = null
  writeOk = true
  window.localStorage.clear()
  document.body.replaceChildren()
  // The plugin reaches the host's Modal through `require`, which resolves against the
  // runner's module table in this environment; inject the stand-in instead.
  setPrimitivesForTest({ Modal: FakeModal })
})

afterEach(() => {
  mounted?.cleanup()
  mounted = null
  // The seam and the settings store are module-level, so leave them as they were found.
  setPrimitivesForTest(null)
  applySettings({ ...DEFAULT_FEATURE_SETTINGS })
})

/** Mount, register for teardown, and wait for the tab bar to appear. */
async function open(remote: unknown[] = []): Promise<Mounted> {
  const m = await mount(remote)
  mounted = m
  await waitFor(() => { expect(addButton(m)).not.toBeNull() })
  calls.length = 0
  return m
}

describe('workspace tab dialogs', () => {
  it('creates nothing until the draft is saved', async () => {
    const m = await open()
    await click(addButton(m))
    expect(modalTitle(m)).toBe('新建页签')
    expect(writes()).toHaveLength(0)
  })

  it('creates the tab on save, switches to it, and persists it', async () => {
    const m = await open([{ id: 'g-existing', name: '已有页签', workspaceIds: [] }])
    await waitFor(() => { expect(tabNames(m)).toContain('已有页签') })
    await click(addButton(m))
    await type(nameInput(m), '项目 A')
    await click(saveButton(m))

    const groups = savedGroups()
    const created = groups.find((group) => group.name === '项目 A')
    // An empty or malformed id would be dropped by `sanitize()` on the next load: the
    // tab would look created and then vanish after a reload.
    expect(created?.id).toMatch(/^g-/)
    expect(created?.workspaceIds).toEqual([])
    // The already existing tab survives the commit.
    expect(groups.map((group) => group.name)).toEqual(expect.arrayContaining(['已有页签', '项目 A']))
    expect(new Set(groups.map((group) => group.id)).size).toBe(groups.length)
    // User-visible: the new tab is selected, and the dialog is gone.
    expect(selectedTab(m)).toBe(created?.id)
    expect(modal(m)).toBeNull()
    // The local cache is what keeps the tab after a reload.
    expect(cachedGroupNames()).toContain('项目 A')
    // A second draft starts blank (the shell reset its dialog state on save).
    await click(addButton(m))
    expect(nameInput(m)?.value).toBe('')
  })

  it('writes nothing when the draft is cancelled', async () => {
    const m = await open()
    await click(addButton(m))
    await type(nameInput(m), '项目 B')
    await click(footerButton(m, '取消'))
    expect(writes()).toHaveLength(0)
    expect(modal(m)).toBeNull()
  })

  it('writes nothing when the draft is dismissed through the host', async () => {
    const m = await open()
    await click(addButton(m))
    await type(nameInput(m), '项目 C')
    // The host's mask and Escape both reach the dialog as the Modal's `onClose`.
    await click(m.container.querySelector('[data-modal-close]'))
    expect(writes()).toHaveLength(0)
    expect(modal(m)).toBeNull()
  })

  it('keeps save disabled while the name is empty, and says why', async () => {
    const m = await open()
    await click(addButton(m))
    expect(saveButton(m)?.disabled).toBe(true)
    expect(bodyText(m)).toContain('请输入页签名')
  })

  it('does not flag a duplicate against an existing「未命名」tab', async () => {
    const m = await open([{ id: 'g1', name: '未命名', workspaceIds: [] }])
    // The premise has to hold, or the case silently loses its discriminating power.
    await waitFor(() => { expect(tabNames(m)).toContain('未命名') })
    await click(addButton(m))
    expect(bodyText(m)).not.toContain('已存在同名页签')
    // The converse: a real collision must still be reported.
    await type(nameInput(m), '未命名')
    expect(bodyText(m)).toContain('已存在同名页签')
    expect(saveButton(m)?.disabled).toBe(true)
    await type(nameInput(m), '新页签')
    expect(saveButton(m)?.disabled).toBe(false)
  })

  it('keeps a tab created while the group read was still in flight', async () => {
    deferRead = true
    const m = await open()
    // The read is hanging, so the local list starts empty.
    await click(addButton(m))
    await type(nameInput(m), '并发建')
    await click(saveButton(m))
    expect(tabNames(m)).toContain('并发建')
    // The read now answers with a list that predates the create.
    await act(async () => {
      holdRead?.({ ok: true, value: { groups: [{ id: 'g-old', name: '旧页签', workspaceIds: [] }] } })
      await new Promise((resolve) => { setTimeout(resolve, 0) })
    })
    expect(tabNames(m)).toContain('并发建')
    expect(tabNames(m)).not.toContain('旧页签')
  })

  it('marks the local cache dirty when the host rejects the write', async () => {
    writeOk = false
    const m = await open()
    await click(addButton(m))
    await type(nameInput(m), '写盘失败')
    await click(saveButton(m))
    await waitFor(() => { expect(window.localStorage.getItem(DIRTY_KEY)).toBe('1') })
    // The tab is still there locally; the next start retries the write.
    expect(cachedGroupNames()).toContain('写盘失败')
  })

  it('creates a single tab when the add button is pressed twice', async () => {
    const m = await open()
    await click(addButton(m))
    await click(addButton(m))
    expect(modals(m)).toHaveLength(1)
    await type(nameInput(m), '只建一个')
    await click(saveButton(m))
    const groups = savedGroups()
    expect(groups.filter((group) => group.name === '只建一个')).toHaveLength(1)
    expect(new Set(groups.map((group) => group.id)).size).toBe(groups.length)
  })
})
