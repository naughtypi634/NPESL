# 短语动词内容源

页面在 `apps/phrasal/`，由 `apps/phrasal/source/build.py` 生成。改内容只改这里。

**每个主题固定 30 条**，按 `themes.json` 的顺序排列。页面只显示【口语】【可分】两个徽章；
「可分」在页面顶部有全局说明（代词放中间，名词两边都行）。

```
chapters.json   12 章（stage 1-4）+ 每章对应的 chip
travel.json     出行与方位     24 条
home.json       住处与家务     17 条
food.json       吃饭与购物     12 条
health.json     身体与就医     14 条
social.json     社交与人际     15 条
study.json      学习与考试     12 条
work.json       工作与求职     20 条
money.json      钱与办事       12 条
feelings.json   情绪与压力     14 条
thinking.json   想法与决定     14 条
time.json       时间与计划     12 条
habits.json     习惯与性格     12 条
```

共 178 条：tier 1 八十条、tier 2 七十四条、tier 3 二十四条。写内容的规矩见
`apps/phrasal/source/AUTHORING.md`。

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

## 还没做

- 每章的「三栏辨析」练习（原书按小品词归组、多组补语强制辨析的那种）。
- 按动词 / 小品词 / 主题三入口检索的词典页（替代原书那套错行的字母索引）。
- 覆盖到原书 579 条的规模：目前 178 条，缺口主要在双小品词和书面语条目。
