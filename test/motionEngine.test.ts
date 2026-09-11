// @vitest-environment jsdom
/**
 * 对话入场引擎。断言只落在用户能看见的结果上：关掉开关后是否真的静默、首批是否从上到下
 * 错峰、角色分流是否生效、切会话重播会不会把刚出现的行抖第二次、teardown 是否干净。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ENTRANCE_CLASSES,
  ROLE_PROCESS_CLASS,
  ROLE_USER_CLASS,
  ROW_IN_CLASS,
  anyMotionEnabled,
  installConversationEntrance,
  styleClass,
  type MotionEngine,
  type MotionEngineState,
} from '../src/client/motion/motion.ts'

interface AnimateCall {
  el: Element
  frames: Keyframe[]
  options: KeyframeAnimationOptions
}

let calls: AnimateCall[] = []
let engines: MotionEngine[] = []

function baseState(patch: Partial<MotionEngineState> = {}): MotionEngineState {
  return {
    transcript: true,
    sidebar: true,
    newChat: true,
    style: 'fade-up',
    roleEntrance: true,
    newChatStyle: 'bloom',
    sidebarStyle: 'slide-left',
    blank: false,
    ...patch,
  }
}

/** 排空 MutationObserver 的微任务回调。 */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve()
}

function mount(initial: MotionEngineState = baseState()): {
  engine: MotionEngine
  set: (patch: Partial<MotionEngineState>) => void
} {
  const holder = { current: initial }
  const listeners = new Set<() => void>()
  const engine = installConversationEntrance({
    getState: () => holder.current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  })
  engines.push(engine)
  return {
    engine,
    set: (patch) => {
      holder.current = { ...holder.current, ...patch }
      for (const listener of listeners) listener()
    },
  }
}

/** 一个转录列：宿主每条消息渲染一个 data-chat-anchor-key 包装。 */
function transcript(keys: Array<{ key: string; kind?: string }>): { flow: HTMLElement; rows: HTMLElement[] } {
  const flow = document.createElement('div')
  flow.setAttribute('data-chat-flow', '')
  const rows = keys.map(({ key, kind }) => {
    const row = document.createElement('div')
    row.setAttribute('data-chat-anchor-key', key)
    if (kind !== undefined) row.setAttribute('data-chat-flow-kind', kind)
    return row
  })
  flow.append(...rows)
  document.body.append(flow)
  return { flow, rows }
}

/** 侧边栏 rail：role="tree" 挂在真实祖先下（不是 body 直接子节点）。复用同一棵树以便追加。 */
function railItems(keys: string[]): HTMLElement[] {
  let rail = document.getElementById('rail')
  if (rail === null) {
    rail = document.createElement('div')
    rail.id = 'rail'
    document.body.append(rail)
  }
  let tree = rail.querySelector('[role="tree"]')
  if (tree === null) {
    tree = document.createElement('div')
    tree.setAttribute('role', 'tree')
    rail.append(tree)
  }
  const items = keys.map((key) => {
    const item = document.createElement('div')
    item.setAttribute('role', 'treeitem')
    item.setAttribute('data-key', key)
    return item
  })
  tree.append(...items)
  return items
}

const animates = (el: Element): AnimateCall[] => calls.filter((call) => call.el === el)
const delayOf = (el: HTMLElement): string => el.style.getPropertyValue('--dsu-motion-delay')
const animatedDelayOf = (el: Element): unknown => animates(el)[0]?.options.delay

beforeEach(() => {
  calls = []
  ;(Element.prototype as unknown as { animate: unknown }).animate = function (
    this: Element,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    calls.push({ el: this, frames, options })
    return { cancel: () => {}, playState: 'running' }
  }
})

afterEach(() => {
  for (const engine of engines) engine.dispose()
  engines = []
  document.body.innerHTML = ''
  delete (Element.prototype as unknown as { animate?: unknown }).animate
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('anyMotionEnabled', () => {
  it('is false only when every toggle is off', () => {
    expect(anyMotionEnabled(baseState({ transcript: false, sidebar: false, newChat: false }))).toBe(false)
    expect(anyMotionEnabled(baseState({ transcript: true, sidebar: false, newChat: false }))).toBe(true)
    expect(anyMotionEnabled(baseState({ transcript: false, sidebar: false, newChat: true }))).toBe(true)
  })
})

describe('transcript entrance', () => {
  it('stays fully silent while every toggle is off', async () => {
    mount(baseState({ transcript: false, sidebar: false, newChat: false }))
    const { rows } = transcript([{ key: 'a' }])
    await flush()
    expect(rows[0]?.classList.contains(ROW_IN_CLASS)).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('marks a row and records the chosen style', async () => {
    mount()
    const { rows } = transcript([{ key: 'a', kind: 'assistant-step' }])
    await flush()
    expect(rows[0]?.classList.contains(ROW_IN_CLASS)).toBe(true)
    expect(rows[0]?.classList.contains(styleClass('fade-up'))).toBe(true)
  })

  it('staggers a first render top-down so the surface cascades instead of popping', async () => {
    mount()
    const { rows } = transcript([{ key: 'a' }, { key: 'b' }, { key: 'c' }])
    await flush()
    expect(rows.map(delayOf)).toEqual(['0ms', '70ms', '140ms'])
    expect(rows.map(animatedDelayOf)).toEqual([0, 70, 140])
  })

  it('lands later rows immediately instead of joining the old stagger', async () => {
    mount()
    const { flow, rows } = transcript([{ key: 'a' }, { key: 'b' }, { key: 'c' }])
    await flush()
    // 追加两行：只有 batch=false 时两行才同为 0（单行追加的 staggerDelay(0) 也是 0，
    // 区分不出增量，所以这里必须是多行）。
    const late = ['d', 'e'].map((key) => {
      const row = document.createElement('div')
      row.setAttribute('data-chat-anchor-key', key)
      return row
    })
    flow.append(...late)
    await flush()
    expect(rows.map(delayOf)).toEqual(['0ms', '70ms', '140ms'])
    expect(late.map(delayOf)).toEqual(['0ms', '0ms'])
  })

  it('staggers a fresh transcript after the old one is replaced', async () => {
    mount()
    const { flow } = transcript([{ key: 'a' }, { key: 'b' }, { key: 'c' }])
    await flush()
    const replacement = ['x', 'y', 'z'].map((key) => {
      const row = document.createElement('div')
      row.setAttribute('data-chat-anchor-key', key)
      return row
    })
    flow.replaceChildren(...replacement)
    await flush()
    expect(replacement.map(delayOf)).toEqual(['0ms', '70ms', '140ms'])
  })
})

describe('role entrances', () => {
  it('sends the user sideways, process rows lightly, and prose on the chosen style', async () => {
    mount()
    const { rows } = transcript([
      { key: 'u', kind: 'user' },
      { key: 's', kind: 'steering' },
      { key: 't', kind: 'tool-call' },
      { key: 'p', kind: 'assistant-step' },
    ])
    await flush()
    expect(rows[0]?.classList.contains(ROLE_USER_CLASS)).toBe(true)
    expect(rows[1]?.classList.contains(ROLE_USER_CLASS)).toBe(true)
    expect(rows[2]?.classList.contains(ROLE_PROCESS_CLASS)).toBe(true)
    expect(rows[3]?.classList.contains(styleClass('fade-up'))).toBe(true)
    expect(rows[3]?.classList.contains(ROLE_PROCESS_CLASS)).toBe(false)
  })

  it('uses one style for every row when role entrances are off', async () => {
    mount(baseState({ roleEntrance: false }))
    const { rows } = transcript([{ key: 'u', kind: 'user' }, { key: 't', kind: 'tool-call' }])
    await flush()
    for (const row of rows) {
      expect(row.classList.contains(styleClass('fade-up'))).toBe(true)
      expect(row.classList.contains(ROLE_USER_CLASS)).toBe(false)
      expect(row.classList.contains(ROLE_PROCESS_CLASS)).toBe(false)
    }
  })
})

describe('sidebar tree', () => {
  it('uses the sidebar style, not the transcript one', async () => {
    mount()
    const items = railItems(['g1'])
    await flush()
    expect(items[0]?.classList.contains(styleClass('slide-left'))).toBe(true)
    expect(items[0]?.classList.contains(styleClass('fade-up'))).toBe(false)
  })

  it('leaves the rail alone when only the transcript toggle is on', async () => {
    mount(baseState({ sidebar: false }))
    const items = railItems(['g1'])
    const { rows } = transcript([{ key: 'a' }])
    await flush()
    expect(items[0]?.classList.contains(ROW_IN_CLASS)).toBe(false)
    expect(rows[0]?.classList.contains(ROW_IN_CLASS)).toBe(true)
  })

  it('fades a group expand in immediately, without the load stagger', async () => {
    mount()
    railItems(['g1'])
    await flush()
    // 群展开（增量）时行随群打开即刻出现，不等错峰。
    const expanded = railItems(['s1', 's2'])
    await flush()
    expect(expanded.map(delayOf)).toEqual(['0ms', '0ms'])
  })

  it('ignores a tree rendered inside the conversation view', async () => {
    mount()
    const { flow } = transcript([{ key: 'a' }])
    const tree = document.createElement('div')
    tree.setAttribute('role', 'tree')
    const item = document.createElement('div')
    item.setAttribute('role', 'treeitem')
    tree.append(item)
    flow.append(tree)
    await flush()
    expect(item.classList.contains(ROW_IN_CLASS)).toBe(false)
    expect(animates(item)).toHaveLength(0)
  })
})

describe('buffering while disabled', () => {
  it('replays rows observed before the toggle was turned on', async () => {
    const { set } = mount(baseState({ transcript: false, sidebar: false, newChat: false }))
    const { rows } = transcript([{ key: 'a' }])
    await flush()
    expect(rows[0]?.classList.contains(ROW_IN_CLASS)).toBe(false)
    set({ transcript: true })
    await flush()
    expect(rows[0]?.classList.contains(ROW_IN_CLASS)).toBe(true)
  })

  it('drops a batch that has been on screen too long to read as an arrival', async () => {
    let clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const { set } = mount(baseState({ transcript: false, sidebar: false, newChat: false }))
    const { rows } = transcript([{ key: 'a' }])
    await flush()
    clock = 5000
    set({ transcript: true })
    await flush()
    expect(rows[0]?.classList.contains(ROW_IN_CLASS)).toBe(false)
  })
})

describe('notifySessionSwitch', () => {
  it('replays rows the observer already animated long ago', async () => {
    vi.useFakeTimers()
    let clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const { engine } = mount()
    const { rows } = transcript([{ key: 'a' }])
    await flush()
    expect(animates(rows[0]!)).toHaveLength(1)
    clock = 2000
    engine.notifySessionSwitch()
    await vi.advanceTimersByTimeAsync(80)
    expect(animates(rows[0]!)).toHaveLength(2)
  })

  it('does not restart a row that just began its own entrance', async () => {
    vi.useFakeTimers()
    let clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const { engine } = mount()
    const { rows } = transcript([{ key: 'a' }])
    await flush()
    expect(animates(rows[0]!)).toHaveLength(1)
    engine.notifySessionSwitch()
    await vi.advanceTimersByTimeAsync(80)
    expect(animates(rows[0]!)).toHaveLength(1)
  })
})

describe('teardown', () => {
  it('clears every marker and stops observing', async () => {
    const { engine } = mount()
    const { rows } = transcript([{ key: 'a', kind: 'user' }])
    await flush()
    expect(rows[0]?.classList.contains(ROW_IN_CLASS)).toBe(true)
    engine.dispose()
    expect(rows[0]?.classList.contains(ROW_IN_CLASS)).toBe(false)
    for (const cls of ENTRANCE_CLASSES) expect(rows[0]?.classList.contains(cls)).toBe(false)
    expect(delayOf(rows[0]!)).toBe('')
    const before = calls.length
    transcript([{ key: 'b' }])
    await flush()
    expect(calls).toHaveLength(before)
  })
})

describe('thought bodies', () => {
  it('prints the body of an already-marked row line by line', async () => {
    mount()
    const { rows } = transcript([{ key: 'a', kind: 'assistant-step' }])
    await flush()
    const body = document.createElement('div')
    body.className = 'dsh-ws-think-body'
    rows[0]?.append(body)
    await flush()
    expect(animates(body)).toHaveLength(1)
  })

  it('leaves a body that arrives with its own row to the row entrance', async () => {
    mount()
    const flow = document.createElement('div')
    flow.setAttribute('data-chat-flow', '')
    const row = document.createElement('div')
    row.setAttribute('data-chat-anchor-key', 'a')
    row.setAttribute('data-chat-flow-kind', 'assistant-step')
    const body = document.createElement('div')
    body.className = 'dsh-ws-think-body'
    row.append(body)
    flow.append(row)
    document.body.append(flow)
    await flush()
    // 行本身入场了；同一段文字不能既随行入场又逐行擦出。
    expect(row.classList.contains(ROW_IN_CLASS)).toBe(true)
    expect(animates(body)).toHaveLength(0)
  })
})
