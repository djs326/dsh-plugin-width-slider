/** 兼容壳（批次⑥）：实现已搬到 ./patches/wsTabs/index.tsx，这里保留原路径的导出面，
 *  让 src/client/index.ts:29 与 test/workspaceTabsDialogs.test.ts:55 的 import 路径零改动。 */
export { WS_TABS_MARK, installWorkspaceTabs } from './patches/wsTabs/index.tsx'
export type { WsGroup, WsTabsCtx } from './patches/wsTabs/index.tsx'
