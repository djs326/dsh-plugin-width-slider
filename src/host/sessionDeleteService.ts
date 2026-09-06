/**
 * sessionDeleteService.ts — 会话删除 host 服务（v0.5.0，集成参考实现）。
 *
 * 集成自：lsz-asd/dsh-plugin-session-delete（@huanlin/dsh-plugin-session-delete
 * v0.3.1，MIT，仓库 session-delete-ref/）的 deleteSessionCore 删除链：
 *   1. 停止运行中的 agent（cancel + 15s 静默等待）；
 *   2. flush 活动会话；detach 内存 store 条目（两种 id 拼写）；
 *   3. 删除磁盘日志目录 ~/.dsh/sessions/<slug>/<id>（两种拼写扫描，多次
 *      重扫防 dispose 中途重建）；
 *   4. 删除 projection 缓存行（storageDomain session_projcache.sessions）；
 *   5. 目录确认删除后才清 workspace 记账（sessionIds + global
 *      archivedSessionIds）——顺序保证会话不会半删掉进"未分组"。
 * 全部步骤失败时抛"session not found"语义，绝不静默。
 * 上层以 /width-slider RPC sessionDelete{id} 调用（client 侧行级 id 直达）。
 */
import { readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface SessionDeleteCtx {
  logger?: { info?: (m: string, e?: unknown) => void; warn?: (m: string, e?: unknown) => void; error?: (m: string, e?: unknown) => void }
  get: <T = unknown>(name: string) => T | undefined
}

const SESSION_ID_RE = /^(session-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

class DeleteError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function dshHome(): string {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function sessionsRoot(): string {
  return join(dshHome(), 'sessions')
}

/** 会话 id 两种拼写（raw uuid 与 session- 前缀）。 */
function sessionIdVariants(sessionId: string): string[] {
  const variants = new Set<string>([sessionId])
  if (sessionId.startsWith('session-')) {
    variants.add(sessionId.slice('session-'.length))
  } else if (SESSION_ID_RE.test(sessionId)) {
    variants.add('session-' + sessionId)
  }
  return [...variants]
}

/** 扫描 ~/.dsh/sessions/<slug>/<id> 目录（含两拼写）。 */
function findSessionDirs(sessionId: string): string[] {
  const root = sessionsRoot()
  const variants = sessionIdVariants(sessionId)
  type DirEntry = { name: string; isDirectory(): boolean }
  let entries: DirEntry[] = []
  try {
    entries = readdirSync(root, { withFileTypes: true }) as unknown as DirEntry[]
  } catch {
    return []
  }
  const found: string[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    for (const variant of variants) {
      const candidate = join(root, e.name, variant)
      try {
        if (statSync(candidate).isDirectory() && !found.includes(candidate)) found.push(candidate)
      } catch { /* keep scanning */ }
    }
  }
  return found
}

function removeSessionDirs(sessionId: string): boolean {
  const dirs = findSessionDirs(sessionId)
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
  return dirs.length > 0
}

/** 清 projection 与 workspace 记账（storageDomain KvTable/global）。 */
async function stripStorageDomains(
  ctx: SessionDeleteCtx,
  sessionId: string,
  opts: { workspace: boolean },
): Promise<{ projRemoved: boolean; workspaceRemoved: boolean }> {
  const sd = ctx.get<{
    get: (name: string) => {
      table?: (name: string) => {
        get: (k: string) => unknown
        put: (k: string, v: unknown) => Promise<unknown>
        delete: (k: string) => Promise<unknown>
        entries: () => Iterable<[string, unknown]>
      }
      global?: { get: () => unknown; set: (v: unknown) => Promise<unknown> }
    } | undefined
  }>('storageDomain')
  if (!sd) return { projRemoved: false, workspaceRemoved: false }
  const variants = sessionIdVariants(sessionId)
  let projRemoved = false
  let workspaceRemoved = false

  const proj = sd.get('session_projcache')
  if (proj && typeof proj.table === 'function') {
    try {
      const sessions = proj.table('sessions')
      for (const variant of variants) {
        if (sessions.get(variant) !== undefined) {
          await sessions.delete(variant)
          projRemoved = true
        }
      }
    } catch { /* unit closed or table absent */ }
  }

  if (opts.workspace) {
    const ws = sd.get('workspace')
    if (ws && typeof ws.table === 'function') {
      try {
        const workspaces = ws.table('workspaces')
        for (const [wid, rec] of workspaces.entries()) {
          const r = rec as { sessionIds?: unknown } | null
          if (r && Array.isArray(r.sessionIds) && variants.some((v) => (r.sessionIds as string[]).includes(v))) {
            await workspaces.put(wid, {
              ...r,
              sessionIds: (r.sessionIds as string[]).filter((x) => !variants.includes(x)),
            })
            workspaceRemoved = true
          }
        }
      } catch { /* unit closed */ }
      try {
        const g = ws.global
        if (g && typeof g.get === 'function' && typeof g.set === 'function') {
          const state = g.get() as { archivedSessionIds?: unknown } | null
          if (state && Array.isArray(state.archivedSessionIds) && variants.some((v) => (state.archivedSessionIds as string[]).includes(v))) {
            await g.set({
              ...state,
              archivedSessionIds: (state.archivedSessionIds as string[]).filter((x) => !variants.includes(x)),
            })
            workspaceRemoved = true
          }
        }
      } catch { /* no global slot */ }
    }
  }
  return { projRemoved, workspaceRemoved }
}

// ── live 会话处置 ────────────────────────────────────────────────────

async function stopAgentIfRunning(ctx: SessionDeleteCtx, sessionId: string): Promise<boolean> {
  const agents = ctx.get<{ get: (id: string) => { cancel?: (o: unknown) => void; whenIdle?: () => Promise<unknown> } | undefined }>('agents')
  if (!agents || typeof agents.get !== 'function') return false
  const agent = agents.get(sessionId)
  if (!agent) return false
  if (typeof agent.cancel === 'function') {
    try {
      agent.cancel({ kind: 'user' })
    } catch { /* already settling */ }
  }
  if (typeof agent.whenIdle === 'function') {
    try {
      await Promise.race([agent.whenIdle(), new Promise((resolve) => setTimeout(resolve, 15000))])
    } catch { /* proceed */ }
  }
  return true
}

async function flushSessionIfLive(ctx: SessionDeleteCtx, sessionId: string): Promise<boolean> {
  const sessions = ctx.get<{ get: (id: string) => unknown; flush?: (s: unknown) => Promise<unknown> }>('sessions')
  if (!sessions || typeof sessions.get !== 'function') return false
  let flushed = false
  for (const variant of sessionIdVariants(sessionId)) {
    const session = sessions.get(variant)
    if (!session) continue
    if (typeof sessions.flush === 'function') {
      try {
        await sessions.flush(session)
        flushed = true
      } catch { /* deletion proceeds */ }
    }
  }
  return flushed
}

function detachLiveSession(ctx: SessionDeleteCtx, sessionId: string): boolean {
  const sessions = ctx.get<{
    store?: { get?: (k: string) => unknown; delete?: (k: string) => void }
    detachEntered?: (entry: unknown) => void
    attachments?: { delete?: (k: unknown) => void }
  }>('sessions')
  if (!sessions) return false
  let detached = false
  try {
    const store = sessions.store
    for (const variant of sessionIdVariants(sessionId)) {
      const entry = store && typeof store.get === 'function' ? store.get(variant) : undefined
      if (entry === undefined) continue
      if (typeof sessions.detachEntered === 'function') {
        sessions.detachEntered(entry)
        detached = true
      } else if (store && typeof store.delete === 'function') {
        store.delete(variant)
        const s = entry as { session?: unknown } | null
        if (sessions.attachments && s?.session && typeof sessions.attachments.delete === 'function') {
          sessions.attachments.delete(s.session)
        }
        detached = true
      }
    }
  } catch { /* ignore */ }
  return detached
}

// ── 删除核心（顺序：目录 → projection → workspace 记账）──────────────

export async function deleteSessionById(ctx: SessionDeleteCtx, id: string): Promise<{ ok: boolean; code?: string; message?: string }> {
  const sessionId = String(id ?? '').trim()
  if (!SESSION_ID_RE.test(sessionId)) {
    return { ok: false, code: 'invalid-id', message: 'invalid session id: ' + sessionId }
  }
  try {
    await stopAgentIfRunning(ctx, sessionId)
    await flushSessionIfLive(ctx, sessionId)
    detachLiveSession(ctx, sessionId)

    const firstDirRemoved = removeSessionDirs(sessionId)
    const projStorage = await stripStorageDomains(ctx, sessionId, { workspace: false })
    const secondDirRemoved = removeSessionDirs(sessionId)
    await new Promise((resolve) => setImmediate(resolve))
    const thirdDirRemoved = removeSessionDirs(sessionId)

    const remainingDirs = findSessionDirs(sessionId)
    if (remainingDirs.length > 0) {
      return { ok: false, code: 'remove-failed', message: 'session files could not be fully removed: ' + remainingDirs.join(', ') }
    }

    const workspaceStorage = await stripStorageDomains(ctx, sessionId, { workspace: true })
    const dirRemoved = firstDirRemoved || secondDirRemoved || thirdDirRemoved
    const projRemoved = projStorage.projRemoved || workspaceStorage.projRemoved
    const workspaceRemoved = workspaceStorage.workspaceRemoved
    if (!dirRemoved && !projRemoved && !workspaceRemoved) {
      return { ok: false, code: 'not-found', message: 'session not found: ' + sessionId }
    }
    ctx.logger?.info?.('[width-slider] session deleted', { sessionId, dirRemoved, projRemoved, workspaceRemoved })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    ctx.logger?.warn?.('[width-slider] delete failed', err)
    return { ok: false, code: 'delete-failed', message }
  }
}
