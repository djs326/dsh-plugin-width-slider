/**
 * WidthSliderSettings: settings-panel section — 功能总控页（v0.3.0）。
 *
 * 卡片分组（每个功能带独立开关，默认全开、热生效）：
 * 1. 对话宽度滑块  —— 开关 + 滑块（WidthSliderControl，关闭时隐藏并提示）
 * 2. 思考块        —— 增强渲染开关 + 显示方式（自动收起 / 始终展开）
 * 3. 输出语言      —— 思考/回复强制中文开关（host 端 systemPrompt 注入）
 * 4. 界面          —— 英文中文化 + 弹窗调宽 + tab 滚动开关
 *
 * 数据流（单一读源）：
 * - 读取只发生在 client 入口启动时（一次 readSettings → config store）；
 * - 本页订阅 store 渲染；开关改动 → applySettings 广播（功能即时热切换）
 *   + dirty 标记触发写盘（writeSettings）；不重复读、不与读回竞态。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { WidthSliderControl } from './WidthSliderControl.tsx'
import { OpenWithPanel, type LaunchTarget, type OpenWithSettingsData } from './openWith/OpenWithPanel.tsx'
import { applySettings, getSettings, onSettingsChanged, type FeatureSettings } from './config.ts'
import { DEFAULT_FEATURE_SETTINGS } from '../shared/settings.ts'

export interface WidthSliderSettingsInjected {
  writeSettings: (settings: unknown) => Promise<void>
  /** Open With（收编 dsh-plugin-open-with）host 能力桥，经 /open-with RPC。 */
  owReadSettings: () => Promise<unknown>
  owWriteSettings: (settings: unknown) => Promise<void>
  owExtractIcon: (exePath: string) => Promise<string>
  owResolvePresetPath: (target: LaunchTarget) => Promise<string>
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

export function WidthSliderSettings({
  writeSettings,
  owReadSettings,
  owWriteSettings,
  owExtractIcon,
  owResolvePresetPath,
  t,
}: WidthSliderSettingsProps): JSX.Element {
  const [settings, setSettings] = useState<FeatureSettings>(() => getSettings())
  /** 仅本地（用户）改动触发写盘；store 外部更新（启动读回）不写。 */
  const dirtyRef = useRef(false)

  // 订阅 config store：入口读回 / 其它来源的配置变化同步到本页。
  useEffect(() => onSettingsChanged((next) => setSettings(next)), [])

  // 本组件改动后写盘（dirty 由 persist 置位，effect 消费后复位）。
  useEffect(() => {
    if (!dirtyRef.current) return
    dirtyRef.current = false
    writeSettings(settings).catch((err) => console.warn('[width-slider] writeSettings failed', err))
  }, [settings, writeSettings])

  /** 应用补丁：以 store 最新值为基 → applySettings 广播热切换 → dirty 写盘。 */
  const persist = useCallback((patch: Partial<FeatureSettings>): void => {
    dirtyRef.current = true
    applySettings({ ...getSettings(), ...patch })
  }, [])

  /** 恢复默认：重置开关 + 清宽度/弹窗宽度记忆，刷新页面应用。 */
  const resetAll = useCallback((): void => {
    try {
      localStorage.removeItem('dsh.conversation.contentWidth')
      localStorage.removeItem('dsh.conversation.contentWidthFollow')
      localStorage.removeItem('dsh.conversation.settingsPanelWidth')
    } catch { /* ignore */ }
    applySettings({ ...DEFAULT_FEATURE_SETTINGS })
    writeSettings({ ...DEFAULT_FEATURE_SETTINGS }).catch((err) =>
      console.warn('[width-slider] reset write failed', err))
    // 宽度/弹窗 UI 均读自记忆与组件本地态，刷新后整体取默认最可靠。
    window.location.reload()
  }, [writeSettings])

  const id = (k: string): string => 'dsh-plugin-width-slider-' + k

  return (
    <div style={{ padding: '4px 0' }}>
      {/* 顶部：总说明 + 恢复默认 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 12,
          fontSize: 12,
          lineHeight: '18px',
          color: 'var(--dsw-alias-label-caption, #888)',
        }}
      >
        <span>{t('resetAllInfo')}</span>
        <button
          type="button"
          onClick={resetAll}
          style={{
            flex: 'none',
            height: 26,
            padding: '0 10px',
            border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))',
            borderRadius: 6,
            background: 'transparent',
            color: 'var(--dsw-alias-label-secondary, #888)',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          {t('resetAllLabel')}
        </button>
      </div>
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
          <WidthSliderControl t={t} />
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
          <div style={{ margin: '2px 0 6px' }}>
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
        <SwitchRow
          id={id('enable-session-delete')}
          label={t('sessionDeleteLabel')}
          info={t('sessionDeleteInfo')}
          checked={settings.sessionDelete}
          onChange={(checked) => persist({ sessionDelete: checked })}
        />
      </Card>

      {/* 5. 打开方式（Open With，收编 dsh-plugin-open-with） */}
      <Card title={t('owGroupTitle')}>
        <SwitchRow
          id={id('enable-ow-settings')}
          label={t('owSettingsLabel')}
          info={t('owSettingsInfo')}
          checked={settings.openWithSettings}
          onChange={(checked) => persist({ openWithSettings: checked })}
        />
        <SwitchRow
          id={id('enable-ow-button')}
          label={t('owButtonLabel')}
          info={t('owButtonInfo')}
          checked={settings.openWithButton}
          onChange={(checked) => persist({ openWithButton: checked })}
        />
        {settings.openWithSettings && (
          <div style={{ marginTop: 2 }}>
            <OpenWithPanel
              t={t}
              readSettings={async () => (await owReadSettings()) as OpenWithSettingsData | null}
              writeSettings={owWriteSettings}
              extractIcon={owExtractIcon}
              resolvePresetPath={owResolvePresetPath}
            />
          </div>
        )}
      </Card>
    </div>
  )
}
