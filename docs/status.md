# 状态与易变事实

本文件是 NPESL 唯一允许写计数、日期、门禁基线和一次性授权的地方。它不是规范；规范见根 `AGENTS.md` 与 `README.md`。

- last_verified: 2026-11-18
- 维护方式：计数或门禁基线变化时更新本文件；规范文件不写会变的数字。

## 应用与内容计数

| 项 | 值 | 来源 / 说明 |
|---|---|---|
| 线上应用 | 7 个 | 入口页 `apps/site/index.html` 的链接：phonics / ipa / drill / conversation / phenomena / collocation / visual-vocabulary |
| data-viz | 开发中，不部署 | `content/data-viz/` + `apps/data-viz/web/`（React + ECharts）+ `apps/data-viz/source/engine/`（Rust 数据）；主站默认不装配，本地联调加 `build_cloudflare_site.py --with-data-viz`；`/data-viz/*` 线上 302 回首页 |
| Question Drill | 2,247 题 | `content/drill/questions.json`；`extra-questions.json` 另有 192 道补充题 |
| 短语搭配 | 41 个主题 / 3,296 条 / 6 大类 | `content/collocation/themes.json` + 41 个主题 JSON |
| Conversation Starters | 150 个故事 / 503 段 | `content/conversation/{A1,B1,ESLSE}/content.py`（每级 10 单元 × 5 故事） |
| Phonics | 48 课 | `apps/phonics/source/content/` |
| IPA | 40 音标 × 10 词 × 男女两版 | `apps/ipa/` |
| Phenomena | 30 章 | `apps/phenomena/` |

## 语音后端

| 应用 | 后端 |
|---|---|
| Phonics / IPA | Azure F0（Ava / Andrew） |
| Phenomena / Conversation | 本地 Qwen3-TTS Base 克隆音色（女 `h2` / 男 `c`）；Conversation 母版由 `build/qwen-voicedesign/gen_corpus.py` 生成，逐词时间由 `add_timings*.py` 补齐 |
| Collocation | 默认 Azure（Ava / Andrew）；`--tts qwen|edge|kokoro` 可选，同一页面不得混用音源 |

Qwen3-TTS 本地环境：`F:\AIProject\tts-lab`（仅作者合成时使用，不是构建/部署依赖）。

## 门禁基线

- `tools/verify.py` 已于 2026-11-18 给 `check_bre` 加 `--strict`；`check_bre.py` 只扫 Markdown，HTML/JSON 内容靠各 app validator。
- 2026-11-18：用 Claude Code 2.1.318 做无工具单轮测试，根 `CLAUDE.md` 的 `@AGENTS.md` 导入生效（模型能引用 `AGENTS.md` 首段）；新会话仍建议用 `/context all` 复核。
- 2026-11-18：`check_bre.py --strict apps content` → FIX 0，REVIEW 3（`chips`×2、`surgery`×1，均为词义提示，人工判断）。
- 2026-11-18 完整 `verify.py`（staging 定稿后跑一次）：音频引用 PASS（248 页，0 缺失）；英式英语 PASS；冒烟 27/33。
  - 5 个时序用例在整套并发负载下失败：`conversation-playall`、`conversation-zh`、`collocation-index`、`collocation-chunk-variants`、`collocation-noun-uses`。代表用例 `conversation-playall` 单跑 PASS；视觉层会话报告其余用例单跑通过。按规则不重跑整套，判定为负载抖动。
  - `data-viz-describe` 报 `TypeError: Cannot read properties of undefined (reading 'select')`。data-viz 未部署，`/data-viz/` 302 回首页；`tests/smoke.mjs` 的 `HAS_DATA_VIZ` 用 `fetch().ok` 判定，跟随 302 后误判为存在，导致 data-viz 用例在首页上运行。这是测试跳过判定问题，不是线上缺陷。2026-11-18 已修：改为 `redirect: 'manual'` 且只认 200。
- 2026-11-18（卡片回弹修正后）完整 `verify.py`：音频引用 PASS（247 页，0 缺失）；英式英语 PASS（FIX 0，REVIEW 3 同上）；冒烟 17/20，失败项为 `collocation-index`、`collocation-chunk-variants`、`collocation-noun-uses` 三个时序用例，代表用例 `collocation-index` 单跑 PASS（delta 0.008s），与上一条的负载抖动一致。
- `tests/smoke.mjs` 覆盖七个线上应用；data-viz 用例在暂存没有该目录时自动跳过（2026-11-18 修正了 302 误判）。
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

## 部署授权

- 2026-10-31：用户授权「每轮改完、自检通过后直接部署主站」；音频站仅在音频有变化时一并部署。除此之外不主动部署。
- 2026-11-18：data-viz 发布水平不够，已从主站撤下（`7e27c7e9`）；不部署，直到用户重新验收。

## 共享内容核

- `core-version: 1`
- 本库副本：`docs/shared/content-core.md`
- 与另一库副本逐字节一致；跨库比对由 owner 在维护窗口运行库外检查脚本，不在本库构建中读取对方仓库。

## 当前 WIP

- 视觉层（主题、模板、构建器、visual-vocabulary 页面与产物）由另一个并行会话负责；只提交本任务文件，不要把别人的视觉层 WIP 带进提交。
- data-viz 代码在库内但主站不装配；不要因为 `build_all.py` 的 `ORDER` 含 data-viz 就部署它。
