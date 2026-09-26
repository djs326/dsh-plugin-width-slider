/**
 * settingsDom.ts — 官方设置弹窗的 DOM 契约（official/ 层）。
 *
 * official/ 只做一件事：**找到并描述**宿主节点，不替消费方做决策 —— 加类、
 * 改样式、拦事件都留在 patches/ 与 motion/。这里每个函数都是纯探测：命中就
 * 返回节点或几何值，未命中安静返回 null（宿主是 CSS-module hash 的上游包，
 * 结构变了要降级成"没找到"，不能抛错）。
 *
 * 宿主（@deepseek-ai/dsh-client-ui-settings-general 的 SettingsRoot）结构：
 *
 *   div.overlay[role="presentation"]
 *     ├── div.mask[aria-hidden="true"]                      ← 弹窗的前一个兄弟
 *     └── div.panel[role="dialog"][aria-modal="true"]
 *           ├── nav > div.navList                           ← 左侧 tab 列
 *           └── div.content > div.header > (div.actions, button.close)
 *
 * 两个消费方对"这是不是设置弹窗"的口径本来就不一样，本模块把两种口径收在一处
 * （而不是让它们各自维护一份假设）：
 * - `findDialogWithNavRail()` 宽口径：modal dialog + 直接子级 nav。窗口化补丁用它 ——
 *   补丁只改外框尺寸/位置，认错弹窗的代价仅是多给一个弹窗加了把手；
 * - `isSettingsDialog()` / `findSettingsDialog()` 严口径：再要求"挂在 role=presentation
 *   层里、且紧邻自己的遮罩"。动效引擎用它 —— 它要拦关闭点击，把别的插件的可
 *   导航弹窗当成设置面板会吞掉不属于它的交互。
 */

// ── 弹窗本体 ─────────────────────────────────────────────────────────

/**
 * 设置弹窗选择器：带 `aria-modal` 的 dialog。
 *
 * 历史上两份声明不一致（`div[role="dialog"]…` 与 `[role="dialog"]…`）。实测宿主现存
 * 四个 modal 实现（ui-settings-general/SettingsRoot、ui-primitives/Modal、
 * ui-primitives/ImageLightbox、ui-settings-account/PlatformOverlay）渲染的都是
 * `<div role="dialog" aria-modal="true">`，两种写法在真实 DOM 上等价；取带 `div`
 * 前缀这份更精确（不会匹配将来可能出现的非 div 自定义元素），故统一到它。
 */
export const SETTINGS_DIALOG_SELECTOR = 'div[role="dialog"][aria-modal="true"]'

/**
 * 设置弹窗挂载层：壳组件用 `role="presentation"` 的 overlay 承载遮罩与弹窗。
 * It is the one structural fact that tells the settings modal apart from any other
 * modal that happens to render a nav rail.
 */
export const OVERLAY_ROLE = 'presentation'

/**
 * The panel's own mask: the `aria-hidden` sibling immediately before it. A
 * sibling that CONTAINS the panel is a container, not a mask - returning it would
 * make `mask.contains(target)` true for every click in the page and swallow them
 * all.
 * @param dialog - the settings dialog.
 */
export function maskOf(dialog: Element): HTMLElement | null {
  const sibling = dialog.previousElementSibling
  if (!(sibling instanceof HTMLElement) || sibling.getAttribute('aria-hidden') !== 'true') return null
  return sibling.contains(dialog) ? null : sibling
}

/**
 * True for the host settings dialog: a modal dialog with a nav rail, mounted in
 * the shell's `role="presentation"` layer next to its own mask. Requiring that
 * layer and the mask sibling matters - "modal + nav" alone also accepts other
 * plugins' navigable modals, and taking one of those for the panel made this
 * engine intercept clicks that are none of its business.
 * @param node - a candidate dialog element.
 */
export function isSettingsDialog(node: Element): boolean {
  if (!node.matches(SETTINGS_DIALOG_SELECTOR) || node.querySelector('nav') === null) return false
  const parent = node.parentElement
  if (parent === null || parent.getAttribute('role') !== OVERLAY_ROLE) return false
  return maskOf(node) !== null
}

/**
 * 严口径查找：第一个真正的设置弹窗（见 `isSettingsDialog()`），没有则 null。
 *
 * 与 `findDialogWithNavRail()` 的差别：这里额外要求 overlay 层与遮罩兄弟，
 * 且 nav 只要求"存在"（任意深度）—— 动效引擎的关闭拦截宁可漏认，也不认错。
 */
export function findSettingsDialog(): HTMLElement | null {
  for (const dialog of document.querySelectorAll<HTMLElement>(SETTINGS_DIALOG_SELECTOR)) {
    if (isSettingsDialog(dialog)) return dialog
  }
  return null
}

/**
 * 宽口径查找：第一个"modal dialog 且直接子级含 <nav>"的弹窗（排除其它 dialog）。
 *
 * 窗口化补丁用它：补丁不改事件、不改内容，只把外框变成可拖拽窗口，因此在
 * 结构残缺（没有 overlay/遮罩）时也照常工作 —— 这也是它和严口径同时存在的原因。
 */
export function findDialogWithNavRail(): HTMLElement | null {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>(SETTINGS_DIALOG_SELECTOR))
  for (const dialog of dialogs) {
    if (dialog.querySelector(':scope > nav') !== null) return dialog
  }
  return null
}

// ── 触发器（打开设置弹窗的壳按钮）────────────────────────────────────

/** The settings trigger: the shell button that opens the dialog. */
export const TRIGGER_SELECTOR = 'button[aria-haspopup="dialog"]'

/**
 * Pick the button the panel opened from. The pointer's own button wins. A
 * shortcut-opened panel has none, and the shell trigger is no longer unique:
 * since 0.1.7 the context meter, the stats pills and the usage panels all
 * declare `aria-haspopup="dialog"`, so taking the document's first match can
 * anchor the panel to a control on the far side of the viewport.
 * @param dialog - the live settings dialog.
 * @param pressed - the most recent button pressed by the pointer, if any.
 */
export function settingsTrigger(dialog: HTMLElement, pressed: HTMLElement | null): HTMLElement | null {
  // A button inside the panel is never its own trigger; a stale reference from
  // a previous dialog must not win either.
  if (pressed !== null && pressed.isConnected && !dialog.contains(pressed)) return pressed
  const outside = Array.from(document.querySelectorAll<HTMLElement>(TRIGGER_SELECTOR))
    .filter((element) => !dialog.contains(element))
  // The open trigger is the one the shell marks expanded. When no candidate
  // carries the marker, the nearest one to the panel is the best available
  // reading of "the button you pressed".
  const expanded = outside.filter((element) => element.getAttribute('aria-expanded') === 'true')
  const pool = expanded.length > 0 ? expanded : outside
  const panelRect = dialog.getBoundingClientRect()
  const panelX = panelRect.left + panelRect.width / 2
  const panelY = panelRect.top + panelRect.height / 2
  let best: HTMLElement | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const element of pool) {
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue
    const dx = rect.left + rect.width / 2 - panelX
    const dy = rect.top + rect.height / 2 - panelY
    const distance = dx * dx + dy * dy
    if (distance < bestDistance) {
      bestDistance = distance
      best = element
    }
  }
  return best
}

/**
 * The scale anchor for the panel: the centre of the settings trigger in the
 * panel's own coordinate space, so the panel grows out of the button instead
 * of the viewport centre. Returns null when no trigger is measurable (jsdom,
 * detached markup).
 * @param dialog - the live settings dialog.
 * @param pressed - the most recent button pressed by the pointer, if any.
 */
export function triggerOrigin(dialog: HTMLElement, pressed: HTMLElement | null): { x: number; y: number } | null {
  const trigger = settingsTrigger(dialog, pressed)
  if (trigger === null) return null
  const panelRect = dialog.getBoundingClientRect()
  const triggerRect = trigger.getBoundingClientRect()
  if (panelRect.width === 0 || panelRect.height === 0 || triggerRect.width === 0 || triggerRect.height === 0) {
    return null
  }
  // Clamp the anchor into the panel's own box. A trigger above or beside the
  // dialog would otherwise put the origin outside it, and the panel reads as
  // flying in from empty space instead of growing out of the button. On the
  // boundary the direction still shows - top edge for a button above, left edge
  // for one on the side - which is the "from the button" motion itself.
  return {
    x: Math.min(Math.max(triggerRect.left + triggerRect.width / 2 - panelRect.left, 0), panelRect.width),
    y: Math.min(Math.max(triggerRect.top + triggerRect.height / 2 - panelRect.top, 0), panelRect.height),
  }
}

// ── 弹窗内部节点 ─────────────────────────────────────────────────────

/** The panel's scrolling content column (the nav rail's sibling). */
export function contentOf(dialog: HTMLElement): HTMLElement | null {
  const content = dialog.querySelector('nav')?.nextElementSibling
  return content instanceof HTMLElement ? content : null
}

/**
 * 找左侧 tab 列表容器：nav 下首个含 button 的 div（= navList）。
 * 官方结构 navTitle（无 button）在前、navList（多个 navCell button）在后；
 * 用"含 button"判定比固定索引更抗标题区变化。
 */
export function findNavList(dialog: HTMLElement): HTMLElement | null {
  const nav = dialog.querySelector(':scope > nav')
  if (!nav) return null
  for (const child of Array.from(nav.children)) {
    if (child instanceof HTMLElement && child.tagName === 'DIV' && child.querySelectorAll('button').length > 0) {
      return child
    }
  }
  return null
}

/**
 * 右下角缩放把手的身标记属性。补丁用它判断"这个弹窗已经装过把手"，宿主与
 * 样式表都不认识它，因此值必须保持稳定（改值 = 已装把手的弹窗会被重复注入）。
 */
export const RESIZE_HANDLE_ATTR = 'data-width-slider-resize-handle'

// ── 关闭控件 ─────────────────────────────────────────────────────────

/**
 * Words that name a close control. The host close button carries its
 * accessible name as visually-hidden slot text, so the button's own text IS
 * the localized word for "close". The length cap keeps a long paragraph that
 * happens to start with one of these words from matching.
 */
export const CLOSE_LABEL = /^(close|dismiss|关闭|關閉|閉じる|닫기|schließen|fermer|cerrar|chiudi|sluiten|zamknij|fechar|закрыть|kapat|đóng)/i

/** Whether a button names itself as a close control. */
export function isCloseButton(button: HTMLElement): boolean {
  const label = (button.getAttribute('aria-label') ?? button.getAttribute('title') ?? button.textContent ?? '').trim()
  return label.length > 0 && label.length <= 24 && CLOSE_LABEL.test(label)
}

/**
 * Whether the button is the dialog header's own close control. The header is
 * the content column's first child and the close button is its direct child
 * (the action seat sits in a nested element); this structural check keeps the
 * exit working when the localized label changes.
 * @param dialog - the live settings dialog.
 * @param button - the pressed button.
 */
export function isHeaderCloseButton(dialog: HTMLElement, button: HTMLElement): boolean {
  const header = contentOf(dialog)?.firstElementChild
  return header instanceof HTMLElement && button.parentElement === header
}

// ── 内层浮层 ─────────────────────────────────────────────────────────

/**
 * Whether an inner floating layer owns the interaction: an open Menu (the
 * settings page renders several, portaled to the body) or a nested modal.
 * Those consume Escape and outside-clicks themselves, so the close paths must
 * let the event through instead of shrinking the whole panel.
 * @param dialog - the live settings dialog.
 */
export function innerLayerOpen(dialog: HTMLElement): boolean {
  if (document.querySelector('[role="menu"]') !== null) return true
  // 这里原先自带一份 `[role="dialog"][aria-modal="true"]` 字面量，随本次合并改用
  // `SETTINGS_DIALOG_SELECTOR`：实测宿主的四个 modal 实现都是 div（见该常量的说明），
  // 两种写法在真实 DOM 上同解。
  for (const other of document.querySelectorAll<HTMLElement>(SETTINGS_DIALOG_SELECTOR)) {
    if (other !== dialog) return true
  }
  return false
}
