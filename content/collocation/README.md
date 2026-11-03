# 短语搭配内容源

页面在 `apps/collocation/`，由 `apps/collocation/source/build.py` 生成。改内容只改这里。

30 个主题，共 **1,279 条**：短语动词 1,122、介词搭配 98、习语/固定短语 59。
每条都带 `kind`（phrasal / prep / idiom）；页面显示类型、语体（口语/中性/书面）和【可分】。
每章 32–74 条，页面顶部可按类型和小品词筛选。

`opposites.json` 存反义关系：`pairs` 是两两配对的词条 id（可跨主题、一条可挂多个），
`word_opposites` 是「反义是单个单词」的提示（如 `take off` 起飞义 → `land`），只显示不跳转。

```
themes.json          30 个主题：分类、英文标题、中文标题、简介、对应 chip
opposites.json       反义词条配对 + 单词反义提示

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
