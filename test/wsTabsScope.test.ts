/**
 * scope.ts 的过滤收窄与引用稳定性（批次⑥ 补测）。
 *
 * 缓存的唯一目的是引用稳定：官方树把过滤结果当渲染依赖做引用比较，结果每次
 * 新对象会引发「官方渲染 → 依赖变化 → store 同步 → 重渲染」的无限循环
 * （React #185）。所以这里钉的是 `toBe`（同一引用），不是 `toEqual`。
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/client/core/config.ts', () => ({
  getSettings: () => ({ workspaceTabs: true }),
  onSettingsChanged: () => () => {},
}))

import {
  filterSessions,
  filterWorkspaces,
  unownedSessionIds,
  type SessionListState,
  type WsListState,
} from '../src/client/patches/wsTabs/scope.ts'

const sessions: SessionListState = {
  ids: ['a', 'b', 'c'],
  byId: { a: { id: 'a' }, b: { id: 'b' }, c: { id: 'c' } },
  current: 'b',
}

describe('filterSessions', () => {
  it('同一 state + 同一 allowed 返回同一对象', () => {
    expect(filterSessions(sessions, ['a', 'b'])).toBe(filterSessions(sessions, ['a', 'b']))
  })

  it('不同 allowed 返回不同对象，ids/byId 按 allowed 收窄且保序，其余字段原样带过', () => {
    const one = filterSessions(sessions, ['c', 'a'])
    const other = filterSessions(sessions, ['c'])
    expect(one).not.toBe(other)
    expect(one.ids).toEqual(['c', 'a'])
    expect(Object.keys(one.byId || {})).toEqual(['c', 'a'])
    expect(other.ids).toEqual(['c'])
    expect(one.current).toBe('b')
  })

  it('allowed 里 state 中不存在的 id 被跳过；空 allowed 得到空 ids/byId 且引用稳定', () => {
    expect(filterSessions(sessions, ['a', 'zz']).ids).toEqual(['a'])
    const empty = filterSessions(sessions, [])
    expect(empty.ids).toEqual([])
    expect(empty.byId).toEqual({})
    expect(filterSessions(sessions, [])).toBe(empty)
  })
})

const workspaces: WsListState = {
  items: [
    { workspaceId: 'w1', title: '一' },
    { workspaceId: 'w2', title: '二' },
    { title: '无 id' },
  ],
  archivedSessionIds: ['s1'],
}

describe('filterWorkspaces', () => {
  it('同一 state + 同一集合（键序无关）返回同一对象', () => {
    expect(filterWorkspaces(workspaces, ['w1', 'w2'])).toBe(filterWorkspaces(workspaces, ['w2', 'w1']))
  })

  it('不同集合返回不同对象；items 只留命中项，没有 workspaceId 的项一律丢掉', () => {
    const one = filterWorkspaces(workspaces, ['w2'])
    expect(one).not.toBe(filterWorkspaces(workspaces, ['w1']))
    expect(one.items?.map((w) => w.workspaceId)).toEqual(['w2'])
    expect(one.archivedSessionIds).toEqual(['s1'])
    const both = filterWorkspaces(workspaces, ['w1', 'w2'])
    expect(both.items?.length).toBe(2)
    expect(both.items?.some((w) => w.title === '无 id')).toBe(false)
  })
})

describe('unownedSessionIds', () => {
  it('只列出未被任何工作区认领、且 byId 中确实存在的会话', () => {
    const list: SessionListState = { ids: ['a', 'b', 'zz'], byId: { a: {}, b: {} } }
    expect(unownedSessionIds(list, [{ workspaceId: 'w1', sessionIds: ['a'] }])).toEqual(['b'])
  })
})
