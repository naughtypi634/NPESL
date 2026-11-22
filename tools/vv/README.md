# tools/vv/ · 图解词汇管线

日常只需要构建页面的三个脚本，它们已经在 `build_all.py` 的 `visual-vocabulary` 步骤里：

```powershell
.venv\Scripts\python.exe -I tools\build_all.py --only visual-vocabulary,site
```

其余脚本只在重画图片时用，需要本机 ComfyUI（`http://127.0.0.1:8188`）与显卡。

## 内容源

| 路径 | 内容 |
|---|---|
| `content/visual-vocabulary/scenes/*.json` | 一个场景一个文件：标题、场景图、遮罩、每个词的坐标 `pt`、候选框 `box`、录音与跨套引用 |
| `content/visual-vocabulary/sets/*.json` | 一套词卡：分组与条目（slug / 英文 / 中文 / 图 / 录音 / 生成提示词） |
| `content/visual-vocabulary/actions.json` | 27 个烹饪动作 |

`pt` 是热点中心（画面百分比）；`box` 是物件的范围框 `[x0,y0,x1,y1]`，
同时用于抠遮罩和页面上的命中判定。改了框就要重跑 `masks.py`（遮罩会变）
和 `build_pages.py`。

## 构建页面（不联网、不需要显卡）

| 脚本 | 作用 |
|---|---|
| `build_pages.py` | 场景页；`--check` 只报告过期页 |
| `build_set_pages.py` | 主题页的词卡 `<main>`；贴图页外壳仍写在 HTML 里 |
| `build_actions_page.py` | 烹饪动作页；缺原图时会提示先跑 `gen_actions.py` |

三个脚本都是幂等的：内容没变时输出逐字节相同。

## 重画图片

顺序：生成 → 超分 → 遮罩 → 导出。工作文件都在 `build/vv-work/`（gitignore）。

```powershell
# 1. 场景底图（提示词写进命令，或存成文本用 --prompt-file）
.venv\Scripts\python.exe -I tools\vv\gen_scene.py --prompt-file p.txt --out build\vv-work\out\study --seeds 2

# 2. 超分到 3072×1920
.venv\Scripts\python.exe -I tools\vv\upscale.py --image build\vv-work\out\study\seedXXX.png --out build\vv-work\out\study\up.png

# 3. 物件遮罩（读 scenes/*.json 的 box）
.venv\Scripts\python.exe -I tools\vv\masks.py --spec content\visual-vocabulary\scenes\room-study.json

# 4. 导出 2400×1500 / 960 缩略图（见 build_images.py，重画时用）
.venv\Scripts\python.exe -I tools\vv\build_images.py content\visual-vocabulary\scenes\room-study.json
```

单物件词卡与录音：

```powershell
.venv\Scripts\python.exe -I tools\vv\gen_cutout.py --item router:"a small white wi-fi router with two antennas"
.venv\Scripts\python.exe -I tools\vv\gen_card_image.py --only router
.venv\Scripts\python.exe -I tools\vv\gen_audio.py --jobs   # 列出缺口
.venv\Scripts\python.exe -I tools\vv\gen_audio.py --run    # 合成
```

配音沿用现有音色：`h2`（女）、`c`（男），本机 Qwen3-TTS 克隆，
环境在 `F:\AIProject\tts-lab`。

## 约束

- 同一页面只用一种音源，不要新旧混用。
- 遮罩文件名必须是 `<page>-<slug>.webp`，放在该套的 `assets/scenes/masks/`。
- 场景图文件名带内容哈希，换了图就换名，缓存自动失效。
- 改了页面模板后，用 `--check` 确认哪些页面过期，再整批重建。
