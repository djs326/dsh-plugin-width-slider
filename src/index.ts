/**
 * Host-side plugin: minimal entry. Width slider lives entirely on the client
 * side (localStorage + CSS variables). No host RPC needed.
 */
import type { Context } from '@deepseek-ai/cordis'

export const inject: string[] = []

export function apply(ctx: Context): void {
  ctx.logger?.info?.('dsh-plugin-width-slider host loaded')
}