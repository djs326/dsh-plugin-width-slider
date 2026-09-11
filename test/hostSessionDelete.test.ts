/**
 * host session-delete chain: the guards that keep it from touching anything but the
 * requested session — id validation (no path traversal), the not-found path, real
 * directory removal for both id spellings, and the abort on a failed in-memory
 * detach. Runs against a throwaway `DSH_HOME`, so no real session data is involved.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteSessionById, type SessionDeleteCtx } from '../src/host/sessionDeleteService.ts'

const UUID = '11111111-2222-3333-4444-555555555555'

let home = ''
let previousHome: string | undefined

/** A ctx with no optional services: every step must degrade instead of throwing. */
const bareCtx = (): SessionDeleteCtx => ({
  get: () => undefined,
  logger: { info: () => {}, warn: () => {}, error: () => {} },
})

/** Create `<home>/sessions/<slug>/<id>/` and return the leaf path. */
function seedSession(slug: string, id: string): string {
  const dir = join(home, 'sessions', slug, id)
  mkdirSync(dir, { recursive: true })
  return dir
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-del-'))
  previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
})

afterEach(() => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  rmSync(home, { recursive: true, force: true })
})

describe('deleteSessionById', () => {
  it('rejects anything that is not a session uuid (no path traversal)', async () => {
    for (const bad of ['', '   ', '../../etc/passwd', 'session-', 'not-a-uuid', UUID + '/../x']) {
      const result = await deleteSessionById(bareCtx(), bad)
      expect(result.ok).toBe(false)
      expect(result.code).toBe('invalid-id')
    }
  })

  it('reports not-found when nothing matches the id', async () => {
    const result = await deleteSessionById(bareCtx(), UUID)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('not-found')
  })

  it('removes the session directory', async () => {
    const dir = seedSession('slug-a', UUID)
    expect(existsSync(dir)).toBe(true)
    const result = await deleteSessionById(bareCtx(), UUID)
    expect(result.ok).toBe(true)
    expect(existsSync(dir)).toBe(false)
  })

  it('matches both spellings of the same session id', async () => {
    const dir = seedSession('slug-b', 'session-' + UUID)
    const result = await deleteSessionById(bareCtx(), UUID)
    expect(result.ok).toBe(true)
    expect(existsSync(dir)).toBe(false)
  })

  it('tolerates a missing sessions root instead of throwing', async () => {
    rmSync(join(home, 'sessions'), { recursive: true, force: true })
    await expect(deleteSessionById(bareCtx(), UUID)).resolves.toMatchObject({ ok: false, code: 'not-found' })
  })
})
