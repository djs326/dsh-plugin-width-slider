/**
 * 宽度滑块「预览」状态的显式契约。
 *
 * 预览开着时（用户按住轨道拖宽度），组件会把设置面板整块隐藏、让对话可见。此时按 Escape
 * 的意图是"退出预览"，而不是"关闭设置面板"——但设置面板动效引擎也在 document 捕获阶段
 * 拦 Escape，两边都响应就会出现"一次 Esc 同时退出预览并关掉整个设置面板"。
 *
 * 所以预览状态压在 documentElement 的属性上：滑块层负责写入，动效引擎在拦截前用
 * {@link isPreviewOpen} 让出这一次按键。用 DOM 标记而不是模块级单例，是因为动效引擎本来
 * 就在按 DOM 结构判断面板/遮罩，两边的判据保持在同一层。
 */

/** 预览开启时挂在 `document.documentElement` 上的属性名。 */
export const PREVIEW_ATTR = 'data-dsw-preview'

/**
 * 写入/清除预览标记。
 * @param open - 预览是否开启。
 */
export function setPreviewOpen(open: boolean): void {
  if (typeof document === 'undefined') return
  if (open) document.documentElement.setAttribute(PREVIEW_ATTR, '')
  else document.documentElement.removeAttribute(PREVIEW_ATTR)
}

/**
 * 预览当前是否开启。
 * @returns 预览标记是否存在。
 */
export function isPreviewOpen(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute(PREVIEW_ATTR)
}
