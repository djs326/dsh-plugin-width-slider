/**
 * assignMenuItem.ts — 官方工作区行菜单里的「分配标签」项：注入该项、点击后经窗口事件
 * 桥打开选择器、以及把工作区写进目标分组（批次⑥ 自 workspaceTabs.tsx 原样搬出）。
 *
 * 本文件是 domContract 的消费方与 groupsStore 的写入方，不含任何时序；菜单观察器
 * （`assignRaf` / `scheduleAssign` / `assignObserver`）按规格 :130 的「install 内局部」
 * 口径留在 install，启停语句也不动。
 */
import { getSettings } from '../../core/config.ts'
import { findOpenMenu, injectMenuItem, MENU_ITEM_SELECTOR } from '../../official/menuInjection.ts'
import { findOpenProjectRow, workspaceInfoFromRow } from './domContract.ts'
import { commitGroups, groups } from './groupsStore.ts'
import { tt, ttw } from './messages.ts'

// ── 工作区行菜单「分配标签」（把工作区分配到某个页签/默认）────────────────
export const WS_ASSIGN_MENU_ATTR = 'data-ws-assign-tab-item'
export const ASSIGN_TAB_EVENT = 'dsh:ws-tab-assign'
const ASSIGN_ICON_PATH =
  '<path transform="translate(9.52 2.52)" d="M3.55246 0L3.55246 2.44252L6 2.44252L6 3.55748L3.55246 3.55748L3.55246 6L2.43834 6L2.43834 3.55748L0 3.55748L0 2.44252L2.43834 2.44252L2.43834 0L3.55246 0Z" fill="currentColor"/>' +
  '<path transform="translate(0.3496 2.35)" d="M4.76367 0C5.36861 1.80598e-05 5.93113 0.310294 6.25488 0.821289L6.78027 1.64941C6.79685 1.67558 6.81791 1.69775 6.83887 1.71973C6.72186 2.15521 6.65702 2.61192 6.65137 3.08301C6.25601 2.96045 5.90909 2.70478 5.68164 2.3457L5.15723 1.5166C5.07183 1.38189 4.92318 1.3008 4.76367 1.30078L2.32422 1.30078C1.7589 1.30078 1.30078 1.7589 1.30078 2.32422L1.30078 10.1338C1.30078 10.6991 1.7589 11.1572 2.32422 11.1572L11.9766 11.1572C12.5419 11.1572 13 10.6991 13 10.1338L13 8.58398C13.4545 8.5135 13.8903 8.38748 14.3008 8.21289L14.3008 10.1338C14.3008 11.4171 13.2598 12.458 11.9766 12.458L2.32422 12.458C1.04093 12.458 0 11.4171 0 10.1338L0 2.32422C0 1.04093 1.04093 0 2.32422 0L4.76367 0Z" fill="currentColor"/>'

function openAssignToTab(row: HTMLElement): void {
  const info = workspaceInfoFromRow(row)
  window.dispatchEvent(new CustomEvent(ASSIGN_TAB_EVENT, { detail: info }))
}

/** 往工作区行打开的 ⋯ 菜单里克隆官方项插入「分配标签」（四字、普通色）。 */
export function ensureWorkspaceAssignMenuItem(): void {
  if (!getSettings().workspaceTabs) return
  const row = findOpenProjectRow()
  if (!row) return
  const menu = findOpenMenu()
  if (!menu) return
  const info = workspaceInfoFromRow(row)
  if (!info.workspaceId) return
  injectMenuItem({
    menu,
    attr: WS_ASSIGN_MENU_ATTR,
    iconHtml: ASSIGN_ICON_PATH,
    label: ttw('menu.assign'),
    fallbackColor: 'var(--dsw-alias-label-primary,#e6edf3)',
    excludeAttrs: ['data-session-delete-item'],
    onClick: () => openAssignToTab(row),
    // 插到「删除工作区」上方（zh/en 均可），找不到则追加到末尾。
    place: (item) => {
      const deleteItem = Array.from(menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)).find((el) => {
        const text = (el.textContent || '').trim()
        return text === '删除工作区' || text === 'Delete workspace' || text.indexOf('删除工作区') >= 0
      })
      if (deleteItem && deleteItem.parentNode) deleteItem.parentNode.insertBefore(item, deleteItem)
      else menu.appendChild(item)
    },
  })
}

/** 把工作区分配到目标页签（null=默认），唯一归属：从其它页签移出。 */
export function assignWsToTab(wsId: string, targetGroupId: string | null): void {
  commitGroups((cur) => {
    const out = cur.map((g) =>
      g.id === targetGroupId ? g : { ...g, workspaceIds: g.workspaceIds.filter((id) => id !== wsId) },
    )
    if (targetGroupId === null) return out
    return out.map((g) => {
      if (g.id !== targetGroupId) return g
      if (g.workspaceIds.includes(wsId)) return g
      return { ...g, workspaceIds: [...g.workspaceIds, wsId] }
    })
  })
}
