# 自然拼读阅读训练 · 成人 A1 · 内容规范

每课一个 JSON 对象，放在 `source/content/batchN.json`，文件内容是**对象数组**。

```json
[
  {
    "num": 1,
    "ipa": "/i/",
    "patterns": "e · ee · ea · ie · ey",
    "title_en": "A Free Coffee",
    "title_zh": "免费的咖啡",
    "sentences": [
      {
        "say": "Li Na needs coffee on Monday morning.",
        "chunks": [
          {
            "display": "Li Na n[ee]ds coffee",
            "say": "Li Na needs coffee",
            "zh": "李娜要喝咖啡"
          },
          {
            "display": "on Monday morning.",
            "say": "on Monday morning",
            "zh": "周一早上。"
          }
        ]
      }
    ]
  }
]
```

## 字段

- `num`：课号 1–48，全书唯一。
- `ipa`：本课音标，例如 `/i/`、`/ɪ/`、`/θ/`。
- `patterns`：本课目标音的拼写组合，用 ` · ` 分隔，例如 `a · ai · ay · ea · ey · eigh`。
- `title_en` / `title_zh`：英文标题 / 中文标题，自成故事名。
- `sentences`：8–10 句。每句：
  - `say`：整句英文，送给语音合成；不含方括号，标点正常。
  - `chunks`：1–3 个意群，按顺序拼回整句。
    - `display`：显示文本，**用 `[ ]` 圈出本课目标音的字母或字母组合**，例如 `w[ai]ts`、`st[a]tion`、`Th[ey]`。没有目标音就不加。
    - `say`：该意群的纯文本，不含方括号；与 `display` 去除方括号后的文字一致（标点可省略）。
    - `zh`：该意群的中文，和前后意群连起来是自然的中文句子。

## 断句与语音停顿

音频是**整课一条**，页面上的 `chunks` 只是时间切片；TTS 不一定在分块边界真的停顿。如果听感把意群读错了，在**这一句的 `say` 和对应 chunk 的 `say` 里加句号或分号**（逗号在 Azure/Edge 里停顿不稳定），例如：

```json
"say": "The manager walks in. With a big coffee.",
"chunks": [
  { "display": "The [m]anager walks in", "say": "The manager walks in.", "zh": "经理走进来，" },
  { "display": "with a big coffee.", "say": "With a big coffee.", "zh": "手里端着一大杯咖啡。" }
]
```

改完只重建这一课：

```powershell
apps\phonics\source> ..\..\..\.venv\Scripts\python.exe -I -X utf8 build.py --only 43 --tts azure --force
```

整课会重新合成一次（Azure F0，几百字符），页面时间轴会自动重算；不需要手动剪音频。`display` 可以保持原样，`say` 只用于语音。

## 硬规则

- **成人 A1**：读者是 2026 年中国成年英语学习者。场景用外卖、地铁、加班、面试、租房、微信、快递、看病、聚餐等当代生活；不要童话、动物主角、校园儿童场景。
- **美式英语**：拼写、词汇、语法全部美式（subway / apartment / vacation / cell phone / takeout / line 等）。
- **例句有画面**：每句都要有具体人物、地点或动作，不写干巴巴的通用句。
- **目标音要真的对**：`[ ]` 只圈真正发本课音的字母。拿不准的词不要圈（例如 /eɪ/ 课里 `says` 读 /sez/，不能圈）。
- **句子逻辑不拆坏**：意群按语法和语义切，不把动词和宾语硬拆；中文按意群对应，但连起来必须通顺。
- **不出现任何 meta 文字**：不写“本课练习……”“先看……”“注意……”之类；页面只有标题、音标、拼写组合和文章。
- 每课的目标音至少覆盖 `patterns` 里的大部分组合；同一个组合可以在多个词里重复。

## 自检

1. JSON 能被 `json.load` 解析。
2. 每课 8–10 句，每句 1–3 个意群。
3. 每句的 `chunks[*].say` 按顺序拼起来，去掉标点后等于该句 `say`。
4. 每个 `display` 去掉 `[ ]` 后等于对应 `say`（标点可省略）。
5. 没有英式拼写。
