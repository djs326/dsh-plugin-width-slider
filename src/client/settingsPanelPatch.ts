/**
 * settingsPanelPatch.ts — 官方设置面板 UI 补丁（v0.3.0 新增功能 6/7）。
 *
 * 目标 DOM（@deepseek-ai/dsh-client-ui-settings-general，类名 hash 不稳定，
 * 因此全部按语义锚点探测，探测失败安静跳过）：
 *
 *   div.panel[role="dialog"][aria-modal="true"]
 *     ├── nav（设置左侧导航列）
 *     │   ├── div.navTitle（标题，settings.header）
 *     │   └── div.navList（tab 列表 —— 首个含多个 button 的 div 子元素）
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
 * 设置面板每次开关都会重新挂载弹窗 DOM（React unmount/mount），因此两个
 * 补丁都用 body 级 MutationObserver 探测 dialog 出现后即时 patch；已 patch
 * 过的元素用 WeakSet 记录防重复。回调经 requestAnimationFrame 合并（一个
 * 帧内多次 DOM 变更只 probe 一次）。面板关闭后 DOM 销毁，内联样式随元素
 * 一并消失，无残留。
 */

// ── 常量 ─────────────────────────────────────────────────────────────

import { pickText } from './lang.ts'

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

/**
 * 找左侧 tab 列表容器：nav 下首个含 button 的 div（= navList）。
 * 官方结构 navTitle（无 button）在前、navList（多个 navCell button）在后；
 * 用"含 button"判定比固定索引更抗标题区变化。
 */
function findNavList(dialog: HTMLElement): HTMLElement | null {
  const nav = dialog.querySelector(':scope > nav')
  if (!nav) return null
  for (const child of Array.from(nav.children)) {
    if (child instanceof HTMLElement && child.tagName === 'DIV' && child.querySelectorAll('button').length > 0) {
      return child
    }
  }
  return null
}

/** rAF 合并的 observer 回调包装：一帧内多次变更只跑一次 probe。 */
function debouncedProbe(probe: () => void): { schedule: () => void; dispose: () => void } {
  let rafId = 0
  const schedule = (): void => {
    if (rafId !== 0) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      probe()
    })
  }
  const dispose = (): void => {
    if (rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }
  return { schedule, dispose }
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
/** 已 patch 过的 navList（保留引用，供开关关闭时还原内联样式）。 */
const patchedNavListEls = new Set<HTMLElement>()

function probeAndPatchNavList(): void {
  if (typeof document === 'undefined') return
  const dialog = findSettingsDialog()
  if (!dialog) return
  const navList = findNavList(dialog)
  if (!navList || patchedNavLists.has(navList)) return
  patchedNavLists.add(navList)
  patchedNavListEls.add(navList)
  applyNavScrollPatch(navList)
}

/** 安装左侧 tab 滚动补丁（body 观察器跟随面板开合）；返回 disposer。 */
export function installNavScrollPatch(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  probeAndPatchNavList()
  const probe = debouncedProbe(() => probeAndPatchNavList())
  const observer = new MutationObserver(() => probe.schedule())
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    probe.dispose()
    // 开关关闭/插件卸载：还原已 patch 的 navList 内联样式（关闭即回到官方）。
    for (const navList of patchedNavListEls) {
      navList.style.flex = ''
      navList.style.minHeight = ''
      navList.style.overflowY = ''
      navList.style.paddingRight = ''
      const nav = navList.parentElement
      if (nav) nav.style.minHeight = ''
    }
    patchedNavListEls.clear()
  }
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

// ── 拖拽期间锁定 body 文本选择；带兜底恢复（面板被关/元素移除也还原）──

let bodyUserSelectLocked = false

function lockBodyUserSelect(): void {
  if (bodyUserSelectLocked) return
  document.body.style.userSelect = 'none'
  bodyUserSelectLocked = true
}

function restoreBodyUserSelect(): void {
  if (!bodyUserSelectLocked) return
  document.body.style.userSelect = ''
  bodyUserSelectLocked = false
}

function buildResizeHandle(dialog: HTMLElement): HTMLElement {
  const handle = document.createElement('div')
  handle.setAttribute(RESIZE_HANDLE_ATTR, '')
  handle.title = pickText('拖动调整设置面板宽度（双击恢复默认）', 'Drag to resize the settings panel width (double-click to reset)')
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
  const endDrag = (): void => {
    drag = null
    restoreBodyUserSelect()
  }
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    drag = { startX: event.clientX, startWidth: dialog.offsetWidth }
    handle.setPointerCapture(event.pointerId)
    lockBodyUserSelect()
  })
  handle.addEventListener('pointermove', (event) => {
    if (!drag) return
    dialog.style.width = clampWidth(drag.startWidth + (event.clientX - drag.startX)) + 'px'
  })
  handle.addEventListener('pointerup', (event) => {
    if (!drag) return
    // 持久化与拖动应用同一 clamp 值，避免越界值落盘。
    persistWidth(clampWidth(drag.startWidth + (event.clientX - drag.startX)))
    endDrag()
    try {
      handle.releasePointerCapture(event.pointerId)
    } catch { /* ignore */ }
  })
  handle.addEventListener('pointercancel', endDrag)
  // 兜底：拖拽中面板被关闭/元素被移除时浏览器释放 capture 并触发本事件；
  // 若未触发（元素直接移除），disposer 也会复位 userSelect。
  handle.addEventListener('lostpointercapture', endDrag)
  return handle
}

const patchedDialogs = new WeakSet<HTMLElement>()
/** 最近一次 patch 的 dialog（供开关关闭时摘柄并还原官方宽度）。 */
let activeResizeDialog: HTMLElement | null = null

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
  activeResizeDialog = dialog
  applyResizePatch(dialog)
}

/** 安装弹窗拖宽补丁（body 观察器跟随面板开合）；返回 disposer。 */
export function installDialogResizePatch(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  probeAndPatchDialog()
  const probe = debouncedProbe(() => probeAndPatchDialog())
  const observer = new MutationObserver(() => probe.schedule())
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    probe.dispose()
    restoreBodyUserSelect()
    // 关闭即时可逆：当前仍开着的设置弹窗摘除拖柄、还原官方默认宽度，
    // 并清掉记忆宽度——"关闭=回到官方"（设置弹窗本身就在总控页内操作）。
    const dialog = activeResizeDialog
    activeResizeDialog = null
    if (dialog && dialog.isConnected) {
      dialog.querySelector('[' + RESIZE_HANDLE_ATTR + ']')?.remove()
      dialog.style.width = ''
    }
    clearStoredWidth()
  }
}
