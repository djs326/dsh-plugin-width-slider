/**
 * sync.ts — Open With 数据变更广播（同窗口事件总线 + BroadcastChannel 跨窗口）。
 *
 * 背景：currentId / 胶囊项（增删改、隐藏、图标）都由 host settings 文件持久，
 * 但 OpenWithButton（每个会话头部）只在挂载时读一次——设置面板里"设为当前"
 * 或改动项后，已挂载的其它头部按钮不会即时跟上，要切换会话重挂载才同步。
 *
 * 方案：所有写 host 的调用点在成功后 emitOpenWithChanged()；每个头部按钮
 * 订阅该事件并重拉（readCapsuleItems/readHiddenIds/readCurrentId）。同一
 * renderer 内经事件总线即时通知；DSH 多窗口经 BroadcastChannel（同 session
 * partition）互通。无 payload：各按钮自行读 host 真源，杜绝脏值传播。
 * BroadcastChannel 不可用时静默降级为仅同窗口总线（老环境不会崩）。
 */

const CHANNEL_NAME = 'dsh-open-with:changed'
type Listener = () => void

const bus = new Set<Listener>()

let channel: BroadcastChannel | null = null
try {
  channel = new BroadcastChannel(CHANNEL_NAME)
  channel.onmessage = () => {
    for (const fn of bus) {
      try { fn() } catch { /* 单个监听器异常不影响其它 */ }
    }
  }
} catch {
  channel = null
}

/** 订阅 Open With 数据变更（返回退订函数）。 */
export function subscribeOpenWithChanged(fn: Listener): () => void {
  bus.add(fn)
  return () => {
    bus.delete(fn)
  }
}

/** 在 host 写入成功后广播一次（同窗口立即 + 跨窗口异步）。 */
export function emitOpenWithChanged(): void {
  for (const fn of bus) {
    try { fn() } catch { /* 忽略单监听器异常 */ }
  }
  try {
    if (channel !== null) channel.postMessage('changed')
  } catch { /* 忽略 */ }
}
