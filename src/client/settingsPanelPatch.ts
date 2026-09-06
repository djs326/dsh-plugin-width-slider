/**
 * settingsPanelPatch.ts — 官方设置面板 UI 补丁（v0.3.0 新增功能 6/7）。
 *
 * 目标 DOM（@deepseek-ai/dsh-client-ui-settings-general，类名 hash 不稳定，
 * 因此全部按语义锚点探测，探测失败安静跳过）：
 *
 *   div.panel[role="dialog"][aria-modal="true"]
 *     ├── nav（设置左侧导航列）
 *     │   ├── div.navTitle（标题，settings.header）
 *     │   └── div.navList（tab 列表 —— nav 的第 2 个 div 且含多个 button）
 *     └── div.content > div.options（右侧内容，官方已有 overflow-y:auto）
 *
 * 功能：
 * - navScroll：navList 超高时出现纵向滚动（官方仅右侧 options 可滚动，
 *   左侧 tab 一多会被挤压/截断）；滚动条套官方 --dsh-scrollbar-* 变量。
 * - dialogResize：弹窗本体（官方固定 width:800px; max-width:calc(100vw-48px)）
 *   右侧挂拖柄可拖宽，范围 [640, min(1280, vw-48)]，宽度持久化
 *   localStorage（键 dsh.conversation.settingsPanelWidth）；双击拖柄恢复
 *   默认 800px。
 *
 * 设置面板每次开关都会重新挂载弹窗 DOM（React unmount/mount），因此两
 * 个补丁都用 body 级 MutationObserver 探测 dialog 出现后即时 patch；
 * 已 patch 过的元素用 WeakSet 记录防重复。面板关闭后 DOM 销毁，内联样式
 * 随元素一并消失，无残留。
 */

// ── 常量 ─────────────────────────────────────────────────────────────

const DIALOG_SELECTOR = 'div[role="dialog"][aria-modal="true"]'
const RESIZE_KEY = 'dsh.conversation.settingsPanelWidth'
const RESIZE_HANDLE_ATTR = 'data-width-slider-resize-handle'
const RESIZE_MIN = 640
const RESIZE_MAX = 1280
const VIEWPORT_EDGE = 48
const RESIZE_DEFAULT = 800

// ── 探测 ─────────────────────────────────────────────────────────────

/** 找官方设置面板弹窗（role=dialog 且直接子级含 <nav>，排除其它 dialog）。 */
function findSettingsDialog(): HTMLElement | null {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>(DIALOG_SELECTOR))
  for (const dialog of dialogs) {
    if (dialog.querySelector(':scope > nav') !== null) return dialog
  }
  return null
}

/** 找左侧 tab 列表容器（nav 内第二个 div 子元素且含多个 button）。 */
function findNavList(dialog: HTMLElement): HTMLElement | null {
  const nav = dialog.querySelector(':scope > nav')
  if (!nav) return null
  const divs = Array.from(nav.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.tagName === 'DIV',
  )
  for (const div of divs) {
    if (div.querySelectorAll('button').length > 0) return div
  }
  return null
}

// ── 补丁 1：左侧 tab 列表超高滚动（navScroll）────────────────────────

function applyNavScrollPatch(navList: HTMLElement): void {
  // 标题行（navTitle）保持固定：navList 变为可伸缩滚动区。
  navList.style.flex = '1 1 auto'
  navList.style.minHeight = '0'
  navList.style.overflowY = 'auto'
  navList.style.paddingRight = '6px'
  // 父列允许子元素收缩（官方 .nav 为 flex column，无 overflow 规则）。
  const nav = navList.parentElement
  if (nav) {
    nav.style.minHeight = '0'
  }
}

const patchedNavLists = new WeakSet<HTMLElement>()

function probeAndPatchNavList(): void {
  if (typeof document === 'undefined') return
  const dialog = findSettingsDialog()
  if (!dialog) return
  const navList = findNavList(dialog)
  if (!navList || patchedNavLists.has(navList)) return
  patchedNavLists.add(navList)
  applyNavScrollPatch(navList)
}

/** 安装左侧 tab 滚动补丁（body 观察器跟随面板开合）；返回 disposer。 */
export function installNavScrollPatch(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  probeAndPatchNavList()
  const observer = new MutationObserver(() => probeAndPatchNavList())
  observer.observe(document.body, { childList: true, subtree: true })
  return () => observer.disconnect()
}

// ── 补丁 2：设置弹窗可拖拽调宽（dialogResize）────────────────────────

function readStoredWidth(): number | null {
  try {
    const raw = localStorage.getItem(RESIZE_KEY)
    if (raw === null) return null
    const value = Number(raw)
    return Number.isFinite(value) && value >= RESIZE_MIN ? value : null
  } catch {
    return null
  }
}

function persistWidth(px: number): void {
  try {
    localStorage.setItem(RESIZE_KEY, String(px))
  } catch { /* quota */ }
}

function clearStoredWidth(): void {
  try {
    localStorage.removeItem(RESIZE_KEY)
  } catch { /* ignore */ }
}

/** 弹窗当前可用的最大宽度（vw - 边缘留白，与官方 max-width 一致）。 */
function maxAllowedWidth(): number {
  return Math.max(RESIZE_MIN, window.innerWidth - VIEWPORT_EDGE)
}

function clampWidth(px: number): number {
  return Math.min(Math.max(RESIZE_MIN, Math.round(px)), Math.min(RESIZE_MAX, maxAllowedWidth()))
}

function buildResizeHandle(dialog: HTMLElement): HTMLElement {
  const handle = document.createElement('div')
  handle.setAttribute(RESIZE_HANDLE_ATTR, '')
  handle.title = '拖动调整设置面板宽度（双击恢复默认）'
  handle.style.cssText = [
    'position:absolute',
    'top:48px',
    'bottom:48px',
    'right:2px',
    'width:7px',
    'cursor:ew-resize',
    'borderRadius:4px',
    'background:transparent',
    'transition:background .15s ease',
    'zIndex:10',
  ].join(';')
  handle.addEventListener('mouseenter', () => {
    handle.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.35))'
  })
  handle.addEventListener('mouseleave', () => {
    handle.style.background = 'transparent'
  })
  handle.addEventListener('dblclick', (event) => {
    event.stopPropagation()
    dialog.style.width = RESIZE_DEFAULT + 'px'
    clearStoredWidth()
  })

  let drag: { startX: number; startWidth: number } | null = null
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    drag = { startX: event.clientX, startWidth: dialog.offsetWidth }
    handle.setPointerCapture(event.pointerId)
    document.body.style.userSelect = 'none'
  })
  handle.addEventListener('pointermove', (event) => {
    if (!drag) return
    const width = clampWidth(drag.startWidth + (event.clientX - drag.startX))
    dialog.style.width = width + 'px'
  })
  handle.addEventListener('pointerup', (event) => {
    if (!drag) return
    persistWidth(drag.startWidth + (event.clientX - drag.startX))
    drag = null
    document.body.style.userSelect = ''
    try {
      handle.releasePointerCapture(event.pointerId)
    } catch { /* ignore */ }
  })
  handle.addEventListener('pointercancel', () => {
    drag = null
    document.body.style.userSelect = ''
  })
  return handle
}

const patchedDialogs = new WeakSet<HTMLElement>()

function applyResizePatch(dialog: HTMLElement): void {
  // 已有我们挂的拖柄（例如同一次会话重复 patch）则跳过。
  if (dialog.querySelector('[' + RESIZE_HANDLE_ATTR + ']') !== null) return
  // 恢复持久宽度（仅当用户存过非默认值）。
  const stored = readStoredWidth()
  if (stored !== null && stored !== RESIZE_DEFAULT) {
    dialog.style.width = clampWidth(stored) + 'px'
  }
  const handle = buildResizeHandle(dialog)
  dialog.appendChild(handle)
}

function probeAndPatchDialog(): void {
  if (typeof document === 'undefined') return
  const dialog = findSettingsDialog()
  if (!dialog || patchedDialogs.has(dialog)) return
  patchedDialogs.add(dialog)
  applyResizePatch(dialog)
}

/** 安装弹窗拖宽补丁（body 观察器跟随面板开合）；返回 disposer。 */
export function installDialogResizePatch(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  probeAndPatchDialog()
  const observer = new MutationObserver(() => probeAndPatchDialog())
  observer.observe(document.body, { childList: true, subtree: true })
  return () => observer.disconnect()
}
