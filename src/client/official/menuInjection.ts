/**
 * menuInjection.ts — 官方「⋯」菜单项克隆注入的原语（official/ 层）。
 *
 * official/ 只做一件事：**找到并描述**宿主节点。这里描述的是宿主行菜单的结构
 * 契约 —— 根节点 `[role=menu]`、菜单项 `[role=menuitem]`，以及"克隆一个官方项、
 * 换掉图标/文本/文字色、插回菜单"这条注入路径。注入的**守卫条件、触发时机、
 * 点击语义**全部留在消费方：原语不认识 `menuSlotLive`，也不认识「工作区页签
 * 开关」，更不知道点了这一项该干什么。
 *
 * 两个消费方（会话行的"删除会话"、工作区行的"分配标签"）把这段流程各写过一遍，
 * 除下列参数外逐字相同，改一处必漏另一处，故收敛到这里：
 * - 自有标记属性：既是本项自己的查重键，也是别的消费方要避开的注入项标记；
 * - 图标（`svg` 内层片段）与文本：文本由各消费方本地文案函数（`tt` / `ttw`）
 *   取值后传入 —— 文案表不进 official/，否则这一层就要跟着界面语言走；
 * - 文字色：两个分支的色值来源不同（`MenuItemInjection.fallbackColor` /
 *   `templateColor`）—— 会话删除两分支都要染危险色，工作区分配只给兜底按钮
 *   上色、模板项沿用官方默认色；
 * - 兜底按钮第一条对齐声明的拼写：见 `MenuItemInjection.alignItemsProperty`；
 * - 插入位置：默认追加到菜单末尾，要"插到某项之前"的消费方给 `place`。
 */

/** 宿主行菜单根：会话行与工作区行用的是同一个官方菜单实现。 */
const MENU_ROOT_SELECTOR = '[role=menu]'
/** 宿主菜单项：克隆模板的来源，也是"插到某项之前"的参照。 */
export const MENU_ITEM_SELECTOR = '[role=menuitem]'
/**
 * 兜底按钮的 hover 底色。模板分支不设 inline background —— 那会压掉官方类自带
 * 的 hover 灰底；只有手写兜底按钮才需要自己模拟它。
 */
const HOVER_BG = 'var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.14))'

/** 当前打开着的官方菜单根；没有就 null。 */
export function findOpenMenu(): HTMLElement | null {
  return document.querySelector<HTMLElement>(MENU_ROOT_SELECTOR)
}

/**
 * 注入选项。字段与上表一一对应；除 `menu`/`attr`/`iconHtml`/`label`/
 * `fallbackColor`/`onClick` 外都可省。
 */
interface MenuItemInjection {
  /** 菜单根（调用方已确认存在）。 */
  menu: HTMLElement
  /** 注入项的自有标记属性；同时是查重键（已存在则不再注入）。 */
  attr: string
  /** 写进官方 `svg` 内层的图标片段（形如 `<path .../>`）。 */
  iconHtml: string
  /** 菜单项文本。 */
  label: string
  /** 兜底按钮（无官方模板时）的文字色，写进 `cssText`。 */
  fallbackColor: string
  /**
   * 模板项要覆盖的文字色；不给则沿用官方样式自带的色。
   *
   * 两个分支的色值来源不同是既有的：会话删除的模板项也染危险色，工作区分配的
   * 模板项保持官方默认色（只有手写兜底按钮才需要显式上色）。
   */
  templateColor?: string
  /**
   * 选模板时除 `attr` 外还要避开的属性名（别的消费方/插件的注入项）。按给定顺序
   * 逐个 `hasAttribute` 短路，与调用方原先写成一串 `&&` 的语义一致。
   */
  excludeAttrs?: readonly string[]
  /**
   * 兜底按钮 `cssText` 里第一条对齐声明的属性名，默认 `'align-items'`。
   *
   * 会话删除那条历史上写的是 `alignItems`（驼峰）。`cssText` 按 CSS 语法解析，
   * `alignItems` 不是合法属性名会被整条丢弃 —— 也就是说当时那个兜底按钮实际
   * 没有垂直居中。改回合法写法会改变现网观感，属于行为变化，所以这里按消费方
   * 逐个保留，不在重构里"顺手修好"（要修应单独列为一次行为变更）。
   */
  alignItemsProperty?: string
  /** 点击行为。 */
  onClick: () => void
  /** 插入位置；不给则追加到菜单末尾。 */
  place?: (item: HTMLButtonElement) => void
}

/**
 * 照官方菜单项做一份自有项并插进菜单。
 *
 * 找不到官方模板（菜单里只剩注入项）时退化成手写按钮：同样一条路径、同样的
 * 类目与布局，不抛错。
 * @param opts - 注入选项。
 * @returns 注入的项；菜单里已存在自有项（按 `attr` 查重）时返回 null。
 */
export function injectMenuItem(opts: MenuItemInjection): HTMLButtonElement | null {
  const {
    menu, attr, iconHtml, label, fallbackColor, templateColor,
    excludeAttrs = [], alignItemsProperty = 'align-items', onClick, place,
  } = opts
  // 菜单里已经有本项（开着菜单时又触发了一次注入）：不动 DOM。
  if (menu.querySelector('[' + attr + ']')) return null
  const template = Array.from(menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR))
    .find((el) => !el.hasAttribute(attr) && excludeAttrs.every((name) => !el.hasAttribute(name))) ?? null

  let item: HTMLButtonElement
  if (template) {
    // 克隆官方菜单项：保留其全部结构/类/内边距/hover 规则。
    item = template.cloneNode(true) as HTMLButtonElement
    item.setAttribute(attr, '1')
    // 图标：直接替换官方 svg 的内容（保留官方 svg 的尺寸与 wrapper，
    // 布局与其它项完全一致）。
    const iconSvg = item.querySelector('svg')
    if (iconSvg) {
      iconSvg.setAttribute('fill', 'currentColor')
      iconSvg.setAttribute('stroke', 'none')
      iconSvg.innerHTML = iconHtml
    }
    // 文本：官方 label span 保留样式类，仅改文字。
    const spans = Array.from(item.querySelectorAll('span'))
    const labelSpan = spans.find((s) => s.textContent && s.textContent.trim() !== '') ?? null
    if (labelSpan) labelSpan.textContent = label
    else {
      const span = document.createElement('span')
      span.textContent = label
      item.appendChild(span)
    }
    // 仅覆盖文字色；hover 灰底等全部由官方类接管。
    if (templateColor) item.style.color = templateColor
  } else {
    // 兜底（无官方模板时）：手写与官方一致的布局。
    item = document.createElement('button')
    item.type = 'button'
    item.setAttribute('role', 'menuitem')
    item.setAttribute(attr, '1')
    item.style.cssText = [
      'display:flex', alignItemsProperty + ':center', 'gap:8px', 'width:100%',
      'padding:6px 12px', 'border:none', 'background:transparent',
      'color:' + fallbackColor,
      'font:inherit', 'fontSize:13px', 'lineHeight:20px',
      'textAlign:left', 'borderRadius:6px', 'cursor:pointer',
    ].join(';')
    item.innerHTML = '<span style="display:inline-flex;flex:none"><svg width="16" height="16" viewBox="0 0 16 16" fill="none">' + iconHtml + '</svg></span><span>' + label + '</span>'
    item.addEventListener('mouseenter', () => { item.style.background = HOVER_BG })
    item.addEventListener('mouseleave', () => { item.style.background = 'transparent' })
  }
  item.addEventListener('click', onClick)
  if (place) place(item)
  else menu.appendChild(item)
  return item
}
