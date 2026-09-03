export interface WidthSliderKey {
  label: string
  value: string
  unit: string
  preview: string
  previewHint: string
  info: string
}

const zh: Record<keyof WidthSliderKey, string> = {
  label: '对话宽度',
  value: '{value}px',
  unit: 'px',
  preview: '按下滑块进入预览模式',
  previewHint: '预览模式 · 松开返回设置',
  info: '拖动滑块调整对话内容区域宽度。按下滑块即进入全屏预览模式，仅显示滑块，方便查看宽度变化效果。',
}

const en: Record<keyof WidthSliderKey, string> = {
  label: 'Conversation Width',
  value: '{value}px',
  unit: 'px',
  preview: 'Press the slider to enter preview mode',
  previewHint: 'Preview mode · release to return',
  info: 'Drag the slider to adjust the conversation content width. Press the slider to enter full-screen preview with only the slider visible.',
}

export { zh, en }