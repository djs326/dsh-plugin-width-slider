import { callEndpoint } from './endpointChannel.ts'
import { ENDPOINT_METHOD, WIDTH_SLIDER_ENDPOINT } from '../../shared/endpointContract.ts'

/**
 * 读 host 侧持久化设置。返回 `null` 表示"读不到/读失败" —— 调用方据此**不改配置**
 * （内存默认值已经生效），见基线 `:366-369` 的 `raw === null` 短路。
 */
export async function rpcReadSettings(): Promise<unknown> {
  try {
    const result = await callEndpoint(WIDTH_SLIDER_ENDPOINT, ENDPOINT_METHOD.readSettings, {})
    if (result && typeof result === 'object' && (result as { ok?: boolean }).ok === true) {
      return (result as { value?: { settings?: unknown } }).value?.settings ?? null
    }
    return null
  } catch {
    return null
  }
}

/** 写 host 侧持久化设置（**只落盘**，不广播 —— 热切换由 `applySettings` 负责）。 */
export async function rpcWriteSettings(settings: unknown): Promise<void> {
  await callEndpoint(WIDTH_SLIDER_ENDPOINT, ENDPOINT_METHOD.writeSettings, { settings })
}
