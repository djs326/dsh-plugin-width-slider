# dsh-plugin-width-slider

**DSH 个人多功能插件**（v0.3.0 起收编 dsh-think-zh-expand、v0.4.0 起收编 dsh-plugin-open-with；全部功能带独立开关）—— 为 **DSH Desktop（Windows 桌面版）** 提供：

- **对话宽度滑块**：替代原生宽度拖拽手柄的滑块调节，按下即全屏预览、实时调宽、宽度持久化；
- **思考块增强**（收编自 dsh-think-zh-expand）：思考与回复强制中文、思考块展开/收起（默认"思考完自动收起"）、思考内容 Markdown 渲染；
- **Open With**（收编自 dsh-plugin-open-with）：对话头部胶囊按钮用其他应用（VS Code/终端/资源管理器/自定义项）打开当前目录；
- **界面中文化**：官方界面残留硬编码英文标签自动替换为中文；
- **官方面板补丁**：设置弹窗可拖拽调宽、左侧 tab 列表超高时滚动。

安装 dsh-plugin-width-slider 后即可替代 dsh-think-zh-expand 与 dsh-plugin-open-with（无需再单独安装，见下方"与上游插件的关系"）。

---

## 适用环境

| 项目 | 要求 |
|------|------|
| 运行环境 | **DSH Desktop**（DeepSeek Harness 桌面版，Windows 10/11） |
| DSH Desktop 仓库 | [anywhere-labs/dsh-desktop](https://github.com/anywhere-labs/dsh-desktop) |
| DSH 版本 | `>= 0.1.1-rc.1` |
| Node.js | `^22.11 \|\| >= 24` |
| 平台 | 仅 `win32` |

> 本插件已在 **DSH Desktop**（[anywhere-labs/dsh-desktop](https://github.com/anywhere-labs/dsh-desktop)，Windows 桌面壳，Electron 薄壳 + DSH Host + Web renderer）上实测通过。
> 若你的 DSH 是自建/Web 版，机制相同（同为 Web 端注入），但以桌面版为准验证。

---

## 功能特性（全部可独立开关）

| 开关 | 功能 | 默认 |
|---|---|---|
| 宽度滑块 | 滑块调节对话内容宽度：按下即全屏预览、实时调宽、宽度持久化；关闭后恢复原生拖拽手柄 | 开 |
| 强制中文 | host 注入最高优先级语言规则：思考过程与回复均使用简体中文 | 开 |
| 思考块增强 | 思考块展开/收起交互（思考内容走 Markdown 渲染），替换官方单行折叠 | 开 |
| 思考块模式 | 二选一：思考完自动收起（默认）/ 始终展开 | 自动收起 |
| 界面中文化 | 官方残留硬编码英文标签（Tool Call、Thinking 等）替换为中文 | 开 |
| 弹窗调宽 | 官方设置弹窗右侧拖柄可调宽度（记忆宽度，双击复位 800px） | 开 |
| tab 滚动 | 官方设置左侧 tab 列表超高时显示滚动条 | 开 |
| Open With 按钮 | 对话头部胶囊按钮（左键启动当前项 / 右键下拉切换），在当前会话目录启动 | 开 |
| Open With 设置 | 总控页管理打开项：预设/自定义、组内拖拽排序、设为当前、隐藏、添加/编辑/删除 | 开 |

开关在 DSH 设置 → **对话宽度（Width Slider）** 区块内的功能总控页操作，改动即时生效、重启保留。

- **按下即预览**：鼠标按下滑块瞬间进入全屏预览模式——官方设置面板被临时隐藏，只留下居中的滑块、当前宽度数值与提示，对话区域完全露出，所见即所得。
- **实时调宽**：拖动滑块，对话内容区宽度即时变化（写 conversation root 元素内联 CSS 变量 `--dsh-chat-user-width`，与原生拖拽同一生效路径，无需切换会话）。
- **宽度持久化**：宽度值写入 `localStorage` 键 `dsh.conversation.contentWidth`，重启 DSH 后保留。
- **隐藏原生手柄**：插件入口注入全局样式 `[data-width-handle]{display:none!important}`，用稳定属性选择器隐藏原生左右拖拽手柄——不像改官方 `client.js` 那样会被升级覆盖。
- **思考块**：生成中强制展开、结束后按所选模式显示；思考内容与回复文本统一走 MarkdownView（依赖 dsh-md-render），代码块/表格/公式正常渲染。
- **中英双语**：内置 zh / en 两套界面文案，跟随 DSH 界面语言自动切换。
- **滑块几何**：轨道高度 = 圆形手柄直径（面板 20px / 预览 28px），填充条右端为与手柄同心同半径的半圆头，无平直切面露出；宽轨道便于鼠标点击。

## 与 dsh-think-zh-expand 的关系

从 v0.3.0 开始，dsh-think-zh-expand 的全部能力（中文提示 / 思考块渲染 /
界面中文化）已并入本插件（该插件以 MIT 许可发布，版权归属声明见
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)），**不需要再单独安装
它**。若之前装过，请将其移除或停用，避免两个插件同时接管同一块界面。

思考块的 Markdown 渲染依赖 `dsh-md-render`，请保持其已安装（缺失时本
插件自动降级为纯文本显示）。

## 与 dsh-plugin-open-with 的关系

从 v0.4.0 开始，dsh-plugin-open-with 的能力（头部胶囊按钮 + 打开项管理）
已并入本插件，**不需要再单独安装它**；本实现基于你在本地验证有效的
"actions 槽位修复版"（inject 目标 = register 的 slot 自身）。若之前装过
dsh-plugin-open-with，请将其移除或停用，避免出现双按钮/双设置。打开的
配置沿用同一份数据文件（`$DSH_HOME/storages/dsh-open-with/settings.json`），
停用官方插件后你的预设/自定义项无缝保留。自定义项请填 `.exe` 可执行文件
路径（直接启动，不经 cmd 二次解析，路径含 `&` 等符号也不受影响）。

---

## 安装

### 方式一：npm（推荐）

```bash
dsh plugin --profile desktop add dsh-plugin-width-slider
```

### 方式二：本地开发（源码目录软链）

```bash
cd C:\Users\Lanxi\.dsh\profiles\desktop
pnpm link C:\Users\Lanxi\Desktop\dsh-plugin-width-slider
```

改完代码 `npm run build` 后重启 DSH 即生效，无需复制文件。

### 方式三：手动复制（临时调试）

将构建产物复制到 profile 的 node_modules：

```
dsh-plugin-width-slider/
├── package.json
├── cordis.patch.yml
└── lib/
    ├── index.mjs     # Host 端入口
    └── client.js     # Client 端 bundle（ModuleLoader 握手）
```

复制到 `C:\Users\Lanxi\.dsh\profiles\desktop\node_modules\dsh-plugin-width-slider\`，
并在 profile `package.json` 的 `dsh.profile.bundles` 数组中追加 `"dsh-plugin-width-slider"`，重启 DSH Desktop。

---

## 使用说明

1. 打开 DSH Desktop 的 **设置** 面板。
2. 侧边栏找到 **Width Slider · 对话宽度** 条目进入 —— 这里是功能总控页：
   - **对话宽度滑块**：宽度开关 + 滑块调节（按下即全屏预览、拖动实时调宽、松开/Esc 返回）；
   - **思考块**：增强渲染开关 + 显示方式（思考完自动收起 / 始终展开）；
   - **输出语言**：思考/回复强制中文开关；
   - **界面**：英文中文化开关、设置弹窗调宽开关、设置 tab 滚动开关；
   - **打开方式（Open With）**：头部按钮开关 + 打开项管理（预设/自定义、拖拽排序、设为当前、隐藏、添加/编辑/删除；图标自动提取）。
3. 对话头部胶囊按钮：左侧主按钮直接在当前会话目录启动当前打开项；右侧箭头展开菜单选择其它项（选择即启动并设为当前）。
4. 调节范围（宽度滑块）：最小值 640px，最大值 = 对话列宽 − 176px（与原生拖拽一致）。
5. 设置弹窗补丁：弹窗打开后右侧边缘出现拖柄，拖动调宽（640~1280px），双击拖柄恢复默认 800px。

---

## 工作原理

| 机制 | 说明 |
|------|------|
| Slot 注入 | 通过 `settings.section` slot 注册自定义设置区块（id: `width-slider`，order 600） |
| 宽度应用 | 对每个 `[data-phase]` 的 conversation root 元素写内联 `--dsh-chat-user-width`（与原生 `onHandleDrag` 同路径） |
| 持久化 | `localStorage["dsh.conversation.contentWidth"]` |
| 预览模式 | `createPortal` 到 `document.body`，`position: fixed; inset: 0; z-index: 100000`；同时把 `[data-shell-overlay]` 等设置面板覆盖层设为 `opacity: 0` |
| 隐藏手柄 | 入口注入 `<style>[data-width-handle]{display:none!important}</style>` |
| 思考块渲染 | slots 覆盖 `conversation.chat.node` 的 `assistant-step`（priority -1）；思考块默认收起、running 强制展开、结束自动收起；MarkdownView 经运行时 `require('dsh-md-render')` 解析（`dsh.client.external` 声明） |
| 强制中文 | host `systemPrompt.section`（order -90），开关热注销/注册 |
| 界面中文化 | MutationObserver 精准替换「完全等于」词表的叶子文本节点（排除代码/输入区） |
| 面板补丁 | body 观察器探测 `[role=dialog][aria-modal]` + `> nav` 语义锚点（不依赖 hash 类名），失效自动跳过 |
| 配置 | 开关经 `/width-slider` RPC（loopback 围栏）读写 `$DSH_HOME/storages/dsh-plugin-width-slider/settings.json`（原子写）；client 端 config store 热切换 |
| 性能 | 列宽在 `pointerdown` 时快照；宽度更新 rAF 节流，拖动不卡顿 |

---

## 开发与构建

```bash
npm install
npm run build    # tsdown 构建 → lib/index.mjs + lib/client.js
npm run typecheck
```

> 版本陷阱：`tsdown 0.6.x` + `rolldown 1.2.7` 组合会报
> `The requested module 'rolldown/experimental' does not provide an export named 'transformPlugin'`。
> 请使用 `tsdown >= 0.22`（本仓库已锁定 `^0.22.14` + `rolldown ^1.2.6`）。

构建产物：

```
lib/
├── index.mjs        # Host 端（ESM）
└── client.js        # Client 端（CJS，含 window.__ModuleLoader__.load 握手）
```

---

## 目录结构

```
dsh-plugin-width-slider/
├── src/
│   ├── index.ts                     # Host 端：systemPrompt 中文注入（可热切换）+ /width-slider + /open-with RPC + storages 配置
│   ├── host/
│   │   └── openWithService.ts       # Open With host 服务（收编：launch/图标提取/路径解析/设置文件）
│   └── client/
│       ├── index.ts                 # Client 端入口：locale + 受控功能生命周期（开关驱动安装/卸载）
│       ├── config.ts                # FeatureSettings 契约 + client 配置 store（热切换源）
│       ├── WidthSliderSettings.tsx  # 设置区块：功能总控页（分组开关）
│       ├── WidthSliderControl.tsx   # 宽度滑块组件（按下预览 / rAF 拖动 / 宽度持久化）
│       ├── settingsPanelPatch.ts    # 官方面板补丁：弹窗拖宽 + 左侧 tab 滚动（语义锚点探测）
│       ├── openWith/
│       │   ├── OpenWithButton.tsx   # 头部胶囊按钮（收编，actions 同槽注入）
│       │   └── OpenWithPanel.tsx    # 打开项管理面板（并入总控页，收编）
│       ├── think/
│       │   ├── thinkView.tsx        # 思考块 + assistant-step 渲染器（收编，dsh-ws- 前缀）
│       │   └── uiLocalize.ts        # 界面中文化词表 + MutationObserver（收编）
│       └── locales.ts               # zh / en 文案
├── cordis.patch.yml                 # bundle patch：insert width-slider
├── tsdown.config.ts
├── tsconfig.json
└── package.json
```

## License

[MIT](./LICENSE)