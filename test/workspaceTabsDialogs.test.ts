// @vitest-environment jsdom
/**
 * Workspace-tab dialogs, driven through the real wrapper component: the exits of the
 * new-tab draft (save / cancel / host close), the empty-name guard, and the duplicate
 * check against an existing「未命名」tab. These paths fail silently - a tab created
 * although the user cancelled, or a save button that stays disabled with no stated
 * reason - and none of them is reachable through the module's exports, so the test
 * mounts the wrapper the plugin installs into the host's `sidebar.workspaces` entry
 * and observes what reaches the plugin's endpoint.
 */
import { createElement as h, type ReactNode } from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Every endpoint call the plugin made, in order. */
const calls: { method: string; payload?: Record<string, unknown> }[] = []
/** Groups the fake host answers `wsGroupsRead` with. */
let remoteGroups: unknown[] = []

vi.mock('../src/client/endpointChannel.ts', () => ({
  callEndpoint: vi.fn(async (_path: string, method: string, payload?: Record<string, unknown>) => {
    calls.push(payload === undefined ? { method } : { method, payload })
    if (method === 'wsGroupsRead') return { ok: true, value: { groups: remoteGroups } }
    return { ok: true }
  }),
}))

// Pin the interface language so the dialog copy the assertions look for is stable.
vi.mock('../src/client/lang.ts', () => ({ isZhInterface: () => true }))

import { DEFAULT_FEATURE_SETTINGS, applySettings } from '../src/client/config.ts'
import { installWorkspaceTabs, setPrimitivesForTest } from '../src/client/workspaceTabs.tsx'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

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
  applySettings({ ...DEFAULT_FEATURE_SETTINGS, workspaceTabs: true })
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
  expect(typeof wrapper).toBe('function')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(h(wrapper as never, { wide: true, useSessions, useWorkspaces }))
  })
  // One turn for the header effect and one for the group read-back.
  await act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 0) })
  })
  return {
    container,
    root,
    cleanup: (): void => {
      dispose()
      root.unmount()
      container.remove()
    },
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
const modal = (m: Mounted): Element | null => m.container.querySelector('[data-fake-modal]')
const modalTitle = (m: Mounted): string => modal(m)?.getAttribute('data-modal-title') ?? ''
const nameInput = (m: Mounted): HTMLInputElement | null =>
  m.container.querySelector<HTMLInputElement>('[data-modal-body] input[type="text"]')
const footerButton = (m: Mounted, label: string): HTMLButtonElement | null =>
  (Array.from(m.container.querySelectorAll('[data-modal-footer] button')).find(
    (el) => (el.textContent ?? '').trim() === label,
  ) ?? null) as HTMLButtonElement | null
const saveButton = (m: Mounted): HTMLButtonElement | null => footerButton(m, '保存')
const bodyText = (m: Mounted): string => m.container.querySelector('[data-modal-body]')?.textContent ?? ''
const writes = (): { method: string; payload?: Record<string, unknown> }[] =>
  calls.filter((call) => call.method === 'wsGroupsWrite')

let active: Mounted | null = null

beforeEach(() => {
  calls.length = 0
  remoteGroups = []
  window.localStorage.clear()
  document.body.replaceChildren()
  // The plugin reaches the host's Modal through `require`, which resolves against the
  // runner's module table in this environment; inject the stand-in instead.
  setPrimitivesForTest({ Modal: FakeModal })
})

afterEach(() => {
  active?.cleanup()
  active = null
  vi.unstubAllGlobals()
})

describe('workspace tab dialogs', () => {

  it('creates nothing until the draft is saved', async () => {
    const m = await mount()
    active = m
    calls.length = 0
    await click(addButton(m))
    expect(modalTitle(m)).toBe('新建页签')
    expect(writes()).toHaveLength(0)
  })

  it('creates the tab on save and persists it', async () => {
    const m = await mount()
    active = m
    calls.length = 0
    await click(addButton(m))
    await type(nameInput(m), '项目 A')
    await click(saveButton(m))
    const saved = writes()
    expect(saved).toHaveLength(1)
    const groups = (saved[0]?.payload as { groups?: { name?: string }[] } | undefined)?.groups ?? []
    expect(groups.map((group) => group.name)).toContain('项目 A')
    expect(modal(m)).toBeNull()
  })

  it('writes nothing when the draft is cancelled', async () => {
    const m = await mount()
    active = m
    calls.length = 0
    await click(addButton(m))
    await type(nameInput(m), '项目 B')
    await click(footerButton(m, '取消'))
    expect(writes()).toHaveLength(0)
    expect(modal(m)).toBeNull()
  })

  it('writes nothing when the draft is dismissed through the host', async () => {
    const m = await mount()
    active = m
    calls.length = 0
    await click(addButton(m))
    await type(nameInput(m), '项目 C')
    // The host's mask and Escape both reach the dialog as the Modal's `onClose`.
    await click(m.container.querySelector('[data-modal-close]'))
    expect(writes()).toHaveLength(0)
    expect(modal(m)).toBeNull()
  })

  it('keeps save disabled while the name is empty, and says why', async () => {
    const m = await mount()
    active = m
    calls.length = 0
    await click(addButton(m))
    expect(saveButton(m)?.disabled).toBe(true)
    expect(bodyText(m)).toContain('请输入页签名')
  })

  it('does not flag a duplicate against an existing「未命名」tab', async () => {
    const m = await mount([{ id: 'g1', name: '未命名', workspaceIds: [] }])
    active = m
    calls.length = 0
    await click(addButton(m))
    expect(bodyText(m)).not.toContain('已存在同名页签')
    await type(nameInput(m), '新页签')
    expect(saveButton(m)?.disabled).toBe(false)
  })
})
