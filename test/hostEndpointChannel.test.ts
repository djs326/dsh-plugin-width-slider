/**
 * host endpoint channel: the `/api/<name>` contract every feature rides on — the
 * rejection paths, the handler-failure envelope, payload normalization, the
 * degradation when connection (or `fetch.register`) is unavailable, and disposal.
 */
import { describe, expect, it } from 'vitest'
import {
  registerEndpointChannel, type EndpointChannelCtx, type EndpointHandler,
} from '../src/host/endpointChannel.ts'

interface CapturedRoute {
  path: string
  methods: readonly string[]
  fetch: (request: Request) => Promise<Response>
}

type Mode = 'ok' | 'no-connection' | 'no-register' | 'register-returns-undefined'

interface Harness {
  ctx: EndpointChannelCtx
  /** The route the channel registered (only valid in `ok` mode). */
  route: () => CapturedRoute
  registered: () => boolean
  disposed: () => boolean
}

/** A fake connection whose `fetch.register` captures the route, or is absent. */
function harness(mode: Mode = 'ok'): Harness {
  let captured: CapturedRoute | null = null
  let disposed = false
  const ctx: EndpointChannelCtx = {
    get: (name: string) => {
      if (name !== 'connection' || mode === 'no-connection') return undefined
      if (mode === 'no-register') return { fetch: {} }
      return {
        fetch: {
          register: (route: CapturedRoute) => {
            captured = route
            if (mode === 'register-returns-undefined') return undefined
            return () => { disposed = true }
          },
        },
      }
    },
  }
  return {
    ctx,
    route: () => captured as CapturedRoute,
    registered: () => captured !== null,
    disposed: () => disposed,
  }
}

/** POST the plugin's own request shape to the route. */
const post = (rawBody: string): Request => new Request('http://dsh.invalid/api/width-slider', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: rawBody,
})

const okHandler: EndpointHandler = async (method, payload) => ({ ok: true, value: { method, payload } })

describe('registerEndpointChannel', () => {
  it('registers a POST route on the exact path', () => {
    const h = harness()
    registerEndpointChannel(h.ctx, '/api/width-slider', okHandler)
    expect(h.registered()).toBe(true)
    expect(h.route().path).toBe('/api/width-slider')
    expect(h.route().methods).toEqual(['POST'])
  })

  it('answers the handler result as JSON', async () => {
    const h = harness()
    registerEndpointChannel(h.ctx, '/api/width-slider', okHandler)
    const response = await h.route().fetch(post(JSON.stringify({ method: 'readSettings', payload: { a: 1 } })))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      value: { method: 'readSettings', payload: { a: 1 } },
    })
  })

  it('rejects a body that is not JSON with 400 bad-json', async () => {
    const h = harness()
    registerEndpointChannel(h.ctx, '/api/width-slider', okHandler)
    const response = await h.route().fetch(post('{ not json'))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'bad-json' } })
  })

  it('rejects a missing, empty, or non-string method with 400 bad-request', async () => {
    const h = harness()
    registerEndpointChannel(h.ctx, '/api/width-slider', okHandler)
    for (const body of [{}, { method: '' }, { method: 42 }]) {
      const response = await h.route().fetch(post(JSON.stringify(body)))
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ ok: false, error: { code: 'bad-request' } })
    }
  })

  it('normalizes a non-object payload to an empty one', async () => {
    const h = harness()
    registerEndpointChannel(h.ctx, '/api/width-slider', okHandler)
    const response = await h.route().fetch(post(JSON.stringify({ method: 'ping', payload: 'nope' })))
    expect(await response.json()).toMatchObject({ value: { payload: {} } })
  })

  it('wraps a throwing handler in the handler-failed envelope', async () => {
    const h = harness()
    registerEndpointChannel(h.ctx, '/api/width-slider', async () => { throw new Error('boom') })
    const response = await h.route().fetch(post(JSON.stringify({ method: 'ping' })))
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'handler-failed', message: 'boom' },
    })
  })

  it('degrades to a no-op without connection or without fetch.register', () => {
    for (const mode of ['no-connection', 'no-register'] as const) {
      const h = harness(mode)
      let dispose: (() => void) | undefined
      expect(() => { dispose = registerEndpointChannel(h.ctx, '/api/width-slider', okHandler) }).not.toThrow()
      expect(typeof dispose).toBe('function')
      expect(h.registered()).toBe(false)
      expect(() => dispose?.()).not.toThrow()
    }
  })

  it('falls back to a no-op disposer when register returns nothing', () => {
    const h = harness('register-returns-undefined')
    const dispose = registerEndpointChannel(h.ctx, '/api/width-slider', okHandler)
    expect(h.registered()).toBe(true)
    expect(() => dispose()).not.toThrow()
    expect(h.disposed()).toBe(false)
  })

  it('returns the register disposer and runs it once', () => {
    const h = harness()
    const dispose = registerEndpointChannel(h.ctx, '/api/width-slider', okHandler)
    expect(h.disposed()).toBe(false)
    dispose()
    expect(h.disposed()).toBe(true)
  })
})
