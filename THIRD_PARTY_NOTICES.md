# 第三方许可声明（Third-Party Notices）

本插件（dsh-plugin-width-slider）整合了以下 MIT 许可开源项目的能力，按
上游许可要求随分发保留其版权声明与许可文本。

## dsh-think-zh-expand

- 版权：Copyright (c) 2026 bsfeng
- 上游仓库：https://github.com/baosfeng/my-dsh-plugins
- 参考版本：v0.4.7（插件目录 LICENSE 为 MIT）
- 收编用途（v0.3.0）：思考/回复强制中文（host system prompt 注入）、
  思考块增强渲染（assistant-step 渲染器替换）、界面硬编码英文中文化。
- 本地转写文件（非逐字拷贝；类名/注册名/默认行为/降级逻辑有改动）：
  - src/client/think/thinkView.tsx —— 对应上游 lib/parts/assistant.part.js
    与 apply.part.js（样式与装配）
  - src/client/think/uiLocalize.ts —— 对应上游 lib/parts/zh-tables.part.js
    与 zh-localize.part.js
  - src/index.ts —— 对应上游 lib/index.js（PROMPT_TEXT 与注入方式）
- 上游许可全文（原文）:

MIT License

Copyright (c) 2026 bsfeng

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

（以上文本复制自上游插件目录 LICENSE 文件原文）

---

## dsh-plugin-open-with

- 版权：Copyright (c) 2026 hyrinx <xhy_23@qq.com>
- 上游仓库：https://github.com/hyrinx/dsh-plugin-open-with
- 参考版本：本地修改版（用户验证有效的 actions 槽位修复版，上游 v1.0.0
  行为 + slot 注入修复：inject 目标 = register 的 slot 自身）
- 收编用途（v0.4.0）：对话头部"用其他应用打开"胶囊按钮（host launch/
  图标提取/路径解析 + client 按钮/设置面板）。
- 本地转写文件（非逐字拷贝；类名/注册名/图标/代码组织有改动）：
  - src/host/openWithService.ts —— 对应上游 lib/index.js（/open-with RPC）
  - src/client/openWith/OpenWithButton.tsx —— 对应上游 OpenVscodeButton
  - src/client/openWith/OpenWithPanel.tsx —— 对应上游 OpenWithSettings
  - src/client/locales.ts 中 ow*/settings.* 词条 —— 对应上游 locales
- 设置数据沿用 $DSH_HOME/storages/dsh-open-with/settings.json（与官方及
  用户本地版本共用同一文件，停用官方插件后配置无缝保留）。
- 上游许可全文（原文）:

MIT License

Copyright (c) 2026 hyrinx <xhy_23@qq.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

（以上文本复制自上游 LICENSE 文件原文）

---

本插件自身以 MIT 许可发布，见仓库根 LICENSE。
