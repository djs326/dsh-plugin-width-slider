/**
 * sessionDelete.ts — 会话删除（client 端注入，v0.5.0）。
 *
 * 官方会话树（@deepseek-ai/dsh-client-ui-workspace SessionNodeItem）的操作
 * 菜单只有 重命名/分叉/归档，且行 DOM 不携带会话 id。本模块以补丁方式：
 * - 在会话行悬停操作区（⋯ 按钮旁）注入"删除"按钮；
 * - 会话标题解析：官方 ⋯ 按钮的 aria-label = 本地化模板 + 会话标题，与
 *   ctx.sessions 列表标题做"包含-最长匹配"（标题原样插入模板，必含）；
 * - 删除定位走 host（title → 候选 headers，同名多个时用户先单选），
 *   确认浮层二次确认后调 host 永久删除。
 *
 * 破坏性操作：确认文案明确"永久删除、不可恢复"；所有失败路径给出可见
 * 提示（不静默）。开关 sessionDelete 关闭时整模块不安装。
 */
import { pickText } from './lang.ts'

interface SessionDeleteCtx {
  connection: {
    rpc: {
      call: (path: string, method: string, payload?: Record<string, unknown>) => Promise<unknown>
    }
  }
  sessions?: {
    list: { getSnapshot: () => { byId: Record<string, { title?: string; cwd?: string } | undefined> } }
  }
}

interface Candidate { id: string; title: string | null; updatedAt: number | null }

/** 行内注入的删除按钮标识。 */
const BTN_ATTR = 'data-session-delete'
const BTN_ID = 'session-delete'

async function rpc(ctx: SessionDeleteCtx, method: string, payload: Record<string, unknown>): Promise<unknown> {
  try {
    const result = await ctx.connection.rpc.call('/width-slider', method, payload)
    if (result && typeof result === 'object' && (result as { ok?: boolean }).ok === true) {
      return (result as { value?: unknown }).value ?? null
    }
    const err = result as { error?: { code?: string; message?: string } } | null
    throw new Error((err?.error?.message as string | undefined) ?? 'RPC error')
  } catch (err) {
    return { __error: err instanceof Error ? err.message : String(err) }
  }
}

/** 当前会话标题集合（client sessions store）。 */
function sessionTitles(ctx: SessionDeleteCtx): string[] {
  try {
    const state = ctx.sessions?.list.getSnapshot()
    const byId = state?.byId ?? {}
    const out = new Set<string>()
    for (const key of Object.keys(byId)) {
      const title = byId[key]?.title
      if (typeof title === 'string' && title.trim() !== '') out.add(title.trim())
    }
    return [...out]
  } catch {
    return []
  }
}

/** 从行解析会话标题：⋯ 按钮 aria-label 与标题集合做"包含-最长匹配"。 */
function resolveRowTitle(row: Element, titles: string[]): string {
  const actionButton = Array.from(row.querySelectorAll('button')).find((b) =>
    b.getAttribute('aria-label') !== null && b.getAttribute(BTN_ATTR) === null)
  const aria = actionButton?.getAttribute('aria-label') ?? ''
  let best = ''
  if (aria !== '') {
    for (const title of titles) {
      if (title.length > best.length && aria.includes(title)) best = title
    }
  }
  if (best !== '') return best
  // 退路：行文本以某标题开头。
  const text = (row.textContent ?? '').trim()
  for (const title of titles) {
    if (title.length > best.length && text.startsWith(title)) best = title
  }
  return best
}

/** 行悬停操作区是否已注入（防重复）。 */
function hasButton(actions: Element): boolean {
  return actions.querySelector('[' + BTN_ATTR + ']') !== null
}

/** 找到行内 ⋯ 按钮所在的 hover 操作容器；无则 null。 */
function actionsHostOf(row: Element): HTMLElement | null {
  const actionBtn = Array.from(row.querySelectorAll('button')).find((b) =>
    b.getAttribute(BTN_ATTR) === null && typeof b.getAttribute('aria-label') === 'string')
  const host = actionBtn?.parentElement
  return host instanceof HTMLElement ? host : null
}

function trashSvg(): string {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>'
}

/** 自绘浮层（mask + 卡片，token 化）。 */
function createOverlay(inner: HTMLElement): HTMLDivElement {
  const mask = document.createElement('div')
  mask.style.cssText = [
    'position:fixed',
    'inset:0',
    'zIndex:100000',
    'background:var(--dsw-alias-bg-mask-1, rgba(0,0,0,.45))',
    'display:flex',
    'alignItems:center',
    'justifyContent:center',
  ].join(';')
  const card = document.createElement('div')
  card.style.cssText = [
    'width:min(420px, calc(100vw - 48px))',
    'background:var(--dsw-alias-bg-layer-2, #fff)',
    'color:var(--dsw-alias-label-primary, #1a1a1a)',
    'borderRadius:12px',
    'boxShadow:var(--dsw-elevation-prominent, 0 8px 24px rgba(0,0,0,.2))',
    'padding:16px',
    'fontSize:13px',
    'lineHeight:20px',
  ].join(';')
  card.appendChild(inner)
  mask.appendChild(card)
  mask.addEventListener('pointerdown', (e) => { if (e.target === mask) mask.remove() })
  return mask
}

function button(label: string, danger: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  b.style.cssText = [
    'height:28px',
    'padding:0 12px',
    'borderRadius:6px',
    'border:1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))',
    'background:transparent',
    'color:var(--dsw-alias-label-primary, inherit)',
    'cursor:pointer',
    'fontSize:12px',
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
  const heading = document.createElement('div')
  heading.style.fontWeight = '600'
  heading.style.marginBottom = '8px'
  heading.textContent = title
  const body = document.createElement('div')
  body.style.color = 'var(--dsw-alias-label-secondary, #666)'
  body.textContent = message
  let maskRef: HTMLDivElement | null = null
  const close = button(pickText('知道了', 'OK'), false, () => { maskRef?.remove() })
  wrap.appendChild(heading)
  wrap.appendChild(body)
  wrap.appendChild(close)
  maskRef = createOverlay(wrap)
  document.body.appendChild(maskRef)
}

/** 确认浮层：返回 Promise<boolean>。 */
function askConfirm(title: string, detail: string, okText: string): Promise<boolean> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div')
    const heading = document.createElement('div')
    heading.style.fontWeight = '600'
    heading.style.marginBottom = '8px'
    heading.textContent = title
    const body = document.createElement('div')
    body.style.color = 'var(--dsw-alias-label-secondary, #666)'
    body.style.wordBreak = 'break-all'
    body.textContent = detail
    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px'
    const cancel = button(pickText('取消', 'Cancel'), false, () => { mask.remove(); resolve(false) })
    const ok = button(okText, true, () => { mask.remove(); resolve(true) })
    actions.appendChild(cancel)
    actions.appendChild(ok)
    wrap.appendChild(heading)
    wrap.appendChild(body)
    wrap.appendChild(actions)
    const mask = createOverlay(wrap)
    document.body.appendChild(mask)
  })
}

/** 候选选择浮层：返回选中的 id 或 null。 */
function askPickCandidate(candidates: Candidate[], title: string): Promise<string | null> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div')
    const heading = document.createElement('div')
    heading.style.fontWeight = '600'
    heading.style.marginBottom = '6px'
    heading.textContent = pickText('存在多个同名会话，选择要删除的：', 'Multiple sessions share this title; pick one to delete:')
    const sub = document.createElement('div')
    sub.style.color = 'var(--dsw-alias-label-caption, #888)'
    sub.style.marginBottom = '8px'
    sub.textContent = '「' + title + '」'
    const list = document.createElement('div')
    list.style.cssText = 'display:flex;flex-direction:column;gap:4px;maxHeight:220px;overflowY:auto'
    for (const c of candidates) {
      const item = document.createElement('button')
      item.type = 'button'
      const when = c.updatedAt !== null && c.updatedAt > 0
        ? new Date(c.updatedAt).toLocaleString()
        : pickText('时间未知', 'time unknown')
      item.textContent = c.title ?? c.id + ' · ' + when
      item.style.cssText = [
        'textAlign:left',
        'padding:6px 10px',
        'borderRadius:6px',
        'border:1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1))',
        'background:transparent',
        'color:var(--dsw-alias-label-primary, inherit)',
        'cursor:pointer',
        'fontSize:12px',
      ].join(';')
      item.addEventListener('mouseenter', () => { item.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12))' })
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent' })
      item.addEventListener('click', () => { mask.remove(); resolve(c.id) })
      list.appendChild(item)
    }
    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;justify-content:flex-end;margin-top:10px'
    const cancel = button(pickText('取消', 'Cancel'), false, () => { mask.remove(); resolve(null) })
    actions.appendChild(cancel)
    wrap.appendChild(heading)
    wrap.appendChild(sub)
    wrap.appendChild(list)
    wrap.appendChild(actions)
    const mask = createOverlay(wrap)
    document.body.appendChild(mask)
  })
}

/** 点击删除主流程。 */
async function runDeleteFlow(ctx: SessionDeleteCtx, row: Element): Promise<void> {
  const titles = sessionTitles(ctx)
  const title = resolveRowTitle(row, titles)
  if (title === '') {
    showNotice(pickText('无法删除', 'Cannot delete'),
      pickText('未能定位该会话（标题解析失败），请稍后重试。', 'Could not identify this session; try again.'))
    return
  }
  const candidatesRes = await rpc(ctx, 'sessionListCandidates', { title })
  if (candidatesRes && typeof candidatesRes === 'object' && '__error' in candidatesRes) {
    showNotice(pickText('无法删除', 'Cannot delete'), String((candidatesRes as { __error: string }).__error))
    return
  }
  const candidates = ((candidatesRes as { candidates?: unknown } | null)?.candidates ?? []) as Candidate[]
  if (candidates.length === 0) {
    showNotice(pickText('无法删除', 'Cannot delete'),
      pickText('没有找到名为「' + title + '」的会话（可能已被归档）。', 'No session titled "' + title + '" found.'))
    return
  }
  let targetId: string | null
  if (candidates.length === 1) targetId = candidates[0].id
  else targetId = await askPickCandidate(candidates, title)
  if (targetId === null) return
  const confirmed = await askConfirm(
    pickText('删除会话', 'Delete session'),
    pickText('确定永久删除会话「' + title + '」？此操作会删除该会话的全部记录与数据，无法恢复。', 'Permanently delete "' + title + '"? All its records and data will be removed and cannot be restored.'),
    pickText('永久删除', 'Delete permanently'),
  )
  if (!confirmed) return
  const delRes = await rpc(ctx, 'sessionDelete', { id: targetId })
  if (delRes && typeof delRes === 'object' && '__error' in delRes) {
    showNotice(pickText('删除失败', 'Delete failed'), String((delRes as { __error: string }).__error))
  }
  // 成功：官方列表经 store 订阅自动移除，无需手动刷新。
}

/** 扫描并给新出现的会话行注入删除按钮（rAF 节流）。 */
function scanAndInject(ctx: SessionDeleteCtx): void {
  if (typeof document === 'undefined') return
  const titles = sessionTitles(ctx)
  const rows = Array.from(document.querySelectorAll('[role="treeitem"]'))
  for (const row of rows) {
    if (!(row instanceof HTMLElement)) continue
    const title = resolveRowTitle(row, titles)
    if (title === '') continue // 非会话行（项目行等）
    const actions = actionsHostOf(row)
    if (!actions || hasButton(actions)) continue
    const del = document.createElement('button')
    del.type = 'button'
    del.setAttribute(BTN_ATTR, '')
    del.title = pickText('删除会话', 'Delete session')
    del.setAttribute('aria-label', pickText('删除会话', 'Delete session'))
    del.innerHTML = trashSvg()
    del.style.cssText = [
      'display:inline-flex',
      'alignItems:center',
      'justifyContent:center',
      'width:24px',
      'height:24px',
      'padding:0',
      'border:none',
      'borderRadius:4px',
      'background:transparent',
      'color:var(--dsw-alias-label-tertiary, #999)',
      'cursor:pointer',
      'opacity:.55',
      'transition:opacity .15s ease, color .15s ease',
      'flexShrink:0',
    ].join(';')
    del.addEventListener('mouseenter', () => {
      del.style.opacity = '1'
      del.style.color = 'var(--dsw-alias-state-error-primary, #e5484d)'
    })
    del.addEventListener('mouseleave', () => {
      del.style.opacity = '.55'
      del.style.color = ''
    })
    del.addEventListener('click', (e) => {
      e.stopPropagation()
      void runDeleteFlow(ctx, row)
    })
    actions.insertBefore(del, actions.firstChild)
  }
}

/** 安装会话删除补丁；返回 disposer。 */
export function installSessionDelete(ctx: SessionDeleteCtx): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  scanAndInject(ctx)
  let rafId = 0
  const schedule = () => {
    if (rafId !== 0) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      scanAndInject(ctx)
    })
  }
  const observer = new MutationObserver(() => schedule())
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    if (rafId !== 0) cancelAnimationFrame(rafId)
    // 清除已注入的按钮（行可能仍在 DOM）。
    document.querySelectorAll('[' + BTN_ATTR + ']').forEach((el) => el.remove())
  }
}

export { BTN_ID }
