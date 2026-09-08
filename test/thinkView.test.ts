import { describe, expect, it } from 'vitest'
import { firstLine, latestLine, stripControlTags } from '../src/client/think/thinkView.tsx'

describe('stripControlTags', () => {
  it('剥离独占整行的控制标签', () => {
    expect(stripControlTags('<think>\nabc\n</think>')).toBe('abc\n')
    expect(stripControlTags('  <review>  \nxyz')).toBe('xyz')
  })

  it('保留正文/代码里的字面量（不误删）', () => {
    expect(stripControlTags('如何解析 <think> 标签')).toBe('如何解析 <think> 标签')
    expect(stripControlTags('const x = "<think>"')).toBe('const x = "<think>"')
  })

  it('空输入原样返回', () => {
    expect(stripControlTags('')).toBe('')
  })
})

describe('firstLine / latestLine', () => {
  it('取首行与末行（忽略尾部空白行）', () => {
    expect(firstLine('a\nb\nc')).toBe('a')
    expect(latestLine('a\nb\nc')).toBe('c')
    expect(latestLine('a\nb\nc\n\n')).toBe('c')
    expect(firstLine('single')).toBe('single')
    expect(latestLine('single')).toBe('single')
  })
})
