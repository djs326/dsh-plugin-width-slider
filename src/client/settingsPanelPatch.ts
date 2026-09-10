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
 *   顶部 header 空白处拖动移动弹窗、双击把手复位到官方尺寸并居中；尺寸与
 *   位置记忆（localStorage 键 dsh.conversation.settingsPanelWindow，兼容
 *   迁移旧宽度键）。两种模式：没有"用户拖过尺寸"的记忆时是自动模式，
 *   尺寸按官方公式 min(800, 视口-48) 计算，并在窗口尺寸变化时实时重算
 *   （页面变小则弹窗跟着收，页面够大就是官方 800 封顶，只挪位置不打断
 *   自适应）；用户拖过尺寸后进入手动模式，改用记忆值，窗口变化时只做
 *   视口内收敛。全程只改外框 width/height，不缩放内容、不动字号。
 *   实现：弹窗改 position:absolute 于全屏 overlay 内定位
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
import { getSettings, onSettingsChanged } from './config.ts'

const DIALOG_SELECTOR = 'div[role="dialog"][aria-modal="true"]'
const RECT_KEY = 'dsh.conversation.settingsPanelWindow'
const LEGACY_WIDTH_KEY = 'dsh.conversation.settingsPanelWidth'
const RESIZE_HANDLE_ATTR = 'data-width-slider-resize-handle'
/** 手动拖拽的尺寸下限。 */
const MIN_W = 640
const MIN_H = 560
/** 官方弹窗尺寸上限与边距（SettingsRoot.module.css：width 800px / height min(800px, 100vh-48px) / max-width 100vw-48px）。 */
const OFFICIAL_MAX_W = 800
const OFFICIAL_MAX_H = 800
const OFFICIAL_EDGE = 48
/** 位置 clamp 的视口边距（比官方 48 更贴边，允许把窗口挪到角落）。 */
const VIEWPORT_EDGE = 16
/** "弹窗按比例跟随"开启时的视口比例（宽 / 高）。 */
const ADAPTIVE_W_RATIO = 0.62
const ADAPTIVE_H_RATIO = 0.82
/**
 * 弹窗圆角：官方 .panel 是 32px，配 `overflow: hidden` 会把贴角的把手裁掉；
 * 收到 16px（卡片/面板设计系统的常见区间是 16–24px），把手即可完整可见。
 */
const DIALOG_RADIUS = '16px'
/** 把手距右下角的偏移：避开圆角弧线，保证完整可见。 */
const HANDLE_INSET = '6px'

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
  /** true/缺省 = 尺寸仍随视口自适应（用户只挪过位置）；false = 尺寸由用户手动拖定。 */
  auto?: boolean
}

function readDialogRect(): DialogRect | null {
  try {
    const raw = localStorage.getItem(RECT_KEY)
    if (raw !== null) {
      const o = JSON.parse(raw) as Record<string, unknown>
      if (typeof o.w === 'number' && typeof o.h === 'number' && typeof o.left === 'number' && typeof o.top === 'number') {
        return { w: o.w, h: o.h, left: o.left, top: o.top, auto: o.auto !== false }
      }
    }
  } catch { /* 忽略 */ }
  // 兼容旧"仅宽度"记忆（0.3.0 键）：取宽度，位置居中由调用方换算。
  try {
    const legacy = localStorage.getItem(LEGACY_WIDTH_KEY)
    if (legacy !== null) {
      const w = Number(legacy)
      if (Number.isFinite(w) && w >= MIN_W) {
        const vh = typeof window === 'undefined' ? OFFICIAL_MAX_H : window.innerHeight
        return { w: Math.round(w), h: officialSize(w, vh).h, left: NaN, top: NaN, auto: true }
      }
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

/**
 * 官方设置弹窗在给定视口下的尺寸：width 800、height min(800, 视口-48)、
 * max-width 视口-48（与 SettingsRoot.module.css 的三条规则等价）。
 */
function officialSize(vw: number, vh: number): { w: number; h: number } {
  return {
    w: Math.max(1, Math.min(OFFICIAL_MAX_W, vw - OFFICIAL_EDGE)),
    h: Math.max(1, Math.min(OFFICIAL_MAX_H, vh - OFFICIAL_EDGE)),
  }
}

/** 尺寸 clamp（手动模式：不低于下限，不超过官方边距允许的视口内空间）。 */
function clampSize(w: number, h: number, vw: number, vh: number): { w: number; h: number } {
  return {
    w: Math.min(Math.max(MIN_W, Math.round(w)), Math.max(MIN_W, vw - OFFICIAL_EDGE)),
    h: Math.min(Math.max(MIN_H, Math.round(h)), Math.max(MIN_H, vh - OFFICIAL_EDGE)),
  }
}

/** "弹窗按比例跟随"模式下的尺寸：取视口比例，并受拖拽下限与官方边距约束。 */
function adaptiveSize(vw: number, vh: number): { w: number; h: number } {
  return clampSize(vw * ADAPTIVE_W_RATIO, vh * ADAPTIVE_H_RATIO, vw, vh)
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

/** 写 left/top 前确保已切 absolute：否则官方布局的定位会与内联 left/top 叠加。 */
function ensureAbsolute(dialog: HTMLElement): void {
  if (dialog.style.position === 'absolute') return
  makeDialogDraggable(dialog)
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

/** 右下角把手图标（选定样式 5：圆角底 + 两道斜线；底色与线条都取 currentColor，跟随 hover 变色）。 */
const GRIP_SVG =
  '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">' +
  '<rect x="5" y="5" width="17" height="17" rx="4.5" fill="currentColor" opacity="0.18"/>' +
  '<g stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none">' +
  '<line x1="18.5" y1="9.5" x2="9.5" y2="18.5"/>' +
  '<line x1="18.5" y1="14.5" x2="14.5" y2="18.5"/>' +
  '</g></svg>'

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
  handle.title = handleTitle()
  handle.style.cssText = [
    'position:absolute',
    'right:' + HANDLE_INSET,
    'bottom:' + HANDLE_INSET,
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
    // 复位 = 回到官方原样：清手动记忆与内联尺寸/位置，官方居中布局与官方
    // 尺寸重新生效（保留承载把手所需的 position）。
    clearDialogRect()
    dialog.style.width = ''
    dialog.style.height = ''
    dialog.style.left = ''
    dialog.style.top = ''
    dialog.style.margin = ''
    dialog.style.position = ''
    ensureHandleContainer(dialog)
  })

  let drag: { startX: number; startY: number; startW: number; startH: number } | null = null
  const endDrag = (): void => {
    drag = null
    restoreBodyUserSelect()
  }
  handle.addEventListener('pointerdown', (event) => {
    // 按比例跟随时尺寸由窗口决定，拖拽改尺寸无效（位置仍可由标题区拖动）。
    if (getSettings().dialogAdaptive) return
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
    persistDialogRect({ w: size.w, h: size.h, ...currentPosOf(dialog), auto: false })
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
    // 首次拖动前弹窗可能还是官方布局（没有记忆）：先切 absolute 并固定当前
    // 位置，后续位移才有确定的基准。
    if (dialog.style.position !== 'absolute') {
      const cur = makeDialogDraggable(dialog)
      dialog.style.left = cur.left + 'px'
      dialog.style.top = cur.top + 'px'
    }
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
    // 只挪位置不动尺寸：保留原有的"尺寸是否随视口"标记（没拖过尺寸就仍是自动模式）。
    const prev = readDialogRect()
    persistDialogRect({
      w: dialog.offsetWidth,
      h: dialog.offsetHeight,
      ...currentPosOf(dialog),
      auto: prev?.auto !== false,
    })
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

/** 把手 tooltip：按当前模式给出不同的操作指引。 */
function handleTitle(): string {
  return getSettings().dialogAdaptive
    ? pickText('尺寸按窗口比例自适应中（关闭设置里的「弹窗按比例跟随」后可手动调整）', 'Size follows the window ratio (turn that switch off to resize by hand)')
    : pickText('拖动调整弹窗大小，双击复位为官方尺寸与位置', 'Drag to resize the dialog; double-click to reset to the official size and position')
}

/**
 * 解析弹窗当前的尺寸策略，返回应套用的矩形；`null` 表示"保持官方原样"
 * （不动任何内联尺寸与位置，交给官方布局与官方 CSS）。
 *
 * 尺寸优先级：按比例跟随 > 用户拖定的尺寸 > 官方公式；位置沿用记忆，
 * 没有位置记忆时用弹窗当前所在位置（初始即官方居中位置）。
 * @param dialog - 当前弹窗（位置兜底与现状读取）。
 * @param vw - 视口宽。
 * @param vh - 视口高。
 * @returns 目标矩形，或 null 表示交给官方。
 */
function resolveDialogRect(dialog: HTMLElement, vw: number, vh: number): DialogRect | null {
  const adaptive = getSettings().dialogAdaptive
  const stored = readDialogRect()
  if (!adaptive && stored === null) return null
  const hasPos = stored !== null && Number.isFinite(stored.left) && Number.isFinite(stored.top)
  const cur = currentPosOf(dialog)
  const left = hasPos ? (stored as DialogRect).left : cur.left
  const top = hasPos ? (stored as DialogRect).top : cur.top
  const size = adaptive
    ? adaptiveSize(vw, vh)
    : stored !== null && stored.auto === false
      ? clampSize(stored.w, stored.h, vw, vh)
      : officialSize(vw, vh)
  const pos = clampPos(left, top, size.w, size.h, vw, vh)
  return { w: size.w, h: size.h, left: pos.left, top: pos.top }
}

/** 把当前策略套用到弹窗；"交给官方"时清除内联尺寸与位置并保留把手容器。 */
function applyResolvedRect(dialog: HTMLElement): void {
  const rect = resolveDialogRect(dialog, window.innerWidth, window.innerHeight)
  if (rect === null) {
    dialog.style.width = ''
    dialog.style.height = ''
    dialog.style.left = ''
    dialog.style.top = ''
    dialog.style.margin = ''
    dialog.style.position = ''
    ensureHandleContainer(dialog)
    return
  }
  ensureAbsolute(dialog)
  applyRectToDialog(dialog, rect)
}

/** 配置变化（例如切换「弹窗按比例跟随」）时重新套用策略并刷新把手提示。 */
function reapplyDialogRect(): void {
  const dialog = activePatch?.dialog
  if (!dialog || !dialog.isConnected) return
  applyResolvedRect(dialog)
  const handle = dialog.querySelector<HTMLElement>('[' + RESIZE_HANDLE_ATTR + ']')
  if (handle !== null) handle.title = handleTitle()
}

const patchedDialogs = new WeakSet<HTMLElement>()
/** 最近一次 patch 的弹窗及其清理句柄（供开关关闭时完整还原）。 */
let activePatch: { dialog: HTMLElement; unbindMove: () => void } | null = null

/** 官方布局本身可能不是定位元素；补 relative 让右下把手能相对弹窗绝对定位。 */
function ensureHandleContainer(dialog: HTMLElement): void {
  if (getComputedStyle(dialog).position === 'static') dialog.style.position = 'relative'
}

function applyDialogWindowPatch(dialog: HTMLElement): void {
  if (dialog.querySelector('[' + RESIZE_HANDLE_ATTR + ']') !== null) return
  // 官方 .panel 的 32px 圆角配 overflow:hidden 会裁掉贴角的把手，收到 16px。
  dialog.style.borderRadius = DIALOG_RADIUS
  applyResolvedRect(dialog)
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

/**
 * 视口尺寸变化时同步弹窗：按当前策略重算尺寸与位置；"交给官方"时不动任何
 * 内联样式（官方布局与官方尺寸本身随视口响应）。只写外框，不缩放内容、
 * 不动字号。
 */
function syncDialogToViewport(): void {
  const dialog = activePatch?.dialog
  if (!dialog || !dialog.isConnected) return
  applyResolvedRect(dialog)
  // 手动尺寸模式下把收敛结果写回记忆；官方/比例模式不写。
  const stored = readDialogRect()
  if (stored !== null && stored.auto === false && !getSettings().dialogAdaptive) {
    const cur = currentPosOf(dialog)
    persistDialogRect({ w: dialog.offsetWidth, h: dialog.offsetHeight, left: cur.left, top: cur.top, auto: false })
  }
}

/** 安装弹窗窗口化补丁（body 观察器跟随面板开合，外加视口尺寸跟随）；返回 disposer。 */
export function installDialogResizePatch(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  probeAndPatchDialog()
  const reapply = debouncedProbe(() => reapplyDialogRect())
  const probe = debouncedProbe(() => probeAndPatchDialog())
  const resize = debouncedProbe(() => syncDialogToViewport())
  const onResize = (): void => { resize.schedule() }
  window.addEventListener('resize', onResize)
  // 设置里的「弹窗按比例跟随」切换后即时套用新策略。
  const offSettings = onSettingsChanged(() => reapply.schedule())
  const observer = new MutationObserver(() => probe.schedule())
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    probe.dispose()
    resize.dispose()
    reapply.dispose()
    offSettings()
    window.removeEventListener('resize', onResize)
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
      dialog.style.borderRadius = ''
      patchedDialogs.delete(dialog)
    }
    clearDialogRect()
  }
}
