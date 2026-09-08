/**
 * thinkView.tsx — assistant-step 渲染器（整合自 dsh-think-zh-expand，MIT）。
 *
 * 来源：baosfeng/my-dsh-plugins → plugins/dsh-think-zh-expand/lib/parts/
 * assistant.part.js（上游 v0.4.7）。转写差异：
 * 1. TSX + tsdown 工程（上游为 React.createElement 手写拼接 parts）；
 * 2. 类名前缀 dsh-ws-（与上游 dsh-think-zh-expand- 互不干扰）；
 * 3. 行为默认「思考中展开、思考完自动收起」（上游为始终默认展开）；
 * 4. 思考块外观与官方 ReasoningRow 一致：头部用官方 primitives 的
 *    DisclosureRow + IconThinkOutline14，正文纯文本；样式逐条对齐官方
 *    ReasoningRow.module.css（折叠高度、扫描动画、字号变量、summary 跟随）。
 *    官方类名是 CSS 模块 hash、无法跨包复用，故用同名自有类 + 相同声明复刻；
 * 5. 正式回复 text 块走官方 primitives 的 MarkdownText（官方 DOM 结构 +
 *    labels 文案），本插件不自带 Markdown 渲染、不接管围栏渲染——围栏交给
 *    genui / dsh-mermaid-render 等专门插件；组件缺失时降级纯文本。
 *
 * 渲染契约：替换官方 conversation.chat.node 的 assistant-step 渲染器，只为
 * 思考块提供展开/收起交互；image 块相邻分组复用宿主 renderMessageImages；
 * tool-call 块由独立节点渲染（返回 null）。
 */

import { Component, memo, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { isZhInterface, pickText } from '../lang.ts'

// ── 样式（取值对齐官方 ReasoningRow / AssistantMarkdown 的 CSS 模块）──
export const THINK_STYLES = `
.dsh-ws-assistant{display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size,14px);line-height:calc(24px + var(--dsh-content-font-delta,0px))}
.dsh-ws-assistant-body{display:flex;flex-direction:column;gap:16px}
.dsh-ws-assistant-body .md-table-wide{--dsh-table-spare:max(0px,calc((100cqw - var(--dsh-chat-content-width)) / 2));--dsh-table-lead:calc(var(--dsh-table-spare) + min(var(--dsh-chat-content-width),100cqw) - 100%);box-sizing:border-box;width:calc(100% + var(--dsh-table-lead) + var(--dsh-table-spare));max-width:none;margin-left:calc(-1 * var(--dsh-table-lead));padding-left:var(--dsh-table-lead)}
.dsh-ws-think{display:flex;flex-direction:column}
.dsh-ws-think:not([data-expanded]){contain:size layout;height:calc(24px + var(--dsh-content-font-delta,0px))}
.dsh-ws-think-row{position:relative;overflow:hidden}
.dsh-ws-think[data-state=running] .dsh-ws-think-row:after{content:"";inset-block:0;background:linear-gradient(90deg,transparent 0%,color-mix(in srgb,var(--dsw-alias-bg-base) 60%,transparent) 55%,transparent 100%);pointer-events:none;width:300px;animation:2.6s ease-out infinite dsh-ws-think-sweep;position:absolute;left:0}
@keyframes dsh-ws-think-sweep{0%{left:-300px}90%,to{left:100%}}
@media (prefers-reduced-motion:reduce){.dsh-ws-think[data-state=running] .dsh-ws-think-row:after{animation:none}}
.dsh-ws-think-leading{flex-shrink:0}
.dsh-ws-think-chevron{color:var(--dsw-alias-label-secondary)}
.dsh-ws-think-title{font-weight:400}
.dsh-ws-think-separator{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}
.dsh-ws-think-summary{min-width:0;color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;flex:auto;overflow:hidden}
.dsh-ws-think-summary-text{text-overflow:ellipsis;display:block;overflow:hidden}
.dsh-ws-think-summary[data-follow-end]{justify-content:flex-end;display:flex}
.dsh-ws-think-summary[data-follow-end] .dsh-ws-think-summary-text{text-align:start;text-overflow:clip;flex:none;width:max-content;min-width:100%;overflow:visible}
.dsh-ws-think-body{padding:4px 0 4px calc(22px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:pre-wrap;word-break:break-word}
.dsh-ws-plain{white-space:pre-wrap;word-break:break-word}
.dsh-ws-unknown{margin:0;white-space:pre-wrap;word-break:break-word;font-family:var(--dsw-font-markdown-code-block,monospace);font-size:var(--dsh-content-font-size-secondary,13px)}
.dsh-ws-visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.dsh-ws-stopped{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);border-radius:6px;align-self:flex-start;padding:0 6px;font-size:11px;line-height:18px}
`

// ── 官方 primitives 运行时解析（一次解析、一个缓存）────────────────────

/** Markdown 组件文案（与官方 markdownLabels(t) 同构）。 */
interface MarkdownLabels {
  code: { copyLabel: string; copiedLabel: string }
  footnotes: string
}

type MarkdownTextComponent = ComponentType<{
  text: string
  streaming?: boolean
  labels?: MarkdownLabels
  /** 官方期望的是「已解析的 mentions 对象」，不是 slot 注入的解析函数。 */
  fileMentions?: unknown
}>

/** 官方 DisclosureRow（思考块头部：图标 + 标题 + chevron + 折叠内容）。 */
type DisclosureRowComponent = ComponentType<{
  icon?: ReactNode
  title?: ReactNode
  open?: boolean
  expandable?: boolean
  expandOnRowClick?: boolean
  previewChevron?: boolean
  keepContentWhenOpen?: boolean
  onToggle?: () => void
  collapsedContent?: ReactNode
  children?: ReactNode
  className?: string
  rowClassName?: string
  leadingClassName?: string
  chevronClassName?: string
  titleClassName?: string
}>

/** 官方图标组件（size / className）。 */
type IconComponent = ComponentType<{ size?: number; className?: string }>

interface Primitives {
  MarkdownText?: MarkdownTextComponent
  DisclosureRow?: DisclosureRowComponent
  IconThinkOutline14?: IconComponent
}

let resolvedPrimitives: Primitives | null | undefined

/** 解析一次并缓存 primitives 相关组件；缺失/异常返回 null。 */
function resolvePrimitives(): Primitives | null {
  if (resolvedPrimitives !== undefined) return resolvedPrimitives
  try {
    // require 来自 __ModuleLoader__ factory 注入的模块加载器（见 env.d.ts 声明）。
    const mod = require('@deepseek-ai/dsh-client-ui-primitives') as Primitives
    resolvedPrimitives = mod ?? null
    if (!mod?.MarkdownText || !mod?.DisclosureRow) {
      console.warn('[width-slider] primitives 缺少 MarkdownText/DisclosureRow，相关块降级纯文本')
    }
  } catch (err) {
    resolvedPrimitives = null
    console.warn('[width-slider] 未找到 @deepseek-ai/dsh-client-ui-primitives（文本与思考块降级纯文本）', err)
  }
  return resolvedPrimitives
}

// ── 模型控制标签剥离 ─────────────────────────────────────────────────
// 模型输出里会出现 xml 风格控制/分段标签（<review>/<think>/<answer> 等）独占
// 一行的分段标记。只剥离「独占一行」的标签，正文/代码里提到的字面量（例如
// 「如何解析 <think> 标签」）保持原样——官方渲染器不做任何剥离，越少改写越好。
const CONTROL_TAG_LINE_RE = /^[ \t]*<\s*\/?\s*(?:think|review|answer)\s*>[ \t]*\r?\n?/gim

function stripControlTags(text: string): string {
  if (typeof text !== 'string' || text === '') return text
  return text.replace(CONTROL_TAG_LINE_RE, '')
}

// ── 文本渲染（官方 MarkdownText；缺失时降级纯文本）────────────────────
// memo：流式渲染时内容未变的 block（同 key 复用实例）跳过 strip 与
// MarkdownText 重解析，减少每帧全量工作。zh 参与比较：界面语言切换必须
// 触发重渲染（memo 只比较 props，语言不在 props 里就会被挡住）。
// 注意：不要向官方 MarkdownText 透传 slot 的 fileMentions——slot 给的是
// `(owner) => mentions` 函数，官方 MarkdownText 期望的是已解析的 mentions
// 对象（内部调 fileMentions?.resolve(...)）。直接把函数传进去会抛
// "fileMentions?.resolve is not a function"，整个 assistant-step 被错误边界
// 接住（思考块一起失效）。owner 依赖 turn/seq/tail 上下文，插件侧拿不到，
// 故这里不传（官方在无 owner 时同样不传）。
/**
 * 单块错误边界：官方 MarkdownText 抛错时只降级这一块为纯文本，不让整个
 * assistant-step slot entry 崩溃（曾因透传错误的 fileMentions 导致整条消息
 * 连思考块一起消失）。
 */
class BlockErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    console.warn('[width-slider] 文本渲染失败，已降级为纯文本', error)
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

const TextRenderer = memo(function TextRenderer({
  text,
  streaming = false,
  zh,
}: { text: string; streaming?: boolean; zh: boolean }) {
  const cleanText = stripControlTags(text)
  // labels 必须引用稳定（官方以引用判断流式渲染缓存是否失效），且随界面语言
  // 重建：DSH 切换语言只改 document.lang，模块级常量不会更新。
  const labels = useMemo<MarkdownLabels>(
    () => ({
      code: { copyLabel: zh ? '复制' : 'Copy', copiedLabel: zh ? '已复制' : 'Copied' },
      footnotes: zh ? '脚注' : 'Footnotes',
    }),
    [zh],
  )
  const MarkdownText = resolvePrimitives()?.MarkdownText
  if (MarkdownText !== undefined) {
    return (
      <BlockErrorBoundary fallback={<div className="dsh-ws-plain">{cleanText}</div>}>
        <MarkdownText text={cleanText} streaming={streaming} labels={labels} />
      </BlockErrorBoundary>
    )
  }
  return <div className="dsh-ws-plain">{cleanText}</div>
})

// ── 思考块：默认「思考完收起」行为 ──────────────────────────────────
// 行为语义（用户定制版固化）：
// - 生成中（running=true）强制展开，标题行不可收起（running 优先）；
// - 生成结束（running 变 false）自动收起为单行摘要；
// - 非生成中可点击标题行手动展开/收起；手动展开的块不会被自动收起，
//   直到下一次 running 结束。
// 外观（头部组件、图标、字号、缩进、摘要跟随）与官方 ReasoningRow 一致。
export interface ThinkBlockProps {
  text: string
  running: boolean
  /** true=思考完自动收起（默认）；false=上游语义（默认展开、可手动收起）。 */
  collapseAfterRun?: boolean
}

/** 首行 / 末行摘要（与官方 ReasoningRow 的 firstLine / latestLine 同义）。 */
function firstLine(text: string): string {
  const nl = text.indexOf('\n')
  return nl === -1 ? text : text.slice(0, nl)
}

function latestLine(text: string): string {
  const visible = text.trimEnd()
  const nl = visible.lastIndexOf('\n')
  return nl === -1 ? visible : visible.slice(nl + 1)
}

export function ThinkBlock({ text, running, collapseAfterRun = true }: ThinkBlockProps) {
  const cleanText = stripControlTags(text)
  // 初始态与模式对齐：auto-collapse（默认）初始收起——历史/非生成中的
  // 思考块以折叠摘要呈现，生成中由 open=expanded||running 强制展开、结束
  // 后自动收起；keep-expanded（上游语义）初始展开、可手动收起。
  const [expanded, setExpanded] = useState<boolean>(() => !collapseAfterRun)
  const open = expanded || running
  const prevRunning = useRef(running)

  // 生成结束（running true→false）自动收起（仅 auto-collapse 模式）。
  useEffect(() => {
    if (collapseAfterRun && prevRunning.current && !running) setExpanded(false)
    prevRunning.current = running
  }, [running, collapseAfterRun])

  // 摘要与官方一致：生成中跟随最后一行，结束后取第一行。
  const summary = running ? latestLine(cleanText) : firstLine(cleanText)

  const primitives = resolvePrimitives()
  const DisclosureRow = primitives?.DisclosureRow
  const ThinkIcon = primitives?.IconThinkOutline14
  // 官方组件缺失时降级：直接显示纯文本正文，不影响内容可读性。
  if (DisclosureRow === undefined) return <div className="dsh-ws-think-body">{cleanText}</div>

  return (
    <div
      className="dsh-ws-think"
      data-variant="think"
      data-state={running ? 'running' : 'ok'}
      data-expanded={open || undefined}
    >
      {running && <span className="dsh-ws-visually-hidden">{pickText('运行中', 'Running')}</span>}
      <DisclosureRow
        rowClassName="dsh-ws-think-row"
        leadingClassName="dsh-ws-think-leading"
        titleClassName="dsh-ws-think-title"
        chevronClassName="dsh-ws-think-chevron"
        icon={ThinkIcon !== undefined ? <ThinkIcon size={14} /> : null}
        title={pickText('思考', 'Thinking')}
        open={open}
        expandable
        expandOnRowClick
        onToggle={() => setExpanded((v) => !v)}
        collapsedContent={
          <>
            <span className="dsh-ws-think-separator" aria-hidden="true" />
            <span className="dsh-ws-think-summary" data-follow-end={running || undefined}>
              <span className="dsh-ws-think-summary-text">{summary}</span>
            </span>
          </>
        }
      >
        {/* 正文与官方 ReasoningRow 一致：纯文本（不渲染 Markdown）。 */}
        <div className="dsh-ws-think-body">{cleanText}</div>
      </DisclosureRow>
    </div>
  )
}

// ── assistant-step 渲染器 ────────────────────────────────────────────

/** 图片块类型最小契约（完整结构由宿主渲染器消费）。 */
interface ImageBlock {
  kind: 'image'
  attachment?: unknown
}

interface RenderMessageImagesProps {
  images: { attachment?: unknown }[]
  align: string
}

/** 把相邻 image 块收集为一组，返回组内最后一个 image 的下标。 */
function imageGroupEnd(blocks: unknown[], i: number): number {
  let end = i
  while (end + 1 < blocks.length) {
    const next = blocks[end + 1] as { kind?: string } | null | undefined
    if (!next || next.kind !== 'image') break
    end += 1
  }
  return end
}

/** 渲染单个 block；tool-call 返回 null（由独立节点渲染）。 */
function renderBlock(
  blocks: unknown[],
  i: number,
  streaming: boolean,
  last: number,
  zh: boolean,
  renderMessageImages?: (props: RenderMessageImagesProps) => ReactNode,
  collapseAfterRun?: boolean,
): ReactNode {
  const block = blocks[i] as { kind?: string; text?: unknown } | null | undefined
  if (!block) return null
  if (block.kind === 'text' && typeof block.text === 'string') {
    // 与官方不同（有意）：官方所有 text 块都传 streaming=true；这里只把流式
    // 尾块标记为 streaming，已定稿的块走 settled 渲染，避免历史消息反复
    // 重建流式渲染器。改动此处前请先确认流式观感。
    return (
      <TextRenderer key={'t' + i} text={block.text} streaming={streaming && i === last} zh={zh} />
    )
  }
  if (block.kind === 'reasoning' && typeof block.text === 'string') {
    return (
      <ThinkBlock
        key={'r' + i}
        text={block.text}
        running={streaming && i === last}
        collapseAfterRun={collapseAfterRun}
      />
    )
  }
  if (block.kind === 'image' && typeof renderMessageImages === 'function') {
    const end = imageGroupEnd(blocks, i)
    const images = (blocks.slice(i, end + 1) as ImageBlock[]).map((b) => ({ attachment: b.attachment }))
    return <div key={'img' + i}>{renderMessageImages({ images, align: 'start' })}</div>
  }
  if (block.kind === 'tool-call') return null
  // 未知块：官方渲染 JsonBlock，这里降级为 JSON 文本，避免静默吞掉内容。
  try {
    return <pre key={'u' + i} className="dsh-ws-unknown">{JSON.stringify(block, null, 2)}</pre>
  } catch {
    return null
  }
}

/** 渲染 blocks 全列表：返回元素数组；图片组只渲染一次（消费整组）。 */
function renderBlocks(
  blocks: unknown[],
  streaming: boolean,
  zh: boolean,
  renderMessageImages?: (props: RenderMessageImagesProps) => ReactNode,
  collapseAfterRun?: boolean,
): ReactNode[] {
  const last = blocks.length - 1
  const rendered: ReactNode[] = []
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i] as { kind?: string } | null | undefined
    if (!block) continue
    const el = renderBlock(blocks, i, streaming, last, zh, renderMessageImages, collapseAfterRun)
    if (el === null || el === undefined) continue
    if (block.kind === 'image') i = imageGroupEnd(blocks, i)
    rendered.push(el)
  }
  return rendered
}

/** assistant-step 节点渲染器（替换官方单行折叠版）。 */
export interface AssistantStepViewProps {
  node?: { data?: { status?: string; blocks?: unknown[] } } | null
  renderMessageImages?: (props: RenderMessageImagesProps) => ReactNode
  /** true=思考完自动收起（默认）；false=始终展开（上游语义）。 */
  collapseAfterRun?: boolean
}

export function AssistantStepView({
  node,
  renderMessageImages,
  collapseAfterRun = true,
}: AssistantStepViewProps) {
  const data = node && node.data ? node.data : null
  if (!data || !Array.isArray(data.blocks)) return null
  const streaming = data.status === 'running'
  const interrupted = data.status === 'interrupted'
  // 官方守卫（dsh-client-ui-chat AssistantMarkdown）：流式中、被中断、或含有
  // 非 tool-call 块时才渲染；否则该节点没有可呈现的内容（工具卡片自成一行），
  // 渲染空容器会多出 16px 间距并留下一个空的「已停止」标签。
  const blocks = data.blocks as Array<{ kind?: string } | null | undefined>
  const hasContent = blocks.some((b) => b !== null && b !== undefined && b.kind !== 'tool-call')
  if (!(streaming || interrupted === true || hasContent)) return null
  const rendered = renderBlocks(data.blocks, streaming, isZhInterface(), renderMessageImages, collapseAfterRun)
  if (interrupted) {
    rendered.push(<span key="stopped" className="dsh-ws-stopped">{pickText('已停止', 'Stopped')}</span>)
  }
  return (
    <div className="dsh-ws-assistant" data-streaming={streaming || undefined}>
      <div className="dsh-ws-assistant-body">{rendered}</div>
    </div>
  )
}
