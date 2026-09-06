/**
 * icons.ts — 图标 data URL 安全校验（共用）。
 * 只接受空串（回退默认）或 base64 PNG data URL；外链/其它 scheme 一律回退，
 * 防止共用设置文件被写入任意 URL 后造成出站请求/追踪。
 */
export function isSafePngIcon(src: string): boolean {
  if (src === '') return true
  return /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(src)
}
