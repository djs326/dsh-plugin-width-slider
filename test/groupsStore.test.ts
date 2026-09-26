/**
 * groupsStore.ts 的引用稳定性与读回竞态（批次⑥ 补测）。
 *
 * 两条契约都在 store 层直接钉住：
 * - `getGroupSnapshot` 在 store 未变化时必须返回同一对象（useSyncExternalStore
 *   的快照契约，违反即 React #185 无限重渲染）；
 * - `loadGroups` 必须用起始 revision 判定「读回期间是否发生过本地写入」，
 *   发生过就不让远端结果覆盖本地真源。
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  commitGroups,
  getGroupSnapshot,
  loadGroups,
  resetGroupsStore,
  sanitize,
  setRpcCall,
} from '../src/client/patches/wsTabs/groupsStore.ts'
import { tt } from '../src/client/patches/wsTabs/messages.ts'

/** 当前 store 里的分组 id（经快照读，避免直读模块级 let）。 */
const ids = (): string[] => getGroupSnapshot().groups.map((g) => g.id)

beforeEach(() => {
  window.localStorage.clear()
  setRpcCall(null)
  resetGroupsStore()
})

afterEach(() => {
  setRpcCall(null)
})

describe('getGroupSnapshot', () => {
  it('store 未变化时返回同一对象，commitGroups 之后才换新对象', () => {
    const before = getGroupSnapshot()
    expect(before.ready).toBe(false)
    expect(getGroupSnapshot()).toBe(before)

    setRpcCall(async () => ({ ok: true }))
    commitGroups((cur) => [...cur, { id: 'g-1', name: '甲', workspaceIds: ['w1'] }])

    const after = getGroupSnapshot()
    expect(after).not.toBe(before)
    expect(after.ready).toBe(true)
    expect(ids()).toEqual(['g-1'])
    expect(getGroupSnapshot()).toBe(after)
  })
})

describe('loadGroups 的 revision 竞态', () => {
  it('读回期间发生的本地写入不会被远端结果覆盖', async () => {
    let release: (value: unknown) => void = () => {}
    const pending = new Promise((resolve) => {
      release = resolve
    })
    const methods: string[] = []
    setRpcCall(async (method) => {
      methods.push(method)
      if (method === 'wsGroupsRead') return pending
      return { ok: true }
    })

    const loading = loadGroups()
    commitGroups((cur) => [...cur, { id: 'g-local', name: '本地', workspaceIds: [] }])
    release({ ok: true, value: { groups: [{ id: 'g-remote', name: '远端', workspaceIds: [] }] } })
    await loading

    expect(methods).toContain('wsGroupsRead')
    expect(ids()).toEqual(['g-local'])
    expect(getGroupSnapshot().failed).toBe(false)
  })

  it('读回期间没有本地写入时采用 host 数据', async () => {
    setRpcCall(async (method) =>
      method === 'wsGroupsRead'
        ? { ok: true, value: { groups: [{ id: 'g-remote', name: '远端', workspaceIds: ['w9'] }] } }
        : { ok: true },
    )
    await loadGroups()
    expect(ids()).toEqual(['g-remote'])
    expect(getGroupSnapshot().ready).toBe(true)
    expect(getGroupSnapshot().failed).toBe(false)
  })

  it('host 读回失败时以本地缓存继续并标记 failed', async () => {
    setRpcCall(async () => ({ ok: false }))
    await loadGroups()
    expect(getGroupSnapshot().failed).toBe(true)
    expect(getGroupSnapshot().ready).toBe(true)
    expect(ids()).toEqual([])
  })
})

describe('sanitize', () => {
  it('空名兜底用 tt("new.name")，按 id 去重，非字符串 workspaceIds 丢弃', () => {
    const out = sanitize({
      groups: [
        { id: 'g-1', name: '   ', workspaceIds: ['w1', 3, '', 'w2'] },
        { id: 'g-1', name: '重复', workspaceIds: ['w3'] },
        { id: '', name: '无 id' },
        { id: 'g-2', name: '  乙  ' },
        'nope',
      ],
    })
    expect(out.map((g) => g.id)).toEqual(['g-1', 'g-2'])
    expect(out[0].name).toBe(tt('new.name'))
    expect(out[0].workspaceIds).toEqual(['w1', 'w2'])
    expect(out[1].name).toBe('乙')
    expect(out[1].workspaceIds).toEqual([])
  })

  it('没有 groups 数组的输入返回空数组', () => {
    expect(sanitize(null)).toEqual([])
    expect(sanitize({})).toEqual([])
    expect(sanitize({ groups: 'nope' })).toEqual([])
  })
})
