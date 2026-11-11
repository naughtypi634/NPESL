# Travel 项目审查与实施规划

> 审查日期：2026-11-04
> 审查对象：`f:\AIProject\NPESL` 当前工作区（`main`，HEAD `c8890187`）
> 审查方式：读源码与内容 JSON、统计实际数据量、跑 `apps/travel/source/validate.py`、查看构建产物与本地截图。
> 本阶段没有修改任何业务代码、内容或构建产物；只新增了本报告。

---

## 0. 一页结论

**现状：** Travel 不是「从零开始的项目」，也不是一个有后端和数据库的 Web 应用。它是一个已经跑通的**静态站点生成器 + 对话优先的旅行英语应用**：23 个场景、85 个 encounter、三层难度的短语与对话、意图听力、2D/3D 平面图、可点读音频，内容与代码都在本库内。它目前被 `TRAVEL_ENABLED = False` 挡在主站之外。

**距离目标最大的三个差距：**

1. **视觉**：现在没有一张位图资产。2D 是建筑平面图，3D 是平面图的等距拉伸，不是 Miniature 3D Diorama。这是最大的、也是唯一无法靠写代码单独解决的差距。
2. **交互模型**：热点 = 柜台/区域，不是物品；没有物品词汇卡，没有可点人物。现有强项是「到某个区域 → 看短语和对话」，而不是「点 suitcase → 学 suitcase，点工作人员 → 进对话」。
3. **内容结构**：机场是一个场景里的 5 个热点；目标是 Check-in Hall / Security / Boarding Gate 三张独立地图。场景、导航、URL 都要加一层「区域（airport）→ 地点（三个场景）」。

**建议路线：** 先定美术生产方式和数据模型，再做 Check-in Hall 一个完整垂直切片；Security 与 Boarding Gate 复用同一引擎；其余 20 个场景暂时留在旧引擎，不一起重构。

**当前阻塞点：** 没有正式视觉资产，且用户明确禁止用临时图/随机图冒充。**在第一张 Check-in Hall 背景和 3 个物品素材通过验收前，不应开始新页面的前端开发。**

---

## 1. 当前项目技术架构

### 1.1 一句话

**Python 构建脚本读取文件型内容源，生成纯静态 HTML；音频由 Azure/Edge TTS 合成后拼成 sprite；主站和音频站分别部署到 Cloudflare Pages。**

没有 `package.json`，没有前端框架，没有后端服务、API、数据库、登录或用户数据。

### 1.2 技术栈实况

| 层 | 实际实现 | 证据 |
|---|---|---|
| 前端 | 手写 HTML + 内联 CSS + 原生 JS（ES5 风格），无框架、无构建器 | `apps/travel/source/template.html`、`index_template.html` |
| 构建 | Python 3.12，统一使用库根 `.venv` | `requirements.txt`、`tools/build_all.py` |
| 内容源 | JSON（旅行、搭配、题库）+ Python 字面量（Conversation） | `content/`、`apps/phonics/source/content/` |
| 后端 | 无 | 无 `package.json`、无 server 目录、无 API 路由 |
| 数据库 | 无 | 内容全部是文件；页面无查询接口 |
| 登录 / 用户 | 无 | 全站只有 `localStorage` 偏好（主题、音色、难度、中文开关） |
| 学习进度 | 无，且项目规则明确不要「已学/完成」标记 | `AGENTS.md`、`content/travel/README.md` |
| 音频 | Azure Speech（默认）或 Edge TTS，24 kHz / 48 kbps MP3 | `apps/travel/source/build.py:213`、`:232` |
| 音频交付 | 逐条母版 → 每场景每层 sprite；部署只带 sprite | `build.py:274`、`tools/build_cloudflare_site.py:245` |
| 部署 | Cloudflare Pages：主站 + 独立音频站 | `README.md`「部署」 |
| 自检 | Python 校验 + `check_assets` + `check_bre` + 无头 Edge 冒烟 | `tools/verify.py`、`tests/smoke.mjs` |

### 1.3 构建链

`tools/build_all.py:27` 的顺序：

```
ipa → phonics → phenomena → collocation → conversation → drill → charts → travel → site
```

Travel 的两步在 `tools/build_all.py:57`：

```powershell
.venv\Scripts\python.exe -I apps\travel\source\validate.py
.venv\Scripts\python.exe -I apps\travel\source\build.py
```

`build.py` 的职责：

1. 读 `content/travel/scenes.json` 与每个场景 JSON；
2. 按 `text|voice|rate` 的 SHA-1 生成内容寻址的音频母版路径（`clip_rel`，`build.py:174`）；
3. 缺失母版时调 Azure/Edge 合成（`ensure_clips`，`build.py:232`）；
4. 每个场景、每个难度拼三条短语 sprite（女/男）+ 一条对话 sprite；听力另拼两条（`build_level_audio:290`、`build_listening_audio:322`）；
5. 把 2D/3D SVG、热点、encounter 面板、sprite 表写进模板（`build_scene:505`）；
6. 生成 23 个场景页 + 索引页（`build_index:564`）。

### 1.4 部署链

`tools/build_cloudflare_site.py:57`：

```python
TRAVEL_ENABLED = False
```

- `False` 时 `/travel/` 整块不进部署包（`:331`），线上直接 404；
- `apps/site/index.html:190` 的入口卡片也被注释掉；
- 这与「正式做完前只在本地和 GitHub 变动」的要求一致，不要提前打开。

### 1.5 当前质量状态

- `apps/travel/source/validate.py`：**FIX 0 / REVIEW 0 / 23 scenes**（本次实际运行）。
- 内容校验覆盖：美式拼写、24 小时制、£、陈词滥调、场景结构、热点数量、三层短语/对话长度、重复句、note 长度、听力意图结构。
- 冒烟测试覆盖：索引页卡片、机场页短语点读、热点切换、难度切换、控制台无错误（`tests/smoke.mjs:1088`、`:1107`）。
- 构建缺任何一条音频会直接失败，不生成半有声页面；这个约束应沿用到视觉资产。

---

## 2. 目录结构与重要文件

```
content/travel/                 旅行英语内容源
  scenes.json                   阶段、场景顺序、地图原型、热点位置
  <scene-id>.json               23 个场景：speakers + encounters + 三层内容 + listening
  README.md                     授权与写作规则
apps/travel/                    生成后的应用
  index.html                    场景索引（生成物）
  01-airport.html … 23-business.html
  audio/f, audio/m              逐条音频母版（入库，约 6,107 条）
  audio/sprites/                拼接产物（gitignore）
  source/
    build.py                    构建器（642 行）
    maps.py                     SVG 平面图 / 等距图生成器（1,165 行）
    validate.py                 内容校验（486 行）
    template.html               场景页模板（754 行，含全部交互 JS）
    index_template.html         索引页模板
tools/
  paths.py                      路径常量唯一来源
  build_all.py                  全站构建顺序
  build_cloudflare_site.py      部署暂存 + 主题/返回链接注入 + TRAVEL_ENABLED
  audio_sprite.py               sprite 拼接与时间轴
  azure_speech.py               Azure TTS 封装
  verify.py / check_assets.py / check_bre.py
tests/smoke.mjs                 无头 Edge 冒烟测试
build/                          本地产物、截图、实验文件（gitignore）
```

关键引用：

| 文件 | 作用 | 行号 |
|---|---|---|
| `content/travel/scenes.json` | 23 场景、8 阶段、map archetype/variant、热点 | — |
| `content/travel/README.md` | 内容结构与写作标准 | — |
| `apps/travel/source/build.py` | 音频、页面、索引生成 | `:195` `:290` `:322` `:431` `:505` |
| `apps/travel/source/maps.py` | 11 种地图原型、2D/3D SVG | `:27` `:1083` `:1107` |
| `apps/travel/source/template.html` | 点读、sprite seek、难度/音色/2D-3D/中文 | `:360` 起 |
| `apps/travel/source/validate.py` | 内容规则 | `:151` `:175` `:234` `:263` |
| `tools/build_cloudflare_site.py` | 上线开关、只部署 sprite | `:57` `:245` `:331` |
| `apps/site/index.html` | 主站入口卡片（当前注释） | `:190` |
| `tests/smoke.mjs` | Travel 冒烟用例 | `:1088` `:1107` |

---

## 3. 现有内容与数据结构

### 3.1 Travel 的数据模型

**`scenes.json`（导航层）**

```json
{
  "version": 1,
  "default_level": "survival",
  "stages": [
    { "id": "departure", "title_en": "Departure & arrival", "title_zh": "出发与抵达",
      "scenes": ["airport", "on-the-plane", "arrival"] }
  ],
  "scenes": [
    {
      "id": "airport",
      "stage": "departure",
      "title_en": "At the airport",
      "title_zh": "机场",
      "map": {
        "archetype": "terminal",
        "variant": "departures",
        "hotspots": [
          { "id": "check-in", "encounter": "check-in", "zone": "checkin",
            "short_en": "Check-in", "short_zh": "值机", "x": 154, "y": 96 }
        ]
      }
    }
  ]
}
```

- 一个场景 = 一张地图；热点 = 场景里的柜台/区域；
- 热点必须引用一个 encounter（`validate.py:245`）；
- 热点坐标是 640×400 设计画布上的绝对坐标，构建时换算成百分比（`maps.py:1130`）。

**`<scene>.json`（内容层）**

```json
{
  "scene": "airport",
  "speakers": [
    { "id": "agent", "en": "Agent", "zh": "值机员", "voice": "f", "role": "staff" },
    { "id": "you", "en": "You", "zh": "你", "voice": "m", "role": "you" }
  ],
  "encounters": [
    {
      "id": "check-in",
      "title_en": "At the check-in counter",
      "title_zh": "在值机柜台",
      "levels": {
        "survival":       { "phrases": [ { "en": "...", "zh": "..." } ],
                            "dialogue": [ { "spk": "agent", "en": "...", "zh": "..." } ] },
        "conversational": { "phrases": [], "dialogue": [] },
        "advanced":       { "phrases": [], "dialogue": [] }
      },
      "listening": [
        { "id": "passport", "intent_zh": "要护照", "keys": ["passport"],
          "asks": [ { "en": "...", "zh": "..." } ],
          "reply": { "en": "...", "zh": "..." },
          "pattern": "...", "note": "..." }
      ]
    }
  ]
}
```

**事实：这套模型里没有词条。** `content/travel/*.json` 的字段只有 `scene / speakers / encounters / levels / phrases / dialogue / listening`（及其子字段），没有 `ipa`、`pos`、`word`、`vocab`、`items`（唯一一处 `"id": "items"` 是 `arrival.json` 里 customs encounter 的一个听力意图 id，不是词汇）。

### 3.2 实际内容量（本次统计）

| 范围 | 数量 |
|---|---|
| 场景 | 23 个，分 8 个阶段 |
| encounter | 85 个 |
| 短语（三层合计） | 1,190 条 |
| 对话句（三层合计） | 2,182 句 |
| 听力意图 | 269 组 |
| 听力问法 | 811 条 |
| 机场场景 | 5 encounter / 70 短语 / 120 对话句 / 20 意图 / 63 问法 |
| 音频母版 | 6,107 条（女 3,203 / 男 2,904） |
| 拼接 sprite | 254 条，约 97 MB |
| 场景页 HTML | 24 个（索引 + 23），机场页 182 KB |

### 3.3 音频结构

- 母版路径：`apps/travel/audio/{f|m}/{sha1前2位}/{sha1}.mp3`；
- 哈希输入：`" ".join(text.split()) + "|" + voice + "|" + rate`（`build.py:174`）；
- 因此**只要英文文本不变，重构页面、改布局、改地图都不会触发重新合成**；
- 每个场景每层：`{level}-p-f`、`{level}-p-m`、`{level}-d`；听力：`listen-f`、`listen-m`；
- 页面只引用 sprite，不引用母版；部署时 `travel_ignore` 排除 `audio/f`、`audio/m`。

### 3.4 其他应用里的英语内容（可作为词汇/短语/句子的来源）

| 内容源 | 规模 | 字段 | 能否直接当词条 |
|---|---|---|---|
| `content/collocation/<theme>.json` | 30 主题 / 1,279 条 | `head`、`base`、`particle`、`kind`、`ipa`、`tier`、`level`、`chip`、`register`、`separable`、`zh`、`senses[{zh,en,example{en,zh}}]`、`l1_note`、`confusables`、`collocations` | **部分可以**：短语动词/习语级，有 IPA、释义、例句；不是旅行名词库 |
| `content/drill/questions.json` | 2,247 题 / 6,741 个英文答案 | `zh`、`scene`、`cat`、`chip`、`answers[{en,zh,note,audio,at}]`、`sp` | **不能直接当词条**：整句、无词性/IPA；但可挑句子做物品例句。机场 chip 有 103 题 |
| `content/conversation/<level>/content.py` | 7 级 × 10 单元 × 5 故事 = 350 篇 | `vocab[]`（英文）、`text[]`、`comp[]`、`conv[]` | **不能直接当词条**：只有英文词表和中文对照，无 IPA/词性/音频 |
| `content/conversation/zh/vocab-*.json` | 每级 500 条，共 3,500 条 | 英文 headword 数组 ↔ 中文数组 | 同上，且是多词短语混合 |
| `content/phonetics/Pronunciation音标表.md` | 40 个音标 / 400 个示例词 | `Sound`、`Word` | **只能做发音参考**：示例词不是旅行词汇 |
| `apps/phonics/source/content/*.json` | 48 课 | 句子、chunk、音标模式 | 不适合做旅行词条 |
| `apps/phenomena/source/content/*.json` | 30 章 | 连读/弱读标注、逐词音素 | 可做发音提示，不是词汇库 |

### 3.5 它们之间有现成关联吗？

**没有。**

- 没有共享 ID、外键、索引或交叉引用；
- 没有统一的词条表；同一个词可能在不同应用里各写一遍；
- 唯一的「隐式关联」是音频内容寻址：同一句英文 + 同一音色会命中同一条母版，但这是构建缓存，不是内容关系；
- 因此**不能假设「现有英语数据库」里有可直接查询的词汇表**。它实际上是 7 套各自为政的文件型内容。

### 3.6 直接回答你提出的问题

| 问题 | 结论 |
|---|---|
| 词汇、短语、句子分别存在哪里？ | 词汇没有统一库；短语/句子分散在 `content/travel/`、`content/collocation/`、`content/drill/`、`content/conversation/`、`apps/phonics/source/content/` |
| 数据库表结构是什么？ | 没有数据库。结构就是上面的 JSON/Python 文件 schema |
| 之间是否有关联？ | 没有显式关联；只有音频哈希缓存 |
| 是否有音标、词性、中文释义、例句？ | 中文释义到处都有；音标只有 collocation（1,279 条）和 IPA 表（400 词）；**词性全库都没有**；例句在 collocation 和 travel 对话里有 |
| 一个场景物品能否关联多个词汇、短语、句子？ | 现在的数据模型不能；需要新增 `items[]`，并用 ID 关联 |
| 是否需要新增数据结构？ | 需要，但只新增一层「共享词条 + 场景物品引用」，不要复制现有短语/对话 |
| 如何避免重复存储？ | 词条按稳定 ID 存一份；场景只存 `lexicon` 引用和场景特有短语；对话/听力继续留在 encounter；能复用文本就复用，复用不了才新写 |

---

## 4. 与 Travel 产品目标的差距

### A. 已经实现，可以直接复用

| 能力 | 现状 | 复用方式 |
|---|---|---|
| 点读音频管线 | 内容寻址母版 + sprite + seek | 原样复用；新增词条只增加母版 |
| 对话播放 | 逐句点读、整段连播、0.8–1.15 倍速 | 原样复用 |
| 三层难度 | Survival / Conversational / Advanced | 保留为对话深度；物品卡不必强行分三层 |
| 女/男声切换 | 全局音色，持久化 | 原样复用 |
| 中文开关 | 隐藏 `.zh` / `.note` | 原样复用 |
| 内容校验 | 美式英语、长度、重复、结构 | 扩展，不重写 |
| 部署隔离 | `TRAVEL_ENABLED=False`、只部署 sprite | 原样保留 |
| 站点主题注入 | 部署时注入 `theme.css` 与主题按钮 | 原样保留 |
| 冒烟测试框架 | 单浏览器、播放探测、控制台错误 | 扩展用例 |
| 23 个场景的对话内容 | 85 encounter、1,190 短语、2,182 句 | 机场部分重组复用，其余保留 |
| 地图布局词汇 | 11 种 archetype、zone/prop 数据 | 作为美术分区与热点的「布局底稿」，不直接当最终画面 |

### B. 已经实现，但需要调整或扩展

| 能力 | 现状 | 需要怎么改 |
|---|---|---|
| 场景展示 | SVG 平面图 + 等距拉伸 | 换成「背景图 + 物品/人物 sprite + 热点覆盖」；旧引擎保留给其他 20 个场景 |
| 场景导航 | 阶段 → 场景两层 | 增加「区域 → 地点」层；机场下挂 3 个地点 |
| 热点 | 热点 = encounter/柜台区域 | 增加 `type: item | character`；物品热点关联词条，人物热点关联对话 |
| 信息面板 | encounter 面板（短语 + 听力 + 对话） | 增加物品词卡面板；对话面板沿用 |
| 人物 | 只在对话里出现名字 | 场景中可点；有位置、sprite、首次点击进入对应 encounter |
| 地图切换 | 2D/3D 两套 SVG | 目标是一套统一视角；建议先只做 Diorama，2D 作为可选降级或直接移除 |
| 内容模型 | scene → encounter | scene → location；location 增加 `items[]`、`characters[]`、`background`、`canvas` |
| 索引页 | 8 阶段 / 23 卡片 | 机场区域卡片 → 3 个地点卡片；其他阶段不变 |
| 页面命名 | `{序号}-{slug}.html` 由数组顺序生成 | 插入新场景会重排 02–23；需要可选 `page` 字段固定旧 URL |
| 校验 | 场景/热点/对话规则 | 增加词条引用、物品坐标、资产存在性、触摸尺寸 |
| 资产检查 | 只查 sprite 是否存在 | 增加背景/物品/人物图片、尺寸、透明通道 |

### C. 尚未实现，需要新增

| 能力 | 说明 |
|---|---|
| 共享词条库 | 至少包含 `id`、`en`、`ipa`、`pos`、`zh`、`level`、`example(s)`；旅行先建所需子集 |
| 物品模型 | 一个物品 ↔ 一个主词条 + 关联词条 + 场景短语 + 例句 + 音频 |
| 人物模型 | 位置、sprite、对应 encounter、可选问候语 |
| 区域/地点模型 | airport → check-in-hall / security / boarding-gate；每个地点自己的地图与内容 |
| 视觉资产 | 背景、物品、人物；目前**一张都没有**（除了 4 个站点图标） |
| 资产清单/校验 | 图片尺寸、命名、透明通道、引用的文件是否存在 |
| 物品词卡 UI | 词、音标、词性、中文、常用短语、例句、点读 |
| 热点发现机制 | 无永久文字标签时的可发现性（脉冲点/首次提示/「显示可点物品」） |
| 任务/路线（可选） | 见第 10 节的政策冲突；不建议在 MVP 做持久化进度 |
| 图片构建步骤 | 复制、哈希命名、部署缓存头；当前没有图片处理步骤 |

### D. 存在技术风险，需要先讨论

| 风险 | 影响 | 说明 |
|---|---|---|
| 美术生产方式未定 | **阻塞开发** | AI 生成很难保证三张场景同一相机/光照/材质；委托插画或 3D 渲染成本更高但可控 |
| 背景与物品 sprite 对齐 | 高 | 若物品是独立 sprite，必须共用同一投影、光源、缩放和锚点；否则像贴纸 |
| 热点与响应式画布 | 中高 | 背景必须固定比例、`object-fit: contain`；用 `cover` 会裁切导致坐标偏移 |
| 旧 URL 兼容 | 中 | 插入机场三个地点会改变 `{序号}`，需固定 `page` 或保留 `01-airport.html` 作为区域页 |
| 页面体积 | 中 | 当前机场页 182 KB；物品卡若全部内联会继续增长，建议只渲染当前地点 |
| 音频仓库体积 | 中 | `.git` 已约 504 MB，Travel 母版 6,107 条；新增词条会继续增长 |
| Azure 配额与音色一致性 | 低中 | 默认 Azure Ava/Andrew，每月 50 万字符；新增词条量很小，但要保持同一音源 |
| 任务/进度与项目规则冲突 | 中 | `AGENTS.md` 明确不要「已学/完成」标记；任务系统若带完成状态会违反 |
| 2D/3D 双视图维护 | 中 | 两套坐标、两套校验；目标只需要一套 Diorama，建议不要继续扩双视图 |

### 4.1 按你点名的八个方向逐项判断

| 方向 | 判断 |
|---|---|
| 场景展示系统 | **B**：有数据驱动的场景页，但视觉是平面图，不是 Diorama |
| 场景地图切换 | **B**：有 2D/3D 切换，没有「区域间导航」；目标需要地点切换 |
| 可点击热点系统 | **B**：热点成熟，但语义是区域，不是物品/人物 |
| 物品信息面板 | **C**：不存在；只有 encounter 面板 |
| 情境对话系统 | **A**：完整可复用（三层、听力、点读、连播） |
| 图片资产管理 | **C**：不存在；无图片、无清单、无校验 |
| 移动端适配 | **B**：有 480px 断点和响应式排版；但热点在窄屏会拥挤，物品热点需要重新设计触摸尺寸 |
| 人物交互 | **C**：人物只在对话文本里，场景中不可点 |

---

## 5. Travel 目标架构建议

### 5.1 原则

1. **继续静态优先**：不自建后端，不引入数据库；内容仍是可 diff 的文件。
2. **复用音频与对话引擎**：现有 `clip_rel` / sprite / 播放器是最大资产，不重写。
3. **只新增一层内容，不复制已有内容**：词条库存「词的事实」，场景存「这个词在这个场景怎么用」，对话继续存 encounter。
4. **旧场景不一起迁移**：机场先用新引擎，其余 20 个场景保持现状；用 `render` 字段分流。
5. **资产缺失即构建失败**：与音频一致，不生成半成品页面。
6. **不引入「进度/已学/计数」**：遵守现有项目规则。

### 5.2 内容分层

```
content/lexicon/entries.json          共享词条（新增；先只放旅行所需）
content/travel/scenes.json            导航：阶段 → 区域 → 地点
content/travel/<location>.json        地点内容：地图、物品、人物、encounter
apps/travel/assets/<region>/<location>/  视觉资产（新增）
apps/travel/source/build.py           旧引擎，继续服务 20 个场景
apps/travel/source/build_locations.py 新引擎：Diorama 地点页（新增）
apps/travel/source/diorama.py         背景 + sprite + 热点渲染（新增）
apps/travel/source/template_location.html  地点页模板（新增）
```

不建议现在就把 `build.py` 拆成多个模块；只在需要共享音频函数时，把 `clip_rel` / `ensure_clips` / `concat_sprite` / `span_attrs` 抽到 `apps/travel/source/audio_common.py`，并用 `audit_build.py --diff` 证明旧页面 0 差异。若 diff 不为 0，回滚，改为新引擎内部复用最小函数。

### 5.3 词条库 schema（建议）

```json
{
  "id": "suitcase",
  "en": "suitcase",
  "ipa": "ˈsuːtkeɪs",
  "pos": "n.",
  "zh": "行李箱",
  "level": "A2",
  "forms": { "plural": "suitcases" },
  "examples": [
    { "en": "I have one suitcase to check.", "zh": "我有一件行李要托运。" }
  ],
  "l1_note": "机场说「行李」常用 luggage / baggage（不可数）；具体箱子是 suitcase。",
  "related": ["carry-on", "baggage-tag"]
}
```

约定：

- `ipa` 沿用 collocation 的写法（不带斜杠，保留重音符号）；
- `pos` 用 `n.` / `v.` / `adj.` / `phrase`；
- 音频不写进词条：构建按 `en` 文本 + 音色生成，天然复用已有母版；
- 一个物品可以有多个词：`items[].lexicon` 存主词，`items[].related` 存关联词。

**不要**把 collocation 的 1,279 条整体导入词条库。它们是短语/习语，不是通用名词库；需要时用 `related_collocation` 指向 `theme/entry-id`，不复制内容。

### 5.4 地点内容 schema（建议，v2）

```json
{
  "scene": "airport-check-in",
  "region": "airport",
  "render": "diorama",
  "canvas": { "w": 1600, "h": 1000 },
  "background": "assets/airport/check-in-hall/bg.webp",
  "speakers": [
    { "id": "agent", "en": "Check-in agent", "zh": "值机员", "voice": "f", "role": "staff" },
    { "id": "you", "en": "You", "zh": "你", "voice": "m", "role": "you" }
  ],
  "items": [
    {
      "id": "check-in-counter",
      "lexicon": "check-in-counter",
      "x": 22.5, "y": 58.0,
      "sprite": "assets/airport/check-in-hall/items/check-in-counter.webp",
      "anchor": [0.5, 1.0],
      "label_en": "Check-in counter",
      "label_zh": "值机柜台",
      "phrases": [
        { "en": "I'm checking in for the 9:40 flight to New York.",
          "zh": "我要办理 9 点 40 飞纽约的航班值机。" }
      ]
    }
  ],
  "characters": [
    { "id": "agent", "x": 25.0, "y": 52.0,
      "sprite": "assets/airport/check-in-hall/characters/agent.webp",
      "anchor": [0.5, 1.0], "encounter": "check-in" }
  ],
  "encounters": [ "…沿用现有 encounters 结构…" ]
}
```

说明：

- `x`/`y` 是设计画布上的百分比（0–100），锚点默认物品底部中心；
- `sprite` 可省略：省略时表示物品已画进背景，只保留透明热点（降级方案，见第 10 节）；
- `encounters` 与现在完全兼容，可直接搬运机场的 check-in / bag-drop / security / gate / info；
- 一个 item 可以有 `phrases` 和（通过词条）`examples`；如果某句已在 encounter 里，优先复用同一文本，音频自动命中。

### 5.5 构建与渲染分层

```
scene JSON ──► build_locations.py
                 ├─ 词条解析 / 校验（lexicon id 必须存在）
                 ├─ 音频：item-f/m、level-p-f/m、level-d、listen-f/m
                 ├─ 资产：检查背景/物品/人物文件
                 ├─ 页面：背景 <img> + sprite 图层 + 透明热点按钮
                 └─ 索引：区域 → 地点
```

渲染顺序：

1. 背景（固定比例容器）；
2. 物品 sprite（按 `y + anchor` 深度排序）；
3. 人物 sprite；
4. 热点按钮（绝对定位，透明，`aria-label` 用 `label_en`）；
5. 页面下方的信息面板（物品卡 / 对话）。

不要用 Canvas 重绘整页；保持 DOM + `<img>`，便于无障碍、焦点和调试。

### 5.6 音频策略

- 物品相关（词、短语、例句）：每个地点拼一条 `items-f` / `items-m`，与现有 sprite 播放器兼容；
- 对话：沿用 `{level}-d`；
- 听力：沿用 `listen-f/m`；
- 新词条的英文文本若已存在（例如 "Here's your boarding pass."），`clip_rel` 直接命中旧母版，不重新合成；
- 新文本按 `en|voice|rate` 增量合成；
- 不要按物品各建一条 sprite：10 个物品会产生 20 个请求，而一条地点级 sprite 通常只有几百 KB。

### 5.7 导航与 URL

- `scenes.json` 增加 `regions`：
  ```json
  { "id": "airport", "title_en": "Airport", "title_zh": "机场",
    "locations": ["airport-check-in", "airport-security", "airport-boarding"] }
  ```
- 索引页：机场显示为一张区域卡，点进去是三个地点；
- 地点页顶部有 `Check-in · Security · Boarding` 切换（真正的链接，不是 JS 状态）；
- 保留 `01-airport.html` 作为机场区域页，避免旧链接 404；
- 新地点页使用固定 `page` 字段，例如 `01a-airport-check-in.html`，不要依赖数组序号；
- 返回链接依次是「机场 / 旅行英语 / NPESL」。

### 5.8 校验与测试

扩展 `apps/travel/source/validate.py`：

- `lexicon` 引用的 ID 必须存在；
- 每个地点 6–12 个物品、1–3 个人物；
- 物品坐标 0–100，锚点在画布内；
- 物品之间、人物之间、物品与人物之间的屏幕距离不低于触摸阈值；
- 每个人物必须引用存在的 encounter；
- 每个 encounter 必须被至少一个热点/人物引用（与现在规则一致）；
- 引用的背景/物品/人物文件必须存在；
- 禁止计数、进度、已学、完成文案（已有 `check_built`，继续沿用）。

扩展 `tests/smoke.mjs`：

- 打开 Check-in Hall → 点 `suitcase` → 面板出现 `suitcase`、IPA、中文、例句；
- 点播放 → 音频真的开始，无 console error；
- 点人物 → 对应 encounter 显示；
- 切地点 → 页面 URL 和地图都变；
- 360px 宽下热点不重叠、可点；
- 深浅主题各看一次。

`tools/verify.py` 仍要求 **FIX = 0**。

---

## 6. 机场 MVP 规划

### 6.1 范围

只做三个地点，先完成 Check-in Hall：

| 地点 | 对应现有 encounter | 新增内容 |
|---|---|---|
| Check-in Hall | `check-in`、`bag-drop`、`info` | 10 个物品、3 个人物、1 张背景 |
| Security Check | `security` | 8–10 个物品、1 个人物、1 张背景 |
| Boarding Gate | `gate` | 8–10 个物品、2 个人物、1 张背景 |

现有机场内容已足够支撑对话层：5 个 encounter、70 条短语、120 句对话、20 组听力意图。**不需要重写对话**，只需要拆到三个地点并补物品层。

### 6.2 Check-in Hall（第一个完整切片）

**空间布局（建议）：**

- 左侧：入口 + 排队区（snake queue）；
- 中左：4 个值机柜台，柜台后有行李传送带；
- 中右：自助值机 kiosk；
- 右侧：行李托运柜台 / 称重台；
- 后墙：航班信息屏；
- 右下：问询台；
- 前景留白，避免热点贴边。

**物品与内容（10 个）：**

| 物品 | 中文 | 对照短语（来源） | 例句（来源） |
|---|---|---|---|
| check-in counter | 值机柜台 | I'm checking in for the 9:40 flight to New York.（现有 conversational 短语） | Where is the check-in counter?（drill 机场题，原文） |
| passport | 护照 | Here's my passport.（新写） | Can I see your passport?（现有 listening 问法） |
| boarding pass | 登机牌 | Here's your boarding pass.（现有对话） | Which gate is my flight at?（drill 机场题，原文） |
| suitcase | 行李箱 | I have one suitcase to check.（新写） | How much does extra baggage cost?（drill 机场题，原文） |
| carry-on | 随身行李 | Can I take this backpack on board?（现有对话中的一句，原文带前缀 One suitcase.） | Does my backpack go through the scanner?（drill 机场题，原文） |
| baggage tag | 行李牌 | Could you put a priority tag on it?（现有 advanced 对话中的一句，原文后接 My medication is in there.） | —（需新写） |
| baggage scale | 行李秤 | Is my bag overweight?（新写） | Is there a place to weigh bags?（drill 机场题，原文） |
| departure board | 航班信息屏 | Is the flight on time?（现有 conversational 短语） | Which gate is my flight at?（drill 机场题，原文） |
| line | 队伍 | Is this the line for check-in?（新写） | —（需新写；美式用 line，不用 queue） |
| information desk | 问询台 | Where can I ask about my connection?（新写） | —（可从 info encounter 改写） |

> 表中「现有」表示该英文文本在 `content/travel/airport.json` 里逐字存在；标注「原文带前缀/后接」的，表示是从完整句中截出，落地时可直接用完整句；「drill 机场题」表示在 `content/drill/questions.json` 的 airport chip 里逐字存在；「新写」表示数据库中没有，必须新写。**所有词条的 IPA、词性、中文释义、例句配对都需要新做并人工校对**，不能假设现有内容里有这些字段。

**人物（3 个）：**

| 人物 | 位置 | 点击后 |
|---|---|---|
| Check-in agent | 柜台后 | `check-in` encounter（三层对话 + 听力） |
| Bag-drop agent | 传送带旁 | `bag-drop` encounter |
| Info desk staff | 问询台 | `info` encounter |
| You（旅行者） | 前景 | 仅视觉，不触发对话；避免「点自己」 |

**对话：** 直接复用现有 `check-in`、`bag-drop`、`info` 的 3 层短语与对话、听力意图。拆到地点后，原 airport 场景的这三个 encounter 不再单独出现。

**任务（可选，待决定）：** 「办值机 → 出示护照 → 托运一个箱子 → 拿到登机牌」的推荐路线。若做，只做**顺序高亮**，不保存完成状态、不出现勾选/徽章/计数。

### 6.3 Security Check

**物品（建议 8–10 个）：** security lane、tray、X-ray scanner、body scanner、laptop、liquids bag、belt、boarding pass、bin、handheld wand。

**人物：** Security officer → `security` encounter。

**可复用：** `security` 的 3 层内容；drill 机场题里的「液体要拿出来吗」「双肩包要过安检吗」「转机要重新安检吗」。

**新增：** tray / liquids bag / body scanner 等词条与例句。

### 6.4 Boarding Gate

**物品（建议 8–10 个）：** gate podium、boarding pass scanner、departure screen、seat row、charging station、jet bridge、carry-on、coffee cup、window。

**人物：** Gate agent → `gate` encounter；可选一位同航班乘客（若没有现成对话，先不做，避免为「人物」编一段低质量对话）。

**可复用：** `gate` 的 3 层内容；drill 机场题里的登机口、延误、登机时间。

### 6.5 内容缺口清单（明确区分）

**已有、可直接复用：**

- 机场 5 个 encounter 的三层短语/对话/听力；
- 大量机场主题的 drill 句子（103 题，需人工挑选，不能自动关联）；
- 美式英语校验规则、音频管线、播放器。

**已有、但需要改写/拆分：**

- airport 场景的 5 个热点要拆到 3 个地点；
- `scenes.json` 的导航与 URL；
- 部分短语需要从「区域对话」改写成「物品用法」的例句。

**完全没有、必须新写：**

- 10 + 8–10 + 8–10 个物品的词条（词、IPA、词性、中文、例句）；
- 3 张背景、约 28 个物品 sprite、4–6 个人物 sprite；
- 物品卡的 UI 与交互；
- 资产清单/校验；
- （若做）任务定义。

---

## 7. 视觉资产规范建议

### 7.1 风格约束（写给美术/AI 的硬规则）

- **统一视角**：固定正交/等距相机，建议 2:1 或 30° 俯视；三张场景同一比例、同一墙高。
- **统一光照**：主光固定从左上方来，阴影落向右下方；不要每张图换光。
- **统一材质**：哑光塑料/木材/金属三种主材质；不要混入写实照片纹理。
- **统一色彩**：先定 10–12 色的场景色板，三个地点共用；强调色只用于可交互物。
- **画面留白**：物品之间留出可点击间距，不堆满；前景不要遮挡热点。
- **禁止烧录**：图片里不能出现英文单词、中文、箭头、按钮、编号、热点圆圈、UI 边框。
- **禁止一次性生成整张含所有物品的图**：背景只画建筑与固定设施；可学习物品和人物单独出图。

### 7.2 画布、尺寸、格式

| 资产 | 设计尺寸 | 显示尺寸 | 格式 | 目标体积 |
|---|---|---|---|---|
| 背景 | 1600 × 1000（16:10） | 最大 760 px 宽 | WebP q80，sRGB | ≤ 350 KB |
| 物品 sprite | 512 × 512（透明） | 64–140 px | WebP / PNG 带 alpha | ≤ 80 KB |
| 人物 sprite | 512 × 1024（透明） | 120–220 px 高 | WebP / PNG 带 alpha | ≤ 120 KB |
| 布局底稿 | 640 × 400 SVG | 内部使用 | SVG | 不入部署包 |

1600×1000 对 760 px 容器约为 2.1×，足够 retina；再大只会增加流量。

### 7.3 分层

```
background      建筑、地面、墙、窗、固定柜台/传送带（不含可学习物品/人物/文字）
items           可点击物品，透明背景，底部中心锚点
characters      人物，透明背景，底部中心锚点
ui              全部由 HTML/CSS 渲染：热点、标签、面板、按钮、播放状态
```

如果某个物品必须和背景严丝合缝（例如嵌入式柜台），可以画进背景，但仍要有独立热点；这时 `sprite` 省略，走降级方案。**不要**为了省事把文字/按钮画进背景。

### 7.4 命名与目录

```
apps/travel/assets/
  airport/
    check-in-hall/
      bg.webp
      items/
        check-in-counter.webp
        passport.webp
        suitcase.webp
        ...
      characters/
        agent.webp
        bag-drop-agent.webp
    security/
      bg.webp
      items/
      characters/
    boarding-gate/
      bg.webp
      items/
      characters/
```

规则：

- 全部小写 kebab-case；
- 物品文件名 = `items[].id`；人物文件名 = `characters[].id`；
- 源文件保留人类可读名；构建时可选输出内容哈希名（`bg.<sha1>.webp`）用于长缓存；
- 不要用 `final2`、`new`、`v3` 这类版本后缀；版本靠 Git。

### 7.5 热点坐标规范

- 坐标系：设计画布 1600×1000 的百分比，保留 2 位小数；
- 锚点：物品/人物的**底部中心**（`anchor: [0.5, 1.0]`），与 sprite 的落地位置一致；
- 热点区域：默认取 sprite 包围盒，可单独给 `hit`（宽高百分比）微调；
- 移动端：热点最小 44×44 CSS px；构建时按画布比例校验；
- 相机变化（若未来支持平移/缩放）只改容器变换，不改坐标；
- 不要用 `cover` 裁切背景；用固定 `aspect-ratio: 16/10` + `object-fit: contain`。

### 7.6 资产与场景数据的关联方式

- **唯一事实来源是场景 JSON**：`background`、`items[].sprite`、`characters[].sprite` 都在 JSON 里；
- 构建时生成 `assets-manifest.json`（或直接内联到页面），不要手工维护第二份坐标表；
- 构建检查：文件存在、尺寸符合规范、透明通道存在、引用无孤儿；
- 缺失任何资产 → 构建失败（与音频一致），不生成占位图。

### 7.7 视觉验收清单

- [ ] 三张场景能看出是同一个「模型世界」：同一相机、同一光照、同一材质、同一色板；
- [ ] 背景里没有任何文字、标签、按钮、热点；
- [ ] 每个可点物品在 100% 和手机宽度下都清晰可辨；
- [ ] 物品 sprite 的落地阴影方向与背景一致；
- [ ] 热点不遮挡物品主体，且不互相重叠；
- [ ] 深色/浅色主题下，热点焦点环和面板都可见；
- [ ] 背景 + 首屏 sprite 总体积不超过 600 KB。

---

## 8. 分阶段实施计划

### Phase 0 · 审查与决策（本次）

- **目标**：确认现状、差距、架构、MVP 范围。
- **产出**：本报告；第 10 节问题的答复。
- **验收**：用户确认美术方式、背景分层方式、任务系统取舍、旧场景是否迁移。
- **测试**：无代码改动。
- **风险**：美术方式未定则无法进入 Phase 2。

### Phase 1 · 数据与构建地基（不改现有页面）

- **目标**：让新模型可以落地，同时保证旧页面 0 变化。
- **模块/文件**：
  - `content/lexicon/entries.json`（先建机场词条）；
  - `apps/travel/source/build_locations.py`、`diorama.py`、`template_location.html`；
  - `scenes.json` 增加 `regions` / `page` / `render` 可选字段；
  - `validate.py` 增加 v2 校验；
  - `tools/check_assets.py` 增加图片检查。
- **验收**：
  - 旧 23 页重建后与基线 0 差异；
  - 新 schema 能通过校验（即使还没有页面）；
  - `TRAVEL_ENABLED` 仍为 False。
- **测试**：
  - `audit_build.py --label before` → 改动 → 重建 → `--diff before now` = 0；
  - `validate.py` FIX 0；
  - 不启动浏览器。
- **风险**：抽取音频函数导致旧页面差异；出现差异立即回滚，改为新引擎内部复用。

### Phase 2 · Check-in Hall 视觉资产（阻塞点）

- **目标**：产出并验收 1 张背景 + 3 个代表物品 + 1 个人物，验证美术管线。
- **模块/文件**：
  - `apps/travel/assets/airport/check-in-hall/`；
  - 布局底稿（由 `maps.py` 生成，仅内部用）；
  - 资产规范文档。
- **验收**：
  - 背景无文字/UI；
  - 3 个物品与背景同视角、同光照；
  - 手机宽度下可辨认；
  - 用户确认风格。
- **测试**：人工视觉评审 + 资产尺寸/透明通道校验。
- **风险**：AI 风格不一致、物品透视错误；不通过就换生产方式，不进入 Phase 3。

### Phase 3 · Check-in Hall 垂直切片

- **目标**：完成一个可以真实使用的完整地点。
- **模块/文件**：
  - `content/travel/airport-check-in.json`（items / characters / encounters）；
  - `content/lexicon/entries.json`（10 个词条）；
  - `build_locations.py` 生成页面与音频 sprite；
  - `template_location.html`（物品卡、对话、地点切换）；
  - `scenes.json` 的 airport region；
  - 冒烟用例。
- **验收**：
  - 点 10 个物品都能出词卡并出声；
  - 点 3 个人物都能进入对应三层对话；
  - 地点切换、返回链接、中文开关、音色、速度正常；
  - 360px / 768px / 1280px 可用；
  - 无计数、进度、已学文案；
  - 无 console error。
- **测试**：
  - `validate.py` FIX 0；
  - `verify.py` FIX 0；
  - `tests/smoke.mjs` 新增 travel-check-in 用例；
  - 一个无头 Edge 跑完关闭；
  - 人工浏览器检查深浅主题。
- **风险**：热点密度、物品 sprite 遮挡、音频 sprite 体积、页面首屏加载。

### Phase 4 · Security Check + Boarding Gate

- **目标**：机场三地点完整。
- **模块/文件**：两个地点 JSON、词条、资产、`scenes.json`、索引页、冒烟用例。
- **验收**：
  - 三地点可互相切换；
  - 机场索引页清楚；
  - 三个地点的相机/光照/色板一致；
  - 旧 `01-airport.html` 仍可用（区域页或重定向）。
- **测试**：同 Phase 3，加三地点连续切换。
- **风险**：内容重复、资产风格漂移、导航层级变深。

### Phase 5 · 性能、无障碍、上线评估

- **目标**：达到可上线质量，但仍不自动上线。
- **模块/文件**：懒加载、图片缓存头、焦点顺序、`aria-label`、减少动画。
- **验收**：
  - 首屏 ≤ 600 KB（背景 + 首屏 sprite）；
  - 键盘可遍历所有热点；
  - `prefers-reduced-motion` 生效；
  - `verify.py`、冒烟全绿；
  - 用户明确同意后才把 `TRAVEL_ENABLED` 改回 True。
- **测试**：Lighthouse 手动检查 + 无头 Edge 冒烟 + 手机实机。
- **风险**：上线开关误开；部署前再次确认。

---

## 9. 当前最需要解决的技术问题（按优先级）

1. **美术生产方式与一致性（阻塞）**
   不是代码问题。必须先确定：AI 生成 + 人工修、委托插画、还是 3D 渲染。三张场景必须共用一套相机/光照/材质/色板，否则产品方向不成立。

2. **物品级内容模型**
   现有模型只有 encounter。需要新增 `items[]` + `characters[]` + `lexicon` 引用，同时保持旧 20 个场景不变。关键是「不复制」：词条只存词的事实，场景只存场景特有的用法。

3. **背景分层与 sprite 对齐**
   背景只画建筑/固定设施，物品和人物独立 sprite。需要锚点、深度排序、统一投影；否则会像贴纸。若成本过高，需要用户决定是否接受「物品画进背景 + 透明热点」的降级方案。

4. **场景/导航/URL 迁移**
   机场要从 1 个场景拆成 3 个地点，但现有页面文件名按数组序号生成。必须加 `page` 字段或保留 `01-airport.html`，否则 02–23 的链接和冒烟测试都会被重排。

5. **音频 sprite 粒度与仓库体积**
   物品词、短语、例句用地点级 sprite；不要每个物品一条。新词条优先复用已有文本的母版。`.git` 已约 504 MB，新增音频要控制。

6. **任务/进度与现有规则冲突**
   `AGENTS.md` 明确不要「已学/完成」标记和计数。若做任务系统，只能做「推荐路线/顺序高亮」，不能持久化完成状态。需要用户明确取舍。

7. **移动端热点可发现性**
   去掉永久文字标签后，用户怎么知道哪里能点？需要定：首次脉冲提示、悬停/聚焦标签、还是「显示可点物品」开关。不要靠一大段说明文字解决。

8. **双视图维护**
   现在的 2D/3D 是两套坐标。目标只需要一套 Diorama；建议新地点不再提供 2D/3D 切换，旧场景保持原样。

---

## 10. 需要你决定的关键问题

| # | 问题 | 选项 | 建议 |
|---|---|---|---|
| 1 | 视觉资产由谁生产？ | A. AI 生成 + 人工修；B. 委托插画；C. 3D 渲染 | 先用 1 张背景 + 3 个物品做风格试验，再定；不要在未验证前批量生成 |
| 2 | 背景是否包含可学习物品？ | A. 背景只画建筑，物品独立 sprite；B. 物品画进背景，只做透明热点 | 目标是 A；若 A 的对齐成本过高，B 是可接受的降级，但仍不能把文字/UI 画进图 |
| 3 | 任务系统做不做？ | A. 不做，MVP 只做物品 + 人物；B. 做「推荐路线」但不保存完成；C. 做完整任务/进度 | 建议 B 或 A；C 与现有「不要已学/完成标记」规则冲突，且需要后端/存储决策 |
| 4 | 其余 20 个场景怎么办？ | A. 保持旧引擎，只重做机场；B. 全部迁移到 Diorama | 建议 A；先证明机场切片，再决定是否推广 |
| 5 | 2D/3D 切换保留吗？ | A. 新地点只做 Diorama；B. 保留双视图 | 建议 A；双视图会让坐标、校验、美术成本翻倍 |
| 6 | 旧 URL 怎么处理？ | A. `01-airport.html` 作为机场区域页；B. 重定向到 check-in；C. 允许重排 | 建议 A；保留旧链接，新增地点用固定 `page` |
| 7 | 词条库范围？ | A. 只建机场所需；B. 一次建全站通用词库 | 建议 A；schema 留扩展位，但不要提前导入 collocation/conversation 的内容 |
| 8 | 是否保留三层难度？ | A. 对话保留三层，物品卡不分层；B. 全部保留；C. 去掉 | 建议 A；物品卡用「常用说法」即可，不必强行三层 |
| 9 | 音频是否继续入库？ | A. 继续（与现在一致）；B. 只入库 sprite，母版本地缓存 | 建议 A，保持可复现；但要接受仓库增长，新增前先估算 |
| 10 | 热点可发现性怎么做？ | A. 首次脉冲 + 悬停标签；B. 永久小标签；C. 「显示可点物品」开关 | 建议 A；B 会破坏 Diorama 画面，C 多一步操作 |

---

## 附录 A · 本次审查实际执行过的命令/检查

- `apps/travel/source/validate.py` → `FIX 0 REVIEW 0 scenes 23`
- 统计 `content/travel/*.json`：23 场景 / 85 encounter / 1,190 短语 / 2,182 对话 / 269 意图 / 811 问法
- 统计 `apps/travel/audio`：6,107 条母版；`sprites/` 254 条、约 97 MB
- 统计其他内容源：collocation 1,279 条 / 30 主题；drill 2,247 题 / 6,741 答案；conversation 350 篇 / 3,500 vocab 条目；IPA 400 词 / 40 音标
- 检查图片资产：`apps/` 与 `content/` 下只有 4 个站点图标，Travel 无位图
- 检查主题/部署：`TRAVEL_ENABLED = False`、入口卡片注释、部署时注入主题
- 查看本地截图：`build/travel-desktop-2d.png`、`build/travel-desktop-3d.png`，确认为平面图/等距拉伸

## 附录 B · 明确不做的事（本阶段）

- 不修改 `apps/travel/source/*.py`、`template.html`、`scenes.json`、任何场景 JSON；
- 不删除、不迁移、不覆盖现有音频母版；
- 不创建重复的词库或题库；
- 不引入前端框架、后端、数据库；
- 不打开 `TRAVEL_ENABLED`，不部署；
- 不用临时图/随机图做页面原型。
