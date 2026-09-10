/**
 * host 端 JSON 端点通道。
 *
 * 为什么不用 `connection.rpc.handle`：0.1.5 内核的 dsh-client-connection 把它实现为
 * `owner.effect(() => owner.webServer.register(route))`，owner 取 `Service.ctx`
 * （即 connection 插件自身的 ctx）。0.1.5 的 connection 已不再在自身 ctx 注入
 * webServer（改为内部 `ctx.inject(['webServer'], …)` 只为 `/api` 路由建子 fiber），
 * 因此第三方插件调用 `rpc.handle` 必然抛
 * `cannot get property "webServer" without inject`（在调用者 inject 里补 webServer
 * 无效：属性代理读法会把解析起点换成 connection 的 fiber）。
 *
 * `connection.fetch.register` 只做 `owner.effect(() => { …map set… })`，不读
 * webServer，因此可用；它注册的是 `/api` 下的精确 Fetch 路由，仍然经过 connection
 * 的统一围栏（可信 Host/Origin + 浏览器认证）后才进入处理器。
 */

/** 一个 JSON 端点的处理函数：方法名 + JSON 载荷，返回 JSON 结果。 */
export type EndpointHandler = (
  endpoint: string,
  payload: Record<string, unknown>,
) => Promise<unknown>

/** 精确 Fetch 路由（`/api/<name>`）。 */
interface ConnectionFetchRoute {
  path: string
  methods: readonly string[]
  fetch: (request: Request) => Promise<Response>
}

/** 处理器运行期只用到 `ctx.get` 取 connection 服务。 */
export interface EndpointChannelCtx {
  get?: (name: string) => unknown
}

interface ConnectionWithFetch {
  fetch?: {
    register?: (route: ConnectionFetchRoute) => (() => void) | undefined
  }
}

/**
 * 在 `/api` 下注册一个 JSON 端点，返回 disposer。
 *
 * connection 服务或 `fetch.register` 不可用时返回空 disposer（其余功能不受影响）。
 * 请求体为 `{ method, payload }`，响应体为处理器返回的 JSON；解析失败返回 400。
 *
 * @param ctx - host 插件上下文（读 connection 服务）。
 * @param path - 精确路径，必须形如 `/api/<name>`（段只允许字母数字与 `_$.-`）。
 * @param handler - 方法名与载荷的处理函数。
 * @returns 注销该路由的 disposer。
 */
export function registerEndpointChannel(
  ctx: EndpointChannelCtx,
  path: `/api/${string}`,
  handler: EndpointHandler,
): () => void {
  const connection = ctx.get?.('connection') as ConnectionWithFetch | undefined
  const register = connection?.fetch?.register
  if (typeof register !== 'function' || connection === undefined) return () => {}

  const dispose = register({
    path,
    methods: ['POST'],
    fetch: async (request: Request): Promise<Response> => {
      let body: { method?: unknown; payload?: unknown }
      try {
        body = (await request.json()) as typeof body
      } catch {
        return Response.json(
          { ok: false, error: { code: 'bad-json', message: 'body is not JSON' } },
          { status: 400 },
        )
      }
      const method = body.method
      if (typeof method !== 'string' || method === '') {
        return Response.json(
          { ok: false, error: { code: 'bad-request', message: 'method is required' } },
          { status: 400 },
        )
      }
      const payload = (body.payload !== null && typeof body.payload === 'object' ? body.payload : {}) as Record<string, unknown>
      try {
        return Response.json(await handler(method, payload))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return Response.json({ ok: false, error: { code: 'handler-failed', message } })
      }
    },
  })

  return typeof dispose === 'function' ? dispose : () => {}
}
