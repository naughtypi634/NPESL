# 数据图表英语 · 内容规范

内容源只有两处：`content/data-viz/library/<type>.json`（图表类型的语言库）和
`content/data-viz/topics/<slug>.json`（主题数据与预先写好的例句）。数据包由
`apps/data-viz/source/engine/`（Rust）生成，页面由 `apps/data-viz/web/`
（React + TypeScript + Vite + ECharts）构建；`web/public/data/` 与 `dist/`
都是产物，不要手改。

改完内容：

```powershell
cargo build --release --manifest-path apps\data-viz\source\engine\Cargo.toml --target-dir build\rust\data-viz
build\rust\data-viz\release\dv-engine.exe validate
build\rust\data-viz\release\dv-engine.exe build
npm --prefix apps\data-viz\web run build
# 看某个视图生成出来的句子：
build\rust\data-viz\release\dv-engine.exe build --explain <slug>/<view>
```

页面只有两段：首页（按「我想学」的五个目标、领域、图表类型筛选卡片）和详情页
（一张大图、右侧「这处变化怎么说」、底部编辑数据）。五个目标由
`source/engine/src/goals.rs` 的 kind 映射自动算出，构建时写进
`web/public/data/index.json` 的 `kind_goals`；内容里不需要给每张图手写目标标签。

## 硬规则

- 美式英语。`color` / `center` / `realize` / `traveling` / `apartment` / `subway` /
  `takeout` / `on the weekend` / `different from`；`percent` 不加 s，英文句子里
  写 `percent`，不写 `%`。
- 数据是模拟数据，页面上永远保留 `Demo data · 模拟数据`。不写“根据统计”“真实调查”。
- 散点只讲相关，不讲因果；`cause / leads to / results in / due to / because of`
  在散点文本里会被校验器拦下。用 `is associated with / suggests / appears to`。
- 不显示计数、进度、已学或完成标记；不加“N 个主题 / N 种图表”这类说明。
- 例句要有具体画面：具体场景、具体数字、具体动作。
- 中文只出现在 `zh` / `*_zh` 字段，英文只出现在 `en` 字段。

## 主题文件

每个主题 1–8 个视图（目前每个主题 2 个），每个视图 4–8 条预先写好的特征、5 段整图描述。

```json
{
  "id": "online-shopping",
  "title_en": "Online Shopping Share",
  "title_zh": "网购占比",
  "blurb_zh": "线上零售份额怎么爬升",
  "scene_zh": "一份全国零售样本（模拟数据）",
  "demo": true,
  "domain": "economy",
  "views": [{
    "id": "share", "type": "line",
    "label_zh": "线上占比", "label_en": "Online share",
    "subject": "Online shopping's share of retail spending",
    "subtitle_en": "Share of retail spending that happens online.",
    "unit": { "en": "percent", "short": "%", "decimals": 1, "kind": "percent", "points": true },
    "x": { "label_en": "Year", "values": ["2019", "2020"] },
    "series": [{ "id": "online", "name_en": "Online", "name_zh": "线上", "slot": 1, "values": [20.7, 24.9] }],
    "features": [{
      "id": "os-rise", "kind": "rise_steady",
      "marks": ["seg:online:0"],
      "examples": [{ "en": "Online's share rose from 20.7 percent in 2019 to 24.9 percent in 2020.", "zh": "……" }],
      "note_zh": "为什么用这个词。",
      "interpret_zh": "这张图能说明什么、不能说明什么。"
    }],
    "overview_zh": "整张图怎么读。",
    "descriptions": {
      "general": { "a2": "……", "b1": "……", "b2": "……" },
      "ielts": "……",
      "business": "……"
    }
  }]
}
```

### 主题字段

`domain` 取 `business` / `technology` / `lifestyle` / `economy` / `education`，
用于首页的领域筛选；缺了或写错校验器会拦。

### unit

- `kind: "percent"`：`fmtValue` 输出 `27.2 percent`；`points: true` 表示份额数据，
  变化按百分点判断（避免 27%→30% 被说成“大幅增长”）。
- `scale`：数据用万/千为单位时，句子会乘回真实数量。例如 `scale: 10000` 时
  值 `1410` 读作 `14.1 million orders`（配 `million: true`）。
- `decimals` 同时用于图表刻度和句子；percent 常用 1，人数常用 0。

### marks

| 类型 | 可点的 mark |
|---|---|
| line | `seg:<seriesId>:<i>`、`pt:<seriesId>:<i>` |
| bar | `bar:<seriesId>:<i>` |
| pie | `slice:<partId>` |
| scatter | `pt:<pointId>`、`grp:<groupId>`、`all` |
| stacked | `seg:<xIndex>:<seriesId>`、`stack:<xIndex>` |
| heatmap | `cell:<rowId>:<colId>`、`row:<rowId>`、`col:<colId>` |
| sankey | `link:<source>-><target>`、`node:<id>` |
| slope | `line:<entityId>`、`pt:<entityId>:<periodIndex>` |
| waterfall | `step:<stepId>`、`total:start`、`total:end` |

每条预先写好的特征至少覆盖一个存在的 mark；一个特征可以覆盖多个相邻段（line 的
`seg:...:0` + `seg:...:1`），构建会把 `from/to/period` 合成整段。

## 语言库

每个 kind 需要：`label_zh`、`requires`、≥3 个覆盖 spoken/neutral/written 的
`words`、≥2 条 `patterns`（至少一条 A2，另至少一条 B1 或 B2）、`compare` 引用、
`traps`、三条 `registers`。界面只显示 Basic / Advanced 两档：Basic 取 A2，
Advanced 取 B1（没有 B1 时取 B2）；整图描述 Basic 取 `general.a2`，Advanced 取
`general.b2`（没有 B2 时取 `general.b1`）。A2/B1/B2 字段本身不改。模板只能使用这些槽位：

```
{subject} {from} {to} {unit} {period} {from_period} {to_period} {pct} {pp}
{delta} {gap} {peak} {peak_period} {share} {share_number} {category} {rank}
{rank_before} {source} {target} {x} {y} {value} {row} {col} {entity}
{series_name} {top_category} {top_value} {x_value} {y_value} {direction}
{group} {start} {end} {signed} {total}
```

`registers` 必须是槽位模板，不能写死某个主题的实体（校验器会拦）。具体例句放
`examples`。

## 生成内容与预先写好内容的分工

- **预先写好**：数据、每条特征的例句 / 备注 / 解读、整图五段描述、`overview_zh`。
- **构建生成**：每个 mark 的分类、槽位数值、词汇卡、句型填空、三种语境句、
  图表提示、画廊小图。没有预先写好例句的位置由页面按当前数据生成句子，并标
  「自动生成」；预先写好的例句只是额外参考，不是每处都必须写。

分类阈值在 `apps/data-viz/source/engine/src/features.rs`：线图/堆叠变化 3% / 10% / 25%
（份额数据用 0.5 / 1.5 / 3 个百分点），散点 |r| 0.2 / 0.4 / 0.7，离群点
残差 > 2σ。改阈值只改这一个文件。

## 自检

- 内容：`dv-engine validate` 必须 0 问题。
- 数据包：`dv-engine build`；页面：`npm --prefix apps/data-viz/web run build`。
- 目标标签：`node tests/dataviz-goals.mjs`，检查五个目标每个至少 3 个主题、所有
  kind 都有归属、每个主题的 `views[]` 和 `goals` 一致。
- 浏览器：`node tests/dataviz-ui.mjs`（自己起 Vite、只开一个无头 Edge，跑完关闭），
  过首页筛选、卡片预览、详情点选、上一处/下一处、每种图表的拖动/输入、三套主题和
  390 px 宽度。也可以 `npm --prefix apps/data-viz/web run dev` 手工看。
- 引擎一致性：`node tests/dataviz-parity.mjs`；文本质量：`node tests/dataviz-text.mjs`。
- data-viz 随主站部署在 `/charts/`，首页不列入入口；部署主站会自动带上 `charts/`，旧 `/data-viz/*` 301 到 `/charts/*`。

## 页面里改数据

详情页底部有「编辑数据」开关，默认关着：

- 折线、柱状、瀑布、斜率、散点可以拖动数据点；饼图按住一块边缘沿圆周拖，其他块
  按比例补足；其余图表（堆叠、热力、流向）用选中位置下方的数值输入框改。
- 只改数值，不改系列名、类目名、节点名、周期名。改完图表、生成句、句型里的数字
  一起更新。
- 预先写好的 `examples` 按原始数据写，改数据后隐藏；右侧改用当前数据生成的句子。
  点「还原」恢复原始数据和原句。
- 编辑状态按「主题/视图」保存在内存里，切换视图或离开再回来仍在，刷新页面丢失。

为此浏览器端有两份运行时模块：

- `apps/data-viz/web/src/engine/05-compute.js`：`source/engine/src/features.rs` 的逐条移植（分类阈值、槽位、数字格式完全一致）。
- `apps/data-viz/web/src/engine/06-text.js`：按当前特征从语言库的句型框架生成整图描述；预先写好的
  `descriptions` / `overview_zh` 只在未改数据时显示，避免改完数据后留着旧数字。

改了 `engine/src/features.rs` 或 `web/src/engine/05-compute.js` 的任何一方，都要跑：

```powershell
node tests\dataviz-parity.mjs
node tests\dataviz-text.mjs
```

第一条同时比较原始数据和改过数值的数据（每个视图两份样本），要求所有 mark 的
kind 与 slots 完全一致；第二条把每个视图的 A2/B1/B2/雅思/商务和中文总结都生成
一遍，拦截空槽位、双空格、百分号、基数词排名和散点因果措辞。不一致时先修引擎，
不要改测试。

## 视觉与交互（全站统一）

- 所有表面都要有圆角：卡片/面板用 `--radius-card`，控件与输入用
  `--radius-control`，徽章和分段控件用 999px。ECharts 里的柱、饼块、热力格
  用 `borderRadius` 2–6；不要留直角矩形，包括画廊 mini 图。
- 分段控件统一用 `.seg`（药丸槽 + 内嵌墨色药丸），不要再造新样式。
- 按钮的缓动/弹簧和页面平滑滚动由部署时注入的 `/theme.css` 统一提供；
  `web/src/index.css` 不要覆盖 `transition: transform` 或 `scroll-behavior`。
- 圆角只是外观，不改变图表读数和“只有相关、没有因果”的表述。
