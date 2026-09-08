import { describe, expect, it } from 'vitest'
import { assertCmdSafe, buildSpawnSpec, isValidLaunchPath, type OpenWithCtx } from '../src/host/openWithService.ts'

const CMD = (process.env.windir ?? 'C:\\Windows') + '\\System32\\cmd.exe'

describe('assertCmdSafe', () => {
  it('放行含空格/括号的常见路径（libuv 会加引号）', () => {
    expect(() =>
      assertCmdSafe(['C:\\Program Files (x86)\\App\\app.exe', '--new-window', 'C:\\Users\\a b\\proj']),
    ).not.toThrow()
  })

  it('拒绝会被 cmd 解释的元字符', () => {
    const bad = [
      'C:\\a&b\\x.exe',
      'C:\\a|b',
      'C:\\a>b',
      'C:\\a<b',
      'C:\\a^b',
      'C:\\a%b',
      'C:\\a"b',
      'C:\\a!b',
      'C:\\a\nb',
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
})

describe('buildSpawnSpec', () => {
  const ctx = { subprocess: { resolveExecutable: async () => process.execPath } } as unknown as OpenWithCtx

  it('cmd 分支经 cmd /c start 启动', async () => {
    const argv = await buildSpawnSpec(ctx, 'cmd', 'C:\\Users')
    expect(argv.slice(0, 5)).toEqual([CMD, '/c', 'start', '', CMD])
    expect(argv).toContain('/K')
  })

  it('powershell 分支经 cmd /c start 启动', async () => {
    const argv = await buildSpawnSpec(ctx, 'powershell', 'C:\\Users')
    expect(argv.slice(0, 4)).toEqual([CMD, '/c', 'start', ''])
    expect(argv).toContain('-NoExit')
  })

  it('explorer 分支用相对目录 .（由 spawn cwd 承载）', async () => {
    const argv = await buildSpawnSpec(ctx, 'explorer', 'C:\\Users')
    expect(argv[argv.length - 1]).toBe('.')
    expect(argv.join(' ')).not.toContain('C:\\Users')
  })

  it('code 分支传绝对目录 + --new-window（转接已有实例时相对路径会被错误解析）', async () => {
    const argv = await buildSpawnSpec(ctx, 'code', 'C:\\Users')
    expect(argv).toContain('--new-window')
    expect(argv).toContain('C:\\Users')
  })

  it('未知目标抛错', async () => {
    await expect(buildSpawnSpec(ctx, 'nope', 'C:\\Users')).rejects.toThrow()
  })
})
