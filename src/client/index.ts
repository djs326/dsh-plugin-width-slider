/**
 * Client-side plugin entry（v0.3.0 起整合上游能力）。
 *
 * 本入口只做装配：依据 config store 当前值安装/卸载 8 个功能槽位
 * （名单见 core/features.ts 的 Slot），实现分居 features/ 与各特性模块。
 *
 * 职责（全部挂独立开关，默认开、热生效，见 config.ts FeatureSettings）：
 * 1. 对话宽度滑块设置区块 —— 总控页（WidthSliderSettings）；隐藏官方原生
 *    宽度拖拽手柄（跟随「宽度滑块」开关联动）；
 * 2. 思考块增强渲染（assistant-step 覆盖，整合自 dsh-think-zh-expand）：
 *    只为思考块提供展开/收起（外观同官方）；正式回复走官方 MarkdownText，不接管围栏；
 * 3. 设置弹窗补丁：可拖拽 / 按比例跟随窗口；
 * 4. 设置面板 tab 栏过长时滚动；
 * 5. 会话删除（sessionDelete）；
 * 6. 工作区分页（workspaceTabs）；
 * 7. 侧边栏工具并入新建会话行（sidebarToolsMerge）；
 * 8. 入场动效（features/motion，整合自 dsh-client-ui-custom）。
 *
 * 生命周期模型：apply 内建一个受控生命周期 effect —— sync() 依据
 * config store 当前值安装/卸载各功能（installX 返回 disposer）；配置变化
 * （总控页切换 / host 读回）经 onSettingsChanged 触发 sync 即时热切换。
 * 插件禁用/卸载时统一清理，无残留。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { WidthSliderSettings } from './WidthSliderSettings.tsx'
import { NS, en, zh } from './core/locales.ts'
import { createFeatureRegistry } from './core/features.ts'
import { rpcReadSettings, rpcWriteSettings } from './core/rpc.ts'
import { installMotionFeature, type MotionSessionsPort } from './features/motion/index.ts'
import { installThinkRenderer, warnIfUpstreamPresent } from './features/think/index.ts'
import { installWidthFeature } from './features/width/index.ts'
import { installDialogResizePatch } from './patches/settingsPanel/dialogWindow.ts'
import { installNavScrollPatch } from './patches/settingsPanel/navScroll.ts'
import { installSessionDelete } from './sessionDelete.ts'
import { installWorkspaceTabs } from './workspaceTabs.tsx'
import { installSidebarToolsMerge } from './sidebarToolsMerge.ts'
import { applySettings, getSettings, mergeSettings, onSettingsChanged } from './core/config.ts'
import { prefersReducedMotion } from './motion/index.ts'
import { motionAllowed } from '../shared/motionSettings.ts'

export const inject = ['slots', 'locale', 'connection', 'sessions', 'workspaces']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'width-slider: dictionaries')

  // 上游冲突提示（激活即探测一次）。
  ctx.effect(() => {
    warnIfUpstreamPresent()
    return () => {}
  }, 'width-slider: upstream conflict probe')

  // ── 会话账本适配器 ──────────────────────────────────────────────
  // features/motion 与 motion/ 都不接触宿主形状（它们只认 MotionSessionsPort）；
  // 把 `ctx.sessions` 翻译成端口是本层职责，也是全仓唯一解构宿主账本形状的地方。
  // 注：`motionStateOf` 是纯函数，"读账本失败降级为 false + 只告警一次"落在这里。
  let ledgerWarned = false
  const motionSessions: MotionSessionsPort = {
    subscribe: (listener) => ctx.sessions.list.subscribe(listener),
    currentSessionId: () => ctx.sessions.list.getSnapshot().current,
    isBlank: () => {
      // 会话账本读取失败不应让动效整块失效：退化为"非空白会话"（不播放新建
      // 对话入场），其余三组动效照常。
      try {
        // 形状断言逐字搬自基线 `:148-152`：`ClientContext` 是 `any` 桩，这个
        // `as unknown as` 是本仓唯一记录宿主账本形状的地方（批次⑨ 收紧类型时以它为准）。
        const snapshot = (ctx as unknown as {
          sessions: {
            list: { getSnapshot: () => { current?: string; byId: Record<string, { blank?: boolean } | undefined> } }
          }
        }).sessions.list.getSnapshot()
        return snapshot.current !== undefined && snapshot.byId[snapshot.current]?.blank === true
      } catch (err) {
        // getState 会被频繁调用；账本持续不可用时只提示一次。
        if (!ledgerWarned) {
          ledgerWarned = true
          console.warn('[width-slider] motion: session ledger unavailable', err)
        }
        return false
      }
    },
  }

  // 受控生命周期：依据配置开关安装/卸载各功能；配置变化即时热切换。
  ctx.effect(() => {
    const registry = createFeatureRegistry()

    const sync = (): void => {
      const s = getSettings()
      registry.ensureSafe('handle', s.widthSlider, () => installWidthFeature())
      registry.ensureSafe('think', s.thinkRender, () => installThinkRenderer(ctx))
      registry.ensureSafe('resize', s.dialogResize, () => installDialogResizePatch())
      registry.ensureSafe('nav', s.navScroll, () => installNavScrollPatch())
      registry.ensureSafe('sessionDel', s.sessionDelete, () => installSessionDelete(ctx as never))
      // 工作区分页：组件常驻（启动即包裹一次），开关只切换 wrapper 内 enabled
      // 状态（显示标签/过滤），不再反复安装/卸载组件——开关即时生效。
      registry.ensureSafe('wsTabs', true, () => installWorkspaceTabs(ctx as never))
      // 侧边栏工具并入新建会话行：同样常驻安装，模块内部按开关搬运/还原。
      registry.ensureSafe('toolsMerge', true, () => {
        const merge = installSidebarToolsMerge({ enabled: () => getSettings().sidebarToolsMerge })
        return () => merge.dispose()
      })
      // 动效：总闸放行即安装引擎。场景不再有独立开关，引擎拿到 on 之后
      // 三处入场与设置面板动效一齐生效，总闸关闭时整块卸载。
      registry.ensureSafe('motion',
        motionAllowed(s.motionMode, prefersReducedMotion()),
        () => installMotionFeature(motionSessions))
    }

    const unsubscribe = onSettingsChanged(sync)
    sync()
    return () => {
      unsubscribe()
      registry.disposeAll()
    }
  }, 'width-slider: feature lifecycles')

  // 启动时从 host 拉取一次持久化配置，同步进 store 触发生命周期 sync。
  ctx.effect(() => {
    let cancelled = false
    rpcReadSettings().then((raw) => {
      if (cancelled || raw === null) return
      applySettings(mergeSettings(raw))
    })
    return () => {
      cancelled = true
    }
  }, 'width-slider: config load')

  // 设置区块：功能总控页（props 注入 host 配置读写）。
  ctx.effect(
    () => ctx.slots.inject('settings.section', () => ctx.slots.register(
      {
        name: 'settings.section',
        id: 'width-slider',
        order: 600,
        label: 'Width Slider',
        locale: NS,
        // 单一读源：client 入口启动时经 config load 拉取一次；总控页只写。
        inject: () => ({
          writeSettings: (settings: unknown) => rpcWriteSettings(settings),
        }),
      },
      WidthSliderSettings,
    )),
    'width-slider: settings section',
  )
}
