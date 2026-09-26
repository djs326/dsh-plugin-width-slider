/**
 * WidthSliderSettings: settings-panel section — 功能总控页。
 *
 * 布局（v0.7.0 排版重写）：每个分组只占一行，开关与控件横向排布，逐条
 * 长说明收进悬停提示（title）。
 *   1. 对话宽度   —— 启用开关 + 跟随窗口 + 宽度滑块（WidthSliderControl）
 *   2. 思考与输出 —— 思考块增强 + 强制中文 + 显示方式（分段控件）
 *   3. 动效       —— 总闸（关闭/跟随系统/开启）+ 实时预览 + 四张风格卡
 *   4. 界面       —— 弹窗拖拽 / tab 滚动 / 会话删除 / 工作区分页
 *
 * 数据流（单一读源）：
 * - 读取只发生在 client 入口启动时（一次 readSettings → config store）；
 * - 本页订阅 store 渲染；开关改动 → applySettings 广播（功能即时热切换）
 *   + dirty 标记触发写盘（writeSettings）；不重复读、不与读回竞态。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { WidthSliderControl } from './WidthSliderControl.tsx'
import { applySettings, getSettings, onSettingsChanged, type FeatureSettings } from './core/config.ts'
import { clearPanelRect } from './settingsPanelPatch.ts'
import { DEFAULT_FEATURE_SETTINGS } from '../shared/settings.ts'
import type { WidthSliderKey } from './core/locales.ts'
import {
  MOTION_LOOK_PRESETS,
  isMotionLook,
  isMotionMode,
  motionAllowed,
  motionLookOf,
  type MotionLookId,
} from '../shared/motionSettings.ts'
import { entranceSpec, prefersReducedMotion, replayEntrance } from './motion/index.ts'

/** 风格档 id → 卡片名称文案键。 */
const LOOK_LABELS: Record<MotionLookId, keyof WidthSliderKey> = {
  soft: 'motionLookSoft',
  rise: 'motionLookRise',
  glide: 'motionLookGlide',
  veil: 'motionLookVeil',
}

/** 风格档 id → 卡片说明文案键。 */
const LOOK_INFO: Record<MotionLookId, keyof WidthSliderKey> = {
  soft: 'motionLookSoftInfo',
  rise: 'motionLookRiseInfo',
  glide: 'motionLookGlideInfo',
  veil: 'motionLookVeilInfo',
}

/**
 * 预览的放慢倍数。
 *
 * 实机入场多在 200–480ms，位移又只有 4–12px，按原速在设置页里播放几乎看不出
 * 形状，只能看到一个「闪一下」。放慢 3 倍是为了让「往哪个方向、多大幅度」变得
 * 可读。帧与缓动曲线仍取引擎那一份——变慢的只是节奏，不是效果本身；预览区标签
 * 保持只写「预览」，不额外标注倍率。
 */
const PREVIEW_SLOWDOWN = 3

export interface WidthSliderSettingsInjected {
  writeSettings: (settings: unknown) => Promise<void>
}

export type WidthSliderSettingsProps = PropsLocale<'widthSlider'> & WidthSliderSettingsInjected

// ── 样式（.dsws- 前缀，只作用于本区块）─────────────────────────────────

const SETTINGS_CSS = `
.dsws-root { color: var(--dsw-alias-label-primary, #e0e0e0); font-size: 13px; line-height: 1.5; }
.dsws-root * { box-sizing: border-box; }
.dsws-contents { display: contents; }

.dsws-page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18)); margin-bottom: 16px; }
.dsws-page-title { font-size: 15px; font-weight: 600; }
.dsws-page-sub { font-size: 11.5px; color: var(--dsw-alias-label-caption, #888); margin-top: 2px; }
.dsws-ghost { flex: none; height: 26px; padding: 0 11px; border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18)); border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary, #999); font: inherit; font-size: 11.5px; cursor: pointer; transition: color 160ms ease-out, border-color 160ms ease-out; }
.dsws-ghost:hover { color: var(--dsw-alias-label-primary, #e0e0e0); border-color: var(--dsw-alias-label-secondary, #999); }

/* 6. CSS-only stagger：设置页打开时页面头与各组依次落位。这里没有任何 JS
   或观察器——delay 由元素自己的位置（nth-child）乘一个步长决定，所以重渲染
   不会重播，也不需要给元素打标记。步长是一个变量，改一处即可整体调参。 */
@keyframes dsws-stagger-in { from { opacity: 0; translate: 0 6px; } to { opacity: 1; translate: 0 0; } }
.dsws-root { --dsws-stagger-step: 45ms; }
.dsws-page-head, .dsws-group { animation: dsws-stagger-in 300ms cubic-bezier(0.22, 1, 0.36, 1) backwards; animation-delay: 0ms; }
.dsws-group:nth-child(2) { animation-delay: var(--dsws-stagger-step); }
.dsws-group:nth-child(3) { animation-delay: calc(var(--dsws-stagger-step) * 2); }
.dsws-group:nth-child(4) { animation-delay: calc(var(--dsws-stagger-step) * 3); }
.dsws-group:nth-child(5) { animation-delay: calc(var(--dsws-stagger-step) * 4); }
.dsws-group:nth-child(6) { animation-delay: calc(var(--dsws-stagger-step) * 5); }
.dsws-group:nth-child(7) { animation-delay: calc(var(--dsws-stagger-step) * 6); }
.dsws-group:nth-child(n+8) { animation-delay: calc(var(--dsws-stagger-step) * 7); }
@media (prefers-reduced-motion: reduce) { .dsws-page-head, .dsws-group { animation: none; } }

.dsws-group { margin-bottom: 14px; }
.dsws-group-title { font-size: 11.5px; font-weight: 600; color: var(--dsw-alias-label-caption, #888); margin-bottom: 6px; }
.dsws-panel { border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18)); border-radius: 10px; padding: 4px 5px; }
.dsws-rowline { display: flex; align-items: center; gap: 1px; flex-wrap: wrap; }

.dsws-item { display: flex; align-items: center; gap: 4px; min-height: 28px; padding: 5px; border-radius: 7px; cursor: pointer; user-select: none; transition: background 140ms ease-out; }
.dsws-item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.08)); }
.dsws-item.is-disabled { cursor: default; opacity: .55; }
.dsws-label { font-size: 11.5px; font-weight: 500; white-space: nowrap; }

input.dsws-sw { appearance: none; -webkit-appearance: none; flex: none; width: 26px; height: 15px; margin: 0; border-radius: 999px; background: var(--dsw-alias-border-l2, rgba(127,127,127,.35)); position: relative; cursor: pointer; transition: background 180ms ease-out; }
input.dsws-sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 11px; height: 11px; border-radius: 50%; background: var(--dsw-alias-bg-base, #fff); box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform 180ms ease-out; }
input.dsws-sw:checked { background: var(--dsw-alias-state-business-primary, #4f9eff); }
input.dsws-sw:checked::after { transform: translateX(11px); }
input.dsws-sw:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4f9eff); outline-offset: 2px; }
input.dsws-sw:disabled { cursor: default; }

.dsws-seg-inline { margin-left: auto; display: flex; align-items: center; gap: 8px; padding: 0 8px; }
.dsws-seg-label { font-size: 11.5px; color: var(--dsw-alias-label-caption, #888); white-space: nowrap; }
.dsws-seg { display: inline-flex; padding: 2px; border-radius: 8px; background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dsws-seg button { font: inherit; font-size: 11px; padding: 3px 9px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary, #999); cursor: pointer; white-space: nowrap; }
.dsws-seg button.on { background: var(--dsw-alias-state-business-primary, #4f9eff); color: #fff; font-weight: 600; }
.dsws-seg.is-disabled { opacity: .45; pointer-events: none; }

.dsws-slider-inline { flex: 1 1 170px; min-width: 150px; display: flex; align-items: center; gap: 10px; padding: 0 8px; }
.dsws-slider-inline.is-disabled { opacity: .55; pointer-events: none; }
.dsws-track { position: relative; flex: 1 1 auto; height: 16px; border-radius: 999px; background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.2)); cursor: col-resize; user-select: none; touch-action: none; }
.dsws-track:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4f9eff); outline-offset: 3px; }
.dsws-fill { position: absolute; top: 0; bottom: 0; left: 0; border-radius: 999px; background: var(--dsw-alias-state-business-primary, #4f9eff); opacity: .9; pointer-events: none; }
.dsws-knob { position: absolute; top: 50%; transform: translate(-50%, -50%); width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-state-business-primary, #4f9eff); box-shadow: 0 1px 3px rgba(0,0,0,.3); pointer-events: none; }
.dsws-num { flex: none; font-size: 11.5px; color: var(--dsw-alias-label-caption, #888); font-variant-numeric: tabular-nums; white-space: nowrap; }
.dsws-hint { font-size: 11.5px; color: var(--dsw-alias-label-caption, #888); padding: 0 8px; }

.dsws-select { appearance: none; -webkit-appearance: none; flex: none; height: 22px; padding: 0 16px 0 6px; margin: 0 2px 0 0; font: inherit; font-size: 11px; color: var(--dsw-alias-label-primary, #e0e0e0); background-color: transparent; border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18)); border-radius: 6px; cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='9' viewBox='0 0 10 10' fill='none' stroke='%238a8a8a' stroke-width='1.5'%3E%3Cpath d='M2.5 4L5 6.5L7.5 4'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 5px center; }
.dsws-select:disabled { opacity: .45; cursor: default; }
.dsws-select:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4f9eff); outline-offset: 1px; }

.dsws-fold-inline { margin-left: auto; display: flex; align-items: center; gap: 10px; padding: 0 8px; }
.dsws-mini { font: inherit; font-size: 11px; padding: 3px 9px; border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18)); border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary, #999); cursor: pointer; }
.dsws-mini:hover { color: var(--dsw-alias-label-primary, #e0e0e0); }

/* 动效组：总闸一行、预览一块、四张风格卡一排 */
.dsws-motion-row { display: flex; align-items: center; gap: 8px; padding: 2px 3px; }
.dsws-motion-row .dsws-seg-inline { margin-left: 0; padding: 0; }
.dsws-hint-row { padding: 5px 8px 6px; }

/* 预览区：把当前档当场演一遍。演示的是"一条侧栏项 + 一条消息"，因为四档要
   回答的本来就是"内容怎么出现"——抽象地动一个方块说明不了任何事。 */
.dsws-preview { margin: 6px 3px 8px; padding: 9px 11px 11px; border-radius: 9px; background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.08)); overflow: hidden; transition: opacity 160ms ease-out; }
.dsws-preview.is-off { opacity: .45; }
.dsws-preview-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.dsws-preview-label { font-size: 10.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--dsw-alias-label-caption, #888); }
.dsws-preview-stage { display: flex; flex-direction: column; gap: 6px; }
.dsws-preview-side, .dsws-preview-msg { align-self: flex-start; border-radius: 7px; padding: 5px 10px; font-size: 11.5px; }
.dsws-preview-side { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.16)); color: var(--dsw-alias-label-secondary, #999); }
.dsws-preview-msg { max-width: 80%; background: var(--dsw-alias-state-business-primary, #4f9eff); color: #fff; }

/* 风格卡：四档一排，点哪张就演哪张 */
.dsws-looks { display: flex; gap: 6px; padding: 0 3px; }
.dsws-look { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 1px; padding: 7px 9px; border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18)); border-radius: 8px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; transition: border-color 160ms ease-out, background 160ms ease-out; }
.dsws-look:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.08)); }
.dsws-look.on { border-color: var(--dsw-alias-state-business-primary, #4f9eff); background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4f9eff) 12%, transparent); }
.dsws-look.is-off { opacity: .45; cursor: default; }
.dsws-look-name { font-size: 12px; font-weight: 600; }
.dsws-look-desc { font-size: 10.5px; line-height: 1.35; color: var(--dsw-alias-label-caption, #888); }

@media (max-width: 560px) { .dsws-seg-inline, .dsws-fold-inline { margin-left: 0; } .dsws-looks { flex-wrap: wrap; } .dsws-look { flex: 1 1 44%; } }
`

// ── 小组件 ────────────────────────────────────────────────────────────

/** 分组：小标题 + 单行面板。 */
function Group({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="dsws-group">
      <div className="dsws-group-title">{title}</div>
      <div className="dsws-panel">{children}</div>
    </section>
  )
}

/** 行内开关项：标签在左、开关在右；完整说明走 title 悬停提示。 */
function SwitchItem(props: {
  id: string
  label: string
  title: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}): JSX.Element {
  const { id, label, title, checked, onChange, disabled = false } = props
  return (
    <label className={'dsws-item' + (disabled ? ' is-disabled' : '')} title={title}>
      <span className="dsws-label">{label}</span>
      <input
        id={id}
        className="dsws-sw"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}

/** 行内分段控件（右对齐）。 */
function Segmented(props: {
  id?: string
  label?: string
  ariaLabel?: string
  value: string
  options: { id: string; label: string; title?: string }[]
  onChange: (value: string) => void
  disabled?: boolean
}): JSX.Element {
  const { id, label, ariaLabel, value, options, onChange, disabled = false } = props
  return (
    <div className="dsws-seg-inline">
      {label === undefined ? null : <span className="dsws-seg-label">{label}</span>}
      <div
        id={id}
        className={'dsws-seg' + (disabled ? ' is-disabled' : '')}
        role="group"
        aria-label={ariaLabel}
      >
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={option.id === value ? 'on' : undefined}
            title={option.title}
            disabled={disabled}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 主组件：功能总控页 ────────────────────────────────────────────────

export function WidthSliderSettings({
  writeSettings,
  t,
}: WidthSliderSettingsProps): JSX.Element {
  const [settings, setSettings] = useState<FeatureSettings>(() => getSettings())
  /** 仅本地（用户）改动触发写盘；store 外部更新（启动读回）不写。 */
  const dirtyRef = useRef(false)
  /** 预览区里的两条演示元素：模拟一条侧栏项与一条消息。 */
  const previewSideRef = useRef<HTMLDivElement | null>(null)
  const previewMsgRef = useRef<HTMLDivElement | null>(null)

  // 订阅 config store：入口读回 / 其它来源的配置变化同步到本页。
  useEffect(() => onSettingsChanged((next) => setSettings(next)), [])

  /** 写盘序号与串行链：连点开关时只把最新一份发出去，落盘顺序与本地变更顺序一致。 */
  const writeSeqRef = useRef(0)
  const writeChainRef = useRef<Promise<void>>(Promise.resolve())

  // 本组件改动后写盘（dirty 由 persist 置位，effect 消费后复位）。
  useEffect(() => {
    if (!dirtyRef.current) return
    dirtyRef.current = false
    const seq = ++writeSeqRef.current
    const snapshot = settings
    writeChainRef.current = writeChainRef.current.then(async () => {
      // 期间又改过：这一份已过期，跳过（更新的那份会带着最新配置发出）。
      if (seq !== writeSeqRef.current) return
      try {
        await writeSettings(snapshot)
      } catch (err) {
        console.warn('[width-slider] writeSettings failed', err)
      }
    })
  }, [settings, writeSettings])

  /** 应用补丁：以 store 最新值为基 → applySettings 广播热切换 → dirty 写盘。 */
  const persist = useCallback((patch: Partial<FeatureSettings>): void => {
    dirtyRef.current = true
    applySettings({ ...getSettings(), ...patch })
  }, [])

  /** 恢复默认：重置开关 + 清宽度与弹窗记忆，写盘完成后刷新页面应用。 */
  const resetAll = useCallback((): void => {
    try {
      localStorage.removeItem('dsh.conversation.contentWidth')
      localStorage.removeItem('dsh.conversation.contentWidthFollow')
    } catch { /* ignore */ }
    // 弹窗尺寸/位置的记忆键由 settingsPanelPatch 持有：走它导出的清理函数，避免键名漂移
    // （此前这里删的是已经废弃的 settingsPanelWidth，导致「恢复默认」重置不了弹窗大小）。
    clearPanelRect()
    applySettings({ ...DEFAULT_FEATURE_SETTINGS })
    // 先把默认配置写回 host 再刷新：reload 会打断在途写盘，刷新后仍旧读回旧配置。
    void writeSettings({ ...DEFAULT_FEATURE_SETTINGS })
      .catch((err) => { console.warn('[width-slider] reset write failed', err) })
      .finally(() => { window.location.reload() })
  }, [writeSettings])

  /** 总闸是否真的会播出动效（`off` 不放行；`system` 档还要看系统设置）。 */
  const motionOn = motionAllowed(settings.motionMode, prefersReducedMotion())

  /**
   * 在预览区把某一档演一遍。
   *
   * 帧与缓动直接取自引擎（entranceSpec），这里不存第二份拷贝：预览一旦与实机
   * 漂移，它教的就正是错的东西，比没有预览更糟。侧栏那条用该档的 sidebar 样式、
   * 消息那条用 transcript 样式——两条一起播，这一档的方向一眼就能看出来。
   * 时长按 PREVIEW_SLOWDOWN 放慢，理由见那个常量。
   */
  const playLook = useCallback((lookId: MotionLookId): void => {
    const look = motionLookOf(lookId)
    const side = previewSideRef.current
    const msg = previewMsgRef.current
    if (side !== null) {
      const spec = entranceSpec(look.sidebarMotionStyle)
      replayEntrance(side, spec.frames, { duration: spec.durationMs * PREVIEW_SLOWDOWN, easing: spec.easing })
    }
    if (msg !== null) {
      const spec = entranceSpec(look.motionStyle)
      replayEntrance(msg, spec.frames, { duration: spec.durationMs * PREVIEW_SLOWDOWN, easing: spec.easing })
    }
  }, [])

  /** 选风格：先落盘，再当场演示一遍——"选了什么"要有一个即时的答案。 */
  const pickLook = useCallback((lookId: string): void => {
    if (!isMotionLook(lookId)) return
    persist({ motionLook: lookId })
    playLook(lookId)
  }, [persist, playLook])

  /** 切总闸。场景与样式都只剩一份，所以这里只写一个字段。 */
  const setMotionMode = useCallback((mode: string): void => {
    if (!isMotionMode(mode)) return
    persist({ motionMode: mode })
  }, [persist])

  /**
   * 打开设置页时先把当前档演一遍，这样"现在是什么样子"不需要先点一下才能看到。
   * 延迟一点是为了错开页面自己的分组落位动画（dsws-stagger-in），否则两段动效
   * 叠在一起，反而看不清哪一段是用户的动效设置。
   */
  const lookRef = useRef(settings.motionLook)
  lookRef.current = settings.motionLook
  useEffect(() => {
    if (!motionOn) return
    const timer = window.setTimeout(() => playLook(lookRef.current), 320)
    return () => window.clearTimeout(timer)
  }, [motionOn, playLook])

  const id = (key: string): string => 'dsh-plugin-width-slider-' + key

  return (
    <div className="dsws-root">
      <style>{SETTINGS_CSS}</style>

      {/* 页头：标题 + 恢复默认 */}
      <div className="dsws-page-head">
        <div>
          <div className="dsws-page-title">{t('pageTitle')}</div>
          <div className="dsws-page-sub">{t('pageSubtitle')}</div>
        </div>
        <button type="button" className="dsws-ghost" title={t('resetAllInfo')} onClick={resetAll}>
          {t('resetAllLabel')}
        </button>
      </div>

      {/* 1. 对话宽度 */}
      <Group title={t('groupWidthShort')}>
        <div className="dsws-rowline">
          <SwitchItem
            id={id('enable-width')}
            label={t('shortEnableWidth')}
            title={t('enableWidthInfo')}
            checked={settings.widthSlider}
            onChange={(checked) => persist({ widthSlider: checked })}
          />
          {settings.widthSlider
            ? <WidthSliderControl t={t} />
            : <span className="dsws-hint">{t('disabledHint')}</span>}
        </div>
      </Group>

      {/* 2. 思考与输出 */}
      <Group title={t('groupThinkOutput')}>
        <div className="dsws-rowline">
          <SwitchItem
            id={id('enable-think')}
            label={t('shortThink')}
            title={t('enableThinkInfo')}
            checked={settings.thinkRender}
            onChange={(checked) => persist({ thinkRender: checked })}
          />
          <SwitchItem
            id={id('enable-chinese')}
            label={t('shortChinese')}
            title={t('enableChineseInfo')}
            checked={settings.chinesePrompt}
            onChange={(checked) => persist({ chinesePrompt: checked })}
          />
          <Segmented
            id={id('think-mode')}
            label={t('thinkModeLabel')}
            value={settings.thinkMode}
            disabled={!settings.thinkRender}
            options={[
              { id: 'auto-collapse', label: t('thinkModeAuto'), title: t('thinkModeAutoInfo') },
              { id: 'keep-expanded', label: t('thinkModeKeep'), title: t('thinkModeKeepInfo') },
            ]}
            onChange={(value) => persist({ thinkMode: value === 'keep-expanded' ? 'keep-expanded' : 'auto-collapse' })}
          />
        </div>
      </Group>

      {/* 3. 动效：一行总闸 + 一块预览 + 四张风格卡。
          以前这里有九个控件——四个场景开关、三个样式下拉、一组预设。它们都在描述
          实现（"对话入场用 blur-in"），而用户的问题只有两个：动不动、怎么动。
          现在五个控件回答这两个问题，并且"怎么动"配一块当场演示的预览。 */}
      <Group title={t('groupMotion')}>
        <div className="dsws-motion-row">
          <Segmented
            id={id('motion-mode')}
            ariaLabel={t('motionMode')}
            value={settings.motionMode}
            options={[
              { id: 'off', label: t('motionModeOff'), title: t('motionModeOffInfo') },
              { id: 'system', label: t('motionModeSystem'), title: t('motionModeSystemInfo') },
              { id: 'on', label: t('motionModeOn'), title: t('motionModeOnInfo') },
            ]}
            onChange={setMotionMode}
          />
        </div>

        <div className={'dsws-preview' + (motionOn ? '' : ' is-off')}>
          <div className="dsws-preview-head">
            <span className="dsws-preview-label">{t('motionPreviewLabel')}</span>
            <button
              type="button"
              className="dsws-mini"
              title={t('motionPreviewReplay')}
              disabled={!motionOn}
              onClick={() => playLook(settings.motionLook)}
            >
              {t('motionPreviewReplay')}
            </button>
          </div>
          <div className="dsws-preview-stage">
            <div ref={previewSideRef} className="dsws-preview-side">{t('motionPreviewSidebar')}</div>
            <div ref={previewMsgRef} className="dsws-preview-msg">{t('motionPreviewMessage')}</div>
          </div>
        </div>

        <div className="dsws-looks">
          {MOTION_LOOK_PRESETS.map((look) => (
            <button
              key={look.id}
              type="button"
              id={id('motion-look-' + look.id)}
              className={'dsws-look' + (look.id === settings.motionLook ? ' on' : '') + (motionOn ? '' : ' is-off')}
              title={t(LOOK_INFO[look.id])}
              aria-pressed={look.id === settings.motionLook}
              disabled={!motionOn}
              onClick={() => pickLook(look.id)}
            >
              <span className="dsws-look-name">{t(LOOK_LABELS[look.id])}</span>
              <span className="dsws-look-desc">{t(LOOK_INFO[look.id])}</span>
            </button>
          ))}
        </div>

        {motionOn ? null : (
          <div className="dsws-hint-row">
            <span className="dsws-hint">{t('motionInactiveHint')}</span>
          </div>
        )}
      </Group>

      {/* 4. 界面 */}
      <Group title={t('groupUi')}>
        <div className="dsws-rowline">
          <SwitchItem
            id={id('enable-resize')}
            label={t('shortResize')}
            title={t('enableResizeInfo')}
            checked={settings.dialogResize}
            onChange={(checked) => persist({ dialogResize: checked })}
          />
          <SwitchItem
            id={id('enable-dialog-adaptive')}
            label={t('shortDialogAdaptive')}
            title={t('dialogAdaptiveInfo')}
            checked={settings.dialogAdaptive}
            onChange={(checked) => persist({ dialogAdaptive: checked })}
          />
          <SwitchItem
            id={id('enable-nav-scroll')}
            label={t('shortNavScroll')}
            title={t('enableNavScrollInfo')}
            checked={settings.navScroll}
            onChange={(checked) => persist({ navScroll: checked })}
          />
          <SwitchItem
            id={id('enable-session-delete')}
            label={t('shortSessionDelete')}
            title={t('sessionDeleteInfo')}
            checked={settings.sessionDelete}
            onChange={(checked) => persist({ sessionDelete: checked })}
          />
          <SwitchItem
            id={id('enable-ws-tabs')}
            label={t('shortWorkspaceTabs')}
            title={t('enableWsTabsInfo')}
            checked={settings.workspaceTabs}
            onChange={(checked) => persist({ workspaceTabs: checked })}
          />
          <SwitchItem
            id={id('merge-sidebar-tools')}
            label={t('sidebarToolsMerge')}
            title={t('sidebarToolsMergeInfo')}
            checked={settings.sidebarToolsMerge}
            onChange={(checked) => persist({ sidebarToolsMerge: checked })}
          />
        </div>
      </Group>
    </div>
  )
}
