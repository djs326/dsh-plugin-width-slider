// @vitest-environment jsdom
/**
 * `motionStateOf` —— 从配置快照 + 「会话是否空白」派生引擎状态。
 *
 * 本批把它从入口的 `motionStateOf(ctx)` 剥成 `motion/state.ts` 里的纯函数：它不再读会话
 * 账本，账本事实由调用方（装配层的适配器）以 `blank` 传入。所以这里断言两件事：
 * 派生关系本身（总闸 × 系统偏好 × 风格档 × blank），以及返回值只由入参决定 ——
 * 没有 DOM、没有 store、没有模块级状态。
 *
 * 总闸与风格档的**纯函数**本身在 test/motionSettings.test.ts 覆盖；这里只管派生。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { motionStateOf } from '../src/client/motion/state.ts'
import { DEFAULT_FEATURE_SETTINGS, type FeatureSettings } from '../src/shared/settings.ts'
import { MOTION_LOOK_PRESETS, motionAllowed } from '../src/shared/motionSettings.ts'

/** 四个「动不动」的场景位：总闸统一决定，任何一处都不再单独暴露。 */
const SCENE_FIELDS = ['transcript', 'sidebar', 'newChat', 'roleEntrance'] as const

function settings(patch: Partial<FeatureSettings> = {}): FeatureSettings {
  return { ...DEFAULT_FEATURE_SETTINGS, ...patch }
}

/** 平台「减少动态效果」的桩：`prefersReducedMotion()` 读的就是这个查询。 */
function setReducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('motionStateOf', () => {
  it('never opens a scene on `off`, whatever the platform says', () => {
    for (const reduce of [false, true]) {
      setReducedMotion(reduce)
      const state = motionStateOf(settings({ motionMode: 'off' }), false)
      for (const field of SCENE_FIELDS) expect(state[field], `${field} @reduce=${reduce}`).toBe(false)
    }
  })

  it('opens every scene on `on`, even where the platform asks for less motion', () => {
    for (const reduce of [false, true]) {
      setReducedMotion(reduce)
      const state = motionStateOf(settings({ motionMode: 'on' }), false)
      for (const field of SCENE_FIELDS) expect(state[field], `${field} @reduce=${reduce}`).toBe(true)
    }
  })

  it('defers to the platform on `system`', () => {
    setReducedMotion(true)
    const reduced = motionStateOf(settings({ motionMode: 'system' }), false)
    for (const field of SCENE_FIELDS) expect(reduced[field]).toBe(false)

    setReducedMotion(false)
    const allowed = motionStateOf(settings({ motionMode: 'system' }), false)
    for (const field of SCENE_FIELDS) expect(allowed[field]).toBe(true)
  })

  it('carries the whole look, not one style field per scene', () => {
    for (const look of MOTION_LOOK_PRESETS) {
      // 风格由风格档整组给出：三处样式同源于一档，改动其中一处的取值必须让这里变红。
      const state = motionStateOf(settings({ motionLook: look.id }), false)
      expect(state.style, look.id).toBe(look.motionStyle)
      expect(state.sidebarStyle, look.id).toBe(look.sidebarMotionStyle)
      expect(state.newChatStyle, look.id).toBe(look.newChatMotionStyle)
    }
  })

  it('still fills the styles while the gate is shut', () => {
    // 关掉总闸只关「动不动」：引擎仍会读到一组完整样式，而不是 undefined。
    const off = motionStateOf(settings({ motionMode: 'off', motionLook: 'veil' }), false)
    expect(off.style).toBe('blur-in')
    expect(off.sidebarStyle).toBe('expand')
    expect(off.newChatStyle).toBe('bloom')
  })

  it('passes blank through untouched, and never lets it open a scene on its own', () => {
    expect(motionStateOf(settings({ motionMode: 'on' }), true).blank).toBe(true)
    expect(motionStateOf(settings({ motionMode: 'on' }), false).blank).toBe(false)
    // 空白会话只是「值得播入场」的额外条件，自己不构成放行。
    const blankWhileOff = motionStateOf(settings({ motionMode: 'off' }), true)
    expect(blankWhileOff.blank).toBe(true)
    for (const field of SCENE_FIELDS) expect(blankWhileOff[field]).toBe(false)
  })

  it('derives all four scene bits from the one gate across the whole matrix', () => {
    for (const mode of ['off', 'system', 'on'] as const) {
      for (const reduce of [false, true]) {
        setReducedMotion(reduce)
        const state = motionStateOf(settings({ motionMode: mode }), false)
        for (const field of SCENE_FIELDS) {
          expect(state[field], `${field} @${mode}/reduce=${reduce}`).toBe(motionAllowed(mode, reduce))
        }
      }
    }
  })

  it('returns exactly the eight fields the engine reads', () => {
    // 返回块的字段集合是引擎的接口面：多一个字段没人读，少一个字段引擎读 undefined。
    expect(Object.keys(motionStateOf(settings(), false)).sort()).toEqual([
      'blank', 'newChat', 'newChatStyle', 'roleEntrance', 'sidebar', 'sidebarStyle', 'style', 'transcript',
    ])
  })
})
