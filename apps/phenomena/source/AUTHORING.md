# 常见发音现象(AmE) · 内容规范

每课锁定一个常见发音现象(AmE)（弱读、连读、吞音、变音、缩合……），一个 JSON 对象，放在
`source/content/batchN.json`，文件内容是**对象数组**。

```json
[
  {
    "num": 1,
    "title_en": "Your Stop Is Next",
    "title_zh": "你下一站下",
    "targets": [
      {
        "written": "your / you're",
        "spoken": "yer",
        "demo": {
          "display": "[Your|yer] stop is next, right?",
          "text": "Your stop is next, right?"
        }
      }
    ],
    "lines": [
      {
        "display": "[Your|yer] stop is next, right?",
        "zh": "你下一站下，对吧？"
      }
    ],
    "discussion": {
      "en": "Do you ever miss your stop because you're on your phone?",
      "zh": "你有没有因为看手机坐过站？"
    }
  }
]
```

## 字段

- `num`：章号，全书唯一。首发 5 章沿用原书章号（1、7、8、9、14），后续补齐时章号不变位。
- `title_en` / `title_zh`：章节标题，自成一句，不写“第 X 课”。
- `targets`：本课的常见发音现象(AmE)，1–2 组。`written` 是原词写法，`spoken` 是实际读音的标注写法。
  - `demo`：章节最上方例句卡。`display` 带 `[原词|读音]` 标注（页面把读音排在原词下方），`text` 是送给 TTS 的原句。挑**最能代表本课现象**的一句。
- `lines`：12–16 行句子，不标说话人。
  - `display`：屏幕上显示的**原文**，用 `[原词|读音]` 标注本课现象出现的地方；读音标注与原词同字号，排在原词下方。
  - `zh`：这一行的中文。
  - 每行只合成一个音频（原拼写、正常语速），读音标注只作显示，不喂给 TTS。
- `discussion`：最后一句讨论题，`en` 与 `zh` 各一条。

## 硬规则

- **2026 年中国成年学习者**：地铁、外卖、加班、面试、租房、微信、快递、看病、聚餐。不用过时或陌生的场景（不要“和平队”“好莱坞肥皂剧”这类原书场景）。
- **美式英语**：subway / apartment / vacation / cell phone / takeout / line / on the weekend / Do you have…?。
- **句子有画面**：每句要有人、地点或动作，不写干巴巴的通用句。
- **现象要真的出现**：本课目标在 12–16 行里至少出现 6 次，且分布在不同说话人身上。
- **`[原词|读音]` 只圈本课现象**：别把别的现象也圈上；标注跨几个词就写几个词（`[What do you|whaddaya]`）。
- **原文照原样写**：`display` 里是正常拼写和标点，读音只出现在标注和 `say` 里。
- **一个音，正常语速**：每行只合成一条（原拼写、`RATE = +0%`），页面不设快慢两档；要慢就拖语速滑块。读音靠 Edge 在正常语速下的自然弱化，不靠假拼写（`yer` 会被读成 "you"）。
- **不出现任何 meta 文字**：不写“先听一遍”“跟读练习”“注意这里”之类；页面只有标题、目标卡、对话、讨论题。
- **中文自然**：中文是那句话在这一场景下的自然说法，不是逐词直译。
- **标点用 ASCII**：撇号写 `'`，不写 `’`。

## 自检

```powershell
.venv\Scripts\python.exe -I apps\phenomena\source\validate.py
```

要求 `problems: 0`。检查项：JSON 可解析、章号不重复、12–16 行、每行字段齐全、说话人名字是英文、`display` 的标注加 `say` 能拼回整句、标注里只出现本课读音形、中文非空。
