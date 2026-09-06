/**
 * sessionDeleteService.ts — 会话删除 host 服务（v0.5.0）。
 *
 * 参考蓝本：dsh-archived-chats（Ultronen，MIT，仓库 archived-chats-ref/）
 * 的 deleteSession / disposeLiveSession —— 官方 DSH 不提供面向用户的删除
 * 会话接口，删除（含数据目录）需走官方内部服务：
 *   - workspace registry：ctx.get('workspaceRegistry') / 'workspace'
 *   - 会话持久化：ctx.get('sessionPersistence')（list/locate）
 *   - sessions / agents / attachments 运行时 store（ctx.get）
 * 本实现为"永久删除"精简版（不做归档插件的回收站/快照/元数据层）。
 * 所有步骤沿用蓝本的防御性做法：feature-detect、目录 basename 校验
 * （防误删整个会话根目录）、Windows 删除重试、失败回滚为取消。
 *
 * 导出两个函数供 /width-slider RPC 使用：
 *   listSessionCandidates(ctx, title) — 按标题列出可删会话候选
 *   deleteSessionById(ctx, id)        — 永久删除（先处置活动会话）
 */
import { lstat, rm } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

/** 官方服务 key（与蓝本一致的候选顺序）。 */
const WORKSPACE_KEYS = ['workspaceRegistry', 'workspace']
const PERSISTENCE_KEYS = ['sessionPersistence']

/** Windows 下目录可能被句柄占用（索引/杀软），删除带重试。 */
const RM_RETRY = { maxRetries: 5, retryDelay: 50 }

// ── 类型（宽松契约，运行时由 DSH 注入）──────────────────────────────

export interface SessionDeleteCtx {
  logger?: { info?: (m: string, e?: unknown) => void; warn?: (m: string, e?: unknown) => void; error?: (m: string, e?: unknown) => void }
  get: <T = unknown>(name: string) => T | undefined
}

type AnyRecord = Record<string, any>

function registryOf(ctx: SessionDeleteCtx): AnyRecord | undefined {
  for (const key of WORKSPACE_KEYS) {
    const svc = ctx.get<AnyRecord>(key)
    if (svc !== undefined) return svc
  }
  return undefined
}

function persistenceOf(ctx: SessionDeleteCtx): AnyRecord | undefined {
  return ctx.get<AnyRecord>(PERSISTENCE_KEYS[0])
}

// ── 会话列表（候选）──────────────────────────────────────────────────

/** 从持久化 headers 列出标题匹配的活动会话候选（id/title/updatedAt）。 */
export async function listSessionCandidates(ctx: SessionDeleteCtx, title: string): Promise<unknown[]> {
  const persistence = persistenceOf(ctx)
  if (!persistence || typeof persistence.list !== 'function') return []
  try {
    const headers = (await persistence.list()) as unknown[]
    const wanted = String(title ?? '').trim().toLowerCase()
    if (wanted === '') return []
    const out: Array<{ id: string; title: string | null; updatedAt: number | null }> = []
    for (const h of headers) {
      const header = h as { id?: unknown; title?: unknown; updatedAt?: unknown }
      if (header.title === undefined || typeof header.title !== 'string') continue
      if (header.title.trim().toLowerCase() !== wanted) continue
      if (typeof header.id !== 'string') continue
      out.push({
        id: header.id,
        title: header.title,
        updatedAt: typeof header.updatedAt === 'number' ? header.updatedAt : null,
      })
    }
    return out
  } catch (err) {
    ctx.logger?.warn?.('session candidates list failed', err)
    return []
  }
}

// ── 删除 ─────────────────────────────────────────────────────────────

/** 处置活动会话（照蓝本 disposeLiveSession 精简：cancel → flush → detach）。 */
async function disposeLiveSession(ctx: SessionDeleteCtx, id: string): Promise<boolean> {
  const sessions = ctx.get<AnyRecord>('sessions')
  const agents = ctx.get<AnyRecord>('agents')
  // 无 sessions 服务或查不到该会话 = 冷会话，无需处置。
  if (sessions === undefined || typeof sessions.get !== 'function') return true
  const session = sessions.get(id)
  if (session === undefined) return true
  const agent = agents !== undefined && typeof agents.get === 'function' ? agents.get(id) : undefined
  if (agent !== undefined) {
    try {
      agent.cancel?.({ kind: 'disposed' })
      await Promise.race([
        Promise.resolve(agent.whenIdle?.()),
        new Promise((resolve) => setTimeout(resolve, 20000)),
      ])
    } catch (err) {
      ctx.logger?.warn?.(('[width-slider] dispose session: parking did not converge: ') + String(err))
    }
  }
  if (typeof sessions.flush === 'function') {
    try {
      await sessions.flush(session)
    } catch (err) {
      ctx.logger?.warn?.('[width-slider] session flush failed', err)
    }
  }
  const sessionEntry = sessions.store instanceof Map ? sessions.store.get(id) : undefined
  const agentEntry = agents?.store instanceof Map ? agents.store.get(id) : undefined
  if (typeof sessionEntry?.detach !== 'function') return false
  if (agent !== undefined && (agentEntry === undefined
    || typeof agents?.detachEntered !== 'function'
    || agentEntry.announcing === true)) return false
  try {
    await agent?.scope?.dispose?.()
  } catch (err) {
    ctx.logger?.warn?.('[width-slider] agent fiber teardown failed', err)
  }
  try {
    if (agentEntry !== undefined) agents?.detachEntered?.(agentEntry)
  } catch (err) {
    ctx.logger?.warn?.('[width-slider] agent detach failed', err)
  }
  try {
    sessionEntry.detach()
  } catch (err) {
    ctx.logger?.warn?.('[width-slider] session detach failed', err)
    return false
  }
  if (sessions.get?.(id) !== undefined) return false
  await new Promise((resolve) => setTimeout(resolve, 250))
  return true
}

/** 永久删除一个会话（活动会话先处置；数据目录经 basename 校验后删除）。 */
export async function deleteSessionById(ctx: SessionDeleteCtx, id: string): Promise<{ ok: boolean; code?: string; message?: string }> {
  if (typeof id !== 'string' || id.length === 0) return { ok: false, code: 'invalid-id', message: 'id is required' }
  const sessions = ctx.get<AnyRecord>('sessions')
  const live = sessions?.get?.(id) !== undefined
  if (live) {
    const disposed = await disposeLiveSession(ctx, id)
    if (!disposed) {
      return { ok: false, code: 'dispose-failed', message: '会话仍在运行且无法安全停止，已取消删除' }
    }
  }
  // 数据目录：persistence.locate(header) → dirname(path) 且 basename === id。
  const persistence = persistenceOf(ctx)
  const registry = registryOf(ctx)
  let header: { id?: unknown } | undefined
  try {
    if (persistence && typeof persistence.list === 'function') {
      const headers = (await persistence.list()) as Array<{ id?: unknown }>
      header = headers.find((h) => String(h.id) === String(id))
    }
  } catch (err) {
    ctx.logger?.warn?.('[width-slider] header list failed', err)
  }
  const commit = async (): Promise<{ ok: boolean; code?: string; message?: string }> => {
    if (header !== undefined && persistence && typeof persistence.locate === 'function') {
      try {
        const location = await persistence.locate(header)
        if (typeof location?.path !== 'string') {
          return { ok: false, code: 'locate-failed', message: '无法定位会话数据目录' }
        }
        const sessionDirectory = dirname(location.path)
        // 关键校验：目录名必须等于会话 id，防布局变化时误删整个根目录。
        if (basename(sessionDirectory) !== String(id)) {
          return { ok: false, code: 'unsafe-path', message: '会话目录结构异常，已取消删除' }
        }
        await rm(sessionDirectory, { recursive: true, force: true, ...RM_RETRY })
        try {
          await lstat(sessionDirectory)
          return { ok: false, code: 'delete-unconfirmed', message: '会话目录删除未确认' }
        } catch (err) {
          if ((err as { code?: string })?.code !== 'ENOENT') throw err
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        ctx.logger?.warn?.('[width-slider] session data removal failed', err)
        return { ok: false, code: 'remove-failed', message }
      }
    }
    // 从 workspace registry detach + 清理内存索引。
    try {
      if (registry) {
        const workspaces = typeof registry.list === 'function' ? await registry.list() : []
        const wsList = Array.isArray(workspaces) ? workspaces : []
        for (const workspace of wsList as AnyRecord[]) {
          const sessionIds = Array.isArray(workspace?.sessionIds)
            ? workspace.sessionIds.map(String)
            : []
          if (sessionIds.includes(String(id)) && typeof workspace.detachSession === 'function') {
            await workspace.detachSession(String(id))
          }
        }
        for (const key of ['headers', 'sessionPaths', 'invalidSessionPaths']) {
          const map = registry[key]
          if (map instanceof Map) map.delete(String(id))
        }
      }
    } catch (err) {
      ctx.logger?.warn?.('[width-slider] workspace detach failed', err)
      return { ok: false, code: 'detach-failed', message: '会话数据已删除，但工作区索引清理失败（刷新后可自愈）' }
    }
    ctx.logger?.info?.('[width-slider] session deleted', { id })
    return { ok: true }
  }
  return commit()
}
