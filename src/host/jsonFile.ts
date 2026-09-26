/**
 * host 侧通用 JSON 文件读写。
 *
 * 两个 store（settingsStore / workspaceGroupsStore）的磁盘逻辑逐字相同：
 * 原子写（mkdir -p → 写 `<file>.tmp` → rename 覆盖），以及读取失败时把
 * 现场改名为 `<file>.corrupt-<ISO>` 保留证据、再回退调用方给的缺省值。
 * 这里只抽这两件事；类型校验与 fallback 值由调用方负责。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** 原子写 JSON：mkdir -p → 写 <file>.tmp → rename 覆盖。失败向上抛。 */
export function writeJsonAtomic(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8')
  renameSync(tmp, file)
}

/**
 * 读 JSON。`file` 不存在时返回 `onMissing()`；解析或读取抛错时把文件改名为
 * `<file>.corrupt-<ISO>` 保留现场、调用 `onCorrupt(err)`、返回 `onMissing()`。
 */
export function readJsonOrRecover(
  file: string,
  onMissing: () => unknown,
  onCorrupt: (err: unknown) => void,
): unknown {
  try {
    if (!existsSync(file)) return onMissing()
    const raw = readFileSync(file, 'utf-8')
    return JSON.parse(raw)
  } catch (err) {
    try {
      if (existsSync(file)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        renameSync(file, file + '.corrupt-' + stamp)
      }
    } catch { /* 改名失败不阻塞 */ }
    onCorrupt(err)
    return onMissing()
  }
}
