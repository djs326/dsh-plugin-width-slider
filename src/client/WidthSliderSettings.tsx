/**
 * WidthSliderSettings: settings-panel section — 功能总控页（v0.3.0）。
 *
 * 卡片分组（每个功能带独立开关，默认全开、热生效）：
 * 1. 对话宽度滑块  —— 开关 + 滑块（WidthSliderControl，关闭时置灰禁用）
 * 2. 思考块        —— 增强渲染开关 + 显示方式（自动收起 / 始终展开）
 * 3. 输出语言      —— 思考/回复强制中文开关（host 端 systemPrompt 注入）
 * 4. 界面          —— 英文中文化开关
 * （设置弹窗拖宽 / 左侧 tab 滚动两个界面补丁开关随 M3 一并加入本页）
 *
 * 数据流：host 文件为持久化真源（/width-slider RPC readSettings /
 * writeSettings）；本页本地 state 与 config store（applySettings）同源，
 * 切换即写入 host 并通知各功能热切换。
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { WidthSliderControl } from './WidthSliderControl.tsx'
import { applySettings, mergeSettings, type FeatureSettings } from './config.ts'

export interface WidthSliderSettingsInjected {
  readSettings: () => Promise<unknown>
  writeSettings: (settings: unknown) => Promise<void>
}

export type WidthSliderSettingsProps = PropsLocale<'widthSlider'> & WidthSliderSettingsInjected

// ── 小组件（沿用官方语义 token 与现有 inline 风格）────────────────────

/** 一行开关：checkbox + 标题 + 说明。 */
function SwitchRow(props: {
  id: string
  label: string
  info: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const { id, label, info, checked, onChange, disabled } = props
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          style={{
            margin: 0,
            width: 15,
            height: 15,
            accentColor: 'var(--dsw-alias-state-business-primary, #4f9eff)',
            cursor: disabled ? 'default' : 'pointer',
          }}
        />
        <label htmlFor={id} style={{ cursor: disabled ? 'default' : 'pointer', userSelect: 'none', fontWeight: 500 }}>
          {label}
        </label>
      </div>
      <div style={{ marginTop: 4, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-caption, #888)' }}>
        {info}
      </div>
    </div>
  )
}

/** 分组卡片。 */
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          lineHeight: '20px',
          marginBottom: 10,
          paddingBottom: 6,
          borderBottom: '1px solid var(--dsw-alias-interactive-bg-hover, #333)',
          color: 'var(--dsw-alias-label-primary, #e0e0e0)',
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

/** 单选行（思考块显示方式）。 */
function RadioRow(props: {
  id: string
  name: string
  label: string
  info: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
}) {
  const { id, name, label, info, checked, onChange, disabled } = props
  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        marginBottom: 8,
      }}
    >
      <input
        id={id}
        name={name}
        type="radio"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        style={{ margin: '3px 0 0', accentColor: 'var(--dsw-alias-state-business-primary, #4f9eff)' }}
      />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, lineHeight: '20px', fontWeight: 500, userSelect: 'none' }}>{label}</span>
        <span style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-caption, #888)' }}>{info}</span>
      </span>
    </label>
  )
}

// ── 主组件：功能总控页 ────────────────────────────────────────────────

export function WidthSliderSettings({ readSettings, writeSettings, t }: WidthSliderSettingsProps): JSX.Element {
  const [settings, setSettings] = useState<FeatureSettings>(() => mergeSettings(null))

  // 挂载时从 host 拉取持久化配置；读回后同步进 store（功能热切换）。
  useEffect(() => {
    let cancelled = false
    readSettings()
      .then((raw) => {
        if (cancelled) return
        const merged = mergeSettings(raw)
        setSettings(merged)
        applySettings(merged)
      })
      .catch((err) => {
        console.warn('[width-slider] readSettings failed', err)
      })
    return () => {
      cancelled = true
    }
  }, [readSettings])

  /** 应用补丁：本地 state + store 同步 + 写入 host（乐观，失败仅告警）。 */
  const persist = useCallback((patch: Partial<FeatureSettings>): void => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      applySettings(next)
      writeSettings(next).catch((err) => console.warn('[width-slider] writeSettings failed', err))
      return next
    })
  }, [writeSettings])

  const id = (k: string): string => 'dsh-plugin-width-slider-' + k

  return (
    <div style={{ padding: '4px 0' }}>
      {/* 1. 对话宽度滑块 */}
      <Card title={t('groupWidth')}>
        <SwitchRow
          id={id('enable-width')}
          label={t('enableWidth')}
          info={t('enableWidthInfo')}
          checked={settings.widthSlider}
          onChange={(checked) => persist({ widthSlider: checked })}
        />
        {settings.widthSlider ? (
          <div style={{ paddingLeft: 0 }}>
            <WidthSliderControl t={t} />
          </div>
        ) : (
          <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-caption, #888)' }}>
            {t('disabledHint')}
          </div>
        )}
      </Card>

      {/* 2. 思考块 */}
      <Card title={t('groupThink')}>
        <SwitchRow
          id={id('enable-think')}
          label={t('enableThink')}
          info={t('enableThinkInfo')}
          checked={settings.thinkRender}
          onChange={(checked) => persist({ thinkRender: checked })}
        />
        {settings.thinkRender && (
          <div style={{ margin: '2px 0 6px', paddingLeft: 0 }}>
            <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary, #bbb)', marginBottom: 8 }}>
              {t('thinkModeLabel')}
            </div>
            <RadioRow
              id={id('think-mode-auto')}
              name="width-slider-think-mode"
              label={t('thinkModeAuto')}
              info={t('thinkModeAutoInfo')}
              checked={settings.thinkMode === 'auto-collapse'}
              onChange={() => persist({ thinkMode: 'auto-collapse' })}
            />
            <RadioRow
              id={id('think-mode-keep')}
              name="width-slider-think-mode"
              label={t('thinkModeKeep')}
              info={t('thinkModeKeepInfo')}
              checked={settings.thinkMode === 'keep-expanded'}
              onChange={() => persist({ thinkMode: 'keep-expanded' })}
            />
          </div>
        )}
      </Card>

      {/* 3. 输出语言 */}
      <Card title={t('groupLanguage')}>
        <SwitchRow
          id={id('enable-chinese')}
          label={t('enableChinese')}
          info={t('enableChineseInfo')}
          checked={settings.chinesePrompt}
          onChange={(checked) => persist({ chinesePrompt: checked })}
        />
      </Card>

      {/* 4. 界面 */}
      <Card title={t('groupUi')}>
        <SwitchRow
          id={id('enable-localize')}
          label={t('enableLocalize')}
          info={t('enableLocalizeInfo')}
          checked={settings.uiLocalize}
          onChange={(checked) => persist({ uiLocalize: checked })}
        />
        <SwitchRow
          id={id('enable-resize')}
          label={t('enableResize')}
          info={t('enableResizeInfo')}
          checked={settings.dialogResize}
          onChange={(checked) => persist({ dialogResize: checked })}
        />
        <SwitchRow
          id={id('enable-nav-scroll')}
          label={t('enableNavScroll')}
          info={t('enableNavScrollInfo')}
          checked={settings.navScroll}
          onChange={(checked) => persist({ navScroll: checked })}
        />
      </Card>
    </div>
  )
}
