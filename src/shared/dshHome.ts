/**
 * dshHome.ts — $DSH_HOME 解析（host 端共用；env DSH_HOME 优先，默认 ~/.dsh）。
 */
import { join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'

function expandHomePath(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/') || p.startsWith('~' + sep)) return join(homedir(), p.slice(2))
  return p
}

export function resolveDshHome(env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env.DSH_HOME
  return resolve(expandHomePath(fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : join(homedir(), '.dsh')))
}

export function dshHomePath(...segments: string[]): string {
  return join(resolveDshHome(), ...segments)
}
