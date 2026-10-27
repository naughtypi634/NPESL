# Question Drill 题库审核

范围：`content/drill/questions.json`，1370 题 / 4110 条说法，15 个大类。
方法：全部中文题目通读 + 200 题随机抽样逐句读英文 + 全库机械检查（问句形式、英式英语、重复、近义说法、注释与英文是否对得上）。

## 结论

整体可用：场景具体、说法口语化，绝大多数是中国人日常生活里真会问的话。
没有系统性问题；下面列出的问题约 25 处，占全库不到 2%。

机械检查结果：

- 缺少问号：0；但有 2 条陈述/请求句硬加了问号（#184、#704），下面单列。
- 完全重复的英文句子：0。
- 英式拼写：`check_bre.py` 词表 0 处；另有 3 题用了 `canteen`（美式应为 `cafeteria`）。
- 每题都有中文注释和男女两条音频。
- 英文说法高度相似（Jaccard ≥ 0.80）：33 组，多数是刻意区分语气，少数确实可以合并。

## 必改（语法 / 语义 / 美式用法）

| # | 中文 | 现在 | 建议 |
|---|---|---|---|
| 1241 | 公交怎么这么久还不来？ | What's taking the bus so long? | What's the holdup with the bus? |
| 1248 | 景区怎么关门了？ | Why is the park closed? / Why is the park shut? | Why is the scenic area closed? / Why is the attraction shut? |
| 1275 | 这件衣服怎么掉色？ | Why did the color run? | Why did the color bleed?（color run 是彩色跑活动名） |
| 161/163/164 | 食堂 | canteen（3 题 6 句） | cafeteria |
| 748 | 你工资多少？ | How much is your salary? | How much do you earn? |
| 1192 | 谁今天没来？ | Who's missing today? | Who's out today? |
| 185 | 能做成微辣吗？ | Is mild possible? | Could you go easy on the spice? |
| 184 | 能不放香菜吗？ | No cilantro, please? | Can I get it with no cilantro?（原句不是问句） |
| 704 | 我请你吃饭？ | Dinner's on me? | Dinner's on me.（问号让意思变成“你请我？”） |
| 746 | 在哪儿聚？ | Where's the meetup? | Where's the reunion? |
| 694 | 你微信多少？ | What's your WeChat? | Can I scan your WeChat QR code? |

## 语义偏移（三种说法里有一条答非所问）

| # | 中文 | 现在 | 建议 |
|---|---|---|---|
| 1214 | 谁的号排在前面？ | Who's next? / Whose turn is it? | 两句话意思都变了；建议整题删掉，或改成 Whose number is ahead of mine? |
| 1047 | 这个讲解器怎么用？ | Do I need to return it today? | Do I press this button to start? |
| 332 | 房东是本人吗？（问中介） | Are you the landlord? | Is the landlord the owner? |
| 461 | 钱少你会跳槽吗？ | Would a pay cut make you leave? | Would you leave for a lower salary?（pay cut 是降薪） |
| 337 | 网费一个月多少？ | How fast is the internet? | Is the internet fee separate? |
| 1003 | 可以拍照吗？ | Is flash allowed? | Are we allowed to take pictures? |
| 244 | 网上挂的号要取号吗？ | Do I need to pick up my number? | Do I still need to take a number? |
| 1199 | 谁的手机在响？ | Who left their phone on? | Is that your phone ringing? |
| 569 | 这个有赠品吗？ | Do you have any free gifts? | Any freebies with this? |
| 463 | 网上推荐的东西值得买吗？ | Are online recommendations worth buying? | Are things recommended online worth buying? |

## 重复与注释

| # | 问题 | 建议 |
|---|---|---|
| 635 | Can I pay with WeChat? / Can I pay with WeChat Pay? 几乎一样 | 第三条改成 Is WeChat Pay okay? |
| 1191 | Who turned off the AC? / Who turned the AC off? 只差语序 | 一条改成 Did someone turn off the AC? |
| 1271 | Why is it more expensive now? / Why is it more expensive? 重复 | 一条改成 Why did they raise the price? |
| 756 | 三条注释两条完全相同 | 重写其中一条 |
| 646/648 | 注释写“membership card 更自然”，但那条英文本来就用 membership card | 注释改成解释差别 |
| 47 | 英文用 number dispenser，注释两次提 ticket machine | 统一成 ticket machine，或改注释 |

近义说法共 33 组，其余如 `tonight`、`usually`、`again`、`all your homework` 这类是刻意加的细微差别，可以保留。

## 题材实用度

- 高：出行交通、饮食、居住、购物消费、健康、服务求助、旅行、城市生活。
- 中：日常起居、人际社交、工作职场（面试/入职部分很实用）。
- 偏低（不是错误，是选题本身）：学习类的四级/六级/考研/准考证，工作类的五险一金/调休/打卡，政务窗口、团餐。这些是中国人生活里真实存在的问题，但在英语环境里复用的机会少。

## 处理结果

上面列出的修改已全部落到 `old-fixes.json`，重新生成题库后：

- 第一轮：改动英文 37 条，新增音频 72 个（36 句 × 男女声）。
- 第二轮逐题核对原意：94 题、115 条说法；之后又把过于接近的说法拆开，并补改 9 条（如「押一付三」三种说法全部重写）。
- 最终 4110 条说法引用的 8220 个音频文件全部存在，HTML 内嵌题库与 `questions.json` 完全一致。
- 全库无重复英文句、无英式拼写；重复运行 `assemble.py` 结果不变；冒烟测试 23/23 通过。

改英文会改变音频 ID，今后再改内容也必须同步跑 `make_audio.py`，否则播放按钮会取不到文件。
