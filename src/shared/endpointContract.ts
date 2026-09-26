/**
 * 端点协议契约：`/api/width-slider` 的路径、5 个方法名与响应信封。
 *
 * host（`src/host/api.ts` 的分发器 + `src/index.ts` 的注册）与 client
 * （`core/rpc.ts`、`patches/wsTabs/`、`sessionDelete.ts`）各自独立打包，
 * 但这个协议是**两者共用的唯一真源** —— 此前它散落在 8 处以字符串字面量
 * 的形式存在，改一处漏一处不会有任何编译期或运行时提示。
 *
 * 注意 host 与 client 是两个独立 bundle，本模块会被各自打进一份。
 * 这是刻意的：契约的值必须两端一致，而类型约束只在编译期起作用。
 */

/** `/api/width-slider` 的挂载路径（host 注册、client 调用共用）。 */
export const WIDTH_SLIDER_ENDPOINT = '/api/width-slider'

/**
 * 端点方法名。键名即方法名，值也即方法名 —— 用具名键是为了让 host 的分发器
 * 与 client 的调用点都能被 grep 到，同时避免两端拼写漂移。
 */
export const ENDPOINT_METHOD = {
  readSettings: 'readSettings',
  writeSettings: 'writeSettings',
  wsGroupsRead: 'wsGroupsRead',
  wsGroupsWrite: 'wsGroupsWrite',
  sessionDelete: 'sessionDelete',
} as const

export type EndpointMethod = (typeof ENDPOINT_METHOD)[keyof typeof ENDPOINT_METHOD]

/** host 成功响应：`value` 的形状由各方法自行约定。 */
export interface EndpointOk<T = unknown> {
  ok: true
  value: T
}

/** host 失败响应：`error` 是 `{code, message}` 对象（不是字符串）。 */
export interface EndpointErr {
  ok: false
  error: { code: string; message: string }
}

export type EndpointResult<T = unknown> = EndpointOk<T> | EndpointErr
