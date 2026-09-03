# dsh-plugin-width-slider

对话宽度滑块插件 —— 为 **DSH Desktop（Windows 桌面版）** 提供替代原生宽度拖拽手柄的滑块调节方式。

在设置面板中按下滑块即进入全屏预览，拖动实时调整对话内容区域宽度；同时自动隐藏原生左右拖拽手柄，升级后不再失效。

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

## 功能特性

- **按下即预览**：鼠标按下滑块瞬间进入全屏预览模式——官方设置面板被临时隐藏，只留下居中的滑块、当前宽度数值与提示，对话区域完全露出，所见即所得。
- **实时调宽**：拖动滑块，对话内容区宽度即时变化（写 conversation root 元素内联 CSS 变量 `--dsh-chat-user-width`，与原生拖拽同一生效路径，无需切换会话）。
- **持久化**：宽度值写入 `localStorage` 键 `dsh.conversation.contentWidth`，重启 DSH 后保留。
- **隐藏原生手柄**：插件入口注入全局样式 `[data-width-handle]{display:none!important}`，用稳定属性选择器隐藏原生左右拖拽手柄——不像改官方 `client.js` 那样会被升级覆盖。
- **中英双语**：内置 zh / en 两套界面文案，跟随 DSH 界面语言自动切换。
- **滑块几何**：轨道高度 = 圆形手柄直径（面板 20px / 预览 28px），填充条右端为与手柄同心同半径的半圆头，无平直切面露出；宽轨道便于鼠标点击。

---

## 安装

### 方式一：GitHub 直拉

在 profile 的 `package.json` `dependencies` 中添加：

```json
"dsh-plugin-width-slider": "github:djs326/dsh-plugin-width-slider"
```

然后在 profile 目录执行：

```bash
pnpm install
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
2. 侧边栏找到 **Width Slider · 对话宽度** 条目并进入。
3. 面板中显示当前宽度数值与滑块：
   - **按下滑块** → 进入全屏预览：设置面板隐藏，屏幕中央只有滑块、大号宽度数值和"预览模式 · 松开返回设置"提示。
   - **按住拖动** → 对话内容区宽度实时变化。
   - **松开 / 按 Esc** → 返回设置面板。
4. 调节范围：最小值 640px，最大值 = 对话列宽 − 176px（与原生拖拽一致）。

---

## 工作原理

| 机制 | 说明 |
|------|------|
| Slot 注入 | 通过 `settings.section` slot 注册自定义设置区块（id: `width-slider`，order 600） |
| 宽度应用 | 对每个 `[data-phase]` 的 conversation root 元素写内联 `--dsh-chat-user-width`（与原生 `onHandleDrag` 同路径） |
| 持久化 | `localStorage["dsh.conversation.contentWidth"]` |
| 预览模式 | `createPortal` 到 `document.body`，`position: fixed; inset: 0; z-index: 100000`；同时把 `[data-shell-overlay]` 等设置面板覆盖层设为 `opacity: 0` |
| 隐藏手柄 | 入口注入 `<style>[data-width-handle]{display:none!important}</style>` |
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
│   ├── index.ts                     # Host 端最小入口
│   └── client/
│       ├── index.ts                 # Client 端入口：locale 注册 + settings.section 注入 + 隐藏手柄样式
│       ├── WidthSliderSettings.tsx  # 滑块组件（按下预览 / rAF 拖动 / 宽度持久化）
│       └── locales.ts               # zh / en 文案
├── cordis.patch.yml                 # bundle patch：insert width-slider
├── tsdown.config.ts
├── tsconfig.json
└── package.json
```

## License

[MIT](./LICENSE)