/**
 * Host-side plugin entry.
 *
 * v0.3.0（think-kit）职责：
 * 1. 思考/回复强制中文（systemPrompt.section 注入，order -90，可热切换）；
 * 2. 插件功能开关的持久化与热切换（/width-slider RPC：readSettings /
 *    writeSettings；文件存 $DSH_HOME/storages/dsh-plugin-width-slider/
 *    settings.json，原子写（tmp + rename））；
 * 3. writeSettings 时立即按新配置热切换「中文强制」（其余功能为纯
 *    client 行为，由 client 端配置 store 热切换）。
 *
 * 功能开关契约唯一真源：src/shared/settings.ts（host 与 client 共用）。
 * section 名用 dsh-width-slider-think-zh（避免与上游 dsh-think-zh-expand
 * 的 dsh-think-zh 同名重复注册抛错——整合后用户仍可能忘记卸载上游）。
 *
 * 中文提示注入的提示文本与注入方式源自 dsh-think-zh-expand（MIT，
 * Copyright (c) 2026 bsfeng，v0.4.7，上游 https://github.com/baosfeng/
 * my-dsh-plugins）；完整归属声明见仓库根 THIRD_PARTY_NOTICES.md。
 */
import type { Context } from '@deepseek-ai/cordis'
import { DEFAULT_FEATURE_SETTINGS, mergeSettings, type FeatureSettings } from './shared/settings.ts'
import { WIDTH_SLIDER_ENDPOINT } from './shared/endpointContract.ts'
import { PROMPT_TEXT, createChinesePromptController, type PromptCtx } from './host/chinesePrompt.ts'
import { createSettingsStore } from './host/settingsStore.ts'
import { createWorkspaceGroupsStore } from './host/workspaceGroupsStore.ts'
import { createHostApi } from './host/api.ts'
import { registerEndpointChannel } from './host/endpointChannel.ts'

export { DEFAULT_FEATURE_SETTINGS, mergeSettings }
export type { FeatureSettings }
export { PROMPT_TEXT }

// ── 中文强制 prompt（order -90，persona 之前最先读到）──────────────────

// webServer 为 connection.rpc.handle 的必需依赖：该调用把 RPC 的 HTTP 路由
// 注册在**调用者 fiber** 上（dsh-client-connection 的 rpc-host 实现为
// owner.effect(() => owner.webServer.register(route))，owner 取调用者 ctx），
// 因此调用方 fiber 必须能解析 webServer。缺少该声明时加载期抛
// `cannot get property "webServer" without inject`。声明后，在没有 webServer
// 服务的 profile 里插件保持 pending 等待，而不是加载失败。
export const inject = ['systemPrompt', 'connection', 'subprocess', 'webServer']

export function apply(baseCtx: Context): void {
  const ctx = baseCtx as Context & PromptCtx
  const logger = baseCtx.logger

  const settings = createSettingsStore()
  const groups = createWorkspaceGroupsStore()
  const prompt = createChinesePromptController(ctx, logger)

  // 生命周期 1：中文强制（随 fiber 安装/卸载）。
  ctx.effect(() => {
    prompt.sync(settings.get().chinesePrompt)
    return () => prompt.dispose()
  }, 'width-slider: chinese prompt')

  // 生命周期 2：/api/width-slider JSON 端点（client 总控页 POST `method`/`payload`
  // 调 readSettings / writeSettings）。访问围栏由 connection 服务统一施加
  // （可信 Host/Origin + 浏览器认证）；注册走 connection.fetch.register 而不是
  // connection.rpc.handle——后者在 0.1.5 内核上读 owner.webServer 必然失败，
  // 详见 src/host/endpointChannel.ts。
  // 写盘与热切换分开处理：文件落盘成功即 ok:true，热切换异常仅告警，
  // 避免"已落盘但返回失败"导致 client 重复提交。
  ctx.effect(
    () => registerEndpointChannel(ctx, WIDTH_SLIDER_ENDPOINT, createHostApi({
      settings,
      groups,
      logger,
      baseCtx,
      onSettingsApplied: (next) => prompt.sync(next.chinesePrompt),
    })),
    'width-slider: rpc handler',
  )

  logger?.info?.('dsh-plugin-width-slider host loaded')
}
