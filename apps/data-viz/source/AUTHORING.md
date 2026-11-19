# 数据英语表达图鉴 · 内容写作规范

这是 `/charts/` 的内容源。页面与内容分开：`content/data-viz/atlas/` 是唯一来源，`apps/data-viz/web/` 只负责显示。

## 这个产品是什么

学习者打开一张图，直接看到：

- 这张图在讲什么，怎么读；
- 哪些数据值得注意（已经写好的结论，不是提问）；
- 描述这张图可以用哪些词、句型和完整说法；
- 同一组数据在雅思学术写作、商务汇报和简单英语里分别怎么说。

**不是做题网站。** 不写 quiz、exercise、challenge、your turn、fill in the blanks、multiple choice，不要求学生输入、拖拽、改数据或回答任何问题。所有教学内容直接展示。

## 目录

```
content/data-viz/atlas/
  site.json          首页文案与三个入口
  families.json      九个图表大类
  chart-types.json   47 种图表：中文名、一句话说明、关联表达分类、数据集
  datasets/          模拟数据（数字的唯一来源）
  expressions/       16 个表达功能分类
  lessons/           每种图表一篇（47 篇）
  contexts/          七个真实场景
```

## 数字规则（构建会检查）

课程里的英文句子只要出现阿拉伯数字，就必须能在该课数据集中找到，或者是能由数据集算出来的差值、变化率、占比、分组求和。否则构建失败。

写之前先看数据：

```powershell
node apps\data-viz\web\scripts\build-content.mjs --inspect quarterly-sales
```

不要写“大约一半”“超过三倍”这种和数字对不上的话。数字后面带单位时，单位要和 `unit_en` 一致：数据集以千美元为单位，就写 `420`、`$420K`，不要写 `$420,000`。

## 英式英语与措辞

构建会按 `tools/verify/rules.py` 的美式规则扫描全部英文：`colour`、`centre`、`analyse`、`programme`、`at the weekend` 等一律失败。例句要当代、具体、有画面，不写教科书套话。

## 数据集 datasets/*.json

```json
{
  "id": "quarterly-sales",
  "title_en": "Quarterly sales by region",
  "title_zh": "各地区季度销售额",
  "unit_en": "thousand US dollars",
  "unit_short": "K",
  "decimals": 0,
  "note_zh": "模拟数据：……",
  "rows": [{ "quarter": "2024-Q1", "region": "East", "sales": 420 }]
}
```

行里的字段名要能直接用于 ztd-charts 的 `encoding`。密集数据可以用 `generate`（`daily`、`distribution`、`series_grid`、`us_states`、`heatmap_grid`），生成规则在 `scripts/build-content.mjs` 里，结果确定、不含随机数。

## 表达分类 expressions/*.json

```json
{
  "id": "trend-up",
  "order": 3,
  "name_en": "Upward trends",
  "name_zh": "上升趋势",
  "intro_zh": "……",
  "intro_en": "……",
  "expressions": [
    {
      "id": "increase",
      "head": "increase",
      "kind": "verb",
      "meaning_zh": "上升；增长",
      "pattern": "increase + adverb / a significant increase in + noun",
      "cefr": "A2",
      "register": "neutral",
      "scenes": ["academic", "business", "everyday"],
      "collocations": ["increase sharply", "a steady increase"],
      "examples": [
        { "en": "Sales increased sharply from 420 to 690.", "zh": "销售额从 420 大幅增长到 690。", "chart": "line" }
      ],
      "contrast_zh": "increase 最中性；jump、surge、soar 幅度更大，也更口语。"
    }
  ]
}
```

- `scenes` 只能取 `academic` / `business` / `everyday`。
- `cefr` 取 A1/A2/B1/B2/C1；`register` 取 neutral/formal/informal。
- 每条至少两个搭配、一个带中文的例句；`contrast_zh` 说明它和近义词的差别，不能只写“同义词”。
- 例句里的 `chart` 必须是 47 种图表之一；带 `chart` 的例句，数字要能从那张图的数据集里找到。

## 图表课 lessons/<图表 id>.json

文件名就是 ztd 图表类型（`line.json`、`pie.json`、`barRace.json`……），必须覆盖全部 47 种。

```json
{
  "chart": "line",
  "dataset": "quarterly-sales",
  "spec": {
    "encoding": { "x": "quarter", "y": "sales", "series": "region" },
    "options": { "highlight": "West", "height": 380 }
  },
  "overview": {
    "purpose_zh": "这张图用来看……",
    "works_zh": ["适合……", "适合……"],
    "uses_zh": ["季度经营回顾", "……"]
  },
  "understanding": {
    "read_zh": "先看……再看……",
    "elements": [
      { "name_en": "x-axis", "name_zh": "横轴", "note_zh": "……" }
    ],
    "look_for_zh": ["……", "……"]
  },
  "observations": [
    { "en": "West grew from 190 to 415, the fastest of the four regions.", "zh": "西部从 190 增长到 415，是四个地区里最快的。" }
  ],
  "describe": [
    {
      "group": "trend-up",
      "expression": "increase",
      "en": "West increased steadily from 190 in 2024-Q1 to 415 in 2025-Q4.",
      "zh": "西部从 2024 年一季度的 190 稳步增长到 2025 年四季度的 415。",
      "pattern": "increase + adverb + from ... to ...",
      "alternatives": ["West rose steadily from 190 to 415.", "There was a steady rise in West sales, from 190 to 415."],
      "note_zh": "两个端点都要给，听的人才不用自己算。"
    }
  ],
  "descriptions": {
    "academic": { "en": "...", "zh": "..." },
    "business": { "en": "...", "zh": "..." },
    "simple": { "en": "...", "zh": "..." }
  },
  "language_notes": [
    { "title_en": "increase by vs increase to", "body_zh": "……", "examples": ["Sales rose by 64.", "Sales rose to 690."] }
  ],
  "related": {
    "charts": ["area"],
    "groups": ["trend-up", "degree"],
    "contexts": ["ielts", "business-presentations"]
  }
}
```

要求：

- `observations` 至少 3 条，是**直接给出的结论**，不是问题。
- `describe` 至少 5 条，覆盖至少 3 个表达分类；`group` 必须是已有分类，`expression` 必须是该分类里已有的表达。
- 三段完整描述：Academic / Business / Simple，每段至少 40 个英文词，中文翻译齐全。三段说同一组数据，语气和用词不同。
- `language_notes` 至少 2 条，只讲这张图真正用得上的语法或搭配区别。
- `related.charts` / `groups` / `contexts` 都要真实存在。
- `spec.options` 里设置 `highlight`；图表高度建议 340–420。

## 场景 contexts/<id>.json

```json
{
  "id": "ielts",
  "order": 1,
  "name_en": "IELTS Academic",
  "name_zh": "雅思学术类写作 Task 1",
  "intro_en": "…",
  "intro_zh": "…",
  "moves": [
    { "name_en": "Open with what the chart shows", "name_zh": "开头点明图表内容", "examples": ["The chart shows…"] }
  ],
  "focus_groups": ["chart-intro", "overall"],
  "charts": ["line", "bar", "pie"],
  "worked": { "chart": "line", "en": "…", "zh": "…" },
  "pitfalls_zh": ["…", "…"]
}
```

`worked.en` 至少 50 词；`charts` 至少 3 个且真实存在；`focus_groups` 至少 3 个。

## 构建与检查

```powershell
node apps\data-viz\web\scripts\build-content.mjs --check
node apps\data-viz\web\scripts\build-content.mjs
.venv\Scripts\python.exe -I tools\build_all.py --only data-viz,site
.venv\Scripts\python.exe -I tools\verify.py --fast
```

只看数据集：

```powershell
node apps\data-viz\web\scripts\build-content.mjs --inspect delivery-times
```

## 实时分析与数据编辑

图表详情页现在可以改数据。注意职责划分：

- **内容源（本目录）** 仍然保存人工编写的课程、观察、表达和完整范文。这些是“原始示例数据”的版本，不要在内容里写会随用户编辑变化的数字。
- **实时分析** 在 `apps/data-viz/web/src/atlas/live/`，按图表类型分派适配器，从当前行数据计算极值、排名、占比、趋势、分布、相关、流程、地图、KPI 等事实，再生成 Academic / Business / Everyday 三段英文和对应中文。它不调用外部服务，也不修改内容文件。
- 用户修改数据后：图表重新渲染、高亮跟着新的排名/极值走、Live English 与三段完整描述从同一份计算结果更新；原始课程内容保留在 “Original sample data” 下并明确标注，避免把旧结论当成当前事实。
- 编辑只发生在页面状态里；`Restore original` 和 `Undo` 可以回到原始数据，内容源与构建产物不会被写回。
- 新增图表类型时，除了本文件要求的课程内容，还要在 `live/index.ts` 里给它指定适配器（或复用同类适配器），并跑 `node tests/dataviz-analysis.mjs` 与 `node tests/dataviz-live.mjs`。

## 缩略预览

`scripts/build-content.mjs` 在构建时用 ztd 自己的 `renderSpecToSVG` 为每种图表生成浅色/深色两张静态 SVG，放在 `public/data/previews/`，目录页只加载 `<img loading="lazy">`。不要手改这些 SVG；改图表 spec 或数据后重新构建即可。
