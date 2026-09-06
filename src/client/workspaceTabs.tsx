/**
 * workspaceTabs.tsx — 工作区分页页签栏（v0.6.0）。
 *
 * 把官方侧栏「工作区 / 会话」标题原位替换为一条分页页签：
 *   [工作区] [工作区A] [工作区B] …   （「工作区」= 官方原样完整列表）
 * 页签切换不改动官方树渲染——只对传给官方组件的 useSessions / useWorkspaces
 * 数据做过滤，因此官方树的会话行菜单、搜索、分组方式、拖拽排序全部原样保留。
 *
 * 结构说明（宿主版本 0.1.2-rc.1，@deepseek-ai/dsh-client-ui-workspace）：
 * - 官方 WorkspaceBrowser 注册在 `sidebar.workspaces` 单占用槽；标题「工作区」
 *   是它 header 行最左侧一个纯文本 span（搜索展开时隐藏）。这里通过
 *   React Portal 把页签栏放进官方 header 行首（标题原位），并把该标题文本
 *   span 隐藏——官方重渲染只 patch 子树，header 行节点稳定，Portal 不会丢。
 * - 右键页签 = 官方同款「重命名 / 删除工作区」。删除走官方语义（@deepseek-ai
 *   官方 WorkspaceBrowser 同款文案）：文件夹与会话记录保留，会话落入默认
 *   容器「未分组」，即我们与用户确认的“默认固定容器”，无需手工迁移。
 * - 新建工作区沿用官方 header 上的「添加工作区」按钮，不重复造入口。
 *
 * 本文件只做“数据过滤 + 标题占位替换”，不对官方 UI 加自定义视觉。
 */
import {
  createElement as h,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { isZhInterface } from './lang.ts'

/** 本插件对官方槽条目做的包裹标记（防重入 / 供卸载还原）。 */
export const WS_TABS_MARK = '__widthSliderWsTabs'
const ALL_TAB = '__all__'
const ACTIVE_KEY = 'dsh-plugin-width-slider.wsTab'
const STYLE_ID = 'dsh-plugin-width-slider-ws-tabs'

// 页签栏样式（只此一处最小样式；颜色全部走官方 alias token，无自定义色板）。
const TABS_CSS = `
[data-dsh-ws-tabs-bar]{display:flex;align-items:center;gap:2px;flex:1;min-width:0;height:100%;overflow:hidden;padding-left:2px}
[data-dsh-ws-tabs-bar] [data-dsh-ws-tab]{appearance:none;background:transparent;border:0;margin:0;padding:0 10px;font:inherit;font-size:13px;line-height:36px;height:36px;color:var(--dsw-alias-label-tertiary,#8a8f98);cursor:pointer;white-space:nowrap;position:relative;overflow:hidden;text-overflow:ellipsis}
[data-dsh-ws-tabs-bar] [data-dsh-ws-tab]:hover{color:var(--dsw-alias-label-primary,#e6edf3)}
[data-dsh-ws-tabs-bar] [data-dsh-ws-tab][aria-selected="true"]{color:var(--dsw-alias-label-primary,#e6edf3);font-weight:600}
[data-dsh-ws-tabs-bar] [data-dsh-ws-tab][aria-selected="true"]::after{content:"";position:absolute;left:8px;right:8px;bottom:0;height:2px;border-radius:2px 2px 0 0;background:currentColor}
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

interface WorkspaceServiceLike {
  rename: (workspaceId: string, title: string) => Promise<unknown>
  delete: (workspaceId: string) => Promise<unknown>
}

export interface WsTabsCtx {
  get?: <T = unknown>(name: string) => T | undefined
  slots?: {
    entries?: (key: string) => Array<{ component?: unknown }>
    subscribe?: (key: string, listener: () => void) => () => void
  }
}

/** 中文/英文界面文案（与 sessionDelete 同款运行时取值）。 */
const T: Record<string, [string, string]> = {
  'tab.all': ['工作区', 'Workspaces'],
  'tab.title': ['查看「{name}」的会话', 'View sessions of {name}'],
  'ctx.rename': ['重命名', 'Rename'],
  'ctx.delete': ['删除工作区', 'Delete workspace'],
  'rename.title': ['重命名工作区', 'Rename workspace'],
  'rename.field': ['工作区名称', 'Workspace name'],
  'rename.placeholder': ['给工作区起个自定义名字', 'Give the workspace a custom name'],
  'rename.save': ['保存', 'Save'],
  'rename.saving': ['保存中…', 'Saving…'],
  'rename.dup': ['已存在同名工作区。', 'A workspace with this name already exists.'],
  'delete.title': ['删除工作区', 'Delete workspace'],
  'delete.desc': ['将把「{name}」从工作区列表中移除。文件夹与会话记录会保留，其会话将显示在「未分组」下。', 'This removes "{name}" from the workspace list. The folder and session logs are kept; its sessions will appear under Ungrouped.'],
  'delete.ok': ['删除工作区', 'Delete workspace'],
  'delete.busy': ['删除中…', 'Deleting…'],
  'cancel': ['取消', 'Cancel'],
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

function el(Modal: any, props: Record<string, unknown>, children: ReactNode): ReactNode {
  return h(Modal, props, children)
}

/** 会话数据过滤：只保留允许集合内的条目（官方按 id 顺序渲染）。 */
function filterSessions(state: SessionListState, allowed: string[]): SessionListState {
  const src = state || {}
  const byId: Record<string, unknown> = {}
  const ids: string[] = []
  for (const id of allowed) {
    const s = (src.byId || {})[id]
    if (s === undefined) continue
    byId[id] = s
    ids.push(id)
  }
  return { ...src, ids, byId }
}

/** 工作区数据过滤：只剩目标工作区（用于单页签下官方树只渲染该组）。 */
function filterWorkspaces(state: WsListState, workspaceId: string): WsListState {
  const src = state || {}
  const items = (src.items || []).filter((w) => w.workspaceId === workspaceId)
  return { ...src, items }
}

// ── 官方标题行定位与隐藏 ────────────────────────────────────────────────
const LABEL_WORDS = ['工作区', '会话', 'Workspaces', 'Sessions']
const SEARCH_PLACEHOLDERS = ['搜索会话', 'Search sessions']

function isLabelNode(el: Element): boolean {
  const text = (el.textContent || '').trim()
  return LABEL_WORDS.some((w) => text === w) && el.children.length === 0
}

/**
 * 在官方宿主树内定位“标题行 + 标题 span”。
 * 先按搜索输入框向上找 header 行（标题行的可靠锚点），兜底扫描标题文本。
 */
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

// ── 页签栏组件（Portal 进官方 header 行）────────────────────────────────
function TabStrip(props: {
  items: WorkspaceLike[]
  active: string
  onSelect: (id: string) => void
  onRename: (wsId: string) => void
  onDelete: (wsId: string) => void
}): ReactNode {
  const { items, active, onSelect, onRename, onDelete } = props
  const [ctx, setCtx] = useState<{ x: number; y: number; wsId: string } | null>(null)

  useEffect(() => {
    if (!ctx) return
    const close = () => setCtx(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', close, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [ctx])

  const menuBtn = (label: string, danger: boolean, onPick: () => void): ReactNode =>
    h(
      'button',
      {
        key: label,
        type: 'button',
        onClick: (e: { stopPropagation: () => void }) => {
          e.stopPropagation()
          setCtx(null)
          onPick()
        },
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          border: 0,
          background: 'transparent',
          color: danger
            ? 'var(--dsw-alias-state-error-primary,#e5484d)'
            : 'var(--dsw-alias-label-primary,#e6edf3)',
          padding: '7px 10px',
          borderRadius: 7,
          font: 'inherit',
          fontSize: 13,
          textAlign: 'left',
          cursor: 'pointer',
        },
      },
      label,
    )

  return h(
    'div',
    {
      'data-dsh-ws-tabs-bar': '',
      role: 'tablist',
      'aria-label': tt('tab.all'),
      onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
      onContextMenu: (e: { preventDefault: () => void; stopPropagation: () => void; target: EventTarget }) => {
        e.preventDefault()
        e.stopPropagation()
        const tab = (e.target as HTMLElement).closest('[data-dsh-ws-tab]')
        const id = (tab && tab.getAttribute('data-dsh-ws-id')) || ''
        if (!id || id === ALL_TAB) return
        setCtx({ x: (e as unknown as MouseEvent).clientX, y: (e as unknown as MouseEvent).clientY, wsId: id })
      },
    },
    [
      h(
        'button',
        {
          key: ALL_TAB,
          type: 'button',
          role: 'tab',
          'aria-selected': active === ALL_TAB,
          'data-dsh-ws-tab': '',
          'data-dsh-ws-id': ALL_TAB,
          onClick: () => onSelect(ALL_TAB),
        },
        tt('tab.all'),
      ),
      ...items.map((w) => {
        const id = w.workspaceId || ''
        const name = w.title || w.path || id
        return h(
          'button',
          {
            key: id,
            type: 'button',
            role: 'tab',
            'aria-selected': active === id,
            title: tt('tab.title', { name }),
            'data-dsh-ws-tab': '',
            'data-dsh-ws-id': id,
            onClick: () => onSelect(id),
          },
          name,
        )
      }),
      ctx
        ? h(
            'div',
            {
              key: 'ctx-menu',
              onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
              style: {
                position: 'fixed',
                left: Math.max(8, Math.min(ctx.x, (window.innerWidth || 400) - 220)),
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
              menuBtn(tt('ctx.rename'), false, () => onRename(ctx.wsId)),
              menuBtn(tt('ctx.delete'), true, () => onDelete(ctx.wsId)),
            ],
          )
        : null,
    ],
  )
}

// ── 重命名 / 删除工作区对话框（官方 Modal 同款）──────────────────────────
let knownWorkspaceTitles: string[] = []
function hasKnownTitle(title: string): boolean {
  return knownWorkspaceTitles.includes(title)
}

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

function DialogHost(props: {
  dialog: { kind: 'rename' | 'delete'; wsId: string } | null
  ws: WorkspaceLike | undefined
  workspaceService: WorkspaceServiceLike | null
  onDone: () => void
}): ReactNode {
  const { dialog, ws, workspaceService, onDone } = props
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (dialog) {
      setDraft(ws?.title || '')
      setError(null)
      setBusy(false)
    }
  }, [dialog, ws])

  if (!dialog || !ws || !workspaceService) return null
  const Modal = primitives().Modal
  if (!Modal) return null

  const close = () => {
    if (busy) return
    onDone()
  }
  const name = ws.title || ws.path || ws.workspaceId || ''

  if (dialog.kind === 'rename') {
    const trimmed = draft.trim()
    const duplicate = trimmed !== '' && trimmed !== name && hasKnownTitle(trimmed)
    const blocked = busy || trimmed === '' || trimmed === name || duplicate
    const confirm = () => {
      if (blocked) return
      setBusy(true)
      setError(null)
      workspaceService
        .rename(ws.workspaceId || '', trimmed)
        .then(() => {
          setBusy(false)
          onDone()
        })
        .catch((reason: unknown) => {
          setBusy(false)
          setError(reason instanceof Error ? reason.message : String(reason))
        })
    }
    return el(
      Modal,
      {
        open: true,
        onClose: close,
        title: tt('rename.title'),
        closeLabel: tt('cancel'),
        footer: [
          h('button', {
            key: 'cancel',
            type: 'button',
            onClick: close,
            style: btnStyle({}, busy),
          }, tt('cancel')),
          h('button', {
            key: 'save',
            type: 'button',
            disabled: busy || blocked,
            onClick: confirm,
            style: btnStyle({ primary: true, disabled: blocked }, busy),
          }, busy ? tt('rename.saving') : tt('rename.save')),
        ],
      },
      h('div', null, [
        h('div', { key: 'field', style: { display: 'flex', flexDirection: 'column', gap: 8 } }, [
          h('label', { key: 'lbl', style: { fontSize: 13, color: 'var(--dsw-alias-label-secondary,#a8abb3)' } }, tt('rename.field')),
          h('input', {
            key: 'inp',
            type: 'text',
            autoFocus: true,
            value: draft,
            maxLength: 80,
            placeholder: tt('rename.placeholder'),
            onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
            onKeyDown: (e: { key: string }) => {
              if (e.key === 'Enter') confirm()
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
        ]),
        error
          ? h('div', { key: 'err', role: 'alert', style: { marginTop: 10, color: 'var(--dsw-alias-state-error-primary,#e5484d)', fontSize: 12 } }, error)
          : null,
        duplicate
          ? h('div', { key: 'dup', style: { marginTop: 10, color: 'var(--dsw-alias-state-error-primary,#e5484d)', fontSize: 12 } }, tt('rename.dup'))
          : null,
      ]),
    )
  }

  const confirm = () => {
    if (busy) return
    setBusy(true)
    setError(null)
    workspaceService
      .delete(ws.workspaceId || '')
      .then(() => {
        setBusy(false)
        onDone()
      })
      .catch((reason: unknown) => {
        setBusy(false)
        setError(reason instanceof Error ? reason.message : String(reason))
      })
  }
  return el(
    Modal,
    {
      open: true,
      onClose: close,
      title: tt('delete.title'),
      closeLabel: tt('cancel'),
      description: tt('delete.desc', { name }),
      footer: [
        h('button', { key: 'cancel', type: 'button', onClick: close, style: btnStyle({}, busy) }, tt('cancel')),
        h('button', {
          key: 'del',
          type: 'button',
          disabled: busy,
          onClick: confirm,
          style: btnStyle({ danger: true }, busy),
        }, busy ? tt('delete.busy') : tt('delete.ok')),
      ],
    },
    error
      ? h('div', { role: 'alert', style: { color: 'var(--dsw-alias-state-error-primary,#e5484d)', fontSize: 12 } }, error)
      : null,
  )
}

// ── 官方槽包裹壳：过滤数据 + 原位页签栏 ─────────────────────────────────
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
  const [active, setActive] = useState<string>(() => {
    try {
      const saved = window.localStorage.getItem(ACTIVE_KEY)
      return saved === null ? ALL_TAB : saved
    } catch {
      return ALL_TAB
    }
  })
  const hostRef = useRef<HTMLDivElement>(null)
  const [header, setHeader] = useState<{ row: HTMLElement; label: HTMLElement } | null>(null)
  const [dialog, setDialog] = useState<{ kind: 'rename' | 'delete'; wsId: string } | null>(null)

  const wsState = (useWorkspaces ? useWorkspaces((s: unknown) => s) : null) as WsListState | null
  const items: WorkspaceLike[] = Array.isArray(wsState?.items) ? wsState.items : []
  const activeWs = items.find((w) => w.workspaceId === active)

  // 工作区被删除 / 尚未就绪：回退到总览页签；对话框目标消失时关闭。
  useEffect(() => {
    if (active !== ALL_TAB && !activeWs && items.length > 0) setActive(ALL_TAB)
    if (dialog && !items.some((w) => w.workspaceId === dialog.wsId)) setDialog(null)
  }, [active, activeWs, items, dialog])

  // 同步已知工作区标题（重命名重名校验）。
  useEffect(() => {
    knownWorkspaceTitles = items.map((w) => w.title || '').filter(Boolean)
  }, [items])

  const tryExpand = (id: string): void => {
    if (id === ALL_TAB) return
    try {
      const actions = innerProps.actions as { setGroupExpanded?: (id: string, expanded: boolean) => void } | null
      if (actions && typeof actions.setGroupExpanded === 'function') actions.setGroupExpanded(id, true)
    } catch { /* 忽略 */ }
  }

  const onPick = (id: string): void => {
    setActive(id)
    try {
      window.localStorage.setItem(ACTIVE_KEY, id)
    } catch { /* 忽略 */ }
    tryExpand(id)
  }

  // 标题行定位：把页签栏 Portal 进官方 header 行，并隐藏官方标题 span。
  useLayoutEffect(() => {
    if (!wide) {
      setHeader(null)
      return
    }
    const scan = (): boolean => {
      const host = hostRef.current
      if (!host) return false
      const found = locateHeader(host)
      if (!found) return false
      found.label.style.display = 'none'
      setHeader(found)
      return true
    }
    if (scan()) return
    const timer = window.setInterval(() => {
      if (scan()) window.clearInterval(timer)
    }, 300)
    return () => window.clearInterval(timer)
  }, [wide])

  // 官方重渲染把标题 span 恢复后重新隐藏（低成本幂等）。
  useLayoutEffect(() => {
    if (!header) return
    header.label.style.display = 'none'
  }, [header])

  // 过滤数据 hooks：单页签时官方树只看到该工作区的会话 / 单工作区。
  const officialProps: ShellProps = { ...innerProps }
  if (active !== ALL_TAB && useSessions && activeWs) {
    const ids = activeWs.sessionIds || []
    const wsId = activeWs.workspaceId || ''
    const raw = useSessions
    officialProps.useSessions = (sel: unknown, eq?: unknown): unknown =>
      raw((state: unknown) => (sel as (s: unknown) => unknown)(filterSessions(state as SessionListState, ids)), eq)
    if (useWorkspaces) {
      const rawWs = useWorkspaces
      officialProps.useWorkspaces = (sel: unknown, eq?: unknown): unknown =>
        rawWs((state: unknown) => (sel as (s: unknown) => unknown)(filterWorkspaces(state as WsListState, wsId)), eq)
    }
  }

  const modalWs = dialog ? items.find((w) => w.workspaceId === dialog.wsId) : undefined

  return h(
    'div',
    { ref: hostRef, 'data-dsh-ws-tabs-host': '', style: { display: 'contents' } },
    [
      typeof OfficialComp === 'function' ? h(OfficialComp as never, officialProps) : null,
      header
        ? createPortal(
            h(TabStrip, {
              items,
              active,
              onSelect: onPick,
              onRename: (wsId: string) => setDialog({ kind: 'rename', wsId }),
              onDelete: (wsId: string) => setDialog({ kind: 'delete', wsId }),
            }),
            header.row,
          )
        : null,
      dialog
        ? h(DialogHost, {
            dialog,
            ws: modalWs,
            workspaceService: workspaceServiceRef.current,
            onDone: () => setDialog(null),
          })
        : null,
    ],
  )
}

// ── install：包裹官方 sidebar.workspaces 条目 ───────────────────────────
const workspaceServiceRef: { current: WorkspaceServiceLike | null } = { current: null }

export function installWorkspaceTabs(ctx: WsTabsCtx): () => void {
  if (typeof document === 'undefined') return () => {}
  try {
    workspaceServiceRef.current = (ctx.get?.('workspaces') as WorkspaceServiceLike | undefined) || null
  } catch {
    workspaceServiceRef.current = null
  }

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = TABS_CSS
  document.getElementById(STYLE_ID)?.remove()
  document.head.appendChild(style)

  let originalComp: unknown = null
  let wrappedEntry: { component?: unknown } | null = null
  let synced = false
  let timer = 0

  const unwrap = (): void => {
    if (wrappedEntry && originalComp && wrappedEntry.component) {
      try {
        wrappedEntry.component = originalComp
      } catch { /* 忽略 */ }
    }
    wrappedEntry = null
    originalComp = null
    synced = false
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
    style.remove()
    workspaceServiceRef.current = null
  }
}
