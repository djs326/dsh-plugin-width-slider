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

/** 自定义启动项路径校验：本地绝对路径、.exe/.com、存在、非 UNC。 */
function isValidLaunchPath(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0 || p.length > 1024) return false
  if (!isAbsolute(p)) return false
  if (p.startsWith('\\')) return false // 拒绝 UNC（NTLM/SMB 出站面）
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
        opts?: { authority: string },
      ) => () => void
    }
  }
}

type SpawnHandle = {
  done: Promise<unknown>
  pid?: unknown
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
// 导致逃逸或失败。目录一律经 spawn 的 cwd 承载（CreateProcess
// lpCurrentDirectory，不经命令行解析），路径作为独立 argv 元素原样传递。

/**
 * 预设目标的 spawn 规格（全部不经 cmd 文本承载用户路径）：
 * - code：exe 直启，argv=[exe, 目录]（目录作为 VS Code CLI 参数，libuv 自动引号）；
 * - cmd/powershell：argv 固定（含窗口标题参数），会话目录由 useSpawnCwd+cwd 承载，
 *   子进程（及它派生的新控制台窗口）启动目录即会话目录；
 * - explorer：exe 直启 + 目录参数。
 */
async function buildSpawnSpec(ctx: OpenWithCtx, target: string, cwd: string): Promise<{ argv: string[]; useSpawnCwd: boolean }> {
  const windir = process.env.windir ?? 'C:\\Windows'
  switch (target) {
    case 'code': {
      const exe = await resolveCodeExecutable(ctx)
      // VS Code CLI 必须带目录参数才会打开该目录（只设 cwd 只会开空窗口或
      // 上次窗口）；目录作为独立 argv 元素交给 libuv 自动引号。
      return { argv: [exe, cwd], useSpawnCwd: true }
    }
    case 'cmd': {
      const cmdPath = windir + '\\System32\\cmd.exe'
      // title 参数用无空格单词，避免经 libuv 引号包裹后 cmd 解析歧义。
      return { argv: [cmdPath, '/K', 'title width-slider-cmd'], useSpawnCwd: true }
    }
    case 'powershell': {
      const psPath = windir + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
      return { argv: [psPath, '-NoExit'], useSpawnCwd: true }
    }
    case 'explorer':
      // explorer.exe 无参数默认打开"快速访问"，目录必须显式作为参数传入
      //（libuv 自动引号，安全）。
      return { argv: ['explorer.exe', cwd], useSpawnCwd: false }
    default:
      throw new Error('unknown launch target: ' + String(target))
  }
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
  const targetStr = typeof target === 'string' && target.length > 0 ? target : 'code'
  const isPreset = PRESET_TARGETS.includes(targetStr)
  const sp = ctx.subprocess
  if (!sp) return fail('launch-failed', 'subprocess service unavailable')
  try {
    if (!isPreset) {
      // 自定义项：从设置文件取 id → path（preset=false 且带 path）。
      const settings = readSettingsFile()
      if (!isValidOpenWithSettings(settings)) return fail('invalid-target', 'settings structure invalid')
      const item = settings.items.find((it) => (it as { id: string }).id === targetStr) as
        { id: string; preset?: boolean; path?: string } | undefined
      if (!item || item.preset || !item.path || !isValidLaunchPath(item.path)) {
        return fail('invalid-target', 'custom item not found or not launchable: ' + targetStr)
      }
      // 自定义项直接 spawn 可执行文件（不经 cmd 二次解析，避免路径中的
      // cmd 元字符如 & | % 被解释）；设置面板限定 .exe 路径。
      const handle = sp.spawn({
        argv: [item.path],
        cwd,
        stdio: { stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' },
        graceMs: 5e3,
      }) as SpawnHandle
      ctx.logger?.info?.('spawned custom item', { target: targetStr, path: item.path, pid: handle.pid })
      Promise.resolve(handle.done).catch((err: unknown) => ctx.logger?.error?.('process exited with error', err))
      return ok({ launched: true, target: targetStr, pid: handle.pid })
    }
    const resolvedTarget = isPreset ? targetStr : 'code'
    if (resolvedTarget === 'code') {
      const exe = await resolveCodeExecutable(ctx)
      ctx.logger?.info?.('resolved code ->', exe)
    }
    const spec = await buildSpawnSpec(ctx, resolvedTarget, cwd)
    const handle = sp.spawn({
      argv: [...spec.argv],
      cwd: spec.useSpawnCwd ? cwd : process.cwd(),
      stdio: { stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' },
      graceMs: 5e3,
    }) as SpawnHandle
    ctx.logger?.info?.('spawned', { target: resolvedTarget, argv: spec.argv, pid: handle.pid })
    Promise.resolve(handle.done).catch((err: unknown) => ctx.logger?.error?.('process exited with error', err))
    return ok({ launched: true, target: resolvedTarget, pid: handle.pid })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    ctx.logger?.error?.('launch failed', err)
    if (targetStr === 'code') {
      ctx.logger?.error?.("install \"code\" CLI via VS Code Command Palette: \"Shell Command: Install 'code' command in PATH\"")
    }
    return fail('launch-failed', 'failed to launch ' + targetStr + ': ' + message)
  }
}

/** 注册 /open-with RPC（loopback 围栏）；返回 disposer（由调用方 ctx.effect 包裹）。 */
export function registerOpenWithRpc(ctx: OpenWithCtx): () => void {
  const handler = ctx.connection?.rpc.handle(
    '/open-with',
    (endpoint: string, payload: unknown) => handleOpenWithEndpoint(ctx, endpoint, payload),
    { authority: 'loopback' },
  )
  return handler ?? (() => {})
}
