# 短语动词内容源

页面在 `apps/phrasal/`，由 `apps/phrasal/source/build.py` 生成。改内容只改这里。

**每个主题固定 30 条**，按 `themes.json` 的顺序排列。页面只显示【口语】【可分】两个徽章；
「可分」在页面顶部有全局说明（代词放中间，名词两边都行）。

```
themes.json          30 个主题：分类、英文标题、中文标题、简介、对应 chip

【日常起居】
cooking.json              做饭采购        30 条
weather.json              天气          30 条
technology.json           科技数码        30 条
shopping.json             购物          30 条
ootd.json                 今日穿搭        30 条
makeup.json               化妆流程        30 条
home.json                 居家          30 条
eating-out.json           外出吃饭        30 条

【出行与金钱】
getting-around.json       出行          30 条
transportation.json       交通          30 条
directions.json           问路          30 条
travel.json               旅行住宿        30 条
money-banking.json        金钱银行        30 条
errands.json              办事跑腿        30 条

【身体与健康】
feeling-off.json          身体不适        30 条
doctor.json               看病拿药        30 条
fitness.json              运动与饮食       30 条

【人际与情绪】
feelings.json             情绪感受        30 条
gossip.json               八卦          30 条
conflicts.json            冲突          30 条
frustrations.json         日常糟心事       30 条
relationships.json        恋爱与家庭       30 条
chatting.json             跟人聊天        30 条

【工作与学习】
office.json               办公室         30 条
meetings.json             会议与项目       30 条
job-hunting.json          求职面试        30 条
study.json                学习考试        30 条

【语言功能】
weekend-plan.json         周末计划        30 条
decisions.json            想法与决定       30 条
communication.json        沟通          30 条
```

共 900 条（30 个主题 × 30 条，分 6 大类）。`tier` / `level` 是可选字段，早期条目填了，
后来补的条目没填。写内容的规矩见 `apps/phrasal/source/AUTHORING.md`。

## 来源与取舍

结构参考《口语-常见词组 完全版》（Harlan Jant）的编排方式：按人生场景分章、
每条带 IPA / 语域 / 中译 / 例句 / 搭配 / 易混。**例句、释义、中文提示全部重写**，
没有搬运原书句子（原书标明受版权保护）。

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

- 目录页只有两级 chip，全部在当前页展开，不跳转页面。
- 默认「场景话题」+「全部」：按分类分区列出所有短语，按主题分组，主题标题可进主题页。
- 切到「介词」默认「全部」；选某个介词只显示该介词的短语。
- 页面数据在 `data.<hash>.js`（构建生成，内容哈希命名），首页 HTML 只有几 KB。
- 页面不显示任何统计/说明型 meta 文案（如「30 个主题 · 900 条」）。

## 还没做

- 每章的「三栏辨析」练习（原书按小品词归组、多组补语强制辨析的那种）。
- 按基础动词（get / take / put…）检索的入口。
