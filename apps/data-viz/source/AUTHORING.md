# 数据图表英语 · 内容规范

内容源只有两处：`content/data-viz/library/<type>.json`（图表类型的语言库）和
`content/data-viz/topics/<slug>.json`（主题数据与作者内容）。页面、数据包、sprite
全部由 `apps/data-viz/source/build.py` 生成，不要手改 `apps/data-viz/` 下的产物。

改完内容：

```powershell
.venv\Scripts\python.exe -I apps\data-viz\source\validate.py
.venv\Scripts\python.exe -I -X utf8 apps\data-viz\source\build.py
# 看某个视图生成出来的句子：
.venv\Scripts\python.exe -I -X utf8 apps\data-viz\source\build.py --explain <slug>/<view>
```

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

每个主题 1–3 个视图，每个视图 4–8 条作者特征、5 段整图描述。

```json
{
  "id": "online-shopping",
  "title_en": "Online Shopping Share",
  "title_zh": "网购占比",
  "blurb_zh": "线上零售份额怎么爬升",
  "scene_zh": "一份全国零售样本（模拟数据）",
  "demo": true,
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

每条作者特征至少覆盖一个存在的 mark；一个特征可以覆盖多个相邻段（line 的
`seg:...:0` + `seg:...:1`），构建会把 `from/to/period` 合成整段。

## 语言库

每个 kind 需要：`label_zh`、`requires`、≥3 个覆盖 spoken/neutral/written 的
`words`、≥2 条 `patterns`（至少一条 A2）、`compare` 引用、`traps`、三条 `registers`。
模板只能使用这些槽位：

```
{subject} {from} {to} {unit} {period} {from_period} {to_period} {pct} {pp}
{delta} {gap} {peak} {peak_period} {share} {share_number} {category} {rank}
{rank_before} {source} {target} {x} {y} {value} {row} {col} {entity}
{series_name} {top_category} {top_value} {x_value} {y_value} {direction}
{group} {start} {end} {signed} {total}
```

`registers` 必须是槽位模板，不能写死某个主题的实体（校验器会拦）。具体例句放
`examples`。

## 生成与作者内容的分工

- **作者写**：数据、每条特征的例句 / 备注 / 解读、整图五段描述、`overview_zh`。
- **构建生成**：每个 mark 的分类、槽位数值、词汇卡、句型填空、三种语境句、
  表格、tooltip、画廊小图。

分类阈值在 `apps/data-viz/source/features.py`：线图/堆叠变化 3% / 10% / 25%
（份额数据用 0.5 / 1.5 / 3 个百分点），散点 |r| 0.2 / 0.4 / 0.7，离群点
残差 > 2σ。改阈值只改这一个文件。

## 自检

- 内容：`validate.py` 必须 0 问题。
- 产物：`build.py`，再用 `audit_build.py --label before/--diff` 证明没碰别的应用。
- 浏览器：`node tools/preview_site.mjs` 打开 `/data-viz/`，过一遍手机宽度、
  light/dark/glass、点读（有音频时）、表格和返回链接。

## 页面里改数据

工作表里的“编辑数据”允许读者改数值、类别名、系列名、分组和节点；图表、表格、提示、
词汇、句型、描述与解读都按当前数据重算。为此浏览器端有两份运行时模块：

- `apps/data-viz/js/05-compute.js`：`source/features.py` 的逐条移植（分类阈值、槽位、数字格式完全一致）。
- `apps/data-viz/js/06-text.js`：按当前特征从语言库的句型框架生成整图描述；作者写的
  `descriptions` / `overview_zh` 只在未改数据时显示，避免改完数据后留着旧数字。

改了 `features.py` 或 `05-compute.js` 的任何一方，都要跑：

```powershell
node tests\dataviz-parity.mjs
node tests\dataviz-text.mjs
```

第一条同时比较原始数据和改过数值的数据（每个视图两份样本），要求所有 mark 的
kind 与 slots 完全一致；第二条把每个视图的 A2/B1/B2/雅思/商务和中文总结都生成
一遍，拦截空槽位、双空格、百分号、基数词排名和散点因果措辞。不一致时先修引擎，
不要改测试。

## 视觉与交互（全站统一）

- 所有表面都要有圆角：卡片/面板用 `--radius-card`，控件与图片用
  `--radius-control`，徽章和分段控件用 999px。SVG 里的柱、热力格、桑基节点
  用 `rx` 2–4；不要留直角矩形，包括画廊 mini 图。
- 男女声切换如果以后加音频，统一用 `.seg`（药丸槽 + 30px 内嵌墨色药丸 +
  喇叭图标），不要再造 `.voices` / `.voice-seg` 这类新样式。
- 按钮的缓动/弹簧和页面平滑滚动由部署时注入的 `/theme.css` 统一提供；
  `style.css` 不要覆盖 `transition: transform` 或 `scroll-behavior`。
- 圆角只是外观，不改变图表读数和“只有相关、没有因果”的表述。
