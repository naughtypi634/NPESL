---
name: web-design-guidelines
description: 按 Vercel Web Interface Guidelines 审核 UI 的视觉与可用性。用户说「视觉审核」「审一下界面」「检查可访问性」「这页哪里难看/不好用」时使用。输出 file:line 式清单。
metadata:
  source: https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines
  upstream: https://github.com/vercel-labs/web-interface-guidelines
---

# 视觉审核（Web Interface Guidelines）

分两步：先按 guideline 查代码，再在浏览器里真的看一眼。代码查得出来的问题（缺 aria-label、
无 focus 替代、`transition: all`）不必开浏览器；布局、对比度、对齐、遮挡必须看渲染结果。

## 1. 取规则

每次审核前取最新规则（离线时跳过这步，用下面的检查面）：

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

## 2. 查什么

- **可访问性**：icon-only 按钮有 `aria-label`；表单有 label；`<button>` 做动作、`<a>` 做跳转；
  装饰图标 `aria-hidden`；异步更新有 `aria-live`；标题层级连续。
- **焦点**：可交互元素有可见焦点样式；删 outline 必须给替代；模态内焦点不逃逸。
- **动效**：尊重 `prefers-reduced-motion`；只动 `transform` / `opacity`；不用 `transition: all`。
- **排版**：省略号用 `…`；数字列 `tabular-nums`；标题 `text-wrap: balance`。
- **内容**：长文本有截断；有空状态；用户内容长短两极端都不塌。
- **触控**：目标不小于 44×44（至少 24×24）；拖拽有替代操作；模态里 `overscroll-behavior: contain`。
- **主题**：`color-scheme` 与 `<meta name="theme-color">` 跟上主题；原生控件有显式配色。
- **深色**：两套主题都要看，不要只看浅色。
- **状态**：hover / active / focus / disabled 都要有，且对比度递增。
- **层级**：浮层（主题按钮、toast）不能压在模态之上。

## 3. 怎么看

本库没有 Playwright，统一用 `tools/edge.mjs` 开的无头 Edge（**一次验证只开一个**，跑完关掉）：

```js
import { launchEdge } from '../../tools/edge.mjs';
const edge = await launchEdge({ name: 'edge-visual', url: pathToFileURL(page).href });
await edge.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await edge.send('Page.captureScreenshot', { format: 'png' });   // 存成 png 再自己看
edge.close();
```

- 宽度至少两个：1440（桌面）和 390（手机，`mobile: true`、`deviceScaleFactor: 2`）。
- 主题切换靠 `data-theme`（`bright` / `sepia` / `dark`），不是 `prefers-color-scheme`。
- 截图要真的读图判断：对齐、留白、颜色、被裁掉的字、遮住内容的浮层，只能看出来。

## 4. 输出

按文件分组，`file:line` 简短列出问题，不写解释（修法不直观时才补一句）。查干净的文件写 pass。
先给结论（几条 FIX、几条 REVIEW），再列清单。
