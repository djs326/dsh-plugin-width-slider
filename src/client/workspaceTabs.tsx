/**
 * workspaceTabs.tsx — 工作区分组文件夹页签栏（v0.6.0，模型经用户确认重构）。
 *
 * 模型（与用户对齐后的最终语义）：
 * - 「默认」= 根页签：显示还没有被分配进任何分组文件夹的直属工作区
 *   （官方整棵树的过滤视图），以及官方“未分组”会话（不属于任何工作区的会话）；
 * - 用户自建分组文件夹（可自定义命名、可增删），一个文件夹对应一个页签，
 *   文件夹里放“被分配”过来的工作区；
 * - 工作区唯一归属：它同一时间只属于一个位置（默认或某个文件夹）。把工作区
 *   勾进某文件夹 = 自动从原位置移过来；删除文件夹 = 其中工作区自动回到默认；
 * - 工作区行（组头）的操作菜单里有四字项「分配标签」：把该工作区放进任意
 *   页签或移回默认（唯一归属，删除页签自动回默认）；
 * - 会话级「分配工作区」已按用户确认废除（assignSession.ts 已删除）。
 *
 * 实现要点：
 * - 不移动官方数据：分组只是“显示作用域”。官方树经过滤后的
 *   useSessions / useWorkspaces 只包含当前页签作用域内的工作区与会话，
 *   官方树渲染、行菜单、搜索、分组方式全部原样保留；
 * - 标题行处理同 v0.6.0 首版：官方「工作区/会话」标题原位隐藏，页签栏以
 *   React Portal 放进官方 header 行首（标题位置）；
 * - 分组持久化在 host（workspace-groups.json，/width-slider wsGroupsRead/Write），
 *   本模块维护小组 store（useSyncExternalStore），任何增删改即时落盘。
 */
import {
  createElement as h,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { isZhInterface } from './lang.ts'
import { getSettings, onSettingsChanged } from './config.ts'

/** 本插件对官方槽条目做的包裹标记（防重入 / 供卸载还原）。 */
export const WS_TABS_MARK = '__widthSliderWsTabs'
const DEFAULT_TAB = '__default__'
const ACTIVE_KEY = 'dsh-plugin-width-slider.wsTab'
/** 分组本地缓存（host 文件之外的兜底：开关/重启后标签不丢）。 */
const GROUPS_CACHE_KEY = 'dsh-plugin-width-slider.wsg.cache'
const STYLE_ID = 'dsh-plugin-width-slider-ws-tabs'

const TABS_CSS = `
[data-dsh-ws-tabs-bar]{display:flex;align-items:center;gap:0;flex:0 1 auto;min-width:0;max-width:62%;height:100%;overflow-x:auto;overflow-y:hidden;padding-left:0;scrollbar-width:none;order:-1}
[data-dsh-ws-tabs-bar]::-webkit-scrollbar{display:none}
[data-dsh-ws-tabs-bar] [data-dsh-ws-tab]{appearance:none;background:transparent;border:0;margin:0;padding:0 3px 0 0;font:inherit;font-size:13px;line-height:36px;height:36px;color:var(--dsw-alias-label-tertiary,#8a8f98);cursor:pointer;white-space:nowrap;position:relative;display:inline-flex;align-items:center;gap:3px;flex:none}
[data-dsh-ws-tabs-bar] [data-dsh-ws-tab]:hover{color:var(--dsw-alias-label-primary,#e6edf3)}
[data-dsh-ws-tabs-bar] [data-dsh-ws-tab][aria-selected="true"]{color:var(--dsw-alias-label-primary,#e6edf3);font-weight:600}
[data-dsh-ws-tabs-bar] [data-dsh-ws-tab][aria-selected="true"]::after{content:"";position:absolute;left:0;right:3px;bottom:0;height:2px;border-radius:2px 2px 0 0;background:currentColor}
[data-dsh-ws-tabs-bar] [data-dsh-ws-add]{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#8a8f98);cursor:pointer;padding:2px;margin-left:auto;flex:none;border-radius:6px;line-height:0}
[data-dsh-ws-tabs-bar] [data-dsh-ws-add]:hover{color:var(--dsw-alias-label-primary,#e6edf3);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
[data-dsh-ws-tabs-bar] [data-dsh-ws-add] svg{display:block}
`

interface WorkspaceLike {
  workspaceId?: string
  title?: string
  path?: string
  createdAt?: string
  sessionIds?: string[]
}

interface SessionListState {
  ids?: string[]
  byId?: Record<string, unknown>
  current?: string | null
  [key: string]: unknown
}

interface WsListState {
  items?: WorkspaceLike[]
  archivedSessionIds?: string[]
  [key: string]: unknown
}

export interface WsGroup {
  id: string
  name: string
  workspaceIds: string[]
}

export interface WsTabsCtx {
  get?: <T = unknown>(name: string) => T | undefined
  connection?: {
    rpc: {
      call: (path: string, method: string, payload?: Record<string, unknown>) => Promise<unknown>
    }
  }
  slots?: {
    entries?: (key: string) => Array<{ component?: unknown }>
    subscribe?: (key: string, listener: () => void) => () => void
    inject?: (name: string, register: () => () => void) => () => void
    register?: (options: Record<string, unknown>, component: unknown) => () => void
  }
}

// ── 文案 ────────────────────────────────────────────────────────────────
const T: Record<string, [string, string]> = {
  'tab.default': ['默认', 'Default'],
  'tab.groupTitle': ['{name}（{n} 个工作区）', '{name} ({n} workspaces)'],
  'ctx.rename': ['重命名', 'Rename'],
  'ctx.members': ['管理工作区', 'Manage workspaces'],
  'ctx.delete': ['删除', 'Delete'],
  'rename.title': ['重命名页签', 'Rename tab'],
  'rename.placeholder': ['给文件夹起个名字', 'Name this folder'],
  'rename.save': ['保存', 'Save'],
  'rename.saving': ['保存中…', 'Saving…'],
  'rename.dup': ['已存在同名页签。', 'A tab with this name already exists.'],
  'members.title': ['管理页签「{name}」', 'Manage tab "{name}"'],
  'members.desc': ['勾选 = 放进此页签。工作区同一时间只属于一个位置（默认或某个页签），勾选会把它从原位置移过来。', 'Check to include. A workspace belongs to one place at a time (Default or one tab); checking moves it here.'],
  'members.at': ['位于：{name}', 'In: {name}'],
  'members.atDefault': ['位于：默认', 'In: Default'],
  'members.empty': ['还没有工作区。', 'No workspaces yet.'],
  'delete.title': ['删除页签', 'Delete tab'],
  'delete.desc': ['删除「{name}」后，其中的 {n} 个工作区会自动移回默认页签。', 'Deleting "{name}" moves its {n} workspace(s) back to the Default tab.'],
  'delete.ok': ['删除', 'Delete'],
  'delete.busy': ['删除中…', 'Deleting…'],
  'cancel': ['取消', 'Cancel'],
  'new.name': ['未命名', 'Untitled'],
  'warn.noRpc': ['工作区分组服务不可用', 'Workspace groups service unavailable'],
  'defaultHint': ['默认页签 = 直属工作区与未分组会话', 'Default tab shows direct workspaces and ungrouped sessions'],
  'add.tab': ['新建页签', 'New tab'],
  'done': ['完成', 'Done'],
}
function tt(key: string, vars?: Record<string, string>): string {
  const pair = T[key]
  if (!pair) return key
  let text = isZhInterface() ? pair[0] : pair[1]
  if (vars) for (const k of Object.keys(vars)) text = text.replace('{' + k + '}', vars[k])
  return text
}

// ── primitives（Modal 等；bundle external，运行时 require）──────────────
let _primitives: { Modal?: unknown } | null = null
function primitives(): { Modal: any } {
  if (_primitives === null) {
    try {
      const mod = require('@deepseek-ai/dsh-client-ui-primitives') as { Modal?: unknown }
      _primitives = mod && typeof mod === 'object' ? mod : {}
    } catch {
      _primitives = {}
    }
  }
  return _primitives as { Modal: any }
}

// ── 分组 store（模块级 + useSyncExternalStore；host 落盘）───────────────
let groupReady = false
let groupLoadFailed = false
let groups: WsGroup[] = []
const groupSubs = new Set<() => void>()
let rpcCall: ((method: string, payload?: Record<string, unknown>) => Promise<unknown>) | null = null

function sanitize(raw: unknown): WsGroup[] {
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
function getGroupSnapshot(): { ready: boolean; failed: boolean; groups: readonly WsGroup[] } {
  if (groupSnapshot && groupSnapshot.ready === groupReady && groupSnapshot.failed === groupLoadFailed && groupSnapshot.groups === groups) {
    return groupSnapshot
  }
  groupSnapshot = { ready: groupReady, failed: groupLoadFailed, groups }
  return groupSnapshot
}

function subscribeGroups(cb: () => void): () => void {
  groupSubs.add(cb)
  return () => {
    groupSubs.delete(cb)
  }
}

function cacheWrite(): void {
  try {
    window.localStorage.setItem(GROUPS_CACHE_KEY, JSON.stringify({ version: 1, groups }))
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

function persistGroups(): void {
  if (!rpcCall) return
  rpcCall('wsGroupsWrite', { groups })
    .then((res) => {
      const r = res as { ok?: boolean } | null
      if (!r || r.ok !== true) console.warn('[width-slider] wsGroupsWrite rejected by host')
    })
    .catch((err: unknown) => console.warn('[width-slider] wsGroupsWrite failed', err))
}

function commitGroups(mutate: (cur: WsGroup[]) => WsGroup[]): void {
  groups = mutate(groups.map((g) => ({ ...g, workspaceIds: [...g.workspaceIds] })))
  groupReady = true
  cacheWrite()
  emitGroups()
  persistGroups()
}

async function loadGroups(): Promise<void> {
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
    if (result && result.ok === true) {
      const remote = sanitize(result.value)
      if (remote.length > 0) {
        groups = remote
        groupLoadFailed = false
      } else {
        // host 返回空：旧 host 无写入端点或文件缺失 —— 本地缓存兜底并尝试写回。
        const cached = cacheRead()
        groups = cached
        groupLoadFailed = false
        if (cached.length > 0) persistGroups()
      }
    } else {
      groups = cacheRead()
      groupLoadFailed = true
    }
  } catch {
    groups = cacheRead()
    groupLoadFailed = true
  }
  cacheWrite()
  groupReady = true
  emitGroups()
}

function useGroups(): { ready: boolean; failed: boolean; groups: readonly WsGroup[] } {
  return useSyncExternalStore(subscribeGroups, getGroupSnapshot, getGroupSnapshot)
}

function groupOf(id: string): WsGroup | undefined {
  return groups.find((g) => g.id === id)
}

/** 开关状态（组件常驻：开关只切显示/过滤，不重新挂组件，保证即时）。 */
function useWsTabsEnabled(): boolean {
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
function filterSessions(state: SessionListState, allowed: string[]): SessionListState {
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
function filterWorkspaces(state: WsListState, workspaceIds: string[]): WsListState {
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
function unownedSessionIds(list: SessionListState, items: WorkspaceLike[]): string[] {
  const accounted = new Set<string>()
  for (const w of items) for (const id of w.sessionIds || []) accounted.add(id)
  const out: string[] = []
  for (const id of list.ids || []) {
    if (!accounted.has(id) && list.byId && list.byId[id] !== undefined) out.push(id)
  }
  return out
}

// ── 官方标题行定位与隐藏 ────────────────────────────────────────────────
const LABEL_WORDS = ['工作区', '会话', 'Workspaces', 'Sessions']
const SEARCH_PLACEHOLDERS = ['搜索会话', 'Search sessions']

function isLabelNode(el: Element): boolean {
  const text = (el.textContent || '').trim()
  return LABEL_WORDS.some((w) => text === w) && el.children.length === 0
}

function locateHeader(host: Element): { row: HTMLElement; label: HTMLElement } | null {
  const inputs = Array.from(host.querySelectorAll('input[type="text"]'))
  for (const input of inputs) {
    const ph = (input as HTMLInputElement).placeholder || ''
    if (!SEARCH_PLACEHOLDERS.some((p) => ph.indexOf(p) >= 0)) continue
    let node: HTMLElement | null = input.parentElement
    while (node && node !== host && node.parentElement !== host) {
      const first = node.firstElementChild
      if (first instanceof HTMLElement && isLabelNode(first)) {
        return { row: node, label: first }
      }
      node = node.parentElement
    }
    node = input.parentElement
    for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
      if (!node || node === host) break
      for (const child of Array.from(node.children)) {
        if (child instanceof HTMLElement && child !== input && isLabelNode(child)) {
          return { row: node, label: child }
        }
      }
    }
  }
  const spans = Array.from(host.querySelectorAll('span'))
  for (const span of spans) {
    if (!(span instanceof HTMLElement) || !isLabelNode(span)) continue
    const row = span.parentElement
    if (row) return { row, label: span }
  }
  return null
}

// ── 图标 ────────────────────────────────────────────────────────────────
const I = {
  plus: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
}

// ── 工作区行菜单「分配工作区」（把工作区分配到某个页签/默认）──────────────
const WS_ASSIGN_MENU_ATTR = 'data-ws-assign-tab-item'
const ASSIGN_TAB_EVENT = 'dsh:ws-tab-assign'
const ASSIGN_ICON_PATH =
  '<path transform="translate(9.52 2.52)" d="M3.55246 0L3.55246 2.44252L6 2.44252L6 3.55748L3.55246 3.55748L3.55246 6L2.43834 6L2.43834 3.55748L0 3.55748L0 2.44252L2.43834 2.44252L2.43834 0L3.55246 0Z" fill="currentColor"/>' +
  '<path transform="translate(0.3496 2.35)" d="M4.76367 0C5.36861 1.80598e-05 5.93113 0.310294 6.25488 0.821289L6.78027 1.64941C6.79685 1.67558 6.81791 1.69775 6.83887 1.71973C6.72186 2.15521 6.65702 2.61192 6.65137 3.08301C6.25601 2.96045 5.90909 2.70478 5.68164 2.3457L5.15723 1.5166C5.07183 1.38189 4.92318 1.3008 4.76367 1.30078L2.32422 1.30078C1.7589 1.30078 1.30078 1.7589 1.30078 2.32422L1.30078 10.1338C1.30078 10.6991 1.7589 11.1572 2.32422 11.1572L11.9766 11.1572C12.5419 11.1572 13 10.6991 13 10.1338L13 8.58398C13.4545 8.5135 13.8903 8.38748 14.3008 8.21289L14.3008 10.1338C14.3008 11.4171 13.2598 12.458 11.9766 12.458L2.32422 12.458C1.04093 12.458 0 11.4171 0 10.1338L0 2.32422C0 1.04093 1.04093 0 2.32422 0L4.76367 0Z" fill="currentColor"/>'

const T_WS = {
  'menu.assign': ['分配标签', 'Assign tag'],
  'dlg.title': ['分配标签', 'Assign tag'],
  'dlg.desc': ['为「{name}」选择标签（默认或某个页签）', 'Choose a tag for "{name}" (Default or a tab)'],
  'dlg.cur': ['当前所在', 'Current'],
  'dlg.done': ['已分配', 'Assigned'],
  'dlg.noWs': ['该工作区已不存在。', 'This workspace no longer exists.'],
} as Record<string, [string, string]>
function ttw(key: string, vars?: Record<string, string>): string {
  const pair = T_WS[key]
  if (!pair) return key
  let text = isZhInterface() ? pair[0] : pair[1]
  if (vars) for (const k of Object.keys(vars)) text = text.replace('{' + k + '}', vars[k])
  return text
}

/** 正在打开 ⋯ 菜单的工作区行（官方组头行，含 menuOpen）。 */
function findOpenProjectRow(): HTMLElement | null {
  const rows = document.querySelectorAll<HTMLElement>('[class*=projectRow]')
  for (const row of rows) {
    if (row.className.indexOf('menuOpen') >= 0) return row
  }
  return null
}

/** 从行 React fiber 直读官方 group 节点里的 workspaceId（不按标题反查）。 */
function workspaceInfoFromRow(row: HTMLElement): { workspaceId: string | null; title: string } {
  let title = ''
  try {
    const titleEl = row.querySelector('[class*=title]')
    if (titleEl) title = String((titleEl as HTMLElement).innerText || '').trim()
  } catch { /* 忽略 */ }
  try {
    for (const key of Object.keys(row)) {
      if (key.indexOf('__reactFiber$') !== 0) continue
      let node: unknown = (row as unknown as Record<string, unknown>)[key]
      for (let depth = 0; node && depth < 32; depth += 1, node = (node as { return?: unknown }).return) {
        const props = (node as { memoizedProps?: { group?: { workspaceId?: unknown; label?: unknown } } }).memoizedProps
        if (props && props.group && typeof props.group.workspaceId === 'string') {
          return { workspaceId: props.group.workspaceId, title: title || String(props.group.label ?? '') }
        }
      }
    }
  } catch { /* fail closed */ }
  return { workspaceId: null, title }
}

function openAssignToTab(row: HTMLElement): void {
  const info = workspaceInfoFromRow(row)
  window.dispatchEvent(new CustomEvent(ASSIGN_TAB_EVENT, { detail: info }))
}

/** 往工作区行打开的 ⋯ 菜单里克隆官方项插入「分配工作区」（四字、普通色）。 */
function ensureWorkspaceAssignMenuItem(): void {
  if (!getSettings().workspaceTabs) return
  const row = findOpenProjectRow()
  if (!row) return
  const menu = document.querySelector('[role=menu]')
  if (!menu) return
  if (menu.querySelector('[' + WS_ASSIGN_MENU_ATTR + ']')) return
  const info = workspaceInfoFromRow(row)
  if (!info.workspaceId) return
  const template = Array.from(menu.querySelectorAll('[role=menuitem]')).find(
    (el) =>
      !el.hasAttribute(WS_ASSIGN_MENU_ATTR) &&
      !el.hasAttribute('data-session-delete-item') &&
      !el.hasAttribute('data-ws-assign-item'),
  ) as HTMLElement | null
  let item: HTMLButtonElement
  if (template) {
    item = template.cloneNode(true) as HTMLButtonElement
    const iconSvg = item.querySelector('svg')
    if (iconSvg) {
      iconSvg.setAttribute('fill', 'currentColor')
      iconSvg.setAttribute('stroke', 'none')
      iconSvg.innerHTML = ASSIGN_ICON_PATH
    }
    const spans = Array.from(item.querySelectorAll('span'))
    const labelSpan = spans.find((s) => s.textContent && s.textContent.trim() !== '') ?? null
    if (labelSpan) labelSpan.textContent = ttw('menu.assign')
    else {
      const span = document.createElement('span')
      span.textContent = ttw('menu.assign')
      item.appendChild(span)
    }
  } else {
    item = document.createElement('button')
    item.type = 'button'
    item.setAttribute('role', 'menuitem')
    item.style.cssText = [
      'display:flex', 'align-items:center', 'gap:8px', 'width:100%',
      'padding:6px 12px', 'border:none', 'background:transparent',
      'color:var(--dsw-alias-label-primary,#e6edf3)',
      'font:inherit', 'fontSize:13px', 'lineHeight:20px',
      'textAlign:left', 'borderRadius:6px', 'cursor:pointer',
    ].join(';')
    item.innerHTML = '<span style="display:inline-flex;flex:none"><svg width="16" height="16" viewBox="0 0 16 16" fill="none">' + ASSIGN_ICON_PATH + '</svg></span><span>' + ttw('menu.assign') + '</span>'
    item.addEventListener('mouseenter', () => { item.style.background = 'var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.14))' })
    item.addEventListener('mouseleave', () => { item.style.background = 'transparent' })
  }
  item.setAttribute(WS_ASSIGN_MENU_ATTR, '1')
  item.addEventListener('click', () => openAssignToTab(row))
  // 插到「删除工作区」上方（zh/en 均可），找不到则追加到末尾。
  const deleteItem = Array.from(menu.querySelectorAll('[role=menuitem]')).find((el) => {
    const text = (el.textContent || '').trim()
    return text === '删除工作区' || text === 'Delete workspace' || text.indexOf('删除工作区') >= 0
  })
  if (deleteItem && deleteItem.parentNode) deleteItem.parentNode.insertBefore(item, deleteItem)
  else menu.appendChild(item)
}

/** 把工作区分配到目标页签（null=默认），唯一归属：从其它页签移出。 */
function assignWsToTab(wsId: string, targetGroupId: string | null): void {
  commitGroups((cur) => {
    const out = cur.map((g) =>
      g.id === targetGroupId ? g : { ...g, workspaceIds: g.workspaceIds.filter((id) => id !== wsId) },
    )
    if (targetGroupId === null) return out
    return out.map((g) => {
      if (g.id !== targetGroupId) return g
      if (g.workspaceIds.includes(wsId)) return g
      return { ...g, workspaceIds: [...g.workspaceIds, wsId] }
    })
  })
}

/** 分配目标选择（官方 Modal；由侧栏壳组件状态驱动，事件经窗口事件桥送达）。 */
function AssignTabPicker(props: {
  workspaceId: string
  title: string
  currentOwner: string | undefined
  groupNames: { id: string; name: string }[]
  onDone: () => void
}): ReactNode {
  const { workspaceId, title, currentOwner, groupNames, onDone } = props
  const [doneName, setDoneName] = useState<string | null>(null)
  const Modal = primitives().Modal
  if (!Modal) return null

  const pick = (groupId: string | null, label: string) => {
    assignWsToTab(workspaceId, groupId)
    setDoneName(label)
  }
  const option = (groupId: string | null, name: string): ReactNode =>
    h(
      'button',
      {
        type: 'button',
        onClick: () => pick(groupId, name),
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          border: 0,
          background: 'transparent',
          color: 'var(--dsw-alias-label-primary,#e6edf3)',
          padding: '8px 10px',
          borderRadius: 8,
          font: 'inherit',
          fontSize: 13,
          textAlign: 'left',
          cursor: 'pointer',
        },
        onMouseEnter: (e: { currentTarget: HTMLElement }) => {
          e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12))'
        },
        onMouseLeave: (e: { currentTarget: HTMLElement }) => {
          e.currentTarget.style.background = 'transparent'
        },
      },
      [
        h('span', { key: 'n', style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, name),
        currentOwner === groupId || (currentOwner === undefined && groupId === null)
          ? h('span', { key: 'c', style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary,#a8abb3)' } }, ttw('dlg.cur'))
          : null,
      ],
    )

  return h(
    Modal,
    {
      open: true,
      onClose: onDone,
      title: ttw('dlg.title'),
      closeLabel: tt('cancel'),
      footer: [h('button', { key: 'ok', type: 'button', onClick: onDone, style: btnStyle({ primary: true }, false) }, tt('done'))],
    },
    h('div', null, [
      doneName !== null
        ? h('div', { style: { padding: '8px 4px', fontSize: 13, color: 'var(--dsw-alias-state-success-primary,#3fb950)' } }, ttw('dlg.done') + '：' + doneName)
        : h('div', null, [
            h('div', { key: 'd', style: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary,#a8abb3)', marginBottom: 8 } }, ttw('dlg.desc', { name: title || '' })),
            h('div', { key: 'l', style: { display: 'flex', flexDirection: 'column', gap: 1 } }, [
              option(null, tt('tab.default')),
              ...groupNames.map((g) => option(g.id, g.name)),
            ]),
          ]),
    ]),
  )
}

// ── 页签栏（Portal 进官方 header 行）───────────────────────────────────
function TabStrip(props: {
  groups: readonly WsGroup[]
  active: string
  ready: boolean
  onPick: (id: string) => void
  onRename: (id: string) => void
  onMembers: (id: string) => void
  onDelete: (id: string) => void
  onAdd: () => void
}): ReactNode {
  const { groups, active, ready, onPick, onRename, onMembers, onDelete, onAdd } = props
  const [ctx, setCtx] = useState<{ x: number; y: number; id: string } | null>(null)

  useEffect(() => {
    if (!ctx) return
    // 点菜单自身不关；点外部 / Esc 才关（否则菜单项 click 永远被吞）。
    const closeOnOutside = (e: Event) => {
      const t = e.target
      if (t instanceof Element && t.closest && t.closest('[data-dsh-ws-ctx-menu]')) return
      setCtx(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtx(null)
    }
    document.addEventListener('pointerdown', closeOnOutside, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [ctx])

  const tabOf = (id: string): ReactNode => {
    const isDefault = id === DEFAULT_TAB
    const name = isDefault ? tt('tab.default') : (groupOf(id)?.name || '')
    const g = isDefault ? undefined : groupOf(id)
    const count = g ? g.workspaceIds.length : 0
    return h(
      'span',
      {
        key: id,
        role: 'tab',
        'aria-selected': active === id,
        'data-dsh-ws-tab': '',
        'data-dsh-ws-id': id,
        title: isDefault ? tt('defaultHint') : tt('tab.groupTitle', { name, n: String(count) }),
        onClick: (e: { stopPropagation: () => void }) => {
          e.stopPropagation()
          onPick(id)
        },
        onContextMenu: (e: { preventDefault: () => void; stopPropagation: () => void; clientX: number; clientY: number }) => {
          if (isDefault) return
          e.preventDefault()
          e.stopPropagation()
          setCtx({ x: e.clientX, y: e.clientY, id })
        },
      },
      name,
    )
  }

  const menuBtn = (label: string, danger: boolean, onPickAction: () => void): ReactNode =>
    h(
      'button',
      {
        type: 'button',
        onClick: (e: { stopPropagation: () => void }) => {
          e.stopPropagation()
          setCtx(null)
          onPickAction()
        },
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          border: 0,
          background: 'transparent',
          color: danger ? 'var(--dsw-alias-state-error-primary,#e5484d)' : 'var(--dsw-alias-label-primary,#e6edf3)',
          padding: '7px 10px',
          borderRadius: 7,
          font: 'inherit',
          fontSize: 13,
          textAlign: 'left',
          cursor: 'pointer',
        },
        onMouseEnter: (e: { currentTarget: HTMLElement }) => {
          e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.14))'
        },
        onMouseLeave: (e: { currentTarget: HTMLElement }) => {
          e.currentTarget.style.background = 'transparent'
        },
      },
      label,
    )

  const addLabel = tt('add.tab')
  return h(
    'div',
    {
      'data-dsh-ws-tabs-bar': '',
      role: 'tablist',
      'aria-label': tt('tab.default'),
      onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    },
    [
      tabOf(DEFAULT_TAB),
      ...groups.map((g) => tabOf(g.id)),
      h(
        'button',
        {
          key: '__add',
          type: 'button',
          'data-dsh-ws-add': '',
          title: addLabel,
          'aria-label': addLabel,
          onClick: (e: { stopPropagation: () => void }) => {
            e.stopPropagation()
            onAdd()
          },
        },
        h('span', { dangerouslySetInnerHTML: { __html: I.plus } }),
      ),
      ctx && !ready
        ? null
        : ctx
          ? h(
              'div',
              {
                key: 'ctx-menu',
                'data-dsh-ws-ctx-menu': '',
                onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
                style: {
                  position: 'fixed',
                  left: Math.max(8, Math.min(ctx.x, (window.innerWidth || 900) - 220)),
                  top: Math.max(8, ctx.y),
                  zIndex: 4100,
                  minWidth: 180,
                  padding: 6,
                  border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.4))',
                  borderRadius: 10,
                  background: 'var(--dsw-specific-menu, var(--dsw-alias-bg-layer-2, #202124))',
                  boxShadow: '0 12px 32px rgba(0,0,0,.28)',
                },
              },
              [
                menuBtn(tt('ctx.rename'), false, () => onRename(ctx.id)),
                menuBtn(tt('ctx.members'), false, () => onMembers(ctx.id)),
                menuBtn(tt('ctx.delete'), true, () => onDelete(ctx.id)),
              ],
            )
          : null,
    ],
  )
}

// ── 对话框（重命名 / 管理工作区 / 删除）──────────────────────────────────
function btnStyle(opts: { primary?: boolean; danger?: boolean; disabled?: boolean }, busy: boolean): CSSProperties {
  const base: CSSProperties = {
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 13,
    cursor: busy || opts.disabled ? 'default' : 'pointer',
    marginRight: 8,
    opacity: busy || opts.disabled ? 0.5 : 1,
  }
  if (opts.danger) {
    base.border = '1px solid var(--dsw-alias-state-error-primary,#e5484d)'
    base.background = 'var(--dsw-alias-state-error-primary,#e5484d)'
    base.color = '#fff'
  } else if (opts.primary) {
    base.border = '1px solid var(--dsw-alias-state-business-primary,#4f9eff)'
    base.background = 'var(--dsw-alias-state-business-primary,#4f9eff)'
    base.color = '#fff'
  } else {
    base.border = '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.4))'
    base.background = 'transparent'
    base.color = 'var(--dsw-alias-label-primary,inherit)'
  }
  return base
}

function RenameDialog(props: { groupId: string; onDone: () => void }): ReactNode {
  const g = groupOf(props.groupId)
  const [draft, setDraft] = useState(g?.name || '')
  const [busy, setBusy] = useState(false)
  if (!g) return null
  const Modal = primitives().Modal
  if (!Modal) return null

  const trimmed = draft.trim()
  const duplicate = trimmed !== '' && trimmed !== g.name && groups.some((x) => x.id !== g.id && x.name === trimmed)
  const blocked = busy || trimmed === '' || duplicate
  const save = () => {
    if (blocked) return
    setBusy(true)
    commitGroups((cur) => cur.map((x) => (x.id === g.id ? { ...x, name: trimmed } : x)))
    setBusy(false)
    props.onDone()
  }
  const close = () => {
    if (!busy) props.onDone()
  }
  return h(
    Modal,
    {
      open: true,
      onClose: close,
      title: tt('rename.title'),
      closeLabel: tt('cancel'),
      footer: [
        h('button', { key: 'cancel', type: 'button', onClick: close, style: btnStyle({}, busy) }, tt('cancel')),
        h('button', {
          key: 'save',
          type: 'button',
          disabled: busy || blocked,
          onClick: save,
          style: btnStyle({ primary: true, disabled: blocked }, busy),
        }, busy ? tt('rename.saving') : tt('rename.save')),
      ],
    },
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, [
      h('input', {
        key: 'inp',
        type: 'text',
        autoFocus: true,
        value: draft,
        maxLength: 40,
        placeholder: tt('rename.placeholder'),
        onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
        onKeyDown: (e: { key: string }) => {
          if (e.key === 'Enter') save()
        },
        style: {
          boxSizing: 'border-box',
          width: '100%',
          minHeight: 36,
          padding: '0 10px',
          border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.4))',
          borderRadius: 8,
          background: 'var(--dsw-alias-bg-layer-2, rgba(255,255,255,.04))',
          color: 'var(--dsw-alias-label-primary, inherit)',
          fontSize: 13,
          outline: 'none',
        },
      }),
      duplicate
        ? h('div', { key: 'dup', style: { fontSize: 12, color: 'var(--dsw-alias-state-error-primary,#e5484d)' } }, tt('rename.dup'))
        : null,
    ]),
  )
}

function MembersDialog(props: {
  groupId: string
  items: WorkspaceLike[]
  membership: Map<string, string>
  onDone: () => void
}): ReactNode {
  const g = groupOf(props.groupId)
  const { items, membership, onDone } = props
  if (!g) return null
  const Modal = primitives().Modal
  if (!Modal) return null
  const included = new Set(g.workspaceIds)

  const toggle = (wsId: string, on: boolean): void => {
    commitGroups((cur) => {
      const moved = cur.map((x) =>
        x.id === g.id
          ? x
          : { ...x, workspaceIds: x.workspaceIds.filter((id) => id !== wsId) },
      )
      return moved.map((x) => {
        if (x.id !== g.id) return x
        const has = x.workspaceIds.includes(wsId)
        if (on && !has) return { ...x, workspaceIds: [...x.workspaceIds, wsId] }
        if (!on && has) return { ...x, workspaceIds: x.workspaceIds.filter((id) => id !== wsId) }
        return x
      })
    })
  }

  return h(
    Modal,
    {
      open: true,
      onClose: onDone,
      title: tt('members.title', { name: g.name }),
      closeLabel: tt('cancel'),
      footer: [h('button', { key: 'ok', type: 'button', onClick: onDone, style: btnStyle({ primary: true }, false) }, tt('done'))],
    },
    h('div', null, [
      h('div', { key: 'desc', style: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary,#a8abb3)', marginBottom: 10 } }, tt('members.desc')),
      items.length === 0
        ? h('div', { key: 'empty', style: { padding: '18px 4px', textAlign: 'center', fontSize: 13, color: 'var(--dsw-alias-label-secondary,#a8abb3)' } }, tt('members.empty'))
        : h(
            'div',
            { key: 'list', style: { display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 260, overflowY: 'auto' } },
            items.map((w) => {
              const wsId = w.workspaceId || ''
              const name = w.title || w.path || wsId
              const inGroup = included.has(wsId)
              const owner = membership.get(wsId)
              return h(
                'label',
                {
                  key: wsId,
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '7px 10px',
                    borderRadius: 8,
                    fontSize: 13,
                    cursor: 'pointer',
                  },
                  onMouseEnter: (e: { currentTarget: HTMLElement }) => {
                    e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12))'
                  },
                  onMouseLeave: (e: { currentTarget: HTMLElement }) => {
                    e.currentTarget.style.background = 'transparent'
                  },
                },
                [
                  h('input', {
                    key: 'ck',
                    type: 'checkbox',
                    checked: inGroup,
                    onChange: (e: { target: { checked: boolean } }) => toggle(wsId, e.target.checked),
                    style: { margin: 0, width: 15, height: 15, flex: 'none', accentColor: 'var(--dsw-alias-state-business-primary,#4f9eff)' },
                  }),
                  h('span', { key: 'n', style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, name),
                  h('span', { key: 'o', style: { flex: 'none', fontSize: 11, color: 'var(--dsw-alias-label-caption,#8a8e96)' } }, owner ? tt('members.at', { name: groupOf(owner)?.name || owner }) : tt('members.atDefault')),
                ],
              )
            }),
          ),
    ]),
  )
}

function DeleteDialog(props: { groupId: string; onDone: () => void }): ReactNode {
  const g = groupOf(props.groupId)
  const [busy, setBusy] = useState(false)
  if (!g) return null
  const Modal = primitives().Modal
  if (!Modal) return null
  const count = g.workspaceIds.length
  const close = () => {
    if (!busy) props.onDone()
  }
  const confirm = () => {
    if (busy) return
    setBusy(true)
    commitGroups((cur) => cur.filter((x) => x.id !== g.id))
    setBusy(false)
    props.onDone()
  }
  return h(
    Modal,
    {
      open: true,
      onClose: close,
      title: tt('delete.title'),
      closeLabel: tt('cancel'),
      description: tt('delete.desc', { name: g.name, n: String(count) }),
      footer: [
        h('button', { key: 'cancel', type: 'button', onClick: close, style: btnStyle({}, busy) }, tt('cancel')),
        h('button', { key: 'del', type: 'button', disabled: busy, onClick: confirm, style: btnStyle({ danger: true }, busy) }, busy ? tt('delete.busy') : tt('delete.ok')),
      ],
    },
    null,
  )
}

// ── 官方槽包裹壳 ────────────────────────────────────────────────────────
interface ShellProps {
  OfficialComp: unknown
  wide?: boolean
  useSessions?: (sel: (s: unknown) => unknown, eq?: unknown) => unknown
  useWorkspaces?: (sel: (s: unknown) => unknown, eq?: unknown) => unknown
  actions?: unknown
  [key: string]: unknown
}

function WorkspaceTabsShell(innerProps: ShellProps): ReactNode {
  const { OfficialComp, wide = true, useSessions, useWorkspaces } = innerProps
  // 开关状态：组件常驻，开关只切「标签+过滤」，不重新挂载组件（即时生效）。
  const enabled = useWsTabsEnabled()
  const gs = useGroups()
  const groupList = gs.groups
  const [active, setActive] = useState<string>(() => {
    try {
      const saved = window.localStorage.getItem(ACTIVE_KEY)
      // 校验：只认 默认 或本插件生成的组 id（g- 前缀）；旧版残留（工作区 id）一律忽略，避免作用域为空。
      const valid = saved !== null && (saved === DEFAULT_TAB || saved.indexOf('g-') === 0)
      return valid ? saved : DEFAULT_TAB
    } catch {
      return DEFAULT_TAB
    }
  })
  const hostRef = useRef<HTMLDivElement>(null)
  const [header, setHeader] = useState<{ row: HTMLElement; label: HTMLElement } | null>(null)
  const [dialog, setDialog] = useState<{ kind: 'rename' | 'members' | 'delete'; id: string } | null>(null)
  // 工作区行菜单「分配标签」事件桥 → 本地弹窗（Shell 一定挂载，比 overlay 桥更可靠）。
  const [assignTarget, setAssignTarget] = useState<{ workspaceId: string; title: string } | null>(null)
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {}
      const workspaceId = typeof d.workspaceId === 'string' && d.workspaceId !== '' ? d.workspaceId : ''
      if (!workspaceId) return
      setAssignTarget({ workspaceId, title: String(d.title ?? '') })
    }
    window.addEventListener(ASSIGN_TAB_EVENT, handler)
    return () => window.removeEventListener(ASSIGN_TAB_EVENT, handler)
  }, [])

  // 全量官方数据（只读用途：计算作用域）。
  const listState = (useSessions ? useSessions((s: unknown) => s) : null) as SessionListState | null
  const wsState = useWorkspaces ? (useWorkspaces((s: unknown) => s) as WsListState | null) : null
  const itemsAll: WorkspaceLike[] = (wsState && Array.isArray(wsState.items) ? wsState.items : []) as WorkspaceLike[]

  // 归属：workspaceId -> groupId | null（null = 默认）。
  const membership = new Map<string, string>()
  for (const g of groupList) for (const id of g.workspaceIds) if (!membership.has(id)) membership.set(id, g.id)

  // active 失效（组未加载 / 残留 id / 组已删除）时一律按默认页签渲染，避免作用域为空导致空白。
  const effectiveActive =
    active !== DEFAULT_TAB && !groupList.some((g) => g.id === active) ? DEFAULT_TAB : active

  // 当前页签作用域的工作区 id。
  const scopeWsIds: string[] = (() => {
    if (effectiveActive === DEFAULT_TAB) {
      return itemsAll
        .map((w) => w.workspaceId)
        .filter((id): id is string => !!id && !membership.has(id))
    }
    const g = groupList.find((x) => x.id === effectiveActive)
    if (!g) return []
    const known = new Set(itemsAll.map((w) => w.workspaceId).filter((v): v is string => !!v))
    return g.workspaceIds.filter((id) => known.has(id))
  })()

  // 当前页签作用域的会话 id。
  const scopeSessionIds: string[] = (() => {
    const inScope = (wid: string): boolean =>
      effectiveActive === DEFAULT_TAB ? !membership.has(wid) : scopeWsIds.includes(wid)
    const ids: string[] = []
    for (const w of itemsAll) {
      if (!w.workspaceId || !inScope(w.workspaceId)) continue
      for (const s of w.sessionIds || []) ids.push(s)
    }
    if (effectiveActive === DEFAULT_TAB && listState) {
      for (const id of unownedSessionIds(listState, itemsAll)) ids.push(id)
    }
    return Array.from(new Set(ids))
  })()

  // 孤儿清理（官方删了工作区则从分组中剔除）。
  const knownRef = useRef('')
  useEffect(() => {
    const known = new Set(itemsAll.map((w) => w.workspaceId).filter((v): v is string => !!v))
    const key = [...known].sort().join('|')
    if (key === knownRef.current) return
    knownRef.current = key
    let changed = false
    for (const g of groupList) {
      if (g.workspaceIds.some((id) => !known.has(id))) {
        changed = true
        break
      }
    }
    if (!changed) return
    commitGroups((cur) => cur.map((g) => ({ ...g, workspaceIds: g.workspaceIds.filter((id) => known.has(id)) })))
  }, [itemsAll]) // eslint-disable-line react-hooks/exhaustive-deps

  // 页签失效回退：分组加载后 active 不存在则回默认；对话框目标消失则关闭。
  useEffect(() => {
    if (!gs.ready) return
    if (active !== DEFAULT_TAB && !groupList.some((g) => g.id === active)) {
      setActive(DEFAULT_TAB)
      try {
        window.localStorage.removeItem(ACTIVE_KEY)
      } catch { /* 忽略 */ }
    }
    if (dialog && !groupList.some((g) => g.id === dialog.id)) setDialog(null)
  }, [gs.ready, active, groupList, dialog])

  // 标题行处理：官方标题原位替换为页签栏。
  // - 定位官方 header 行并隐藏其标题 span；把页签栏节点前置到该行最前
  //   （搜索/视图/添加图标随之保持在右侧）；
  // - 官方重渲染重建行时自动重新定位（周期自愈，低成本）。
  useLayoutEffect(() => {
    if (!wide) {
      setHeader(null)
      return
    }
    const tick = () => {
      const host = hostRef.current
      if (!host) return
      try {
        const found = locateHeader(host)
        if (!enabled) {
          // 关闭：恢复官方标题显示、移除页签栏（即时回官方原样）。
          if (found) found.label.style.display = ''
          setHeader(null)
          return
        }
        if (found) {
          found.label.style.display = 'none'
          setHeader((cur) => (cur && cur.row === found.row ? cur : { row: found.row, label: found.label }))
        }
      } catch { /* 忽略 */ }
    }
    tick()
    const timer = window.setInterval(tick, 400)
    return () => window.clearInterval(timer)
  }, [wide, enabled])

  const tryExpandAll = (ids: string[]): void => {
    if (!ids.length) return
    try {
      const actions = innerProps.actions as { setGroupExpanded?: (id: string, expanded: boolean) => void } | null
      if (actions && typeof actions.setGroupExpanded === 'function') {
        for (const id of ids) actions.setGroupExpanded(id, true)
      }
    } catch { /* 忽略 */ }
  }

  const onPick = (id: string): void => {
    setActive(id)
    try {
      window.localStorage.setItem(ACTIVE_KEY, id)
    } catch { /* 忽略 */ }
    if (id !== DEFAULT_TAB) {
      const g = groupList.find((x) => x.id === id)
      if (g) tryExpandAll(g.workspaceIds)
    }
  }

  const onAdd = (): void => {
    const nu: WsGroup = { id: 'g-' + Date.now().toString(36), name: tt('new.name'), workspaceIds: [] }
    commitGroups((cur) => [...cur, nu])
    setActive(nu.id)
    try {
      window.localStorage.setItem(ACTIVE_KEY, nu.id)
    } catch { /* 忽略 */ }
    setDialog({ kind: 'rename', id: nu.id })
  }

  // 过滤 hooks：仅开关开启时用页签作用域驱动官方树；关闭时原样透传（官方原貌）。
  const officialProps: ShellProps = { ...innerProps }
  if (enabled && useSessions) {
    const raw = useSessions
    const ids = scopeSessionIds
    officialProps.useSessions = (sel: unknown, eq?: unknown): unknown =>
      raw((state: unknown) => (sel as (s: unknown) => unknown)(filterSessions(state as SessionListState, ids)), eq)
  }
  if (enabled && useWorkspaces) {
    const rawWs = useWorkspaces
    const ids = scopeWsIds
    officialProps.useWorkspaces = (sel: unknown, eq?: unknown): unknown =>
      rawWs((state: unknown) => (sel as (s: unknown) => unknown)(filterWorkspaces(state as WsListState, ids)), eq)
  }

  const dialogGroup = dialog ? groupList.find((g) => g.id === dialog.id) : undefined

  return h(
    'div',
    { ref: hostRef, 'data-dsh-ws-tabs-host': '', style: { display: 'contents' } },
    [
      typeof OfficialComp === 'function' ? h(OfficialComp as never, officialProps) : null,
      header && enabled
        ? createPortal(
            h(TabStrip, {
              groups: groupList,
              active: effectiveActive,
              ready: gs.ready,
              onPick,
              onRename: (id: string) => setDialog({ kind: 'rename', id }),
              onMembers: (id: string) => setDialog({ kind: 'members', id }),
              onDelete: (id: string) => setDialog({ kind: 'delete', id }),
              onAdd,
            }),
            header.row,
          )
        : null,
      dialog && dialog.kind === 'rename' && dialogGroup
        ? h(RenameDialog, { groupId: dialog.id, onDone: () => setDialog(null) })
        : null,
      dialog && dialog.kind === 'members' && dialogGroup
        ? h(MembersDialog, { groupId: dialog.id, items: itemsAll, membership, onDone: () => setDialog(null) })
        : null,
      dialog && dialog.kind === 'delete' && dialogGroup
        ? h(DeleteDialog, { groupId: dialog.id, onDone: () => setDialog(null) })
        : null,
      assignTarget
        ? h(AssignTabPicker, {
            workspaceId: assignTarget.workspaceId,
            title: assignTarget.title,
            currentOwner: membership.get(assignTarget.workspaceId),
            groupNames: groupList.map((g) => ({ id: g.id, name: g.name })),
            onDone: () => setAssignTarget(null),
          })
        : null,
    ],
  )
}

// ── install ─────────────────────────────────────────────────────────────
export function installWorkspaceTabs(ctx: WsTabsCtx): () => void {
  if (typeof document === 'undefined') return () => {}
  rpcCall = (method: string, payload?: Record<string, unknown>) => {
    try {
      if (!ctx.connection?.rpc?.call) {
        return Promise.resolve({ ok: false, error: { code: 'no-rpc', message: tt('warn.noRpc') } })
      }
      return ctx.connection.rpc.call('/width-slider', method, payload || {})
    } catch {
      return Promise.resolve({ ok: false, error: { code: 'no-rpc', message: tt('warn.noRpc') } })
    }
  }
  void loadGroups()

  // 工作区行菜单「分配标签」注入；选择框由侧栏壳组件本地渲染。
  ensureWorkspaceAssignMenuItem()
  let assignRaf = 0
  const scheduleAssign = () => {
    if (assignRaf !== 0) return
    assignRaf = requestAnimationFrame(() => {
      assignRaf = 0
      try { ensureWorkspaceAssignMenuItem() } catch { /* 忽略 */ }
    })
  }
  const assignObserver = new MutationObserver(() => scheduleAssign())
  assignObserver.observe(document.body, { childList: true, subtree: true })

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = TABS_CSS
  document.getElementById(STYLE_ID)?.remove()
  document.head.appendChild(style)

  let originalComp: unknown = null
  let wrappedEntry: { component?: unknown } | null = null
  let synced = false
  let timer = 0

  // 替换官方槽组件后立即让渲染器重读 sidebar.workspaces 条目：
  // 1) 刷新工作区基线（store 通知驱动已挂载的官方组件）；
  // 2) 瞬时注册+移除一条无害空条目，触发官方 slots 变更通知，渲染器随即
  //    以新条目（我们的 wrapper / 还原的官方组件）重渲染，开关不再等数秒。
  const kickRender = (): void => {
    try {
      const w = ctx.get?.<{ refresh?: () => unknown }>('workspaces')
      if (w && typeof w.refresh === 'function') {
        queueMicrotask(() => {
          try {
            w.refresh?.()
          } catch { /* 忽略 */ }
        })
      }
    } catch { /* 忽略 */ }
    try {
      const registerFn = ctx.slots?.register
      if (typeof registerFn === 'function') {
        const dispose = registerFn({ name: 'sidebar.footer.action', id: 'ws-tabs-ping', order: 9999 }, () => null)
        if (typeof dispose === 'function') {
          queueMicrotask(() => {
            try {
              dispose()
            } catch { /* 忽略 */ }
          })
        }
      }
    } catch { /* 忽略 */ }
  }

  const unwrap = (): void => {
    if (wrappedEntry && originalComp && wrappedEntry.component) {
      try {
        wrappedEntry.component = originalComp
      } catch { /* 忽略 */ }
    }
    wrappedEntry = null
    originalComp = null
    synced = false
    kickRender()
  }

  const sync = (): void => {
    if (synced) return
    try {
      const entries =
        (typeof ctx.slots?.entries === 'function' ? ctx.slots.entries('sidebar.workspaces') : []) || []
      if (entries.length === 0) return
      const entry = entries.find(
        (e) =>
          e &&
          typeof e.component === 'function' &&
          !(e.component as unknown as Record<string, unknown>)[WS_TABS_MARK],
      )
      if (!entry || !entry.component) return
      const comp = entry.component as Record<string, unknown>
      if (comp.__dshNativeTabHost || comp.__imConnectWrapped) {
        synced = true
        return
      }
      originalComp = entry.component
      const Wrapper = (props: Record<string, unknown>): ReactNode =>
        h(WorkspaceTabsShell as never, { ...props, OfficialComp: originalComp })
      ;(Wrapper as unknown as Record<string, unknown>)[WS_TABS_MARK] = true
      entry.component = Wrapper
      wrappedEntry = entry
      synced = true
      kickRender()
    } catch (err) {
      console.warn('[width-slider] workspace tabs wrap failed', err)
    }
  }

  const trySyncOnce = (): void => {
    sync()
    if (!synced) {
      timer = window.setTimeout(trySyncOnce, 300)
    }
  }
  trySyncOnce()

  let unsub: (() => void) | null = null
  try {
    if (typeof ctx.slots?.subscribe === 'function') {
      unsub = ctx.slots.subscribe('sidebar.workspaces', () => {
        if (!synced) trySyncOnce()
      })
    }
  } catch { /* 忽略 */ }

  return () => {
    if (timer !== 0) window.clearTimeout(timer)
    if (unsub) {
      try {
        unsub()
      } catch { /* 忽略 */ }
    }
    unwrap()
    assignObserver.disconnect()
    if (assignRaf !== 0) cancelAnimationFrame(assignRaf)
    document.querySelectorAll('[' + WS_ASSIGN_MENU_ATTR + ']').forEach((el) => el.remove())
    style.remove()
    rpcCall = null
    groupReady = false
    groups = []
    emitGroups()
  }
}
