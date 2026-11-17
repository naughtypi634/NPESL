# 状态与易变事实

本文件是 NPESL 唯一允许写计数、日期、门禁基线和一次性授权的地方。它不是规范；规范见根 `AGENTS.md` 与 `README.md`。

- last_verified: 2026-11-18
- 维护方式：计数或门禁基线变化时更新本文件；规范文件不写会变的数字。

## 应用与内容计数

| 项 | 值 | 来源 / 说明 |
|---|---|---|
| 线上应用 | 7 个 | 入口页 `apps/site/index.html` 的链接：phonics / ipa / drill / conversation / phenomena / collocation / visual-vocabulary |
| data-viz | 开发中，不部署 | `content/data-viz/` + `apps/data-viz/`；主站默认不装配，本地联调加 `build_cloudflare_site.py --with-data-viz`；`/data-viz/*` 线上 302 回首页 |
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
- 2026-11-18：`check_bre.py --strict apps content` → FIX 0，REVIEW 3（`chips`×2、`surgery`×1，均为词义提示，人工判断）。
- `tests/smoke.mjs` 覆盖七个线上应用；data-viz 用例在暂存没有该目录时自动跳过。
- 本轮改动只涉及指令文件与 `verify.py`；完整 `verify.py` 冒烟待视觉层并行构建结束后跑一次，结果补在这里。

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
