/**
 * thinkView.tsx — assistant-step 渲染器（整合自 dsh-think-zh-expand，MIT）。
 *
 * 来源：baosfeng/my-dsh-plugins → plugins/dsh-think-zh-expand/lib/parts/
 * assistant.part.js（上游 v0.4.7）。转写差异：
 * 1. TSX + tsdown 工程（上游为 React.createElement 手写拼接 parts）；
 * 2. 类名前缀 dsh-ws-（与上游 dsh-think-zh-expand- 互不干扰）；
 * 3. 行为默认「思考中展开、思考完自动收起」（上游为始终默认展开）；
 * 4. 思考块外观与官方一致：头部用官方 primitives 的 DisclosureRow +
 *    IconThinkOutline14，正文与官方 ReasoningRow 一样是纯文本（不渲染
 *    Markdown）；只有「生成中展开、结束自动收起」这一行为是本插件定制。
 * 5. 正式回复 text 块走官方 primitives 的 MarkdownText（官方 DOM 结构），
 *    本插件不自带 Markdown 渲染、不接管围栏渲染——围栏交给
 *    genui / dsh-mermaid-render 等专门插件；组件缺失时降级纯文本。
 *
 * 渲染契约：替换官方 conversation.chat.node 的 assistant-step 渲染器，只为
 * 思考块提供展开/收起交互；image 块相邻分组复用宿主 renderMessageImages；
 * tool-call 块由独立节点渲染（返回 null）。
 */

import { memo, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { pickText } from '../lang.ts'

// ── 思考块与 assistant 容器样式（DSH 语义 token，随激活注入）──────────
// 头部外观完全交给官方 DisclosureRow（同组件、同图标），这里只保留正文
// 与折叠摘要两处自有样式（官方类名是 CSS 模块 hash，跨包无法复用）。
export const THINK_STYLES = `
.dsh-ws-assistant{display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);font-size:16px;line-height:28px}
.dsh-ws-assistant-body{display:flex;flex-direction:column;gap:16px}
.dsh-ws-think{display:flex;flex-direction:column;width:100%;min-width:0}
.dsh-ws-think-separator{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}
.dsh-ws-think-summary{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:auto;font-size:14px;line-height:24px;overflow:hidden}
.dsh-ws-think-body{white-space:pre-wrap;word-break:break-word;padding:4px 0 4px 22px;font-size:14px;line-height:24px;color:var(--dsw-alias-label-tertiary)}
.dsh-ws-think-body p{margin:0}
.dsh-ws-think-body ul,.dsh-ws-think-body ol{margin:0;padding-left:1.4em}
.dsh-ws-think-body pre,.dsh-ws-think-body blockquote,.dsh-ws-think-body h1,.dsh-ws-think-body h2,.dsh-ws-think-body h3,.dsh-ws-think-body h4{margin:0}
.dsh-ws-plain{white-space:pre-wrap;word-break:break-word}
.dsh-ws-stopped{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);border-radius:6px;align-self:flex-start;padding:0 6px;font-size:11px;line-height:18px}
`

// ── 官方 MarkdownText 运行时解析（primitive 外部模块，不静态 import）──
// 正文与思考正文一律走官方渲染管线：产出官方 md-code-block 结构，让
// genui / dsh-mermaid-render 等 DOM 渲染插件能正常扫描并接管围栏。

type MarkdownTextComponent = ComponentType<{ text: string; streaming?: boolean }>

/** 官方 DisclosureRow（思考块头部：图标 + 标题 + chevron + 折叠内容）。 */
type DisclosureRowComponent = ComponentType<{
  icon?: ReactNode
  title?: ReactNode
  open?: boolean
  expandable?: boolean
  expandOnRowClick?: boolean
  onToggle?: () => void
  collapsedContent?: ReactNode
  children?: ReactNode
}>

/** 官方图标组件（size prop）。 */
type IconComponent = ComponentType<{ size?: number }>

interface Primitives {
  DisclosureRow?: DisclosureRowComponent
  IconThinkOutline14?: IconComponent
}

let resolvedPrimitives: Primitives | null | undefined

/** 解析一次并缓存 primitives 的思考块组件；缺失/异常返回 null。 */
function resolvePrimitives(): Primitives | null {
  if (resolvedPrimitives !== undefined) return resolvedPrimitives
  try {
    const mod = require('@deepseek-ai/dsh-client-ui-primitives') as Primitives
    resolvedPrimitives = mod ?? null
    if (!mod?.DisclosureRow) console.warn('[width-slider] primitives 未导出 DisclosureRow，思考块降级纯文本')
  } catch (err) {
    resolvedPrimitives = null
    console.warn('[width-slider] 未找到 @deepseek-ai/dsh-client-ui-primitives（思考块降级纯文本）', err)
  }
  return resolvedPrimitives
}

let resolvedMdText: MarkdownTextComponent | null | undefined

/** 解析一次并缓存 primitives.MarkdownText；缺失/异常返回 null。 */
function resolveMarkdownText(): MarkdownTextComponent | null {
  if (resolvedMdText !== undefined) return resolvedMdText
  try {
    // require 来自 __ModuleLoader__ factory 注入的模块加载器（见 env.d.ts 声明）。
    const mod = require('@deepseek-ai/dsh-client-ui-primitives') as {
      MarkdownText?: MarkdownTextComponent
    }
    const view = mod?.MarkdownText ?? null
    resolvedMdText = view
    if (view === null) console.warn('[width-slider] primitives 未导出 MarkdownText，文本降级为纯文本')
  } catch (err) {
    resolvedMdText = null
    console.warn('[width-slider] 未找到 @deepseek-ai/dsh-client-ui-primitives.MarkdownText（文本降级为纯文本）', err)
  }
  return resolvedMdText
}

// ── 模型控制标签剥离 ─────────────────────────────────────────────────
// 模型输出里会出现 xml 风格控制/分段标签（<review>/<think>/<answer> 等），
// 不属于 markdown，渲染前剥离标签本身、保留内部内容（不丢内容）。
const CONTROL_TAG_RE = /<\s*\/?\s*(?:think|review|answer)\s*>/gi

function stripControlTags(text: string): string {
  if (typeof text !== 'string' || text === '') return text
  return text.replace(CONTROL_TAG_RE, '')
}

/**
 * 思考通道 Markdown URL 净化：模型输出（可能受提示注入诱导）在推理里写
 * 链接/图片，只允许 http/https/锚点/相对目标；javascript: 等危险 scheme
 * 整块移除（图片）或退化为纯文本（链接）。正式回复文本不经此通道。
 */
function sanitizeMarkdownUrls(text: string): string {
  return text.replace(/!?\[([^\]]*)\]\(([^)]*)\)/g, (whole: string, label: string, url: string) => {
    const u = String(url).trim()
    const schemeMatch = u.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:/)
    if (schemeMatch && !/^https?:$/i.test(schemeMatch[0].slice(0, -1))) {
      return whole.startsWith('!') ? '' : String(label || '')
    }
    return whole
  })
}

// ── 文本渲染（官方 MarkdownText）────────────────────────────────────
// memo：流式渲染时内容未变的 block（同 key 复用实例）跳过 strip 与
// MarkdownText 重解析，减少每帧全量工作。
const TextRenderer = memo(function TextRenderer({
  text,
  sanitizeUrls = false,
  streaming = false,
}: { text: string; sanitizeUrls?: boolean; streaming?: boolean }) {
  const cleanText = stripControlTags(text)
  const finalText = sanitizeUrls ? sanitizeMarkdownUrls(cleanText) : cleanText
  const MarkdownText = resolveMarkdownText()
  if (MarkdownText !== null) return <MarkdownText text={finalText} streaming={streaming} />
  return <div className="dsh-ws-plain">{finalText}</div>
})

// ── 思考块：默认「思考完收起」行为 ──────────────────────────────────
// 行为语义（用户定制版固化）：
// - 生成中（running=true）强制展开，标题行不可收起（running 优先）；
// - 生成结束（running 变 false）自动收起为单行摘要；
// - 非生成中可点击标题行手动展开/收起；手动展开的块不会被自动收起，
//   直到下一次 running 结束。
// 未来「保持展开（上游语义）」模式由 collapseAfterRun=false 提供（M2 接线）。
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
  const finalText = sanitizeMarkdownUrls(cleanText)
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
  const summary = running ? latestLine(finalText) : firstLine(finalText)

  const primitives = resolvePrimitives()
  const DisclosureRow = primitives?.DisclosureRow
  const ThinkIcon = primitives?.IconThinkOutline14
  // 官方组件缺失时降级：直接显示纯文本正文，不影响内容可读性。
  if (!DisclosureRow) return <div className="dsh-ws-think-body">{finalText}</div>

  return (
    <div className="dsh-ws-think" data-variant="think" data-state={running ? 'running' : 'ok'}>
      <DisclosureRow
        icon={ThinkIcon ? <ThinkIcon size={14} /> : null}
        title={pickText('思考', 'Thinking')}
        open={open}
        expandable
        expandOnRowClick
        onToggle={() => setExpanded((v) => !v)}
        collapsedContent={
          <>
            <span className="dsh-ws-think-separator" aria-hidden="true" />
            <span className="dsh-ws-think-summary">{summary}</span>
          </>
        }
      >
        {/* 正文与官方 ReasoningRow 一致：纯文本（不渲染 Markdown）。 */}
        <div className="dsh-ws-think-body">{finalText}</div>
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

/** 渲染单个 block；不认识的块（tool-call 等）返回 null（由独立节点渲染）。 */
function renderBlock(
  blocks: unknown[],
  i: number,
  streaming: boolean,
  last: number,
  renderMessageImages?: (props: RenderMessageImagesProps) => ReactNode,
  collapseAfterRun?: boolean,
): ReactNode {
  const block = blocks[i] as { kind?: string; text?: unknown } | null | undefined
  if (!block) return null
  if (block.kind === 'text' && typeof block.text === 'string') {
    return <TextRenderer key={'t' + i} text={block.text} streaming={streaming && i === last} />
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
  return null
}

/** 渲染 blocks 全列表：返回元素数组；图片组只渲染一次（消费整组）。 */
function renderBlocks(
  blocks: unknown[],
  streaming: boolean,
  renderMessageImages?: (props: RenderMessageImagesProps) => ReactNode,
  collapseAfterRun?: boolean,
): ReactNode[] {
  const last = blocks.length - 1
  const rendered: ReactNode[] = []
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i] as { kind?: string } | null | undefined
    if (!block) continue
    const el = renderBlock(blocks, i, streaming, last, renderMessageImages, collapseAfterRun)
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

export function AssistantStepView({ node, renderMessageImages, collapseAfterRun = true }: AssistantStepViewProps) {
  const data = node && node.data ? node.data : null
  if (!data || !Array.isArray(data.blocks)) return null
  const streaming = data.status === 'running'
  const interrupted = data.status === 'interrupted'
  const rendered = renderBlocks(data.blocks, streaming, renderMessageImages, collapseAfterRun)
  if (interrupted) {
    rendered.push(<span key="stopped" className="dsh-ws-stopped">{pickText('已停止', 'Stopped')}</span>)
  }
  return (
    <div className="dsh-ws-assistant" data-streaming={streaming || undefined}>
      <div className="dsh-ws-assistant-body">{rendered}</div>
    </div>
  )
}