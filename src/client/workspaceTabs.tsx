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
 * - 分组持久化在 host（workspace-groups.json，/api/width-slider wsGroupsRead/Write），
 *   本模块维护小组 store（useSyncExternalStore），任何增删改即时落盘。
 *
 * 对官方内部结构的依赖（升级回归自检清单；官方 = @deepseek-ai/
 * dsh-client-ui-workspace/lib/client.js）：
 * - header 行：含搜索 input（placeholder 匹配「搜索会话/Search sessions」），
 *   行首 label span（文本精确等于「工作区/会话/Workspaces/Sessions」且无子元素），
 *   右侧 ViewOptions / ＋添加工作区（aria-label = t('workspace.add')）；
 * - 组头行：class 含 projectRow + menuOpen（⋯ 菜单打开时），workspaceId 经
 *   React fiber memoizedProps.group.workspaceId 读取（深度上限 32，fail-closed）；
 * - 官方「＋添加工作区」经 workspaces.create 新建（不带标签归属），picker 为
 *   WorkspacePickFlow（addOnly），新建成功即出现在 workspace store items 中；
 * - workspace store 快照带 phase（pending/ready）；组件在 ready 时调用
 *   actions.retainAccountKeys（含 "" 与 FLAT_SESSION_ORDER_KEY），本插件需
 *   补全全量工作区键，否则跨页签切换会清掉其它页签的排序/展开账本；
 * - View store persist 键 dsh.workspace.view.v5；FLAT_SESSION_ORDER_KEY =
 *   "__flat_session_order__"。
 * 以上任一假设被官方改版破坏时的典型失效表现：功能不出现 / 页签不定位 /
 * 菜单不注入（fail-closed），不会崩溃。本插件对页签作用域的数据过滤依赖
 * workspace store 的 phase 语义：非 ready 快照一律不写分组（自动归属与
 * 孤儿清理都以此门控），若官方将来取消 pending 态需同步调整。
 */
import {
  createElement as h,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { getSettings, onSettingsChanged } from './core/config.ts'
import { callEndpoint } from './core/endpointChannel.ts'
import { primitives } from './core/primitives.ts'
import { TABS_CSS, TabStrip } from './patches/wsTabs/TabStrip.tsx'
import { ASSIGN_TAB_EVENT, WS_ASSIGN_MENU_ATTR, ensureWorkspaceAssignMenuItem } from './patches/wsTabs/assignMenuItem.ts'
import { AssignTabPicker, DeleteDialog, MembersDialog, RenameDialog } from './patches/wsTabs/dialogs.tsx'
import { locateHeader } from './patches/wsTabs/domContract.ts'
import {
  DEFAULT_TAB,
  FLAT_SESSION_ORDER_KEY,
  commitGroups,
  groups,
  loadGroups,
  resetGroupsStore,
  setRpcCall,
  useGroups,
  type WsGroup,
} from './patches/wsTabs/groupsStore.ts'
import { tt } from './patches/wsTabs/messages.ts'
import {
  filterSessions,
  filterWorkspaces,
  unownedSessionIds,
  useWsTabsEnabled,
  type SessionListState,
  type WorkspaceLike,
  type WsListState,
} from './patches/wsTabs/scope.ts'

/** 本插件对官方槽条目做的包裹标记（防重入 / 供卸载还原）。 */
export const WS_TABS_MARK = '__widthSliderWsTabs'

const STYLE_ID = 'dsh-plugin-width-slider-ws-tabs'

/** 页签对话框的目标：`newTab` 是尚未创建的草稿（不落盘），其余指向已存在的页签。 */
type TabsDialog =
  | { kind: 'rename'; id: string }
  | { kind: 'newTab'; id: string }
  | { kind: 'members'; id: string }
  | { kind: 'delete'; id: string }

export interface WsTabsCtx {
  get?: <T = unknown>(name: string) => T | undefined
  slots?: {
    entries?: (key: string) => Array<{ component?: unknown }>
    subscribe?: (key: string, listener: () => void) => () => void
    inject?: (name: string, register: () => () => void) => () => void
    register?: (options: Record<string, unknown>, component: unknown) => () => void
  }
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
  // 重启/重载后一律回到「默认」页签（上次停留页签不跨会话恢复）。
  const [active, setActive] = useState<string>(DEFAULT_TAB)
  // 用户最近一次主动选中的页签（ref）：官方新建工作区的自动归属以「创建动作发起时
  // 停留页签」为准，而不是 effect 运行时的渲染闭包值（新建流程含目录选择往返，
  // 期间可能已切换页签）。
  const activeIntentRef = useRef<string>(DEFAULT_TAB)
  const hostRef = useRef<HTMLDivElement>(null)
  const [header, setHeader] = useState<{ row: HTMLElement; label: HTMLElement } | null>(null)
  // newTab = 新建页签草稿：组此时还不存在（不落盘），用户点「保存」才创建。
  const [dialog, setDialog] = useState<TabsDialog | null>(null)
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

  // 官方 workspace store 是否就绪（加载/重载中为非 ready）。孤儿清理与自动归属
  // 都以此门控：非 ready 快照一律不写分组，避免把「清空重载」误判为删除/新增。
  const wsPhaseReady = !!wsState && (wsState as { phase?: string }).phase === 'ready'

  // 归属：workspaceId -> groupId | null（null = 默认）。groupList 引用稳定时保持不变。
  const membership: ReadonlyMap<string, string> = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of groupList) for (const id of g.workspaceIds) if (!m.has(id)) m.set(id, g.id)
    return m
  }, [groupList])

  // active 失效（组未加载 / 残留 id / 组已删除）时一律按默认页签渲染，避免作用域为空导致空白。
  const effectiveActive = useMemo(
    () => (active !== DEFAULT_TAB && !groupList.some((g) => g.id === active) ? DEFAULT_TAB : active),
    [active, groupList],
  )

  // 当前页签作用域的工作区 id（引用稳定：官方子树把包装后的 useWorkspaces 当
  // props 传递，作用域数组每次渲染新建会让包装引用失效 → 无谓重渲染）。
  const scopeWsIds: string[] = useMemo(() => {
    if (effectiveActive === DEFAULT_TAB) {
      return itemsAll
        .map((w) => w.workspaceId)
        .filter((id): id is string => !!id && !membership.has(id))
    }
    const g = groupList.find((x) => x.id === effectiveActive)
    if (!g) return []
    const known = new Set(itemsAll.map((w) => w.workspaceId).filter((v): v is string => !!v))
    return g.workspaceIds.filter((id) => known.has(id))
  }, [itemsAll, effectiveActive, membership, groupList])

  // 当前页签作用域的会话 id。
  const scopeSessionIds: string[] = useMemo(() => {
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
  }, [itemsAll, effectiveActive, membership, scopeWsIds, listState])

  // 孤儿清理（官方删了工作区则从分组中剔除）。
  // 门控：非 ready 快照不清理（清空重载的中间态会把整组误判为孤儿）；仅当从未
  // 见过任何工作区（knownRef 为空 = 纯启动恢复场景）且列表为空时才跳过清理，
  // 已见过工作区的真实清空（用户删光全部工作区）仍照常清理，避免孤儿永久滞留。
  const knownRef = useRef('')
  useEffect(() => {
    if (!wsPhaseReady) return
    const known = new Set(itemsAll.map((w) => w.workspaceId).filter((v): v is string => !!v))
    if (known.size === 0 && knownRef.current === '' && groupList.some((g) => g.workspaceIds.length > 0)) return
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
  }, [itemsAll, wsPhaseReady, groupList]) // eslint-disable-line react-hooks/exhaustive-deps
  // 新建工作区自动归属当前页签：官方「＋ 添加工作区」创建的工作区不带标签归属，
  // 会直接落入「默认」页。这里监测全量列表，把「新建出现」的工作区（首次加载的
  // 既有工作区除外）归入创建时正停留的页签；若停在默认页则不归属（本就在默认）。
  // 基线策略：store 每次进入非 ready（加载/重载）或功能关闭时作废基线，下个 ready
  // 快照重建基线，避免把「重载后的既有列表」误判为新增。
  const seenWsRef = useRef<string[] | null>(null)
  useEffect(() => {
    if (!enabled || !gs.ready) {
      seenWsRef.current = null
      return
    }
    if (!wsPhaseReady) {
      seenWsRef.current = null
      return
    }
    const ids = itemsAll.map((w) => w.workspaceId).filter((v): v is string => !!v)
    const seen = seenWsRef.current
    if (seen === null) {
      seenWsRef.current = ids
      return
    }
    const fresh = ids.filter((id) => !seen.includes(id))
    seenWsRef.current = ids
    if (fresh.length === 0) return
    // 归属目标 = 用户最近一次主动停留的页签（intent ref），而非 effect 运行时的
    // 渲染闭包：官方新建流程含目录选择往返，期间用户可能已切换页签，新建应归入
    // 「发起创建时」的页签。默认页不归属（新建本就在默认）。
    const targetId = activeIntentRef.current
    if (targetId === DEFAULT_TAB) return
    const target = groupList.find((g) => g.id === targetId)
    if (!target) return
    const owned = new Set<string>()
    for (const g of groupList) for (const id of g.workspaceIds) owned.add(id)
    const toAssign = fresh.filter((id) => !owned.has(id))
    if (toAssign.length === 0) return
    commitGroups((cur) =>
      cur.map((g) =>
        g.id === targetId
          ? { ...g, workspaceIds: Array.from(new Set([...g.workspaceIds, ...toAssign])) }
          : g,
      ),
    )
    try {
      const actions = innerProps.actions as { setGroupExpanded?: (id: string, expanded: boolean) => void } | null
      if (actions && typeof actions.setGroupExpanded === 'function') {
        for (const id of toAssign) actions.setGroupExpanded(id, true)
      }
    } catch { /* 忽略 */ }
  }, [itemsAll, enabled, gs.ready, wsPhaseReady, groupList]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!gs.ready) return
    if (active !== DEFAULT_TAB && !groupList.some((g) => g.id === active)) {
      setActive(DEFAULT_TAB)
    }
    // 草稿（新建页签）的 id 此时还不存在于 groupList，必须跳过这条校验，
    // 否则对话框挂载的同一帧就被关掉（表现为点加号没反应/一闪而过）。
    if (dialog !== null && dialog.kind !== 'newTab' && !groupList.some((g) => g.id === dialog.id)) setDialog(null)
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
    activeIntentRef.current = id
    if (id !== DEFAULT_TAB) {
      const g = groupList.find((x) => x.id === id)
      if (g) tryExpandAll(g.workspaceIds)
    }
  }

  const onAdd = (): void => {
    // crypto.randomUUID 可用则用（无碰撞），否则回退时间+随机（g- 前缀必须保留：active 校验/sanitize 依赖）。
    const gid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? 'g-' + crypto.randomUUID()
      : 'g-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
    // 新建先落草稿：此处不建组、不落盘，用户点「保存」才创建；取消/关闭什么都不发生。
    setDialog({ kind: 'newTab', id: gid })
  }

  /** 新建草稿被确认：此时才创建组并切过去（activeIntent 供官方新建工作区的自动归属）。 */
  const createGroup = (id: string, name: string): void => {
    // 幂等：同一 id 不重复追加（渲染层已挡住「草稿 id 已存在」，这里是单点防护）。
    commitGroups((cur) => (cur.some((g) => g.id === id) ? cur : [...cur, { id, name, workspaceIds: [] }]))
    setActive(id)
    activeIntentRef.current = id
  }

  // 过滤 hooks：仅开关开启时用页签作用域驱动官方树；关闭时原样透传（官方原貌）。
  // useCallback 稳定包装函数引用（官方子树把包装后的 hooks 当 props 传递，
  // 每次渲染新建引用会退化为全量重渲染 / effect 重跑，把正确性押在官方不 memo 上）。
  const filteredUseSessions = useCallback(
    (sel: unknown, eq?: unknown): unknown => {
      const raw = useSessions
      if (!raw) return null
      return raw((state: unknown) => (sel as (s: unknown) => unknown)(filterSessions(state as SessionListState, scopeSessionIds)), eq)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [useSessions, scopeSessionIds],
  )
  const filteredUseWorkspaces = useCallback(
    (sel: unknown, eq?: unknown): unknown => {
      const rawWs = useWorkspaces
      if (!rawWs) return null
      return rawWs((state: unknown) => (sel as (s: unknown) => unknown)(filterWorkspaces(state as WsListState, scopeWsIds)), eq)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [useWorkspaces, scopeWsIds],
  )

  // 官方 view store 在 ready 后会按「当前过滤后的工作区列表」调用 retainAccountKeys
  // 清理跨页签的排序/展开账本（groupExpansion/sessionOrderByAccount…）。这里包装该
  // action：补全全量工作区键（+ "" 与 flat 键）后再调用，避免切换页签清掉其它页签
  // 的手动排序与展开状态；真正从 itemsAll 消失（被删除）的工作区键仍会被清理。
  const rawActions = (innerProps.actions ?? {}) as { retainAccountKeys?: (keys: string[]) => void }
  const actionsWithFullRetain = useMemo(() => {
    const retain = rawActions.retainAccountKeys
    if (typeof retain !== 'function') return innerProps.actions
    const allKeys = itemsAll
      .map((w) => w.workspaceId)
      .filter((v): v is string => !!v)
      .join('\u0001')
    return {
      ...(innerProps.actions as Record<string, unknown>),
      retainAccountKeys: (keys: string[] | undefined): void => {
        const base = Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : []
        const merged = Array.from(new Set([...base, '', FLAT_SESSION_ORDER_KEY, ...(allKeys === '' ? [] : allKeys.split('\u0001'))]))
        retain(merged)
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [innerProps.actions, itemsAll])

  const officialProps: ShellProps = { ...innerProps }
  if (enabled) {
    if (useSessions) officialProps.useSessions = filteredUseSessions
    if (useWorkspaces) officialProps.useWorkspaces = filteredUseWorkspaces
    if (actionsWithFullRetain !== innerProps.actions) officialProps.actions = actionsWithFullRetain
  }

  const dialogGroup = dialog ? groupList.find((g) => g.id === dialog.id) : undefined
  // 重命名对话框只针对已存在的页签；新建草稿走独立分支，其组尚未创建。
  const renameTarget = dialog !== null && dialog.kind === 'rename' && dialogGroup !== undefined ? dialog : null
  const newTabTarget = dialog !== null && dialog.kind === 'newTab' ? dialog : null

  return h(
    'div',
    { ref: hostRef, 'data-dsh-ws-tabs-host': '', style: { display: 'contents' } },
    [
      typeof OfficialComp === 'function' ? h(OfficialComp as never, { ...officialProps, key: 'official' }) : null,
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
            'tabs',
          )
        : null,
      newTabTarget
        ? h(RenameDialog, {
            key: newTabTarget.id,
            groupId: newTabTarget.id,
            draft: true,
            onCreate: (name: string) => createGroup(newTabTarget.id, name),
            onDone: () => setDialog(null),
          })
        : null,
      renameTarget
        ? h(RenameDialog, { key: renameTarget.id, groupId: renameTarget.id, onDone: () => setDialog(null) })
        : null,
      dialog && dialog.kind === 'members' && dialogGroup
        ? h(MembersDialog, { key: 'members', groupId: dialog.id, items: itemsAll, membership, onDone: () => setDialog(null) })
        : null,
      dialog && dialog.kind === 'delete' && dialogGroup
        ? h(DeleteDialog, { key: 'delete', groupId: dialog.id, onDone: () => setDialog(null) })
        : null,
      assignTarget
        ? h(AssignTabPicker, {
            key: 'assign',
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
  // 所有对话框（页签重命名/管理工作区/删除/分配标签）都依赖官方 primitives 的
  // Modal；缺失时静默失效（点了没反应）。安装期探测一次，缺失则 warn 并整体跳过，
  // 降级为「功能不出现」而不是「交互无响应」。
  try {
    if (!primitives().Modal) {
      console.warn('[width-slider] dsh-client-ui-primitives Modal 不可用，工作区分页功能已跳过安装')
      return () => {}
    }
  } catch {
    console.warn('[width-slider] 读取 dsh-client-ui-primitives 失败，工作区分页功能已跳过安装')
    return () => {}
  }
  setRpcCall((method: string, payload?: Record<string, unknown>) =>
    callEndpoint('/api/width-slider', method, payload || {}).catch(() => ({
      ok: false,
      error: { code: 'no-rpc', message: tt('warn.noRpc') },
    })),
  )
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
  // 观察器随功能开关启停：关闭时 disconnect，避免开关关闭期间仍全树 mutation
  // 白跑 rAF 与 DOM 查询（ensure 常驻模型下 Observer 不应成为后台常驻开销）。
  let observing = false
  const setAssignObserving = (on: boolean): void => {
    if (on === observing) return
    observing = on
    try {
      if (on) {
        assignObserver.observe(document.body, { childList: true, subtree: true })
        scheduleAssign()
      } else {
        assignObserver.disconnect()
        if (assignRaf !== 0) {
          cancelAnimationFrame(assignRaf)
          assignRaf = 0
        }
      }
    } catch { /* 忽略 */ }
  }
  setAssignObserving(getSettings().workspaceTabs)
  let unsubAssignSetting: (() => void) | null = null
  try {
    unsubAssignSetting = onSettingsChanged(() => setAssignObserving(getSettings().workspaceTabs))
  } catch { /* 忽略 */ }

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
    if (unsubAssignSetting) {
      try {
        unsubAssignSetting()
      } catch { /* 忽略 */ }
    }
    assignObserver.disconnect()
    if (assignRaf !== 0) cancelAnimationFrame(assignRaf)
    document.querySelectorAll('[' + WS_ASSIGN_MENU_ATTR + ']').forEach((el) => el.remove())
    style.remove()
    setRpcCall(null)
    resetGroupsStore()
  }
}
