# tools/

构建、校验与内容工具的入口。日常只需要两条命令：

```powershell
.venv\Scripts\python.exe -I tools\build_all.py     # 全量构建
.venv\Scripts\python.exe -I tools\verify.py        # 交付前自检
```

下面按用途分类。标「一次性」的脚本没有接进任何流程，保留是因为以后可能还用得上。

## 生产入口

| 脚本 | 作用 |
|---|---|
| `build_all.py` | 按依赖顺序跑全部应用与站点装配；`--only`、`--skip-site`、`--refresh-ipa-audio` |
| `verify.py` | 一次跑完产物比对、音频引用、英式英语、无头浏览器冒烟 |
| `build_cloudflare_site.py` | 把六个应用装配成 `build/cloudflare-site/` 与 `build/cloudflare-audio/` |
| `build_ipa_site.py` | 音标表页面 + 全部单词的男女两版录音；默认 `--tts azure`，`--skip-audio` 只用缓存 |
| `apps/conversation/source/build_site.py` | Conversation Starters 页面与全部级别语音 |
| `drill/make_audio.py` | Question Drill 逐句语音（读 `content/drill/questions.json`） |
| `drill/assemble.py` | Question Drill 页面、题库脚本与 sprite；默认从 `questions.json` 重渲染 |
| `clean_build.py` | 清 Edge 临时配置、日志、`__pycache__`；`--all` 连部署暂存；`--scratch` 清 build 顶层残留 |
| `audit_build.py` | 产物 SHA-256 快照与比对（`--label` / `--diff`） |
| `check_assets.py` | 检查页面引用的音频文件是否真的存在 |
| `check_bre.py` | 英式英语扫描（只扫 Markdown） |
| `preview_site.mjs` | 带 Range 的本地静态服务器 |
| `edge.mjs` | 无头 Edge 助手；`node tools/edge.mjs` 清残留进程 |

## 共享库

| 文件 | 作用 |
|---|---|
| `paths.py` | 所有路径与公开地址的唯一来源 |
| `themes.py` | 主题 id 与首屏 `data-theme` 脚本 |
| `audio_sprite.py` | 把逐条 MP3 拼成每页一条 sprite |
| `azure_speech.py` | Azure TTS（REST 与 Speech SDK） |
| `lib/cli.py` | UTF-8 输出、子进程步骤执行 |
| `apps/conversation/source/pron.py` | Conversation 的发音标注 |

## 内容工具

| 脚本 | 作用 |
|---|---|
| `drill/check_dup.py` | 补题查重 |
| `drill/check_text.py` | 补题结构与用词检查 |
| `drill/tag_chips.py` | 打 `chip` 并把 `topup/` 合并进题库 |
| `drill/prune_audio.py` | 删除题库不再引用的音频 |
| `drill/test_app.mjs` | Question Drill 单文件版的行为测试 |
| `apps/collocation/source/validate.py` | 短语搭配内容校验（改内容后必须先跑） |
| `apps/phonics/source/validate.py` | 自然拼读结构校验 |
| `apps/phenomena/source/validate.py` | 发音现象标注校验 |

## 一次性 / 分析脚本

没有接进 `build_all.py` 或 `verify.py`，需要时手动跑。

| 脚本 | 作用 |
|---|---|
| `drill/audit.py` | 题库质量统计 |
| `drill/metrics.py` | 原始批次质量标记 |
| `drill/diff_batches.py` | raw / reviewed / final 批次差异 |
| `drill/validate_bank.py` | 旧的批次契约检查（已被题库工具取代） |
| `apps/phenomena/source/audition.py` | TTS 拼写试听 |
| `apps/phenomena/source/audition_rate.py` | 不同语速试听 |
| `apps/phonics/source/check_sounds.py` | 用 cmudict 检查音素 |
| `apps/phonics/source/build_single.py` | 生成单文件版 HTML（tracked，但不在全量构建里） |

## 关于「pull 下来就能构建」

仓库里 tracked 的是**已交付的母版音频**（IPA、Phenomena、Phrasal、Drill）。下面两个缓存是 gitignore 的，新克隆后第一次构建会联网合成：

- `apps/phonics/source/audio/` —— 自然拼读 96 条故事录音
- `build/tts/cs/` —— Conversation 的逐句录音与 sidecar

所以全新克隆的第一次全量构建需要 Azure / Edge 凭证；之后都只补缺失项。
