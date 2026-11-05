# 短语搭配内容源

页面在 `apps/collocation/`，由 `apps/collocation/source/build.py` 生成。改内容只改这里。

41 个主题，共 **3,299 条**：原 30 个场景 1,279 条（短语动词 / 介词搭配 / 习语），
加上从《日常英语短语手册》并入的 1,944 条，以及 76 条近义锚点。
`kind` 有 phrasal / prep / idiom / chunk 四种；`chunk` 覆盖单词、`be + -ed 形容词`、
整句和日常短语。每条都有 `freq`（1–5），主题内按频率从高到低排：
原顺序 70% + wordfreq 20% + tier 10%。页面不显示类型徽章给 `chunk`，
短语动词显式显示【可分】/【不可分】。

近义替换写在锚点词条的 `variants` 里（固定 3 条），每条带音标、语域、
短例句和必填的差别说明；页面在卡片内显示。

`opposites.json` 存反义关系：`pairs` 是两两配对的词条 id（可跨主题、一条可挂多个），
`word_opposites` 是「反义是单个单词」的提示（如 `take off` 起飞义 → `land`），只显示不跳转。

```
themes.json          41 个主题：分类、英文标题、中文标题、简介、对应 chip
opposites.json       反义词条配对 + 单词反义提示
frequency-overrides.json  人工锁定的 freq（如 be-tired = 5）
phrasebook/
  theme-map.json     200 个 PDF 话题 → 主题的映射，每个话题只用一次
```

【日常生活】
errands.json              办事跑腿
cooking.json              做饭采购
weather.json              天气
technology.json           科技数码
shopping.json             购物
ootd.json                 今日穿搭
makeup.json               化妆流程
weekend-plan.json         周末计划
home.json                 居家
eating-out.json           外出吃饭

【出行与金钱】
getting-around.json       出行
transportation.json       交通
directions.json           问路
travel.json               旅行住宿
money-banking.json        金钱银行

【身体与健康】
feeling-off.json          身体不适
doctor.json               看病拿药
fitness.json              运动与饮食

【人际与情绪】
feelings.json             情绪感受
gossip.json               八卦
conflicts.json            冲突
frustrations.json         日常糟心事
relationships.json        恋爱与家庭
chatting.json             跟人聊天

【工作与学习】
office.json               办公室
meetings.json             会议与项目
job-hunting.json          求职面试
study.json                学习考试

【沟通与思考】
decisions.json            想法与决定
communication.json        沟通

```

主题文件沿用原来的 30 个场景，不再固定每章 30 条。`tier` / `level` 是可选字段。
写内容的规矩见 `apps/collocation/source/AUTHORING.md`。

## 来源与取舍

结构参考《口语-常见词组 完全版》（Harlan Jant）的编排方式：按人生场景分章、
每条带 IPA / 语域 / 中译 / 例句 / 搭配 / 易混。**例句、释义、中文提示全部重写**，
没有搬运原书句子（原书标明受版权保护）。

2026-11-02 又按《Illustrated Phrasal Verb Dictionary》和《Work on Your Phrasal Verbs》
做了全量对齐，补入 310 条（154 条短语动词、98 条介词搭配、58 条习语），按场景归入
现有 30 章。两本书里重复的、英式专用的（排队类表达、knock up 等）和书页标题
（your turn!）没有重复入库，所以总数是 1,277 而不是 1,308。后来又补了两条反义配对缺的词条
（`sign out`、`get off on the wrong foot`），现在共 1,279 条。

相对原书改掉的地方：

- 场景从「中国留学生在英国」换成 2026 年中国成年人生活；
- 英式英语统一改美式（原书的加油站、排队、妈妈、宿舍一类说法都换掉了）；
- IPA 统一为美式一套（原书 `pass` 同时标 /pɑːs/ 和 /pæs/，`over` 同时标
  /ˈoʊvər/ 和 /ˈəʊvə/）；
- 去掉生造或极低频条目（原书 `X-ray through` 的例句不合语法，`Make after`、
  `Zone in`、`Track back` 也不是母语者的日常说法），以及不算短语动词的
  `Go home` / `Go outside` / `Make sense`；
- 新增 `l1_note` 字段，专写中文母语者的迁移错误（代词夹中间、介词悬空、
  turn on 不是 open the light）。

## 2026-11 并入日常短语

`apps/collocation/Phrasebook-Complete.pdf`（200 个话题 × 10 条）按
`phrasebook/theme-map.json` 并入现有场景，新增 12 个主题：

- 日常：`morning` 起床与睡眠
- 人际与情绪：`emotion-expressions` 情绪表达、`attitude-support` 态度与支持
- 沟通与思考：`social-formulas` 社交客套、`requests-refusals` 请求与拒绝、
  `agree-opinions` 同意与观点、`conversation-flow` 对话推进、
  `explain-describe` 解释与叙述、`needs-obligation` 意愿与义务、
  `change-comparison` 变化、异同与偏好、`time-place-memory` 时间、地点与记忆

导入的 2,000 行里，56 行与现有词条 head 相同且义项一致，没有重复入库；
其余全部重写例句后并入，`kind` 用 `chunk`，不带 IPA。PDF 本身是 gitignore
的参考材料，例句一律新写，导入脚本只读英文短语和中文释义。

频率由 `tools/collocation/score_frequency.py` 生成，
`tools/collocation/apply_frequency.py --force` 写回；人工锁定值放
`frequency-overrides.json`。近义替换用 `tools/collocation/add_variants.py`
或 `add_entries.py` 的 `variants` 字段写入。

## 导航

- 目录页只有一级/二级 chip，内容全部在当前页展开，不跳转。
- 默认「场景话题」+「全部」；「全部」只表示该模式的全部（场景=所有分类，介词=所有介词）。
- 切换一级时，二级回到该模式的「全部」。
- 点词条就地展开完整卡片（例句、中文易错、搭配、易混），可再点收起；卡片内可点读。
- 页面不显示任何计数或统计文案。
- 数据在 `data.<hash>.js`（含词条详情与音频时间轴），首页 HTML 约 14KB。

## 还没做

- 每章的「三栏辨析」练习（原书按小品词归组、多组补语强制辨析的那种）。
- 按基础动词（get / take / put…）检索的入口。
