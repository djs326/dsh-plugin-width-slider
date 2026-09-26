/**
 * `/api/width-slider` 端点的 5 个方法实现。
 *
 * 分支顺序、错误码与消息文本、载荷形状都是 host/client 之间的隐式契约
 * （见 docs/host-split-spec.md §7），逐字保留。写盘与热切换分开处理：
 * 文件落盘成功即 ok:true，热切换异常仅告警，避免「已落盘但返回失败」
 * 导致 client 重复提交。
 */

import type { EndpointHandler } from './endpointChannel.ts'
import type { SettingsStore } from './settingsStore.ts'
import type { WorkspaceGroupsStore } from './workspaceGroupsStore.ts'
import { normalizeGroups } from './workspaceGroupsStore.ts'
import { mergeSettings, type FeatureSettings } from '../shared/settings.ts'
import { ENDPOINT_METHOD } from '../shared/endpointContract.ts'
import { deleteSessionById, type SessionDeleteCtx } from './sessionDeleteService.ts'

export interface HostApiDeps {
  settings: SettingsStore
  groups: WorkspaceGroupsStore
  logger?: { warn?: (...args: unknown[]) => void; info?: (...args: unknown[]) => void }
  /** 传给 `deleteSessionById` 的原始 host ctx（基线是 `baseCtx as unknown as SessionDeleteCtx`）。 */
  baseCtx: unknown
  /** 设置写入成功后热切换中文强制（基线 `:224` 的 `syncChinesePrompt(next)`）。 */
  onSettingsApplied: (next: FeatureSettings) => void
}

/** `/api/width-slider` 的方法分发器。 */
export function createHostApi(deps: HostApiDeps): EndpointHandler {
  return async (endpoint: string, payload: Record<string, unknown>): Promise<unknown> => {
    const body = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
    if (endpoint === ENDPOINT_METHOD.readSettings) {
      return { ok: true, value: { settings: deps.settings.get() } }
    }
    if (endpoint === ENDPOINT_METHOD.writeSettings) {
      const next = mergeSettings(body.settings)
      try {
        deps.settings.commit(next)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        deps.logger?.warn?.('[width-slider] writeSettings failed', message)
        return { ok: false, error: { code: 'write-failed', message } }
      }
      deps.onSettingsApplied(next)
      return { ok: true, value: {} }
    }
    if (endpoint === ENDPOINT_METHOD.wsGroupsRead) {
      return { ok: true, value: { groups: deps.groups.get() } }
    }
    if (endpoint === ENDPOINT_METHOD.wsGroupsWrite) {
      // normalizeGroups 读的是 `raw.groups`（文件对象形状）；client 发来的 payload
      // 本身是 `{ groups: [...] }`，直接把数组传进去会得到空分组并「成功」落盘 ——
      // 页签重启后消失且不触发脏标记兜底。这里补上那层包装。
      const groups = normalizeGroups({ groups: (body as { groups?: unknown }).groups })
      try {
        deps.groups.commit(groups)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        deps.logger?.warn?.('[width-slider] wsGroupsWrite failed', message)
        return { ok: false, error: { code: 'write-failed', message } }
      }
      return { ok: true, value: {} }
    }
    if (endpoint === ENDPOINT_METHOD.sessionDelete) {
      // v0.5.0 会话删除：永久删除（破坏性；client 端已完成二次确认）。
      const id = body.id
      if (typeof id !== 'string' || id.length === 0) {
        return { ok: false, error: { code: 'invalid-id', message: 'id is required' } }
      }
      const result = await deleteSessionById(deps.baseCtx as SessionDeleteCtx, id)
      if (result.ok) return { ok: true, value: {} }
      return { ok: false, error: { code: result.code ?? 'delete-failed', message: result.message ?? 'delete failed' } }
    }
    deps.logger?.warn?.('[width-slider] unknown endpoint', endpoint)
    return { ok: false, error: { code: 'unknown-endpoint', message: 'unknown endpoint: ' + endpoint } }
  }
}
