import { applySavedWidth } from '../../widthPrefs.ts'
import type { Disposer } from '../../../shared/types.ts'

/** 隐藏官方原生宽度拖拽手柄（稳定属性选择器，升级不失效）。 */
const HANDLE_HIDE_CSS = `
[data-width-handle]{display:none!important}
`

/**
 * 宽度滑块功能安装器（开关=开时）：
 * - 启动即恢复上次宽度偏好（applySavedWidth：follow 起全局跟随 watcher；
 *   fixed 值等对话根出现后发布一次）——修复"重启后偏好不生效、打开插件页
 *   才生效"（应用曾只挂在 WidthSliderControl 组件生命周期内）；
 * - 注入隐藏原生手柄的样式；
 * - 卸载时（开关关闭）：停全局 watcher/发布、移除样式、清除插件写在各
 *   对话根上的内联 --dsh-chat-user-width——立即回到官方默认/其自身持久值。
 */
export function installWidthFeature(): Disposer {
  const disposers: Disposer[] = []
  try {
    disposers.push(applySavedWidth())
  } catch { /* 偏好缺失/环境异常时不阻塞开关安装 */ }
  const style = document.createElement('style')
  style.id = 'dsh-plugin-width-slider-hide-handles'
  style.textContent = HANDLE_HIDE_CSS
  // 幂等：热重载/重复实例时先清掉旧同 id 样式，避免开关只移除自己那份。
  document.getElementById(style.id)?.remove()
  document.head.appendChild(style)
  disposers.push(() => { style.remove() })
  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch { /* 清理异常忽略 */ }
    }
    try {
      document.querySelectorAll<HTMLElement>('[data-phase]').forEach((el) => {
        el.style.removeProperty('--dsh-chat-user-width')
      })
    } catch { /* 忽略 */ }
  }
}
