// @vitest-environment jsdom
/**
 * 端点协议契约（批次⑨-3 的 G1 + F3）。
 *
 * 这个文件守的是**契约本身**，不是实现：
 * - 字面量必须钉死 —— 不能用常量自己比自己，否则把 `'/api/width-slidr'` 写错也全绿；
 * - host 的分发器必须认得每一个方法名；
 * - client 发出的请求形状必须与 host 注册的路径一致。
 *
 * 集中化之前这三件事散落在 8 处字符串字面量里，全仓零测试覆盖：改一处漏一处
 * 既没有编译期提示，也没有运行时提示，只有线上才可能暴露。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ENDPOINT_METHOD, WIDTH_SLIDER_ENDPOINT } from '../src/shared/endpointContract.ts'
import { createHostApi, type HostApiDeps } from '../src/host/api.ts'
import { callEndpoint } from '../src/client/core/endpointChannel.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * 最小假依赖。store 只用到 `get`（`commit` 供 writeSettings 分支），
 * `baseCtx` 给 sessionDelete —— 它在本文件里必然失败，但**不允许**失败成
 * `unknown-endpoint`（那才是「分发器漏了这个方法」的信号）。
 */
function fakeDeps(): HostApiDeps {
  return {
    settings: { get: () => ({ width: 800 }), commit: () => {} },
    groups: { get: () => [] },
    logger: { warn: () => {}, info: () => {} },
    baseCtx: {},
    onSettingsApplied: () => {},
  } as unknown as HostApiDeps
}

/** 成功响应：`callEndpoint` 只看 `ok` 与 `json()`。 */
function okResponse(value: unknown): unknown {
  return { ok: true, status: 200, json: async () => ({ ok: true, value }) }
}

describe('端点契约字面量', () => {
  it('WIDTH_SLIDER_ENDPOINT 钉住 host 注册与 client 调用共用的路径', () => {
    expect(WIDTH_SLIDER_ENDPOINT).toBe('/api/width-slider')
  })

  // 每个方法名单独一条用例：值写错时能直接指出是哪一个。
  it.each(['readSettings', 'writeSettings', 'wsGroupsRead', 'wsGroupsWrite', 'sessionDelete'] as const)(
    'ENDPOINT_METHOD.%s 的值就是方法名字面量本身',
    (name) => {
      expect(ENDPOINT_METHOD[name]).toBe(name)
    },
  )

  it('5 个方法名的键集与值集一致，且两两不同（防复制粘贴出重名键）', () => {
    const keys = Object.keys(ENDPOINT_METHOD)
    const values = Object.values(ENDPOINT_METHOD)
    expect(keys).toHaveLength(5)
    expect(new Set(values).size).toBe(5)
    expect([...values].sort()).toEqual([...keys].sort())
  })
})

describe('host 分发器认每一个契约方法', () => {
  it('ENDPOINT_METHOD 里的每个方法都不会落到 unknown-endpoint 分支', async () => {
    const api = createHostApi(fakeDeps())
    const fellThrough: string[] = []
    for (const method of Object.values(ENDPOINT_METHOD)) {
      const result = (await api(method, {})) as { ok?: boolean; error?: { code?: string } } | null
      if (result?.ok === false && result.error?.code === 'unknown-endpoint') fellThrough.push(method)
    }
    // 逐条列出漏掉的方法，而不是只报一个布尔差异。
    expect(fellThrough).toEqual([])
  })

  it('契约之外的方法仍被拒为 unknown-endpoint', async () => {
    const result = await createHostApi(fakeDeps())('no-such-method', {})
    expect(result).toMatchObject({ ok: false, error: { code: 'unknown-endpoint' } })
  })
})

describe('响应信封形状', () => {
  it('成功分支是 { ok: true, value }', async () => {
    const result = (await createHostApi(fakeDeps())('readSettings', {})) as Record<string, unknown>
    expect(result.ok).toBe(true)
    expect('value' in result).toBe(true)
  })

  it('失败分支的 error 是 { code, message } 对象，不是字符串', async () => {
    const result = (await createHostApi(fakeDeps())('no-such-method', {})) as { error?: unknown }
    const error = result.error as { code?: unknown; message?: unknown }
    // 这一条钉住的是最容易记错的地方：client 侧读的是 error.message，
    // 若 host 退回成 `error: 'unknown endpoint'` 字符串，client 会静默丢消息。
    expect(typeof error).toBe('object')
    expect(typeof error.code).toBe('string')
    expect(typeof error.message).toBe('string')
  })
})

describe('client 请求形状', () => {
  it('POST 到契约路径，体为 { method, payload }', async () => {
    const fetchMock = vi.fn(async (_path: string, _init: unknown) => okResponse({}))
    vi.stubGlobal('fetch', fetchMock)

    const result = await callEndpoint(WIDTH_SLIDER_ENDPOINT, ENDPOINT_METHOD.readSettings, {})

    expect(result).toEqual({ ok: true, value: {} })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [path, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ]
    expect(path).toBe('/api/width-slider')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
    expect(init.body).toBe('{"method":"readSettings","payload":{}}')
  })

  it('非 2xx 抛出带状态码与路径的错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_path: string, _init: unknown) => ({
      ok: false,
      status: 500,
      text: async () => '',
    })))

    await expect(callEndpoint(WIDTH_SLIDER_ENDPOINT, ENDPOINT_METHOD.readSettings, {}))
      .rejects.toThrow('endpoint /api/width-slider failed: HTTP 500')
  })
})
