# 短语动词内容规范

源文件在 `content/phrasal/`：`themes.json` 定主题，每个主题一个 `<theme>.json`
（如 `getting-around.json`）。改内容只改这两个地方，页面由 `build.py` 生成。

```powershell
.venv\Scripts\python.exe -I apps\phrasal\source\validate.py   # 先过校验
.venv\Scripts\python.exe -I apps\phrasal\source\build.py      # 合成音频 + 出页面
```

## 一条词条

```json
{
  "id": "pick-up",
  "head": "pick up",
  "base": "pick",
  "particle": "up",
  "ipa": "ˈpɪk ʌp",
  "tier": 1,
  "level": "A2",
  "chip": "airport",
  "register": "spoken",
  "separable": true,
  "zh": "开车接（人）；顺路取（东西）",
  "senses": [
    { "zh": "开车接人", "en": "to collect someone in a car",
      "example": { "en": "Can you pick me up at Exit C?",
                   "zh": "你能在 C 口接我吗？" } }
  ],
  "l1_note": "代词必须夹在中间：pick me up。",
  "confusables": ["drop off", "take up"],
  "collocations": ["pick up the phone"]
}
```

- `head` 全小写；`base` 是第一词，`particle` 是 base 之后的小品词。
- `ipa` 只写**美式**一套，不带斜杠，要带主重音 `ˈ`。同一本书里 `pass` 写两种、`over` 写两种的情况不要出现。
- `level`：A2 / B1 / B2 / C1。`tier`：1 = 出门就能用，2 = 常见，3 = 进阶。
- `chip` 必须来自 `content/drill/chips.json`（21 个筛选场景）。
- `separable`：代词能不能插中间。true 的要在 `l1_note` 里点明。
- `l1_note` 是本书没有的字段，写中文母语者的真实错误（代词位置、介词悬空、直译）。
  tier 1 必填。
- `confusables` 写易混词，`collocations` 写两三条固定搭配。

## 例句

- 美式英语：加油站写 `gas station`，排队写 `line up`，妈妈写 `mom`，不用英式对应词。
- 2026 年中国成年人生活：外卖、地铁、加班、面试、租房、微信、快递驿站。
  不写英国留学特有的宿舍、学期安排、医保卡、连锁药妆店这类场景。
- 一句一个画面，6–20 词，口语里真的会这么说。
- 不搬运参考书的原句。结构可以借，句子全部重写。

## 校验器会拦什么

英式拼写和场景词、英文例句里的中文、例句过短或过长、重复例句、id 重复、
chip 不存在、IPA 混入非美式字符、tier 1 缺 `l1_note`。
