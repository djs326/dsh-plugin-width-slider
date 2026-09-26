/**
 * domContract.ts 的定位契约（批次⑥ 补测）。
 *
 * 三条路径各有对应用例：搜索框行的上溯（`locateHeader` 的 while 分支）、
 * 深度 ≤4 的子节点扫描（标题不在首位时）、以及没有搜索框时的纯 span 兜底。
 * 全部 fail-closed：认不出来就返回 null，绝不猜。
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { findOpenProjectRow, locateHeader, workspaceInfoFromRow } from '../src/client/patches/wsTabs/domContract.ts'

let host: HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  host = document.createElement('div')
  document.body.appendChild(host)
})

describe('locateHeader', () => {
  it('搜索框行：placeholder 命中后上溯到「首子节点是标题」的那一行', () => {
    host.innerHTML = [
      '<div id="outer">',
      '<div id="row"><span>工作区</span><input type="text" placeholder="搜索会话"></div>',
      '</div>',
    ].join('')
    const found = locateHeader(host)
    expect(found?.row.id).toBe('row')
    expect(found?.label.tagName).toBe('SPAN')
    expect(found?.label.textContent).toBe('工作区')
  })

  it('搜索框行：标题不在首位时由深度扫描命中', () => {
    host.innerHTML = [
      '<div id="outer">',
      '<div id="row"><input type="text" placeholder="Search sessions"><span>Sessions</span></div>',
      '</div>',
    ].join('')
    const found = locateHeader(host)
    expect(found?.row.id).toBe('row')
    expect(found?.label.textContent).toBe('Sessions')
  })

  it('没有搜索框时回退到纯 span 兜底', () => {
    host.innerHTML = '<div id="row"><span>会话</span><span>别的</span></div>'
    const found = locateHeader(host)
    expect(found?.row.id).toBe('row')
    expect(found?.label.textContent).toBe('会话')
  })

  it('认不出结构时返回 null（占位符不匹配、标题节点带子元素都算认不出）', () => {
    host.innerHTML = '<div id="row"><span>随便</span><input type="text" placeholder="无关"></div>'
    expect(locateHeader(host)).toBeNull()
    host.innerHTML = '<div id="row"><span>工作区<b></b></span></div>'
    expect(locateHeader(host)).toBeNull()
  })
})

describe('findOpenProjectRow', () => {
  it('没有 menuOpen 的组头行时返回 null', () => {
    host.innerHTML = '<div class="projectRow" id="closed"><span>工作区</span></div>'
    expect(findOpenProjectRow()).toBeNull()
  })

  it('返回带 menuOpen 的那个组头行', () => {
    host.innerHTML = '<div class="projectRow" id="closed"></div><div class="projectRow menuOpen" id="open"></div>'
    expect(findOpenProjectRow()?.id).toBe('open')
  })
})

describe('workspaceInfoFromRow', () => {
  it('行上没有 React fiber 时 fail-closed：workspaceId 为 null 且不抛异常', () => {
    host.innerHTML = '<div id="row" class="projectRow"><span class="title">标题</span></div>'
    const row = document.getElementById('row') as HTMLElement
    expect(workspaceInfoFromRow(row).workspaceId).toBeNull()
  })
})
