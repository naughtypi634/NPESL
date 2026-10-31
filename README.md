# NPESL

成人英语练习网站。六个应用共用一个入口：

| 应用 | 线上 | 源 |
|---|---|---|
| 自然拼读阅读训练 48 课 | https://npesl.pages.dev/phonics/ | `apps/phonics/` |
| 美式英语音标表 | https://npesl.pages.dev/ipa/ | `apps/ipa/` |
| Question Drill 中译英随机练习 | https://npesl.pages.dev/drill/ | `apps/drill/` |
| Conversation Starters A1–C2 + ESLSE | https://npesl.pages.dev/conversation/ | `content/conversation/` → `build/conversation-site/` |
| 常见发音现象 30 章 | https://npesl.pages.dev/phenomena/ | `apps/phenomena/` |
| 短语动词 Phrasal Verbs 12 章 | https://npesl.pages.dev/phrasal/ | `content/phrasal/` → `apps/phrasal/` |

另有一个微信小程序（自然拼读 48 课 + Question Drill）：`apps/phonics/miniprogram/`。

## 目录

四层分得很清楚：**content 是内容源，apps 是应用，tools 是脚本，build 是产物。**

| 路径 | 内容 |
|---|---|
| `content/phonetics/` | 音标表 Markdown 源 + 成品 PDF（网页从 PDF 抽内嵌录音） |
| `content/conversation/` | Conversation Starters 分级 `content.py`、逐段中文翻译、发音标注 |
| `content/drill/` | Question Drill 题库：`raw/` `reviewed/` `final/` 批次、`questions.json`、翻译与修订表 |
| `content/phrasal/` | 短语动词：`chapters.json` + 每章一个词条 JSON（内容源） |
| `apps/site/` | 站点入口页、NPESL 图标、全站主题切换（Bright / Dark / Sepia / Auto） |
| `apps/phonics/` | 48 课网页、`source/`（内容与构建器）、`audio/`、微信小程序 |
| `apps/ipa/` | 音标表网页（`index.html` + `audio/`），40 个音标 × 10 个单词 |
| `apps/drill/` | 中译英练习网页（`index.html` + `audio/f,m/`）与独立单文件 HTML |
| `apps/phenomena/` | 30 章发音现象课，逐词音素标注 + 男女声 |
| `apps/phrasal/` | 短语动词章节页（`source/` 构建器 + `audio/`），每章一条 sprite |
| `tools/` | 构建、部署、校验脚本；`tools/paths.py` 是路径的唯一来源 |
| `tools/audio_sprite.py` | 把逐条录音拼成每页/每课/每题一条（不改码率，音质不变） |
| `tools/conversation/` | Conversation Starters 页面与语音构建器 |
| `tools/drill/` | Question Drill 题库工具与小程序数据生成器 |
| `build/` | 暂存产物（gitignore，脚本可重建） |
| `tests/` | 无头浏览器冒烟测试 |

## 建库

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

需要联网的只有 Edge TTS 合成；已有音频会自动跳过。Node 只在小程序的 `miniprogram-ci` 上传脚本和页面截图工具里用到，Python 构建不需要。

## 构建

```powershell
# 音标表页面：从 PDF 抽内嵌录音，缺的另一性别用 Edge TTS 补齐
.venv\Scripts\python.exe -I tools\build_ipa_site.py

# 自然拼读 48 课
cd apps\phonics\source
..\..\..\.venv\Scripts\python.exe -I -X utf8 build.py

# 常见发音现象 30 章
cd apps\phenomena\source
..\..\..\.venv\Scripts\python.exe -I -X utf8 build.py

# 短语动词：校验内容，再合成音频并出章节页
.venv\Scripts\python.exe -I apps\phrasal\source\validate.py
.venv\Scripts\python.exe -I apps\phrasal\source\build.py

# Conversation Starters：页面 + 全部级别男女两套语音（缓存命中就不重新合成）
.venv\Scripts\python.exe -I tools\conversation\build_site.py

# Question Drill：先补语音，再拼 sprite 并重渲染页面，最后生成小程序题库
.venv\Scripts\python.exe -I tools\drill\make_audio.py
.venv\Scripts\python.exe -I tools\drill\assemble.py
.venv\Scripts\python.exe -I tools\drill\build_miniprogram_bank.py

# 清理构建垃圾（Edge 临时配置、日志、__pycache__）；--all 连部署暂存和离线包一起清
.venv\Scripts\python.exe -I tools\clean_build.py
.venv\Scripts\python.exe -I tools\clean_build.py --all

# 本地预览（先构建 build/cloudflare-site）
node tools\preview_site.mjs
```

> **题库注意**：`content/drill/questions.json` 是权威题库（2,247 题）。批次 JSON 复现不出它——`extra-questions.json` 里还有 192 道补充题。所以 `assemble.py` 默认只从 `questions.json` 重渲染；真要重建题库得显式加 `--from-batches`，那会丢掉补充题。
>
> 补题流程：新题写到 `content/drill/topup/*.json`（`chip` 必填，取值见 `content/drill/chips.json`），先跑 `tools/drill/check_dup.py` 和 `check_text.py`，再 `tools/drill/tag_chips.py --merge` 合并进 `questions.json`，最后按上面的顺序补语音、拼 sprite。

`build_site.py` 支持 `--levels`、`--audio-levels`、`--voices`、`--no-audio`、`--audio-base`，只改页面或只补某一级时用。自然拼读的 `build.py` 支持 `--only <课号>`、`--skip-audio`、`--voices m`。

> **Conversation 逐词时间**：正文每句的音频旁有一份 `.json` sidecar（Edge TTS 的 WordBoundary，逐词起点）。构建用它驱动「点句子 → 进度条 + KTV 高亮」。Edge 不是逐字节确定的，所以旧音频没有 sidecar 时会把该句重新合成一次（第一次全量构建约 7,400 条）；之后 sidecar 命中就跳过。`--no-audio` 只建页面、不补语音，没有 sidecar 的句子不会出现高亮和播放器。本地预览可用 `--audio-base /audio/`，把页面和音频放进同一个测试服务器。

> **Phonics / IPA 的 Azure 语音**：`apps\phonics\source\build.py --tts azure --force`（需要 `~/.azure-speech/key.txt`；Phonics 用 Speech SDK 取逐词时间，约 4.4 万字符），`tools\build_ipa_site.py`（默认 `--tts azure`，300 个单词 × 男女两版全部用 Ava/Andrew，约 3,000 字符；PDF 录音只用于核对顺序，`--tts edge` 可回退旧的 PDF + Edge 混合）。Azure F0 每月 50 万字符，这两个应用一起跑不会超；IPA 的卡片 sprite 名带音频 sha1，换录音后不会命中旧缓存。

## 部署

```powershell
.venv\Scripts\python.exe -I tools\build_cloudflare_site.py
npx --yes wrangler@latest pages deploy build\cloudflare-site --project-name npesl --branch main
npx --yes wrangler@latest pages deploy build\cloudflare-audio --project-name npesl-audio --branch main
```

主站是 https://npesl.pages.dev/。音频仍然单独部署到 https://npesl-audio.pages.dev/audio/：A1–C2 两套语音是每页一条的 sprite（约 600 个文件），ESLSE 的语音留在主站的 `/conversation/eslse/audio/`。两边都远低于 Cloudflare Pages 单次 20,000 个文件的上限，但分开部署可以让音频按 immutable 长缓存独立更新。

离线包：

```powershell
.venv\Scripts\python.exe -I tools\build_offline_package.py
```

生成 `build/npesl-offline/` 和 `build/NPESL-offline-<日期>.zip`，所有链接改成相对路径，解压后直接双击 `index.html` 就能用。

## 自检

```powershell
# 产物快照与比对（改构建脚本前后各跑一次）
.venv\Scripts\python.exe -I tools\audit_build.py --label before
.venv\Scripts\python.exe -I tools\audit_build.py --diff before now

# 六个应用的无头浏览器冒烟测试
node tests\smoke.mjs

# 英式英语检查
.venv\Scripts\python.exe -I tools\check_bre.py apps content
```

## 路径约定

- **构建都从库根目录运行**；`tools/paths.py` 集中了所有路径常量，搬目录只改它。
- 页面里的站内链接是部署后的绝对路径（`/phonics/`、`/ipa/`、`/drill/`、`/conversation/`、`/phenomena/`、`/phrasal/`），源目录本身不是可直接预览的站点；要看效果先跑 `build_cloudflare_site.py` 或 `build_offline_package.py`。
- 语音地址：A1–C2 用 `https://npesl-audio.pages.dev/audio/`，ESLSE 用相对的 `audio/`。离线包会把音频站地址改回相对路径。
