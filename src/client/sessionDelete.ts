/**
 * sessionDelete.ts — 会话删除（client 端，v0.5.0）。
 *
 * 集成自：lsz-asd/dsh-plugin-session-delete（@huanlin/dsh-plugin-session-delete
 * v0.3.1，MIT，仓库 session-delete-ref/）——保留核心交互、修正 UI 形态：
 *   - 会话行 ⋯ 菜单注入"删除会话"项：克隆官方 menuitem 模板（继承官方
 *     padding/圆角/hover 灰底），仅图标换垃圾桶、文字标危险色，与官方项
 *     平级追加、无分隔线（UI 定稿，按用户要求移除头部按钮与手写分隔线）；
 *   - 官方 primitives.Modal 确认框（shell.overlay 注册：标题/描述/序列号/
 *     运行警告/"我已了解后果"勾选 + 确认/取消），不再是自绘浮层；
 *   - 删除成功后调用会话列表刷新。
 * 规避其 issue #2：目标会话 id 从会话行 React fiber 直读 node.id
 * （menu 路径），绝不按标题反查；读不到 id 即失败提示（fail closed）。
 * 删除经 /api/width-slider 端点 sessionDelete{id}（host 见 src/host/
 * sessionDeleteService.ts）。文案随界面语言（zh/en，运行时取值）。
 */
import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import { isZhInterface } from './core/lang.ts'
import { callEndpoint } from './core/endpointChannel.ts'
import { ENDPOINT_METHOD, WIDTH_SLIDER_ENDPOINT } from '../shared/endpointContract.ts'
import { primitives } from './core/primitives.ts'
import { observeBodyDebounced } from './core/domObserver.ts'
import { findOpenMenu, injectMenuItem } from './official/menuInjection.ts'
import { shakeElement } from './motion/index.ts'

interface SessCtx {
  get?: <T = unknown>(name: string) => T | undefined
  slots: {
    inject: (name: string, register: () => () => void) => () => void
    register: (options: Record<string, unknown>, component: unknown) => () => void
  }
  effect: (fn: () => void | (() => void), label?: string) => void
}

const OVERLAY_SLOT = 'shell.overlay'
const DIALOG_ID = 'session-delete-dialog'
const EVENT = 'dsh:session-delete'
const MENU_DELETE_ATTR = 'data-session-delete-item'
/**
 * 槽项（官方槽渲染出来的那一个）自己的标记，只表明「官方槽已接管、兜底让位」。
 * 绝不能与 MENU_DELETE_ATTR 复用：后者是兜底克隆项的删除键，
 * ensureDeleteMenuItem 会按它 remove 元素——复用会让兜底清理把自己刚渲染
 * 出来的槽项删掉（1.5.1 的线上回归：菜单里只剩官方四项）。
 */
const MENU_SLOT_ATTR = 'data-session-delete-slotitem'
/** 0.1.7 起的官方会话行菜单槽：宿主直接把 sessionId / displayTitle 投影进来。 */
const MENU_ITEM_SLOT = 'sidebar.workspaces.session.menu.item'
const MENU_ITEM_ID = 'session-delete'

// 文案（zh/en 运行时取值，界面语言跟随）。
const T = {
  'dialog.title': ['删除会话', 'Delete session'],
  'dialog.cancel': ['取消', 'Cancel'],
  'dialog.confirm': ['删除', 'Delete'],
  'dialog.confirming': ['删除中…', 'Deleting…'],
  'dialog.session': ['会话：', 'Session: '],
  'dialog.sessionId': ['序列号：', 'Session ID: '],
  'dialog.runningWarn': ['该会话正在运行，删除会立即停止其任务。', 'This session is running; deleting it will stop its task.'],
  'dialog.ack': ['我已了解后果，确认删除', 'I understand the consequences. Confirm deletion'],
  'dialog.notFoundDesc': ['未能在会话列表中找到该会话（可能已被删除或列表尚未刷新），请刷新后重试。', 'Could not find this session (deleted or list not refreshed). Refresh and retry.'],
  'dialog.deleteDesc': ['将永久删除该会话及其全部对话记录（会话日志、统计与工作区记账），此操作不可恢复。', 'This will permanently delete the session and all of its conversation records. This cannot be undone.'],
  'button.title': ['删除会话', 'Delete session'],
  'button.titleRunning': ['删除会话（运行中，删除将停止任务）', 'Delete session (running — deleting will stop the task)'],
  'menu.delete': ['删除会话', 'Delete session'],
} as Record<string, [string, string]>

function tt(key: string): string {
  const pair = T[key]
  if (!pair) return key
  return isZhInterface() ? pair[0] : pair[1]
}

// primitives（Modal / IconTrashOutline16）走统一读取入口 src/client/core/primitives.ts：
// 缓存、失败降级与告警都在那一处，这里不再自建一份。

// ── 会话服务句柄（sessions list 供 title/running 展示与刷新）────────
let sessionsSvc: { list?: { getSnapshot: () => { byId: Record<string, { title?: string; running?: boolean } | undefined> } }; refreshList?: () => unknown } | null = null

function sessionsById(): Record<string, { title?: string; running?: boolean } | undefined> {
  try {
    return sessionsSvc?.list?.getSnapshot()?.byId ?? {}
  } catch {
    return {}
  }
}

// ── RPC 删除 ─────────────────────────────────────────────────────────

async function rpcDelete(ctx: SessCtx, sessionId: string): Promise<string | null> {
  try {
    const result = await callEndpoint(WIDTH_SLIDER_ENDPOINT, ENDPOINT_METHOD.sessionDelete, { id: sessionId })
    if (result && typeof result === 'object' && (result as { ok?: boolean }).ok === true) return null
    const err = (result as { error?: { message?: string } } | null)?.error?.message
    return err ?? 'delete failed'
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

// ── 删除确认框（官方 Modal，注册 shell.overlay）─────────────────────

function DeleteSessionDialog(): any {
  const [target, setTarget] = useState<{ sessionId: string | null; title: string; running: boolean; notFound: boolean } | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {}
      const sessionId = typeof d.sessionId === 'string' && d.sessionId !== '' ? d.sessionId : null
      if (!sessionId) {
        setTarget({ sessionId: null, title: String(d.title ?? ''), running: false, notFound: true })
      } else {
        const s = sessionsById()[sessionId]
        setTarget({
          sessionId,
          title: s?.title ?? String(d.title ?? ''),
          running: d.running === true || s?.running === true,
          notFound: false,
        })
      }
      setAcknowledged(false)
      setError(null)
      setBusy(false)
    }
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
  }, [])

  // ── 失败反馈：错误行落地时抖一下（impact 通道）──────────────────
  // 删除失败原本只是把一行红字换进来，容易被当成"刚才那下没反应"；抖动让
  // 失败有分量。只抖错误行本身（不是用户正在读的正文），reduced motion 由
  // shakeElement 内部短路。同一段错误只抖一次（失败重试产生的新文案会再抖）。
  const shakenError = useRef<string | null>(null)
  useEffect(() => {
    if (error === null || shakenError.current === error) return
    const line = document.querySelector<HTMLElement>('[data-dsws-delete-error]')
    if (line === null) return
    shakenError.current = error
    shakeElement(line, 3, 260)
  }, [error])

  const close = useCallback(() => {
    if (busy) return
    setTarget(null)
    setError(null)
  }, [busy])

  const confirm = useCallback(() => {
    if (busy || !acknowledged || !target || !target.sessionId) return
    setBusy(true)
    setError(null)
    // 经模块级 handle 删除（rpc 出口由 install 注入 ctx）。
    deleteViaRpc(target.sessionId)
      .then((err) => {
        if (err) {
          setBusy(false)
          setError(err)
          return
        }
        const svc = sessionsSvc
        setTarget(null)
        if (svc && typeof svc.refreshList === 'function') svc.refreshList()
      })
      .catch((reason: unknown) => {
        setBusy(false)
        setError(reason instanceof Error ? reason.message : String(reason))
      })
  }, [busy, acknowledged, target])

  // 模块级 rpc 出口由 install 注入（ctx 不在组件内）。
  if (!target) return null
  const Modal = primitives().Modal
  if (!Modal) return null
  const name = target.title || tt('dialog.title')
  const description = target.notFound
    ? tt('dialog.notFoundDesc')
    : (target.running ? tt('dialog.runningWarn') + ' ' : '') + tt('dialog.deleteDesc')
  return createElement(Modal, {
        open: true,
        onClose: close,
        title: tt('dialog.title'),
        closeLabel: tt('dialog.cancel'),
        description,
        footer: [
          createElement('button', {
            key: 'cancel',
            type: 'button',
            disabled: busy,
            onClick: close,
            style: { padding: '6px 14px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4))', background: 'transparent', color: 'var(--dsw-alias-label-primary,inherit)', fontSize: 13, cursor: 'pointer', marginRight: 8, ...(busy ? { opacity: 0.5, cursor: 'default' } : {}) },
          }, tt('dialog.cancel')),
          createElement('button', {
            key: 'confirm',
            type: 'button',
            disabled: busy || !acknowledged || !target.sessionId,
            onClick: confirm,
            style: { padding: '6px 14px', borderRadius: 8, border: '1px solid var(--dsw-alias-state-error-primary,#e5484d)', background: 'var(--dsw-alias-state-error-primary,#e5484d)', color: '#fff', fontSize: 13, cursor: 'pointer', ...(busy || !acknowledged || !target.sessionId ? { opacity: 0.5, cursor: 'default' } : {}) },
          }, busy ? tt('dialog.confirming') : tt('dialog.confirm')),
        ],
      }, [
        createElement('div', { key: 'meta', style: { color: 'var(--dsw-alias-label-secondary,#8a8a8e)', fontSize: 13, lineHeight: '20px', margin: '0 0 10px', overflow: 'hidden', textOverflow: 'ellipsis' } },
          tt('dialog.session') + name,
          target.sessionId ? createElement('div', { key: 'id', style: { fontSize: 12 } }, tt('dialog.sessionId') + target.sessionId) : null),
        target.notFound ? null : createElement('label', { key: 'ack', style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--dsw-alias-label-primary,inherit)', marginTop: 10 } },
          createElement('input', { type: 'checkbox', checked: acknowledged, disabled: busy, onChange: (e: { target: { checked: boolean } }) => setAcknowledged(e.target.checked) }),
          tt('dialog.ack')),
        error ? createElement('div', { key: 'err', role: 'alert', 'data-dsws-delete-error': '', style: { color: 'var(--dsw-alias-state-error-primary,#e5484d)', fontSize: 12, lineHeight: '16px', marginTop: 8 } }, error) : null,
      ])
}

// 模块级删除出口（由 install 注入 ctx，供 Dialog 回调使用）。
let deleteViaRpc: (sessionId: string) => Promise<string | null> = async () => 'rpc not ready'

// ── 菜单注入（⋯ → 删除会话，行级 id）───────────────────────────────

const TRASH_PATH = 'M14.4782 4.84067L14.2138 10.1152C14.1102 12.1872 14.067 13.0115 13.3866 13.9607C13.1044 14.3546 12.7498 14.6912 12.3424 14.9535C11.8239 15.2872 11.2415 15.4316 10.5585 15.4998C9.88727 15.5668 9.04946 15.5656 7.99998 15.5656C6.95051 15.5656 6.1127 15.5668 5.44142 15.4998C4.75851 15.4316 4.17602 15.2872 3.65753 14.9535C3.25012 14.6912 2.89559 14.3546 2.61332 13.9607C1.93296 13.0115 1.88979 12.1872 1.78619 10.1152L1.52179 4.84067L2.89006 4.77277L3.15343 10.0463C3.26221 12.2218 3.32452 12.6015 3.72646 13.1624C3.90825 13.4161 4.13686 13.6334 4.39927 13.8023C4.66204 13.9714 5.00263 14.0792 5.57825 14.1367C6.16562 14.1953 6.92298 14.1963 7.99998 14.1963C9.07699 14.1963 9.83434 14.1953 10.4217 14.1367C10.9973 14.0792 11.3379 13.9714 11.6007 13.8023C11.8631 13.6334 12.0917 13.4161 12.2735 13.1624C12.6755 12.6015 12.7378 12.2218 12.8465 10.0463L13.1099 4.77277L14.4782 4.84067ZM5.43011 6.22849H6.7994V11.3909H5.43011V6.22849ZM9.20056 6.22849H10.5699V11.3909H9.20056V6.22849ZM8.53597 0.434431C9.17976 0.434431 9.6522 0.426926 10.0966 0.571258C10.2357 0.616451 10.3717 0.672554 10.502 0.738948C10.9182 0.951107 11.2464 1.29099 11.7015 1.74612L12.4978 2.54136H15.3742V3.91169H0.625732V2.54136H3.50218L4.29845 1.74612C4.75358 1.29099 5.08174 0.951107 5.49801 0.738948C5.62831 0.672554 5.76425 0.616451 5.90334 0.571258C6.34776 0.426926 6.82021 0.434431 7.46399 0.434431H8.53597ZM7.46399 1.80476C6.73208 1.80476 6.51641 1.81187 6.32617 1.87369C6.25545 1.89667 6.18668 1.92533 6.12041 1.95907C5.96398 2.03878 5.82348 2.16253 5.44142 2.54136H10.5585C10.1765 2.16253 10.036 2.03878 9.87955 1.95907C9.81329 1.92533 9.74452 1.89667 9.6738 1.87369C9.48356 1.81187 9.26789 1.80476 8.53597 1.80476H7.46399Z'

/**
 * 会话行的 id / running：优先读宿主写在行根上的 data-row-key="session:<id>"
 * （0.1.7 起的稳定契约——会话行根同时带 [class*=sessionRow] 与该属性），
 * running 从会话账本取；宿主未提供该属性（0.1.5）时回退 React fiber 直读
 * node.id。两条路径都读不到即失败（fail closed，绝不按标题反查）。
 */
function sessionInfoFromRow(row: HTMLElement): { sessionId: string; running: boolean } | null {
  if (!row) return null
  const keyed = sessionIdFromRowKey(row)
  if (keyed !== null) {
    const live = sessionsById()[keyed]
    return { sessionId: keyed, running: live?.running === true }
  }
  return sessionInfoFromFiber(row)
}

/** 行根 data-row-key="session:<id>" 的解析（宿主 0.1.7+；缺失返回 null）。 */
function sessionIdFromRowKey(row: HTMLElement): string | null {
  const holder = row.hasAttribute('data-row-key') ? row : row.closest('[data-row-key]')
  const match = /^session:(.+)$/.exec(holder?.getAttribute('data-row-key') ?? '')
  return match ? match[1] : null
}

/** 0.1.5 兜底路径：从会话行 React fiber 的 memoizedProps.node 读 id / running。 */
function sessionInfoFromFiber(row: HTMLElement): { sessionId: string; running: boolean } | null {
  let fiber: unknown = null
  for (const key of Object.keys(row)) {
    if (key.indexOf('__reactFiber$') === 0) {
      fiber = (row as unknown as Record<string, unknown>)[key]
      break
    }
  }
  let node: unknown = fiber
  for (let depth = 0; node && depth < 32; depth += 1, node = (node as { return?: unknown }).return) {
    const props = (node as { memoizedProps?: { node?: { id?: unknown; running?: unknown; blank?: unknown } } }).memoizedProps
    if (props && props.node && typeof props.node.id === 'string' && props.node.id !== '' && typeof props.node.blank === 'boolean') {
      return { sessionId: props.node.id, running: props.node.running === true }
    }
  }
  return null
}

function findOpenSessionRow(): HTMLElement | null {
  const rows = document.querySelectorAll<HTMLElement>('[class*=sessionRow]')
  for (const row of rows) {
    if (row.className.indexOf('menuOpen') >= 0) return row
  }
  return null
}

function rowTitleOf(row: HTMLElement): string {
  const el = row.querySelector('[class*=title]')
  return el ? String((el as HTMLElement).innerText || '').trim() : ''
}

/** 派发删除确认请求（官方槽菜单项与 DOM 兜底路径共用同一事件）。 */
function emitDeleteRequest(sessionId: string | null, title: string, running: boolean): void {
  window.dispatchEvent(new CustomEvent(EVENT, {
    detail: { sessionId, title, running },
  }))
}

function openMenuDelete(row: HTMLElement): void {
  const title = rowTitleOf(row)
  let info: { sessionId: string; running: boolean } | null = null
  try {
    info = sessionInfoFromRow(row)
  } catch { /* fail closed */ }
  emitDeleteRequest(info ? info.sessionId : null, title, info ? info.running : false)
}

/** 官方行菜单槽是否已接管（由 SessionDeleteMenuItem 渲染时置位）。 */
let menuSlotLive = false

/**
 * 0.1.7+ 官方行菜单槽 `sidebar.workspaces.session.menu.item` 的「删除会话」项。
 * 宿主把 sessionId / displayTitle 直接投影进来，不再需要 DOM 克隆与 React
 * fiber 读 id（对上游行结构变化免疫）。order 500 排在官方项之后
 * （pin 100 / rename 200 / fork 300 / archive 400）——危险操作放最后。
 * 外层标记用独立的 MENU_SLOT_ATTR（而非兜底的 MENU_DELETE_ATTR）：它只用来
 * 表明"官方槽已接管"，不参与兜底项的删除键匹配，因此不会被兜底清理误删。
 */
function SessionDeleteMenuItem(props: { sessionId?: unknown; displayTitle?: unknown }): any {
  const sessionId = typeof props.sessionId === 'string' ? props.sessionId : ''
  const displayTitle = typeof props.displayTitle === 'string' ? props.displayTitle : ''
  if (sessionId === '') return null
  // 官方槽已在此宿主生效：兜底的 DOM 克隆从此让位。
  menuSlotLive = true
  const onSelect = (): void => {
    const live = sessionsById()[sessionId]
    emitDeleteRequest(sessionId, live?.title ?? displayTitle, live?.running === true)
  }
  const icon = createElement(
    'svg',
    { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    createElement('path', { d: TRASH_PATH, fill: 'currentColor' }),
  )
  // 官方菜单项组件（0.1.7 起可用）：样式与官方 pin/rename/fork/archive 完全
  // 一致，只有 danger 上危险色。老宿主没有它时手写同形按钮兜底。
  const MenuItemButton = primitives().MenuItemButton
  const item = MenuItemButton
    ? createElement(MenuItemButton, { icon, danger: true, onSelect }, tt('menu.delete'))
    : createElement('button', {
        type: 'button',
        role: 'menuitem',
        onClick: onSelect,
        style: {
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '6px 12px', border: 'none', background: 'transparent',
          color: 'var(--dsw-alias-state-error-primary,#e5484d)',
          font: 'inherit', fontSize: 13, lineHeight: '20px',
          textAlign: 'left', borderRadius: 6, cursor: 'pointer',
        },
      }, icon, tt('menu.delete'))
  return createElement('div', { [MENU_SLOT_ATTR]: '1' }, item)
}

/**
 * 克隆官方菜单项做"删除会话"（继承官方全部样式：padding/圆角/字号/hover
 * 由官方 hash 类控制，保证与 重命名/分叉会话/归档会话 视觉一致），仅把
 * 图标换成垃圾桶、文本换成删除会话、文字标危险色。
 * 只在官方行菜单槽未接管（0.1.7 之前的宿主）时使用。
 */
function ensureDeleteMenuItem(): void {
  if (menuSlotLive) {
    // 官方槽已渲染它自己的"删除会话"项：清掉可能先插入的兜底克隆项，
    // 避免同一个菜单里出现两个同名条目。
    document.querySelectorAll('[' + MENU_DELETE_ATTR + ']').forEach((el) => el.remove())
    return
  }
  const menu = findOpenMenu()
  if (!menu) return
  const row = findOpenSessionRow()
  if (!row) return
  // 克隆/换图标/换文本/色值覆盖全在 official/menuInjection.ts，这里只给参数。
  // 不插分隔线：与官方菜单项平级直接追加，保持官方一致的列表外观。
  injectMenuItem({
    menu,
    attr: MENU_DELETE_ATTR,
    iconHtml: '<path d="' + TRASH_PATH + '" fill="currentColor"/>',
    label: tt('menu.delete'),
    fallbackColor: 'var(--dsw-alias-state-error-primary,#e5484d)',
    templateColor: 'var(--dsw-alias-state-error-primary,#e5484d)',
    // 兜底按钮的对齐声明沿用历史拼写（为何不"顺手修好"见原语该参数注释）。
    alignItemsProperty: 'alignItems',
    onClick: () => openMenuDelete(row),
  })
}

// ── install（生命周期入口）───────────────────────────────────────────

export function installSessionDelete(ctx: SessCtx): () => void {
  if (typeof document === 'undefined') return () => {}
  // 官方 primitives 不可用时（依赖缺失/升级破坏）：确认框无法渲染，
  // 菜单项点了没反馈——干脆整个功能降级跳过并在 console 说明原因。
  if (!primitives().Modal) {
    try {
      // eslint-disable-next-line no-console
      console.warn('[width-slider] session delete disabled: @deepseek-ai/dsh-client-ui-primitives Modal unavailable')
    } catch { /* ignore */ }
    return () => {}
  }
  // 供组件/模块使用：rpc 出口 + 会话服务 + createElement。
  deleteViaRpc = (sessionId: string) => rpcDelete(ctx, sessionId)
  try {
    const svc = ctx.get?.<unknown>('sessions') as {
      list?: { getSnapshot: () => { byId: Record<string, { title?: string; running?: boolean } | undefined> } }
      refreshList?: () => unknown
    } | undefined
    if (svc) sessionsSvc = svc
  } catch { /* ignore */ }
  const disposers: Array<() => void> = []
  // shell.overlay：删除确认框。
  try {
    const d = ctx.slots.inject(OVERLAY_SLOT, () => ctx.slots.register(
      { name: OVERLAY_SLOT, id: DIALOG_ID, order: 100 },
      DeleteSessionDialog,
    ))
    disposers.push(d)
  } catch { /* ignore */ }
  // 0.1.7+：官方行菜单槽把 sessionId / displayTitle 直接投影进来，菜单项
  // 不再依赖 DOM 克隆与 React fiber 读 id。旧宿主没有这个槽（inject 等不到
  // 声明、不会生效），下面的 DOM 兜底照常工作。
  try {
    const d = ctx.slots.inject(MENU_ITEM_SLOT, () => ctx.slots.register(
      { name: MENU_ITEM_SLOT, id: MENU_ITEM_ID, order: 500 },
      SessionDeleteMenuItem,
    ))
    disposers.push(d)
  } catch { /* 旧宿主无此槽：保持 DOM 兜底 */ }
  ensureDeleteMenuItem()
  // 菜单项注入是幂等的：body 每有动静就在下一帧补一次漏（rAF 合并见
  // core/domObserver.ts）。
  const menuProbe = observeBodyDebounced(() => {
    try { ensureDeleteMenuItem() } catch { /* ignore */ }
  })
  disposers.push(() => {
    menuProbe.dispose()
    document.querySelectorAll('[' + MENU_DELETE_ATTR + ']').forEach((el) => el.remove())
  })
  return () => {
    for (const d of disposers) {
      try { d() } catch { /* ignore */ }
    }
    sessionsSvc = null
    deleteViaRpc = async () => 'rpc not ready'
  }
}
