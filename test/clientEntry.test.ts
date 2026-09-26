// @vitest-environment jsdom
/**
 * client 入口（src/client/index.ts）的装配逻辑 —— 批次⑨-1。
 *
 * 它是全仓唯一零直接覆盖的源文件（28 个测试文件没有一个 import 它），而 ⑨-2/⑨-3
 * 都要动它的 `inject` 与 lifecycle `sync()`。这里覆盖入口**自己的装配**，不是被它
 * 装配的那些功能（它们各自已有套件）：
 *
 * - 对宿主声明了什么（inject 五项）与注册了几条 effect（名字逐字、顺序与声明序一致）；
 * - 8 个槽位的 want 矩阵 —— 每个槽位由哪个设置键决定，动效槽位由总闸 + 系统偏好
 *   共同决定，两条常驻槽位不看开关；
 * - 会话账本适配器（`motionSessions`）：全仓唯一解构宿主会话账本形状的地方，含
 *   「读账本失败 ⇒ 降级为 false，且只告警一次」；
 * - config load 的 `cancelled` 短路与 `raw === null` 短路；
 * - settings.section 的注册载荷与它注入的 `writeSettings`。
 *
 * 假 ctx 用一个显式对象 + `as unknown as ClientContext`：`ClientContext` 在
 * src/env.d.ts 里是 `any` 桩（本插件不安装 DSH monorepo 内部包），类型系统因此
 * 校验不了这个假 ctx 的形状 —— 它的正确性由「installX 收到了什么」的断言兜住。
 * 刻意不写成 `apply(ctx as never)`：那会连入口里**每一处** ctx 读写都一起失去检查。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

import { apply, inject } from '../src/client/index.ts'
import { NS, en, zh } from '../src/client/core/locales.ts'
import { applySettings } from '../src/client/core/config.ts'
import { rpcReadSettings, rpcWriteSettings } from '../src/client/core/rpc.ts'
import { installWidthFeature } from '../src/client/features/width/index.ts'
import { installThinkRenderer, warnIfUpstreamPresent } from '../src/client/features/think/index.ts'
import { installMotionFeature, type MotionSessionsPort } from '../src/client/features/motion/index.ts'
import { installDialogResizePatch } from '../src/client/patches/settingsPanel/dialogWindow.ts'
import { installNavScrollPatch } from '../src/client/patches/settingsPanel/navScroll.ts'
import { installSessionDelete } from '../src/client/sessionDelete.ts'
import { installWorkspaceTabs } from '../src/client/workspaceTabs.tsx'
import { installSidebarToolsMerge } from '../src/client/sidebarToolsMerge.ts'
import { WidthSliderSettings } from '../src/client/WidthSliderSettings.tsx'
import { prefersReducedMotion } from '../src/client/motion/index.ts'
import { DEFAULT_FEATURE_SETTINGS, mergeSettings, type FeatureSettings } from '../src/shared/settings.ts'

/**
 * mock 工厂在**模块导入阶段**就会执行，那时本文件的顶层 const 还在 TDZ，所以凡是
 * 工厂要用的东西都必须放进 `vi.hoisted`。
 *
 * `log` 是跨模块的调用账本：安装 / 卸载 / 退订都往里写一条，用来断言次序。
 */
const h = vi.hoisted(() => {
  const log: string[] = []
  /** 造一个「安装时记账、卸载时也记账」的 disposer，槽位次序断言全靠它。 */
  const installLog = (tag: string): (() => void) => {
    log.push(`install:${tag}`)
    return () => {
      log.push(`dispose:${tag}`)
    }
  }
  return {
    /** 假配置 store 的当前值（被 mock 的 `getSettings` 读这里）。 */
    settings: undefined as unknown,
    /** 被 mock 的 `onSettingsChanged` 收到的 listener；入口的 `sync` 是其中一个。 */
    listeners: new Set<() => void>(),
    /** 跨模块调用账本。 */
    log,
    installLog,
  }
})

vi.mock('../src/client/core/config.ts', async () => {
  // mergeSettings 用真实实现（白名单式合并是入口那条路径的行为本身），只在
  // store 与订阅上造假。
  const actual = await vi.importActual<typeof import('../src/shared/settings.ts')>('../src/shared/settings.ts')
  return {
    getSettings: () => h.settings,
    // 包成 vi.fn 而不只是普通函数：E10 要断言「读回后正好写了 store 一次、写进去的
    // 是 mergeSettings(raw)」，没有调用记录就只能靠观察副作用，那样丢掉的恰恰是
    // 「调用了几次」这一维（多写一次会把一份过期配置推给订阅者）。
    applySettings: vi.fn((next: unknown) => {
      h.settings = next
      h.log.push('applySettings')
      for (const listener of [...h.listeners]) listener()
    }),
    onSettingsChanged: vi.fn((listener: () => void) => {
      h.listeners.add(listener)
      return () => {
        h.log.push('unsubscribe')
        h.listeners.delete(listener)
      }
    }),
    mergeSettings: actual.mergeSettings,
  }
})

vi.mock('../src/client/core/rpc.ts', () => ({
  // 默认读回 null：配置读回是异步的，本步绝大多数用例只关心同步那一遍装配，
  // 默认短路掉它，免得它的副作用混进别的断言。
  rpcReadSettings: vi.fn(async () => null),
  rpcWriteSettings: vi.fn(async () => {}),
}))

vi.mock('../src/client/features/width/index.ts', () => ({
  installWidthFeature: vi.fn(() => h.installLog('handle')),
}))
vi.mock('../src/client/features/think/index.ts', () => ({
  installThinkRenderer: vi.fn(() => h.installLog('think')),
  warnIfUpstreamPresent: vi.fn(),
}))
vi.mock('../src/client/features/motion/index.ts', () => ({
  installMotionFeature: vi.fn(() => h.installLog('motion')),
}))
vi.mock('../src/client/patches/settingsPanel/dialogWindow.ts', () => ({
  installDialogResizePatch: vi.fn(() => h.installLog('resize')),
}))
vi.mock('../src/client/patches/settingsPanel/navScroll.ts', () => ({
  installNavScrollPatch: vi.fn(() => h.installLog('nav')),
}))
vi.mock('../src/client/sessionDelete.ts', () => ({
  installSessionDelete: vi.fn(() => h.installLog('sessionDel')),
}))
vi.mock('../src/client/workspaceTabs.tsx', () => ({
  installWorkspaceTabs: vi.fn(() => h.installLog('wsTabs')),
}))
vi.mock('../src/client/sidebarToolsMerge.ts', () => ({
  // 常驻安装：入口的 wrapper 必须把 merge.dispose 交出去，所以这里也记账。
  installSidebarToolsMerge: vi.fn((): { dispose: () => void } => {
    h.log.push('install:toolsMerge')
    return {
      dispose: () => {
        h.log.push('dispose:toolsMerge')
      },
    }
  }),
}))
vi.mock('../src/client/motion/index.ts', () => ({
  prefersReducedMotion: vi.fn(() => false),
}))
vi.mock('../src/client/WidthSliderSettings.tsx', () => ({
  // 最小组件占位：本步只断言「注册了哪个组件」，绝不真的渲染它。
  WidthSliderSettings: () => null,
}))

interface EffectRecord {
  name: string
  cleanup: (() => void) | undefined
}

interface FakeEntry {
  ctx: ClientContext
  /** 按声明序记录的 effect；cleanup 由 `ctx.effect` 立即执行 fn 后存下。 */
  effects: EffectRecord[]
  /** `slots.inject` 收到的 (name, factory)。 */
  injections: Array<{ name: string; factory: () => unknown }>
  /** 槽位注册（测试调用 factory 时产生）。 */
  registrations: Array<{ config: Record<string, unknown>; component: unknown }>
  localeRegister: ReturnType<typeof vi.fn>
  sessionsSubscribe: ReturnType<typeof vi.fn>
  /** 假会话账本；测试直接改它来构造 `byId` / `blank` 的各种形状。 */
  ledger: { current?: string; byId: Record<string, { blank?: boolean } | undefined> }
  /** 让 `getSnapshot()` 抛这个错误（账本不可用的降级路径）。 */
  failLedger: (err: Error) => void
  /** 按名字取某条 effect 的 cleanup —— 比按下标稳，effect 增删时不会静默错位。 */
  cleanupOf: (name: string) => (() => void) | undefined
  /** `apply` 的返回值（E14）。 */
  result: unknown
}

/** 造一个假 ctx。装配由 `mount()` / 直接 `apply(fake.ctx)` 触发。 */
function makeCtx(): FakeEntry {
  const effects: EffectRecord[] = []
  const injections: FakeEntry['injections'] = []
  const registrations: FakeEntry['registrations'] = []
  const ledger: FakeEntry['ledger'] = { current: undefined, byId: {} }
  let ledgerError: Error | null = null

  const localeRegister = vi.fn(() => () => {
    h.log.push('dispose:dictionaries')
  })
  const sessionsSubscribe = vi.fn(() => () => {
    h.log.push('dispose:sessions-subscribe')
  })
  const getSnapshot = vi.fn(() => {
    if (ledgerError !== null) throw ledgerError
    return ledger
  })
  const register = vi.fn((config: Record<string, unknown>, component: unknown) => {
    registrations.push({ config, component })
    return () => {
      h.log.push('dispose:settings-section')
    }
  })
  // 宿主在槽位挂载时才调用这个工厂，所以这里只记录；测试按需调用它取注册载荷。
  const injectSlot = vi.fn((name: string, factory: () => unknown) => {
    injections.push({ name, factory })
  })

  const ctx = {
    effect: (fn: () => unknown, name: string): void => {
      const record: EffectRecord = { name, cleanup: undefined }
      effects.push(record)
      const cleanup = fn()
      if (typeof cleanup === 'function') record.cleanup = cleanup as () => void
    },
    locale: { register: localeRegister },
    slots: { inject: injectSlot, register },
    sessions: { list: { subscribe: sessionsSubscribe, getSnapshot } },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  } as unknown as ClientContext

  return {
    ctx,
    effects,
    injections,
    registrations,
    localeRegister,
    sessionsSubscribe,
    ledger,
    failLedger: (err) => {
      ledgerError = err
    },
    cleanupOf: (name) => effects.find((effect) => effect.name === name)?.cleanup,
    result: undefined,
  }
}

/** 造一个假 ctx 并按给定设置装配一次入口。 */
function mount(settings: Partial<FeatureSettings> = {}): FakeEntry {
  h.settings = { ...DEFAULT_FEATURE_SETTINGS, ...settings }
  const fake = makeCtx()
  fake.result = apply(fake.ctx)
  return fake
}

/** 卸掉一次装配注册的全部 effect（模拟插件停用）。 */
function uninstall(fake: FakeEntry): void {
  for (const effect of fake.effects) effect.cleanup?.()
}

/** 第 index 次 `apply` 时入口交给 installMotionFeature 的会话账本端口。 */
function portOf(index: number): MotionSessionsPort {
  const calls = vi.mocked(installMotionFeature).mock.calls
  if (calls.length <= index) {
    throw new Error(`installMotionFeature 没有被调用第 ${index + 1} 次`)
  }
  return calls[index][0]
}

/** 让已 resolve 的 promise 的 `.then` 回调跑完（配置读回是异步的）。 */
const flush = (): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, 0)
})

beforeEach(() => {
  h.settings = { ...DEFAULT_FEATURE_SETTINGS }
  h.listeners.clear()
  h.log.length = 0
  vi.mocked(prefersReducedMotion).mockClear()
  vi.mocked(prefersReducedMotion).mockReturnValue(false)
  vi.mocked(rpcReadSettings).mockClear()
  vi.mocked(rpcReadSettings).mockImplementation(async () => null)
  vi.mocked(rpcWriteSettings).mockClear()
  vi.mocked(installWidthFeature).mockClear()
  vi.mocked(installThinkRenderer).mockClear()
  vi.mocked(warnIfUpstreamPresent).mockClear()
  vi.mocked(installMotionFeature).mockClear()
  vi.mocked(installDialogResizePatch).mockClear()
  vi.mocked(installNavScrollPatch).mockClear()
  vi.mocked(installSessionDelete).mockClear()
  vi.mocked(installWorkspaceTabs).mockClear()
  vi.mocked(installSidebarToolsMerge).mockClear()
  vi.mocked(applySettings).mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('client 入口装配', () => {
  it('declares the four host services it reads, in order (E1)', () => {
    // 宿主按名字分发这些服务；删一个或换个名字，入口里对应的 ctx.xxx 会在运行期
    // 直接读到 undefined —— 这一步类型系统帮不上忙（ClientContext 是 any 桩）。
    expect(inject).toEqual(['slots', 'locale', 'sessions', 'workspaces'])
  })

  it('registers five effects, with the declared names in declaration order (E2)', () => {
    // 名字是宿主日志/诊断里唯一的定位信息，顺序是 cleanup 链的建立序。
    const fake = mount()
    expect(fake.effects.map((effect) => effect.name)).toEqual([
      'width-slider: dictionaries',
      'width-slider: upstream conflict probe',
      'width-slider: feature lifecycles',
      'width-slider: config load',
      'width-slider: settings section',
    ])
  })

  it('registers the dictionaries and returns that registration disposer (E3)', () => {
    const fake = makeCtx()
    const disposer = (): void => {
      h.log.push('dispose:dictionaries')
    }
    fake.localeRegister.mockReturnValue(disposer)
    apply(fake.ctx)

    expect(fake.localeRegister).toHaveBeenCalledWith(NS, { zh, en })
    // 交回去的必须是 register 的返回值本身，而不是另包一层：宿主按引用退订。
    expect(fake.cleanupOf('width-slider: dictionaries')).toBe(disposer)
  })

  it('probes for an upstream conflict and returns a no-op cleanup (E4)', () => {
    const fake = mount()
    expect(warnIfUpstreamPresent).toHaveBeenCalledTimes(1)

    const cleanup = fake.cleanupOf('width-slider: upstream conflict probe')
    expect(typeof cleanup).toBe('function')
    expect(() => cleanup?.()).not.toThrow()
  })

  it('runs sync immediately and hands that same sync to onSettingsChanged (E5)', () => {
    const fake = mount()
    // 立即执行：effect 一装上就按当前配置把功能装好，不等第一次配置变化。
    expect(installWidthFeature).toHaveBeenCalledTimes(1)
    expect(h.listeners.size).toBe(1)

    const [sync] = [...h.listeners]
    expect(typeof sync).toBe('function')
    // 触发它 == 再跑一遍 want 矩阵：关掉宽度开关后 handle 会被卸载。
    h.log.length = 0
    h.settings = { ...DEFAULT_FEATURE_SETTINGS, widthSlider: false }
    sync()
    expect(h.log).toContain('dispose:handle')
    expect(fake.effects.map((effect) => effect.name)).toContain('width-slider: feature lifecycles')
  })

  it('maps the eight slots onto their own settings keys (E6)', () => {
    const installed = (): string[] => h.log.filter((entry) => entry.startsWith('install:'))

    // 默认设置：宽度 / 思考 / 弹窗 / 滚动 / 会话删除开；工作区分页与工具并入关
    // （这两项常驻安装，开关只在模块内部切 enabled）；动效总闸默认 off。
    h.log.length = 0
    mount()
    expect(installed()).toEqual([
      'install:handle', 'install:think', 'install:resize', 'install:nav',
      'install:sessionDel', 'install:wsTabs', 'install:toolsMerge',
    ])
    // 不需要 ctx 的三个：多传参数就是接线错了。
    expect(installWidthFeature).toHaveBeenCalledWith()
    expect(installDialogResizePatch).toHaveBeenCalledWith()
    expect(installNavScrollPatch).toHaveBeenCalledWith()

    // 全开（总闸 on + 系统不要求减少动态）：8 个全装，安装序 = 声明序。
    h.log.length = 0
    mount({ motionMode: 'on' })
    expect(installed()).toEqual([
      'install:handle', 'install:think', 'install:resize', 'install:nav',
      'install:sessionDel', 'install:wsTabs', 'install:toolsMerge', 'install:motion',
    ])

    // 逐键关掉：只有它自己的槽位不装，其余 7 个照装 —— 这钉住了「每个槽位由哪个
    // 键决定」，而不只是「关掉一个键少装一个」。
    const perSlot: Array<[Partial<FeatureSettings>, string]> = [
      [{ widthSlider: false }, 'handle'],
      [{ thinkRender: false }, 'think'],
      [{ dialogResize: false }, 'resize'],
      [{ navScroll: false }, 'nav'],
      [{ sessionDelete: false }, 'sessionDel'],
    ]
    for (const [override, slot] of perSlot) {
      h.log.length = 0
      mount({ motionMode: 'on', ...override })
      expect(installed(), `${slot} 的 want 不是它自己的设置键`).not.toContain(`install:${slot}`)
      expect(installed()).toHaveLength(7)
    }

    // 两个常驻槽位：开关关着也照样安装（开关在模块内部生效）。
    h.log.length = 0
    mount({ workspaceTabs: false, sidebarToolsMerge: false, motionMode: 'on' })
    expect(installed()).toContain('install:wsTabs')
    expect(installed()).toContain('install:toolsMerge')

    // 动效是唯一由「总闸 + 系统偏好」共同决定的槽位。
    h.log.length = 0
    mount({ motionMode: 'off' })
    expect(installed()).not.toContain('install:motion')

    h.log.length = 0
    mount({ motionMode: 'system' })
    expect(installed()).toContain('install:motion')

    vi.mocked(prefersReducedMotion).mockReturnValue(true)
    h.log.length = 0
    mount({ motionMode: 'system' })
    expect(installed()).not.toContain('install:motion')

    // 显式 on：不看系统偏好（用户明确要，就给他）。
    h.log.length = 0
    mount({ motionMode: 'on' })
    expect(installed()).toContain('install:motion')
  })

  it('passes ctx to the installers that need it (E6b)', () => {
    const fake = mount()
    expect(vi.mocked(installThinkRenderer).mock.calls[0][0]).toBe(fake.ctx)
    expect(vi.mocked(installSessionDelete).mock.calls[0][0]).toBe(fake.ctx)
    expect(vi.mocked(installWorkspaceTabs).mock.calls[0][0]).toBe(fake.ctx)

    // 工具并入常驻安装，但它拿到的是一个「活读开关」的闭包，不是快照值。
    const options = vi.mocked(installSidebarToolsMerge).mock.calls[0][0]
    h.settings = { ...DEFAULT_FEATURE_SETTINGS, sidebarToolsMerge: true }
    expect(options.enabled()).toBe(true)
    h.settings = { ...DEFAULT_FEATURE_SETTINGS, sidebarToolsMerge: false }
    expect(options.enabled()).toBe(false)
  })

  it('forwards the session ledger calls straight through to the host (E7)', () => {
    const fake = mount({ motionMode: 'on' })
    const port = portOf(0)

    const listener = (): void => {}
    port.subscribe(listener)
    // 转调的是同一个函数引用（不另包一层）：宿主按引用退订。
    expect(fake.sessionsSubscribe).toHaveBeenCalledTimes(1)
    expect(fake.sessionsSubscribe.mock.calls[0][0]).toBe(listener)

    fake.ledger.current = 's-1'
    expect(port.currentSessionId()).toBe('s-1')
  })

  it('reads isBlank from all four ledger shapes (E7)', () => {
    const fake = mount({ motionMode: 'on' })
    const port = portOf(0)

    // 没有选中的会话。
    fake.ledger.current = undefined
    fake.ledger.byId = {}
    expect(port.isBlank()).toBe(false)

    // 选中且是空白会话 —— 新建对话的入场动效据此判定。
    fake.ledger.current = 's-1'
    fake.ledger.byId = { 's-1': { blank: true } }
    expect(port.isBlank()).toBe(true)

    // 选中但不是空白会话。
    fake.ledger.byId = { 's-1': { blank: false } }
    expect(port.isBlank()).toBe(false)

    // 记录在册但值是 undefined（宿主 Record 的 `| undefined`）：不能抛，退化为 false。
    fake.ledger.byId = { 's-1': undefined }
    expect(port.isBlank()).toBe(false)
  })

  it('degrades to blank = false and warns exactly once when the ledger throws (E8)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = mount({ motionMode: 'on' })
    const port = portOf(0)
    const boom = new Error('ledger down')
    fake.failLedger(boom)

    // 读账本失败不让动效整块失效：只丢「新建对话入场」这一组。
    expect(port.isBlank()).toBe(false)
    expect(port.isBlank()).toBe(false)
    expect(port.isBlank()).toBe(false)

    // getState 会被频繁调用，账本持续不可用时只提示一次；第二个参数是原始错误。
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('[width-slider] motion: session ledger unavailable', boom)
  })

  it('unsubscribes before disposing the installed features (E9)', () => {
    const fake = mount({ motionMode: 'on' })
    expect(h.log).toHaveLength(8)

    h.log.length = 0
    fake.cleanupOf('width-slider: feature lifecycles')?.()

    // 退订排在最前：先摘掉 store 的订阅，再按 UNINSTALL_ORDER 卸载（次序与安装序
    // 刻意不同，见 core/features.ts 的常量说明）。
    expect(h.log).toEqual([
      'unsubscribe',
      'dispose:handle', 'dispose:think', 'dispose:resize', 'dispose:nav',
      'dispose:sessionDel', 'dispose:wsTabs', 'dispose:motion', 'dispose:toolsMerge',
    ])
  })

  it('applies mergeSettings(raw) once the host read resolves (E10)', async () => {
    const raw = { widthSlider: false, motionMode: 'on', unknownKey: 1 }
    vi.mocked(rpcReadSettings).mockResolvedValue(raw)
    const fake = mount()

    await flush()

    expect(vi.mocked(applySettings)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(applySettings).mock.calls[0][0]).toEqual(mergeSettings(raw))
    // 白名单式合并的结果真的落进了 store：脏键被丢弃、缺键回落到默认值。
    expect(h.settings).toEqual(mergeSettings(raw))
    expect(fake.result).toBeUndefined()
  })

  it('drops the read-back result when the effect was already cleaned up (E11)', async () => {
    let resolveRead: (raw: unknown) => void = () => {}
    vi.mocked(rpcReadSettings).mockImplementation(
      () => new Promise((resolve) => {
        resolveRead = resolve
      }),
    )
    const fake = mount()
    fake.cleanupOf('width-slider: config load')?.()

    resolveRead({ widthSlider: false })
    await flush()

    // 插件已停用：迟到的读回不能再写 store，否则会把一份过期配置推给订阅者。
    expect(vi.mocked(applySettings)).not.toHaveBeenCalled()
  })

  it('leaves the store alone when the host read returns null (E12)', async () => {
    vi.mocked(rpcReadSettings).mockResolvedValue(null)
    mount()

    await flush()

    // null 是显式的「读不到/读失败」：内存里的默认值已经生效，不能覆盖它。
    expect(vi.mocked(applySettings)).not.toHaveBeenCalled()
  })

  it('registers the settings section with the exact six fields (E13)', () => {
    const fake = mount()
    expect(fake.injections).toHaveLength(1)
    const injection = fake.injections[0]
    expect(injection.name).toBe('settings.section')

    // 宿主在槽位挂载时调用这个工厂 —— 本步只断言「注册了什么」，绝不渲染组件。
    injection.factory()

    expect(fake.registrations).toHaveLength(1)
    const { config, component } = fake.registrations[0]
    expect(config).toEqual({
      name: 'settings.section',
      id: 'width-slider',
      order: 600,
      label: 'Width Slider',
      locale: NS,
      inject: expect.any(Function),
    })
    expect(component).toBe(WidthSliderSettings)

    // props 注入面只有写：读只发生在入口启动时那一次 config load。
    const face = (config.inject as () => { writeSettings: (settings: unknown) => unknown })()
    expect(Object.keys(face)).toEqual(['writeSettings'])
    face.writeSettings({ widthSlider: true })
    expect(rpcWriteSettings).toHaveBeenCalledWith({ widthSlider: true })
  })

  it('returns void, not a cleanup (E14)', () => {
    // 清理统一走 ctx.effect 的 cleanup 链；自己再返回一个 cleanup 会变成无人认领的
    // 第二套生命周期。
    expect(mount().result).toBeUndefined()
  })

  it('keeps two mounts independent after the first one is uninstalled (E15)', () => {
    const first = mount({ motionMode: 'on' })
    const firstInstalls = [...h.log]
    expect(firstInstalls).toHaveLength(8)

    uninstall(first)
    h.log.length = 0
    const second = mount({ motionMode: 'on' })

    expect(second.effects.map((effect) => effect.name))
      .toEqual(first.effects.map((effect) => effect.name))
    // 逐字相同的安装序列：registry 若是模块级共享的，第二次会把「已经装过」当既成
    // 事实而一个都不装 —— 这条立刻变红。
    expect([...h.log]).toEqual(firstInstalls)
    // 第一次的订阅也退掉了，listener 只剩第二次那一个。
    expect(h.listeners.size).toBe(1)
  })

  it('warns again on the second mount because ledgerWarned is per apply (E15)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const boom = new Error('ledger down')

    const first = mount({ motionMode: 'on' })
    first.failLedger(boom)
    const firstPort = portOf(0)
    firstPort.isBlank()
    firstPort.isBlank()
    expect(warn).toHaveBeenCalledTimes(1)

    // ledgerWarned 是 apply 体内的 let，不随纯函数迁移 —— 每次装配各有一份。
    uninstall(first)
    const second = mount({ motionMode: 'on' })
    second.failLedger(boom)
    portOf(1).isBlank()

    expect(warn).toHaveBeenCalledTimes(2)
  })
})
