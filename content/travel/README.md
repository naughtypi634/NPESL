# Travel English 内容源

23 个场景，8 个行程阶段。一个场景 = 一处真实地点（机场、酒店、餐厅），
热点 = 这处地点里的不同柜台/区域。每个场景 3–5 个热点，每个热点 3 层：
Survival / Conversational / Advanced。

- `scenes.json`：阶段、场景顺序、地图原型、热点位置。
- `<scene-id>.json`：speakers + encounters + 三层短语/对话。
- 页面与音频由 `apps/travel/source/build.py` 生成，不要手改 `apps/travel/*.html`。

## 场景文件

```json
{
  "scene": "airport",
  "speakers": [
    {"id": "agent", "en": "Agent", "zh": "值机员", "voice": "f", "role": "staff"},
    {"id": "you", "en": "You", "zh": "你", "voice": "m", "role": "you"}
  ],
  "encounters": [
    {
      "id": "check-in",
      "title_en": "At the check-in counter",
      "title_zh": "在值机柜台",
      "levels": {
        "survival": {
          "phrases": [{"en": "I'm flying to New York.", "zh": "我要飞纽约。"}],
          "dialogue": [
            {"spk": "agent", "en": "Passport, please.", "zh": "请出示护照。"},
            {"spk": "you", "en": "Here you go.", "zh": "给你。"}
          ]
        },
        "conversational": {"phrases": [], "dialogue": []},
        "advanced": {"phrases": [], "dialogue": []}
      },
      "listening": [
        {
          "id": "passport",
          "intent_zh": "要护照",
          "keys": ["passport"],
          "asks": [
            {"en": "Can I see your passport?", "zh": "能看一下您的护照吗？"},
            {"en": "May I see your passport?", "zh": "我可以看一下您的护照吗？"},
            {"en": "Passport, please.", "zh": "请出示护照。"}
          ],
          "reply": {"en": "Sure. Here you go.", "zh": "当然，给您。"},
          "pattern": "Can I see…? / May I have…? / …, please.",
          "note": "Can I 常读成「k'n I」。"
        }
      ]
    }
  ]
}
```

`listening` 是“对方可能怎么问”，与三层难度无关，放在 encounter 里只写一份：

- 每个 encounter 2–4 组意图；每组 3–5 种问法、1 条核心答法、1 条句型。
- `intent_zh` 用中文说清对方想干什么（要护照 / 问目的地）。
- `keys` 是听关键词，构建时在问法里高亮第一次出现；至少命中一条问法。
- `note` 可选，只写连读、弱读、语气提示，≤40 字。
- 问法与答法都要当代美式口语真实说法；同一意图内不要重复。

规则：

- 每个场景恰好一个 `role: you`；`voice` 只能是 `f` 或 `m`。
- 每层 4–6 条短语、6–10 轮对话；Survival 每句 2–12 词，另两层 2–28 词。
- 每条英文都有中文；可选 `note`（中文，每层最多一条，讲 L1 易错点）。
- 短语可以在同一场景的对话里原样出现；跨场景不要复制整句。
- 不写计数、进度、已学、完成等文案。

## 写作标准

- 美式英语：color / center / favorite / realize / traveling / canceled；
  line（stand in line）、elevator、apartment、subway、gas、highway、parking lot、
  crosswalk、round-trip ticket、reservation、vacation、pharmacy、takeout、
  check（餐厅账单）、restroom、cell phone、zip code、math、fall、first floor、
  schedule、bus、train station、two weeks。
- 12 小时制（3:30 p.m.）、美元、`September 12, 2026`、`1,500`；中国场景保留公制。
- 场景要具体：机场柜台、酒店前台、地铁站台；对话要有一个小决策，不要 A/B 寒暄。
- 三层不是把同一句拉长：Survival 能独立完成交易；Conversational 加追问和礼貌请求；
  Advanced 处理突发、协商和语气分寸。
- 不抄参考 PDF 的句子，只借话题框架；PDF 是版权材料，不提交。

## 构建

```powershell
.venv\Scripts\python.exe -I apps\travel\source\validate.py
.venv\Scripts\python.exe -I apps\travel\source\build.py
.venv\Scripts\python.exe -I apps\travel\source\build.py --only airport --skip-audio
```

- 音频默认 Azure（Ava/Andrew），按内容哈希增量合成；`--tts edge` 回退。
- 每个场景的 listening 问法/答法拼成 `listen-f` / `listen-m` 两条 sprite；点读时跟随页面的男女声开关。
- 场景页地图有 2D 建筑平面图和 3D 等距模型两套视图，由 `maps.py` 从同一份布局数据生成；热点位置两套坐标都写在按钮上，右上角 `2D | 3D` 开关切换。
- 改一句读音：删掉 `apps/travel/audio/{f,m}` 里对应母版，再跑 `build.py`；
  只重合成这一条，并重拼该场景该层的 sprite。
- 母版入库；`apps/travel/audio/sprites/` 是构建产物，gitignore。
- 构建缺任何一条音频会直接失败，不生成半有声页面。
