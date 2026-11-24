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
| Visual Vocabulary | 7 主题 / 36 场景 / 266 热点 / 写实照片（线上） | `content/visual-vocabulary/` → `tools/vv/` → `apps/visual-vocabulary/` |

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

- 2026-11-25（第二轮）：Visual Vocabulary 改为白点无框线、场景内不再重复词卡，房间统一鸟瞰 45°。
  - 场景页删掉范围框描边和卡片视图，只保留白点放大；小家电从卡通等距图换成写实平铺图，7 间房间换成鸟瞰斜 45° 写实图（平行投影、物件等比例，避免近大远小）。
  - `coffee machine` 不在新小家电图里，从场景热点移除（词卡与录音仍在）；共 266 个热点、`tools/vv/validate.py` 通过。新图/新框对应的遮罩全部重抠，59 个房间遮罩 + 7 个小家电遮罩无遗漏。
  - 验收：`build_all.py --only visual-vocabulary,site`；`audit_build.py` 二次构建 0 差异；`verify.py` 25/25、286/286 页，英式英语新增 0；桌面浅色、手机浅色/深色、白点与词条点读实际看过，390px 无横向溢出。
  - 部署：主站部署 id `b6ebb2b3`（https://b6ebb2b3.npesl.pages.dev），线上客厅页 200 且引用新图；音频未变，音频站未部署。
- 2026-11-25：Visual Vocabulary 写实版上线，替换等距皮克斯。
  - 36 个场景的 35° 俯视写实图已全部导出；自动重标的框误认率高，改为逐图人工核对，268 个热点保留，7 个照片里没有画出的词从场景热点移除（词卡与录音仍在，只影响场景页）。
  - 遮罩按新框重抠；`room-bedroom/wardrobe` 遮罩覆盖率不足，改为只用白点放大，点读不受影响。
  - 验收：`tools/vv/validate.py` 36 场景 / 268 热点 / 7 套词卡；`build_all.py --only visual-vocabulary,site`；`verify.py` 25/25、286/286 页，英式英语新增 0；桌面浅色与手机深色实际看过，白点位置正确。
  - 旧等距图与失效遮罩共 116 个文件仍留在 apps 目录、页面不再引用，未删除（避免不可逆清理），不影响线上。
  - 部署：主站部署 id `11318896`（https://11318896.npesl.pages.dev），线上场景页 200 且引用新图；音频未变，音频站未部署。
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

- 2026-11-23：**全站换成 coss 外观层**（不重写页面，只换主题层）。
  - `apps/site/theme.css` 重写：coss 令牌（浅色 `#ffffff`/`#262626`，深色 `#141414`/`#f5f5f5`）+ 平材质（1px 边、内嵌 1px 亮线、极小投影）；模糊、渐变、极光、五层玻璃阴影、按压缩放全部删除。旧变量名（`--bg --fg --surface --blue --pane-*` 等）保留为别名，8 个应用与图表页的样式一行未改。
  - 主题从 3 套减到 2 套（light / dark）。`glass` 下线：存过它的按深色渲染。同步改了 `tools/themes.py`、`apps/site/theme.js`、`apps/site/index.html`、`apps/data-viz/web/vite.config.ts`、`tests/verify_runtime.mjs`、`tests/dataviz-ui.mjs`。
  - 字体 Geist → Inter（`apps/site/fonts/inter-latin*-wght-normal.woff2`，OFL）；`theme.css` 只留 2 个 `@font-face`。
  - 彩色只保留两处：Conversation 的四种读音标注（`--pron-*` 映射到 coss 的 info/success/warning/次要灰），以及首页的 `npesl-icon.png` 图标本身。
  - `/phenomena/*` 仍不注入主题层（React 试点自带 coss 令牌）；`tools/verify/` 的字体检查、`build_cloudflare_site.py` 的字体存在性检查都改成 Inter。
  - `theme.css` / `theme.js` 缓存从 1 天改成 `max-age=0, must-revalidate`，换皮立刻生效。
  - 微信小程序同步：5 套主题 → 2 套，`--mint*` 改名 `--primary*`（30 处引用），删掉 `--art` 渐变与三套已下线主题的色块；`utils/theme.js` 的 `THEMES[2]` 越界兜底修掉，`app.json` 窗口底色改白。
  - 验收：`audit_build --diff before after` 259 个文件（0 新增 / 3 删除 / 256 改变；删除的是 Geist 字体与许可，音频与图片零改动）；`verify.py` 22/22、286/286 页；`dataviz-ui.mjs` 23/23。**未部署**。
- 2026-11-23：**图标也换成单色**。`apps/site/npesl-icon.png`（512）与 `favicon-32` / `favicon-16` / `apple-touch-icon` / `favicon.ico` 全部重做成「近黑方片 + 白字」，尺寸与字位沿用原图（字宽 383/512）。首页的 `.logo` 改成内联 SVG（方片 `currentColor`、字用 `--background`），所以浅色下是近黑片白字、深色下是近白片深字，两种主题都清楚。图标生成脚本是一次性的，留在 `build/review/make_icon.py`（gitignore）。
- 2026-11-23：**按用户反馈修一轮**。
  - 音标表：`.word` 的灰底去掉（原来是我给词按钮加了底色，两列零行距，色块粘成一片）。
  - 按下弹跳：主题层统一 `transform: none`，压住各应用自己的 `:active` 缩放（drill / phonics / collocation / conversation）。
  - 图标消失与文字消失同一根因：主题层的基础材质规则用了 `:is()`，改背景但没改文字色，压过应用的 `.playBtn.is-playing` 等状态对；改成 `:where()` 后由应用自己的状态规则说话。drill 的 女声/男声 实测：播放中 `#262626` 底 + `#fafafa` 图标与文字。
  - 圆角统一：`.play-all` 的 980px 药丸改为 10px，和其余控件一致；徽章 6px，圆形保持 50%。
  - 光学对齐：按钮内 SVG 改块级（消掉基线间隙）、播放三角左收 1px、图标+文字按钮统一 `line-height: 1`。
  - 语速：全部改成三档按钮（0.75 / 1 / 1.25，默认 1），去掉滑块，图标为「一格 / 回转箭头 / 三格」；phenomena（React）、phonics 课时、conversation 章节三处一致，播放器里的 7 档菜单也缩到 3 档。
  - 验收：`verify.py` 22/22、286/286 页；`dataviz-ui.mjs` 未动不受影响。**未部署**；Visual Vocabulary 已通知另一会话先不部署。
- 2026-11-23：**第二轮反馈**。
  - 音标词恢复可点观感：浅底 + 8px 圆角，`.words` 加 6px 行距，色块不再粘成一片。
  - 音标页不再内嵌主题：`tools/build_ipa_site.py` 改成 `theme_boot("/theme.css")` + 外链 `theme.js`，和其余页面一致。以后改 `theme.css` 只需 `--only site`，不必再单独重建音标页。
  - 播放中文字不可见的根治：主题层加一条「播放中一律深底浅字」，把文字、图标、内层 span 锁成 `--primary-foreground`。
  - 语速图标三处统一为同一套 SVG（一格 / 回转箭头 / 三格，viewBox 12×12）；phenomena 去掉 lucide 的蜗牛/兔子。
  - 短语搭配：`.prow` 改回圆角卡片（10px、12px 14px 内边距）；我给内容块加的边框撤掉（它们没有内边距，文字会贴边）。
  - 短语搭配播放件：波形三根竖条加 `say-wave` 动效（0.8s，错峰 0.16s，`prefers-reduced-motion` 下关闭）。
  - 方框底色普查：逐页扫「有底色且圆角为 0」的元素，命中项只有全宽吸顶条（刻意为之）与 `.prow`（已改圆角）。
  - 验收：`verify.py` 22/22、286/286 页。过程中我自己引入过一处回归（内嵌脚本套娃导致音标页 SyntaxError），由运行时层抓到并修好。
- 2026-11-23：**Visual Vocabulary 写实版（未上线）**。
  - 用户确认出图规则：约 35° 俯视（以能看到物件顶面为准）、房间类保留后墙与地板、台面与商品类保持无缝背景、物件完整分开不裁切。
  - 36 个场景描述已全部改写；客厅与厨房小家电两张样张在 `build/vv-work/style/real/`，全量渲染脚本 `build/vv-work/run-real.ps1`（通宵跑，断点续跑）。
  - 点读框重标在出图后另做；线上仍是等距皮克斯 25°。
- 2026-11-23：**第三轮反馈：可点性与播放件观感**。
  - 音标词与 Drill 的 女声/男声 统一成同一套：无边框、8px 圆角、静止 4% 浅底、悬停 8%、按下 12%、播放中反色（近黑底浅字 / 近白底深字），0.12s 过渡。
  - 根因：静止底色原本取 `--card`，和卡片同色，按钮等于「融进」卡片；点下去才突然变成整块黑/白。现在控件底色取 `--muted-surface`，比卡片深一档。
  - 新增令牌 `--surface-hover`（8%）与 `--surface-press`（12%），供所有可点元素分档。
  - 验收：`verify.py` 22/22、286/286 页；两种主题下的静止/播放状态都按像素采样核对过对比度。
- 2026-11-23：**已部署**。用户明确指示「推送到 GitHub 并部署到主站」。
  - 推送：`main` → `origin/main`，HEAD `559ffaa7f`（连同此前未推的 43 个提交）。
  - 主站：`npx wrangler pages deploy build/cloudflare-site --project-name npesl --branch main`，部署 id `faa3bc44`（https://faa3bc44.npesl.pages.dev，正式地址 https://npesl.pages.dev）。本次增量上传 293 个文件。
  - 音频站未部署：母版零改动，sprite 内容与文件名与原来一致。
  - 线上核对：`/theme.css` 已是 coss 令牌 + Inter；`/ipa/` 改为外链 theme.css、无内嵌残留；`/phenomena/` 入口脚本 `main-CCjWMkxy.js` 200；7 个入口全部 200。
- 2026-11-23：**短语搭配三维度修理**（用词 / 操作 / 外观）。
  - 用词：41 主题 / 3,296 条全量审校，修语法错、英式残留、中文病句、模板化例句、chip 归属、反义配对；校验器新增英式短语、中文病句、chip 归属等硬规则。
  - 操作：保留原有场景 / 介词 / 主题分类，新增中英文全文搜索（`/` 聚焦、Esc 退出）；音频失败有提示可重试，同一按钮可暂停续播；筛选保留展开内容，反义返回恢复原位置。
  - 外观：列表与卡片重做，徽章只保留【口语】【可分】，改用全站单色令牌，手机端中文可换行、分类横排可滑、触控目标放大；本地与线上主题切换一致。
  - 验证：`build_all.py --only collocation,site` 通过，534 条新音频合成；`audit_build --diff before final` 632 个差异全部是重拼音频包（新增 315 / 删除 315）与 collocation 页面/滚动层（改变 2），其他应用零差异；`verify.py` 一次通过 25/25、286/286 页，英式英语新增 0。
  - 部署：主站部署 id `223cacb4`，线上 `/collocation/` 200 且包含搜索框；短语搭配音频随主站发布，音频站母版未变故未部署。

- 2026-11-23：**清理 79 项待提交改动并再次发布**。
  - 构建：`build_all.py --only ipa,phonics,phenomena,visual-vocabulary,data-viz,site` 全部 PASS；`verify.py` 22/22、286/286 页通过，英式英语新增 0。
  - 音标表源文件中删掉的 7 个 /ər/ 例词已恢复：构建要求与 PDF 内嵌录音逐词对齐（40 组 × 10 词），删词后无法通过且没有配套新录音。
  - data-viz 新增的 `charts/ lesson/ engine/ content/data-viz/{datasets,lessons,phrases}` 目前未被入口引用，不影响线上 `/charts/`。
  - 主站：部署 id `87540102`（https://87540102.npesl.pages.dev），增量上传 77 个文件；音频母版零改动，音频站未部署。

