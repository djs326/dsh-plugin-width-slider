/**
 * OpenWithButton.tsx — 对话头部"用其他应用打开"胶囊拆分按钮。
 *
 * 收编自 dsh-plugin-open-with（修改版：actions 槽位同槽注入修复）。
 * 上游：https://github.com/hyrinx/dsh-plugin-open-with（MIT，Copyright (c)
 * 2026 hyrinx <xhy_23@qq.com>；归属声明见 THIRD_PARTY_NOTICES.md）。
 * 转写自上游 lib/client.js 的 OpenVscodeButton 区，行为等价：
 * - 左侧主按钮：显示当前启动项（图标+名称），点击直接启动当前会话目录；
 * - 右侧箭头按钮：打开下拉菜单选择启动项（选择即启动并切换当前项）；
 * - 菜单项 = 设置中的胶囊项（预设+自定义），过滤隐藏项；
 * - 图标来自设置中持久化的 data URL（提取失败回退默认图标）。
 * 差异：点外关闭菜单用原生 pointerdown 监听（上游依赖官方
 * useDismissOnOutsidePointer hook）；chevron 图标内联（上游用官方
 * primitives IconChevronDownOutline14）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** 默认图标（DSH logo 风格），用于图标提取完成前的回退。 */
const fallbackIcon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAKDSURBVFhH7ZZJyI1xFMZ/yJQpMmRhDkkplCglWSAiUaadDSVDlI2FhZAyFAsbCSkiYqGQDBEbU4ayMC1E5qnMUw/nvY7j3O/e78PuPnW63TM9533P//zPCzXU8H/QEhgXlQ1FE6At0ML+K/kMYB9wF7gCdAoxc4A7Ftsg9Ac2AteA98AX4DPwBHgFfHMyJgYD28y2C+gajYbewLSoVMVrjcyT1CUjYxJgj7O/AcaavjMwHJgF3Ad2+yCR708IKsljYKJPBKwOPjeB9cCnoF/ug1YmyasVtWixyzUs8YmiGLX6BwYAHxOn+shXYJkrYnvi42WD8y0dmr8VFbHAcjYHdiQ+asMaPyFN3cl+av16lgRWKypihRGMcPpbwDygx6/n/onB5nAKaGw6/fa1vl5PSCKh7oJY9AXgiPt/OPCWMMUczkSDQcXo4nmQkEtuA4PssqprirbExAWmm8NDoFE0OnQEjieJP9iB0+2ndp5NfCRzY8IC451Tz2gMaAYcSJLr7Swyn35lJmpgyFWCZrFwWhiNCbQTziUE6rnekt7CxWBTm8pCPS4O0NUKbSjQDXieFPEWeJHoNRV1YqdznhyNZTA7IcrkdbIt/4AWShGgeW0VHRLoTR1KCKMsjYHl4GdWW6q4EwpofS4B2jldF5ueSFrI0fp8E/QJu36rHagCQ0wvQt+mUTaKkfwG0N75VYVJYWWeBno5+wnT6/bbbGMpzExW7TFgdJWH+jcomX+id8BBu8leBpLzwFAjmVBmAi4B3SNJJehQ3kuSlZNHtjP0CbbOCtM3oRbbXqBDJKgGbYBVyVNnogLmJwf3n6C1LSO14CRw2W46Tc0mYKr7Yq6hhnrjO8xVal7nQeXKAAAAAElFTkSuQmCC'

/** Renders a data-URL PNG icon at a given size. */
function PngIcon({ src, size = 14 }: { src: string; size?: number }) {
  return (
    <img
      src={src || fallbackIcon}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{
        display: 'block',
        width: size,
        height: size,
        imageRendering: '-webkit-optimize-contrast',
      }}
    />
  )
}

/** 下拉箭头（12px，官方 chevron 同款 path）。 */
function ChevronIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

/** 胶囊项（设置文件中 items 的运行时视图）。 */
export interface CapsuleItem {
  id: string
  name: string
  path: string
  icon: string
  preset: boolean
  target?: 'code' | 'cmd' | 'powershell' | 'explorer'
}

/** header actions slot 注入的能力面。 */
export interface OpenWithButtonInjected {
  launch: (cwd: string, target: string) => Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string } }>
  getCwd: (sessionId: string) => string | undefined
  log: (level: 'info' | 'warn' | 'error', message: string, extra?: unknown) => void
  readHiddenIds: () => Promise<string[]>
  readCapsuleItems: () => Promise<CapsuleItem[]>
  /** 读设置文件中的当前项 id（设置面板"设为当前"的同源值）。 */
  readCurrentId: () => Promise<string | null>
  /** 选择项后写回 currentId（与设置面板的"设为当前"同源）。 */
  setCurrent: (id: string) => Promise<unknown>
}

export interface OpenWithButtonProps extends OpenWithButtonInjected {
  sessionId: string
  /** 翻译函数（与设置区块共用 widthSlider 词典）。 */
  t: (key: string) => string
}

/** 启动流程：取会话目录 → RPC launch → 结果日志。 */
function useLaunchFlow(
  target: string,
  sessionId: string,
  launch: OpenWithButtonInjected['launch'],
  getCwd: OpenWithButtonInjected['getCwd'],
  log: OpenWithButtonInjected['log'],
) {
  const run = useCallback(async () => {
    try {
      const cwd = getCwd(sessionId)
      if (cwd === undefined || cwd.length === 0) {
        log('warn', 'cwd not found for session', { sessionId })
        return
      }
      log('info', 'button clicked', { sessionId, target, cwd })
      const result = await launch(cwd, target)
      if (result.ok) log('info', 'RPC result', result)
      else log('warn', 'RPC returned error', result)
    } catch (err) {
      log('error', 'button click failed', err)
    }
  }, [target, sessionId, launch, getCwd, log])
  return { run }
}

export function OpenWithButton({
  sessionId, launch, getCwd, log, readHiddenIds, readCapsuleItems, readCurrentId, setCurrent, t,
}: OpenWithButtonProps) {
  const [target, setTarget] = useState('code')
  const [open, setOpen] = useState(false)
  const [hiddenIds, setHiddenIds] = useState<string[]>([])
  const [capsuleItems, setCapsuleItems] = useState<CapsuleItem[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLButtonElement>(null)

  // 点外关闭菜单（上游用官方 useDismissOnOutsidePointer）。
  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      const root = rootRef.current
      if (root && event.target instanceof Node && !root.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // 初始装载：胶囊项 + 隐藏项 + 当前项（设置面板"设为当前"同源）。
  // 初载 target = currentId（有效时），否则落第一项；卸载后不再 setState。
  useEffect(() => {
    let alive = true
    Promise.all([readCapsuleItems(), readHiddenIds(), readCurrentId()])
      .then(([items, hidden, currentId]) => {
        if (!alive) return
        setCapsuleItems(items)
        setHiddenIds(hidden)
        const wanted = currentId !== null && items.some((it) => it.id === currentId)
          ? currentId
          : (items[0]?.id ?? 'code')
        setTarget(wanted)
      })
      .catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readCapsuleItems, readHiddenIds, readCurrentId])

  const { run } = useLaunchFlow(target, sessionId, launch, getCwd, log)

  const currentItem = capsuleItems.find((it) => it.id === target)
  const label = currentItem?.name ?? t('owTargetCode')
  const title = t('owTooltip')
  const visibleItems = capsuleItems.filter((it) => !hiddenIds.includes(it.id))

  const hoverVar = 'var(--dsw-hover, rgba(0,0,0,0.05))'
  const borderVar = 'var(--dsw-border-strong, rgba(0,0,0,0.12))'
  const textVar = 'var(--dsw-fg, inherit)'
  const menuBgVar = 'var(--dsw-specific-menu, transparent)'
  const menuBorderVar = 'var(--dsw-alias-border-l2, rgba(0,0,0,0.08))'
  const menuShadowVar = 'var(--dsw-shadow-lv3, 0 8px 24px rgba(0,0,0,0.08))'

  const onRootKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
      pickerRef.current?.focus()
    }
  }

  const onActionClick = () => {
    if (open) setOpen(false)
    run()
  }

  const onPickerClick = () => {
    const willOpen = !open
    setOpen(willOpen)
    if (willOpen) {
      readCapsuleItems().then((items) => setCapsuleItems(items)).catch(() => {})
      readHiddenIds().then(setHiddenIds).catch(() => {})
    }
  }

  const selectTarget = (next: string) => {
    setTarget(next)
    setOpen(false)
    const cwd = getCwd(sessionId)
    if (cwd === undefined || cwd.length === 0) {
      log('warn', 'cwd not found for session', { sessionId })
      return
    }
    log('info', 'picker selected launch', { sessionId, target: next, cwd })
    // 写回 currentId（host setCurrent），与设置面板"设为当前"同源。
    setCurrent(next).catch((err) => {
      log('warn', 'setCurrent failed', err)
    })
    launch(cwd, next).then((result) => {
      if (result.ok) log('info', 'RPC result', result)
      else log('warn', 'RPC returned error', result)
    }).catch((err) => {
      log('error', 'picker launch failed', err)
    })
  }

  return (
    <div
      ref={rootRef}
      onKeyDown={onRootKeyDown}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'stretch',
        height: '28px',
        padding: 0,
        borderRadius: '6px',
        border: '1px solid ' + borderVar,
        background: 'transparent',
        color: textVar,
        fontSize: '13px',
        overflow: 'visible',
      }}
    >
      <button
        type="button"
        onClick={onActionClick}
        title={title}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          height: '100%',
          padding: '0 8px',
          border: 'none',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          borderRadius: '6px 0 0 6px',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = hoverVar }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <PngIcon src={currentItem?.icon ?? ''} size={14} />
        <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
      </button>
      <span aria-hidden="true" style={{ width: '1px', height: '100%', background: borderVar, flex: '0 0 auto' }} />
      <button
        ref={pickerRef}
        type="button"
        onClick={onPickerClick}
        aria-label={t('owPickerAria')}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '0 6px',
          border: 'none',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          borderRadius: '0 6px 6px 0',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = hoverVar }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.15s',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        >
          <ChevronIcon size={12} />
        </span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t('owMenuAria')}
          style={{
            position: 'absolute',
            top: 'calc(100% + 5px)',
            right: 0,
            minWidth: '168px',
            maxWidth: 'min(320px, calc(100vw - 32px))',
            maxHeight: 'min(320px, calc(100vh - 120px))',
            overflowY: 'auto',
            background: menuBgVar,
            backdropFilter: 'saturate(180%) blur(20px)',
            WebkitBackdropFilter: 'saturate(180%) blur(20px)',
            border: '1px solid ' + menuBorderVar,
            borderRadius: '6px',
            boxShadow: menuShadowVar,
            padding: '4px',
            zIndex: 100,
          }}
        >
          {visibleItems.map((item) => (
            <button
              key={item.id}
              role="menuitem"
              type="button"
              onClick={() => selectTarget(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '6px 10px',
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: '13px',
                borderRadius: '6px',
                fontWeight: target === item.id ? 600 : 400,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = hoverVar }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <PngIcon src={item.icon ?? ''} size={14} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
