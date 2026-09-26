export interface WidthSliderKey {
  label: string
  unit: string
  previewHint: string
  info: string
  followLabel: string
  sliderAria: string
  followInfo: string
  // ── v0.3.0 总控页 ──
  enableWidthInfo: string
  enableThinkInfo: string
  thinkModeLabel: string
  thinkModeAuto: string
  thinkModeAutoInfo: string
  thinkModeKeep: string
  thinkModeKeepInfo: string
  enableChineseInfo: string
  groupUi: string
  enableResizeInfo: string
  dialogAdaptiveInfo: string
  enableNavScrollInfo: string
  disabledHint: string
  sessionDeleteInfo: string
  enableWsTabsInfo: string
  resetAllLabel: string
  resetAllInfo: string
  // ── v0.7.0 紧凑单行排版 ──
  pageTitle: string
  pageSubtitle: string
  groupWidthShort: string
  groupThinkOutput: string
  shortEnableWidth: string
  shortThink: string
  shortChinese: string
  shortResize: string
  shortDialogAdaptive: string
  shortNavScroll: string
  shortSessionDelete: string
  shortWorkspaceTabs: string
  sidebarToolsMerge: string
  sidebarToolsMergeInfo: string
  // ── v0.8.0 动效组（整合自 dsh-client-ui-custom；设置值存本插件 settings.json）──
  groupMotion: string
  // ── v2.0.0 动效重做：总闸 + 一块预览 + 四张风格卡 ──
  /** 动效模式（三态分段控件的无障碍标签；页面上这一行不再另起标签）。 */
  motionMode: string
  motionModeOff: string
  motionModeSystem: string
  motionModeOn: string
  motionModeOffInfo: string
  motionModeSystemInfo: string
  motionModeOnInfo: string
  /** 总闸关闭时，风格区下方的一行说明。 */
  motionInactiveHint: string
  /** 预览区的小标题。 */
  motionPreviewLabel: string
  /** 预览区的重播按钮。 */
  motionPreviewReplay: string
  /** 预览区里那条模拟消息的正文（占位，只为让入场看得出方向）。 */
  motionPreviewMessage: string
  /** 预览区里那条模拟侧栏项的正文（占位）。 */
  motionPreviewSidebar: string
  /** 风格区的行标签。 */
  motionPreset: string
  motionLookSoft: string
  motionLookRise: string
  motionLookGlide: string
  motionLookVeil: string
  motionLookSoftInfo: string
  motionLookRiseInfo: string
  motionLookGlideInfo: string
  motionLookVeilInfo: string
}

const zh: Record<keyof WidthSliderKey, string> = {
  label: '对话宽度',
  unit: 'px',
  previewHint: '预览模式 · 松开返回设置',
  info: '拖动滑块调整对话内容区域宽度。按下滑块即进入全屏预览模式，仅显示滑块，方便查看宽度变化效果。',
  followLabel: '跟随窗口宽度',
  sliderAria: '对话宽度滑块：方向键微调（Shift 加速），Home / End 到两端',
  followInfo: '已开启跟随窗口：对话内容宽度自动等于对话列宽度，窗口放大缩小对话内容实时跟随。手动拖动调节在跟随模式下不可用，关闭后恢复滑块调节。',
  enableWidthInfo: '关闭后恢复官方原生宽度拖拽手柄（手柄隐藏样式联动停用）。',
  enableThinkInfo: '思考块展开/收起交互的总开关；头部与正文外观同官方（思考正文为纯文本），正式回复走官方 Markdown 渲染、不接管围栏（genui / mermaid 等插件照常工作）。关闭本项回退官方默认的单行折叠显示。',
  thinkModeLabel: '思考块显示方式',
  thinkModeAuto: '思考完自动收起',
  thinkModeAutoInfo: '生成中强制展开，思考结束自动收起为单行摘要，点击可再展开。',
  thinkModeKeep: '始终展开',
  thinkModeKeepInfo: '默认展开，可点击收起（与上游 dsh-think-zh-expand 默认行为一致）。',
  enableChineseInfo: '向模型注入最高优先级的语言规则：无论提问语言，思考过程与回复均使用简体中文（代码与术语保持原文）。',
  groupUi: '界面',
  enableResizeInfo: '官方设置弹窗变普通窗口：没动过时保持官方尺寸与居中位置（并随窗口大小自动适配）；右下角把手拖宽高、顶部空白拖动移动，双击把手复位为官方尺寸与位置；尺寸与位置会被记住。',
  dialogAdaptiveInfo: '弹窗尺寸改按窗口比例自适应（宽 62%、高 82%，并留出视口边距），窗口缩放时弹窗跟着缩放；只改外框、不缩放内容与字号。开启后不再是官方 800px 尺寸，也不能手动拖拽改尺寸（位置仍可拖）。',
  enableNavScrollInfo: '设置面板左侧功能列表条目过多时出现纵向滚动条，不再被挤压截断。',
  disabledHint: '该功能已关闭，开启后可用。',
  sessionDeleteInfo: '会话条目 "⋯" 菜单新增"删除会话"项：删除前二次确认，永久删除该会话及全部数据，不可恢复。',
  enableWsTabsInfo: '侧栏「工作区」标题位置改为分组页签：固定「默认」显示未分组的直属工作区与官方未分组会话；点右侧＋新建分组页签（文件夹）并命名；工作区行的操作菜单新增四字项「分配标签」，可把该工作区放进任意页签或移回默认；在其他页签新建工作区会自动归入当前页签；删除页签时其中工作区自动回到默认。',
  resetAllLabel: '恢复默认设置',
  resetAllInfo: '重置全部开关与记忆（宽度、弹窗宽度），刷新后生效。',
  pageTitle: '宽度滑块与界面增强',
  pageSubtitle: '12 项开关 · 改动即时生效',
  groupWidthShort: '对话宽度',
  groupThinkOutput: '思考与输出',
  shortEnableWidth: '启用对话宽度滑块',
  shortThink: '思考块增强渲染',
  shortChinese: '思考/回复强制中文',
  shortResize: '弹窗可拖拽',
  shortDialogAdaptive: '弹窗按比例跟随',
  shortNavScroll: 'tab 栏滚动',
  shortSessionDelete: '会话删除',
  shortWorkspaceTabs: '工作区分页',
  sidebarToolsMerge: '工具按钮并入新会话',
  sidebarToolsMergeInfo: '把工作区标题行右侧的「搜索会话 / 视图选项 / 添加工作区」三个按钮移到「新建会话」旁边，页签行因此独占整行宽度。关闭后三个按钮回到工作区标题行。',
  groupMotion: '动效',
  motionMode: '动效模式',
  motionModeOff: '关闭',
  motionModeSystem: '跟随系统',
  motionModeOn: '开启',
  motionModeOffInfo: '关闭全部界面动效，界面表现与官方一致。',
  motionModeSystemInfo: '跟随操作系统的「减少动态效果」设置：系统要求减少动态时自动不播放动效。',
  motionModeOnInfo: '始终播放动效，不理会系统的减少动态设置。',
  motionInactiveHint: '动效已关闭。选「跟随系统」或「开启」后就能挑风格了。',
  motionPreviewLabel: '预览',
  motionPreviewReplay: '再看一遍',
  motionPreviewMessage: '消息在这里出现',
  motionPreviewSidebar: '会话',
  motionPreset: '风格',
  motionLookSoft: '轻柔',
  motionLookRise: '上浮',
  motionLookGlide: '滑入',
  motionLookVeil: '显影',
  motionLookSoftInfo: '只有淡入淡出，不做位移与缩放。',
  motionLookRiseInfo: '内容从下方轻轻浮起并落定。',
  motionLookGlideInfo: '内容从侧面滑入，方向明确。',
  motionLookVeilInfo: '由模糊到清晰，像表面自己成形。',
}

const en: Record<keyof WidthSliderKey, string> = {
  label: 'Conversation Width',
  unit: 'px',
  previewHint: 'Preview mode · release to return',
  info: 'Drag the slider to adjust the conversation content width. Press the slider to enter full-screen preview with only the slider visible.',
  followLabel: 'Follow window width',
  sliderAria: 'Conversation width slider: arrow keys to fine-tune (Shift for larger steps), Home / End for the ends',
  followInfo: 'Follow mode on: the conversation content width tracks the conversation column and rescales live with the window. Manual drag is disabled until you turn this off.',
  enableWidthInfo: 'Turning off restores the native width drag handles (handle-hiding style is removed too).',
  enableThinkInfo: 'Master toggle for thinking block expand/collapse. Header and body match the official look (thinking body is plain text); reply text uses the official Markdown pipeline and fences are left to genui / mermaid plugins. Off falls back to the built-in single-line collapsed view.',
  thinkModeLabel: 'Thinking block mode',
  thinkModeAuto: 'Collapse after generation',
  thinkModeAutoInfo: 'Force-expanded while streaming; auto-collapses to a one-line summary when generation finishes; click to expand again.',
  thinkModeKeep: 'Keep expanded',
  thinkModeKeepInfo: 'Expanded by default, click to collapse (same as upstream dsh-think-zh-expand default).',
  enableChineseInfo: 'Injects a top-priority language rule: thinking and replies are always in Simplified Chinese regardless of the question language (code and terms stay verbatim).',
  groupUi: 'Interface',
  enableResizeInfo: 'Turns the official settings dialog into a window: untouched it keeps the official size and centered position (and adapts to the window); drag the bottom-right grip to resize, drag the header to move, double-click the grip to reset to the official size and position; size and position are remembered.',
  dialogAdaptiveInfo: 'Sizes the dialog by the window ratio instead (62% width, 82% height, minus viewport margins), so it scales with the window; only the box changes, never content or font size. It no longer matches the official 800px size and cannot be resized by dragging (moving still works).',
  enableNavScrollInfo: 'Adds a vertical scrollbar to the left settings nav when there are too many entries, instead of squeezing them.',
  disabledHint: 'This feature is off; enable it to use.',
  sessionDeleteInfo: 'Adds "Delete session" to the session row "⋯" menu: double confirmation first, permanently removes the session and all its data.',
  enableWsTabsInfo: 'Turns the sidebar Workspaces heading into group tabs: a fixed Default tab shows direct workspaces and ungrouped sessions; use ＋ to create named group tabs (folders); each workspace row menu gains a four-character Assign tag item to move it into any tab or back to Default; a workspace created while on another tab joins that tab automatically; deleting a tab moves its workspaces back to Default.',
  resetAllLabel: 'Reset all settings',
  resetAllInfo: 'Resets every toggle and stored widths; page refresh applies.',
  pageTitle: 'Width slider & interface enhancements',
  pageSubtitle: '12 switches · changes apply instantly',
  groupWidthShort: 'Conversation width',
  groupThinkOutput: 'Thinking & output',
  shortEnableWidth: 'Conversation width slider',
  shortThink: 'Thinking block rendering',
  shortChinese: 'Force Chinese output',
  shortResize: 'Draggable dialog',
  shortDialogAdaptive: 'Dialog follows window',
  shortNavScroll: 'Scrollable nav',
  shortSessionDelete: 'Session delete',
  shortWorkspaceTabs: 'Workspace tabs',
  sidebarToolsMerge: 'Merge toolbar into New chat',
  sidebarToolsMergeInfo: 'Moves the Search, View options and Add workspace buttons from the workspace header next to New chat, so the tab row gets the full width. Turning it off puts the three buttons back on the workspace header.',
  groupMotion: 'Motion',
  motionMode: 'Motion mode',
  motionModeOff: 'Off',
  motionModeSystem: 'System',
  motionModeOn: 'On',
  motionModeOffInfo: 'Turns every interface animation off; the UI behaves exactly like the stock app.',
  motionModeSystemInfo: 'Follows the operating system "reduce motion" setting: animations stay off while the system asks for reduced motion.',
  motionModeOnInfo: 'Always plays animations, ignoring the system reduce-motion setting.',
  motionInactiveHint: 'Motion is off. Pick System or On to choose a style.',
  motionPreviewLabel: 'Preview',
  motionPreviewReplay: 'Replay',
  motionPreviewMessage: 'A message arrives here',
  motionPreviewSidebar: 'Session',
  motionPreset: 'Style',
  motionLookSoft: 'Soft',
  motionLookRise: 'Rise',
  motionLookGlide: 'Glide',
  motionLookVeil: 'Veil',
  motionLookSoftInfo: 'Opacity only — no travel and no scale.',
  motionLookRiseInfo: 'Content floats up from below and settles.',
  motionLookGlideInfo: 'Content slides in from the side, clearly directional.',
  motionLookVeilInfo: 'Sharpening out of blur, as if the surface formed itself.',
}

export { zh, en }
