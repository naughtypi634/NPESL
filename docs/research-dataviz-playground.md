# 数据图鉴 Playground · 外部参考研究

研究日期：2026-11-19。目标是找出可免费复用、或可直接借鉴实现方式的做法，不为引入新技术而加依赖。

## 一、图表画廊的缩略图

| 项目 | 方式 | 许可 | 可借鉴 |
|---|---|---|---|
| [ztd-charts](https://charts.ztd.app/docs/) | 47 张卡片全部水合为实时 SVG，单页 JS 约 928KB | MIT | 固定预览高度、每卡一句 takeaway、按图表家族分组；它也提供 `renderSpecToSVG`，可在构建期生成静态图 |
| [Observable Plot Gallery](https://observablehq.com/@observablehq/plot-gallery) | 每张卡是预生成的 640×400 JPEG，固定 8:5 画框 | Plot 为 ISC；图片不开放 | 固定画框、卡片只放标题、图里不要标题和图例 |
| [Vega-Lite Examples](https://vega.github.io/vega-lite/examples/) | 每个示例一张预渲染 SVG，4:3 画框，`background-size: cover` | BSD-3-Clause | 构建期批量出图、静态资源、封面裁切 |
| [Vega Editor](https://vega.github.io/editor/) | 示例预览由脚本离线生成 PNG，编辑器里才实时渲染 | BSD-3-Clause | 离线批量生成，详情页保持实时 |
| [Datawrapper Gallery](https://www.datawrapper.de/charts) | 静态截图，按展示高度裁切；分类图标是 14px 示意图 | 专有 SaaS | 只借鉴布局：裁到最能说明问题的一块、每卡一句收益 |
| [RAWGraphs](https://app.rawgraphs.io/) | 缩略图是内联 SVG 示意图 | Apache-2.0 | 零额外请求的内联图；但示意图不如真实数据缩略图 |

**采用的做法**：用 ztd-charts 自带的 `renderSpecToSVG` 在构建期为 47 种图表各生成浅色、深色两张 SVG，缩略图关闭文字标签、图例和摘要，放进 `public/data/previews/`。目录页用原生 `loading="lazy"` 的 `<img>`，不再同时挂 47 个实时图表；详情页仍用实时 `Chart`。这比 ztd 官方画廊的“全量水合”轻得多，也比普通 SVG 示意图更能看出真实形态。

## 二、双栏学习布局

| 参考 | 做法 | 可借鉴 |
|---|---|---|
| [Stripe Docs](https://docs.stripe.com/) | 左侧内容、右侧目录，长页面里视觉元素保持可见 | 粘性视觉列、清晰的滚动位置 |
| [MDN](https://developer.mozilla.org/) | 固定侧栏 + 滚动可达的章节导航 | 章节锚点与顶部偏移 |
| [Observable](https://observablehq.com/) | 图表与解释文字在同一列交替出现 | 图表和文字必须成对出现，而不是图在上、解释很远 |
| 常见 scrollytelling 教程 | 粘性图 + 滚动文字 | 粘性容器高度、移动端退回单列 |

**采用的做法**：桌面端图表列 `position: sticky`，右侧学习内容正常滚动；上方一条粘性模块导航（Chart & data / How to read / Live English / Observations / Expressions / Descriptions / Language），点击后按 84px 顶部偏移滚到对应章节，避免被粘性导航遮住。移动端改为单列，导航横向滑动，图表保持完整宽度。

## 三、可编辑数据表

| 项目 | 许可 / 费用 | 结论 |
|---|---|---|
| [AG Grid Community](https://www.ag-grid.com/license-pricing/) | Community MIT；Enterprise 按开发者收费 | 功能强但过重，且常用功能在付费版 |
| [Glide Data Grid](https://github.com/glideapps/glide-data-grid) | MIT | 适合百万行，画布渲染；本项目每张图最多几十行，不需要 |
| [TanStack Table](https://tanstack.com/table) | MIT | 无 UI，只提供表格状态；仍要自己写输入与校验 |
| [Handsontable](https://handsontable.com/) | 商业使用需付费 | 不符合“只用免费方案” |
| [RevoGrid](https://rv-grid.com/) | MIT | 同样偏重 |

**采用的做法**：不引入表格依赖。原生 `<table>` 加受控输入即可覆盖 47 种图表的数据结构；按图表 `encoding` 自动挑出真正要编辑的列（x、系列、分组、度量），并给数字列做类型校验。空值按 0 处理，负数允许输入，编辑只写入页面状态，不修改内容源。

## 四、数据到文本（NLG）

- **Data2Text / AutoNarrative 一类研究**的共同结论：先选最重要的 2–4 个事实，再组织句子；按数值大小列清单是最差的生成方式。
- **SimpleNLG / jsRealB** 这类表面实现器解决的是英文形态变化，不是“该说什么”；本项目用确定性模板加受控词汇即可。
- **Wordsmith / Arria** 是商业产品，只参考其模板语法（条件、优先级、同义句），不使用其服务。
- 统计写作规范（澳大利亚统计局、GrammarBook、SkillsYouNeed）：百分比 vs 百分点、`increase by/to/from…to`、相关不等于因果、没有基数不写百分比变化。

**采用的做法**：为 47 种图表建立分析适配器，先算事实（极值、排名、占比、变化、趋势、中位数、四分位、相关系数、转化率、目标差距、流量、层级、地理位置），再按 Academic / Business / Everyday 三种语气生成句子；中文与英文来自同一组计算结果。数据不适合某项指标时（例如类别数据不计算趋势、散点不断言因果），就不生成那类话，也不编造原因。所有句子在浏览器本地确定性生成，不调用外部 AI。

## 五、ztd-charts 的预览能力

- `renderSpecToSVG(spec, { width, height })` 在 Node 中可用，返回完整 SVG；地图需要先 `registerMap(world)` / `registerMap(usStates)`。
- 通用 `showLabels: false` 可以隐藏大部分标签；各图另有专用选项：
  - 饼图 `labelMode: "none"`；环形图 `centerValue: null`、`legend: "none"`；方格比例图 `summary: false`；矩形树图 `labelMode: "none"`；热力图 `showValues: false`、`legend: false`；漏斗图 `showRates: false`；分段条 `list: true/false`。
  - 地图类 `legend: false`，不要传 `labels: "none"`（该选项只接受 auto/ko/en）。
- 静态 SVG 输出仍保留坐标轴和少量标签；在 360×200 的画框里能辨认形态，也保留了必要的方向感。

## 六、许可汇总

- ztd-charts：MIT，可商用；地图边界数据为公共领域。
- Observable Plot：ISC；Vega / Vega-Lite：BSD-3-Clause；RAWGraphs：Apache-2.0；Glide / TanStack / RevoGrid：MIT。
- AG Grid Community：MIT；Enterprise 付费。
- Handsontable：商业使用收费。
- Datawrapper：专有 SaaS，只借鉴布局，不复制图片或代码。

本项目没有新增依赖，预览、编辑和英文生成全部使用现有 ztd-charts、React 和本地 TypeScript 代码。
