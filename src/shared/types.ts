/**
 * 跨 `host/` 与 `client/` 的公共类型。
 *
 * 本批只收 `Disposer`（原先在 `client/index.ts:49` 与 `widthPrefs.ts:27` 各写一份）。
 * `features/*` 的最小 ctx 接口留批次⑨ —— 见 `docs/refactor-plan.md` 批次⑦ 裁定第 10 条：
 * `src/env.d.ts:15-17` 的 `ClientContext` 权宜桩使 ctx 全局为 `any`，收紧类型是独立课题。
 */

/** 卸载函数：由各 `install*` 返回，统一由功能注册表持有并调用。 */
export type Disposer = () => void
