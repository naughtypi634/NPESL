# NPESL

成人英语练习网站。五个应用共用一个入口：

| 应用 | 线上 | 源 |
|---|---|---|
| 自然拼读阅读训练 48 课 | https://npesl.pages.dev/phonics/ | `06-发音/自然拼读阅读训练-成人A1/` |
| 美式英语音标表 | https://npesl.pages.dev/ipa/ | `06-发音/音标表/` |
| Question Drill 中译英随机练习 | https://npesl.pages.dev/drill/ | `06-发音/Question Drill/` |
| Conversation Starters A1–C2 + ESLSE | https://npesl.pages.dev/conversation/ | `05-ConversationStarters/MD/` → `build/conversation-site/` |
| 常见发音现象 30 章 | https://npesl.pages.dev/phenomena/ | `06-发音/常见发音现象AmE/` |

另有一个微信小程序（自然拼读 48 课 + Question Drill）：`06-发音/自然拼读阅读训练-成人A1/miniprogram/`。

## 和 ESLStudio 的关系

2026-10-28 从 ESLStudio 的 `06-发音/`、`05-ConversationStarters/` 和 `build/` 复制出来，作为独立项目继续开发。**复制点之后两边各自演进，不再自动同步。** ESLStudio 继续作为教学材料总库与 PDF 管线；本库只负责网页和小程序。

为了让复制过来的脚本不用改路径，本库保留了原来的相对深度：`01-零基础入门/`、`05-ConversationStarters/`、`06-发音/`、`build/`。脚本里的 `ROOT / "06-发音" / ...`、`ROOT / "05-ConversationStarters" / ...` 都指向本库，**不读 `../ESLStudio`，也不依赖任何其他仓库。**

## 目录

| 路径 | 内容 |
|---|---|
| `06-发音/网站/` | 站点入口页、NPESL 图标、全站主题切换（Bright / Dark / Sepia / Auto） |
| `06-发音/音标表/` | 音标表网页版（`index.html` + `audio/`），40 个音标 × 10 个单词，男女声可切换 |
| `06-发音/自然拼读阅读训练-成人A1/` | 48 课网页版、内容源、单文件版、微信小程序 |
| `06-发音/Question Drill/` | 中译英练习网页版（`index.html` + `audio/f,m/`）与独立单文件 HTML |
| `06-发音/常见发音现象AmE/` | 30 章发音现象课，逐词音素标注 + 男女声 |
| `06-发音/Pronunciation音标表.pdf` | 音标表成品 PDF，音标网页从它抽内嵌录音 |
| `05-ConversationStarters/MD/` | 分级的 `content.py`、逐段中文翻译、发音标注 |
| `01-零基础入门/MD/基础课30/Pronunciation音标表.md` | 音标表网页与 PDF 的共同源 |
| `build/` | 网页构建、部署、离线包、题库工具 |
| `build/conversation_starters/` | Conversation Starters 页面与语音构建 |
| `build/zh-en-bank/` | Question Drill 题库、单文件 HTML、小程序数据 |
| `build/tts/cs/` | Conversation Starters 语音缓存（gitignore，可重建） |

## 建库

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

需要联网的只有 Edge TTS 合成；已有音频会自动跳过。Node 只在小程序的 `miniprogram-ci` 上传脚本和页面截图工具里用到，Python 构建不需要。

## 构建

```powershell
# 音标表页面：从 PDF 抽内嵌录音，缺的另一性别用 Edge TTS 补齐
.venv\Scripts\python.exe -I build\build_ipa_site.py

# 自然拼读 48 课：生成录音切片、每课自包含页面和目录页
cd 06-发音\自然拼读阅读训练-成人A1\source
..\..\..\.venv\Scripts\python.exe -I -X utf8 build.py

# 常见发音现象 30 章
cd 06-发音\常见发音现象AmE\source
..\..\..\.venv\Scripts\python.exe -I -X utf8 build.py

# Conversation Starters：页面 + 全部级别男女两套语音（缓存命中就不重新合成）
.venv\Scripts\python.exe -I build\conversation_starters\build_site.py

# Question Drill：题库 → 单文件 HTML → 男女音频 → 小程序数据
.venv\Scripts\python.exe -I build\zh-en-bank\assemble.py
.venv\Scripts\python.exe -I build\zh-en-bank\make_audio.py
.venv\Scripts\python.exe -I build\zh-en-bank\build_miniprogram_bank.py
```

`build_site.py` 支持 `--levels`、`--audio-levels`、`--voices`、`--no-audio`，只改页面或只补某一级时用。自然拼读的 `build.py` 支持 `--only <课号>`、`--skip-audio`、`--voices m`。

## 部署

```powershell
.venv\Scripts\python.exe -I build\build_cloudflare_site.py
npx --yes wrangler@latest pages deploy build\cloudflare-site --project-name npesl --branch main
npx --yes wrangler@latest pages deploy build\cloudflare-audio --project-name npesl-audio --branch main
```

主站是 https://npesl.pages.dev/。A1–C2 两套语音约 1.76 万个文件，和页面放在一起会超过 Cloudflare Pages 单次部署 20,000 个文件的上限，所以音频单独部署到 https://npesl-audio.pages.dev/audio/；ESLSE 的语音留在主站的 `/conversation/eslse/audio/`。

离线包：

```powershell
.venv\Scripts\python.exe -I build\build_offline_package.py
```

生成 `build/npesl-offline/` 和 `build/NPESL-offline-<日期>.zip`，所有链接改成相对路径，解压后直接双击 `index.html` 就能用。

## 路径约定

- **构建都从库根目录运行**，脚本用 `Path(__file__)` 向上定位库根；`06-发音/`、`05-ConversationStarters/`、`01-零基础入门/` 的层级不要改。
- 页面里的站内链接是部署后的绝对路径（`/phonics/`、`/ipa/`、`/drill/`、`/conversation/`、`/phenomena/`），源目录本身不是可直接预览的站点；要看效果先跑 `build_cloudflare_site.py` 或 `build_offline_package.py`。
- 语音地址：A1–C2 用 `https://npesl-audio.pages.dev/audio/`，ESLSE 用相对的 `audio/`。离线包会把音频站地址改回相对路径。

## 部署前自检

```powershell
.venv\Scripts\python.exe -I build\check_bre.py 06-发音 05-ConversationStarters
```

要求 FIX = 0；REVIEW 项逐条人工判断。内容用小写美式英语，例句要有具体场景。
