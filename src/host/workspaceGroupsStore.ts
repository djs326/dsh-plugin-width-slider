/**
 * `workspace-groups.json` 的归一化、读写与 per-`apply` 内存当前值。
 *
 * 文件位置：`$DSH_HOME/storages/dsh-plugin-width-slider/workspace-groups.json`。
 * 文件对象形状 `{ version: 1, groups: [...] }`；读盘走 `normalizeGroups`
 * 丢掉脏项（host 与 client 之间的契约，见 docs/wsTabs-split-spec.md）。
 */

import { join } from 'node:path'
import { resolveDshHome } from './dshHome.ts'
import { readJsonOrRecover, writeJsonAtomic } from './jsonFile.ts'

const SETTINGS_DIR = join(resolveDshHome(), 'storages', 'dsh-plugin-width-slider')
/** 工作区分组文件夹持久化（默认页签为根；文件夹内为归属工作区 id）。 */
const GROUPS_FILE = join(SETTINGS_DIR, 'workspace-groups.json')

interface GroupFileItem { id?: unknown; name?: unknown; workspaceIds?: unknown }
interface GroupsFile { version?: unknown; groups?: unknown }

export interface WsGroup { id: string; name: string; workspaceIds: string[] }

/** 归一化分组文件对象形状（`{ version?, groups? }`）：丢空/重复/非字符串 id，空名保留为 `''`。 */
export function normalizeGroups(raw: unknown): WsGroup[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as GroupsFile).groups)
    ? (raw as GroupsFile).groups as unknown[]
    : []
  const out: Array<{ id: string; name: string; workspaceIds: string[] }> = []
  const seen = new Set<string>()
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const it = item as GroupFileItem
    if (typeof it.id !== 'string' || it.id === '' || seen.has(it.id)) continue
    // 不做语言相关兜底：原先硬编码「未命名」，而 client 侧用 tt('new.name')（随界面语言），
    // 同一份数据的兜底名会在两侧漂移。空名原样保留，由 client 的 sanitize() 补默认名。
    const name = typeof it.name === 'string' ? it.name.trim() : ''
    const workspaceIds = Array.isArray(it.workspaceIds)
      ? it.workspaceIds.filter((v): v is string => typeof v === 'string' && v !== '')
      : []
    seen.add(it.id)
    out.push({ id: it.id, name, workspaceIds })
  }
  return out
}

/** 读分组文件；缺失返回空数组，损坏改名保留现场。 */
export function readGroupsFileSync(): WsGroup[] {
  const raw = readJsonOrRecover(
    GROUPS_FILE,
    () => [],
    (err) => {
      console.warn('[width-slider] workspace-groups.json 损坏或不可读，已按空分组处理并保留现场', err)
    },
  )
  return normalizeGroups(raw)
}

/** 原子写分组文件。 */
export function writeGroupsFileSync(groups: WsGroup[]): void {
  writeJsonAtomic(GROUPS_FILE, { version: 1, groups })
}

export interface WorkspaceGroupsStore {
  /** 当前分组（启动时读盘，写成功后热更新）。 */
  get: () => WsGroup[]
  /** 落盘并切换内存值；落盘失败向上抛，内存不变。 */
  commit: (groups: WsGroup[]) => void
}

export function createWorkspaceGroupsStore(): WorkspaceGroupsStore {
  // 工作区分组文件夹（默认根 + 用户文件夹）；由 client 经 RPC 读写。
  let currentGroups = readGroupsFileSync()
  return {
    get: () => currentGroups,
    commit: (groups) => {
      writeGroupsFileSync(groups)
      currentGroups = groups
    },
  }
}
