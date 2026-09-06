/**
 * assignSession.ts — 会话「分配工作区」菜单（v0.6.0）。
 *
 * 在会话行 ⋯ 菜单里，「删除会话」正上方插入四字菜单项「分配工作区」
 * （克隆官方 menuitem 模板、图标取官方项目添加图标，无分隔线与自定义视觉）。
 * 点击后弹出官方 Modal 列出全部工作区：当前所在工作区禁选并标注；选一个即
 * 调用官方 ctx.workspaces.insertSessionBefore 把该会话移入目标工作区分页，
 * 官方列表随 store 自动刷新。
 *
 * 会话 id 读取与“删除会话”同源（行 React fiber 直读，绝不按标题反查），
 * 复用 src/client/sessionDelete.ts 导出的行工具函数。
 */
import { useSyncExternalStore, useState, useEffect } from 'react'
import { createElement as h, type ReactNode } from 'react'
import { findOpenSessionRow, rowTitleOf, sessionInfoFromRow } from './sessionDelete.ts'
import { isZhInterface } from './lang.ts'

const OVERLAY_SLOT = 'shell.overlay'
const DIALOG_ID = 'ws-assign-dialog'
const EVENT = 'dsh:ws-assign'
const MENU_ASSIGN_ATTR = 'data-ws-assign-item'

/** 官方 IconProjectAddOutline16 的 path（16×16，文件夹+加号），保持图标集一致。 */
const ASSIGN_ICON_PATH =
  '<path transform="translate(9.52 2.52)" d="M3.55246 0L3.55246 2.44252L6 2.44252L6 3.55748L3.55246 3.55748L3.55246 6L2.43834 6L2.43834 3.55748L0 3.55748L0 2.44252L2.43834 2.44252L2.43834 0L3.55246 0Z" fill="currentColor"/>' +
  '<path transform="translate(0.3496 2.35)" d="M4.76367 0C5.36861 1.80598e-05 5.93113 0.310294 6.25488 0.821289L6.78027 1.64941C6.79685 1.67558 6.81791 1.69775 6.83887 1.71973C6.72186 2.15521 6.65702 2.61192 6.65137 3.08301C6.25601 2.96045 5.90909 2.70478 5.68164 2.3457L5.15723 1.5166C5.07183 1.38189 4.92318 1.3008 4.76367 1.30078L2.32422 1.30078C1.7589 1.30078 1.30078 1.7589 1.30078 2.32422L1.30078 10.1338C1.30078 10.6991 1.7589 11.1572 2.32422 11.1572L11.9766 11.1572C12.5419 11.1572 13 10.6991 13 10.1338L13 8.58398C13.4545 8.5135 13.8903 8.38748 14.3008 8.21289L14.3008 10.1338C14.3008 11.4171 13.2598 12.458 11.9766 12.458L2.32422 12.458C1.04093 12.458 0 11.4171 0 10.1338L0 2.32422C0 1.04093 1.04093 0 2.32422 0L4.76367 0Z" fill="currentColor"/>'

const T: Record<string, [string, string]> = {
  'menu.assign': ['分配工作区', 'Assign workspace'],
  'dialog.title': ['分配工作区', 'Assign workspace'],
  'dialog.session': ['会话：', 'Session: '],
  'dialog.hint': ['把这个会话移到哪个工作区？', 'Move this session into which workspace?'],
  'dialog.current': ['当前所在', 'Current'],
  'dialog.empty': ['还没有工作区，先在侧栏添加一个工作区。', 'No workspaces yet. Add one from the sidebar first.'],
  'dialog.notFound': ['未能在会话列表中找到该会话（可能已被删除或列表尚未刷新），请刷新后重试。', 'Could not find this session (deleted or list not refreshed). Refresh and retry.'],
  'dialog.moving': ['移动中…', 'Moving…'],
  'dialog.done': ['已移入「{name}」', 'Moved into "{name}"'],
  'cancel': ['取消', 'Cancel'],
  'close': ['完成', 'Done'],
}
function tt(key: string, vars?: Record<string, string>): string {
  const pair = T[key]
  if (!pair) return key
  let text = isZhInterface() ? pair[0] : pair[1]
  if (vars) for (const k of Object.keys(vars)) text = text.replace('{' + k + '}', vars[k])
  return text
}

interface WorkspaceLike {
  workspaceId?: string
  title?: string
  path?: string
  sessionIds?: string[]
}

interface WorkspaceServiceLike {
  insertSessionBefore: (workspaceId: string, sessionId: string, beforeSessionId?: string) => Promise<unknown>
  list?: { subscribe: (l: () => void) => () => void; getSnapshot: () => { items?: WorkspaceLike[] } }
}

export interface AssignCtx {
  get?: <T = unknown>(name: string) => T | undefined
  slots: {
    inject: (name: string, register: () => () => void) => () => void
    register: (options: Record<string, unknown>, component: unknown) => () => void
  }
}

// ── primitives / workspaces 服务（模块级句柄）───────────────────────────
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

let workspaceSvc: WorkspaceServiceLike | null = null
let moveSession: (sessionId: string, wsId: string) => Promise<string | null> = async () => 'rpc not ready'

async function moveViaService(wsId: string, sessionId: string): Promise<string | null> {
  if (!workspaceSvc || typeof workspaceSvc.insertSessionBefore !== 'function') return 'workspace service unavailable'
  try {
    await workspaceSvc.insertSessionBefore(wsId, sessionId)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

// ── 分配确认框（官方 Modal，注册 shell.overlay）─────────────────────────
interface DialogState {
  sessionId: string | null
  title: string
  done: boolean
}

function AssignWorkspaceDialog(): ReactNode {
  const [target, setTarget] = useState<DialogState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneWs, setDoneWs] = useState<string | null>(null)

  const subscribeList = (cb: () => void): (() => void) => {
    try {
      return workspaceSvc?.list?.subscribe ? workspaceSvc.list.subscribe(cb) : () => {}
    } catch {
      return () => {}
    }
  }
  const getList = (): { items?: WorkspaceLike[] } => {
    try {
      return workspaceSvc?.list?.getSnapshot() ?? { items: [] }
    } catch {
      return { items: [] }
    }
  }
  const list = useSyncExternalStore(subscribeList, getList, getList)

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {}
      const sessionId = typeof d.sessionId === 'string' && d.sessionId !== '' ? d.sessionId : null
      setTarget({ sessionId, title: String(d.title ?? ''), done: false })
      setBusy(false)
      setError(null)
      setDoneWs(null)
    }
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
  }, [])

  const close = () => {
    if (busy) return
    setTarget(null)
    setDoneWs(null)
  }

  if (!target) return null
  const Modal = primitives().Modal
  if (!Modal) return null

  const pick = (ws: WorkspaceLike) => {
    const wsId = ws.workspaceId || ''
    if (!wsId || !target.sessionId || busy) return
    setBusy(true)
    setError(null)
    moveSession(target.sessionId, wsId)
      .then((err) => {
        if (err) {
          setBusy(false)
          setError(err)
          return
        }
        setBusy(false)
        setDoneWs(ws.title || ws.path || wsId)
        setTarget((cur) => (cur ? { ...cur, done: true } : cur))
      })
      .catch((reason: unknown) => {
        setBusy(false)
        setError(reason instanceof Error ? reason.message : String(reason))
      })
  }

  const btn = (label: string, opts: { disabled?: boolean; onClick?: () => void }) =>
    h(
      'button',
      {
        key: label,
        type: 'button',
        disabled: opts.disabled,
        onClick: opts.onClick,
        style: {
          padding: '6px 14px',
          borderRadius: 8,
          fontSize: 13,
          cursor: opts.disabled ? 'default' : 'pointer',
          marginRight: 8,
          opacity: opts.disabled ? 0.5 : 1,
          border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.4))',
          background: 'transparent',
          color: 'var(--dsw-alias-label-primary,inherit)',
        },
      },
      label,
    )

  const rowList = (): ReactNode => {
    const realItems = (list && Array.isArray(list.items) ? list.items : []) as WorkspaceLike[]
    if (!realItems.length) {
      return h(
        'div',
        { style: { padding: '18px 4px', textAlign: 'center', fontSize: 13, color: 'var(--dsw-alias-label-secondary,#a8abb3)' } },
        tt('dialog.empty'),
      )
    }
    const currentWsId = target.sessionId
      ? realItems.find((w) => (w.sessionIds || []).includes(target.sessionId as string))?.workspaceId
      : undefined
    return h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 } },
      realItems.map((w) => {
        const wsId = w.workspaceId || ''
        const name = w.title || w.path || wsId
        const disabled = wsId === currentWsId || busy
        return h(
          'button',
          {
            key: wsId,
            type: 'button',
            disabled,
            onClick: () => pick(w),
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              border: 0,
              background: 'transparent',
              color: 'var(--dsw-alias-label-primary,#e6edf3)',
              padding: '8px 10px',
              borderRadius: 8,
              font: 'inherit',
              fontSize: 13,
              textAlign: 'left',
              cursor: disabled ? 'default' : 'pointer',
              opacity: disabled ? 0.55 : 1,
            },
            onMouseEnter: (e: { currentTarget: HTMLElement }) => {
              if (!disabled) e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12))'
            },
            onMouseLeave: (e: { currentTarget: HTMLElement }) => {
              e.currentTarget.style.background = 'transparent'
            },
          },
          [
            h('span', { key: 'name', style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, name),
            wsId === currentWsId
              ? h('span', { key: 'cur', style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary,#a8abb3)' } }, tt('dialog.current'))
              : null,
          ],
        )
      }),
    )
  }

  return h(
    Modal,
    {
      open: true,
      onClose: close,
      title: tt('dialog.title'),
      closeLabel: tt('cancel'),
      footer: [btn(tt('close'), { onClick: close, disabled: busy })],
    },
    h('div', null, [
      h('div', {
        key: 'meta',
        style: {
          color: 'var(--dsw-alias-label-secondary,#a8abb3)',
          fontSize: 13,
          lineHeight: '20px',
          margin: '0 0 6px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        },
      }, tt('dialog.session') + (target.title || '')),
      target.done
        ? h('div', {
            key: 'ok',
            style: { padding: '6px 0 2px', fontSize: 13, color: 'var(--dsw-alias-state-success-primary,#3fb950)' },
          }, tt('dialog.done', { name: doneWs || '' }))
        : h('div', { key: 'list' }, [
            h('div', { key: 'hint', style: { color: 'var(--dsw-alias-label-caption,#8a8e96)', fontSize: 12, marginBottom: 6 } }, tt('dialog.hint')),
            target.sessionId ? rowList() : h('div', { style: { padding: '8px 4px', fontSize: 12, color: 'var(--dsw-alias-label-secondary,#a8abb3)' } }, tt('dialog.notFound')),
            error ? h('div', { key: 'err', role: 'alert', style: { color: 'var(--dsw-alias-state-error-primary,#e5484d)', fontSize: 12, marginTop: 8 } }, error) : null,
            busy ? h('div', { key: 'busy', style: { color: 'var(--dsw-alias-label-secondary,#a8abb3)', fontSize: 12, marginTop: 8 } }, tt('dialog.moving')) : null,
          ]),
    ]),
  )
}

// ── 会话 ⋯ 菜单注入（分配工作区 项 = 克隆官方 menuitem，插删除项前）──────

function openMenuAssign(row: HTMLElement): void {
  const title = rowTitleOf(row)
  let sessionId: string | null = null
  try {
    const info = sessionInfoFromRow(row)
    sessionId = info ? info.sessionId : null
  } catch { /* fail closed */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { sessionId, title } }))
}

function ensureAssignMenuItem(): void {
  const menu = document.querySelector('[role=menu]')
  if (!menu) return
  if (menu.querySelector('[' + MENU_ASSIGN_ATTR + ']')) return
  const row = findOpenSessionRow()
  if (!row) return
  const template = Array.from(menu.querySelectorAll('[role=menuitem]')).find(
    (el) => !el.hasAttribute(MENU_ASSIGN_ATTR) && !el.hasAttribute('data-session-delete-item'),
  ) as HTMLElement | null

  let item: HTMLButtonElement
  if (template) {
    item = template.cloneNode(true) as HTMLButtonElement
    item.setAttribute(MENU_ASSIGN_ATTR, '1')
    const iconSvg = item.querySelector('svg')
    if (iconSvg) {
      iconSvg.setAttribute('fill', 'currentColor')
      iconSvg.setAttribute('stroke', 'none')
      iconSvg.innerHTML = ASSIGN_ICON_PATH
    }
    const spans = Array.from(item.querySelectorAll('span'))
    const labelSpan = spans.find((s) => s.textContent && s.textContent.trim() !== '') ?? null
    if (labelSpan) labelSpan.textContent = tt('menu.assign')
    else {
      const span = document.createElement('span')
      span.textContent = tt('menu.assign')
      item.appendChild(span)
    }
  } else {
    item = document.createElement('button')
    item.type = 'button'
    item.setAttribute('role', 'menuitem')
    item.setAttribute(MENU_ASSIGN_ATTR, '1')
    item.style.cssText = [
      'display:flex', 'align-items:center', 'gap:8px', 'width:100%',
      'padding:6px 12px', 'border:none', 'background:transparent',
      'color:var(--dsw-alias-label-primary,#e6edf3)',
      'font:inherit', 'fontSize:13px', 'lineHeight:20px',
      'textAlign:left', 'borderRadius:6px', 'cursor:pointer',
    ].join(';')
    item.innerHTML = '<span style="display:inline-flex;flex:none"><svg width="16" height="16" viewBox="0 0 16 16" fill="none">' + ASSIGN_ICON_PATH + '</svg></span><span>' + tt('menu.assign') + '</span>'
    item.addEventListener('mouseenter', () => { item.style.background = 'var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.14))' })
    item.addEventListener('mouseleave', () => { item.style.background = 'transparent' })
  }
  item.addEventListener('click', () => openMenuAssign(row))
  // 插在「删除会话」正上方；删除项未出现时追加到末尾（两种时序都满足位置）。
  const deleteItem = menu.querySelector('[data-session-delete-item]')
  if (deleteItem && deleteItem.parentNode) deleteItem.parentNode.insertBefore(item, deleteItem)
  else menu.appendChild(item)
}

// ── install ────────────────────────────────────────────────────────────

export function installAssignWorkspace(ctx: AssignCtx): () => void {
  if (typeof document === 'undefined') return () => {}
  if (!primitives().Modal) {
    console.warn('[width-slider] assign workspace disabled: Modal unavailable')
    return () => {}
  }
  try {
    const svc = ctx.get?.<WorkspaceServiceLike>('workspaces') ?? null
    workspaceSvc = svc && typeof svc.insertSessionBefore === 'function' ? svc : null
    moveSession = moveViaService
  } catch {
    workspaceSvc = null
  }
  if (!workspaceSvc) {
    console.warn('[width-slider] assign workspace disabled: workspaces service unavailable')
    return () => {}
  }

  const disposers: Array<() => void> = []
  try {
    const d = ctx.slots.inject(OVERLAY_SLOT, () => ctx.slots.register(
      { name: OVERLAY_SLOT, id: DIALOG_ID, order: 100 },
      AssignWorkspaceDialog,
    ))
    disposers.push(d)
  } catch { /* 忽略 */ }

  ensureAssignMenuItem()
  let rafId = 0
  const schedule = () => {
    if (rafId !== 0) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      try { ensureAssignMenuItem() } catch { /* 忽略 */ }
    })
  }
  const observer = new MutationObserver(() => schedule())
  observer.observe(document.body, { childList: true, subtree: true })
  disposers.push(() => {
    observer.disconnect()
    if (rafId !== 0) cancelAnimationFrame(rafId)
    document.querySelectorAll('[' + MENU_ASSIGN_ATTR + ']').forEach((el) => el.remove())
  })
  return () => {
    for (const d of disposers) {
      try { d() } catch { /* 忽略 */ }
    }
    workspaceSvc = null
  }
}
