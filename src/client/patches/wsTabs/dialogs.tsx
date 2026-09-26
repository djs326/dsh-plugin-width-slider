/**
 * dialogs.tsx — 页签的重命名 / 管理工作区 / 删除对话框，以及工作区行菜单的
 * 「分配标签」选择器（批次⑥ 自 workspaceTabs.tsx 原样搬出）。
 *
 * `AssignTabPicker` 在规格的行号表里归 R5，但它与三个对话框共用 `btnStyle` 与弹窗
 * 外壳、并被对话框状态机调用，故按 Q9 落本文件。它调用的 `assignWsToTab` 来自
 * assignMenuItem.ts（规格依赖图漏列的 dialogs → assignMenuItem 边，实测无环）。
 */
import { createElement as h, useState, type CSSProperties, type ReactNode } from 'react'
import { primitives } from '../../core/primitives.ts'
import { assignWsToTab } from './assignMenuItem.ts'
import { commitGroups, groupOf, groups } from './groupsStore.ts'
import { tt, ttw } from './messages.ts'
import { type WorkspaceLike } from './scope.ts'

/** 分配目标选择（官方 Modal；由侧栏壳组件状态驱动，事件经窗口事件桥送达）。 */
export function AssignTabPicker(props: {
  workspaceId: string
  title: string
  currentOwner: string | undefined
  groupNames: { id: string; name: string }[]
  onDone: () => void
}): ReactNode {
  const { workspaceId, title, currentOwner, groupNames, onDone } = props
  const [doneName, setDoneName] = useState<string | null>(null)
  const Modal = primitives().Modal
  if (!Modal) return null

  const pick = (groupId: string | null, label: string) => {
    assignWsToTab(workspaceId, groupId)
    setDoneName(label)
  }
  const option = (groupId: string | null, name: string): ReactNode =>
    h(
      'button',
      {
        type: 'button',
        onClick: () => pick(groupId, name),
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          border: 0,
          background: 'transparent',
          color: 'var(--dsw-alias-label-primary,#e6edf3)',
          padding: '8px 10px',
          borderRadius: 8,
          font: 'inherit',
          fontSize: 13,
          textAlign: 'left',
          cursor: 'pointer',
        },
        onMouseEnter: (e: { currentTarget: HTMLElement }) => {
          e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12))'
        },
        onMouseLeave: (e: { currentTarget: HTMLElement }) => {
          e.currentTarget.style.background = 'transparent'
        },
      },
      [
        h('span', { key: 'n', style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, name),
        currentOwner === groupId || (currentOwner === undefined && groupId === null)
          ? h('span', { key: 'c', style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary,#a8abb3)' } }, ttw('dlg.cur'))
          : null,
      ],
    )

  return h(
    Modal,
    {
      open: true,
      onClose: onDone,
      title: ttw('dlg.title'),
      closeLabel: tt('cancel'),
      footer: [h('button', { key: 'ok', type: 'button', onClick: onDone, style: btnStyle({ primary: true }, false) }, tt('done'))],
    },
    h('div', null, [
      doneName !== null
        ? h('div', { style: { padding: '8px 4px', fontSize: 13, color: 'var(--dsw-alias-state-success-primary,#3fb950)' } }, ttw('dlg.done') + '：' + doneName)
        : h('div', null, [
            h('div', { key: 'd', style: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary,#a8abb3)', marginBottom: 8 } }, ttw('dlg.desc', { name: title || '' })),
            h('div', { key: 'l', style: { display: 'flex', flexDirection: 'column', gap: 1 } }, [
              option(null, tt('tab.default')),
              ...groupNames.map((g) => option(g.id, g.name)),
            ]),
          ]),
    ]),
  )
}

// ── 对话框（重命名 / 管理工作区 / 删除）──────────────────────────────────
function btnStyle(opts: { primary?: boolean; danger?: boolean; disabled?: boolean }, busy: boolean): CSSProperties {
  const base: CSSProperties = {
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 13,
    cursor: busy || opts.disabled ? 'default' : 'pointer',
    marginRight: 8,
    opacity: busy || opts.disabled ? 0.5 : 1,
  }
  if (opts.danger) {
    base.border = '1px solid var(--dsw-alias-state-error-primary,#e5484d)'
    base.background = 'var(--dsw-alias-state-error-primary,#e5484d)'
    base.color = '#fff'
  } else if (opts.primary) {
    base.border = '1px solid var(--dsw-alias-state-business-primary,#4f9eff)'
    base.background = 'var(--dsw-alias-state-business-primary,#4f9eff)'
    base.color = '#fff'
  } else {
    base.border = '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.4))'
    base.background = 'transparent'
    base.color = 'var(--dsw-alias-label-primary,inherit)'
  }
  return base
}

/**
 * 重命名 / 新建页签对话框的 props。草稿分支必带 `onCreate`，所以「开着草稿却没人
 * 负责创建」这种静默 no-op 组合在类型上无法表达。
 */
type RenameDialogProps = {
  groupId: string
  onDone: () => void
} & (
  | { draft: true; onCreate: (name: string) => void }
  | { draft?: false; onCreate?: never }
)

export function RenameDialog(props: RenameDialogProps): ReactNode {
  const g = groupOf(props.groupId)
  // 草稿初值为空串：`sanitize()` 会把宿主返回的空名兜底成「未命名」，若这里也用同一个
  // 默认名，只要列表里已有一个「未命名」页签，新建对话框一打开就撞重名、保存键直接禁用。
  // 输入框的占位提示已经足够表达「还没起名」。
  const [draftName, setDraftName] = useState(g?.name ?? '')
  const [busy, setBusy] = useState(false)
  // 草稿对应「尚不存在」的组，重命名对应「已存在」的组；两种反向组合都不该渲染
  // （草稿传了已存在的 id 会让保存走 onCreate，往列表里追加同 id 的第二个组）。
  if (props.draft === true ? g !== undefined : g === undefined) return null
  const Modal = primitives().Modal
  if (!Modal) return null

  const trimmed = draftName.trim()
  const currentName = g?.name ?? ''
  const duplicate = trimmed !== '' && trimmed !== currentName
    && groups.some((x) => x.id !== props.groupId && x.name === trimmed)
  const blocked = busy || trimmed === '' || duplicate
  const save = () => {
    if (blocked) return
    setBusy(true)
    if (props.draft === true) props.onCreate(trimmed)
    else commitGroups((cur) => cur.map((x) => (x.id === props.groupId ? { ...x, name: trimmed } : x)))
    setBusy(false)
    props.onDone()
  }
  const close = () => {
    if (!busy) props.onDone()
  }
  return h(
    Modal,
    {
      open: true,
      onClose: close,
      title: props.draft === true ? tt('add.tab') : tt('rename.title'),
      closeLabel: tt('cancel'),
      footer: [
        h('button', { key: 'cancel', type: 'button', onClick: close, style: btnStyle({}, busy) }, tt('cancel')),
        h('button', {
          key: 'save',
          type: 'button',
          disabled: busy || blocked,
          onClick: save,
          style: btnStyle({ primary: true, disabled: blocked }, busy),
        }, busy ? tt('rename.saving') : tt('rename.save')),
      ],
    },
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, [
      h('input', {
        key: 'inp',
        type: 'text',
        autoFocus: true,
        value: draftName,
        maxLength: 40,
        placeholder: tt('rename.placeholder'),
        onChange: (e: { target: { value: string } }) => setDraftName(e.target.value),
        onKeyDown: (e: { key: string }) => {
          if (e.key === 'Enter') save()
        },
        style: {
          boxSizing: 'border-box',
          width: '100%',
          minHeight: 36,
          padding: '0 10px',
          border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.4))',
          borderRadius: 8,
          background: 'var(--dsw-alias-bg-layer-2, rgba(255,255,255,.04))',
          color: 'var(--dsw-alias-label-primary, inherit)',
          fontSize: 13,
          outline: 'none',
        },
      }),
      duplicate
        ? h('div', { key: 'dup', style: { fontSize: 12, color: 'var(--dsw-alias-state-error-primary,#e5484d)' } }, tt('rename.dup'))
        : trimmed === ''
          ? h('div', { key: 'req', style: { fontSize: 12, color: 'var(--dsw-alias-label-caption,#8a8e96)' } }, tt('rename.required'))
          : null,
    ]),
  )
}

export function MembersDialog(props: {
  groupId: string
  items: WorkspaceLike[]
  membership: ReadonlyMap<string, string>
  onDone: () => void
}): ReactNode {
  const g = groupOf(props.groupId)
  const { items, membership, onDone } = props
  if (!g) return null
  const Modal = primitives().Modal
  if (!Modal) return null
  const included = new Set(g.workspaceIds)

  const toggle = (wsId: string, on: boolean): void => {
    commitGroups((cur) => {
      const moved = cur.map((x) =>
        x.id === g.id
          ? x
          : { ...x, workspaceIds: x.workspaceIds.filter((id) => id !== wsId) },
      )
      return moved.map((x) => {
        if (x.id !== g.id) return x
        const has = x.workspaceIds.includes(wsId)
        if (on && !has) return { ...x, workspaceIds: [...x.workspaceIds, wsId] }
        if (!on && has) return { ...x, workspaceIds: x.workspaceIds.filter((id) => id !== wsId) }
        return x
      })
    })
  }

  return h(
    Modal,
    {
      open: true,
      onClose: onDone,
      title: tt('members.title', { name: g.name }),
      closeLabel: tt('cancel'),
      footer: [h('button', { key: 'ok', type: 'button', onClick: onDone, style: btnStyle({ primary: true }, false) }, tt('done'))],
    },
    h('div', null, [
      h('div', { key: 'desc', style: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary,#a8abb3)', marginBottom: 10 } }, tt('members.desc')),
      items.length === 0
        ? h('div', { key: 'empty', style: { padding: '18px 4px', textAlign: 'center', fontSize: 13, color: 'var(--dsw-alias-label-secondary,#a8abb3)' } }, tt('members.empty'))
        : h(
            'div',
            { key: 'list', style: { display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 260, overflowY: 'auto' } },
            items.map((w) => {
              const wsId = w.workspaceId || ''
              const name = w.title || w.path || wsId
              const inGroup = included.has(wsId)
              const owner = membership.get(wsId)
              return h(
                'label',
                {
                  key: wsId,
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '7px 10px',
                    borderRadius: 8,
                    fontSize: 13,
                    cursor: 'pointer',
                  },
                  onMouseEnter: (e: { currentTarget: HTMLElement }) => {
                    e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12))'
                  },
                  onMouseLeave: (e: { currentTarget: HTMLElement }) => {
                    e.currentTarget.style.background = 'transparent'
                  },
                },
                [
                  h('input', {
                    key: 'ck',
                    type: 'checkbox',
                    checked: inGroup,
                    onChange: (e: { target: { checked: boolean } }) => toggle(wsId, e.target.checked),
                    style: { margin: 0, width: 15, height: 15, flex: 'none', accentColor: 'var(--dsw-alias-state-business-primary,#4f9eff)' },
                  }),
                  h('span', { key: 'n', style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, name),
                  h('span', { key: 'o', style: { flex: 'none', fontSize: 11, color: 'var(--dsw-alias-label-caption,#8a8e96)' } }, owner ? tt('members.at', { name: groupOf(owner)?.name || owner }) : tt('members.atDefault')),
                ],
              )
            }),
          ),
    ]),
  )
}

export function DeleteDialog(props: { groupId: string; onDone: () => void }): ReactNode {
  const g = groupOf(props.groupId)
  const [busy, setBusy] = useState(false)
  if (!g) return null
  const Modal = primitives().Modal
  if (!Modal) return null
  const count = g.workspaceIds.length
  const close = () => {
    if (!busy) props.onDone()
  }
  const confirm = () => {
    if (busy) return
    setBusy(true)
    commitGroups((cur) => cur.filter((x) => x.id !== g.id))
    setBusy(false)
    props.onDone()
  }
  return h(
    Modal,
    {
      open: true,
      onClose: close,
      title: tt('delete.title'),
      closeLabel: tt('cancel'),
      description: tt('delete.desc', { name: g.name, n: String(count) }),
      footer: [
        h('button', { key: 'cancel', type: 'button', onClick: close, style: btnStyle({}, busy) }, tt('cancel')),
        h('button', { key: 'del', type: 'button', disabled: busy, onClick: confirm, style: btnStyle({ danger: true }, busy) }, busy ? tt('delete.busy') : tt('delete.ok')),
      ],
    },
    null,
  )
}
