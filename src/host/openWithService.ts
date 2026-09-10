/**
 * openWithService.ts — Open With（对话头部"用其他应用打开"）host 服务。
 *
 * 整合自 dsh-plugin-open-with（修改版：本地验证有效的 actions 槽位修复版）。
 * 上游：https://github.com/hyrinx/dsh-plugin-open-with（MIT，Copyright (c)
 * 2026 hyrinx <xhy_23@qq.com>；完整归属声明见 THIRD_PARTY_NOTICES.md）。
 * 转写自上游 lib/index.js（lib/client.js 构建产物的 host 半部），行为等价：
 * - /open-with RPC：log / extractIcon / resolvePresetPath / readSettings /
 *   writeSettings / launch；
 * - 设置文件沿用 $DSH_HOME/storages/dsh-open-with/settings.json（与官方及
 *   用户本地版本共用同一数据文件，停用官方插件后配置无缝保留）；
 * - launch 目标：预设 code/cmd/powershell/explorer + 自定义项（settings 中
 *   id 对应、preset=false、带 path）；
 * - 图标提取：PowerShell System.Drawing ExtractAssociatedIcon → base64 PNG。
 *
 * 差异：用 ctx.logger 输出日志（上游为自建文件 logger，整合后不再留独立
 * 日志文件）；client 的 log endpoint 转发到 ctx.logger。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, join } from 'node:path'
import { dshHomePath } from '../shared/dshHome.ts'

// ── 设置文件存储路径：与官方/用户本地版本共用，迁移零成本 ──────────────

const SETTINGS_DIR = dshHomePath('storages', 'dsh-open-with')
const SETTINGS_FILE = join(SETTINGS_DIR, 'settings.json')

/** 读取设置文件；不存在/损坏时返回 null（保持上游语义）。 */
/** 默认结构（与官方 dsh-plugin-open-with 一致：4 预设 + code 当前）。 */
function defaultOpenWithSettings(): { currentId: string; items: Array<Record<string, unknown>>; hiddenIds: string[] } {
  return {
    currentId: 'code',
    items: [
      { id: 'code', name: 'VS Code', path: 'code', icon: '', preset: true, target: 'code' },
      { id: 'cmd', name: 'Command Prompt', path: 'cmd', icon: '', preset: true, target: 'cmd' },
      { id: 'powershell', name: 'PowerShell', path: 'powershell', icon: '', preset: true, target: 'powershell' },
      { id: 'explorer', name: 'File Explorer', path: 'explorer', icon: '', preset: true, target: 'explorer' },
    ],
    hiddenIds: [],
  }
}

function readSettingsFile(): unknown {
  try {
    if (!existsSync(SETTINGS_FILE)) return null
    return JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8')) as unknown
  } catch {
    return null
  }
}

/**
 * open-with 设置结构运行时校验（host 侧纵深：设置文件可能被本机进程改写，
 * client 可能被同源脚本调 writeSettings 植入任意结构）。校验通过才落盘，
 * launch/渲染据此保持可信。
 */
function isValidOpenWithSettings(raw: unknown): raw is { currentId: string; items: unknown[]; hiddenIds: unknown[] } {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  if (typeof o.currentId !== 'string' || o.currentId.length === 0 || o.currentId.length > 64) return false
  if (!Array.isArray(o.items) || o.items.length > 64) return false
  const ids = new Set<string>()
  for (const it of o.items) {
    if (!it || typeof it !== 'object') return false
    const item = it as Record<string, unknown>
    if (typeof item.id !== 'string' || item.id.length === 0 || item.id.length > 64) return false
    if (ids.has(item.id)) return false
    ids.add(item.id)
    if (typeof item.name !== 'string' || item.name.length === 0 || item.name.length > 200) return false
    if (typeof item.path !== 'string' || item.path.length === 0 || item.path.length > 1024) return false
    if (typeof item.icon !== 'string' || item.icon.length > 2_000_000) return false
    if (typeof item.preset !== 'boolean') return false
    if (item.target !== undefined && typeof item.target !== 'string') return false
  }
  if (!Array.isArray(o.hiddenIds) || o.hiddenIds.length > 64) return false
  for (const hid of o.hiddenIds) {
    if (typeof hid !== 'string' || !ids.has(hid)) return false
  }
  return ids.has(o.currentId)
}

/**
 * cmd 元字符：出现在未经引号包裹的命令行参数里会被 cmd.exe 解释
 * （libuv 只在参数含空格时加引号，`C:\a&b\proj` 这类路径会被截断并执行）。
 * 故意不放行的字符：`& | < > %"` 与控制字符。放行的字符：括号与空格
 * （`C:\Program Files (x86)\…` 含空格必然被引号包裹）、`^`（引号内为字面量）、
 * `!`（cmd /c 默认不启用 delayed expansion）——否则大量合法路径会被误封。
 */
const CMD_METACHAR_RE = /[&|<>%"\r\n\t]/

/** 进入 cmd 命令行的参数安全校验；命中元字符即抛错（由 launch 的 catch 转成失败）。 */
export function assertCmdSafe(values: string[]): void {
  for (const value of values) {
    if (CMD_METACHAR_RE.test(value)) throw new Error('unsafe characters for cmd in argument: ' + value)
  }
}

/** 自定义启动项路径校验：本地绝对路径、.exe/.com、存在、非 UNC、无 cmd 元字符。 */
export function isValidLaunchPath(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0 || p.length > 1024) return false
  if (!isAbsolute(p)) return false
  if (p.startsWith('\\')) return false // 拒绝 UNC（NTLM/SMB 出站面）
  if (CMD_METACHAR_RE.test(p)) return false // 拒绝会被 cmd 解释的路径
  const ext = extname(p).toLowerCase()
  if (ext !== '.exe' && ext !== '.com') return false
  try {
    return existsSync(p) && statIsFile(p)
  } catch {
    return false
  }
}

function statIsFile(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

function statIsDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** 原子写 open-with 设置文件（tmp + rename）。 */
function writeOpenWithSettingsSync(settings: unknown): void {
  mkdirSync(SETTINGS_DIR, { recursive: true })
  const tmp = SETTINGS_FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf-8')
  renameSync(tmp, SETTINGS_FILE)
}

// ── RPC / 启动 最小上下文契约（运行时由 DSH 注入，宽松类型）────────────

export interface OpenWithCtx {
  logger?: {
    info?: (message: string, extra?: unknown) => void
    warn?: (message: string, extra?: unknown) => void
    error?: (message: string, extra?: unknown) => void
  }
  subprocess?: {
    resolveExecutable: (name: string) => Promise<string>
    spawn: (opts: unknown) => unknown
  }
  connection?: {
    rpc: {
      handle: (
        path: string,
        handler: (endpoint: string, payload: unknown) => Promise<unknown>,
      ) => () => void
    }
  }
}

type SpawnHandle = {
  done: Promise<unknown>
  collected?: { stdout?: { readFrom: (n: number) => { text?: string } | null }; stderr?: { readFrom: (n: number) => { text?: string } | null } }
  exitCode?: unknown
}

const PRESET_TARGETS = ['code', 'cmd', 'powershell', 'explorer']

// ── 启动规格 ──────────────────────────────────────────────────────────

/**
 * code 目标的可执行文件（PATH 里是 .cmd/.bat 时向上找 Code.exe）。
 * 路径解析用 node:path 的 dirname/extname（避免手写切片在无扩展名/
 * 无分隔符路径下的退化行为）。
 */
async function resolveCodeExecutable(ctx: OpenWithCtx): Promise<string> {
  const sp = ctx.subprocess
  if (!sp) throw new Error('subprocess service unavailable')
  const resolvedPath = await sp.resolveExecutable('code')
  const ext = extname(resolvedPath).toLowerCase()
  if (ext === '.cmd' || ext === '.bat') {
    const binDir = dirname(resolvedPath)
    const vsCodeDir = dirname(binDir)
    const exePath = join(vsCodeDir, 'Code.exe')
    if (existsSync(exePath)) return exePath
  }
  return resolvedPath
}

// 注意：argv 一律不手工预包引号——libuv/Node 在 Windows 组装命令行时会
// 二次转义（内部引号变 \" 再整体外包），预引号会与 cmd.exe 引号剥离规则叠加
// 导致逃逸或失败。
// 进入 cmd 命令行的每个参数都要过 assertCmdSafe：libuv 只在参数含空格时加
// 引号，`C:\a&b\proj` 这类路径会被 cmd 截断并把 `b\proj` 当命令执行（已实证）。
// 目录能由 spawn 的 cwd 承载就绝不放进命令行（explorer 用 `.`）；VS Code 必须
// 收绝对路径（它可能把请求转给已有实例，相对路径会按对方工作目录解析），故走
// 元字符校验，含危险字符时明确报错而不是静默打开错误目录。

/**
 * 预设目标的启动规格。
 *
 * 关键：dsh 的 subprocess 服务对所有子进程强制 `windowsHide: true`
 * （见 @deepseek-ai/dsh-subprocess-local 的 spawnSubprocess），直接 spawn 的
 * GUI/控制台程序虽然进程起来了，但窗口不会显示（实测 VS Code 主进程
 * MainWindowHandle=0）。因此统一经 `cmd.exe /c start "" <program> <args...>`
 * 启动：start 创建的是一个不受父进程隐藏标志约束的独立进程，窗口正常显示。
 * 空标题 "" 必须保留，否则 start 会把第一个带引号的参数当窗口标题。
 */
export async function buildSpawnSpec(ctx: OpenWithCtx, target: string, cwd: string): Promise<string[]> {
  const windir = process.env.windir ?? 'C:\\Windows'
  const cmdExe = windir + '\\System32\\cmd.exe'
  /** 经 cmd start 启动，使目标进程脱离 DSH 子进程的 windowsHide 约束。 */
  const viaStart = (program: string, args: string[]): string[] => {
    // 启动前预检：程序不存在时 start 会弹出（被 windowsHide 隐掉的）错误对话框
    // 并阻塞不退出，调用方 await done 会永久挂起。宁可在进入 cmd 前就失败。
    if (program !== 'explorer.exe' && !existsSync(program)) {
      throw new Error('program not found: ' + program)
    }
    assertCmdSafe([program, ...args])
    return [cmdExe, '/c', 'start', '', program, ...args]
  }
  switch (target) {
    case 'code': {
      const exe = await resolveCodeExecutable(ctx)
      // VS Code CLI 必须带绝对路径才会打开目标文件夹（相对路径在「转接给
      // 已有实例」时会按对方工作目录解析）；--new-window 保证窗口弹到前台。
      return viaStart(exe, ['--new-window', cwd])
    }
    case 'cmd': {
      // title 值含空格（libuv 会引号包裹），cmd 只把它当窗口标题。
      return viaStart(cmdExe, ['/K', 'title width-slider-cmd'])
    }
    case 'powershell': {
      return viaStart(resolvePresetPath('powershell'), ['-NoExit'])
    }
    case 'explorer': {
      // explorer.exe 无参数默认打开"快速访问"，必须显式传目录；`.` 由进程
      // 工作目录（spawn cwd）解析。
      return viaStart(resolvePresetPath('explorer'), ['.'])
    }
    default:
      throw new Error('unknown launch target: ' + String(target))
  }
}

/** start 成功时 cmd 实测 0.1–0.5s 内退出；超过此时间视为已把请求转交出去。 */
/**
 * cmd 等待上限：成功路径实测 0.15–0.5s；目标无法启动时 cmd 会挂在被
 * windowsHide 隐掉的错误对话框上，实测 1.1–3.1s 且上不封顶。取 8s 既不会
 * 误判慢机器上的成功启动，也能在合理时间内给出失败结论。
 */
const START_SETTLE_MS = 8_000

/**
 * 经 cmd start 启动并等待 cmd 退出（start 立即返回，不等目标进程）。
 *
 * 目标无法启动时 cmd 弹错误对话框（被 windowsHide 隐掉）并阻塞不退出，
 * handle.done 永不 settle，直接 await 会让 launch RPC 永久挂起。因此用超时
 * 兜底：超时按**失败**上报并主动 terminate（否则每次失败都留下一个挂起的
 * cmd 进程与句柄）。成功路径的 exitCode 为 0，失败为非零。
 */
export async function spawnViaStart(
  sp: NonNullable<OpenWithCtx['subprocess']>,
  argv: string[],
  cwd: string,
  settleMs: number = START_SETTLE_MS,
): Promise<{ exitCode: number | null; stderr: string; timedOut: boolean }> {
  const handle = sp.spawn({
    argv,
    cwd,
    stdio: { stdin: 'ignore', stdout: { maxBytes: 64 * 1024 }, stderr: { maxBytes: 64 * 1024 } },
    graceMs: 5e3,
  }) as SpawnHandle
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), settleMs)
  })
  let outcome: { exitCode?: number | null } | null
  try {
    outcome = (await Promise.race([Promise.resolve(handle.done), timeout])) as { exitCode?: number | null } | null
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
  if (outcome === null) {
    try {
      ;(handle as { terminate?: () => void }).terminate?.()
    } catch { /* 终止失败不影响上报 */ }
    return { exitCode: null, stderr: '', timedOut: true }
  }
  const exitCode = typeof outcome.exitCode === 'number' ? outcome.exitCode : null
  return { exitCode, stderr: handle.collected?.stderr?.readFrom(0)?.text ?? '', timedOut: false }
}

// ── 图标提取（PowerShell System.Drawing）────────────────────────────

/** 图标缓存（exePath → data URL；成功缓存，失败不缓存）。 */
const iconCache = new Map<string, string>()
/** 进行中的提取（同 path 去重，防并发进程风暴）。 */
const iconInflight = new Map<string, Promise<string>>()

/** 从 exe 提取图标，返回 base64 PNG data URL；失败/无图标返回空串。 */
async function extractFileIcon(ctx: OpenWithCtx, exePath: string): Promise<string> {
  const cached = iconCache.get(exePath)
  if (cached !== undefined) return cached
  const inflight = iconInflight.get(exePath)
  if (inflight !== undefined) return inflight
  const promise = doExtractFileIcon(ctx, exePath).then((icon) => {
    iconInflight.delete(exePath)
    if (icon !== '') iconCache.set(exePath, icon)
    return icon
  }).catch((err: unknown) => {
    iconInflight.delete(exePath)
    throw err
  })
  iconInflight.set(exePath, promise)
  return promise
}

async function doExtractFileIcon(ctx: OpenWithCtx, exePath: string): Promise<string> {
  const sp = ctx.subprocess
  if (!sp) throw new Error('subprocess service unavailable')
  if (!isValidLaunchPath(exePath)) {
    ctx.logger?.warn?.('extractIcon rejected path', { exePath })
    return ''
  }
  const escapedPath = exePath.replace(/'/g, "''")
  const psScript = [
    "$ErrorActionPreference = 'Stop'",
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    'Add-Type -AssemblyName System.Drawing -ErrorAction Stop',
    "$icon = [System.Drawing.Icon]::ExtractAssociatedIcon('" + escapedPath + "')",
    'if (!$icon) { exit 0 }',
    '$bitmap = $icon.ToBitmap()',
    '$ms = New-Object System.IO.MemoryStream',
    '$bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)',
    '$bytes = $ms.ToArray()',
    '$base64 = [Convert]::ToBase64String($bytes)',
    'Write-Output "data:image/png;base64,$base64"',
    '$ms.Close(); $bitmap.Dispose(); $icon.Dispose()',
  ].join('; ')
  const handle = sp.spawn({
    argv: ['powershell', '-NoProfile', '-NonInteractive', '-Command', psScript],
    stdio: { stdin: 'ignore', stdout: { maxBytes: 2 * 1024 * 1024 }, stderr: { maxBytes: 2 * 1024 * 1024 } },
    graceMs: 15e3,
  }) as SpawnHandle
  const outcome = (await handle.done) as { exitCode?: number }
  const stderr = handle.collected?.stderr?.readFrom(0)?.text ?? ''
  if (outcome.exitCode !== 0) {
    ctx.logger?.error?.('extractIcon PowerShell failed', { exePath, exitCode: outcome.exitCode, stderr })
    return ''
  }
  if (stderr) ctx.logger?.warn?.('extractIcon PowerShell stderr', { exePath, stderr })
  const stdout = handle.collected?.stdout?.readFrom(0)?.text ?? ''
  const raw = stdout.trim()
  // 输出防御：只接受 base64 PNG data URL；任何其它内容（错误文本/对象 ToString）
  // 一律丢弃返回空串，防止坏数据被 client 持久化进共用设置文件。
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(raw)) {
    ctx.logger?.warn?.('extractIcon returned non-image output', { exePath, stdoutLen: raw.length, head: raw.slice(0, 60) })
    return ''
  }
  ctx.logger?.info?.('extractIcon done', { exePath, dataLen: raw.length })
  return raw
}

/** 预设启动器实际路径（cmd/powershell/explorer；code 返回 "code" 由调用方 resolve）。 */
function resolvePresetPath(target: string): string {
  const windir = process.env.windir ?? 'C:\\Windows'
  switch (target) {
    case 'cmd': return windir + '\\System32\\cmd.exe'
    case 'powershell': return windir + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    case 'explorer': return windir + '\\explorer.exe'
    case 'code': return 'code'
    default: return ''
  }
}

// ── endpoint 分派 ─────────────────────────────────────────────────────

function ok(value: unknown): Record<string, unknown> {
  return { ok: true, value: value ?? null }
}

function fail(code: string, message: string): Record<string, unknown> {
  return { ok: false, error: { code, message } }
}

export async function handleOpenWithEndpoint(ctx: OpenWithCtx, endpoint: string, payload: unknown): Promise<unknown> {
  const body = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  if (endpoint === 'log') {
    const { level = 'info', message = '', extra } = body
    const msg = String(message)
    const text = '[open-with client] ' + msg
    const logger = ctx.logger
    if (logger) {
      if (level === 'error') logger.error?.(text, extra)
      else if (level === 'warn') logger.warn?.(text, extra)
      else logger.info?.(text, extra)
    }
    return ok(null)
  }
  if (endpoint === 'extractIcon') {
    const { exePath } = body
    if (typeof exePath !== 'string' || exePath.length === 0) return fail('invalid-path', 'exePath is required')
    if (!isValidLaunchPath(exePath)) return fail('invalid-path', 'exePath must be a local .exe path')
    try {
      const icon = await extractFileIcon(ctx, exePath)
      return ok({ icon })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ctx.logger?.error?.('extractIcon failed', err)
      return fail('extract-failed', message)
    }
  }
  if (endpoint === 'resolvePresetPath') {
    const target = body.target
    if (typeof target !== 'string' || !PRESET_TARGETS.includes(target)) return fail('invalid-target', 'target is required')
    try {
      let resolvedPath: string
      if (target === 'code') {
        resolvedPath = await resolveCodeExecutable(ctx)
      } else {
        resolvedPath = resolvePresetPath(target)
      }
      return ok({ path: resolvedPath })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ctx.logger?.error?.('resolvePresetPath failed', err)
      return fail('resolve-failed', message)
    }
  }
  if (endpoint === 'readSettings') {
    try {
      // 无文件（全新安装/从未用官方插件）时返回默认结构，按钮与面板首装即用。
      return ok({ settings: readSettingsFile() ?? defaultOpenWithSettings() })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ctx.logger?.error?.('readSettings failed', err)
      return fail('read-failed', message)
    }
  }
  if (endpoint === 'writeSettings') {
    const { settings } = body
    if (!isValidOpenWithSettings(settings)) return fail('invalid-settings', 'settings structure invalid')
    try {
      writeOpenWithSettingsSync(settings)
      ctx.logger?.info?.('settings saved', { file: SETTINGS_FILE })
      return ok({})
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ctx.logger?.error?.('writeSettings failed', err)
      return fail('write-failed', message)
    }
  }
  if (endpoint === 'setCurrent') {
    // 胶囊按钮选择项后写回 currentId（与设置面板的"设为当前"同源）。
    const { id } = body
    if (typeof id !== 'string' || id.length === 0 || id.length > 64) return fail('invalid-id', 'id is required')
    try {
      const raw = readSettingsFile() ?? defaultOpenWithSettings()
      if (!isValidOpenWithSettings(raw) || !raw.items.some((it) => (it as { id: string }).id === id)) {
        return fail('invalid-id', 'item not found: ' + id)
      }
      writeOpenWithSettingsSync({ ...raw, currentId: id })
      ctx.logger?.info?.('current set', { id })
      return ok({})
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ctx.logger?.error?.('setCurrent failed', err)
      return fail('set-current-failed', message)
    }
  }
  if (endpoint !== 'launch') {
    ctx.logger?.warn?.('unknown endpoint', endpoint)
    return fail('unknown-endpoint', 'unknown endpoint: ' + endpoint)
  }
  // ── launch ──
  const { cwd, target } = body
  if (typeof cwd !== 'string' || cwd.length === 0) {
    ctx.logger?.warn?.('cwd missing or invalid', { cwd })
    return fail('invalid-cwd', 'cwd is required')
  }
  // 与 isValidLaunchPath 同一条本地路径策略：绝对路径、非 UNC、目录真实存在。
  // UNC 会话目录会让 Open With 发起 SMB 连接（NTLM 出站面），直接拒绝。
  if (!isAbsolute(cwd) || cwd.startsWith('\\\\')) {
    ctx.logger?.warn?.('cwd is not a local absolute path', { cwd })
    return fail('invalid-cwd', 'cwd must be a local absolute path')
  }
  if (!statIsDirectory(cwd)) {
    ctx.logger?.warn?.('cwd is not an existing directory', { cwd })
    return fail('invalid-cwd', 'cwd is not an existing directory')
  }
  const targetStr = typeof target === 'string' && target.length > 0 ? target : 'code'
  const isPreset = PRESET_TARGETS.includes(targetStr)
  const sp = ctx.subprocess
  if (!sp) return fail('launch-failed', 'subprocess service unavailable')
  const windir = process.env.windir ?? 'C:\\Windows'
  const cmdExe = windir + '\\System32\\cmd.exe'
  try {
    let argv: string[]
    if (isPreset) {
      argv = await buildSpawnSpec(ctx, targetStr, cwd)
    } else {
      // 自定义项：从设置文件取 id → path（preset=false 且带 path）。
      const settings = readSettingsFile()
      if (!isValidOpenWithSettings(settings)) return fail('invalid-target', 'settings structure invalid')
      const item = settings.items.find((it) => (it as { id: string }).id === targetStr) as
        { id: string; preset?: boolean; path?: string } | undefined
      if (!item || item.preset || !item.path || !isValidLaunchPath(item.path)) {
        return fail('invalid-target', 'custom item not found or not launchable: ' + targetStr)
      }
      // 自定义项同样经 cmd start 启动：直接 spawn 的 GUI 程序窗口不显示
      // （subprocess 服务的 windowsHide 约束）。路径已由 isValidLaunchPath
      // 拒绝 cmd 元字符，并以独立 argv 元素传递（libuv 按需引号）。
      argv = [cmdExe, '/c', 'start', '', item.path]
    }
    const result = await spawnViaStart(sp, argv, cwd)
    if (result.timedOut) {
      ctx.logger?.error?.('launch timed out', { target: targetStr, argv, settleMs: START_SETTLE_MS })
      return fail('launch-failed', 'start did not return within ' + START_SETTLE_MS + 'ms (target likely failed to start)')
    }
    if (result.exitCode !== null && result.exitCode !== 0) {
      const detail = result.stderr.trim()
      ctx.logger?.error?.('launch target failed', { target: targetStr, exitCode: result.exitCode, stderr: detail })
      return fail('launch-failed', 'start exited with code ' + result.exitCode + (detail !== '' ? ': ' + detail : ''))
    }
    ctx.logger?.info?.('spawned', { target: targetStr, argv })
    return ok({ launched: true, target: targetStr })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    ctx.logger?.error?.('launch failed', err)
    if (targetStr === 'code') {
      ctx.logger?.error?.("install \"code\" CLI via VS Code Command Palette: \"Shell Command: Install 'code' command in PATH\"")
    }
    return fail('launch-failed', 'failed to launch ' + targetStr + ': ' + message)
  }
}

/** 注册 /open-with RPC（围栏由 connection 服务统一施加）；返回 disposer（由调用方 ctx.effect 包裹）。 */
export function registerOpenWithRpc(ctx: OpenWithCtx): () => void {
  const handler = ctx.connection?.rpc.handle(
    '/open-with',
    (endpoint: string, payload: unknown) => handleOpenWithEndpoint(ctx, endpoint, payload),
  )
  return handler ?? (() => {})
}
