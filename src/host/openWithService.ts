/**
 * openWithService.ts — Open With（对话头部"用其他应用打开"）host 服务。
 *
 * 收编自 dsh-plugin-open-with（修改版：本地验证有效的 actions 槽位修复版）。
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
 * 差异：用 ctx.logger 输出日志（上游为自建文件 logger，收编后不再留独立
 * 日志文件）；client 的 log endpoint 转发到 ctx.logger。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dshHomePath } from '../shared/dshHome.ts'

// ── 设置文件存储路径：与官方/用户本地版本共用，迁移零成本 ──────────────

const SETTINGS_DIR = dshHomePath('storages', 'dsh-open-with')
const SETTINGS_FILE = join(SETTINGS_DIR, 'settings.json')

/** 读取设置文件；不存在/损坏时返回 null（保持上游语义）。 */
function readSettingsFile(): unknown {
  try {
    if (!existsSync(SETTINGS_FILE)) return null
    return JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8')) as unknown
  } catch {
    return null
  }
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

/** code 目标的可执行文件（PATH 里是 .cmd/.bat 时向上找 Code.exe）。 */
async function resolveCodeExecutable(ctx: OpenWithCtx): Promise<string> {
  const sp = ctx.subprocess
  if (!sp) throw new Error('subprocess service unavailable')
  const resolvedPath = await sp.resolveExecutable('code')
  const ext = resolvedPath.slice(resolvedPath.lastIndexOf('.')).toLowerCase()
  if (ext === '.cmd' || ext === '.bat') {
    const binDir = resolvedPath.slice(0, resolvedPath.lastIndexOf('\\'))
    const vsCodeDir = binDir.slice(0, binDir.lastIndexOf('\\'))
    const exePath = join(vsCodeDir, 'Code.exe')
    if (existsSync(exePath)) return exePath
  }
  return resolvedPath
}

/** 预设目标的 argv 组装（cmd start / 直接 argv 两种形态）。 */
async function buildSpawnSpec(ctx: OpenWithCtx, target: string, cwd: string): Promise<{ argv: string[]; useSpawnCwd: boolean }> {
  const windir = process.env.windir ?? 'C:\\Windows'
  switch (target) {
    case 'code': {
      const exe = await resolveCodeExecutable(ctx)
      return { argv: ['cmd', '/c', exe, cwd], useSpawnCwd: false }
    }
    case 'cmd': {
      const cmdPath = windir + '\\System32\\cmd.exe'
      const escapedCwd = cwd.includes(' ') ? '"' + cwd + '"' : cwd
      return {
        argv: ['cmd', '/c', 'start', '"' + cmdPath + '"', 'cmd', '/K', 'title ' + cmdPath + ' && cd /d ' + escapedCwd],
        useSpawnCwd: false,
      }
    }
    case 'powershell': {
      const psPath = windir + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
      const escapedCwd = cwd.replace(/'/g, "''")
      return {
        argv: [
          'cmd', '/c', 'start', '"' + psPath + '"', 'powershell', '-NoExit', '-Command',
          "[Console]::Title = '" + psPath.replace(/'/g, "''") + "'; Set-Location -LiteralPath '" + escapedCwd + "'",
        ],
        useSpawnCwd: false,
      }
    }
    case 'explorer':
      return { argv: ['explorer.exe', cwd], useSpawnCwd: false }
    default:
      throw new Error('unknown launch target: ' + String(target))
  }
}

// ── 图标提取（PowerShell System.Drawing）────────────────────────────

/** 从 exe 提取图标，返回 base64 PNG data URL；失败/无图标返回空串。 */
async function extractFileIcon(ctx: OpenWithCtx, exePath: string): Promise<string> {
  const sp = ctx.subprocess
  if (!sp) throw new Error('subprocess service unavailable')
  const escapedPath = exePath.replace(/'/g, "''")
  const psScript = [
    "$ErrorActionPreference = 'Stop'",
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    'Add-Type -AssemblyName System.Drawing -ErrorAction Stop',
    "[System.Drawing.Icon]::ExtractAssociatedIcon('" + escapedPath + "')",
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
  const icon = stdout.trim()
  if (!icon) ctx.logger?.warn?.('extractIcon returned empty', { exePath, stdoutLen: stdout.length, stderr })
  else ctx.logger?.info?.('extractIcon done', { exePath, dataLen: icon.length })
  return icon
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
      return ok({ settings: readSettingsFile() })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ctx.logger?.error?.('readSettings failed', err)
      return fail('read-failed', message)
    }
  }
  if (endpoint === 'writeSettings') {
    const { settings } = body
    if (settings === undefined) return fail('invalid-settings', 'settings is required')
    try {
      mkdirSync(SETTINGS_DIR, { recursive: true })
      const tmp = SETTINGS_FILE + '.tmp'
      writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf-8')
      renameSync(tmp, SETTINGS_FILE)
      ctx.logger?.info?.('settings saved', { file: SETTINGS_FILE })
      return ok({})
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ctx.logger?.error?.('writeSettings failed', err)
      return fail('write-failed', message)
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
      const settings = readSettingsFile() as { items?: Array<{ id: string; preset?: boolean; path?: string }> } | null
      const item = settings?.items?.find((it) => it.id === targetStr)
      if (!item || item.preset || !item.path) return fail('invalid-target', 'custom item not found: ' + targetStr)
      const handle = sp.spawn({
        argv: ['cmd', '/c', 'start', '', item.path],
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
