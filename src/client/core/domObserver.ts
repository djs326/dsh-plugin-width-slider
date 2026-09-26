/**
 * domObserver.ts — MutationObserver + rAF 合并（core 层）。
 *
 * body 级 MutationObserver 在流式输出时几乎每个 token 都触发，而消费方的回调大
 * 多要读写布局（测量、套尺寸、找弹窗），一帧内的多次变更必须合并成一次。这段
 * rAF 门闩此前在 5 个模块里各写了一遍（连注释都在重复"避免流式输出每 token 全
 * 文档扫描"），现在只有这一份：
 *
 *   let rafId = 0
 *   const schedule = () => { if (rafId !== 0) return; rafId = requestAnimationFrame(...) }
 *
 * `dispose()` 取消挂起的那一帧 —— 少了它，回调会落在已拆卸的功能上。
 *
 * 本模块只管「节流 + body 观察器装配」：**观察目标、观察参数、回调时机都由调用
 * 方决定**。语义不同的观察器不许套用 —— 入场引擎（motion/conversation.ts）在每
 * 个 mutation 上立即分类批次、且需要 mutation 列表本身，不做 rAF 合并，它留在
 * 原地；设置面板动效引擎的两处同理。
 */

/** rAF 合并的调用门闩。 */
export interface DomProbe {
  /** 请求在下一帧运行；同一帧内的重复调用只跑一次。 */
  schedule: () => void
  /** 取消挂起的那一帧（已经跑过的回调不受影响）。 */
  dispose: () => void
}

/**
 * 把回调合并到一帧一次。
 * @param probe - 一帧最多跑一次的动作（读写布局、探测节点）。
 */
export function debouncedProbe(probe: () => void): DomProbe {
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

/**
 * body 级 `childList`/`subtree` 观察器 + 上面的 rAF 合并：跟随宿主重挂载整棵子
 * 树（对话根、设置弹窗、侧栏列），观察点始终在 body 上，节点被整体替换也不会漏。
 *
 * 观察目标是 `document.body`：宿主渲染进 #root，插件应用时 body 一定在（引擎那
 * 边的 `?? documentElement` 兜底是为 pre-bootstrap 场景，不属于这里）。
 * @param probe - 一帧最多跑一次的动作。
 */
export function observeBodyDebounced(probe: () => void): DomProbe {
  const scheduled = debouncedProbe(probe)
  const observer = new MutationObserver(scheduled.schedule)
  observer.observe(document.body, { childList: true, subtree: true })
  return {
    schedule: scheduled.schedule,
    dispose: (): void => {
      observer.disconnect()
      scheduled.dispose()
    },
  }
}
