/**
 * chatDom.ts — 官方对话与侧栏 DOM 的契约（official/ 层）。
 *
 * official/ 只做一件事：**找到并描述**宿主节点，不替消费方做决策 —— 批次调度、
 * entrance 装配、观察器生命周期都留在 motion/conversation.ts 与装配点。
 *
 * 本文件是这批契约的单一来源：
 * - 宿主选择器与谓词（对话行、侧栏树行）：原 motion/conversation.ts；
 * - 插件写回宿主行的类名（ROW_IN_CLASS 与 dsu-motion-* 样式/角色类）：原 motion/frames.ts；
 * - 思考块类名 THINK_BODY_CLASS：原先 conversation.ts 写选择器、think/thinkView.tsx
 *   写 CSS 规则与 className，三份字面量改一处就会静默失配，现收敛到此。
 */
import {
  MOTION_STYLES, NEW_CHAT_MOTION_STYLES, SIDEBAR_MOTION_STYLES,
  type MotionStyle, type NewChatMotionStyle, type SidebarMotionStyle,
} from '../../shared/motionSettings.ts'

// ── 宿主选择器与谓词 ─────────────────────────────────────────────────
/** Chat-row selector: the host renders one anchored row per message. */
export const ANCHOR = '[data-chat-anchor-key]'
/** Sidebar tree items: session/workspace rows inside a `role="tree"`. */
export const TREE_ITEM = '[role="tree"] [role="treeitem"]'
/**
 * Anything inside the conversation view. The trajectory JSON tree
 * (ui-primitives JsonTree) and the subagent lineage tree also render
 * role="tree"/"treeitem", but they belong to the transcript, not the sidebar
 * rail - without this guard they would take the sidebar entrance.
 */
const CONVERSATION_VIEW = '[data-conversation-scroll], [data-chat-flow]'
/** Every tracked item on a container (rows + tree items, one kind per container). */
export const ITEM_SELECTOR = `${ANCHOR}, ${TREE_ITEM}`
/**
 * 类名与选择器同源：features/think 的 thinkView.tsx 从 THINK_BODY_CLASS 派生 CSS
 * 规则与 className，本文件从它派生选择器。
 *
 * The thought (reasoning) body. It mounts when the block is expanded or starts
 * streaming open, and it is printed in line by line rather than faded as a whole
 * - the only surface in the transcript whose text arrives once and stays.
 */
export const THINK_BODY_CLASS = 'dsh-ws-think-body'
export const THINK_BODY = `.${THINK_BODY_CLASS}`
/**
 * The welcome headline. Matched by the CSS-module name segment the host keeps
 * across builds (`*_headline`); if the host renames it the query misses and the
 * seat entrance simply plays alone.
 */
export const HERO_HEADLINE = '[class*="headline"]'

/** Pure: whether an added node is a top-level chat row (not nested in one). */
export function isChatRow(node: Node): node is HTMLElement {
  return node instanceof HTMLElement
    && node.matches(ANCHOR)
    && node.parentElement?.closest(ANCHOR) === null
}

/**
 * Pure: whether a node is a sidebar rail row. Two host surfaces use
 * role="tree"/"treeitem" without being the rail, and both are excluded:
 * - trees rendered inside the conversation view (the trajectory JSON tree);
 * - trees portaled straight onto document.body (the subagent lineage
 *   dropdown), whose own parent element is the body.
 * Nested items are still allowed: session rows live INSIDE their workspace
 * group row (the host nests them), so a top-level-only check would silently
 * drop them.
 * @param node - a candidate element.
 */
export function isTreeItem(node: Node): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false
  if (!node.matches(TREE_ITEM)) return false
  if (node.closest(CONVERSATION_VIEW) !== null) return false
  // A portal target is the body itself; the rail always has a real ancestor.
  return node.closest('[role="tree"]')?.parentElement !== document.body
}

// ── 类名契约：插件写回宿主行的标记 ───────────────────────────────────
/**
 * Entrance classes applied to marked rows. Literal (global) classes on purpose:
 * the engine runs identically in the browser and in jsdom tests, independent of
 * CSS-module processing. ROW_IN_CLASS is the "already animated" marker used for
 * reuse detection and cleanup; the style class records which entrance ran.
 */
export const ROW_IN_CLASS = 'dsu-motion-row-in'
/** Every entrance style id the engine may apply (transcript + sidebar + new-chat). */
export type EntranceStyle = MotionStyle | SidebarMotionStyle | NewChatMotionStyle

/**
 * Every style class the engine may apply (for cleanup). The style sets share
 * the `fade` id, so the union is deduplicated.
 */
export const STYLE_CLASSES: readonly string[] =
  [...new Set([...MOTION_STYLES, ...SIDEBAR_MOTION_STYLES, ...NEW_CHAT_MOTION_STYLES])]
    .map((style) => styleClass(style))

/** Pure: the class that records which entrance style a row ran. */
export function styleClass(style: EntranceStyle): string {
  return `dsu-motion-${style}`
}

/**
 * Role-based arrivals: rather than one entrance for every transcript row, the
 * row's flow kind picks how it arrives — the user's own message comes in from
 * the side (it left the composer), the assistant's prose keeps whatever style
 * the user chose, and process rows (tool calls/results, commands, compaction,
 * errors) only settle in lightly so they never compete with the prose.
 */
export type RowRole = 'user' | 'process'

/** Class recording that a row arrived with the user-role entrance. */
export const ROLE_USER_CLASS = 'dsu-motion-role-user'
/** Class recording that a row arrived with the process-role entrance. */
export const ROLE_PROCESS_CLASS = 'dsu-motion-role-process'

/** Every role class (cleanup, alongside the style classes). */
export const ROLE_CLASSES: readonly string[] = [ROLE_USER_CLASS, ROLE_PROCESS_CLASS]

/**
 * Every class an entrance may leave on a row. The cleanup pass must remove the
 * role classes too: a replayed row can arrive as user first and as process
 * after a re-render, and a stale role class would linger otherwise.
 */
export const ENTRANCE_CLASSES: readonly string[] = [...STYLE_CLASSES, ...ROLE_CLASSES]

// ── 角色读取：宿主发布的 flow kind ───────────────────────────────────

/**
 * Pure: the entrance role of a transcript row, from the flow kind the host
 * publishes on the row (`data-chat-flow-kind`). The assistant's own prose
 * (`assistant-step`) returns undefined so it keeps the user's chosen style; a row
 * without a kind (the host changed its data attributes) also falls back to the
 * chosen style rather than guessing.
 *
 * Kind values seen from the host: user, steering, assistant-step, tool-call,
 * turn-process, turn-tail, context, compaction. The user's own words are `user`
 * and a mid-turn interjection is `steering`; everything else - tool rows, turn
 * framing, injected context, compaction notices - is process output. (Note the
 * anchor key uses the node kind `input-message` for the same rows, which is NOT
 * the flow kind, so it must not be matched here.)
 */
export function roleOf(row: HTMLElement): RowRole | undefined {
  const kind = row.dataset.chatFlowKind
  if (kind === undefined || kind === 'assistant-step') return undefined
  return kind === 'user' || kind === 'steering' ? 'user' : 'process'
}
