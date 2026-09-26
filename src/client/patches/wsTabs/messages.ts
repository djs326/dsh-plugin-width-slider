/**
 * messages.ts — 工作区分页的中英文案（批次⑥ 自 workspaceTabs.tsx 原样搬出）。
 *
 * 两张表刻意不合并：`T` 是页签栏与对话框文案（29 条），`T_WS` 是工作区行菜单与
 * 分配选择器文案（6 条），调用点分居两处，合并要改 6 处调用点而收益为 0。
 *
 * 依赖方向：本文件只 import core/lang.ts —— **不得 import 任何其它 wsTabs 文件**，
 * 否则 `groupsStore`（`sanitize` 依赖 `tt`）与本文件成环。
 */
import { isZhInterface } from '../../core/lang.ts'

// ── 文案 ────────────────────────────────────────────────────────────────
const T: Record<string, [string, string]> = {
  'tab.default': ['默认', 'Default'],
  'tab.groupTitle': ['{name}（{n} 个工作区）', '{name} ({n} workspaces)'],
  'ctx.rename': ['重命名', 'Rename'],
  'ctx.members': ['管理工作区', 'Manage workspaces'],
  'ctx.delete': ['删除', 'Delete'],
  'rename.title': ['重命名页签', 'Rename tab'],
  'rename.placeholder': ['给文件夹起个名字', 'Name this folder'],
  'rename.save': ['保存', 'Save'],
  'rename.saving': ['保存中…', 'Saving…'],
  'rename.dup': ['已存在同名页签。', 'A tab with this name already exists.'],
  'rename.required': ['请输入页签名', 'Enter a tab name'],
  'members.title': ['管理页签「{name}」', 'Manage tab "{name}"'],
  'members.desc': ['勾选 = 放进此页签。工作区同一时间只属于一个位置（默认或某个页签），勾选会把它从原位置移过来。', 'Check to include. A workspace belongs to one place at a time (Default or one tab); checking moves it here.'],
  'members.at': ['位于：{name}', 'In: {name}'],
  'members.atDefault': ['位于：默认', 'In: Default'],
  'members.empty': ['还没有工作区。', 'No workspaces yet.'],
  'delete.title': ['删除页签', 'Delete tab'],
  'delete.desc': ['删除「{name}」后，其中的 {n} 个工作区会自动移回默认页签。', 'Deleting "{name}" moves its {n} workspace(s) back to the Default tab.'],
  'delete.ok': ['删除', 'Delete'],
  'delete.busy': ['删除中…', 'Deleting…'],
  'cancel': ['取消', 'Cancel'],
  'new.name': ['未命名', 'Untitled'],
  'warn.noRpc': ['工作区分组服务不可用', 'Workspace groups service unavailable'],
  'defaultHint': ['默认页签 = 直属工作区与未分组会话', 'Default tab shows direct workspaces and ungrouped sessions'],
  'add.tab': ['新建页签', 'New tab'],
  'done': ['完成', 'Done'],
}
export function tt(key: string, vars?: Record<string, string>): string {
  const pair = T[key]
  if (!pair) return key
  let text = isZhInterface() ? pair[0] : pair[1]
  if (vars) for (const k of Object.keys(vars)) text = text.replace('{' + k + '}', vars[k])
  return text
}

const T_WS = {
  'menu.assign': ['分配标签', 'Assign tag'],
  'dlg.title': ['分配标签', 'Assign tag'],
  'dlg.desc': ['为「{name}」选择标签（默认或某个页签）', 'Choose a tag for "{name}" (Default or a tab)'],
  'dlg.cur': ['当前所在', 'Current'],
  'dlg.done': ['已分配', 'Assigned'],
  'dlg.noWs': ['该工作区已不存在。', 'This workspace no longer exists.'],
} as Record<string, [string, string]>
export function ttw(key: string, vars?: Record<string, string>): string {
  const pair = T_WS[key]
  if (!pair) return key
  let text = isZhInterface() ? pair[0] : pair[1]
  if (vars) for (const k of Object.keys(vars)) text = text.replace('{' + k + '}', vars[k])
  return text
}
