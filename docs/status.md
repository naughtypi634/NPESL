# 状态与易变事实

本文件是 NPESL 唯一允许写计数、日期、门禁基线和一次性授权的地方。它不是规范；规范见根 `AGENTS.md` 与 `README.md`。

- last_verified: 2026-11-23
- 维护方式：计数或门禁基线变化时更新本文件；规范文件不写会变的数字。

## 应用与内容计数

| 项 | 值 | 来源 / 说明 |
|---|---|---|
| 线上应用 | 7 个 | 入口页 `apps/site/index.html` 的链接：phonics / ipa / drill / conversation / phenomena / collocation / visual-vocabulary |
| data-viz | 已部署，隐藏入口 | 主站 `https://npesl.pages.dev/charts/` 直达；首页 `apps/site/index.html` 不列入入口。`content/data-viz/atlas/`（图表课 / 表达分类 / 模拟数据集 / 场景）+ `apps/data-viz/web/`（React + ztd-charts）；三个入口 Charts / Expressions / Real-world Contexts；`/data-viz/*` 301 到 `/charts/*` |
| Question Drill | 2,247 题 | `content/drill/questions.json`；`extra-questions.json` 另有 192 道补充题 |
| 短语搭配 | 41 个主题 / 3,296 条 / 6 大类 | `content/collocation/themes.json` + 41 个主题 JSON |
| Conversation Starters | 150 个故事 / 503 段 | `content/conversation/{A1,B1,ESLSE}/content.py`（每级 10 单元 × 5 故事） |
| Phonics | 48 课 | `apps/phonics/source/content/` |
| IPA | 40 音标 × 10 词 × 男女两版 | `apps/ipa/` |
| Phenomena | 30 章 | `apps/phenomena/source/`（音频 + `phenomena.json`）→ `apps/phenomena/web/`（React + Vite，产出 `dist/`）。地址不变：`/phenomena/` 与 `/phenomena/<slug>.html`。`/phenomena/*` 不注入全站 `theme.css`，自带 coss 令牌与浅色/深色两套主题。**coss 试点，未部署** |
| Visual Vocabulary | 7 主题 / 36 场景 / 275 热点 / 等距皮克斯（线上） | `content/visual-vocabulary/` → `tools/vv/` → `apps/visual-vocabulary/` |

## 语音后端

| 应用 | 后端 |
|---|---|
| Phonics / IPA | Azure F0（Ava / Andrew） |
| Phenomena | 本地 CosyVoice 3（女 `h2` / 男 `c`）；第 1/6/13/20/21 课按完整拼写读，其余课保留安全口语拼写；`'` 开头及 `whaddaya`/`doncha`/`c'mon` 等不稳定写法退回原词 |
| Conversation | 本地 Qwen3-TTS Base 克隆音色（女 `h2` / 男 `c`）；母版由 `build/qwen-voicedesign/gen_corpus.py` 生成，逐词时间由 `add_timings*.py` 补齐 |
| Collocation | 默认 Azure（Ava / Andrew）；`--tts qwen|edge|kokoro` 可选，同一页面不得混用音源 |

CosyVoice 3 本地环境：`F:\AIProject\CosyVoice`（仅 Phenomena 合成时使用；部署只带 sprites，逐条母版留在 `apps/phenomena/audio/`）。
Qwen3-TTS 本地环境：`F:\AIProject\tts-lab`（仅 Conversation 合成时使用，不是构建/部署依赖）。

## 门禁基线

- 2026-11-22：图解词汇重做为「七个主题 · 一层落地页 · 三种画风」。
  - 主题 7 个：厨房 / 家居 / 服装 / 食物 / 身体部位 / 美妆与护肤 / 出行；场景 36 个、热点 292 个、词卡 7 套。`home` 的 227 张词卡拆成厨房 60 张 + 家居 167 张，`home/index.html` 下线。
  - 交互：命中改为按物件范围框（重叠取面积最小的），点物件任意位置都能选中；模拟命中率 54% → 96%。卡片视图恢复（上一轮改发光时误删的样式）。
  - 层级：每个主题只有一张落地页（场景缩略图 + 分组词卡），所有页面顶部有七个主题的直达条；去掉跨主题的线性翻页，场景页只保留「返回主题 + 同主题前后」。
  - 场景定稿为**等距皮克斯 3D**（统一低饱和色板、俯视 25°、平行透视、物品分离不遮挡），36 个场景从零生成，逐件人工标定坐标。未画出的物件从该场景热点中移除，词卡表不变。
  - 高亮改为**按标注框显示的柔和描边**（不再用自动抠图遮罩）：位置来自逐件标注，任意物件都不会出现光晕错位。
  - 补齐内衣场景里已画出但没标的 `boxer shorts`。
- 2026-11-21：图解词汇改为「场景 + 卡片」双视图。
  - 场景 36 个：厨房 7 区（水槽 / 灶台 / 备餐 / 小家电 / 冰箱 / 储物 / 清洁角）、房间 7 处（客厅 / 卧室 / 卫浴 / 餐厅 / 书房 / 家务区 / 玄关）、衣柜 / 鞋 / 包 / 上衣 / 下装、果蔬 / 乳品 / 饮料 / 肉类 / 冷冻 / 香料、梳妆台、行李箱；共标注 221 个词。
  - 交互：每个物件一个淡白点，指到或点中放大；点图取最近的物件，点空处不响应。同一页可切到卡片视图，用原有高清物件图集中背词（新增 `vv.css` / `vv.js` 共用层）。
  - 新增 Cooking 烹饪动作 27 个（焯水、蒸、煮、小火慢炖、煎、炒、油炸、烤、烘焙、焖、煲、烧烤、煸炒、腌制、调味、搅拌、搅打、揉面、切丁、切丝、切片、剁碎、切碎、削皮、刨丝、沥干、装盘），配新录 Qwen3-TTS（`h2` / `c`）与配图。
  - 词库补 `glass`、`freezer`（物件图 + 录音按原管线补齐）。
- `tools/verify.py` 已于 2026-11-18 给 `check_bre` 加 `--strict`；`check_bre.py` 只扫 Markdown，HTML/JSON 内容靠各 app validator。
- 2026-11-18：用 Claude Code 2.1.318 做无工具单轮测试，根 `CLAUDE.md` 的 `@AGENTS.md` 导入生效（模型能引用 `AGENTS.md` 首段）；新会话仍建议用 `/context all` 复核。
- 2026-11-18：`check_bre.py --strict apps content` → FIX 0，REVIEW 3（`chips`×2、`surgery`×1，均为词义提示，人工判断）。
- 2026-11-19（迭代二）：data-viz 增加真实缩略预览、双栏学习布局与可编辑数据。
  - 预览：构建期用 ztd `renderSpecToSVG` 生成 47 种图表 × 浅/深两套静态 SVG；目录页用 `<img loading="lazy">`，不再同时挂 47 个实时图表；详情页仍用实时 Chart。首屏只预加载 React，ztd 图表包延迟到详情页。
  - 布局：桌面粘性图表 + 右侧内容 + 粘性章节导航（84px 偏移），移动端单列、横向滑动导航；编辑区在右栏内展开，不遮盖图表。
  - 实时联动：`src/atlas/live/` 按 47 种图表类型计算极值、排名、占比、趋势、分布、相关、流程、地图、KPI 等；改动数据时图表高亮、Live English、三段完整描述和中文同步更新；原始课程内容保留并标为原始示例。支持撤销、恢复原始数据、空值/零值/负值。
  - 测试：`verify.py` 248 页 21/21 PASS，data-viz 内容 `content ok: 47 charts, 174 expressions, 7 contexts, 35 datasets`；`node tests/dataviz-live.mjs` 13/13（47 预览、47 图表改数据/重置、撤销、三主题预览、双栏/粘性/导航、手机编辑器）；`node tests/dataviz-ui.mjs` 24/24；`node tests/dataviz-analysis.mjs` 47/47（原始/全零/全相等/负值/整体改动，无 NaN/Infinity）。
  - 研究：`docs/research-dataviz-playground.md`；没有新增依赖。
- 2026-11-19：data-viz 重建为「数据英语表达图鉴」（Data Visualization × English Expression Atlas），三个入口 Charts / Expressions / Real-world Contexts；不再做题、不改数据、不判分。
  - 内容：47 种 ztd 图表（9 大类）各一篇课；16 个语言功能分类共 174 条表达；35 个模拟数据集；7 个真实场景（雅思 / 商务演示 / 销售 / 财务 / 职场报告 / 教育 / 日常）。资料研究见 `docs/research-sources.md`。
  - 内容闸门：`apps/data-viz/web/scripts/build-content.mjs` 校验英式英语、练习/问答式措辞、编造数字（只允许数据集值及其差值 / 占比 / 分组和）、失效交叉链接与图表 spec；`verify.py` 每次自动跑。
  - 页面：React + TypeScript + Vite + ztd-charts 0.13.1，Light / Dark / Glass 三主题，部署在 `/charts/`；无计数、无进度、无已学标记；所有数据标 `Demo data · 模拟数据`。
  - 验证：完整 `verify.py` 一次通过 —— 248 页 · 786 链接 · 2,785 资源 · 8,096 条音频引用 · 1,395 张 VV 图片；可见文本 78,819 词，英式英语存量 85、新增 0；collocation / phonics / phenomena / data-viz 四个 validator 通过；运行时 21/21，248/248 页。`node tests/dataviz-ui.mjs` 23/23（三入口、47 图目录、详情页五段、表达筛选、场景范文、三主题、390px 无横向溢出、无 console 错误）。
  - 架构：Rust `dv-engine`、浏览器特征引擎 `05-compute.js`、`dataviz-parity/text/goals` 测试全部退役；旧 `content/data-viz/{manifest,library,topics}` 不再参与构建。
- 2026-11-18 完整 `verify.py`（staging 定稿后跑一次）：音频引用 PASS（248 页，0 缺失）；英式英语 PASS；冒烟 27/33。
  - 5 个时序用例在整套并发负载下失败：`conversation-playall`、`conversation-zh`、`collocation-index`、`collocation-chunk-variants`、`collocation-noun-uses`。代表用例 `conversation-playall` 单跑 PASS；视觉层会话报告其余用例单跑通过。按规则不重跑整套，判定为负载抖动。
  - `data-viz-describe` 报 `TypeError: Cannot read properties of undefined (reading 'select')`。data-viz 未部署，`/data-viz/` 302 回首页；`tests/smoke.mjs` 的 `HAS_DATA_VIZ` 用 `fetch().ok` 判定，跟随 302 后误判为存在，导致 data-viz 用例在首页上运行。这是测试跳过判定问题，不是线上缺陷。2026-11-18 已修：改为 `redirect: 'manual'` 且只认 200。
- 2026-11-18（卡片回弹修正后）完整 `verify.py`：音频引用 PASS（247 页，0 缺失）；英式英语 PASS（FIX 0，REVIEW 3 同上）；冒烟 17/20，失败项为 `collocation-index`、`collocation-chunk-variants`、`collocation-noun-uses` 三个时序用例，代表用例 `collocation-index` 单跑 PASS（delta 0.008s），与上一条的负载抖动一致。
- `tests/smoke.mjs` 覆盖七个线上应用；data-viz 用例在暂存没有该目录时自动跳过（2026-11-18 修正了 302 误判）。
- 2026-11-19：Phenomena 切换 CosyVoice 3 H2/C 后完整 `verify.py`：248 页 · 786 链接 · 2,785 资源 · 8,096 条音频引用 · 1,395 张 VV 图片；可见文本 78,819 词，英式英语存量 85、新增 0；collocation / phonics / phenomena 校验通过；运行时 21/21，248/248 页；PASS。
- 2026-11-18：`tools/verify.py` 重做为四层结果导向验证：全站链接/资源、可见文本（英式英语 + 禁用文案）、内容 validator、无头浏览器全站巡检 + 七应用点读/交互；运行时层默认屏蔽图片下载，音频走本地 `build/cloudflare-audio`。
  - 首次扫描发现 conversation 构建页存量英式英语 85 处（B1 74 / A1 11），旧 `check_bre.py` 只扫 Markdown 未发现；存量写入 `tools/verify/british_baseline.json`，新增命中阻断，报告每次显示存量数。
  - 2026-11-18 staging 定稿后的正式结果：247 页 · 785 链接 · 2,776 资源 · 8,096 条音频引用 · 1,395 张 VV 图片全部解析；可见文本 78,817 词，英式英语存量 85、新增 0；collocation / phonics / phenomena 三个 validator 通过；运行时 21/21（20 个点读/交互用例 + 247 页巡检），单次 1 分 47 秒（`--fast` 约 4 秒）。
  - `tests/smoke.mjs` 与 `tools/check_assets.py` 已删除；旧 `check_bre.py` 保留为手动 Markdown 工具，不在交付门禁里。
- 2026-11-18：data-viz 构建、校验与特征引擎从 Python 迁到 Rust（`apps/data-viz/source/engine/`，命令 `dv-engine validate|build|parity-dump`）。
  - 产物：39 个生成文件与旧 Python 构建器逐字节一致（SHA-256 全等，gallery 仍为 `051e37e873`）；临时快照已在验收后清理。
  - 引擎：Python 与 Rust 在 80 个视图样本（原始 + 改数）上 `compute` 输出全等；`--explain` 输出逐行一致。
  - 测试：`node tests/dataviz-parity.mjs`（Rust 引擎 vs 浏览器 `05-compute.js`）80 样本 1836 mark，0 差异；`node tests/dataviz-text.mjs` 40 视图 240 段文本通过。
  - `build_all.py --only data-viz` 先 `cargo build --release`（target-dir `build/rust/data-viz`）再跑引擎；cargo 不在 PATH 时回退 `~/.cargo/bin`。
- 2026-11-18：data-viz 前端改为 React + TypeScript + Vite + ECharts 四段式（`apps/data-viz/web/`）；Rust 引擎改为输出 JSON 数据包（`web/public/data/`），不再生成页面；旧的 vanilla JS 与 `index.html` 已删除。构建链是 `cargo → dv-engine build → npm run build → dist`，`build_cloudflare_site.py --with-data-viz` 复制 `dist`。
  - 内容：20 个主题全部加 `domain`（business / technology / lifestyle / economy / education），`dv-engine validate` 拦截非法值。
  - 测试：`node tests/dataviz-parity.mjs` 80 样本 1836 mark 0 差异；`node tests/dataviz-text.mjs` 40 视图 240 段通过；`node tests/smoke.mjs --match data-viz` 10/10（画廊、工作台、改数据、数据表、9 种图表、表达实验室、真实数据、深链、glass 主题、返回链接）。
  - 视觉：圆角统一为卡片 20 / 控件 12 / 徽章与分段 999；画廊 20 个 ECharts mini 图；移动端无横向溢出。
- 2026-11-18：data-viz 改为「看图表学说法」两页式（首页筛选 + 详情学习），内容 JSON 不变（20 个主题 / 40 个视图 / 223 条预先写好的例句）。
  - 新增 `source/engine/src/goals.rs`：五个学习目标（上升下降 / 持平 / 峰值低谷 / 波动 / 比较）由 kind 自动映射；`index.json` 升到 v2，带 `goals`、`kind_goals`、`generic_kinds`、每个视图的 `goals` 和预览数据；校验器要求每个目标至少 3 个主题。
  - 界面只显示 Basic / Advanced 两档：Basic 取 A2，Advanced 取 B1（B2 后备）；整图描述 Advanced 取 B2（B1 后备）；不显示 A2/B1/B2。
  - 详情页：点任意图元出生成句/中文，预先写好的位置额外显示原句；上一处/下一处按预先写好的观察顺序走，没有同类例句时用自动特征；折叠区有整图 Basic/Advanced/IELTS/Business。
  - 编辑：折线/柱/瀑布/斜率/散点/饼图可拖，堆叠/热力/流向用输入框；只改数值，图表与词句实时重算；改数据后预先写好的原句隐藏，还原恢复。
  - 测试：`dv-engine validate` 通过；`dataviz-parity` 80 样本 1836 mark 0 差异；`dataviz-text` 40 视图 240 段通过；新增 `tests/dataviz-goals.mjs` 通过（20 主题 / 40 视图，目标覆盖 12 / 6 / 19 / 4 / 17）；新增 `tests/dataviz-ui.mjs` 41/41 通过（首页目标/领域/类型筛选、取消目标、卡片预览、详情点选、上一处/下一处、六种拖动 + 四种输入、三套主题、390 px 无横向溢出、无 console 错误）。
  - 旧的四个入口、Tabs、语域/等级切换、练习框、整页数据表已删除；data-viz 现在随主站装配在 `/charts/`，首页不列入入口。

## 部署授权

- 2026-10-31：用户授权「每轮改完、自检通过后直接部署主站」；音频站仅在音频有变化时一并部署。除此之外不主动部署。
- 2026-11-18：用户要求把 data-viz 部署到主站，但首页不加入口；只通过 `/charts/` 直达。主站装配现在默认包含 `charts/`，`/data-viz/*` 301 到 `/charts/*`。

## 共享内容核

- `core-version: 1`
- 本库副本：`docs/shared/content-core.md`
- 与另一库副本逐字节一致；跨库比对由 owner 在维护窗口运行库外检查脚本，不在本库构建中读取对方仓库。

## 当前 WIP

- 视觉层（主题、模板、构建器、visual-vocabulary 页面与产物）由另一个并行会话负责；只提交本任务文件，不要把别人的视觉层 WIP 带进提交。
- 数据图表英语已装配到主站 `/charts/`，首页不列入入口；主站部署会自动带上 `charts/`。
- 2026-11-23：**coss ui 试点**（只做 Phenomena）。全站统一到 coss 的方案先拿一个应用真做一遍，看效果与成本再决定是否铺开。
  - 页面改由 `apps/phenomena/web/`（React 19 + Vite 7 + Tailwind v4 + coss 组件源码）产出，`apps/phenomena/source/build.py` 只做音频与 `web/src/generated/phenomena.json`。
  - 地址不变：`/phenomena/`、`/phenomena/<slug>.html`；31 个入口由 `web/scripts/build-entries.mjs` 按 JSON 生成。
  - 该目录**不注入** `apps/site/theme.css`（玻璃层会盖掉 coss）；自带 `apps/phenomena/web/src/styles/index.css` 的 coss 令牌，浅色/深色两套。
  - 交互与旧页面逐项一致：`data-start-f/m`、`[data-play-all]`、`.line.playing`、`.chips button[data-cat]`、`.group[data-cat]`、localStorage 键 `rs-voice` / `rs-speed` / `rs-zh` / `rs-cat` 全部保留，`tests/verify_runtime.mjs` 未改一行。
  - 小程序数据源改为读同一份 JSON（`tools/miniprogram/build_data.py`），30 章 / 360 行不变。
  - 新增自托管字体 `apps/site/fonts/inter-latin*-wght-normal.woff2`（OFL），只被试点引用，`theme.css` 未改。
  - **未部署**：用户要求先看效果再决定。
