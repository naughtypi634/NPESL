# 逻辑重音标注规范

给 Conversation Starters 全量补 `stress` 标注时使用。目标不是给每个实词标重音，而是先切句子成分，再判断这句话在上下文里真正要强调什么。

## 文件位置与格式

每个单元一个文件：`content/conversation/<LEVEL>/stress/u<NN>.json`

```json
{
  "unit": 2,
  "stories": {
    "Homes": {
      "My home is a spacious two-story house with four bedrooms and three bathrooms.": {
        "primary": ["house"],
        "secondary": ["spacious", "bedrooms", "bathrooms"],
        "note": "全句在介绍房子：house 是核心，spacious 和房间数量是支撑信息。"
      }
    }
  }
}
```

- `unit`：1–10。
- `stories` 的键必须和 `content.py` 里的 story title 完全一致。
- 句子键必须是页面上可播放的完整字符串：
  - `text` 里的段落先按 `. ! ?` 拆成句子；
  - `comp` / `conv` 每一条整条作为一个键（即使里面有多句话）。
- 不标 story title，不标 vocab 单词。
- 英文原文一个字都不能改。

## 判断步骤

1. **切成分**：主语、谓语、宾语、状语、从句、并列项、插入语。
2. **看上下文**：这句话在段落里是新信息、对比、让步、举例，还是评价？
3. **定焦点**：真正回答问题或推进信息的那个成分，才是主重音。
4. **再定次重音**：只有确实存在的第二焦点才标——并列项、对比项、被强调的修饰语、另一个分句的核心。不要因为它是实词就标。

## 主重音 primary

- 每个分句/意群 1 个核心；一个句子可以有 1–3 个 primary。
- 典型位置：
  - 句末信息焦点：`I have two **siblings**.`
  - 对比焦点：`not the solution`、`rather than my own choices`
  - 评价落点：`is truly **rewarding**`
  - wh- 问句里被问的成分：`What **factors**...`
- 功能词只有在真正对比时才做主重音（如 `Let **him** do it, not her`）。

## 次重音 secondary

- 0–6 个；不是必须每句都有。
- 只标真正的第二焦点：
  - 并列项：`tools` / `technologies`
  - 对比项：`trivial` vs `serious`
  - 另一个分句的核心：`monotonous` / `impact`
  - 被强调的修饰语：`constant` learning
- 不要标背景名词、介词、冠词、代词、助动词、普通限定语。
- 例句：`dinner table` 里的 `table` 只是背景，不标。

## 升调 rise / 降调 fall

只用于真正的并列、列举、选择疑问句。标在并列项的收尾词上。

- 非末项：`"rise": ["games"]`
- 末项：`"fall": ["day"]`
- 一个词可以同时是 primary 和 fall；渲染时 fall 优先。
- 没有并列就不要加 rise/fall。

例：

```json
"whether it was playing board games, going on hikes, or just sitting around the dinner table and catching up on our day.": {
  "primary": ["family", "day"],
  "secondary": ["games", "hikes"],
  "rise": ["games", "hikes"],
  "fall": ["our", "day"],
  "note": "主句焦点是 family；两个并列活动 games / hikes 升调，末项 our day 降调。"
}
```

## note

- 中文，一句话，说明「为什么这个词是焦点」。
- 不要复述句子，不要写泛泛的「强调重点」。
- 好例子：
  - `"两个分句各一个核心：monotonous 是工作状态，impact 是缺失的结果。"`
  - `"问是否喜欢“每一个”方面，every 是确认焦点。"`

## 词形与重复词

- 用文本里真实出现的词形：`character's`、`parents'`、`don't`、`it's`。
- 同一个词出现多次时，用 `word#2` 指定第二次出现，例如 `"family#2"`。
- 大小写不敏感。

## 禁止

- 不要为了「每句都有主+次」强行加次重音。
- 不要把句末词默认当主重音；先看语义。
- 不要把整段英文改成标记文本。
- 不要改 `content.py` 的英文内容或结构。
- 不要给 title / vocab 加句子重音。

## 校验

写完一个单元后运行：

```powershell
.venv\Scripts\python.exe -I tools\stress_report.py --level <LEVEL> --unit <N> --require-all
```

要求 `FIX 0`。`REVIEW 0` 表示该单元所有正文/阅读题/对话句都已标注。
