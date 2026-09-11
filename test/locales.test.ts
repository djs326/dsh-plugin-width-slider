// @vitest-environment jsdom
/**
 * 界面文案契约。这些断言的用户可见后果很直接：漏译会在界面上留一块空白、
 * 英文界面里冒出一句中文，或者飘着未替换的占位符。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { isZhInterface, pickText } from '../src/client/lang.ts'
import { en, zh } from '../src/client/locales.ts'

/** 中日韩统一表意文字。 */
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/

afterEach(() => {
  document.documentElement.lang = ''
  vi.unstubAllGlobals()
})

describe('文案词表', () => {
  it('zh 与 en 覆盖同一批键', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('没有空文案', () => {
    for (const [key, value] of [...Object.entries(zh), ...Object.entries(en)]) {
      expect(value.trim(), key).not.toBe('')
    }
  })

  it('没有把键名当成文案的占位', () => {
    for (const dict of [zh, en]) {
      for (const [key, value] of Object.entries(dict)) expect(value, key).not.toBe(key)
    }
  })

  it('英文词表里不残留中文', () => {
    // 例外：这条英文文案要在正文里点名它替换掉的中文术语，属于有意引用而非漏译。
    const QUOTED = new Set(['enableLocalizeInfo'])
    const leaked = Object.entries(en)
      .filter(([key, value]) => !QUOTED.has(key) && CJK.test(value))
      .map(([key]) => key)
    expect(leaked).toEqual([])
  })

  it('没有未替换的占位符', () => {
    for (const dict of [zh, en]) {
      for (const [key, value] of Object.entries(dict)) expect(value, key).not.toMatch(/\{[a-zA-Z]+\}/)
    }
  })
})

describe('界面语言判定', () => {
  it('follows documentElement.lang', () => {
    document.documentElement.lang = 'zh-CN'
    expect(isZhInterface()).toBe(true)
    document.documentElement.lang = 'en-US'
    expect(isZhInterface()).toBe(false)
  })

  it('falls back to the browser language when the document declares none', () => {
    document.documentElement.lang = ''
    vi.stubGlobal('navigator', { language: 'en-GB' })
    expect(isZhInterface()).toBe(false)
    vi.stubGlobal('navigator', { language: 'zh-TW' })
    expect(isZhInterface()).toBe(true)
  })

  it('does not treat an undeclared language as Chinese', () => {
    // 判不出语言时不中文化：宁可少替换，也不要把英文界面改成中文。
    document.documentElement.lang = ''
    vi.stubGlobal('navigator', { language: '' })
    expect(isZhInterface()).toBe(false)
  })

  it('picks the matching text for the interface', () => {
    document.documentElement.lang = 'zh'
    expect(pickText('中文', 'English')).toBe('中文')
    document.documentElement.lang = 'en'
    expect(pickText('中文', 'English')).toBe('English')
  })
})
