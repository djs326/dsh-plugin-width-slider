/**
 * settingsPanelPatch.ts — 官方设置面板 UI 补丁。
 *
 * 目标 DOM（@deepseek-ai/dsh-client-ui-settings-general，类名 hash 不稳定，
 * 因此全部按语义锚点探测，探测失败安静跳过）：
 *
 *   div.panel[role="dialog"][aria-modal="true"]
 *     ├── nav（设置左侧导航列）
 *     │   ├── div.navTitle（标题，settings.header）
 *     │   └── div.navList（tab 列表 —— 首个含多个 button 的 div 子元素）
 *     └── div.content > div.header / div.options（右侧内容）
 *
 * 功能：
 * - navScroll：navList 超高时出现纵向滚动；
 * - dialogWindow：把官方设置弹窗变成"可拖拽窗口"——右下角把手拖宽高、
 *   顶部 header 空白处拖动移动弹窗、双击把手复位 800x800 居中；尺寸与
 *   位置记忆（localStorage 键 dsh.conversation.settingsPanelWindow，兼容
 *   迁移旧宽度键）。实现：弹窗改 position:absolute 于全屏 overlay 内定位
 *   （官方原为 flex 居中，切 absolute 后手动维护 left/top）。
 *
 * 设置面板每次开关都会重新挂载弹窗 DOM（React unmount/mount），因此两个
 * 补丁都用 body 级 MutationObserver 探测 dialog 出现后即时 patch；已 patch
 * 过的元素用 WeakSet 记录防重复。回调经 requestAnimationFrame 合并。面板
 * 关闭后 DOM 销毁，内联样式随元素一并消失；开关关闭时 disposer 完整还原
 * （含清 WeakSet，同一弹窗再次开启开关可立即重新 patch）。
 */

// ── 常量 ─────────────────────────────────────────────────────────────

import { pickText } from './lang.ts'

const DIALOG_SELECTOR = 'div[role="dialog"][aria-modal="true"]'
const RECT_KEY = 'dsh.conversation.settingsPanelWindow'
const LEGACY_WIDTH_KEY = 'dsh.conversation.settingsPanelWidth'
const RESIZE_HANDLE_ATTR = 'data-width-slider-resize-handle'
const MIN_W = 640
const MIN_H = 560
const DEFAULT_W = 800
const DEFAULT_H = 800
const VIEWPORT_EDGE = 16

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
  navList.style.flex = '1 1 auto'
  navList.style.minHeight = '0'
  navList.style.overflowY = 'auto'
  navList.style.paddingRight = '6px'
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
    for (const navList of patchedNavListEls) {
      navList.style.flex = ''
      navList.style.minHeight = ''
      navList.style.overflowY = ''
      navList.style.paddingRight = ''
      const nav = navList.parentElement
      if (nav) nav.style.minHeight = ''
      patchedNavLists.delete(navList)
    }
    patchedNavListEls.clear()
  }
}

// ── 补丁 2：设置弹窗窗口化（dialogWindow：宽高可拖 + 可移动）────────

/** 窗口矩形记忆：w/h 尺寸，left/top 相对视口（absolute 于全屏 overlay）。 */
interface DialogRect {
  w: number
  h: number
  left: number
  top: number
}

function readDialogRect(): DialogRect | null {
  try {
    const raw = localStorage.getItem(RECT_KEY)
    if (raw !== null) {
      const o = JSON.parse(raw) as Record<string, unknown>
      if (typeof o.w === 'number' && typeof o.h === 'number' && typeof o.left === 'number' && typeof o.top === 'number') {
        return { w: o.w, h: o.h, left: o.left, top: o.top }
      }
    }
  } catch { /* 忽略 */ }
  // 兼容旧"仅宽度"记忆（0.3.0 键）：取宽度，位置居中由调用方换算。
  try {
    const legacy = localStorage.getItem(LEGACY_WIDTH_KEY)
    if (legacy !== null) {
      const w = Number(legacy)
      if (Number.isFinite(w) && w >= MIN_W) return { w: Math.round(w), h: DEFAULT_H, left: NaN, top: NaN }
    }
  } catch { /* 忽略 */ }
  return null
}

function persistDialogRect(rect: DialogRect): void {
  try {
    localStorage.setItem(RECT_KEY, JSON.stringify(rect))
    localStorage.removeItem(LEGACY_WIDTH_KEY)
  } catch { /* quota */ }
}

function clearDialogRect(): void {
  try {
    localStorage.removeItem(RECT_KEY)
    localStorage.removeItem(LEGACY_WIDTH_KEY)
  } catch { /* ignore */ }
}

/** 尺寸 clamp（宽高各留视口边距）。 */
function clampSize(w: number, h: number, vw: number, vh: number): { w: number; h: number } {
  return {
    w: Math.min(Math.max(MIN_W, Math.round(w)), Math.max(MIN_W, vw - VIEWPORT_EDGE * 2)),
    h: Math.min(Math.max(MIN_H, Math.round(h)), Math.max(MIN_H, vh - VIEWPORT_EDGE * 2)),
  }
}

/** 位置 clamp：保持弹窗主体在视口内。 */
function clampPos(left: number, top: number, w: number, h: number, vw: number, vh: number): { left: number; top: number } {
  const maxLeft = Math.max(VIEWPORT_EDGE, vw - w - VIEWPORT_EDGE)
  const maxTop = Math.max(VIEWPORT_EDGE, vh - h - VIEWPORT_EDGE)
  return {
    left: Math.min(Math.max(VIEWPORT_EDGE, Math.round(left)), maxLeft),
    top: Math.min(Math.max(VIEWPORT_EDGE, Math.round(top)), maxTop),
  }
}

function applyRectToDialog(dialog: HTMLElement, rect: DialogRect): void {
  dialog.style.width = rect.w + 'px'
  dialog.style.height = rect.h + 'px'
  dialog.style.left = rect.left + 'px'
  dialog.style.top = rect.top + 'px'
}

/** 取 dialog 当前视口矩形。 */
function currentRectOf(dialog: HTMLElement): { left: number; top: number; w: number; h: number } {
  const r = dialog.getBoundingClientRect()
  return { left: r.left, top: r.top, w: dialog.offsetWidth, h: dialog.offsetHeight }
}

/** 把 dialog 从 overlay 的 flex 居中切换为 absolute 定位，返回当前（居中）位置。 */
function makeDialogDraggable(dialog: HTMLElement): { left: number; top: number } {
  const cur = currentRectOf(dialog)
  dialog.style.position = 'absolute'
  dialog.style.margin = '0'
  return { left: Math.round(cur.left), top: Math.round(cur.top) }
}

// ── 拖拽期间锁定 body 文本选择；带兜底恢复 ───────────────────────────

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

/** 命中交互元素（按钮/链接/表单等）时不当作拖动起点。 */
function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element &&
    target.closest('button, a, input, select, textarea, label, [role="button"], [contenteditable]') !== null
}

/** 右下角把手图标（用户选定样式 B：双层实心三角）。 */
const GRIP_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
  '<path d="M15 15H9.5L15 9.5V15z"/>' +
  '<path d="M15 4.5L4.5 15H.5L15 .5v4z"/>' +
  '</svg>'

/** 当前 dialog 定位（left/top，属性未设时回退计算）。 */
function currentPosOf(dialog: HTMLElement): { left: number; top: number } {
  const left = parseFloat(dialog.style.left || '')
  const top = parseFloat(dialog.style.top || '')
  if (Number.isFinite(left) && Number.isFinite(top)) return { left: Math.round(left), top: Math.round(top) }
  const r = currentRectOf(dialog)
  return { left: Math.round(r.left), top: Math.round(r.top) }
}

/** 创建右下角缩放把手（拖宽高）；返回元素。 */
function buildResizeHandle(dialog: HTMLElement): HTMLElement {
  const handle = document.createElement('div')
  handle.setAttribute(RESIZE_HANDLE_ATTR, '')
  handle.title = pickText('拖动调整弹窗大小，双击复位居中', 'Drag to resize the dialog; double-click to reset and center')
  handle.style.cssText = [
    'position:absolute',
    'right:2px',
    'bottom:2px',
    'width:22px',
    'height:22px',
    'cursor:nwse-resize',
    'display:flex',
    'align-items:flex-end',
    'justify-content:flex-end',
    'color:var(--dsw-alias-label-caption, rgba(128,128,128,.7))',
    'transition:color .15s ease',
    'zIndex:12',
  ].join(';')
  handle.innerHTML = GRIP_SVG
  handle.addEventListener('mouseenter', () => {
    handle.style.color = 'var(--dsw-alias-state-business-primary, #4f9eff)'
  })
  handle.addEventListener('mouseleave', () => {
    handle.style.color = ''
  })
  handle.addEventListener('dblclick', (event) => {
    event.stopPropagation()
    const rect: DialogRect = {
      w: DEFAULT_W,
      h: DEFAULT_H,
      left: Math.round((window.innerWidth - DEFAULT_W) / 2),
      top: Math.round((window.innerHeight - DEFAULT_H) / 2),
    }
    applyRectToDialog(dialog, rect)
    clearDialogRect()
  })

  let drag: { startX: number; startY: number; startW: number; startH: number } | null = null
  const endDrag = (): void => {
    drag = null
    restoreBodyUserSelect()
  }
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    drag = {
      startX: event.clientX,
      startY: event.clientY,
      startW: dialog.offsetWidth,
      startH: dialog.offsetHeight,
    }
    handle.setPointerCapture(event.pointerId)
    lockBodyUserSelect()
  })
  handle.addEventListener('pointermove', (event) => {
    if (!drag) return
    const size = clampSize(
      drag.startW + (event.clientX - drag.startX),
      drag.startH + (event.clientY - drag.startY),
      window.innerWidth,
      window.innerHeight,
    )
    dialog.style.width = size.w + 'px'
    dialog.style.height = size.h + 'px'
  })
  handle.addEventListener('pointerup', (event) => {
    if (!drag) return
    const size = clampSize(
      drag.startW + (event.clientX - drag.startX),
      drag.startH + (event.clientY - drag.startY),
      window.innerWidth,
      window.innerHeight,
    )
    persistDialogRect({ w: size.w, h: size.h, ...currentPosOf(dialog) })
    endDrag()
    try {
      handle.releasePointerCapture(event.pointerId)
    } catch { /* ignore */ }
  })
  handle.addEventListener('pointercancel', endDrag)
  handle.addEventListener('lostpointercapture', endDrag)
  return handle
}

/** 绑定 header 空白区拖动移动弹窗；返回解绑函数。 */
function attachMoveBar(dialog: HTMLElement): () => void {
  const nav = dialog.querySelector(':scope > nav')
  const content = nav?.nextElementSibling
  const header = content instanceof HTMLElement && content.firstElementChild instanceof HTMLElement
    ? content.firstElementChild
    : null
  if (!header) return () => {}
  header.style.cursor = 'move'
  let drag: { startX: number; startY: number; baseLeft: number; baseTop: number } | null = null
  const onDown = (event: PointerEvent): void => {
    if (isInteractiveTarget(event.target)) return
    if (event.button !== 0) return
    event.preventDefault()
    const pos = currentPosOf(dialog)
    drag = { startX: event.clientX, startY: event.clientY, baseLeft: pos.left, baseTop: pos.top }
    header.setPointerCapture(event.pointerId)
    lockBodyUserSelect()
  }
  const onMove = (event: PointerEvent): void => {
    if (!drag) return
    const pos = clampPos(
      drag.baseLeft + (event.clientX - drag.startX),
      drag.baseTop + (event.clientY - drag.startY),
      dialog.offsetWidth,
      dialog.offsetHeight,
      window.innerWidth,
      window.innerHeight,
    )
    dialog.style.left = pos.left + 'px'
    dialog.style.top = pos.top + 'px'
  }
  const onUp = (event: PointerEvent): void => {
    if (!drag) return
    persistDialogRect({ w: dialog.offsetWidth, h: dialog.offsetHeight, ...currentPosOf(dialog) })
    drag = null
    restoreBodyUserSelect()
    try {
      header.releasePointerCapture(event.pointerId)
    } catch { /* ignore */ }
  }
  const end = (): void => {
    drag = null
    restoreBodyUserSelect()
  }
  header.addEventListener('pointerdown', onDown)
  header.addEventListener('pointermove', onMove)
  header.addEventListener('pointerup', onUp)
  header.addEventListener('pointercancel', end)
  header.addEventListener('lostpointercapture', end)
  return () => {
    header.style.cursor = ''
    header.removeEventListener('pointerdown', onDown)
    header.removeEventListener('pointermove', onMove)
    header.removeEventListener('pointerup', onUp)
    header.removeEventListener('pointercancel', end)
    header.removeEventListener('lostpointercapture', end)
  }
}

const patchedDialogs = new WeakSet<HTMLElement>()
/** 最近一次 patch 的弹窗及其清理句柄（供开关关闭时完整还原）。 */
let activePatch: { dialog: HTMLElement; unbindMove: () => void } | null = null

function applyDialogWindowPatch(dialog: HTMLElement): void {
  if (dialog.querySelector('[' + RESIZE_HANDLE_ATTR + ']') !== null) return
  // 1) 切 absolute 并保持当前（官方居中）位置。
  const pos = makeDialogDraggable(dialog)
  dialog.style.left = pos.left + 'px'
  dialog.style.top = pos.top + 'px'
  // 2) 恢复记忆（尺寸/位置；旧宽度键迁移时位置取居中）。
  const stored = readDialogRect()
  if (stored !== null) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const size = clampSize(stored.w, stored.h, vw, vh)
    const left = Number.isFinite(stored.left) ? stored.left : Math.round((vw - size.w) / 2)
    const top = Number.isFinite(stored.top) ? stored.top : Math.round((vh - size.h) / 2)
    const pos2 = clampPos(left, top, size.w, size.h, vw, vh)
    applyRectToDialog(dialog, { w: size.w, h: size.h, left: pos2.left, top: pos2.top })
  }
  // 3) 挂右下把手 + 顶部移动区。
  dialog.appendChild(buildResizeHandle(dialog))
  const unbindMove = attachMoveBar(dialog)
  activePatch = { dialog, unbindMove }
}

function probeAndPatchDialog(): void {
  if (typeof document === 'undefined') return
  const dialog = findSettingsDialog()
  if (!dialog || patchedDialogs.has(dialog)) return
  patchedDialogs.add(dialog)
  applyDialogWindowPatch(dialog)
}

/** 安装弹窗窗口化补丁（body 观察器跟随面板开合）；返回 disposer。 */
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
    // 关闭即时可逆：摘把手/解绑移动/还原官方尺寸与居中/清记忆并重置 WeakSet，
    // 同一弹窗再次开启开关可立即重新 patch。
    const patch = activePatch
    activePatch = null
    if (patch && patch.dialog.isConnected) {
      const dialog = patch.dialog
      patch.unbindMove()
      dialog.querySelector('[' + RESIZE_HANDLE_ATTR + ']')?.remove()
      dialog.style.width = ''
      dialog.style.height = ''
      dialog.style.left = ''
      dialog.style.top = ''
      dialog.style.position = ''
      dialog.style.margin = ''
      patchedDialogs.delete(dialog)
    }
    clearDialogRect()
  }
}
