/**
 * 宿主 primitives（Modal 等）的唯一读取入口。
 *
 * 宿主包是 optional peer：bundle 把它当 external，运行时用 `require` 取（产物是 CJS 包装，
 * `require` 由 factory 注入，声明见 src/env.d.ts）。单独成模块是为了让测试能
 * `vi.mock('./primitives.ts')` 注入桩 —— 直接 mock 宿主包行不通：源码里的 `require` 是
 * 构建器注入的模块作用域 shim，走 Node 的 CJS 解析，绕过 Vite 的 alias 与 mock 表
 * （`resolve.alias` / `test.alias` / `vi.mock('<宿主包>')` 三条路都实测无效）。
 *
 * 读取只做一次，失败即缓存空对象：宿主包缺失时依赖它的功能安静降级，不再重试。
 */

/** 宿主 primitives 模块里本插件用到的成员。 */
export interface HostPrimitives {
  /** 宿主的模态对话框组件；缺失时依赖它的功能整体跳过安装。 */
  Modal?: unknown
}

let cached: HostPrimitives | null = null

/**
 * 读宿主 primitives 模块。
 * @returns 宿主模块（读取失败时为空对象）。
 */
export function primitives(): { Modal: any } {
  if (cached === null) {
    try {
      const mod = require('@deepseek-ai/dsh-client-ui-primitives') as HostPrimitives | undefined
      cached = mod && typeof mod === 'object' ? mod : {}
    } catch {
      cached = {}
    }
  }
  return cached as { Modal: any }
}
