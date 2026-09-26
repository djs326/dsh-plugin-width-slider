/**
 * 动效引擎注入的样式（整合自 dsh-client-ui-custom 的 motion.module.css）。
 *
 * 入场本身是命令式 Web Animations（见 waapi.ts）：@starting-style 只在元素
 * 首次样式解析时生效，而宿主挂载面板/消息行时已经强制解析过一次。这里保留
 * 声明式的只有"关闭"那一拍——引擎把类加到已经在屏幕上的面板上，普通
 * transition 可靠且可中断。
 *
 * 类名不再手写：从 settingsMotion.ts 的 class 常量插值生成，改名只改一处，
 * CSS 与引擎代码不会各自漂移。
 */
import {
  SETTINGS_CLOSING_CLASS,
  SETTINGS_MASK_CLOSING_CLASS,
  SETTINGS_PANEL_CLASS,
} from './settingsMotion.ts'

/**
 * 注入到 <head> 的动效样式表。
 *
 * 关闭的几何与引擎的入场帧对称：settingsMotion.ts 的 PANEL_FRAMES 起始正是
 * opacity 0 / scale 0.62，两处必须一起改（本批只记录这层同源关系）。这类说明
 * 一律留在模板串之外 —— 该常量的运行时取值必须与重构前逐字节一致。
 */
export const MOTION_CSS = `
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
