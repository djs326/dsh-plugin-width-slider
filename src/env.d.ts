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
  // 当前未使用，但声明存在避免 tsc 报错
}