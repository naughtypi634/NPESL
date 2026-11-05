# 短语搭配内容规范

源文件在 `content/collocation/`：`themes.json` 定主题，每个主题一个 `<theme>.json`
（如 `getting-around.json`）。30 个场景主题，每章 32–74 条，新条目追加到对应主题文件
末尾即可。页面由 `build.py` 生成。

每条都有 `kind`：`phrasal`（短语动词）、`prep`（介词搭配）、`idiom`（习语/固定短语）。
`phrasal` / `prep` 的 `particle` 必须是 head 里的词；`idiom` 的 `particle` 留空，
`separable` 为 false。

```powershell
.venv\Scripts\python.exe -I apps\collocation\source\validate.py   # 先过校验
.venv\Scripts\python.exe -I apps\collocation\source\build.py      # 合成音频 + 出页面
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
- **及物/可分的词要写清搭配对象**：`stand someone up`（人）、`blow off a meeting/plans`
  （事/安排）、`pick me up`（代词夹中间）。不能只写「放鸽子」这种看不出宾语类型的释义。
- `confusables` 写易混词，`collocations` 写两三条固定搭配。

## 反义关系

`content/collocation/opposites.json` 单独存反义，不写进词条：

```json
{
  "version": 1,
  "pairs": [["pick-up", "drop-off"], ["put-on", "take-off"]],
  "word_opposites": {
    "take-off": [{"word": "land", "zh": "落地、着陆", "sense": 1}]
  }
}
```

- `pairs` 里两个 id 必须都存在；一条词条可以出现在多对里（按义项），但不能自配对、不能重复。
- 关系写一次，构建时双向生成按钮；跨主题也可以配。
- 反义是单个单词、词库里没有这个词条时，写进 `word_opposites`：`sense` 是第几个义项
  （从 1 开始），页面只在义项下面显示「反义 land（落地）」，不做跳转。
- 按**义项**配对，不按词形：`turn up`（到场）和 `turn down`（拒绝）不是反义。

## 例句

- 美式英语：加油站写 `gas station`，排队写 `line up`，妈妈写 `mom`，不用英式对应词。
- 2026 年中国成年人生活：外卖、地铁、加班、面试、租房、微信、快递驿站。
  不写英国留学特有的宿舍、学期安排、医保卡、连锁药妆店这类场景。
- 一句一个画面，6–20 词，口语里真的会这么说。
- 不搬运参考书的原句。结构可以借，句子全部重写。

## 校验器会拦什么

英式拼写和场景词、英文例句里的中文、例句过短或过长、重复例句、id 重复、
chip 不存在、IPA 混入非美式字符、tier 1 缺 `l1_note`。

## 2026-11 新增：chunk、freq、variants

### `kind: "chunk"`

单词、`be + -ed 形容词`、整句、带 `one's / someone / something` 的词块都用它。

- `head` 允许 1 个词，允许自然大小写（`I'm tired`）；
- 不要求 `base / particle / separable / ipa`；
- `chip` 必填；`register`、`l1_note` 可选；
- 卡片不显示类型徽章，只显示语域；短语动词仍显示【可分】/【不可分】。

### `freq`

每条（含原有词条）都有 `freq` 1–5，构建时主题内按它降序：

- 5 = 几乎天天用，4 = 每周用，3 = 特定场景常用，2 = 较少用，1 = 低频/进阶；
- 生成：`score_frequency.py`（wordfreq + 原顺序 70% / 频率 20% / tier 10%）；
- 写回：`apply_frequency.py --force --write`；
- 人工锁定放 `content/collocation/frequency-overrides.json`（按 id）。

### `variants`（卡片内近义替换）

```json
"variants": [
  {
    "head": "pumped",
    "ipa": "pʌmpt",
    "zh": "兴奋得不行",
    "register": "spoken",
    "freq": 4,
    "example": { "en": "I'm pumped for the concert.", "zh": "演唱会让我兴奋得不行。" },
    "note_zh": "比 excited 更口语，带一股冲劲；多为自己期待的事。"
  }
]
```

- 固定 3 条；`head / ipa / zh / register / freq / example / note_zh` 必填；
- `note_zh` 写和锚点、另外两条的细微差别，只写「同义」会被拦；
- 例句 4–15 词，短、日常、美式；
- 锚点本身必须是普通词条；变体不是主题列表里的独立行。

### 工具

```powershell
python -I tools\collocation\import_phrasebook.py          # PDF → build/phrasebook
python -I tools\collocation\score_frequency.py            # 生成频率报告
python -I tools\collocation\apply_frequency.py --force --write
python -I tools\collocation\build_anchor_candidates.py    # 锚点候选表
python -I tools\collocation\add_entries.py --file <batch> # 批量加词条
python -I tools\collocation\add_variants.py --file <batch># 给现有词条挂近义
```
