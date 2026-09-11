// @vitest-environment jsdom
/**
 * 会话删除的菜单注入路径。断言只落在用户能看见/能承受的后果上：菜单里不会出现两个
 * 删除项、不会凭空多出点了不知道删谁的一项、点下去删的是那一行而不是按标题反查。
 * 确认框（官方 Modal）走 React 渲染，由真机验证；这里覆盖注入与目标解析。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const holder = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))

vi.mock('../src/client/primitives.ts', () => ({ primitives: () => holder.value }))

import { installSessionDelete } from '../src/client/sessionDelete.ts'

const MENU_DELETE_ATTR = 'data-session-delete-item'
const EVENT = 'dsh:session-delete'

let disposers: Array<() => void> = []

/** 宿主菜单：官方 menuitem（重命名）供克隆。 */
function mountMenu(withTemplate = true): HTMLElement {
  const menu = document.createElement('div')
  menu.setAttribute('role', 'menu')
  if (withTemplate) {
    const item = document.createElement('button')
    item.setAttribute('role', 'menuitem')
    item.innerHTML = '<span><svg width="16" height="16"><path d="M0 0"/></svg></span><span>重命名</span>'
    menu.append(item)
  }
  document.body.append(menu)
  return menu
}

/** 打开中的会话行：node.id 只在 React fiber 上，标题在 DOM 上。 */
function mountRow(options: { fiber?: boolean; menuOpen?: boolean } = {}): HTMLElement {
  const row = document.createElement('div')
  row.className = options.menuOpen === false ? 'sessionRow' : 'sessionRow menuOpen'
  const title = document.createElement('span')
  title.className = 'sessionTitle'
  title.textContent = '我的会话'
  row.append(title)
  if (options.fiber !== false) {
    const row_ = row as unknown as Record<string, unknown>
    row_.__reactFiber$test = {
      memoizedProps: { node: { id: 'sess-1', running: true, blank: false } },
      return: null,
    }
  }
  document.body.append(row)
  return row
}

function makeCtx(): { ctx: never; registered: Array<Record<string, unknown>> } {
  const registered: Array<Record<string, unknown>> = []
  const ctx = {
    get: () => undefined,
    slots: {
      inject: (_name: string, register: () => () => void) => register(),
      register: (options: Record<string, unknown>) => {
        registered.push(options)
        return () => {}
      },
    },
    effect: () => {},
  }
  return { ctx: ctx as never, registered }
}

const deleteItem = (root: ParentNode = document): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[${MENU_DELETE_ATTR}]`)

/** 让 MutationObserver + rAF 链路跑完。 */
async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await Promise.resolve()
  await vi.advanceTimersByTimeAsync(40)
  for (let i = 0; i < 4; i += 1) await Promise.resolve()
}

beforeEach(() => {
  holder.value = { Modal: () => null }
  document.documentElement.lang = 'zh'
  // jsdom 没有 innerText，宿主标题是靠它读的；缺口在这里补上。
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent
    },
  })
  vi.useFakeTimers()
})

afterEach(() => {
  for (const dispose of disposers) dispose()
  disposers = []
  document.body.innerHTML = ''
  document.documentElement.lang = ''
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('install 降级', () => {
  it('stays out of the way when the Modal primitive is unavailable', () => {
    holder.value = {}
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const menu = mountMenu()
    mountRow()
    const { ctx, registered } = makeCtx()
    disposers.push(installSessionDelete(ctx))
    // 确认框渲染不出来时，宁可不注入菜单项 —— 点了没反应比没有更糟。
    expect(deleteItem(menu)).toBeNull()
    expect(registered).toEqual([])
    expect(warn).toHaveBeenCalled()
  })
})

describe('菜单项注入', () => {
  it('appends a delete item cloned from the official one', async () => {
    const menu = mountMenu()
    mountRow()
    const { ctx } = makeCtx()
    disposers.push(installSessionDelete(ctx))
    await settle()
    const item = deleteItem(menu)
    expect(item).not.toBeNull()
    expect(item?.getAttribute('role')).toBe('menuitem')
    expect(item?.textContent).toContain('删除会话')
    // 图标被换成垃圾桶，官方 svg 外壳（尺寸）保留。
    expect(item?.querySelector('svg')).not.toBeNull()
    expect(item?.querySelector('path')?.getAttribute('d')).toContain('M14.4782 4.84067')
    expect(item?.style.color).toContain('#e5484d')
  })

  it('falls back to a hand-written item when there is no official template', async () => {
    const menu = mountMenu(false)
    mountRow()
    const { ctx } = makeCtx()
    disposers.push(installSessionDelete(ctx))
    await settle()
    const item = deleteItem(menu)
    expect(item?.tagName).toBe('BUTTON')
    expect(item?.getAttribute('role')).toBe('menuitem')
    expect(item?.textContent).toContain('删除会话')
  })

  it('never appends the item twice', async () => {
    const menu = mountMenu()
    mountRow()
    const { ctx } = makeCtx()
    disposers.push(installSessionDelete(ctx))
    await settle()
    // 观察器每见到一次 DOM 变动就重跑一遍注入。
    document.body.append(document.createElement('div'))
    await settle()
    expect(menu.querySelectorAll(`[${MENU_DELETE_ATTR}]`)).toHaveLength(1)
  })

  it('stays silent while no session row is open', async () => {
    const menu = mountMenu()
    mountRow({ menuOpen: false })
    const { ctx } = makeCtx()
    disposers.push(installSessionDelete(ctx))
    await settle()
    // 目标会话未知时不出这一项：点了也不知道删谁。
    expect(deleteItem(menu)).toBeNull()
  })

  it('stays silent while there is no menu', () => {
    mountRow()
    const { ctx } = makeCtx()
    disposers.push(installSessionDelete(ctx))
    expect(document.querySelectorAll(`[${MENU_DELETE_ATTR}]`)).toHaveLength(0)
  })

  it('follows the interface language', async () => {
    document.documentElement.lang = 'en'
    const menu = mountMenu()
    mountRow()
    const { ctx } = makeCtx()
    disposers.push(installSessionDelete(ctx))
    await settle()
    expect(deleteItem(menu)?.textContent).toContain('Delete session')
  })
})

describe('目标会话解析', () => {
  it('targets the session id read from the row itself', async () => {
    const menu = mountMenu()
    mountRow()
    const { ctx } = makeCtx()
    disposers.push(installSessionDelete(ctx))
    await settle()
    const seen: Array<Record<string, unknown>> = []
    const listener = (event: Event): void => {
      seen.push((event as CustomEvent).detail as Record<string, unknown>)
    }
    window.addEventListener(EVENT, listener)
    deleteItem(menu)?.click()
    window.removeEventListener(EVENT, listener)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ sessionId: 'sess-1', running: true, title: '我的会话' })
  })

  it('fails closed when the row carries no session id', async () => {
    const menu = mountMenu()
    mountRow({ fiber: false })
    const { ctx } = makeCtx()
    disposers.push(installSessionDelete(ctx))
    await settle()
    const seen: Array<Record<string, unknown>> = []
    const listener = (event: Event): void => {
      seen.push((event as CustomEvent).detail as Record<string, unknown>)
    }
    window.addEventListener(EVENT, listener)
    deleteItem(menu)?.click()
    window.removeEventListener(EVENT, listener)
    // 读不到 id 就把目标置空，让确认框走「找不到该会话」分支，而不是按标题反查去删别的会话。
    expect(seen[0]?.sessionId).toBeNull()
    expect(seen[0]?.title).toBe('我的会话')
  })
})

describe('teardown', () => {
  it('removes the injected item and stops observing', async () => {
    const menu = mountMenu()
    mountRow()
    const { ctx } = makeCtx()
    const dispose = installSessionDelete(ctx)
    await settle()
    expect(deleteItem(menu)).not.toBeNull()
    dispose()
    expect(deleteItem(menu)).toBeNull()
    document.body.append(document.createElement('p'))
    await settle()
    expect(deleteItem(menu)).toBeNull()
  })
})
