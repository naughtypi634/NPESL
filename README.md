# NPESL

成人英语练习网站。五个应用共用一个入口：

| 应用 | 线上 | 源 |
|---|---|---|
| 自然拼读阅读训练 48 课 | https://npesl.pages.dev/phonics/ | `apps/phonics/` |
| 美式英语音标表 | https://npesl.pages.dev/ipa/ | `apps/ipa/` |
| Question Drill 中译英随机练习 | https://npesl.pages.dev/drill/ | `apps/drill/` |
| Conversation Starters A1–C2 + ESLSE | https://npesl.pages.dev/conversation/ | `content/conversation/` → `build/conversation-site/` |
| 常见发音现象 30 章 | https://npesl.pages.dev/phenomena/ | `apps/phenomena/` |

另有一个微信小程序（自然拼读 48 课 + Question Drill）：`apps/phonics/miniprogram/`。

## 目录

四层分得很清楚：**content 是内容源，apps 是应用，tools 是脚本，build 是产物。**

| 路径 | 内容 |
|---|---|
| `content/phonetics/` | 音标表 Markdown 源 + 成品 PDF（网页从 PDF 抽内嵌录音） |
| `content/conversation/` | Conversation Starters 分级 `content.py`、逐段中文翻译、发音标注 |
| `content/drill/` | Question Drill 题库：`raw/` `reviewed/` `final/` 批次、`questions.json`、翻译与修订表 |
| `apps/site/` | 站点入口页、NPESL 图标、全站主题切换（Bright / Dark / Sepia / Auto） |
| `apps/phonics/` | 48 课网页、`source/`（内容与构建器）、`audio/`、微信小程序 |
| `apps/ipa/` | 音标表网页（`index.html` + `audio/`），40 个音标 × 10 个单词 |
| `apps/drill/` | 中译英练习网页（`index.html` + `audio/f,m/`）与独立单文件 HTML |
| `apps/phenomena/` | 30 章发音现象课，逐词音素标注 + 男女声 |
| `tools/` | 构建、部署、校验脚本；`tools/paths.py` 是路径的唯一来源 |
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

# Conversation Starters：页面 + 全部级别男女两套语音（缓存命中就不重新合成）
.venv\Scripts\python.exe -I tools\conversation\build_site.py

# Question Drill：从已发布的 questions.json 重渲染页面
.venv\Scripts\python.exe -I tools\drill\assemble.py
.venv\Scripts\python.exe -I tools\drill\make_audio.py
.venv\Scripts\python.exe -I tools\drill\build_miniprogram_bank.py
```

> **题库注意**：`content/drill/questions.json` 是权威题库（1,370 题）。批次 JSON 复现不出它——`extra-questions.json` 里还有 192 道补充题。所以 `assemble.py` 默认只从 `questions.json` 重渲染；真要重建题库得显式加 `--from-batches`，那会丢掉补充题。

`build_site.py` 支持 `--levels`、`--audio-levels`、`--voices`、`--no-audio`，只改页面或只补某一级时用。自然拼读的 `build.py` 支持 `--only <课号>`、`--skip-audio`、`--voices m`。

## 部署

```powershell
.venv\Scripts\python.exe -I tools\build_cloudflare_site.py
npx --yes wrangler@latest pages deploy build\cloudflare-site --project-name npesl --branch main
npx --yes wrangler@latest pages deploy build\cloudflare-audio --project-name npesl-audio --branch main
```

主站是 https://npesl.pages.dev/。A1–C2 两套语音约 1.76 万个文件，和页面放在一起会超过 Cloudflare Pages 单次部署 20,000 个文件的上限，所以音频单独部署到 https://npesl-audio.pages.dev/audio/；ESLSE 的语音留在主站的 `/conversation/eslse/audio/`。

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

# 五个应用的无头浏览器冒烟测试
node tests\smoke.mjs

# 英式英语检查
.venv\Scripts\python.exe -I tools\check_bre.py apps content
```

## 路径约定

- **构建都从库根目录运行**；`tools/paths.py` 集中了所有路径常量，搬目录只改它。
- 页面里的站内链接是部署后的绝对路径（`/phonics/`、`/ipa/`、`/drill/`、`/conversation/`、`/phenomena/`），源目录本身不是可直接预览的站点；要看效果先跑 `build_cloudflare_site.py` 或 `build_offline_package.py`。
- 语音地址：A1–C2 用 `https://npesl-audio.pages.dev/audio/`，ESLSE 用相对的 `audio/`。离线包会把音频站地址改回相对路径。
