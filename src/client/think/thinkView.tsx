/**
 * thinkView.tsx — assistant-step 渲染器（收编自 dsh-think-zh-expand，MIT）。
 *
 * 来源：baosfeng/my-dsh-plugins → plugins/dsh-think-zh-expand/lib/parts/
 * assistant.part.js（上游 v0.4.7）。转写差异：
 * 1. TSX + tsdown 工程（上游为 React.createElement 手写拼接 parts）；
 * 2. 类名前缀 dsh-ws-（与上游 dsh-think-zh-expand- 互不干扰）；
 * 3. 行为默认「思考中展开、思考完自动收起」（上游为始终默认展开）；
 * 4. MarkdownView 经运行时 require('dsh-md-render') 解析（dsh.client.external
 *    声明保证其先加载），缺失时降级纯文本 pre-wrap，不抛错。
 *
 * 渲染契约：替换官方 conversation.chat.node 的 assistant-step 渲染器——
 * text 块与 reasoning 块统一走 MarkdownView；image 块相邻分组复用宿主
 * renderMessageImages；tool-call 块由独立节点渲染（返回 null）。
 */

import { memo, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'

// ── 思考块与 assistant 容器样式（DSH 语义 token，随激活注入）──────────
// 视觉基线：与官方 ReasoningRow 一致（头部 DisclosureRow 结构：leading
// 图标区 + 标题 + separator + 摘要；正文 tertiary 色、22px 缩进）。
// 思考正文经 MarkdownView 渲染后颜色跟随其官方默认（与正式回复一致）。
export const THINK_STYLES = `
.dsh-ws-assistant{display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);font-size:16px;line-height:28px}
.dsh-ws-assistant-body{display:flex;flex-direction:column;gap:16px}
.dsh-ws-think{display:flex;flex-direction:column;width:100%;min-width:0}
.dsh-ws-think-head{position:relative;overflow:hidden;display:flex;align-items:center;height:24px;min-width:0;cursor:pointer;user-select:none}
.dsh-ws-think-leading{position:relative;flex:none;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;margin-right:6px;padding:0;border:none;background:none;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.dsh-ws-think-icon{display:inline-flex;opacity:1;transition:opacity .1s ease}
.dsh-ws-think-head:hover .dsh-ws-think-icon{opacity:0}
.dsh-ws-think-chevron{display:inline-flex;color:var(--dsw-alias-label-secondary)}
.dsh-ws-think-chevron-hover{position:absolute;top:0;right:0;bottom:0;left:0;margin:auto;opacity:0;transition:opacity .1s ease}
.dsh-ws-think-head:hover .dsh-ws-think-chevron-hover{opacity:1}
.dsh-ws-think-title{flex:none;font-size:14px;line-height:24px;color:var(--dsw-alias-label-secondary)}
.dsh-ws-think-separator{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}
.dsh-ws-think-summary{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:auto;font-size:14px;line-height:24px;overflow:hidden}
.dsh-ws-think-body{white-space:pre-wrap;word-break:break-word;padding:4px 0 4px 22px;font-size:14px;line-height:24px;color:var(--dsw-alias-label-tertiary)}
.dsh-ws-plain{white-space:pre-wrap;word-break:break-word}
.dsh-ws-stopped{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);border-radius:6px;align-self:flex-start;padding:0 6px;font-size:11px;line-height:18px}
`

// ── MarkdownView 运行时解析（dsh-md-render 缺失时降级，不静态 import）──

type MarkdownViewComponent = ComponentType<{ text: string }>

let resolvedMdView: MarkdownViewComponent | null | undefined

/** 解析一次并缓存 dsh-md-render 的 MarkdownView；缺失/异常返回 null。 */
function resolveMarkdownView(): MarkdownViewComponent | null {
  if (resolvedMdView !== undefined) return resolvedMdView
  try {
    // require 来自 __ModuleLoader__ factory 注入的模块加载器（见 env.d.ts 声明）。
    const mod = (require('dsh-md-render') as {
      MarkdownView?: MarkdownViewComponent
      default?: { MarkdownView?: MarkdownViewComponent }
    })
    const view = mod?.MarkdownView ?? mod?.default?.MarkdownView ?? null
    resolvedMdView = view
    if (view === null) {
      console.warn('[width-slider] dsh-md-render 未导出 MarkdownView，思考块降级为纯文本')
    }
  } catch (err) {
    resolvedMdView = null
    console.warn('[width-slider] 未找到 dsh-md-render（思考块 Markdown 渲染降级为纯文本）', err)
  }
  return resolvedMdView
}

// ── 官方图标（对齐官方 ReasoningRow 的 14×14 fill 风格 path）─────────

/** 官方 IconChevronDownOutline14：折叠箭头（展开/收起态均为向下）。 */
function ChevronDownIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

/** 官方 IconThinkOutline14：收起态思考图标。 */
function ThinkIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7.06431 5.93342C7.68763 5.93342 8.19307 6.43904 8.19322 7.06233C8.19322 7.68573 7.68772 8.19123 7.06431 8.19123C6.44099 8.19113 5.9354 7.68567 5.9354 7.06233C5.93555 6.43911 6.44108 5.93353 7.06431 5.93342Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.6815 0.963693C10.1169 0.447019 11.6266 0.374829 12.5633 1.31135C13.5 2.24805 13.4277 3.75776 12.911 5.19319C12.7126 5.74431 12.4386 6.31796 12.0965 6.89729C12.4969 7.54638 12.8141 8.19018 13.036 8.80647C13.5527 10.2419 13.6251 11.7516 12.6883 12.6883C11.7516 13.625 10.242 13.5527 8.8065 13.036C8.19022 12.8141 7.54641 12.4969 6.89732 12.0965C6.31797 12.4386 5.74435 12.7125 5.19322 12.911C3.75777 13.4276 2.2481 13.5 1.31138 12.5633C0.374859 11.6266 0.447049 10.1168 0.963724 8.68147C1.17185 8.10338 1.46321 7.50063 1.82896 6.8924C1.52182 6.35711 1.27235 5.82825 1.08872 5.31819C0.572068 3.88278 0.499714 2.37306 1.43638 1.43635C2.37308 0.499655 3.8828 0.572044 5.31822 1.08869C5.82828 1.27232 6.35715 1.5218 6.89243 1.82893C7.50066 1.46318 8.10341 1.17181 8.6815 0.963693ZM11.3573 8.01154C10.9083 8.62253 10.3901 9.22873 9.80943 9.8094C9.22877 10.3901 8.62255 10.9083 8.01158 11.3572C8.4257 11.5841 8.8287 11.7688 9.21275 11.9071C10.5456 12.3868 11.4246 12.2547 11.8397 11.8397C12.2548 11.4246 12.3869 10.5456 11.9071 9.21272C11.7688 8.82866 11.5841 8.42568 11.3573 8.01154ZM2.56529 8.02912C2.37344 8.39322 2.21495 8.74796 2.09263 9.08772C1.61291 10.4204 1.74512 11.2995 2.16001 11.7147C2.57505 12.1297 3.45415 12.2618 4.78697 11.7821C5.11057 11.6656 5.44786 11.5164 5.7938 11.3367C5.249 10.9223 4.70922 10.4533 4.19029 9.9344C3.57578 9.31987 3.03169 8.67633 2.56529 8.02912ZM6.90708 3.2469C6.24065 3.70479 5.5646 4.26321 4.91392 4.91389C4.26325 5.56456 3.70482 6.24063 3.24693 6.90705C3.72674 7.63325 4.32777 8.37459 5.03892 9.08576C5.64943 9.69627 6.28183 10.2265 6.90806 10.6678C7.59368 10.2025 8.2908 9.63076 8.96079 8.96076C9.6308 8.29075 10.2025 7.59366 10.6678 6.90803C10.2265 6.2818 9.69631 5.6494 9.08579 5.03889C8.37462 4.32773 7.63328 3.72672 6.90708 3.2469ZM11.7147 2.15998C11.2996 1.74509 10.4204 1.61288 9.08775 2.0926C8.74835 2.21479 8.39382 2.37271 8.03013 2.56428C8.67728 3.03065 9.31995 3.5758 9.93443 4.19026C10.4534 4.7092 10.9223 5.24896 11.3368 5.79377C11.5164 5.44785 11.6656 5.11052 11.7821 4.78694C12.2618 3.45416 12.1297 2.57502 11.7147 2.15998ZM4.91197 2.2176C3.57922 1.73788 2.70004 1.86995 2.28501 2.28498C1.87001 2.70003 1.73791 3.5792 2.21763 4.91194C2.31709 5.18822 2.44112 5.47427 2.58677 5.7674C3.01931 5.1887 3.51474 4.6158 4.06529 4.06526C4.61584 3.5147 5.18872 3.01928 5.76743 2.58674C5.47431 2.4411 5.18824 2.31706 4.91197 2.2176Z"
        fill="currentColor"
      />
    </svg>
  )
}

// ── 模型控制标签剥离 ─────────────────────────────────────────────────
// 模型输出里会出现 xml 风格控制/分段标签（<review>/<think>/<answer> 等），
// 不属于 markdown，渲染前剥离标签本身、保留内部内容（不丢内容）。
const CONTROL_TAG_RE = /<\s*\/?\s*(?:think|review|answer)\s*>/gi

function stripControlTags(text: string): string {
  if (typeof text !== 'string' || text === '') return text
  return text.replace(CONTROL_TAG_RE, '')
}

// ── 文本渲染（Markdown 或降级纯文本）────────────────────────────────
// memo：流式渲染时内容未变的 block（同 key 复用实例）跳过 strip 与
// MarkdownView 重解析，减少每帧全量工作。
const TextRenderer = memo(function TextRenderer({ text }: { text: string }) {
  const cleanText = stripControlTags(text)
  const MarkdownView = resolveMarkdownView()
  if (MarkdownView !== null) return <MarkdownView text={cleanText} />
  return <div className="dsh-ws-plain">{cleanText}</div>
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

  const firstLine = (t: string): string => {
    const nl = t.indexOf('\n')
    return nl === -1 ? t : t.slice(0, nl)
  }

  return (
    <div className="dsh-ws-think" data-variant="think" data-state={running ? 'running' : 'ok'}>
      <div
        className="dsh-ws-think-head"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setExpanded((v) => !v)
          }
        }}
      >
        <span className="dsh-ws-think-leading">
          {open ? (
            <span className="dsh-ws-think-chevron"><ChevronDownIcon size={14} /></span>
          ) : (
            <>
              <span className="dsh-ws-think-icon"><ThinkIcon size={14} /></span>
              <span className="dsh-ws-think-chevron dsh-ws-think-chevron-hover"><ChevronDownIcon size={14} /></span>
            </>
          )}
        </span>
        <span className="dsh-ws-think-title">思考</span>
        {!open && (
          <>
            <span className="dsh-ws-think-separator" aria-hidden="true" />
            <span className="dsh-ws-think-summary">{firstLine(cleanText)}</span>
          </>
        )}
      </div>
      {open && (
        <div className="dsh-ws-think-body">
          <TextRenderer text={cleanText} />
        </div>
      )}
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
    return <TextRenderer key={'t' + i} text={block.text} />
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
    rendered.push(<span key="stopped" className="dsh-ws-stopped">已停止</span>)
  }
  return (
    <div className="dsh-ws-assistant" data-streaming={streaming || undefined}>
      <div className="dsh-ws-assistant-body">{rendered}</div>
    </div>
  )
}
