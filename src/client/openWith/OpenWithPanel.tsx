/**
 * OpenWithPanel.tsx — Open With 配置面板（嵌入总控页的卡片分组）。
 *
 * 收编自 dsh-plugin-open-with（MIT，Copyright (c) 2026 hyrinx <xhy_23@qq.com>；
 * 归属声明见 THIRD_PARTY_NOTICES.md）。转写自上游 src/client/OpenWithSettings.tsx
 * （设置面板与 slot 注入修复无关，官方源码即行为基准），差异：
 * - 组件改名 OpenWithPanel，作为 WidthSliderSettings 总控页的 Open With 分组；
 * - 可见性切换按钮的 emoji 图标换成内联 SVG（遵守"不使用 emoji"约定）；
 * - t 使用与总控页同一词典（widthSlider 命名空间，settings.* 引号键）。
 *
 * 功能：预设项/自定义项两组列表——组内拖拽排序、点击设为当前、隐藏/显示
 * 切换；自定义项支持添加/编辑/删除（路径自动去引号）；图标后台提取
 * （extractIcon），预设项首次渲染自动补图标；全部改动即写 host 设置文件。
 */
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

/** 默认应用图标（DSH logo 风格），用于图标提取完成前的回退。 */
const appDefaultPngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAKDSURBVFhH7ZZJyI1xFMZ/yJQpMmRhDkkplCglWSAiUaadDSVDlI2FhZAyFAsbCSkiYqGQDBEbU4ayMC1E5qnMUw/nvY7j3O/e78PuPnW63TM9533P//zPCzXU8H/QEhgXlQ1FE6At0ML+K/kMYB9wF7gCdAoxc4A7Ftsg9Ac2AteA98AX4DPwBHgFfHMyJgYD28y2C+gajYbewLSoVMVrjcyT1CUjYxJgj7O/AcaavjMwHJgF3Ad2+yCR708IKsljYKJPBKwOPjeB9cCnoF/ug1YmyasVtWixyzUs8YmiGLX6BwYAHxOn+shXYJkrYnvi42WD8y0dmr8VFbHAcjYHdiQ+asMaPyFN3cl+av16lgRWKypihRGMcPpbwDygx6/n/onB5nAKaGw6/fa1vl5PSCKh7oJY9AXgiPt/OPCWMMUczkSDQcXo4nmQkEtuA4PssqprirbExAWmm8NDoFE0OnQEjieJP9iB0+2ndp5NfCRzY8IC451Tz2gMaAYcSJLr7Swyn35lJmpgyFWCZrFwWhiNCbQTziUE6rnekt7CxWBTm8pCPS4O0NUKbSjQDXieFPEWeJHoNRV1YqdznhyNZTA7IcrkdbIt/4AWShGgeW0VHRLoTR1KCKMsjYHl4GdWW6q4EwpofS4B2jldF5ueSFrI0fp8E/QJu36rHagCQ0wvQt+mUTaKkfwG0N75VYVJYWWeBno5+wnT6/bbbGMpzExW7TFgdJWH+jcomX+id8BBu8leBpLzwFAjmVBmAi4B3SNJJehQ3kuSlZNHtjP0CbbOCtM3oRbbXqBDJKgGbYBVyVNnogLmJwf3n6C1LSO14CRw2W46Tc0mYKr7Yq6hhnrjO8xVal7nQeXKAAAAAElFTkSuQmCC'

// ── 类型定义 ─────────────────────────────────────────────────────────

export interface OpenWithItem {
  id: string
  /** 显示名称 */
  name: string
  /** 可执行文件/目标路径 */
  path: string
  /** 图标 data URL（空串表示使用默认图标） */
  icon: string
  /** 是否为预设项（预设项不可删除） */
  preset: boolean
  /** 启动目标类型（预设项使用） */
  target?: LaunchTarget
}

export type LaunchTarget = 'code' | 'cmd' | 'powershell' | 'explorer'

export interface OpenWithSettingsData {
  /** 当前选中项的 id */
  currentId: string
  /** 所有项列表 */
  items: OpenWithItem[]
  /** 在胶囊菜单中隐藏的项 id */
  hiddenIds: string[]
}

// ── 注入接口 ─────────────────────────────────────────────────────────

export interface OpenWithPanelInjected {
  extractIcon: (exePath: string) => Promise<string>
  /** 解析预设启动器的实际可执行文件路径。 */
  resolvePresetPath: (target: LaunchTarget) => Promise<string>
  /** 从 host 端读取设置文件（/open-with RPC）。 */
  readSettings: () => Promise<OpenWithSettingsData | null>
  /** 写入设置到 host 端文件（/open-with RPC）。 */
  writeSettings: (settings: OpenWithSettingsData) => Promise<void>
}

export interface OpenWithPanelProps extends OpenWithPanelInjected {
  t: (key: string) => string
}

// ── 预设项 ───────────────────────────────────────────────────────────

const PRESET_ITEMS: OpenWithItem[] = [
  { id: 'code', name: 'VS Code', path: 'code', icon: '', preset: true, target: 'code' },
  { id: 'cmd', name: 'Command Prompt', path: 'cmd', icon: '', preset: true, target: 'cmd' },
  { id: 'powershell', name: 'PowerShell', path: 'powershell', icon: '', preset: true, target: 'powershell' },
  { id: 'explorer', name: 'File Explorer', path: 'explorer', icon: '', preset: true, target: 'explorer' },
]

function defaultSettings(): OpenWithSettingsData {
  return { currentId: 'code', items: [...PRESET_ITEMS], hiddenIds: [] }
}

// ── 小组件 ───────────────────────────────────────────────────────────

function ItemIcon({ src, size = 20 }: { src: string; size?: number }) {
  return (
    <img
      src={src || appDefaultPngDataUrl}
      alt=""
      width={size}
      height={size}
      style={{ display: 'block', width: size, height: size, imageRendering: '-webkit-optimize-contrast' }}
    />
  )
}

/** 拖拽插入位置指示线 */
function InsertionLine({ color }: { color: string }) {
  return (
    <div style={{ height: '2px', background: color, borderRadius: '1px', margin: '1px 0' }} />
  )
}

/** 可见性切换图标（SVG，避免 emoji）。hidden=true 表示"已隐藏"（眼睛带斜杠）。 */
function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {hidden ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  )
}

/** 行内小图标按钮（眼睛/编辑/删除 复用同一样式）。 */
function RowIconButton(props: {
  title: string
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  color: string
  children: ReactNode
  danger?: boolean
}) {
  const { title, onClick, color, children } = props
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '26px', height: '24px', padding: 0, border: 'none', borderRadius: '4px',
        background: 'transparent', color, cursor: 'pointer',
        fontSize: '13px', opacity: 0.6, transition: 'opacity 0.15s, background 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--dsw-hover, rgba(0,0,0,0.05))' }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.background = 'transparent' }}
    >
      {children}
    </button>
  )
}

// ── 主组件 ───────────────────────────────────────────────────────────

export function OpenWithPanel({ extractIcon, resolvePresetPath, readSettings, writeSettings, t }: OpenWithPanelProps): JSX.Element {
  const [settings, setSettings] = useState<OpenWithSettingsData>(defaultSettings)
  const [resolvedPaths, setResolvedPaths] = useState<Record<string, string>>({})
  // 统一的添加/编辑表单状态：formItemId 为 null 时隐藏，'__add__' 时添加，否则为编辑项 id
  const [formItemId, setFormItemId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formPath, setFormPath] = useState('')
  const [formError, setFormError] = useState('')
  // 拖拽排序状态
  const [dragState, setDragState] = useState<{ itemId: string; group: 'preset' | 'custom' } | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  // 用 ref 保持 settings 最新引用，供后台图标提取回调使用
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  // 防止重复提取预设图标
  const extractedPresets = useRef<Set<string>>(new Set())

  // 挂载时解析所有预设项的实际路径
  useEffect(() => {
    const targets: LaunchTarget[] = ['code', 'cmd', 'powershell', 'explorer']
    for (const target of targets) {
      resolvePresetPath(target).then((presetPath: string) => {
        if (presetPath) setResolvedPaths((prev) => ({ ...prev, [target]: presetPath }))
      })
    }
  }, [resolvePresetPath])

  // 挂载时从 host 端加载持久化设置（确保预设项始终存在）
  useEffect(() => {
    readSettings().then((loaded) => {
      if (loaded && loaded.currentId && loaded.items) {
        const items = [...loaded.items]
        for (const preset of PRESET_ITEMS) {
          if (!items.find((it) => it.id === preset.id)) items.push(preset)
        }
        setSettings({ currentId: loaded.currentId, items, hiddenIds: loaded.hiddenIds ?? [] })
      }
    })
  }, [readSettings])

  const persist = useCallback((next: OpenWithSettingsData) => {
    setSettings(next)
    writeSettings(next).catch(() => {})
  }, [writeSettings])

  // 为无图标的预设项从本地 exe 提取图标（运行时，不内置 base64）
  useEffect(() => {
    const presets = settingsRef.current.items.filter((it) => it.preset && it.target && !it.icon)
    for (const p of presets) {
      if (extractedPresets.current.has(p.id)) continue
      const exePath = p.target ? resolvedPaths[p.target] : undefined
      if (!exePath) continue
      extractedPresets.current.add(p.id)
      extractIcon(exePath).then((icon) => {
        if (!icon) return
        const cur = settingsRef.current
        const nextItems = cur.items.map((it) => (it.id === p.id ? { ...it, icon } : it))
        persist({ ...cur, items: nextItems })
      }).catch(() => {})
    }
  }, [resolvedPaths, settings.items, extractIcon, writeSettings]) // eslint-disable-line react-hooks/exhaustive-deps

  // 选择当前项（点击卡片切换）
  const selectCurrent = useCallback((item: OpenWithItem) => {
    persist({ ...settings, currentId: item.id })
  }, [settings, persist])

  // 删除自定义项（同时清理图标和隐藏状态）
  const removeItem = useCallback((id: string) => {
    const nextItems = settings.items.filter((it) => it.id !== id)
    const nextCurrentId = settings.currentId === id ? (nextItems[0]?.id ?? 'code') : settings.currentId
    const nextHiddenIds = settings.hiddenIds.filter((hid) => hid !== id)
    persist({ currentId: nextCurrentId, items: nextItems, hiddenIds: nextHiddenIds })
  }, [settings, persist])

  // 切换项在胶囊菜单中的可见性（预设/自定义均可）
  const toggleHidden = useCallback((id: string) => {
    const nextHiddenIds = settings.hiddenIds.includes(id)
      ? settings.hiddenIds.filter((hid) => hid !== id)
      : [...settings.hiddenIds, id]
    persist({ ...settings, hiddenIds: nextHiddenIds })
  }, [settings, persist])

  // ── 拖拽排序（组内）───────────────────────────────────────────────
  const moveItem = useCallback((fromIndex: number, toIndex: number): void => {
    const nextItems = [...settings.items]
    const [moved] = nextItems.splice(fromIndex, 1)
    nextItems.splice(toIndex, 0, moved)
    persist({ ...settings, items: nextItems })
  }, [settings, persist])

  const onDragStart = (e: DragEvent<HTMLDivElement>, itemId: string, group: 'preset' | 'custom'): void => {
    setDragState({ itemId, group })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', itemId)
  }

  const onDragEnd = (): void => {
    setDragState(null)
    setDragOverIndex(null)
  }

  /** 容器级 onDragOver：根据鼠标 Y 坐标计算插入位置 */
  const onGroupDragOver = (e: DragEvent<HTMLDivElement>, group: 'preset' | 'custom'): void => {
    if (!dragState || dragState.group !== group) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const container = e.currentTarget
    const children = Array.from(container.querySelectorAll('[data-drag-item]'))
    if (children.length === 0) return
    const mouseY = e.clientY
    let insertIndex = children.length
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect()
      const midY = rect.top + rect.height / 2
      if (mouseY < midY) { insertIndex = i; break }
    }
    setDragOverIndex(insertIndex)
  }

  /** 容器级 onDrop：根据 dragOverIndex 执行重排（组内相对索引 → 全局索引） */
  const onGroupDrop = (e: DragEvent<HTMLDivElement>, group: 'preset' | 'custom'): void => {
    e.preventDefault()
    if (!dragState || dragState.group !== group) return
    const fromId = dragState.itemId
    const targetIdx = dragOverIndex
    setDragState(null)
    setDragOverIndex(null)
    if (targetIdx === null) return
    const allItems = settings.items
    const fromIndex = allItems.findIndex((it) => it.id === fromId)
    if (fromIndex === -1) return
    const groupBaseIndex = group === 'preset' ? 0 : allItems.findIndex((it) => !it.preset)
    let toIndex = groupBaseIndex + targetIdx
    if (fromIndex < toIndex) toIndex -= 1
    if (fromIndex === toIndex) return
    moveItem(fromIndex, toIndex)
  }

  // ── 添加/编辑表单 ──────────────────────────────────────────────────
  const openForm = useCallback((item?: OpenWithItem) => {
    if (item) {
      setFormItemId(item.id)
      setFormName(item.name)
      setFormPath(item.path)
    } else {
      setFormItemId('__add__')
      setFormName('')
      setFormPath('')
    }
    setFormError('')
  }, [])

  const closeForm = useCallback(() => {
    setFormItemId(null)
    setFormName('')
    setFormPath('')
    setFormError('')
  }, [])

  /** 提交：添加或编辑（立即保存并关闭，图标后台提取）。 */
  const submitForm = useCallback(async () => {
    if (formItemId === null) return
    const name = formName.trim()
    // 自动清除路径两端引号（从资源管理器复制路径常带引号）
    let path = formPath.trim()
    if ((path.startsWith('"') && path.endsWith('"')) || (path.startsWith("'") && path.endsWith("'"))) {
      path = path.slice(1, -1)
    }
    if (!name) { setFormError(t('settings.custom.namePlaceholder')); return }
    if (!path) { setFormError(t('settings.custom.pathPlaceholder')); return }
    setFormError('')

    if (formItemId === '__add__') {
      const newId = 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
      const newItem: OpenWithItem = { id: newId, name, path, icon: '', preset: false }
      persist({ currentId: settings.currentId, items: [...settings.items, newItem], hiddenIds: settings.hiddenIds })
      closeForm()
      extractIcon(path).then((icon) => {
        if (!icon) return
        const cur = settingsRef.current
        persist({ ...cur, items: cur.items.map((it) => (it.id === newId ? { ...it, icon } : it)) })
      }).catch(() => {})
    } else {
      const oldItem = settings.items.find((it) => it.id === formItemId)
      const pathChanged = !!(oldItem && path !== oldItem.path)
      const icon = pathChanged ? '' : (oldItem?.icon ?? '')
      persist({
        currentId: settings.currentId,
        items: settings.items.map((it) => (it.id === formItemId ? { ...it, name, path, icon } : it)),
        hiddenIds: settings.hiddenIds,
      })
      closeForm()
      if (pathChanged) {
        const editId = formItemId
        extractIcon(path).then((icon) => {
          if (!icon) return
          const cur = settingsRef.current
          persist({ ...cur, items: cur.items.map((it) => (it.id === editId ? { ...it, icon } : it)) })
        }).catch(() => {})
      }
    }
  }, [formItemId, formName, formPath, settings, persist, extractIcon, closeForm, t])

  const onFormKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') closeForm()
    if (e.key === 'Enter') { e.preventDefault(); void submitForm() }
  }

  // ── 样式变量 ──────────────────────────────────────────────────────
  const hoverVar = 'var(--dsw-hover, rgba(0,0,0,0.05))'
  const borderVar = 'var(--dsw-border-strong, rgba(0,0,0,0.12))'
  const textVar = 'var(--dsw-fg, inherit)'
  const dangerColor = 'var(--dsw-alias-danger, #e53e3e)'
  const secondaryColor = 'var(--dsw-alias-label-secondary, #666)'
  const tertiaryColor = 'var(--dsw-alias-label-tertiary, #999)'
  const brandColor = 'var(--dsw-alias-brand-primary, #4f8cff)'
  const brandAlpha = 'var(--dsw-alias-brand-primary-alpha, rgba(79, 140, 255, 0.06))'
  const inputBg = 'var(--dsw-specific-input, transparent)'

  const presetItems = settings.items.filter((it) => it.preset)
  const customItems = settings.items.filter((it) => !it.preset)

  /** 拖拽列表项卡片（预设/自定义共用）。 */
  const renderDragRow = (
    item: OpenWithItem,
    itemIndex: number,
    group: 'preset' | 'custom',
    extraActions: ReactNode,
    subtitle: string,
  ): JSX.Element => {
    const isActive = item.id === settings.currentId
    const isDragging = dragState?.itemId === item.id
    const showInsertBefore = dragState?.group === group && dragOverIndex === itemIndex
    return (
      <Fragment key={item.id}>
        {showInsertBefore && <InsertionLine color={brandColor} />}
        <div
          data-drag-item
          role="button"
          tabIndex={0}
          draggable
          onClick={() => selectCurrent(item)}
          onDragStart={(e) => onDragStart(e, item.id, group)}
          onDragEnd={onDragEnd}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCurrent(item) } }}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 12px',
            border: '1px solid ' + (isActive ? brandColor : borderVar),
            borderRadius: '8px',
            background: isActive ? brandAlpha : 'transparent',
            cursor: isDragging ? 'grabbing' : 'grab',
            opacity: isDragging ? 0.4 : 1,
            transition: 'border-color 0.15s, background 0.15s, opacity 0.15s',
          }}
          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = hoverVar }}
          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
        >
          <span
            style={{
              display: 'flex', alignItems: 'center', color: tertiaryColor, fontSize: '13px',
              cursor: 'grab', userSelect: 'none', flexShrink: 0, lineHeight: 1,
            }}
            title={t('settings.dragTip')}
          >
            ⋮⋮
          </span>
          <ItemIcon src={item.icon} size={20} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <span style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.3 }}>
              {item.name}
              {isActive && (
                <span style={{ fontSize: '10px', color: brandColor, marginLeft: '6px', fontWeight: 600 }}>
                  ✓ {t('settings.current.title')}
                </span>
              )}
            </span>
            <span style={{ fontSize: '11px', color: tertiaryColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {subtitle}
            </span>
          </div>
          <RowIconButton
            title={settings.hiddenIds.includes(item.id) ? t('settings.show') : t('settings.hide')}
            color={settings.hiddenIds.includes(item.id) ? dangerColor : secondaryColor}
            onClick={(e) => { e.stopPropagation(); toggleHidden(item.id) }}
          >
            <EyeIcon hidden={settings.hiddenIds.includes(item.id)} />
          </RowIconButton>
          {extraActions}
        </div>
      </Fragment>
    )
  }

  /** 内联编辑/添加表单（共用）。 */
  const renderForm = (submitLabel: string): JSX.Element => (
    <div
      onKeyDown={onFormKeyDown}
      style={{
        display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px',
        border: '1px solid ' + brandColor, borderRadius: '8px', background: brandAlpha,
      }}
    >
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 500, color: secondaryColor }}>
            {t('settings.custom.namePlaceholder')}
          </label>
          <input
            type="text"
            value={formName}
            onChange={(e) => { setFormName(e.target.value); setFormError('') }}
            placeholder={t('settings.custom.namePlaceholder')}
            autoFocus
            style={{
              height: '30px', padding: '0 8px',
              border: '1px solid ' + borderVar, borderRadius: '4px',
              background: inputBg, color: textVar, fontSize: '13px', outline: 'none',
            }}
          />
        </div>
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 500, color: secondaryColor }}>
            {t('settings.custom.pathPlaceholder')}
          </label>
          <input
            type="text"
            value={formPath}
            onChange={(e) => { setFormPath(e.target.value); setFormError('') }}
            placeholder={t('settings.custom.pathPlaceholder')}
            style={{
              height: '30px', padding: '0 8px',
              border: '1px solid ' + borderVar, borderRadius: '4px',
              background: inputBg, color: textVar, fontSize: '13px', outline: 'none',
            }}
          />
        </div>
      </div>
      {formError && <span style={{ fontSize: '11px', color: dangerColor }}>{formError}</span>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button
          type="button"
          onClick={closeForm}
          style={{
            height: '28px', padding: '0 12px',
            border: '1px solid ' + borderVar, borderRadius: '4px',
            background: 'transparent', color: textVar, cursor: 'pointer', fontSize: '12px',
          }}
        >
          {t('settings.cancel')}
        </button>
        <button
          type="button"
          onClick={() => { void submitForm() }}
          style={{
            height: '28px', padding: '0 12px', border: 'none', borderRadius: '4px',
            background: brandColor, color: '#fff', cursor: 'pointer',
            fontSize: '12px', fontWeight: 500,
          }}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── 预设项 ── */}
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
        onDragOver={(e) => onGroupDragOver(e, 'preset')}
        onDrop={(e) => onGroupDrop(e, 'preset')}
      >
        <label style={{ fontSize: '12px', fontWeight: 500, color: secondaryColor, marginBottom: '6px' }}>
          {t('settings.preset.title')}
        </label>
        {presetItems.map((item, itemIndex) =>
          renderDragRow(item, itemIndex, 'preset', null, resolvedPaths[item.id] || item.path))}
        {dragState?.group === 'preset' && dragOverIndex === presetItems.length && (
          <InsertionLine color={brandColor} />
        )}
      </div>

      {/* ── 自定义项 ── */}
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
        onDragOver={(e) => onGroupDragOver(e, 'custom')}
        onDrop={(e) => onGroupDrop(e, 'custom')}
      >
        <label style={{ fontSize: '12px', fontWeight: 500, color: secondaryColor, marginBottom: '6px' }}>
          {t('settings.custom.title')}
        </label>

        {customItems.length === 0 && formItemId !== '__add__' && (
          <span style={{ fontSize: '12px', color: tertiaryColor, padding: '4px 0' }}>
            {t('settings.noCustom')}
          </span>
        )}

        {customItems.map((item, itemIndex) => {
          if (item.id === formItemId) {
            // 编辑模式：内联表单
            return (
              <div key={item.id}>
                {renderForm(t('settings.save'))}
              </div>
            )
          }
          const extraActions = (
            <>
              <RowIconButton
                title={t('settings.edit')}
                color={secondaryColor}
                onClick={(e) => { e.stopPropagation(); openForm(item) }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
              </RowIconButton>
              <RowIconButton
                title={t('settings.delete')}
                color={dangerColor}
                onClick={(e) => { e.stopPropagation(); removeItem(item.id) }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              </RowIconButton>
            </>
          )
          return renderDragRow(item, itemIndex, 'custom', extraActions, item.path)
        })}
        {dragState?.group === 'custom' && dragOverIndex === customItems.length && (
          <InsertionLine color={brandColor} />
        )}

        {formItemId !== '__add__' ? (
          <button
            type="button"
            onClick={() => openForm()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              width: '100%', padding: '10px 0',
              border: '1px dashed ' + borderVar, borderRadius: '8px',
              background: 'transparent', color: secondaryColor, cursor: 'pointer',
              fontSize: '13px', transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = hoverVar
              e.currentTarget.style.borderColor = brandColor
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = borderVar
            }}
          >
            <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span>
            <span>{t('settings.custom.add')}</span>
          </button>
        ) : (
          renderForm(t('settings.custom.add'))
        )}
      </div>
    </div>
  )
}
