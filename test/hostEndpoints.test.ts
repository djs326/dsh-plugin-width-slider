/**
 * host endpoint surface (src/index.ts): the settings and workspace-group read/write
 * pairs, the corrupt-file recovery that keeps the evidence, the whitelist merge, and
 * the unknown-method reply. Everything runs against a throwaway `DSH_HOME`; the
 * module is re-imported per test because its paths are resolved at load time.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FEATURE_SETTINGS } from '../src/shared/settings.ts'

const STORAGE_DIR = join('storages', 'dsh-plugin-width-slider')

let home = ''
let previousHome: string | undefined
let mod: typeof import('../src/index.ts') | null = null

const storageDir = (): string => join(home, STORAGE_DIR)
const settingsFile = (): string => join(storageDir(), 'settings.json')
const groupsFile = (): string => join(storageDir(), 'workspace-groups.json')

interface Booted {
  /** Call one endpoint method the way the client does. */
  call: (method: string, payload?: unknown) => Promise<{ ok: boolean; value?: any; error?: any }>
  dispose: () => void
}

/** Drive `apply` with a fake cordis ctx and capture the route it registers. */
function boot(): Booted {
  let route: { fetch: (request: Request) => Promise<Response> } | null = null
  const disposers: (() => void)[] = []
  const baseCtx = {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    effect: (setup: () => unknown): void => {
      const disposer = setup()
      disposers.push(typeof disposer === 'function' ? disposer as () => void : () => {})
    },
    get: (name: string) => (name === 'connection'
      ? { fetch: { register: (r: { fetch: (request: Request) => Promise<Response> }) => { route = r; return () => {} } } }
      : undefined),
  }
  ;(mod as typeof import('../src/index.ts')).apply(baseCtx as never)
  expect(route).not.toBeNull()
  const captured = route as unknown as { fetch: (request: Request) => Promise<Response> }
  return {
    call: async (method: string, payload?: unknown) => {
      const response = await captured.fetch(new Request('http://dsh.invalid/api/width-slider', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, payload }),
      }))
      return await response.json() as { ok: boolean; value?: any; error?: any }
    },
    dispose: () => {
      for (const dispose of disposers.reverse()) dispose()
    },
  }
}

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'dsh-endpoint-'))
  previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  // The module resolves its storage paths at load time, so it must be re-imported
  // after DSH_HOME points at this test's directory.
  vi.resetModules()
  mod = await import('../src/index.ts')
})

afterEach(() => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  rmSync(home, { recursive: true, force: true })
  mod = null
})

describe('host endpoints', () => {
  it('answers readSettings with the defaults when no file exists', async () => {
    const result = await boot().call('readSettings')
    expect(result.ok).toBe(true)
    expect(result.value.settings).toEqual(DEFAULT_FEATURE_SETTINGS)
  })

  it('persists a write and reads it back', async () => {
    const host = boot()
    expect((await host.call('writeSettings', { settings: { widthSlider: false } })).ok).toBe(true)
    expect(existsSync(settingsFile())).toBe(true)
    const onDisk = JSON.parse(readFileSync(settingsFile(), 'utf-8')) as { widthSlider?: boolean }
    expect(onDisk.widthSlider).toBe(false)
    const read = await host.call('readSettings')
    expect(read.value.settings.widthSlider).toBe(false)
    // 其余键由白名单合并补齐默认值。
    expect(read.value.settings.thinkRender).toBe(DEFAULT_FEATURE_SETTINGS.thinkRender)
  })

  it('drops unknown keys instead of persisting them', async () => {
    await boot().call('writeSettings', { settings: { widthSlider: true, nope: 'x' } })
    const onDisk = JSON.parse(readFileSync(settingsFile(), 'utf-8')) as Record<string, unknown>
    expect(onDisk).not.toHaveProperty('nope')
  })

  it('recovers from a corrupt settings file and keeps the evidence', async () => {
    mkdirSync(storageDir(), { recursive: true })
    writeFileSync(settingsFile(), '{ not json', 'utf-8')
    vi.resetModules()
    mod = await import('../src/index.ts')
    const result = await boot().call('readSettings')
    expect(result.ok).toBe(true)
    expect(result.value.settings).toEqual(DEFAULT_FEATURE_SETTINGS)
    // 损坏文件被改名保留，而不是被静默覆盖。
    const files = readdirSync(storageDir())
    expect(files.some((name) => name.startsWith('settings.json.corrupt-'))).toBe(true)
  })

  it('round-trips workspace groups and sanitizes them', async () => {
    const host = boot()
    const written = await host.call('wsGroupsWrite', {
      groups: [
        { id: 'g1', name: '项目', workspaceIds: ['w1', ''] },
        { id: 'g1', name: '重复 id', workspaceIds: [] },
        { id: '', name: '空 id', workspaceIds: [] },
      ],
    })
    expect(written.ok).toBe(true)
    const onDisk = JSON.parse(readFileSync(groupsFile(), 'utf-8')) as { groups: { id: string; name: string; workspaceIds: string[] }[] }
    // 重复 id 与空 id 被丢弃，空 workspaceId 被过滤。
    expect(onDisk.groups).toHaveLength(1)
    expect(onDisk.groups[0]).toEqual({ id: 'g1', name: '项目', workspaceIds: ['w1'] })
    const read = await host.call('wsGroupsRead')
    expect(read.value.groups).toEqual(onDisk.groups)
  })

  it('reports an unknown method instead of failing silently', async () => {
    const result = await boot().call('nope')
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('unknown-endpoint')
  })

  it('rejects sessionDelete without an id', async () => {
    const result = await boot().call('sessionDelete', {})
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('invalid-id')
  })
})
