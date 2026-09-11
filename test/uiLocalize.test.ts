// @vitest-environment jsdom
/**
 * 官方界面英文标签的中文化。用户可见后果分两类：该翻的没翻（中英混杂），以及
 * 不该动的被动了 —— 把代码里的英文、正文里的普通词、或者自己已经翻好的中文改坏。
 * 语言门控（en 界面不启用）在调用方 installLocalize 里，此处只管替换本身。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { installUiLocalize } from '../src/client/think/uiLocalize.ts'

let disposers: Array<() => void> = []

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve()
}

function install(): void {
  disposers.push(installUiLocalize())
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  for (const dispose of disposers) dispose()
  disposers = []
  document.body.innerHTML = ''
})

describe('词表替换', () => {
  it('translates the labels the host hard-codes in English', () => {
    document.body.innerHTML = '<div>Thinking</div><span>Tool Call</span><span>Turns</span>'
    install()
    expect(document.body.textContent).toContain('思考')
    expect(document.body.textContent).toContain('工具调用')
    expect(document.body.textContent).toContain('轮次')
  })

  it('leaves text that is not exactly a label alone', () => {
    document.body.innerHTML = '<div>Thinking about the problem</div>'
    install()
    // 精确匹配：不碰正文里恰好以标签开头的句子。
    expect(document.body.textContent).toBe('Thinking about the problem')
  })

  it('keeps the numbers in a dynamic label', () => {
    document.body.innerHTML = '<span>Turn 3</span><span>Tool call read_file</span>'
    install()
    const text = document.body.textContent ?? ''
    expect(text).toContain('第 3 轮')
    expect(text).toContain('工具调用 read_file')
  })

  it('never touches code', () => {
    document.body.innerHTML = '<pre><code>Thinking</code></pre><kbd>Tool Call</kbd>'
    install()
    // 代码块里的英文是内容，不是界面标签。
    expect(document.querySelector('code')?.textContent).toBe('Thinking')
    expect(document.querySelector('kbd')?.textContent).toBe('Tool Call')
  })
})

describe('工具调用卡片', () => {
  it('rewrites a card title only inside a tool-call row', () => {
    document.body.innerHTML =
      '<div>Search</div><div data-chat-call-id="c1"><span>Search</span></div>'
    install()
    const [outside, inside] = Array.from(document.querySelectorAll('div'))
    expect(outside?.textContent).toBe('Search')
    expect(inside?.textContent).toBe('搜索')
  })
})

describe('跟随宿主重渲染', () => {
  it('translates nodes the host renders later', async () => {
    install()
    const later = document.createElement('div')
    later.textContent = 'Tool Call'
    document.body.append(later)
    await flush()
    expect(later.textContent).toBe('工具调用')
  })

  it('follows an in-place text change', async () => {
    document.body.innerHTML = '<div id="x">Thinking</div>'
    install()
    const target = document.getElementById('x')
    if (target?.firstChild) (target.firstChild as Text).data = 'Tool Call'
    await flush()
    expect(target?.textContent).toBe('工具调用')
  })

  it('stays correct when it rescans its own output', async () => {
    document.body.innerHTML = '<div id="x">Thinking</div>'
    install()
    expect(document.getElementById('x')?.textContent).toBe('思考')
    document.body.append(document.createElement('p'))
    await flush()
    // 重扫不会把已经翻好的中文再动一遍。
    expect(document.getElementById('x')?.textContent).toBe('思考')
  })
})

describe('teardown', () => {
  it('stops translating after dispose', async () => {
    const dispose = installUiLocalize()
    const later = document.createElement('div')
    later.textContent = 'Thinking'
    document.body.append(later)
    await flush()
    expect(later.textContent).toBe('思考')
    dispose()
    const after = document.createElement('div')
    after.textContent = 'Tool Call'
    document.body.append(after)
    await flush()
    expect(after.textContent).toBe('Tool Call')
  })
})
