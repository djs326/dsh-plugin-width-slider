/**
 * widthPrefs.ts — 对话内容宽度偏好的持久化与应用（client 共享，无 react 依赖）。
 *
 * 单一事实源（官方/插件共用 localStorage）：
 *   dsh.conversation.contentWidth        —— 固定宽度（px）
 *   dsh.conversation.contentWidthFollow  —— 1 = 跟随对话列宽（live）
 * 应用方式 = 把 --dsh-chat-user-width 写到每个对话根 [data-phase]
 * （与官方 onHandleDrag 一致）。
 *
 * 本模块除 helpers（组件与恢复共用）外，提供"启动即恢复"：
 *   - applySavedWidth()：follow=1 → 起全局跟随 watcher；有 fixed 值 →
 *     等对话根出现后发布一次。修复"重启 DSH 后宽度偏好不生效、要打开
 *     设置页插件页（WidthSliderControl mount）才生效"的生命周期缺口——
 *     应用逻辑原先只挂在设置页组件内。
 *   - setFollowEnabled()：组件在开关切换时同步全局 watcher，避免面板
 *     关闭后全局仍按旧模式钉宽度。
 * 全部返回/登记 disposer，随功能开关卸载。
 */

export const WIDTH_PREF_KEY = 'dsh.conversation.contentWidth'
export const FOLLOW_PREF_KEY = 'dsh.conversation.contentWidthFollow'
export const MIN_WIDTH = 640
export const EDGE_BUDGET = 176

export type Disposer = () => void

// ── Helpers ────────────────────────────────────────────────────────────────

/** 读固定宽度偏好；无/非法返回 null。 */
export function readPreference(): number | null {
  try {
    const raw = localStorage.getItem(WIDTH_PREF_KEY)
    if (raw === null) return null
    const v = Number(raw)
    return Number.isFinite(v) && v > 0 ? v : null
  } catch { return null }
}

/** Follow-window 模式与固定宽度分开持久。 */
export function readFollowPreference(): boolean {
  try { return localStorage.getItem(FOLLOW_PREF_KEY) === '1' } catch { return false }
}

/** 读当前对话列宽（对话根 inline --dsh-conversation-column-width），兜底 DOM。 */
export function readColumnWidth(): number {
  for (const el of document.querySelectorAll<HTMLElement>('[data-phase]')) {
    const col = Number.parseFloat(el.style.getPropertyValue('--dsh-conversation-column-width'))
    if (Number.isFinite(col) && col > 0) return col
    return el.offsetWidth
  }
  return window.innerWidth - 240
}

/** 无偏好时的自适应默认宽度。 */
export function defaultWidth(column: number): number {
  return Math.max(680, Math.min(column * 0.64, 920))
}

/** 发布内容宽度：写 --dsh-chat-user-width 到每个对话根（同官方拖拽）。 */
export function publishChatWidth(px: number): void {
  const clamped = Math.round(Math.max(MIN_WIDTH, px))
  for (const el of document.querySelectorAll<HTMLElement>('[data-phase]')) {
    el.style.setProperty('--dsh-chat-user-width', `${clamped}px`)
  }
}

export function persistWidth(px: number): void {
  try {
    localStorage.setItem(WIDTH_PREF_KEY, String(Math.round(Math.max(MIN_WIDTH, px))))
  } catch { /* quota */ }
}

export function persistFollowPreference(follow: boolean): void {
  try { localStorage.setItem(FOLLOW_PREF_KEY, follow ? '1' : '0') } catch { /* quota */ }
}

// ── 全局跟随 watcher（唯一实例，启动恢复与组件开关共用）──────────────

let followWatcher: Disposer | null = null

/** 跟随列宽：任何对话根尺寸/窗口变化都把内容宽度钉在列宽上，并感知
 * 稍后出现的对话根（面板/分栏/新会话切换等布局变化）。 */
function createFollowWatcher(): Disposer {
  let ro: ResizeObserver
  const apply = (): void => {
    publishChatWidth(readColumnWidth())
    document.querySelectorAll<HTMLElement>('[data-phase]').forEach((el) => ro.observe(el))
  }
  ro = new ResizeObserver(apply)
  apply()
  window.addEventListener('resize', apply)
  // 根元素出现/消失感知（宽度跟随由 ResizeObserver 负责；这里只需在根
  // 数量变化时重新钉一次，rAF 节流避免流式输出每 token 全文档扫描）。
  let knownRoots = document.querySelectorAll('[data-phase]').length
  let rafId = 0
  const checkRoots = (): void => {
    rafId = 0
    const roots = document.querySelectorAll('[data-phase]').length
    if (roots !== knownRoots) {
      knownRoots = roots
      apply()
    }
  }
  const mo = new MutationObserver(() => {
    if (rafId === 0) rafId = requestAnimationFrame(checkRoots)
  })
  mo.observe(document.body, { childList: true, subtree: true })
  return () => {
    ro.disconnect()
    mo.disconnect()
    if (rafId !== 0) cancelAnimationFrame(rafId)
    window.removeEventListener('resize', apply)
  }
}

/** 按开关同步全局 watcher 启停（幂等）。 */
export function setFollowEnabled(enabled: boolean): void {
  if (enabled) {
    if (followWatcher !== null) return
    try {
      followWatcher = createFollowWatcher()
    } catch {
      followWatcher = null
    }
  } else if (followWatcher !== null) {
    followWatcher()
    followWatcher = null
  }
}

// ── fixed 值启动恢复 ──────────────────────────────────────────────────────

/** 有 fixed 偏好且对话根未出现时，等根出现后发布一次即停止监听。 */
function publishSavedFixedWhenRootReady(): Disposer {
  const pref = readPreference()
  if (pref === null) return () => {}
  const publish = (): void => {
    if (document.querySelector('[data-phase]') !== null) {
      publishChatWidth(pref)
    }
  }
  publish()
  if (document.querySelector('[data-phase]') !== null) return () => {}
  let rafId = 0
  const mo = new MutationObserver(() => {
    if (rafId !== 0) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      if (document.querySelector('[data-phase]') !== null) {
        publish()
        mo.disconnect()
      }
    })
  })
  mo.observe(document.body, { childList: true, subtree: true })
  return () => {
    mo.disconnect()
    if (rafId !== 0) cancelAnimationFrame(rafId)
  }
}

/**
 * 启动即恢复上次宽度偏好（随"宽度滑块"功能开关安装/卸载）：
 *   follow=1   → 全局跟随 watcher（重启后立即生效并持续跟随）；
 *   fixed 值    → 对话根出现后发布一次（幂等；官方若自行恢复也同值覆盖）；
 *   均无        → no-op，保持官方默认。
 */
export function applySavedWidth(): Disposer {
  if (readFollowPreference()) {
    setFollowEnabled(true)
    return () => setFollowEnabled(false)
  }
  return publishSavedFixedWhenRootReady()
}
