/**
 * DSH 外部模块类型桩。
 *
 * 作为外部插件，dsh-plugin-width-slider 不安装 DSH monorepo 内部包。
 * 本文件声明这些模块的存在，避免 tsc 报 "Cannot find module"。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type $TS_FIXME = any

declare module '@deepseek-ai/cordis' {
  export type Context = $TS_FIXME
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  export type ClientContext = $TS_FIXME
}

declare module '@deepseek-ai/dsh-client-locale/client' {
  // 仅用于模块扩充
}

declare module '@deepseek-ai/dsh-client-connection/client' {
  // 仅用于模块扩充
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  // 仅用于模块扩充
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  export interface LocaleNamespaceMap {}
  export type Slots = $TS_FIXME
  export type Sessions = $TS_FIXME
  export type PropsLocale<T extends string = string> = { t: (key: string) => string }
  export type PropsRuntime<T extends string = string> = { sessionId: string }
  export type InjectFace<T> = T
}

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  // 运行时经 __ModuleLoader__ require 取用（MarkdownText 等），声明存在避免
  // tsc 报 "Cannot find module"。
  export const MarkdownText: $TS_FIXME
}
// __ModuleLoader__ factory 注入的模块加载器（见 thinkView.tsx 运行时
// require('@deepseek-ai/dsh-client-ui-primitives')；tsdown CJS 产物运行于
// factory 作用域内）。
declare const require: (id: string) => any
