# NaughtyPiESL · 微信小程序

两个入口：

- **自然拼读阅读训练**：48 课，成人 A1，女声/男声两套音频全部打进代码分包，离线可听。
- **Question Drill**：中译英随机练习，1,178 题 / 2,936 句，按 15 类抽题；英文答案带用法说明和女/男发音。

## 打开

1. 安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. 「导入项目」→ 目录选本文件夹 `miniprogram/` → AppID 已写在 `project.config.json`（`wxfb269884c0f1df20`）。
3. 没有 AppID 也能用「测试号」在模拟器里跑。

## 结构

```
app.json              入口页、Question Drill 页、11 个分包
config.js             云开发环境与音频文件 ID 前缀（见下）
data/lessons.js       48 课的文本、中文、男女声分块时间轴（211 KB，自动生成）
data/bank.js          Question Drill 题库（428 KB，自动生成）
pages/index/          入口选择页
pages/phonics/        48 课目录
pages/drill/          Question Drill
components/player/    自然拼读播放器（男女声切换 / 全文连读 / 整句 / 分块）
pkg1 … pkg11/         每包 3–5 课，各带本课的两套 audio/*.mp3，约 1.7 MB
```

自然拼读的音频必须分包：单个包上限 2 MB，男女两套音频总共约 18 MB。

## 改内容后重新生成

自然拼读内容源在上一层：

```
06-发音/自然拼读阅读训练-成人A1/
├── source/content/*.json          ← 改动这里
├── source/audio/*/story-f|m.mp3   ← 和这里
├── lessons/*.html                 ← build.py 产出
└── miniprogram/                   ← 本文件夹
```

```
.venv\Scripts\python.exe -I source/build.py              # 重新合成音频 + 生成 lessons/*.html
.venv\Scripts\python.exe -I source/build_miniprogram.py  # 同步到小程序
```

`build_miniprogram.py` 会从 `lessons/*.html` 里读已经算好的男女声分块时间轴，复制对应的 `story-f.mp3`、`story-m.mp3`，并重写 `app.json`、`app.js`、入口页和 48 课目录页。它**不会动** `pages/drill/`、`config.js`。构建前会清掉旧的 `pkg*`，避免旧音频残留把总包撑过 20 MB。

Question Drill 的题库源在库根：

```
build/zh-en-bank/questions.json          ← 单文件网页版和小程序共用
```

```
.venv\Scripts\python.exe -I build\zh-en-bank\assemble.py --from-json       # 重建网页版
.venv\Scripts\python.exe -I build\zh-en-bank\build_miniprogram_bank.py     # 同步到 data/bank.js
```

改完题量后，记得把入口页 `pages/index/index.wxml` 里的「1,178 题」一起改（两个数字都在 `build_miniprogram.py` 的 `INDEX_WXML` 常量里）。

## Question Drill 发音

5,872 个音频（女声、男声各 2,936 个）共 73 MB，超过小程序 20 MB 总包上限，放在云开发存储里按需下载，首次播放后缓存在手机本地。

1. 开发者工具 →「云开发」→ 开通并创建环境 → 复制**环境 ID**。
2. 在微信公众平台「开发管理 → 开发设置」下载**小程序代码上传密钥**。
3. 上传音频并写入配置：

   ```
   cd build\zh-en-bank
   npm install
   node upload_audio_cloud.cjs --env <环境 ID> --key <密钥路径>
   ```

   脚本把 `06-发音/Question Drill/audio/f` 传到 `audio/f`、`06-发音/Question Drill/audio/m` 传到 `audio/m`，然后把环境 ID 和文件 ID 前缀写进 `config.js`。

4. 如果脚本没拿到存储桶名，在云开发控制台点任意一个音频文件，复制「文件 ID」，再跑：

   ```
   node upload_audio_cloud.cjs --env <环境 ID> --config "cloud://xxx.yyy/audio/f/xxxx.mp3"
   ```

`config.js` 两项留空时 Question Drill 照常可用，只是不显示女/男发音按钮。

## 上传前

- **类目**：选「教育 > 教育信息服务」。不要选「在线教育 / 教育培训」，那两个要办学许可证。
- **备案**：2023 年起小程序必须完成 ICP 备案，在公众平台「设置 → 基本设置 → 小程序备案」里提交，免费，通常 1–2 周。
- **发版**：工具右上角「上传」→ 公众平台「版本管理」提交审核 → 通过后发布。

内容写在代码包里，所以每次改课或改题库都要重新发版审核（通常 1–7 天）。

上传命令：

```
cli.bat upload --project <本文件夹> -v 1.1.0 -d "说明"
```

## 版本记录

| 版本 | 上传日期 | 内容 |
|---|---|---|
| 1.0.0 | 2026-10-23 | 首次上传：自然拼读 48 课全免费，9.1 MB，主包 147.5 KB + 8 个分包 |
| 1.1.0 | 2026-10-24 | 首页改为两个入口；新增 Question Drill（1,178 题）。男女发音待云开发配置后补传 |
