/**
 * navScroll.ts — 设置弹窗左侧 tab 列的滚动补丁。
 *
 * 官方 navList 被内容撑高后没有滚动条，设置项多了会把底部 tab 顶出弹窗；补丁
 * 只给 navList 补 flex/overflow（外加给父 nav 补 min-height:0），不碰内容。
 *
 * 设置面板每次开关都会重新挂载弹窗 DOM（React unmount/mount），因此用 body 级
 * MutationObserver 探测 dialog 出现后即时 patch；已 patch 过的元素用 WeakSet
 * 记录防重复，回调经 requestAnimationFrame 合并。面板关闭后 DOM 销毁，内联样式
 * 随元素一并消失；开关关闭时 disposer 完整还原（含清 WeakSet，同一弹窗再次开启
 * 开关可立即重新 patch）。
 */
import { findDialogWithNavRail, findNavList } from '../../official/settingsDom.ts'
import { debouncedProbe } from './probe.ts'

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
/**
 * 当前已 patch 的 navList。设置面板同时只存在一份，保留单个引用即可 —— 原来用 Set 会
 * 强引用每一次打开过的 nav 子树（关闭后仍被钉住，每开一次设置就泄漏一棵）。
 */
let patchedNavListEl: HTMLElement | null = null

function probeAndPatchNavList(): void {
  if (typeof document === 'undefined') return
  const dialog = findDialogWithNavRail()
  if (!dialog) return
  const navList = findNavList(dialog)
  if (!navList || patchedNavLists.has(navList)) return
  patchedNavLists.add(navList)
  patchedNavListEl = navList
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
    const navList = patchedNavListEl
    if (navList !== null) {
      navList.style.flex = ''
      navList.style.minHeight = ''
      navList.style.overflowY = ''
      navList.style.paddingRight = ''
      const nav = navList.parentElement
      if (nav) nav.style.minHeight = ''
      patchedNavLists.delete(navList)
      patchedNavListEl = null
    }
  }
}
