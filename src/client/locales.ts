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
  // ── v0.4.0 Open With（收编 dsh-plugin-open-with）──
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
  enableThinkInfo: '思考块支持展开/收起并渲染 Markdown（依赖 dsh-md-render，需保持安装）。关闭后回退官方默认的单行折叠显示。',
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
  enableResize: '设置弹窗可拖拽调宽',
  enableResizeInfo: '给官方设置面板弹窗加右侧拖柄：拖动调整宽度（双击拖柄恢复默认 800px），宽度会被记住。',
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
  enableThinkInfo: 'Thinking blocks can expand/collapse and render Markdown (requires dsh-md-render to stay installed). Off falls back to the built-in single-line collapsed view.',
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
  enableResize: 'Resizable settings dialog',
  enableResizeInfo: 'Adds a right-edge drag handle to the official settings dialog (double-click to restore the default 800px); the width is remembered.',
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
}

export { zh, en }
