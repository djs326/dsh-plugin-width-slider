/**
 * TabStrip.tsx — 官方工作区标题行里的页签栏（批次⑥ 自 workspaceTabs.tsx 原样搬出）。
 *
 * `TABS_CSS`（注入的样式文本）与图标常量 `I` 随本文件搬来：两者的唯一消费者都在
 * 这里（`I.plus` 只喂右端的「＋」按钮），留在别处会迫使内部常量变成导出，还会凭空
 * 多一条依赖边。组件只读 props 与 store 的纯查询（`groupOf` / `DEFAULT_TAB`），不写 store。
 */
import { createElement as h, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_TAB, groupOf, type WsGroup } from './groupsStore.ts'
import { tt } from './messages.ts'

// 官方工作区标题行是 justify-content:flex-end，原先靠搜索按钮自身的
// margin-left:auto 把内容顶到左边；工具按钮被并入新建会话行后那个 auto 随之
// 消失（关掉该开关时又回来），所以这里自己用 margin-right:auto 撑住左侧位置。
export const TABS_CSS = `
[data-dsh-ws-tabs-bar]{display:flex;align-items:center;gap:6px;flex:0 1 auto;min-width:0;max-width:100%;height:100%;overflow:hidden;order:-1;margin-right:auto}
[data-dsh-ws-tabs-group]{display:inline-flex;align-items:center;gap:2px;flex:0 1 auto;min-width:0;padding:2px;border-radius:10px;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
[data-dsh-ws-tabs-group]::-webkit-scrollbar{display:none}
[data-dsh-ws-tabs-bar] [data-dsh-ws-tab]{appearance:none;background:transparent;border:0;margin:0;padding:0 10px;height:24px;font:inherit;font-size:12.5px;line-height:24px;color:var(--dsw-alias-label-tertiary,#8a8f98);cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;flex:none;border-radius:8px;transition:background 150ms ease-out,color 150ms ease-out}
[data-dsh-ws-tabs-bar] [data-dsh-ws-tab]:hover{color:var(--dsw-alias-label-primary,#e6edf3)}
[data-dsh-ws-tabs-bar] [data-dsh-ws-tab]:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4f9eff);outline-offset:1px}
[data-dsh-ws-tabs-bar] [data-dsh-ws-tab][aria-selected="true"]{background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base,#fff));color:var(--dsw-alias-label-primary,#e6edf3);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.18),0 0 0 1px var(--dsw-alias-border-l2,rgba(128,128,128,.28))}
[data-dsh-ws-tabs-bar] [data-dsh-ws-add]{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#8a8f98);cursor:pointer;padding:2px;flex:none;border-radius:6px;line-height:0}
[data-dsh-ws-tabs-bar] [data-dsh-ws-add]:hover{color:var(--dsw-alias-label-primary,#e6edf3);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
[data-dsh-ws-tabs-bar] [data-dsh-ws-add] svg{display:block}
`

// ── 图标 ────────────────────────────────────────────────────────────────
const I = {
  plus: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
}

// ── 页签栏（Portal 进官方 header 行）───────────────────────────────────
export function TabStrip(props: {
  groups: readonly WsGroup[]
  active: string
  ready: boolean
  onPick: (id: string) => void
  onRename: (id: string) => void
  onMembers: (id: string) => void
  onDelete: (id: string) => void
  onAdd: () => void
}): ReactNode {
  const { groups, active, ready, onPick, onRename, onMembers, onDelete, onAdd } = props
  const [ctx, setCtx] = useState<{ x: number; y: number; id: string } | null>(null)

  useEffect(() => {
    if (!ctx) return
    // 点菜单自身不关；点外部 / Esc 才关（否则菜单项 click 永远被吞）。
    const closeOnOutside = (e: Event) => {
      const t = e.target
      if (t instanceof Element && t.closest && t.closest('[data-dsh-ws-ctx-menu]')) return
      setCtx(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtx(null)
    }
    document.addEventListener('pointerdown', closeOnOutside, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [ctx])

  // 键盘导航顺序：默认 + 分组（与渲染顺序一致，含分隔符占位）。
  const tabOrder: string[] = useMemo(
    () => [DEFAULT_TAB, ...groups.map((g) => g.id)],
    [groups],
  )
  const tabOf = (id: string): ReactNode => {
    const isDefault = id === DEFAULT_TAB
    const name = isDefault ? tt('tab.default') : (groupOf(id)?.name || '')
    const g = isDefault ? undefined : groupOf(id)
    const count = g ? g.workspaceIds.length : 0
    // roving tabindex：仅激活页签可聚焦，方向键在页签间移动并激活（键盘可达性）。
    const focusTab = (targetId: string): void => {
      requestAnimationFrame(() => {
        try {
          const host = document.querySelector('[data-dsh-ws-tabs-bar]')
          const el = host && host.querySelector('[data-dsh-ws-tab][data-dsh-ws-id="' + targetId + '"]')
          ;(el as HTMLElement | null)?.focus?.()
        } catch { /* 忽略 */ }
      })
    }
    const moveTo = (dir: -1 | 1) => {
      const idx = tabOrder.indexOf(id)
      if (idx < 0) return
      const next = tabOrder[(idx + dir + tabOrder.length) % tabOrder.length]
      onPick(next)
      focusTab(next)
    }
    const jumpTo = (targetId: string): void => {
      onPick(targetId)
      focusTab(targetId)
    }
    return h(
      'span',
      {
        key: id,
        role: 'tab',
        tabIndex: active === id ? 0 : -1,
        'aria-selected': active === id,
        'data-dsh-ws-tab': '',
        'data-dsh-ws-id': id,
        title: isDefault ? tt('defaultHint') : tt('tab.groupTitle', { name, n: String(count) }),
        onClick: (e: { stopPropagation: () => void }) => {
          e.stopPropagation()
          onPick(id)
        },
        onKeyDown: (e: { key: string; preventDefault: () => void }) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            moveTo(-1)
          } else if (e.key === 'ArrowRight') {
            e.preventDefault()
            moveTo(1)
          } else if (e.key === 'Home') {
            e.preventDefault()
            jumpTo(DEFAULT_TAB)
          } else if (e.key === 'End') {
            e.preventDefault()
            const last = tabOrder[tabOrder.length - 1]
            if (last !== undefined) jumpTo(last)
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onPick(id)
          }
        },
        onContextMenu: (e: { preventDefault: () => void; stopPropagation: () => void; clientX: number; clientY: number }) => {
          if (isDefault) return
          e.preventDefault()
          e.stopPropagation()
          setCtx({ x: e.clientX, y: e.clientY, id })
        },
      },
      name,
    )
  }

  const menuBtn = (label: string, danger: boolean, onPickAction: () => void): ReactNode =>
    h(
      'button',
      {
        type: 'button',
        role: 'menuitem',
        onClick: (e: { stopPropagation: () => void }) => {
          e.stopPropagation()
          setCtx(null)
          onPickAction()
        },
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          border: 0,
          background: 'transparent',
          color: danger ? 'var(--dsw-alias-state-error-primary,#e5484d)' : 'var(--dsw-alias-label-primary,#e6edf3)',
          padding: '7px 10px',
          borderRadius: 7,
          font: 'inherit',
          fontSize: 13,
          textAlign: 'left',
          cursor: 'pointer',
        },
        onMouseEnter: (e: { currentTarget: HTMLElement }) => {
          e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.14))'
        },
        onMouseLeave: (e: { currentTarget: HTMLElement }) => {
          e.currentTarget.style.background = 'transparent'
        },
      },
      label,
    )

  const addLabel = tt('add.tab')
  return h(
    'div',
    {
      'data-dsh-ws-tabs-bar': '',
      role: 'tablist',
      'aria-label': tt('tab.default'),
      onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    },
    [
      h(
        'div',
        { key: '__group', 'data-dsh-ws-tabs-group': '' },
        [tabOf(DEFAULT_TAB), ...groups.map((g) => tabOf(g.id))],
      ),
      h(
        'button',
        {
          key: '__add',
          type: 'button',
          'data-dsh-ws-add': '',
          title: addLabel,
          'aria-label': addLabel,
          onClick: (e: { stopPropagation: () => void }) => {
            e.stopPropagation()
            onAdd()
          },
        },
        h('span', { dangerouslySetInnerHTML: { __html: I.plus } }),
      ),
      ctx && !ready
        ? null
        : ctx
          ? h(
              'div',
              {
                key: 'ctx-menu',
                role: 'menu',
                'aria-label': groupOf(ctx.id)?.name || ctx.id,
                'data-dsh-ws-ctx-menu': '',
                onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
                style: {
                  position: 'fixed',
                  left: Math.max(8, Math.min(ctx.x, (window.innerWidth || 900) - 220)),
                  top: Math.max(8, ctx.y),
                  zIndex: 4100,
                  minWidth: 180,
                  padding: 6,
                  border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.4))',
                  borderRadius: 10,
                  background: 'var(--dsw-specific-menu, var(--dsw-alias-bg-layer-2, #202124))',
                  boxShadow: '0 12px 32px rgba(0,0,0,.28)',
                },
              },
              [
                menuBtn(tt('ctx.rename'), false, () => onRename(ctx.id)),
                menuBtn(tt('ctx.members'), false, () => onMembers(ctx.id)),
                menuBtn(tt('ctx.delete'), true, () => onDelete(ctx.id)),
              ],
            )
          : null,
    ],
  )
}
