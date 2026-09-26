/**
 * lang.ts — 界面语言工具。
 *
 * 渲染链（思考块 / 面板补丁拖柄）不在官方 locale 词典通道内，这里用
 * documentElement.lang / navigator.language 判定界面语言，供少量
 * 界面文本（思考标题、已停止、拖柄提示）选择 zh/en。
 */
export function isZhInterface(): boolean {
  try {
    const lang = (typeof document !== 'undefined' && document.documentElement.lang)
      || (typeof navigator !== 'undefined' && navigator.language)
      || ''
    return lang.toLowerCase().startsWith('zh')
  } catch {
    return true
  }
}

/** zh/en 二选一文本。 */
export function pickText(zh: string, en: string): string {
  return isZhInterface() ? zh : en
}
