/**
 * client 端 JSON 端点调用（与 host 的 `registerEndpointChannel` 配对）。
 *
 * 不走 `connection.rpc.call`：那套 RPC 通道依赖 host 的 `connection.rpc.handle`，
 * 而 0.1.5 内核对第三方插件已不可用（见 host 侧 endpointChannel.ts 的说明）。
 * 直接 POST `/api/<name>`，同源请求自动携带浏览器会话凭证，仍由 connection 的
 * `/api` 围栏统一校验。
 */

/** 调一个 host JSON 端点：`POST /api/<name>`，体为 `{ method, payload }`。 */
export type EndpointCall = (
  path: string,
  method: string,
  payload?: Record<string, unknown>,
) => Promise<unknown>

/**
 * 调 host 的 `/api` 精确 Fetch 路由。
 * @param path - 端点路径，如 `/api/width-slider`。
 * @param method - 端点内的方法名。
 * @param payload - JSON 载荷。
 * @returns host 处理器返回的 JSON 结果（`{ ok, value }` 或 `{ ok: false, error }`）。
 * @throws HTTP 非 2xx 时抛出带状态码与响应正文的错误。
 */
export const callEndpoint: EndpointCall = async (path, method, payload = {}) => {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, payload }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`endpoint ${path} failed: HTTP ${response.status}${text !== '' ? ' ' + text : ''}`)
  }
  return (await response.json()) as unknown
}
