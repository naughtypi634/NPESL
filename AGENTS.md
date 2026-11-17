# NPESL

成人英语练习网站。七个线上应用共用一个域名（https://npesl.pages.dev/）：自然拼读、美式英语音标表、Question Drill、Conversation Starters Beginner / Intermediate / ESLSE、常见发音现象、短语搭配、Visual Vocabulary 图解词汇。数据图表英语 Data Visualization Playground 在 `content/data-viz/` + `apps/data-viz/` 开发中，暂不部署（构建站点时默认不装配，本地联调加 `--with-data-viz`）。旅行英语已整体删除，新方案定稿前不补代码。

**本库是独立项目。** 2026-10-28 从 ESLStudio 复制出来，作为岔路点独立演进；不读、不写、不依赖 ESLStudio 或任何其他仓库。内容与代码都在本库内。

**指令优先级**：本文件 > `apps/*/source/AUTHORING.md`、`content/collocation/README.md`、`docs/STRESS_AUTHORING.md` > `README.md` / `tools/README.md`。冲突时按此顺序，并记 `docs/status.md`。`CLAUDE.md` 通过 `@AGENTS.md` 导入本文件，不复制正文；指令文件不写易变计数与日期。

**共享内容核（2026-11-18 owner 批准）**：`docs/shared/content-core.md` 是共享内容底线的库内副本，只读、不参与构建。上文「不读、不写、不依赖任何其他仓库」约束的是构建、检查、测试、部署与会话运行期；维护窗口内复制非可执行文本不在此列。运行时仍禁止读取本库之外的任何路径。

## 一 · 路径约定

结构：**`content/` 内容源 · `apps/` 网页应用 · `miniprogram/` 微信小程序 · `tools/` 脚本 · `build/` 暂存产物**。

```
content/      phonetics/ conversation/ drill/ collocation/   写内容只看这里
apps/         site/ phonics/ ipa/ drill/ phenomena/ collocation/ conversation/ visual-vocabulary/ data-viz/(开发中，不部署)
miniprogram/  微信小程序（原生），与 apps/ 平级；数据由 tools/miniprogram/ 从已构建页面抽取
tools/        paths.py 与构建脚本
build/        cloudflare-site/ cloudflare-audio/ …（gitignore）
```

- 所有构建从库根目录运行。
- Python 一律用本库 `.venv`。
- **路径常量集中在 `tools/paths.py`**。要搬目录，只改它，然后重跑全部构建并用 `tools/audit_build.py --diff` 证明产物没变。
- 站内链接是部署后的绝对路径（`/phonics/`、`/ipa/`、`/drill/`、`/conversation/`、`/phenomena/`、`/collocation/`），源目录不能直接当站点预览；预览走 `tools/build_cloudflare_site.py` 的暂存目录。
- 对话各级（Beginner / Intermediate 与 ESLSE）的页面都指向独立音频站 `https://npesl-audio.pages.dev/audio/`，所有级别的 sprite 都在音频站，不要再给 ESLSE 单独开本地路径分支。`tools/check_assets.py` 按音频站校验。

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

- **不要手改生成物**：`apps/phonics/lessons/`、该系列的 `index.html`、`apps/ipa/index.html`、`apps/drill/index.html`、`apps/phenomena/*.html`、`apps/collocation/*.html`、`apps/conversation/*.html`、`build/cloudflare-*/` 都是脚本产物。改内容改源（`content/`、`apps/phonics/source/content/`、`content/drill/*.json`、`content/collocation/*.json`、`content/conversation/`），再重新构建。
- **Question Drill 的权威题库是 `content/drill/questions.json`**（题数以 `docs/status.md` 为准）。批次 JSON 复现不出它——`extra-questions.json` 里还有 192 道补充题，所以 `assemble.py` 默认从 `questions.json` 重渲染，只有显式 `--from-batches` 才从批次重建。音频由 `make_audio.py` 按内容哈希写入 `apps/drill/audio/`。
- **Question Drill 用两级场景筛选**：一级是旅游 / 日常生活 / 工作商务，二级是 chip（机场、车站、住宿、景点、交通、餐厅、购物、买药、办事、居住、看病、家务、社交、休闲、学习、数码、面试、办公室、会议、客户、行政），定义在 `content/drill/chips.json`，每题有 `chip` 字段。交通、餐厅、购物、买药、办事 5 个 chip 由旅游和日常共用，题目只写一份。补题写进 `content/drill/topup/*.json`，先跑 `tools/drill/check_dup.py` 和 `check_text.py`，再用 `tools/drill/tag_chips.py --merge` 合并；每个 chip 至少 100 题。
- **语音缓存不要删**：`build/tts/cs/`（Conversation Starters）和 `apps/phonics/source/audio/` 是本地缓存，gitignore，但删了就得重新联网合成。内容没变的音频会自动跳过。
- **音频交付分两层**：逐条录音是母版（`apps/drill/audio/{f,m}/`、`apps/ipa/audio/*.mp3`、`apps/phenomena/audio/{f,m}/`、`apps/collocation/audio/{f,m}/`、`build/tts/cs/`），部署只带构建时拼出来的 `sprites/`（每页/每课/每题每音色一条，`apps/conversation/audio/` 下同样只有 sprite）。改一句读音：删掉该条母版再跑对应构建，只重合成这一条，然后只重拼那一页的 sprite；部署按内容哈希只上传变化的文件。
- **短语搭配**：内容源是 `content/collocation/themes.json` 加每个主题一个 JSON（主题与词条数以 `docs/status.md` 为准，分 6 大类），反义关系在 `content/collocation/opposites.json`（`pairs` 成对跳转，`word_opposites` 是单词反义提示），页面在 `apps/collocation/`。音频默认 Azure（Ava/Andrew）；`--tts qwen` 是本地 Qwen3-TTS 备选，同一站点不要混用两种音源。页面只显示【口语】【可分】两个徽章，不显示等级和编号。改内容后先跑 `apps/collocation/source/validate.py`（英式词、例句长度、IPA、chip、l1_note 都在这里拦），再跑 `build.py`。音频后端可选 `--tts azure|edge|kokoro|qwen`：`qwen` 用本地 Qwen3-TTS（本地环境见 `docs/status.md`，女声 vivian、男声 aiden，短句约 6–8 秒/条）；`kokoro` 是本地 ONNX 备选。两种都输出 24kHz/48kbps 定长 MP3，sprite 直接可用。**同一个页面必须用同一个音色来源，不要新旧混用**；换后端要先清空 `apps/collocation/audio/{f,m}` 再全量重跑。例句一律美式、2026 中国成年人场景，不搬参考书原句。
- **Conversation 正文的逐词时间**和 mp3 成对存放，mp3 旁有 `.json` sidecar；当前声线是 Qwen 克隆音色（`qwen-h2` / `qwen-c`），母版由 `build/qwen-voicedesign/gen_corpus.py` 生成，逐词时间由 `add_timings*.py` 补齐。缺条时构建会提示先跑 corpus 生成，不会静默改用别的音源。删母版时连 sidecar 一起删；只删 mp3 时先跑 `gen_corpus.py` 重新生成，再跑 `add_timings*.py` 补时间。sprite 文件名带音频 sha1，重合成后旧的长缓存不会和新页面错配。
- **数据图表英语**：内容源在 `content/data-viz/`（`manifest.json` + `library/<type>.json` + `topics/<slug>.json`），页面在 `apps/data-viz/`（`index.html`、`data.gallery.*.js`、`lang/`、`topics/` 都是 `source/build.py` 的产物，不要手改）。改内容先跑 `apps/data-viz/source/validate.py`，再跑 `build.py`。所有数据是模拟数据，页面必须保留 `Demo data · 模拟数据`；散点只讲相关、不许断言因果；不显示计数、进度或已学标记。
- **旅行英语（已删除，待重做）**：旧的页面、内容、音频母版和构建脚本（`apps/travel/`、`content/travel/`、`tools/build_travel.py`、`tools/validate_travel.py`）已全部删除。新方案定稿前不要按旧架构补代码；音频后续可用 Edge TTS 免费生成。不显示计数、进度、已学标记。
- **Azure 语音**：Phonics 和 IPA 用 Azure F0（凭证 `~/.azure-speech/key.txt`，每月 50 万字符）。Phonics 用 Speech SDK 的 word boundary 保留分块时间轴；IPA 默认全量 300 词 × 男女两版（Ava/Andrew，REST），PDF 录音只用于核对顺序，`--tts edge` 可回退旧混合方案。Azure 输出同样是 24kHz/48kbps MP3，sprite 拼接不用改。
- **Phenomena 语音**：2026-11-15 起用本地 Qwen3-TTS **Base** 克隆音色，与 Conversation 完全一致（女 `h2` / 男 `c`，参考音 `build/qwen-voicedesign/ref-h2.wav`、`ref-c.wav`，x-vector，temperature 0.6 / top_p 0.9），worker 是 `apps/phenomena/source/qwen_clone_worker.py`，不再是 Azure。Qwen 没有音素入口，构建把 `[written|spoken|ipa]` 里的 spoken 拼写直接喂进去；`'er`、`usta`、`c'mon`、`didncha` 这类会被读错的退回原词（宁可少一个弱读也不读错词），所以弱读是近似的、不是强制的。要逐音素精确读法用 Kokoro 的 phoneme 注入（`--tts kokoro`，音质已被否）。改读音改 content 里的 spoken，再跑 `apps/phenomena/source/build.py`；`--tts` 可临时覆盖音源试听。
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

要求 **FIX = 0**；REVIEW 项逐条人工判断。`tests\smoke.mjs` 用无头 Edge 打开七个应用，确认无 console 错误、点读真的出声。页面还要在浏览器里过一遍：手机宽度、深浅主题、点读播放、返回链接。

- **完成链（唯一清单）**：改源 → `build_all.py --only <app>,site` → `verify.py` 一次 → `check_bre.py --strict` → 人工过手机宽度/深浅主题/点读/返回 → 部署主站（音频有变才加音频站）→ 一次 commit main。构建脚本改动先 `audit_build.py --label before`，改完重建再 `--diff before now`，0 差异或逐文件解释。
- **应用清单以 `tools/build_all.py` 的 `ORDER` 与 `apps/site/index.html` 为准**；数量与基线见 `docs/status.md`。data-viz 开发中，默认不装配、不部署。

- **本地验证只开一个无头 Edge，跑完必须关**：多个检查合并进一个脚本、尽量复用同一个页面。统一用 `tools/edge.mjs` 的 `launchEdge()`，它在 Windows 上按 `--user-data-dir` 精确杀整棵树；残留用 `node tools/edge.mjs` 清。不要每步临时起一个浏览器不关——Edge 的浏览器进程会改挂父进程，`proc.kill()`、`taskkill /T` 都收不干净，profile 会一直锁着，进程越积越多把内存吃满。
- **自检最多跑一遍，不要为等绿灯重跑**：`verify.py` 一次改动只跑一次。失败项先看是否与本次改动有关（`git status` 有没有碰那个应用）；无关的话用 `node tests\smoke.mjs --only <用例名>` 单跑一次判定是不是抖动，然后**停手**——把「单跑通过、整套受负载影响」写进交付说明即可。不要连跑整套去碰运气，冒烟每轮要开浏览器、放音频，最费时间也最费 token。只有失败项确实指向本次改动时才继续排查。

## 五 · Git

直接提交 `main`，不建分支、不提 PR。指令文件与内容改动分开提交；多会话并行时只提交本任务文件，不要把别人的视觉层/构建产物 WIP 带进来。

## 六 · 回答风格

- **能查证就查证，然后一句话答**：计数、路径、有没有某个文件这类事实性问题，直接查文件/跑脚本拿准确结果，用一两句话回答，不展开推理、不铺陈方案。
- **先给结论，再给细节**：能一句话说清的不写三段。

## 七 · UI 设计原则

- **避免冗余的文字说明**：不使用不必要的辅助标签、描述性文字和重复解释。优先通过视觉层级、内容分组、间距、对齐方式、字体排版和清晰的控件名称，让界面本身传达结构和含义。
- **每一段文字都应该有存在的必要**：添加任何文字之前，先判断它是否提供必要信息，还是仅仅重复了界面已经表达清楚的内容。
- **优先改善布局，而不是增加解释**：界面不够清晰时，先通过优化布局解决，而不是添加更多解释性文字。保持界面简洁、目的明确、视觉平衡。
- **简洁不能牺牲易用性**：保留必要的标签、无障碍设计、输入限制说明、错误提示，以及涉及重要操作时的确认信息。绝不能为了追求极简而牺牲用户体验。
