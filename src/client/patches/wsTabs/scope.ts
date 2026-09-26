/**
 * scope.ts — 页签作用域派生（批次⑥ 自 workspaceTabs.tsx 原样搬出）。
 *
 * 官方树把收到的 useSessions / useWorkspaces 结果当渲染依赖做引用比较，过滤结果
 * 每次新对象会引发「官方渲染 → 依赖变化 → store 同步 → 重渲染」的无限循环
 * （React #185），所以两个过滤函数按「输入 state 引用 + 作用域 key」缓存；两个
 * WeakMap 与调用方的 useCallback 同寿命，引用稳定由调用方（壳）负责维持。
 */
import { useSyncExternalStore } from 'react'
import { getSettings, onSettingsChanged } from '../../core/config.ts'

export interface WorkspaceLike {
  workspaceId?: string
  title?: string
  path?: string
  createdAt?: string
  sessionIds?: string[]
}

export interface SessionListState {
  ids?: string[]
  byId?: Record<string, unknown>
  current?: string | null
  [key: string]: unknown
}

export interface WsListState {
  items?: WorkspaceLike[]
  archivedSessionIds?: string[]
  [key: string]: unknown
}

/** 开关状态（组件常驻：开关只切显示/过滤，不重新挂组件，保证即时）。 */
export function useWsTabsEnabled(): boolean {
  return useSyncExternalStore(
    (cb) => onSettingsChanged(cb),
    () => getSettings().workspaceTabs,
    () => getSettings().workspaceTabs,
  )
}

// ── 数据过滤（带结果缓存）────────────────────────────────────────────────
// 官方树把收到的 useSessions / useWorkspaces 结果当渲染依赖做引用比较，
// 且内部会对会话顺序做账（写 store 再触发重渲染）。过滤结果每次都是新对象
// 会引发 官方渲染 → 依赖变化 → store 同步 → 重渲染 的无限循环（React #185）。
// 因此按「输入 state 引用 + 作用域 key」缓存过滤结果，引用稳定直到真实变化。
const sessionsFilterCache = new WeakMap<object, Map<string, SessionListState>>()
export function filterSessions(state: SessionListState, allowed: string[]): SessionListState {
  const src = state || {}
  const key = allowed.join('\u0001')
  let byKey = sessionsFilterCache.get(src)
  if (!byKey) {
    byKey = new Map()
    sessionsFilterCache.set(src, byKey)
  }
  const hit = byKey.get(key)
  if (hit) return hit
  const byId: Record<string, unknown> = {}
  const ids: string[] = []
  for (const id of allowed) {
    const s = (src.byId || {})[id]
    if (s === undefined) continue
    byId[id] = s
    ids.push(id)
  }
  const out: SessionListState = { ...src, ids, byId }
  byKey.set(key, out)
  return out
}

const workspacesFilterCache = new WeakMap<object, Map<string, WsListState>>()
export function filterWorkspaces(state: WsListState, workspaceIds: string[]): WsListState {
  const src = state || {}
  const key = workspaceIds.slice().sort().join('\u0001')
  let byKey = workspacesFilterCache.get(src)
  if (!byKey) {
    byKey = new Map()
    workspacesFilterCache.set(src, byKey)
  }
  const hit = byKey.get(key)
  if (hit) return hit
  const keep = new Set(workspaceIds)
  const items = (src.items || []).filter((w) => w.workspaceId !== undefined && keep.has(w.workspaceId as string))
  const out: WsListState = { ...src, items }
  byKey.set(key, out)
  return out
}

/** 官方“未分组”会话（不属于任何官方工作区 sessionIds 的会话）。 */
export function unownedSessionIds(list: SessionListState, items: WorkspaceLike[]): string[] {
  const accounted = new Set<string>()
  for (const w of items) for (const id of w.sessionIds || []) accounted.add(id)
  const out: string[] = []
  for (const id of list.ids || []) {
    if (!accounted.has(id) && list.byId && list.byId[id] !== undefined) out.push(id)
  }
  return out
}
