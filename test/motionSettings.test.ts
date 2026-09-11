/**
 * 动效设置值的守卫与预设。守卫失效会让一个非法样式 id 直接进引擎（入场帧查不到，
 * 行就不入场）；预设里写错 id 会让「一键换风格」当场失效。
 */
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MOTION_STYLE,
  DEFAULT_NEW_CHAT_MOTION_STYLE,
  DEFAULT_SIDEBAR_MOTION_STYLE,
  MOTION_PRESETS,
  MOTION_STYLES,
  NEW_CHAT_MOTION_STYLES,
  SIDEBAR_MOTION_STYLES,
  isMotionStyle,
  isNewChatMotionStyle,
  isSidebarMotionStyle,
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

  it('keeps the defaults valid', () => {
    expect(isMotionStyle(DEFAULT_MOTION_STYLE)).toBe(true)
    expect(isSidebarMotionStyle(DEFAULT_SIDEBAR_MOTION_STYLE)).toBe(true)
    expect(isNewChatMotionStyle(DEFAULT_NEW_CHAT_MOTION_STYLE)).toBe(true)
  })

  it('has no duplicate ids inside a set', () => {
    expect(new Set(MOTION_STYLES).size).toBe(MOTION_STYLES.length)
    expect(new Set(SIDEBAR_MOTION_STYLES).size).toBe(SIDEBAR_MOTION_STYLES.length)
    expect(new Set(NEW_CHAT_MOTION_STYLES).size).toBe(NEW_CHAT_MOTION_STYLES.length)
  })
})

describe('动效预设', () => {
  it('uses unique ids', () => {
    const ids = MOTION_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('holds only valid style ids', () => {
    for (const { id, config } of MOTION_PRESETS) {
      expect(isMotionStyle(config.motionStyle), `${id}.motionStyle`).toBe(true)
      expect(isSidebarMotionStyle(config.sidebarMotionStyle), `${id}.sidebarMotionStyle`).toBe(true)
      expect(isNewChatMotionStyle(config.newChatMotionStyle), `${id}.newChatMotionStyle`).toBe(true)
      expect(typeof config.motionEnabled).toBe('boolean')
      expect(typeof config.sidebarMotionEnabled).toBe('boolean')
      expect(typeof config.newChatMotionEnabled).toBe('boolean')
      expect(typeof config.settingsMotionEnabled).toBe('boolean')
    }
  })
})
