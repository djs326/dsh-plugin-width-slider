/**
 * sessionDelete.ts — 会话删除（client 端，v0.5.0，菜单注入 + 行级 id 版）。
 *
 * 参考：lsz-asd/dsh-plugin-session-delete（MIT，仓库 session-delete-ref/）。
 * 规避其 issue #2（标题反查会删错会话，数据丢失）：目标会话 id 直接从
 * 会话行的 React fiber 读取（SessionNodeItem 的 memoizedProps.node.id），
 * 绝不按标题反查；读不到 id 时失败提示（fail closed），不猜测。
 * 行标题仅用于确认弹窗展示。删除走 host /width-slider sessionDelete。
 */
import { pickText } from './lang.ts'

interface SessCtx {
  connection: {
    rpc: {
      call: (path: string, method: string, payload?: Record<string, unknown>) => Promise<unknown>
    }
  }
  get?: <T = unknown>(name: string) => T | undefined
}

const MENU_DELETE_ATTR = 'data-session-delete-item'

// ── RPC ──────────────────────────────────────────────────────────────

async function rpcCall(ctx: SessCtx, method: string, payload: Record<string, unknown>): Promise<unknown> {
  try {
    const result = await ctx.connection.rpc.call('/width-slider', method, payload)
    if (result && typeof result === 'object' && (result as { ok?: boolean }).ok === true) {
      return (result as { value?: unknown }).value ?? null
    }
    const err = (result as { error?: { message?: string } } | null)?.error?.message
    return { __error: err ?? 'RPC error' }
  } catch (err) {
    return { __error: err instanceof Error ? err.message : String(err) }
  }
}

// ── 浮层（token 化自绘）─────────────────────────────────────────────

function createOverlay(inner: HTMLElement): HTMLDivElement {
  const mask = document.createElement('div')
  mask.style.cssText = [
    'position:fixed', 'inset:0', 'zIndex:100000',
    'background:var(--dsw-alias-bg-mask-1, rgba(0,0,0,.45))',
    'display:flex', 'alignItems:center', 'justifyContent:center',
  ].join(';')
  const card = document.createElement('div')
  card.style.cssText = [
    'width:min(420px, calc(100vw - 48px))',
    'background:var(--dsw-alias-bg-layer-2, #fff)',
    'color:var(--dsw-alias-label-primary, #1a1a1a)',
    'borderRadius:12px',
    'boxShadow:var(--dsw-elevation-prominent, 0 8px 24px rgba(0,0,0,.2))',
    'padding:16px', 'fontSize:13px', 'lineHeight:20px',
  ].join(';')
  card.appendChild(inner)
  mask.appendChild(card)
  mask.addEventListener('pointerdown', (e) => { if (e.target === mask) mask.remove() })
  return mask
}

function mkButton(label: string, danger: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  b.style.cssText = [
    'height:28px', 'padding:0 12px', 'borderRadius:6px',
    'border:1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))',
    'background:transparent', 'color:var(--dsw-alias-label-primary, inherit)',
    'cursor:pointer', 'fontSize:12px',
  ].join(';')
  if (danger) {
    b.style.background = 'var(--dsw-alias-state-error-primary, #e5484d)'
    b.style.color = '#fff'
    b.style.borderColor = 'transparent'
  }
  b.addEventListener('click', onClick)
  return b
}

function showNotice(title: string, message: string): void {
  const wrap = document.createElement('div')
  const h = document.createElement('div')
  h.style.fontWeight = '600'
  h.style.marginBottom = '8px'
  h.textContent = title
  const body = document.createElement('div')
  body.style.color = 'var(--dsw-alias-label-secondary, #666)'
  body.textContent = message
  let maskRef: HTMLDivElement | null = null
  const close = mkButton(pickText('知道了', 'OK'), false, () => maskRef?.remove())
  wrap.appendChild(h)
  wrap.appendChild(body)
  wrap.appendChild(close)
  maskRef = createOverlay(wrap)
  document.body.appendChild(maskRef)
}

function askConfirm(title: string, detail: string, okText: string): Promise<boolean> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div')
    const h = document.createElement('div')
    h.style.fontWeight = '600'
    h.style.marginBottom = '8px'
    h.textContent = title
    const body = document.createElement('div')
    body.style.color = 'var(--dsw-alias-label-secondary, #666)'
    body.style.wordBreak = 'break-all'
    body.textContent = detail
    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px'
    let maskRef: HTMLDivElement | null = null
    const cancel = mkButton(pickText('取消', 'Cancel'), false, () => { maskRef?.remove(); resolve(false) })
    const ok = mkButton(okText, true, () => { maskRef?.remove(); resolve(true) })
    actions.appendChild(cancel)
    actions.appendChild(ok)
    wrap.appendChild(h)
    wrap.appendChild(body)
    wrap.appendChild(actions)
    maskRef = createOverlay(wrap)
    document.body.appendChild(maskRef)
  })
}

// ── 删除流程（行级 id，无标题反查）───────────────────────────────────

async function doDelete(ctx: SessCtx, sessionId: string, title: string, running: boolean): Promise<void> {
  const runningNote = running
    ? pickText(' 该会话正在运行，删除会立即停止其任务。', ' This session is running; deletion will stop its task.')
    : ''
  const ok = await askConfirm(
    pickText('删除会话', 'Delete session'),
    pickText('确定永久删除会话「' + title + '」？' + runningNote + ' 此操作会删除全部记录与数据，不可恢复。', 'Permanently delete "' + title + '"? ' + runningNote + ' All records and data will be removed.'),
    pickText('永久删除', 'Delete permanently'),
  )
  if (!ok) return
  const del = await rpcCall(ctx, 'sessionDelete', { id: sessionId })
  if (del && typeof del === 'object' && '__error' in del) {
    showNotice(pickText('删除失败', 'Delete failed'), String((del as { __error: string }).__error))
    return
  }
  try {
    const svc = ctx.get?.<{ refreshList?: () => unknown }>('sessions')
    svc?.refreshList?.()
  } catch { /* ignore */ }
}

// ── 菜单注入 ─────────────────────────────────────────────────────────

const TRASH_PATH = 'M14.4782 4.84067L14.2138 10.1152C14.1102 12.1872 14.067 13.0115 13.3866 13.9607C13.1044 14.3546 12.7498 14.6912 12.3424 14.9535C11.8239 15.2872 11.2415 15.4316 10.5585 15.4998C9.88727 15.5668 9.04946 15.5656 7.99998 15.5656C6.95051 15.5656 6.1127 15.5668 5.44142 15.4998C4.75851 15.4316 4.17602 15.2872 3.65753 14.9535C3.25012 14.6912 2.89559 14.3546 2.61332 13.9607C1.93296 13.0115 1.88979 12.1872 1.78619 10.1152L1.52179 4.84067L2.89006 4.77277L3.15343 10.0463C3.26221 12.2218 3.32452 12.6015 3.72646 13.1624C3.90825 13.4161 4.13686 13.6334 4.39927 13.8023C4.66204 13.9714 5.00263 14.0792 5.57825 14.1367C6.16562 14.1953 6.92298 14.1963 7.99998 14.1963C9.07699 14.1963 9.83434 14.1953 10.4217 14.1367C10.9973 14.0792 11.3379 13.9714 11.6007 13.8023C11.8631 13.6334 12.0917 13.4161 12.2735 13.1624C12.6755 12.6015 12.7378 12.2218 12.8465 10.0463L13.1099 4.77277L14.4782 4.84067ZM5.43011 6.22849H6.7994V11.3909H5.43011V6.22849ZM9.20056 6.22849H10.5699V11.3909H9.20056V6.22849ZM8.53597 0.434431C9.17976 0.434431 9.6522 0.426926 10.0966 0.571258C10.2357 0.616451 10.3717 0.672554 10.502 0.738948C10.9182 0.951107 11.2464 1.29099 11.7015 1.74612L12.4978 2.54136H15.3742V3.91169H0.625732V2.54136H3.50218L4.29845 1.74612C4.75358 1.29099 5.08174 0.951107 5.49801 0.738948C5.62831 0.672554 5.76425 0.616451 5.90334 0.571258C6.34776 0.426926 6.82021 0.434431 7.46399 0.434431H8.53597ZM7.46399 1.80476C6.73208 1.80476 6.51641 1.81187 6.32617 1.87369C6.25545 1.89667 6.18668 1.92533 6.12041 1.95907C5.96398 2.03878 5.82348 2.16253 5.44142 2.54136H10.5585C10.1765 2.16253 10.036 2.03878 9.87955 1.95907C9.81329 1.92533 9.74452 1.89667 9.6738 1.87369C9.48356 1.81187 9.26789 1.80476 8.53597 1.80476H7.46399Z'

/** 从行的 React fiber 读会话 node（id/running）；读不到返回 null（fail closed）。 */
function sessionInfoFromRow(row: HTMLElement): { sessionId: string; running: boolean } | null {
  if (!row) return null
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

/** 找到当前处于打开态（menuOpen）的会话行。 */
function findOpenSessionRow(): HTMLElement | null {
  const rows = document.querySelectorAll<HTMLElement>('[class*=sessionRow]')
  for (const row of rows) {
    if (row.className.indexOf('menuOpen') >= 0) return row
  }
  return null
}

/** 行标题（仅用于确认弹窗展示；删除定位不依赖它）。 */
function rowTitleOf(row: HTMLElement): string {
  const el = row.querySelector('[class*=title]')
  return el ? String((el as HTMLElement).innerText || '').trim() : ''
}

/** 删除项点击：取行级 id → 确认 → 删除；id 缺失则失败提示。 */
function openDeleteFlow(ctx: SessCtx, row: HTMLElement): void {
  const title = rowTitleOf(row)
  let info: { sessionId: string; running: boolean } | null = null
  try {
    info = sessionInfoFromRow(row)
  } catch { /* fail closed */ }
  if (!info) {
    showNotice(pickText('无法删除', 'Cannot delete'),
      pickText('无法识别该会话（未能读取会话标识），请刷新后重试。', 'Could not identify this session; refresh and try again.'))
    return
  }
  void doDelete(ctx, info.sessionId, title || info.sessionId, info.running)
}

/** 给已打开的 ⋯ 菜单追加"删除会话"项（幂等）。 */
function ensureDeleteMenuItem(ctx: SessCtx): void {
  const menu = document.querySelector('[role=menu]')
  if (!menu) return
  if (menu.querySelector('[' + MENU_DELETE_ATTR + ']')) return
  const row = findOpenSessionRow()
  if (!row) return
  const item = document.createElement('button')
  item.type = 'button'
  item.setAttribute('role', 'menuitem')
  item.setAttribute(MENU_DELETE_ATTR, '1')
  item.style.cssText = [
    'display:flex', 'alignItems:center', 'gap:8px', 'width:100%',
    'padding:6px 12px', 'border:none', 'background:transparent',
    'color:var(--dsw-alias-state-error-primary,#e5484d)',
    'font:inherit', 'fontSize:13px', 'lineHeight:20px',
    'textAlign:left', 'borderRadius:6px', 'cursor:pointer',
  ].join(';')
  item.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex:none"><path d="' + TRASH_PATH + '" fill="currentColor"/></svg><span>' + pickText('删除会话', 'Delete session') + '</span>'
  item.addEventListener('mouseenter', () => { item.style.background = 'var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.14))' })
  item.addEventListener('mouseleave', () => { item.style.background = 'transparent' })
  item.addEventListener('click', () => openDeleteFlow(ctx, row))
  const sep = document.createElement('div')
  sep.style.cssText = 'height:1px;margin:4px 8px;background:var(--dsw-alias-border-l1,rgba(128,128,128,.2))'
  menu.appendChild(sep)
  menu.appendChild(item)
}

/** 安装：观察 body，菜单打开即注入删除项；返回 disposer。 */
export function installSessionDelete(ctx: SessCtx): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  ensureDeleteMenuItem(ctx)
  let rafId = 0
  const schedule = () => {
    if (rafId !== 0) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      ensureDeleteMenuItem(ctx)
    })
  }
  const observer = new MutationObserver(() => schedule())
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    if (rafId !== 0) cancelAnimationFrame(rafId)
    document.querySelectorAll('[' + MENU_DELETE_ATTR + ']').forEach((el) => el.remove())
  }
}
