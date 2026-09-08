import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertCmdSafe,
  buildSpawnSpec,
  isValidLaunchPath,
  spawnViaStart,
  type OpenWithCtx,
} from '../src/host/openWithService.ts'

const WINDIR = process.env.windir ?? 'C:\\Windows'
const CMD = WINDIR + '\\System32\\cmd.exe'
const PS = WINDIR + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
const EXPLORER = WINDIR + '\\explorer.exe'

describe('assertCmdSafe', () => {
  it('放行含空格/括号/插入符/叹号的常见路径（引号内是字面量）', () => {
    expect(() =>
      assertCmdSafe(['C:\\Program Files (x86)\\App\\app.exe', '--new-window', 'C:\\Users\\a b\\proj']),
    ).not.toThrow()
    expect(() => assertCmdSafe(['C:\\a^b\\x.exe'])).not.toThrow()
    expect(() => assertCmdSafe(['C:\\a!b\\x.exe'])).not.toThrow()
  })

  it('拒绝会被 cmd 解释的元字符与控制字符', () => {
    const bad = [
      'C:\\a&b\\x.exe',
      'C:\\a|b',
      'C:\\a>b',
      'C:\\a<b',
      'C:\\a%b',
      'C:\\a"b',
      'C:\\a\rb',
      'C:\\a\tb',
    ]
    for (const value of bad) {
      expect(() => assertCmdSafe([value]), value).toThrow()
    }
  })
})

describe('isValidLaunchPath', () => {
  it('接受存在的本地 .exe 绝对路径', () => {
    expect(isValidLaunchPath(process.execPath)).toBe(true)
  })

  it('拒绝 UNC / 非 exe / 不存在 / 含元字符 / 相对路径', () => {
    expect(isValidLaunchPath('\\\\server\\share\\a.exe')).toBe(false)
    expect(isValidLaunchPath('C:\\Windows\\notepad.txt')).toBe(false)
    expect(isValidLaunchPath('C:\\nope\\nope.exe')).toBe(false)
    expect(isValidLaunchPath('C:\\a&b\\a.exe')).toBe(false)
    expect(isValidLaunchPath('relative\\a.exe')).toBe(false)
    expect(isValidLaunchPath('')).toBe(false)
  })

  it('拒绝以 .exe 结尾的目录（statIsFile 生效）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ws-test-'))
    const exeDir = join(dir, 'a.exe')
    mkdirSync(exeDir)
    expect(isValidLaunchPath(exeDir)).toBe(false)
  })
})

describe('buildSpawnSpec', () => {
  const ctx = { subprocess: { resolveExecutable: async () => process.execPath } } as unknown as OpenWithCtx

  it('cmd 分支：完整 argv 经 cmd /c start', async () => {
    expect(await buildSpawnSpec(ctx, 'cmd', 'C:\\Users')).toEqual([
      CMD,
      '/c',
      'start',
      '',
      CMD,
      '/K',
      'title width-slider-cmd',
    ])
  })

  it('powershell 分支：完整 argv 经 cmd /c start', async () => {
    expect(await buildSpawnSpec(ctx, 'powershell', 'C:\\Users')).toEqual([CMD, '/c', 'start', '', PS, '-NoExit'])
  })

  it('explorer 分支：用相对目录 .（由 spawn cwd 承载，命令行不含用户路径）', async () => {
    expect(await buildSpawnSpec(ctx, 'explorer', 'C:\\Users')).toEqual([CMD, '/c', 'start', '', EXPLORER, '.'])
  })

  it('code 分支：绝对目录 + --new-window（转接已有实例时相对路径会被错误解析）', async () => {
    const argv = await buildSpawnSpec(ctx, 'code', 'C:\\Users')
    expect(argv).toEqual([CMD, '/c', 'start', '', process.execPath, '--new-window', 'C:\\Users'])
  })

  it('未知目标抛错', async () => {
    await expect(buildSpawnSpec(ctx, 'nope', 'C:\\Users')).rejects.toThrow()
  })
})

describe('spawnViaStart', () => {
  const fakeSp = (handle: unknown): NonNullable<OpenWithCtx['subprocess']> =>
    ({ spawn: () => handle }) as unknown as NonNullable<OpenWithCtx['subprocess']>

  it('成功：exitCode 0', async () => {
    const sp = fakeSp({ pid: 9, done: Promise.resolve({ exitCode: 0 }), collected: { stderr: { readFrom: () => null } } })
    const result = await spawnViaStart(sp, ['cmd'], 'C:\\Users', 100)
    expect(result).toEqual({ pid: 9, exitCode: 0, stderr: '', timedOut: false })
  })

  it('非零退出：回传 exitCode 与 stderr', async () => {
    const sp = fakeSp({
      pid: 8,
      done: Promise.resolve({ exitCode: 1 }),
      collected: { stderr: { readFrom: () => ({ text: 'boom' }) } },
    })
    const result = await spawnViaStart(sp, ['cmd'], 'C:\\Users', 100)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toBe('boom')
    expect(result.timedOut).toBe(false)
  })

  it('超时：判失败并终止挂起的进程', async () => {
    let terminated = false
    const sp = fakeSp({
      pid: 7,
      done: new Promise(() => {}),
      terminate: () => {
        terminated = true
      },
    })
    const result = await spawnViaStart(sp, ['cmd'], 'C:\\Users', 10)
    expect(result.timedOut).toBe(true)
    expect(result.exitCode).toBeNull()
    expect(terminated).toBe(true)
  })
})
