export interface WidthSliderKey {
  label: string
  unit: string
  previewHint: string
  info: string
  followLabel: string
  followInfo: string
}

const zh: Record<keyof WidthSliderKey, string> = {
  label: '对话宽度',
  unit: 'px',
  previewHint: '预览模式 · 松开返回设置',
  info: '拖动滑块调整对话内容区域宽度。按下滑块即进入全屏预览模式，仅显示滑块，方便查看宽度变化效果。',
  followLabel: '跟随窗口宽度',
  followInfo: '已开启跟随窗口：对话内容宽度自动等于对话列宽度，窗口放大缩小对话内容实时跟随。手动拖动调节在跟随模式下不可用，关闭后恢复滑块调节。',
}

const en: Record<keyof WidthSliderKey, string> = {
  label: 'Conversation Width',
  unit: 'px',
  previewHint: 'Preview mode · release to return',
  info: 'Drag the slider to adjust the conversation content width. Press the slider to enter full-screen preview with only the slider visible.',
  followLabel: 'Follow window width',
  followInfo: 'Follow mode on: the conversation content width tracks the conversation column and rescales live with the window. Manual drag is disabled until you turn this off.',
}

export { zh, en }