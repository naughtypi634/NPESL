# NPESL

成人英语练习网站与微信小程序。六个应用共用一个域名（https://npesl.pages.dev/）：自然拼读 48 课、美式英语音标表、Question Drill、Conversation Starters A1–C2 + ESLSE、常见发音现象 30 章、短语动词。

**本库是独立项目。** 2026-10-28 从 ESLStudio 复制出来，作为岔路点独立演进；不读、不写、不依赖 ESLStudio 或任何其他仓库。内容与代码都在本库内。

## 一 · 路径约定

四层结构：**`content/` 内容源 · `apps/` 应用 · `tools/` 脚本 · `build/` 暂存产物**。

```
content/   phonetics/ conversation/ drill/ phrasal/   写内容只看这里
apps/      site/ phonics/ ipa/ drill/ phenomena/ phrasal/
tools/     paths.py 与所有构建脚本
build/     cloudflare-site/ cloudflare-audio/ npesl-offline/ …（gitignore）
```

- 所有构建从库根目录运行。
- Python 一律用本库 `.venv`。
- **路径常量集中在 `tools/paths.py`**。要搬目录，只改它，然后重跑全部构建并用 `tools/audit_build.py --diff` 证明产物没变。
- 站内链接是部署后的绝对路径（`/phonics/`、`/ipa/`、`/drill/`、`/conversation/`、`/phenomena/`、`/phrasal/`），源目录不能直接当站点预览；预览走 `tools/build_cloudflare_site.py` 或 `tools/build_offline_package.py` 的暂存目录。
- A1–C2 语音写 `https://npesl-audio.pages.dev/audio/`，ESLSE 写相对路径 `audio/`。离线包负责把前者改回相对路径。

## 二 · 内容标准

面向 **2026 年的中国成年英语学习者（默认 A1-A2）**。例句、对话、练习场景必须贴近当代中国成年人生活（外卖、地铁通勤、加班、面试、租房、微信等），不用过时或陌生场景。

- **英文一律用美式英语**：拼写、词汇、语法、日期数字格式都用美式。`color` / `center` / `favorite` / `realize` / `traveling` / `canceled`；`apartment` / `elevator` / `line` / `trash` / `sidewalk` / `parking lot` / `crosswalk` / `subway` / `vacation` / `truck` / `cell phone` / `movie theater` / `cookies` / `fries` / `math` / `soccer` / `gas` / `package` / `fall` / `pharmacy` / `zip code` / `takeout` / `store`。
- 语法也用美式：`Do you have…?`、`on the weekend`、`different from`、`I've gotten used to…`，集合名词用单数。
- 日期数字：`September 12, 2026`、`1,500`。
- **例句要有具体画面**：具体场景、人物和动作，能立刻在脑中成像；不要写干巴巴的通用例句。
- **习语必须当代、真实在用**：只选 2020 年代英语口语中真实高频的表达，避免教科书式、老套、过时的说法（over the moon、raining cats and dogs 之类）。拿不准先查证。
- 公制单位（米、公里、摄氏度）和中国地铁官方英文名（如 Shanghai Metro）保留。

## 三 · 构建与部署

构建命令见 [README.md](README.md) 的「构建」「部署」两节。几条硬规则：

- **不要手改生成物**：`apps/phonics/lessons/`、该系列的 `index.html`、`apps/ipa/index.html`、`apps/drill/index.html`、`apps/phenomena/*.html`、`apps/phrasal/*.html`、`build/conversation-site/`、`build/cloudflare-*/`、`build/npesl-offline/` 都是脚本产物。改内容改源（`content/`、`apps/phonics/source/content/`、`content/drill/*.json`、`content/phrasal/*.json`），再重新构建。
- **Question Drill 的权威题库是 `content/drill/questions.json`**（2,247 题）。批次 JSON 复现不出它——`extra-questions.json` 里还有 192 道补充题，所以 `assemble.py` 默认从 `questions.json` 重渲染，只有显式 `--from-batches` 才从批次重建。音频由 `make_audio.py` 按内容哈希写入 `apps/drill/audio/`。
- **Question Drill 用两级场景筛选**：一级是旅游 / 日常生活 / 工作商务，二级是 21 个 chip（机场、车站、住宿、景点、交通、餐厅、购物、买药、办事、居住、看病、家务、社交、休闲、学习、数码、面试、办公室、会议、客户、行政），定义在 `content/drill/chips.json`，每题有 `chip` 字段。交通、餐厅、购物、买药、办事 5 个 chip 由旅游和日常共用，题目只写一份。补题写进 `content/drill/topup/*.json`，先跑 `tools/drill/check_dup.py` 和 `check_text.py`，再用 `tools/drill/tag_chips.py --merge` 合并；每个 chip 至少 100 题。
- **语音缓存不要删**：`build/tts/cs/`（Conversation Starters）和 `apps/phonics/source/audio/` 是本地缓存，gitignore，但删了就得重新联网合成。内容没变的音频会自动跳过。
- **音频交付分两层**：逐条录音是母版（`apps/drill/audio/{f,m}/`、`apps/ipa/audio/*.mp3`、`apps/phenomena/audio/{f,m}/`、`apps/phrasal/audio/{f,m}/`、`build/tts/cs/`），部署只带构建时拼出来的 `sprites/`（每页/每课/每题每音色一条）。改一句读音：删掉该条母版再跑对应构建，只重合成这一条，然后只重拼那一页的 sprite；部署按内容哈希只上传变化的文件。
- **短语动词**：内容源是 `content/phrasal/themes.json` 加每个主题一个 JSON（**30 个主题 × 30 条 = 900 条**，分 6 大类），页面在 `apps/phrasal/`。音频默认 Azure（Ava/Andrew）；`--tts qwen` 是本地 Qwen3-TTS 备选，同一站点不要混用两种音源。页面只显示【口语】【可分】两个徽章，不显示等级和编号。改内容后先跑 `apps/phrasal/source/validate.py`（英式词、例句长度、IPA、chip、l1_note 都在这里拦），再跑 `build.py`。音频后端可选 `--tts azure|edge|kokoro|qwen`：`qwen` 用本地 Qwen3-TTS（ROCm 环境在 `F:\AIProject\tts-lab`，女声 vivian、男声 aiden，短句约 6–8 秒/条）；`kokoro` 是本地 ONNX 备选。两种都输出 24kHz/48kbps 定长 MP3，sprite 直接可用。**同一个页面必须用同一个音色来源，不要新旧混用**；换后端要先清空 `apps/phrasal/audio/{f,m}` 再全量重跑。例句一律美式、2026 中国成年人场景，不搬参考书原句。
- **Conversation 正文的逐词时间**和 mp3 用同一次 Edge TTS 请求生成，存在 mp3 旁的 `.json` sidecar（WordBoundary）。删母版时连 sidecar 一起删；只删 mp3 也能工作，构建会重新合成并补上。sprite 文件名带音频 sha1，重合成后旧的长缓存不会和新页面错配。
- **Azure 语音**：Phenomena 一直用 Azure；Phonics 和 IPA 也已迁到 Azure F0（凭证 `~/.azure-speech/key.txt`，每月 50 万字符）。Phonics 用 Speech SDK 的 word boundary 保留分块时间轴；IPA 默认全量 300 词 × 男女两版（Ava/Andrew，REST），PDF 录音只用于核对顺序，`--tts edge` 可回退旧混合方案。Azure 输出同样是 24kHz/48kbps MP3，sprite 拼接不用改。
- **部署是对外发布**：`wrangler pages deploy` 之前先确认要发布哪些改动；不要在没有明确要求时部署。
- Cloudflare Pages 单次部署上限 20,000 个文件，所以音频站和主站分开；不要图省事把 `build/cloudflare-audio` 合进主站。

## 四 · 交付前自检

```powershell
.venv\Scripts\python.exe -I tools\check_bre.py apps content
node tests\smoke.mjs
```

要求 **FIX = 0**；REVIEW 项逐条人工判断。`tests\smoke.mjs` 用无头 Edge 打开六个应用，确认无 console 错误、点读真的出声。页面还要在浏览器里过一遍：手机宽度、深浅主题、点读播放、返回链接。

## 五 · Git

直接提交 `main`，不建分支、不提 PR。
