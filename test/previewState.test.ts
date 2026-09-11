// @vitest-environment jsdom
/**
 * 预览状态标记。它决定设置面板动效引擎在按 Escape 时是否让出这一次按键 ——
 * 标记写错就会出现「一次 Esc 同时退出预览并关掉整个设置面板」。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PREVIEW_ATTR, isPreviewOpen, setPreviewOpen } from '../src/client/previewState.ts'

afterEach(() => {
  // 先恢复全局：上一个用例可能把 document 换掉了，之后才能碰 DOM。
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute(PREVIEW_ATTR)
})

describe('previewState', () => {
  it('starts closed', () => {
    expect(isPreviewOpen()).toBe(false)
  })

  it('publishes the open state on documentElement', () => {
    setPreviewOpen(true)
    expect(document.documentElement.hasAttribute(PREVIEW_ATTR)).toBe(true)
    expect(isPreviewOpen()).toBe(true)
  })

  it('clears the marker when the preview ends', () => {
    setPreviewOpen(true)
    setPreviewOpen(false)
    expect(document.documentElement.hasAttribute(PREVIEW_ATTR)).toBe(false)
    expect(isPreviewOpen()).toBe(false)
  })

  it('is idempotent in both directions', () => {
    setPreviewOpen(true)
    setPreviewOpen(true)
    expect(document.documentElement.getAttribute(PREVIEW_ATTR)).toBe('')
    setPreviewOpen(false)
    setPreviewOpen(false)
    expect(isPreviewOpen()).toBe(false)
  })

  it('degrades to a no-op without a document', () => {
    setPreviewOpen(true)
    vi.stubGlobal('document', undefined)
    expect(isPreviewOpen()).toBe(false)
    expect(() => setPreviewOpen(true)).not.toThrow()
  })
})
