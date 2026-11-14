---
name: webapp-testing
description: 交互审核——在无头 Edge 里真的点、拖、打键盘，验证页面行为、抓截图和 console 错误。用户说「交互审核」「点一遍看看」「这个按钮灵不灵」「拖拽/键盘/弹层有没有问题」时使用。
metadata:
  source: https://github.com/anthropics/skills/tree/main/skills/webapp-testing
  adapted: 原版用 Python Playwright；本库改用 tools/edge.mjs 的 CDP 直连
---

# 交互审核（Web Application Testing）

原则：**先侦察，再操作**。不猜选择器——先把页面渲染出来，从真实 DOM 里拿选择器，再写动作。

## 侦察

```js
import { launchEdge } from '../../tools/edge.mjs';
import { pathToFileURL } from 'node:url';

const edge = await launchEdge({ name: 'edge-int', url: pathToFileURL('apps/x/index.html').href });
await sleep(800);
await edge.evaluate(`document.querySelectorAll('button').length`);
```

本库页面多数是自包含的 `file://` 页面，不需要起服务器；要起的话用
`tools/` 里既有的构建产物，别临时搭 dev server。

## 动作

- 点击 / 键盘：`Input.dispatchMouseEvent`、`Input.dispatchKeyEvent`（`Tab`=9、`Escape`=27、
  `ArrowRight`=39；Shift 用 `modifiers: 8`）。
- 滚动、可见性、快照：`edge.evaluate()` 里跑 DOM 代码，`returnByValue: true`。
- 截图：`Page.captureScreenshot`，写文件后自己读图。
- console / 页面错误：`edge.onEvent()` 里收 `Runtime.consoleAPICalled`（type `error`）和
  `Log.entryAdded`（level `error`），把两条都当失败。
- 手机：`Emulation.setDeviceMetricsOverride({ mobile: true, deviceScaleFactor: 2 })`；
  触屏规则（`pointer: coarse`）要先 `Emulation.setTouchEmulationEnabled({ enabled: true })`。

## 审核清单

1. 每个「看起来能点」的东西点一遍，状态和文案是否真的变了。
2. 键盘：Tab 顺序、焦点可见、方向键在 tablist 里、Escape 关弹层、焦点回到触发点。
3. 模态：背景 `inert`、焦点不逃出、打开时 body 不滚、关掉恢复。
4. 手机：无横向溢出、固定底栏不永久遮内容、目标不小于 44×44。
5. `prefers-reduced-motion` 下动效真的停。
6. 结束时：console 干净、截图存盘、`edge.close()`。

## 收尾

```js
edge.close();   // 按 profile 精确杀整棵树，必须调
```

每个用例先单跑一次确认不是抖动；整套只跑一遍。
