/**
 * domContract.ts — 官方工作区标题行 / 组头行的定位契约（批次⑥ 自
 * workspaceTabs.tsx 原样搬出）。
 *
 * 本文件只回答「哪个节点是标题行、这一行的 workspaceId 是什么」，不做隐藏、不做
 * 注入；两处中英文硬编码数组（LABEL_WORDS / SEARCH_PLACEHOLDERS）是宿主文案，
 * 随宿主升级而失效，失效表现为 fail-closed：找不到就不动 DOM，不崩溃。
 */

// ── 官方标题行定位与隐藏 ────────────────────────────────────────────────
const LABEL_WORDS = ['工作区', '会话', 'Workspaces', 'Sessions']
const SEARCH_PLACEHOLDERS = ['搜索会话', 'Search sessions']

function isLabelNode(el: Element): boolean {
  const text = (el.textContent || '').trim()
  return LABEL_WORDS.some((w) => text === w) && el.children.length === 0
}

export function locateHeader(host: Element): { row: HTMLElement; label: HTMLElement } | null {
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

/** 正在打开 ⋯ 菜单的工作区行（官方组头行，含 menuOpen）。 */
export function findOpenProjectRow(): HTMLElement | null {
  const rows = document.querySelectorAll<HTMLElement>('[class*=projectRow]')
  for (const row of rows) {
    if (row.className.indexOf('menuOpen') >= 0) return row
  }
  return null
}

/** 从行 React fiber 直读官方 group 节点里的 workspaceId（不按标题反查）。 */
export function workspaceInfoFromRow(row: HTMLElement): { workspaceId: string | null; title: string } {
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
