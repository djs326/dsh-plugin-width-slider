export interface WidthSliderKey {
  label: string
  unit: string
  previewHint: string
  info: string
  followLabel: string
  followInfo: string
  // ── v0.3.0 总控页 ──
  groupWidth: string
  enableWidth: string
  enableWidthInfo: string
  groupThink: string
  enableThink: string
  enableThinkInfo: string
  thinkModeLabel: string
  thinkModeAuto: string
  thinkModeAutoInfo: string
  thinkModeKeep: string
  thinkModeKeepInfo: string
  groupLanguage: string
  enableChinese: string
  enableChineseInfo: string
  groupUi: string
  enableLocalize: string
  enableLocalizeInfo: string
  enableResize: string
  enableResizeInfo: string
  dialogAdaptiveInfo: string
  enableNavScroll: string
  enableNavScrollInfo: string
  disabledHint: string
  sessionDeleteLabel: string
  sessionDeleteInfo: string
  groupWorkspace: string
  enableWsTabs: string
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
  shortLocalize: string
  shortResize: string
  shortDialogAdaptive: string
  shortNavScroll: string
  shortSessionDelete: string
  shortWorkspaceTabs: string
  // ── v0.8.0 动效组（整合自 dsh-client-ui-custom；设置值存本插件 settings.json）──
  groupMotion: string
  motionTranscript: string
  motionSidebar: string
  motionNewChat: string
  motionSettings: string
  motionTranscriptInfo: string
  motionSidebarInfo: string
  motionNewChatInfo: string
  motionSettingsInfo: string
  motionRole: string
  motionRoleInfo: string
  motionStyleTranscriptInfo: string
  motionStyleSidebarInfo: string
  motionStyleNewChatInfo: string
  motionPreset: string
  motionPresetFluid: string
  motionPresetElegant: string
  motionPresetMinimal: string
  motionPresetFluidInfo: string
  motionPresetElegantInfo: string
  motionPresetMinimalInfo: string
  styleFadeUp: string
  styleFade: string
  styleRiseScale: string
  styleSlideIn: string
  styleBlurIn: string
  styleScaleIn: string
  styleSlideLeft: string
  styleExpand: string
  styleSlideDown: string
  styleReveal: string
  styleBloom: string
  styleZoom: string
}

const zh: Record<keyof WidthSliderKey, string> = {
  label: '对话宽度',
  unit: 'px',
  previewHint: '预览模式 · 松开返回设置',
  info: '拖动滑块调整对话内容区域宽度。按下滑块即进入全屏预览模式，仅显示滑块，方便查看宽度变化效果。',
  followLabel: '跟随窗口宽度',
  followInfo: '已开启跟随窗口：对话内容宽度自动等于对话列宽度，窗口放大缩小对话内容实时跟随。手动拖动调节在跟随模式下不可用，关闭后恢复滑块调节。',
  groupWidth: '对话宽度滑块',
  enableWidth: '启用对话宽度滑块',
  enableWidthInfo: '关闭后恢复官方原生宽度拖拽手柄（手柄隐藏样式联动停用）。',
  groupThink: '思考块',
  enableThink: '思考块增强渲染',
  enableThinkInfo: '思考块展开/收起交互的总开关；头部与正文外观同官方（思考正文为纯文本），正式回复走官方 Markdown 渲染、不接管围栏（genui / mermaid 等插件照常工作）。关闭本项回退官方默认的单行折叠显示。',
  thinkModeLabel: '思考块显示方式',
  thinkModeAuto: '思考完自动收起',
  thinkModeAutoInfo: '生成中强制展开，思考结束自动收起为单行摘要，点击可再展开。',
  thinkModeKeep: '始终展开',
  thinkModeKeepInfo: '默认展开，可点击收起（与上游 dsh-think-zh-expand 默认行为一致）。',
  groupLanguage: '输出语言',
  enableChinese: '思考/回复强制中文',
  enableChineseInfo: '向模型注入最高优先级的语言规则：无论提问语言，思考过程与回复均使用简体中文（代码与术语保持原文）。',
  groupUi: '界面',
  enableLocalize: '界面英文中文化',
  enableLocalizeInfo: '把官方界面残留的硬编码英文标签替换为中文（如 Tool Call→工具调用、Thinking→思考）。',
  enableResize: '设置弹窗可拖拽（窗口化）',
  enableResizeInfo: '官方设置弹窗变普通窗口：没动过时保持官方尺寸与居中位置（并随窗口大小自动适配）；右下角把手拖宽高、顶部空白拖动移动，双击把手复位为官方尺寸与位置；尺寸与位置会被记住。',
  dialogAdaptiveInfo: '弹窗尺寸改按窗口比例自适应（宽 62%、高 82%，并留出视口边距），窗口缩放时弹窗跟着缩放；只改外框、不缩放内容与字号。开启后不再是官方 800px 尺寸，也不能手动拖拽改尺寸（位置仍可拖）。',
  enableNavScroll: '设置左侧 tab 栏超高滚动',
  enableNavScrollInfo: '设置面板左侧功能列表条目过多时出现纵向滚动条，不再被挤压截断。',
  disabledHint: '该功能已关闭，开启后可用。',
  sessionDeleteLabel: '会话删除（⋯ 菜单）',
  sessionDeleteInfo: '会话条目 "⋯" 菜单新增"删除会话"项：删除前二次确认，永久删除该会话及全部数据，不可恢复。',
  groupWorkspace: '工作区分页',
  enableWsTabs: '启用工作区分页（页签栏）',
  enableWsTabsInfo: '侧栏「工作区」标题位置改为分组页签：固定「默认」显示未分组的直属工作区与官方未分组会话；点右侧＋新建分组页签（文件夹）并命名；工作区行的操作菜单新增四字项「分配标签」，可把该工作区放进任意页签或移回默认；在其他页签新建工作区会自动归入当前页签；删除页签时其中工作区自动回到默认。',
  resetAllLabel: '恢复默认设置',
  resetAllInfo: '重置全部开关与记忆（宽度、弹窗宽度），刷新后生效。',
  pageTitle: '宽度滑块与界面增强',
  pageSubtitle: '15 项开关 · 改动即时生效',
  groupWidthShort: '对话宽度',
  groupThinkOutput: '思考与输出',
  shortEnableWidth: '启用对话宽度滑块',
  shortThink: '思考块增强渲染',
  shortChinese: '思考/回复强制中文',
  shortLocalize: '界面中文化',
  shortResize: '弹窗可拖拽',
  shortDialogAdaptive: '弹窗按比例跟随',
  shortNavScroll: 'tab 栏滚动',
  shortSessionDelete: '会话删除',
  shortWorkspaceTabs: '工作区分页',
  groupMotion: '动效',
  motionTranscript: '对话入场',
  motionSidebar: '侧边栏',
  motionNewChat: '新建对话',
  motionSettings: '设置界面',
  motionTranscriptInfo: '载入或切换对话时，消息以动效出现而不是瞬间跳出；关闭后恢复原生表现。',
  motionSidebarInfo: '打开 Web 时侧边栏树逐项出现，展开工作区时对话框浮现。',
  motionNewChatInfo: '新建对话时，欢迎界面和输入区淡入出现。',
  motionSettingsInfo: '打开设置时面板从设置按钮处展开，切换左侧标签时页面内容淡入，关闭时面板缩回。',
  motionRole: '按角色入场',
  motionRoleInfo: '用户消息从侧面滑入、助手正文用上面选择的样式、工具与系统行只做轻微淡入——不再所有内容共用同一种入场。',
  motionStyleTranscriptInfo: '对话内容的出现方式。',
  motionStyleSidebarInfo: '侧边栏会话树的出现方式，与对话动效独立选择。',
  motionStyleNewChatInfo: '新建对话时欢迎界面的出现方式。',
  motionPreset: '预设',
  motionPresetFluid: '流畅',
  motionPresetElegant: '优雅',
  motionPresetMinimal: '极简',
  motionPresetFluidInfo: '层叠上浮与滑动，明快活泼。',
  motionPresetElegantInfo: '柔和模糊与绽放，安静高级。',
  motionPresetMinimalInfo: '仅保留轻微淡入，近乎无感。',
  styleFadeUp: '淡入上浮',
  styleFade: '轻柔淡入',
  styleRiseScale: '上浮放大',
  styleSlideIn: '右侧滑入',
  styleBlurIn: '模糊显影',
  styleScaleIn: '轻盈缩放',
  styleSlideLeft: '左侧滑入',
  styleExpand: '纵向展开',
  styleSlideDown: '自上而下',
  styleReveal: '轻柔显影',
  styleBloom: '柔和绽放',
  styleZoom: '柔和缩放',
}

const en: Record<keyof WidthSliderKey, string> = {
  label: 'Conversation Width',
  unit: 'px',
  previewHint: 'Preview mode · release to return',
  info: 'Drag the slider to adjust the conversation content width. Press the slider to enter full-screen preview with only the slider visible.',
  followLabel: 'Follow window width',
  followInfo: 'Follow mode on: the conversation content width tracks the conversation column and rescales live with the window. Manual drag is disabled until you turn this off.',
  groupWidth: 'Conversation width slider',
  enableWidth: 'Enable conversation width slider',
  enableWidthInfo: 'Turning off restores the native width drag handles (handle-hiding style is removed too).',
  groupThink: 'Thinking blocks',
  enableThink: 'Enhanced thinking block rendering',
  enableThinkInfo: 'Master toggle for thinking block expand/collapse. Header and body match the official look (thinking body is plain text); reply text uses the official Markdown pipeline and fences are left to genui / mermaid plugins. Off falls back to the built-in single-line collapsed view.',
  thinkModeLabel: 'Thinking block mode',
  thinkModeAuto: 'Collapse after generation',
  thinkModeAutoInfo: 'Force-expanded while streaming; auto-collapses to a one-line summary when generation finishes; click to expand again.',
  thinkModeKeep: 'Keep expanded',
  thinkModeKeepInfo: 'Expanded by default, click to collapse (same as upstream dsh-think-zh-expand default).',
  groupLanguage: 'Output language',
  enableChinese: 'Force Chinese in thinking and replies',
  enableChineseInfo: 'Injects a top-priority language rule: thinking and replies are always in Simplified Chinese regardless of the question language (code and terms stay verbatim).',
  groupUi: 'Interface',
  enableLocalize: 'Localize interface labels to Chinese',
  enableLocalizeInfo: 'Replaces leftover hard-coded English UI labels with Chinese (Tool Call to 工具调用, Thinking to 思考, etc.).',
  enableResize: 'Draggable settings dialog',
  enableResizeInfo: 'Turns the official settings dialog into a window: untouched it keeps the official size and centered position (and adapts to the window); drag the bottom-right grip to resize, drag the header to move, double-click the grip to reset to the official size and position; size and position are remembered.',
  dialogAdaptiveInfo: 'Sizes the dialog by the window ratio instead (62% width, 82% height, minus viewport margins), so it scales with the window; only the box changes, never content or font size. It no longer matches the official 800px size and cannot be resized by dragging (moving still works).',
  enableNavScroll: 'Scrollable settings nav when tabs overflow',
  enableNavScrollInfo: 'Adds a vertical scrollbar to the left settings nav when there are too many entries, instead of squeezing them.',
  disabledHint: 'This feature is off; enable it to use.',
  sessionDeleteLabel: 'Session delete (⋯ menu)',
  sessionDeleteInfo: 'Adds "Delete session" to the session row "⋯" menu: double confirmation first, permanently removes the session and all its data.',
  groupWorkspace: 'Workspace tabs',
  enableWsTabs: 'Enable workspace tabs',
  enableWsTabsInfo: 'Turns the sidebar Workspaces heading into group tabs: a fixed Default tab shows direct workspaces and ungrouped sessions; use ＋ to create named group tabs (folders); each workspace row menu gains a four-character Assign tag item to move it into any tab or back to Default; a workspace created while on another tab joins that tab automatically; deleting a tab moves its workspaces back to Default.',
  resetAllLabel: 'Reset all settings',
  resetAllInfo: 'Resets every toggle and stored widths; page refresh applies.',
  pageTitle: 'Width slider & interface enhancements',
  pageSubtitle: '15 switches · changes apply instantly',
  groupWidthShort: 'Conversation width',
  groupThinkOutput: 'Thinking & output',
  shortEnableWidth: 'Conversation width slider',
  shortThink: 'Thinking block rendering',
  shortChinese: 'Force Chinese output',
  shortLocalize: 'Localize interface',
  shortResize: 'Draggable dialog',
  shortDialogAdaptive: 'Dialog follows window',
  shortNavScroll: 'Scrollable nav',
  shortSessionDelete: 'Session delete',
  shortWorkspaceTabs: 'Workspace tabs',
  groupMotion: 'Motion',
  motionTranscript: 'Conversation entrance',
  motionSidebar: 'Sidebar',
  motionNewChat: 'New conversation',
  motionSettings: 'Settings panel',
  motionTranscriptInfo: 'Messages arrive with a motion effect when a conversation loads or switches; off restores the stock behavior.',
  motionSidebarInfo: 'The sidebar tree cascades in on web load; workspace rows fade in when their group expands.',
  motionNewChatInfo: 'A brand-new conversation welcome dialog and composer fade in.',
  motionSettingsInfo: 'The settings dialog grows out of the settings button, page content fades in on nav switch, and the panel shrinks back on close.',
  motionRole: 'Arrive by role',
  motionRoleInfo: 'Your messages slide in from the side, assistant prose uses the style above, and tool or system rows settle in lightly — instead of every row sharing one entrance.',
  motionStyleTranscriptInfo: 'How conversation content arrives.',
  motionStyleSidebarInfo: 'How the sidebar session tree arrives, independent of the transcript style.',
  motionStyleNewChatInfo: 'How the welcome dialog of a new conversation arrives.',
  motionPreset: 'Presets',
  motionPresetFluid: 'Fluid',
  motionPresetElegant: 'Elegant',
  motionPresetMinimal: 'Minimal',
  motionPresetFluidInfo: 'Cascading rise and slide, bright and lively.',
  motionPresetElegantInfo: 'Soft blur and bloom, quiet and refined.',
  motionPresetMinimalInfo: 'Barely-there fades only, almost imperceptible.',
  styleFadeUp: 'Fade up',
  styleFade: 'Gentle fade',
  styleRiseScale: 'Rise and scale',
  styleSlideIn: 'Slide in',
  styleBlurIn: 'Blur in',
  styleScaleIn: 'Gentle scale',
  styleSlideLeft: 'Slide in from left',
  styleExpand: 'Expand',
  styleSlideDown: 'Drop in',
  styleReveal: 'Soft reveal',
  styleBloom: 'Gentle bloom',
  styleZoom: 'Soft zoom',
}

export { zh, en }
