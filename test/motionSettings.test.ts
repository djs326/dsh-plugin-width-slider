/**
 * 动效设置值的守卫与预设。守卫失效会让一个非法样式 id 直接进引擎（入场帧查不到，
 * 行就不入场）；预设里写错 id 会让「一键换风格」当场失效。
 */
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MOTION_LOOK,
  DEFAULT_MOTION_MODE,
  MOTION_LOOKS,
  MOTION_LOOK_PRESETS,
  MOTION_MODES,
  MOTION_STYLES,
  NEW_CHAT_MOTION_STYLES,
  SIDEBAR_MOTION_STYLES,
  isMotionLook,
  isMotionMode,
  isMotionStyle,
  isNewChatMotionStyle,
  isSidebarMotionStyle,
  motionAllowed,
  motionLookOf,
} from '../src/shared/motionSettings.ts'

describe('样式守卫', () => {
  it('accepts every id in its own list', () => {
    for (const id of MOTION_STYLES) expect(isMotionStyle(id), id).toBe(true)
    for (const id of SIDEBAR_MOTION_STYLES) expect(isSidebarMotionStyle(id), id).toBe(true)
    for (const id of NEW_CHAT_MOTION_STYLES) expect(isNewChatMotionStyle(id), id).toBe(true)
  })

  it('rejects anything not in its own list', () => {
    for (const guard of [isMotionStyle, isSidebarMotionStyle, isNewChatMotionStyle]) {
      expect(guard('nope')).toBe(false)
      expect(guard('')).toBe(false)
      expect(guard(undefined)).toBe(false)
      expect(guard(null)).toBe(false)
      expect(guard(42)).toBe(false)
    }
  })

  it('keeps the three style sets apart', () => {
    // 'slide-left' 是侧栏样式：转录守卫不能收下它，否则引擎查不到入场帧。
    expect(isMotionStyle('slide-left')).toBe(false)
    expect(isSidebarMotionStyle('fade-up')).toBe(false)
    expect(isNewChatMotionStyle('fade-up')).toBe(false)
    expect(isSidebarMotionStyle('reveal')).toBe(false)
  })

  it('has no duplicate ids inside a set', () => {
    expect(new Set(MOTION_STYLES).size).toBe(MOTION_STYLES.length)
    expect(new Set(SIDEBAR_MOTION_STYLES).size).toBe(SIDEBAR_MOTION_STYLES.length)
    expect(new Set(NEW_CHAT_MOTION_STYLES).size).toBe(NEW_CHAT_MOTION_STYLES.length)
  })
})

describe('风格档', () => {
  it('uses unique ids', () => {
    const ids = MOTION_LOOK_PRESETS.map((look) => look.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('holds only valid style ids', () => {
    for (const look of MOTION_LOOK_PRESETS) {
      expect(isMotionStyle(look.motionStyle), `${look.id}.motionStyle`).toBe(true)
      expect(isSidebarMotionStyle(look.sidebarMotionStyle), `${look.id}.sidebarMotionStyle`).toBe(true)
      expect(isNewChatMotionStyle(look.newChatMotionStyle), `${look.id}.newChatMotionStyle`).toBe(true)
    }
  })

  it('accepts exactly the four look ids', () => {
    for (const id of MOTION_LOOKS) expect(isMotionLook(id), id).toBe(true)
    expect(isMotionLook('nope')).toBe(false)
    expect(isMotionLook('')).toBe(false)
    expect(isMotionLook(undefined)).toBe(false)
    expect(isMotionLook(true)).toBe(false)
  })

  it('keeps the default id valid', () => {
    expect(isMotionLook(DEFAULT_MOTION_LOOK)).toBe(true)
  })

  it('falls back to the default look for an unknown id', () => {
    // 存档里可能是旧版本的 look id：查不到必须回落到默认档，而不是让引擎拿到 undefined。
    expect(motionLookOf('nope' as never).id).toBe(DEFAULT_MOTION_LOOK)
    expect(motionLookOf('nope' as never).motionStyle).toBe(motionLookOf(DEFAULT_MOTION_LOOK).motionStyle)
  })

  it('resolves every id to itself', () => {
    for (const id of MOTION_LOOKS) expect(motionLookOf(id).id).toBe(id)
  })
})

describe('动效总闸', () => {
  it('accepts exactly the three modes', () => {
    for (const mode of MOTION_MODES) expect(isMotionMode(mode), mode).toBe(true)
    expect(isMotionMode('nope')).toBe(false)
    expect(isMotionMode('')).toBe(false)
    expect(isMotionMode(undefined)).toBe(false)
    expect(isMotionMode(true)).toBe(false)
  })

  it('keeps the default valid', () => {
    expect(isMotionMode(DEFAULT_MOTION_MODE)).toBe(true)
  })
})

describe('总闸判定', () => {
  it('never allows anything while off, whatever the system says', () => {
    expect(motionAllowed('off', true)).toBe(false)
    expect(motionAllowed('off', false)).toBe(false)
  })

  it('hands the decision to the system in system mode', () => {
    // 系统要求减少动态 → 不放行；系统没要求 → 放行。
    expect(motionAllowed('system', true)).toBe(false)
    expect(motionAllowed('system', false)).toBe(true)
  })

  it('stays on in on mode even when the system reduces motion', () => {
    // 「开启」是用户明确覆盖系统的表态，不能因为系统设置反向失效。
    expect(motionAllowed('on', true)).toBe(true)
    expect(motionAllowed('on', false)).toBe(true)
  })
})
