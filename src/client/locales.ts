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
  enableNavScroll: string
  enableNavScrollInfo: string
  disabledHint: string
  // ── v0.4.0 Open With（整合自 dsh-plugin-open-with）──
  owTooltip: string
  owPickerAria: string
  owMenuAria: string
  owTargetCode: string
  owGroupTitle: string
  owSettingsLabel: string
  owSettingsInfo: string
  owButtonLabel: string
  owButtonInfo: string
  'settings.preset.title': string
  'settings.current.title': string
  'settings.dragTip': string
  'settings.hide': string
  'settings.show': string
  'settings.custom.title': string
  'settings.custom.add': string
  'settings.custom.namePlaceholder': string
  'settings.custom.pathPlaceholder': string
  'settings.noCustom': string
  'settings.edit': string
  'settings.delete': string
  'settings.cancel': string
  'settings.save': string
  'settings.form.nameRequired': string
  'settings.form.pathRequired': string
  'settings.form.exeOnly': string
  owEmptyMenu: string
  owNoCwdTip: string
  sessionDeleteLabel: string
  sessionDeleteInfo: string
  groupWorkspace: string
  enableWsTabs: string
  enableWsTabsInfo: string
  resetAllLabel: string
  resetAllInfo: string
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
  enableThinkInfo: '思考块展开/收起交互的总开关；正文与思考内容走官方 Markdown 渲染（不接管围栏，genui / mermaid 等插件照常工作）。关闭本项回退官方默认的单行折叠显示。',
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
  enableResizeInfo: '官方设置弹窗变普通窗口：右下角把手拖宽高、顶部空白拖动移动，双击把手复位 800×800 居中；尺寸与位置会被记住。',
  enableNavScroll: '设置左侧 tab 栏超高滚动',
  enableNavScrollInfo: '设置面板左侧功能列表条目过多时出现纵向滚动条，不再被挤压截断。',
  disabledHint: '该功能已关闭，开启后可用。',
  owTooltip: '在 VS Code、终端或文件管理器中打开工作区',
  owPickerAria: '选择要用来打开工作区的应用',
  owMenuAria: '打开方式',
  owTargetCode: '打开 VS Code',
  owGroupTitle: '打开方式',
  owSettingsLabel: 'Open With 设置',
  owSettingsInfo: '管理预设/自定义打开项：排序、设为当前、隐藏、添加/编辑/删除（写入本机设置）。',
  owButtonLabel: '启用头部打开按钮',
  owButtonInfo: '对话头部显示胶囊按钮（当前打开项 + 下拉切换），点击在当前会话目录启动。',
  'settings.preset.title': '预设项',
  'settings.current.title': '当前项',
  'settings.dragTip': '拖动以调整排序',
  'settings.hide': '在胶囊中隐藏',
  'settings.show': '在胶囊中显示',
  'settings.custom.title': '自定义',
  'settings.custom.add': '添加',
  'settings.custom.namePlaceholder': '应用名称',
  'settings.custom.pathPlaceholder': '可执行文件路径 (.exe)',
  'settings.noCustom': '暂无自定义项',
  'settings.edit': '编辑',
  'settings.delete': '删除',
  'settings.cancel': '取消',
  'settings.save': '保存',
  'settings.form.nameRequired': '请输入应用名称',
  'settings.form.pathRequired': '请输入可执行文件路径',
  'settings.form.exeOnly': '仅支持 .exe / .com 可执行文件（直接启动，不经 cmd）',
  owEmptyMenu: '没有可见的打开项（全部已隐藏），可到设置中调整',
  owNoCwdTip: '当前会话没有文件夹（无法在此打开）',
  sessionDeleteLabel: '会话删除（⋯ 菜单）',
  sessionDeleteInfo: '会话条目 "⋯" 菜单新增"删除会话"项：删除前二次确认，永久删除该会话及全部数据，不可恢复。',
  groupWorkspace: '工作区分页',
  enableWsTabs: '启用工作区分页（页签栏）',
  enableWsTabsInfo: '侧栏「工作区」标题位置改为分组页签：固定「默认」显示未分组的直属工作区与官方未分组会话；点右侧＋新建分组页签（文件夹）并命名；工作区行的操作菜单新增四字项「分配标签」，可把该工作区放进任意页签或移回默认；在其他页签新建工作区会自动归入当前页签；删除页签时其中工作区自动回到默认。',
  resetAllLabel: '恢复默认设置',
  resetAllInfo: '重置全部开关与记忆（宽度、弹窗宽度），刷新后生效。',
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
  enableThinkInfo: 'Master toggle for thinking block expand/collapse. Body and thinking text render through the official Markdown pipeline (fences are left to genui / mermaid plugins). Off falls back to the built-in single-line collapsed view.',
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
  enableResizeInfo: 'Turns the official settings dialog into a window: drag the bottom-right grip to resize, drag the header to move, double-click the grip to reset to 800x800 centered; size and position are remembered.',
  enableNavScroll: 'Scrollable settings nav when tabs overflow',
  enableNavScrollInfo: 'Adds a vertical scrollbar to the left settings nav when there are too many entries, instead of squeezing them.',
  disabledHint: 'This feature is off; enable it to use.',
  owTooltip: 'Open the workspace in VS Code, terminal or file manager',
  owPickerAria: 'Choose an application to open the workspace',
  owMenuAria: 'Open with',
  owTargetCode: 'Open VS Code',
  owGroupTitle: 'Open With',
  owSettingsLabel: 'Open With settings',
  owSettingsInfo: 'Manage preset/custom open targets: reorder, set current, hide, add/edit/delete (persisted on this machine).',
  owButtonLabel: 'Enable header open button',
  owButtonInfo: 'Shows the capsule button in the conversation header (current target + dropdown), launching in the current session folder.',
  'settings.preset.title': 'Presets',
  'settings.current.title': 'Current',
  'settings.dragTip': 'Drag to reorder',
  'settings.hide': 'Hide from capsule',
  'settings.show': 'Show in capsule',
  'settings.custom.title': 'Custom',
  'settings.custom.add': 'Add',
  'settings.custom.namePlaceholder': 'App name',
  'settings.custom.pathPlaceholder': 'Executable path (.exe)',
  'settings.noCustom': 'No custom items yet',
  'settings.edit': 'Edit',
  'settings.delete': 'Delete',
  'settings.cancel': 'Cancel',
  'settings.save': 'Save',
  'settings.form.nameRequired': 'Please enter an app name',
  'settings.form.pathRequired': 'Please enter an executable path',
  'settings.form.exeOnly': 'Only .exe / .com executables are supported (launched directly, not through cmd)',
  owEmptyMenu: 'No visible open targets (all hidden); adjust in settings',
  owNoCwdTip: 'No folder in this session (cannot open here)',
  sessionDeleteLabel: 'Session delete (⋯ menu)',
  sessionDeleteInfo: 'Adds "Delete session" to the session row "⋯" menu: double confirmation first, permanently removes the session and all its data.',
  groupWorkspace: 'Workspace tabs',
  enableWsTabs: 'Enable workspace tabs',
  enableWsTabsInfo: 'Turns the sidebar Workspaces heading into group tabs: a fixed Default tab shows direct workspaces and ungrouped sessions; use ＋ to create named group tabs (folders); each workspace row menu gains a four-character Assign tag item to move it into any tab or back to Default; a workspace created while on another tab joins that tab automatically; deleting a tab moves its workspaces back to Default.',
  resetAllLabel: 'Reset all settings',
  resetAllInfo: 'Resets every toggle and stored widths; page refresh applies.',
}

export { zh, en }
