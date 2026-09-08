/**
 * 动效引擎注入的样式（整合自 dsh-client-ui-custom 的 motion.module.css）。
 *
 * 入场本身是命令式 Web Animations（见 animate.ts）：@starting-style 只在元素
 * 首次样式解析时生效，而宿主挂载面板/消息行时已经强制解析过一次。这里保留
 * 声明式的只有"关闭"那一拍——引擎把类加到已经在屏幕上的面板上，普通
 * transition 可靠且可中断。类名保持 dsu- 前缀，与引擎代码一致。
 */

/** 注入到 <head> 的动效样式表。 */
export const MOTION_CSS = `
.dsu-settings-panel {
  transform-origin: var(--dsu-settings-origin-x, 50%) var(--dsu-settings-origin-y, 50%);
}
.dsu-settings-closing {
  opacity: 0;
  scale: 0.62;
  pointer-events: none;
  transition:
    opacity 150ms cubic-bezier(0.4, 0, 1, 1),
    scale 220ms cubic-bezier(0.4, 0, 1, 1);
}
.dsu-settings-mask-closing {
  opacity: 0;
  transition: opacity 160ms cubic-bezier(0.4, 0, 1, 1);
}
@media (prefers-reduced-motion: reduce) {
  .dsu-settings-closing,
  .dsu-settings-mask-closing {
    transition: opacity 120ms linear;
  }
}
`
