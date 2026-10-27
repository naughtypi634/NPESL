# NPESL

成人英语练习网站与微信小程序。五个应用共用一个域名（https://npesl.pages.dev/）：自然拼读 48 课、美式英语音标表、Question Drill、Conversation Starters A1–C2 + ESLSE、常见发音现象 30 章。

**本库是独立项目。** 2026-10-28 从 ESLStudio 复制出来，作为岔路点独立演进；不读、不写、不依赖 ESLStudio 或任何其他仓库。内容与代码都在本库内。

## 一 · 路径约定

复制时保留了原来 `01-零基础入门/`、`05-ConversationStarters/`、`06-发音/`、`build/` 的相对深度，脚本里的 `ROOT / "06-发音" / ...` 才不用改。**不要把这几层拍平或改名**；真要动，先改所有脚本里的 `ROOT` 相对路径并逐个验证。

- 所有构建从库根目录运行。
- Python 一律用本库 `.venv`。
- 站内链接是部署后的绝对路径（`/phonics/`、`/ipa/`、`/drill/`、`/conversation/`、`/phenomena/`），源目录不能直接当站点预览；预览走 `build_cloudflare_site.py` 或 `build_offline_package.py` 的暂存目录。
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

- **不要手改生成物**：`06-发音/自然拼读阅读训练-成人A1/lessons/`、该系列的 `index.html`、`06-发音/音标表/index.html`、`06-发音/Question Drill/index.html`、`06-发音/常见发音现象AmE/*.html`、`build/conversation-site/`、`build/cloudflare-*/` 都是脚本产物。改内容改源（`source/content/`、`05-ConversationStarters/MD/`、`build/zh-en-bank/*.json`），再重新构建。
- **Question Drill 的唯一源是 `build/zh-en-bank/` 的批次 JSON**；`questions.json` 和两个 HTML 都由 `assemble.py` 生成，音频由 `make_audio.py` 按内容哈希写入 `06-发音/Question Drill/audio/`。
- **语音缓存不要删**：`build/tts/cs/`（Conversation Starters）和 `06-发音/自然拼读阅读训练-成人A1/source/audio/` 是本地缓存，gitignore，但删了就得重新联网合成。内容没变的音频会自动跳过。
- **部署是对外发布**：`wrangler pages deploy` 之前先确认要发布哪些改动；不要在没有明确要求时部署。
- Cloudflare Pages 单次部署上限 20,000 个文件，所以音频站和主站分开；不要图省事把 `build/cloudflare-audio` 合进主站。

## 四 · 交付前自检

```powershell
.venv\Scripts\python.exe -I build\check_bre.py 06-发音 05-ConversationStarters
```

要求 **FIX = 0**；REVIEW 项逐条人工判断。页面还要在浏览器里过一遍：手机宽度、深浅主题、点读播放、返回链接。

## 五 · Git

直接提交 `main`，不建分支、不提 PR。
