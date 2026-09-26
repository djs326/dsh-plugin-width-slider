// @vitest-environment jsdom
/**
 * MOTION_CSS —— 注入 <head> 的动效样式表（批次⑨-1）。
 *
 * 这个常量此前全仓零覆盖，唯一的回归网是产物逐字节比对；而 ⑨-2 的 A2 正要动它
 * （把三处 `cubic-bezier(0.7, 0, 0.84, 0)` 收敛成 EASE_EXIT 常量）。所以这里钉住
 * 的是**运行时取值本身**：
 *
 * - 整串逐字节快照。刻意不用 `toMatchSnapshot()`：快照文件会被无意 `-u` 刷新，
 *   而这个常量的取值必须与重构前逐字节一致；
 * - 退出曲线的计数与「不得复用入场曲线」——两者一起把设计意图写成可执行事实；
 * - reduced-motion 分支只覆盖两个关闭类；
 * - 关闭几何（scale 0.62）与 settingsMotion.ts 的入场首帧同源：未导出的常量只能
 *   从源码读，这条断言让「两处必须一起改」可执行（写成字面量只能当注释用，那与
 *   整串快照重复）。
 *
 * 期望值一律用 settingsMotion.ts 的类名常量插值：把类名再写一份字面量，改类名时
 * 测试与实现会一起漂移，测试就失去意义。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  SETTINGS_CLOSING_CLASS,
  SETTINGS_MASK_CLOSING_CLASS,
  SETTINGS_PANEL_CLASS,
} from '../src/client/motion/settingsMotion.ts'
import { MOTION_CSS } from '../src/client/motion/styles.ts'
import { EASE_FADE, EASE_GLIDE, EASE_SETTLE, EASE_SPRING } from '../src/client/motion/waapi.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * 期望的样式表：三个类名插值后的实际结果，换行用 LF。
 *
 * 逐字注意：第 1 行是空行、属性缩进两格、结尾有一个换行。
 *
 * 换行符是 **LF 而不是 CRLF**：本文件在磁盘上是 CRLF（本仓 core.autocrlf=true），
 * 模板串在源码里也是 CRLF，但转译这两个 .ts 模块时 CRLF 会被归一成 LF，于是比较
 * 发生在 LF↔LF 之间。实测确认（见交付报告第 7 条）：规格 §2.2 给的 `\n` 形态
 * 本来就是对的，我起初从文件字节推断出的「运行时是 CRLF」是错的。
 */
const EXPECTED_MOTION_CSS = `
.${SETTINGS_PANEL_CLASS} {
  transform-origin: var(--dsu-settings-origin-x, 50%) var(--dsu-settings-origin-y, 50%);
}
.${SETTINGS_CLOSING_CLASS} {
  opacity: 0;
  scale: 0.62;
  pointer-events: none;
  transition:
    opacity 160ms cubic-bezier(0.7, 0, 0.84, 0),
    scale 280ms cubic-bezier(0.7, 0, 0.84, 0);
}
.${SETTINGS_MASK_CLOSING_CLASS} {
  opacity: 0;
  transition: opacity 160ms cubic-bezier(0.7, 0, 0.84, 0);
}
@media (prefers-reduced-motion: reduce) {
  .${SETTINGS_CLOSING_CLASS},
  .${SETTINGS_MASK_CLOSING_CLASS} {
    transition: opacity 120ms linear;
  }
}
`

describe('MOTION_CSS', () => {
  it('is byte-for-byte the stylesheet with the class constants interpolated', () => {
    // 唯一能把「多余字符 / 少一个分号 / 类名插值写错」一起拦住的一条：拆成多个
    // toContain 会丢掉「多出东西」这一维度的保护。
    expect(MOTION_CSS).toBe(EXPECTED_MOTION_CSS)
  })

  it('keeps the first/last-line shape the injection depends on', () => {
    // 这段字符串被**原样**写进 <style> 的 textContent，首尾空白因此同属契约：开头
    // 那个换行是它与前一段内容的边界；结尾的 `}` 后必须还有一个换行，否则把下一段
    // 内容拼上去时会吃掉最后一条规则。
    expect(MOTION_CSS.startsWith('\n.')).toBe(true)
    expect(MOTION_CSS.endsWith('}\n')).toBe(true)
    // 运行时换行全是 LF（转译把源码的 CRLF 归一掉了）。这条拦的是「有人在字符串里
    // 手写 \r\n 转义」——那种写法不经过归一，会真的漏进 <style>。
    expect(MOTION_CSS).not.toContain('\r')
  })

  it('uses the exit curve exactly three times', () => {
    // 计数而不是抄字面量：⑨-2 把三处收敛成 EASE_EXIT 后插值结果不变，这条继续
    // 通过；而把它误改成入场曲线时计数会掉下来，从这里变红。
    expect(MOTION_CSS.match(/cubic-bezier\(0\.7, 0, 0\.84, 0\)/g)).toHaveLength(3)
  })

  it('shares no easing with the entrance curves', () => {
    // 批次③ 已核实 `cubic-bezier(0.7, 0, 0.84, 0)` 的 P1.y = P2.y = 0 ⇒ accelerate
    // （退出），与入场曲线方向相反 —— 当初没复用是设计意图。这条把「不得合并」
    // 写成可执行的事实：任何一次「顺手复用一个 EASE_*」都会在这里变红。
    const entrances = { EASE_GLIDE, EASE_FADE, EASE_SETTLE, EASE_SPRING }
    for (const [name, curve] of Object.entries(entrances)) {
      expect(MOTION_CSS, `${name} 不得出现在退出样式表里`).not.toContain(curve)
    }
  })

  it('scopes the reduced-motion branch to the two closing classes only', () => {
    // 面板本体（SETTINGS_PANEL_CLASS）在 reduced-motion 下不做过渡：它的入场是
    // 命令式的，由引擎自己降级；混进这里会让「减少动态」变成另一种动效。
    const media = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\}/.exec(MOTION_CSS)
    expect(media, 'MOTION_CSS 里必须有 prefers-reduced-motion 分支').not.toBeNull()
    const block = media![1]
    expect(block).toContain(`.${SETTINGS_CLOSING_CLASS}`)
    expect(block).toContain(`.${SETTINGS_MASK_CLOSING_CLASS}`)
    expect(block).not.toContain(SETTINGS_PANEL_CLASS)
  })

  it('takes its closing scale from SETTINGS_PANEL_FRAMES in settingsMotion.ts', () => {
    // PANEL_FRAMES 未导出，所以从源码读。这条断言的价值就在它跨文件：只改
    // settingsMotion.ts 的入场首帧（面板从哪缩进来）、忘了同步这里的 scale，
    // 会在这里变红，而整串快照仍然绿。
    const source = readFileSync(resolve(HERE, '../src/client/motion/settingsMotion.ts'), 'utf8')
    const frames = /const SETTINGS_PANEL_FRAMES[^=]*=\s*\[([\s\S]*?)\]/.exec(source)
    expect(frames, 'settingsMotion.ts 里必须有 SETTINGS_PANEL_FRAMES 数组字面量').not.toBeNull()
    const firstFrame = frames![1].split('},')[0]
    const scale = /scale:\s*([\d.]+)/.exec(firstFrame)
    expect(scale, 'PANEL_FRAMES 的首帧必须带 scale').not.toBeNull()
    expect(MOTION_CSS).toContain(`scale: ${scale![1]};`)
    // 首帧同时是 opacity 0：关闭那一拍就是「缩回入场首帧的位置」。
    expect(firstFrame).toContain('opacity: 0')
  })
})
