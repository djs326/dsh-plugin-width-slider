/**
 * 宿主 primitives（Modal、图标、MarkdownText…）的**唯一读取入口** —— workspaceTabs、
 * sessionDelete 与 think 视图都从这里取，不再各自 require 一份（此前三份实现各有自己的
 * 缓存与成员集合，缺失时的降级与告警也不一致）。
 *
 * 宿主包是 optional peer：bundle 把它当 external，运行时用 `require` 取（产物是 CJS 包装，
 * `require` 由 factory 注入，声明见 src/env.d.ts）。单独成模块还为了让测试能
 * `vi.mock('./primitives.ts')` 注入桩 —— 直接 mock 宿主包行不通：源码里的 `require` 是
 * 构建器注入的模块作用域 shim，走 Node 的 CJS 解析，绕过 Vite 的 alias 与 mock 表
 * （`resolve.alias` / `test.alias` / `vi.mock('<宿主包>')` 三条路都实测无效）。
 *
 * 读取只做一次，失败即缓存空对象：宿主包缺失时依赖它的功能安静降级，不再重试。
 */

/**
 * 宿主 primitives 模块。成员按需取用（`Modal`、`IconTrashOutline16`、`MarkdownText`…）；
 * 读取失败时是空对象，调用方据此判定"不可用"。
 */
export type HostPrimitives = Record<string, any>

let cached: HostPrimitives | null = null

/**
 * 读宿主 primitives 模块。
 * @returns 宿主模块（读取失败或不是对象时为空对象）。
 */
export function primitives(): HostPrimitives {
  if (cached === null) {
    try {
      const mod = require('@deepseek-ai/dsh-client-ui-primitives') as HostPrimitives | undefined
      cached = mod && typeof mod === 'object' ? mod : {}
    } catch {
      cached = {}
    }
  }
  return cached
}
