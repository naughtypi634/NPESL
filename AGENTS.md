# NPESL

成人英语练习网站。六个应用共用一个域名（https://npesl.pages.dev/）：自然拼读 48 课、美式英语音标表、Question Drill、Conversation Starters A1–C2 + ESLSE、常见发音现象 30 章、短语搭配。

**本库是独立项目。** 2026-10-28 从 ESLStudio 复制出来，作为岔路点独立演进；不读、不写、不依赖 ESLStudio 或任何其他仓库。内容与代码都在本库内。

## 一 · 路径约定

四层结构：**`content/` 内容源 · `apps/` 应用 · `tools/` 脚本 · `build/` 暂存产物**。

```
content/   phonetics/ conversation/ drill/ collocation/   写内容只看这里
apps/      site/ phonics/ ipa/ drill/ phenomena/ collocation/
tools/     paths.py 与所有构建脚本
build/     cloudflare-site/ cloudflare-audio/ conversation-site/ …（gitignore）
```

- 所有构建从库根目录运行。
- Python 一律用本库 `.venv`。
- **路径常量集中在 `tools/paths.py`**。要搬目录，只改它，然后重跑全部构建并用 `tools/audit_build.py --diff` 证明产物没变。
- 站内链接是部署后的绝对路径（`/phonics/`、`/ipa/`、`/drill/`、`/conversation/`、`/phenomena/`、`/collocation/`），源目录不能直接当站点预览；预览走 `tools/build_cloudflare_site.py` 的暂存目录。
- 对话各级（A1–C2 与 ESLSE）的页面都指向独立音频站 `https://npesl-audio.pages.dev/audio/`，所有级别的 sprite 都在音频站，不要再给 ESLSE 单独开本地路径分支。`tools/check_assets.py` 按音频站校验。

## 二 · 内容标准

面向 **2026 年的中国成年英语学习者（默认 A1-A2）**。例句、对话、练习场景必须贴近当代中国成年人生活（外卖、地铁通勤、加班、面试、租房、微信等），不用过时或陌生场景。

- **英文一律用美式英语**：拼写、词汇、语法、日期数字格式都用美式。`color` / `center` / `favorite` / `realize` / `traveling` / `canceled`；`apartment` / `elevator` / `line` / `trash` / `sidewalk` / `parking lot` / `crosswalk` / `subway` / `vacation` / `truck` / `cell phone` / `movie theater` / `cookies` / `fries` / `math` / `soccer` / `gas` / `package` / `fall` / `pharmacy` / `zip code` / `takeout` / `store`。
- 语法也用美式：`Do you have…?`、`on the weekend`、`different from`、`I've gotten used to…`，集合名词用单数。
- 日期数字：`September 12, 2026`、`1,500`。
- **例句要有具体画面**：具体场景、人物和动作，能立刻在脑中成像；不要写干巴巴的通用例句。
- **习语必须当代、真实在用**：只选 2020 年代英语口语中真实高频的表达，避免教科书式、老套、过时的说法（over the moon、raining cats and dogs 之类）。拿不准先查证。
- 公制单位（米、公里、摄氏度）和中国地铁官方英文名（如 Shanghai Metro）保留。
- **不要做「已学 / 完成」标记**：不显示打卡勾选、进度徽章或「标记已学」按钮（用户明确不要，以后也不要加）。
- **不要加统计/说明型 meta 文案，也不显示任何计数**：不写「N 个主题 · N 条 · 点词条就出声」这类副标题，分区标题后面也不挂「· 300 条」。用户明确不要，以后也不要加。

## 三 · 构建与部署

构建命令见 [README.md](README.md) 的「构建」「部署」两节。几条硬规则：

- **不要手改生成物**：`apps/phonics/lessons/`、该系列的 `index.html`、`apps/ipa/index.html`、`apps/drill/index.html`、`apps/phenomena/*.html`、`apps/collocation/*.html`、`build/conversation-site/`、`build/cloudflare-*/` 都是脚本产物。改内容改源（`content/`、`apps/phonics/source/content/`、`content/drill/*.json`、`content/collocation/*.json`），再重新构建。
- **Question Drill 的权威题库是 `content/drill/questions.json`**（2,247 题）。批次 JSON 复现不出它——`extra-questions.json` 里还有 192 道补充题，所以 `assemble.py` 默认从 `questions.json` 重渲染，只有显式 `--from-batches` 才从批次重建。音频由 `make_audio.py` 按内容哈希写入 `apps/drill/audio/`。
- **Question Drill 用两级场景筛选**：一级是旅游 / 日常生活 / 工作商务，二级是 21 个 chip（机场、车站、住宿、景点、交通、餐厅、购物、买药、办事、居住、看病、家务、社交、休闲、学习、数码、面试、办公室、会议、客户、行政），定义在 `content/drill/chips.json`，每题有 `chip` 字段。交通、餐厅、购物、买药、办事 5 个 chip 由旅游和日常共用，题目只写一份。补题写进 `content/drill/topup/*.json`，先跑 `tools/drill/check_dup.py` 和 `check_text.py`，再用 `tools/drill/tag_chips.py --merge` 合并；每个 chip 至少 100 题。
- **语音缓存不要删**：`build/tts/cs/`（Conversation Starters）和 `apps/phonics/source/audio/` 是本地缓存，gitignore，但删了就得重新联网合成。内容没变的音频会自动跳过。
- **音频交付分两层**：逐条录音是母版（`apps/drill/audio/{f,m}/`、`apps/ipa/audio/*.mp3`、`apps/phenomena/audio/{f,m}/`、`apps/collocation/audio/{f,m}/`、`build/tts/cs/`），部署只带构建时拼出来的 `sprites/`（每页/每课/每题每音色一条）。改一句读音：删掉该条母版再跑对应构建，只重合成这一条，然后只重拼那一页的 sprite；部署按内容哈希只上传变化的文件。
- **短语搭配**：内容源是 `content/collocation/themes.json` 加每个主题一个 JSON（**30 个主题，共 1,279 条**，分 6 大类），反义关系在 `content/collocation/opposites.json`（`pairs` 成对跳转，`word_opposites` 是单词反义提示），页面在 `apps/collocation/`。音频默认 Azure（Ava/Andrew）；`--tts qwen` 是本地 Qwen3-TTS 备选，同一站点不要混用两种音源。页面只显示【口语】【可分】两个徽章，不显示等级和编号。改内容后先跑 `apps/collocation/source/validate.py`（英式词、例句长度、IPA、chip、l1_note 都在这里拦），再跑 `build.py`。音频后端可选 `--tts azure|edge|kokoro|qwen`：`qwen` 用本地 Qwen3-TTS（ROCm 环境在 `F:\AIProject\tts-lab`，女声 vivian、男声 aiden，短句约 6–8 秒/条）；`kokoro` 是本地 ONNX 备选。两种都输出 24kHz/48kbps 定长 MP3，sprite 直接可用。**同一个页面必须用同一个音色来源，不要新旧混用**；换后端要先清空 `apps/collocation/audio/{f,m}` 再全量重跑。例句一律美式、2026 中国成年人场景，不搬参考书原句。
- **Conversation 正文的逐词时间**和 mp3 用同一次 Edge TTS 请求生成，存在 mp3 旁的 `.json` sidecar（WordBoundary）。删母版时连 sidecar 一起删；只删 mp3 也能工作，构建会重新合成并补上。sprite 文件名带音频 sha1，重合成后旧的长缓存不会和新页面错配。
- **Azure 语音**：Phenomena 一直用 Azure；Phonics 和 IPA 也已迁到 Azure F0（凭证 `~/.azure-speech/key.txt`，每月 50 万字符）。Phonics 用 Speech SDK 的 word boundary 保留分块时间轴；IPA 默认全量 300 词 × 男女两版（Ava/Andrew，REST），PDF 录音只用于核对顺序，`--tts edge` 可回退旧混合方案。Azure 输出同样是 24kHz/48kbps MP3，sprite 拼接不用改。
- **部署是对外发布**：用户已授权「每轮改完、自检通过后直接部署主站」（2026-10-31），不需要再逐次确认；音频站仅在音频有变化时一并部署。除此之外仍不要主动部署。
- Cloudflare Pages 单次部署上限 20,000 个文件，所以音频站和主站分开；不要图省事把 `build/cloudflare-audio` 合进主站。
- **改构建脚本必须证明产物没变**：先 `audit_build.py --label before`，改完重建再 `--diff before now`，0 差异才算通过。出现差异要能逐个文件解释，解释不了就回滚。快照在 `build/audit/`，别在比对前跑 `clean_build.py --all`（会连快照一起删）。

## 四 · 交付前自检

```powershell
# 一次跑完：产物比对（可选）、音频引用、英式英语、无头浏览器冒烟
.venv\Scripts\python.exe -I tools\verify.py
.venv\Scripts\python.exe -I tools\verify.py --label before
.venv\Scripts\python.exe -I tools\verify.py --diff before now
```

要求 **FIX = 0**；REVIEW 项逐条人工判断。`tests\smoke.mjs` 用无头 Edge 打开六个应用，确认无 console 错误、点读真的出声。页面还要在浏览器里过一遍：手机宽度、深浅主题、点读播放、返回链接。

- **本地验证只开一个无头 Edge，跑完必须关**：多个检查合并进一个脚本、尽量复用同一个页面。统一用 `tools/edge.mjs` 的 `launchEdge()`，它在 Windows 上按 `--user-data-dir` 精确杀整棵树；残留用 `node tools/edge.mjs` 清。不要每步临时起一个浏览器不关——Edge 的浏览器进程会改挂父进程，`proc.kill()`、`taskkill /T` 都收不干净，profile 会一直锁着，进程越积越多把内存吃满。

## 五 · Git

直接提交 `main`，不建分支、不提 PR。

## 六 · 回答风格

- **能查证就查证，然后一句话答**：计数、路径、有没有某个文件这类事实性问题，直接查文件/跑脚本拿准确结果，用一两句话回答，不展开推理、不铺陈方案。
- **先给结论，再给细节**：能一句话说清的不写三段。

## 七 · UI 设计原则

- **避免冗余的文字说明**：不使用不必要的辅助标签、描述性文字和重复解释。优先通过视觉层级、内容分组、间距、对齐方式、字体排版和清晰的控件名称，让界面本身传达结构和含义。
- **每一段文字都应该有存在的必要**：添加任何文字之前，先判断它是否提供必要信息，还是仅仅重复了界面已经表达清楚的内容。
- **优先改善布局，而不是增加解释**：界面不够清晰时，先通过优化布局解决，而不是添加更多解释性文字。保持界面简洁、目的明确、视觉平衡。
- **简洁不能牺牲易用性**：保留必要的标签、无障碍设计、输入限制说明、错误提示，以及涉及重要操作时的确认信息。绝不能为了追求极简而牺牲用户体验。
