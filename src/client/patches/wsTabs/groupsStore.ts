/**
 * groupsStore.ts — 页签分组的单一真源（批次⑥ 自 workspaceTabs.tsx 原样搬出）。
 *
 * 内存是唯一真源，host 文件与 localStorage 只是两个落点。`commitGroups` 的六步
 * 顺序承载「本地优先」语义：内存 → revision → ready → 写缓存 → 通知订阅者 →
 * 异步落盘；`loadGroups` 用起始 revision 判定「读回期间用户是否改过」，所以
 * `commitGroups` / `loadGroups` / `groupRevision` 必须同文件且保持行序。
 *
 * 依赖方向：本文件只 import messages.ts（`sanitize` 的空名兜底要用 `tt`）；
 * messages.ts 反过来不得 import 本文件，否则成环。
 */
import { useSyncExternalStore } from 'react'
import { tt } from './messages.ts'

export interface WsGroup {
  id: string
  name: string
  workspaceIds: string[]
}

export const DEFAULT_TAB = '__default__'
/** 官方 view store 的 flat 视图账本键（retainAccountKeys 补全用）。 */
export const FLAT_SESSION_ORDER_KEY = '__flat_session_order__'
/** 分组本地缓存（host 文件之外的兜底：开关/重启后标签不丢）。 */
const GROUPS_CACHE_KEY = 'dsh-plugin-width-slider.wsg.cache'
/** host 落盘失败的脏标志：下次启动据此以本地缓存为准并重试写回。 */
const GROUPS_DIRTY_KEY = 'dsh-plugin-width-slider.wsg.dirty'

// ── 分组 store（模块级 + useSyncExternalStore；host 落盘）───────────────
let groupReady = false
let groupLoadFailed = false
export let groups: WsGroup[] = []
/** 本地写入序号：每次 commitGroups 递增，供启动读回判定远端结果是否已经过期。 */
let groupRevision = 0
const groupSubs = new Set<() => void>()
let rpcCall: ((method: string, payload?: Record<string, unknown>) => Promise<unknown>) | null = null

export function sanitize(raw: unknown): WsGroup[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { groups?: unknown }).groups)
    ? ((raw as { groups?: unknown }).groups as unknown[])
    : []
  const out: WsGroup[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const it = item as Record<string, unknown>
    if (typeof it.id !== 'string' || it.id === '' || seen.has(it.id)) continue
    const name = typeof it.name === 'string' && it.name.trim() !== '' ? it.name.trim() : tt('new.name')
    const workspaceIds = Array.isArray(it.workspaceIds)
      ? it.workspaceIds.filter((v): v is string => typeof v === 'string' && v !== '')
      : []
    seen.add(it.id)
    out.push({ id: it.id, name, workspaceIds })
  }
  return out
}

function emitGroups(): void {
  for (const fn of groupSubs) {
    try {
      fn()
    } catch { /* 忽略 */ }
  }
}

// 快照引用必须稳定（useSyncExternalStore 要求 getSnapshot 在 store 未变化时
// 返回同一对象；每次新建字面量会触发无限重渲染 → React #185）。
let groupSnapshot: { ready: boolean; failed: boolean; groups: readonly WsGroup[] } | null = null
export function getGroupSnapshot(): { ready: boolean; failed: boolean; groups: readonly WsGroup[] } {
  if (groupSnapshot && groupSnapshot.ready === groupReady && groupSnapshot.failed === groupLoadFailed && groupSnapshot.groups === groups) {
    return groupSnapshot
  }
  groupSnapshot = { ready: groupReady, failed: groupLoadFailed, groups }
  return groupSnapshot
}

export function subscribeGroups(cb: () => void): () => void {
  groupSubs.add(cb)
  return () => {
    groupSubs.delete(cb)
  }
}

function cacheWrite(): void {
  try {
    window.localStorage.setItem(GROUPS_CACHE_KEY, JSON.stringify({ version: 1, groups, savedAt: Date.now() }))
  } catch { /* 忽略 */ }
}
function cacheRead(): WsGroup[] {
  try {
    const raw = window.localStorage.getItem(GROUPS_CACHE_KEY)
    if (!raw) return []
    return sanitize(JSON.parse(raw))
  } catch {
    return []
  }
}
/** 读缓存里的写入时间戳（无缓存/解析失败 = 0）。 */
function cacheSavedAt(): number {
  try {
    const raw = window.localStorage.getItem(GROUPS_CACHE_KEY)
    if (!raw) return 0
    const parsed = JSON.parse(raw) as { savedAt?: unknown }
    return typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0
  } catch {
    return 0
  }
}

function markDirty(): void {
  try {
    window.localStorage.setItem(GROUPS_DIRTY_KEY, '1')
  } catch { /* 忽略 */ }
}
function clearDirty(): void {
  try {
    window.localStorage.removeItem(GROUPS_DIRTY_KEY)
  } catch { /* 忽略 */ }
}

/**
 * 写盘序号：每次 persistGroups 自增；链上真正执行时用它丢弃已被更新过的那一次。
 */
let writeSeq = 0
/**
 * 写盘串行链：并发 POST 的到达顺序不保证，旧 payload 后到就会成为持久态（内存/缓存是
 * 新的、重启后回退）。串行 + 只发最新一次，让落盘顺序与本地变更顺序一致。
 */
let writeChain: Promise<void> = Promise.resolve()

function persistGroups(): void {
  const call = rpcCall
  if (!call) {
    markDirty()
    return
  }
  const seq = ++writeSeq
  // 快照内容：链上执行时 groups 可能已经变了。
  const snapshot = groups.map((g) => ({ ...g, workspaceIds: [...g.workspaceIds] }))
  writeChain = writeChain.then(async () => {
    // 期间又改过：这次的快照已过期，跳过（更新的那一次会带着最新内容发出去）。
    if (seq !== writeSeq) return
    try {
      const r = (await call('wsGroupsWrite', { groups: snapshot })) as { ok?: boolean } | null
      if (!r || r.ok !== true) {
        console.warn('[width-slider] wsGroupsWrite rejected by host，下次启动将以本地缓存为准重试')
        markDirty()
      } else {
        clearDirty()
      }
    } catch (err) {
      console.warn('[width-slider] wsGroupsWrite failed，下次启动将以本地缓存为准重试', err)
      markDirty()
    }
  })
}

export function commitGroups(mutate: (cur: WsGroup[]) => WsGroup[]): void {
  groups = mutate(groups.map((g) => ({ ...g, workspaceIds: [...g.workspaceIds] })))
  groupRevision += 1
  groupReady = true
  cacheWrite()
  emitGroups()
  persistGroups()
}

export async function loadGroups(): Promise<void> {
  /** 读回开始时的本地写入序号：期间用户若建/改过页签，远端结果即已过期。 */
  const startedRevision = groupRevision
  // 先用本地缓存同步给出与上次一致的分组视图，避免「先全量→读回后重排」的闪动。
  const firstCache = cacheRead()
  if (firstCache.length > 0) {
    groups = firstCache
    groupReady = true
    emitGroups()
  }
  if (!rpcCall) {
    const cached = cacheRead()
    if (cached.length > 0) groups = cached
    groupReady = true
    emitGroups()
    return
  }
  try {
    const result = (await rpcCall('wsGroupsRead')) as { ok?: boolean; value?: { groups?: unknown } } | null
    // 读回期间用户已经建/改过页签：本地是更新的真源，这次远端结果不再赋值（否则刚建的
    // 页签会被旧列表在内存与缓存里一起覆盖掉，窗口＝RPC 往返）。收尾照常走完，并清掉
    // 上次的失败标记 —— 本地写入一律经过 commitGroups，revision 变化即代表它已经完成
    // 了 groupReady／缓存／host 写回。
    if (groupRevision !== startedRevision) {
      groupLoadFailed = false
    } else if (result && result.ok === true) {
      const remote = sanitize(result.value)
      if (remote.length > 0) {
        // 上次写 host 失败过（脏标志）且本地缓存更新 → 以本地为准并重试写回，
        // 否则直接采用 host 数据（host 是权威）。
        const dirty = (() => {
          try {
            return window.localStorage.getItem(GROUPS_DIRTY_KEY) === '1'
          } catch {
            return false
          }
        })()
        const cached = cacheRead()
        const cacheNewer = cacheSavedAt() > 0 && cached.length > 0
        if (dirty && cacheNewer && JSON.stringify(cached) !== JSON.stringify(remote)) {
          groups = cached
          groupLoadFailed = false
          persistGroups()
        } else {
          groups = remote
          groupLoadFailed = false
          // dirty 但 host 内容与本地一致 = 上次写已成功/已收敛，清掉脏标志。
          clearDirty()
        }
      } else {
        // host 返回空：旧 host 无写入端点或文件缺失 —— 本地缓存兜底并尝试写回。
        const cached = cacheRead()
        groups = cached
        groupLoadFailed = false
        if (cached.length > 0) persistGroups()
      }
    } else {
      console.warn('[width-slider] wsGroupsRead 失败：分组功能可能不可用（RPC 拒绝），以本地缓存继续')
      groups = cacheRead()
      groupLoadFailed = true
    }
  } catch (err) {
    console.warn('[width-slider] wsGroupsRead 异常，以本地缓存继续', err)
    groups = cacheRead()
    groupLoadFailed = true
  }
  cacheWrite()
  groupReady = true
  emitGroups()
}

export function useGroups(): { ready: boolean; failed: boolean; groups: readonly WsGroup[] } {
  return useSyncExternalStore(subscribeGroups, getGroupSnapshot, getGroupSnapshot)
}

export function groupOf(id: string): WsGroup | undefined {
  return groups.find((g) => g.id === id)
}

// ── install 的写入面（批次⑥ 唯一非纯搬移之处）──────────────────────────
/**
 * 注入 RPC 调用器（null = 卸载/未注入）。install 原先直接写模块级 `rpcCall`，
 * store 拆出后只能经这个出口。
 */
export function setRpcCall(fn: ((method: string, payload?: Record<string, unknown>) => Promise<unknown>) | null): void {
  rpcCall = fn
}

/**
 * 清空本地分组并通知订阅者（install 的 disposer 用；原先直接写三个模块级变量）。
 * `groupRevision` 刻意不重置 —— 既有行为，逐字保留（见规格 Q8）。
 */
export function resetGroupsStore(): void {
  groupReady = false
  groupLoadFailed = false
  groups = []
  emitGroups()
}
