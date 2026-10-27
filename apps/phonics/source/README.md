# 自然拼读阅读训练 · 成人 A1

48 课，一课一个音标，一篇成人场景短文，中英按意群逐块对应，点意群听该意群的发音。每课有女声、男声两套录音，页面顶部可切换。

## 结构

```
lessons/            成品页面，每课一个自包含 HTML（音频内嵌）
index.html          目录页
source/
  content/*.json    课程内容（唯一源）
  template.html     版式与交互模板
  build.py          生成音频切片 + 页面 + 目录
  validate.py       只查内容结构，不生成音频
  AUTHORING.md      内容规范
  audio/            语音缓存（已 gitignore，可重新生成）
```

## 重建

```powershell
cd apps\phonics\source
..\..\..\.venv\Scripts\python.exe -I -X utf8 build.py
```

只重建某一课：

```powershell
..\..\..\.venv\Scripts\python.exe -I -X utf8 build.py --only 13
```

只查内容、不合成音频：

```powershell
..\..\..\.venv\Scripts\python.exe -I -X utf8 build.py --skip-audio --only 13
```

只补某一套音色（页面始终内嵌男女两套，缺一套会跳过该课）：

```powershell
..\..\..\.venv\Scripts\python.exe -I -X utf8 build.py --voices m
```

## 约定

- **源只有 `content/*.json`**；`lessons/` 和 `index.html` 都是生成物。
- 音频女声为 `en-US-AvaMultilingualNeural`，男声为 `en-US-AndrewMultilingualNeural`，都是 `-5%` 语速；**每课每个音色整篇只合成一次**，句子和意群播放都是这篇录音的时间片，不是单独合成，避免句末和意群末尾的降调。
- 音标用美式标注：`/i/ /ɪ /e/ /æ/ /ɝ/ /ə/ /ʌ/ /ɑ/ /ɔ/ /ɑr/ /u/ /ʊ/ /eɪ/ /aɪ/ /ɔɪ/ /oʊ/ /aʊ/ /ɪr/ /er/ /ɔr/`，辅音沿用 48 音体系的 28 个。
- 与底本 48 音的对应：`/iː/→/i/`、`/ɜː/→/ɝ/`、`/ɑː/→/ɑ/`、`/ɔː/→/ɔ/`、`/uː/→/u/`、`/əʊ/→/oʊ/`、`/ɪə/→/ɪr/`、`/eə/→/er/`；底本第 10 课 `/ɒ/` 改成美音的 `/ɑr/`，第 20 课 `/ʊə/` 改成更常用的 `/ɔr/`。
- 每课一个音标，`patterns` 列本课拼写组合；正文用 `[ ]` 圈出目标字母，构建时变成蓝色标记。
