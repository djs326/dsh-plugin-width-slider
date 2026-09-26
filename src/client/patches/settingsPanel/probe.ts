/**
 * probe.ts — 两个设置面板补丁共用的 rAF 合并工具。
 *
 * body 级 MutationObserver 在流式输出时会持续触发，而探测动作（找弹窗、套用
 * 尺寸）要读写布局，必须合并到一帧一次。开关关闭时 `dispose()` 取消挂起的那
 * 一帧，避免回调落在已拆卸的补丁上。
 */

/** rAF 合并的 observer 回调包装：一帧内多次变更只跑一次 probe。 */
export function debouncedProbe(probe: () => void): { schedule: () => void; dispose: () => void } {
  let rafId = 0
  const schedule = (): void => {
    if (rafId !== 0) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      probe()
    })
  }
  const dispose = (): void => {
    if (rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }
  return { schedule, dispose }
}
