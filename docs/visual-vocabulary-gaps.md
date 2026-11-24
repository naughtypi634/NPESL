# 图解词汇 · 内容缺口清单

2026-11-22 逐场景看图整理。分两类：

- **补标注**：图上已经画出来，只是没有对应的词条。只改 `content/visual-vocabulary/scenes/*.json`，不用重画。
- **补画面**：场景里该有、但图上没有的常见物件。要改该场景的提示词重画，再重新标注（全站统一皮克斯画风，重画一次即可）。

## 已处理

- `shop-underwear`：右下角的平角短裤（`boxer-shorts`，词卡和录音库里已有）。

## 待补标注（图上有，词条缺）

| 场景 | 图上可见但没标 |
|---|---|
| `kitchen-stove` | 左侧那口平底锅（现在只有右侧的 wok 标了） |
| `room-laundry` | 右侧上下叠放的两台机器里，下面那台没有独立词条 |
| `room-bedroom` | 梳妆台上的小台灯（现有 `bedside-lamp` 标在床头柜上） |
| `room-entryway` | 长凳下面的鞋 |
| `room-dining` | 边柜上的花瓶与花 |
| `room-study` | 书桌左侧的木杯/笔筒 |
| `kitchen-storage` | 上层搁板与柜门 |
| `room-living` | 电视柜格子里的黑色设备 |

这些需要一个新词或一个新 slug；如果只是同类物的第二件（第二台洗衣机、第二盏台灯），
更合适的做法是扩展现有词条而不是新增词。

## 待补画面（该有但没有）

按用户点名的三处和相近缺口：

| 场景 | 缺的物件 | 词库现状 |
|---|---|---|
| `room-living` | 扫地机器人 `robot-vacuum`、边几 `side-table`、脚凳 `ottoman`、壁架 `wall-shelf`、懒人沙发 `beanbag` | 词卡与录音已有（`robot-vacuum` 在「清洁」组），只缺画面与热点 |
| `room-study` | 路由器 `wi-fi-router`、笔记本 `laptop`、摄像头 `webcam`、文件柜 `file-cabinet`、剪刀 `scissors` | 词卡与录音已有 |
| `shop-underwear` | 运动内衣 `sports-bra`、家居服 `pajama-set`、浴袍 `robe`、连裤袜 `tights`、船袜 `ankle-socks` | 词卡与录音已有 |
| `room-dining` | 花瓶 `vase`、餐巾 `napkin` | 词库里没有，需要生成词卡图 + 录音 |
| `room-entryway` | 运动鞋 `sneakers`（长凳下） | 词卡在 clothing / packing 套里，可跨套借用 |

整组「智能设备」9 个词（遥控器、路由器、智能音箱、智能插座、监控、烟感、投影仪、游戏机、手柄）
目前在任何一个场景里都没有出现。若要补，最自然的位置是客厅和书房。

## 建议的下一轮做法

1. 先定每个场景的目标词数：大场景（厨房、客厅、超市）14–18，小场景 8–12。
2. 只补「图上已画」的先做，成本最低。
3. 需要重画场景的，把新物件写进提示词，按现有管线重画一次（全站统一皮克斯画风，坐标一致）：
   `restyle.py --all --styles pixar --denoise 0.88 --source-style flat`
   → `masks.py --all --source-style pixar` → `build_images.py --all`。
4. 新词先查词卡库；库里没有的，用 `gen_cutout.py` 生成词卡图、`gen_audio.py` 补男女声录音。
