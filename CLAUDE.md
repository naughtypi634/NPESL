@AGENTS.md

# NPESL · Claude 执行层

`AGENTS.md` 是本库唯一项目规范，已由上方 `@AGENTS.md` 导入；构建/部署完整命令在 `README.md`，脚本索引在 `tools/README.md`，内容规范在 `apps/*/source/AUTHORING.md` 与 `docs/STRESS_AUTHORING.md`。本文件只写加载路由、首轮陷阱、日常命令、完成定义与写权限，不复制规范正文。

若 `/context all` 的 Memory files 里看不到 `AGENTS.md`，先 `Read F:\AIProject\NPESL\AGENTS.md`，再按路由读目标文件。

## 加载路由

| 任务 | 先读 |
|---|---|
| 改 app 内容 | 根 AGENTS §二/§三 → `apps/<app>/source/AUTHORING.md` 或 `content/collocation/README.md` |
| 改构建脚本/加 app | 根 AGENTS §三 → `README.md` 构建节 → `tools/README.md` → `tools/build_all.py` 的 `ORDER` → `tools/paths.py` |
| 改 Visual Vocabulary | 根 AGENTS §二/§三 → `content/visual-vocabulary/`（`topics.json` 主题表、`scenes/*.json` 坐标与画风、`sets/*.json` 词卡）→ `tools/vv/README.md`；页面由 `tools/vv/build_pages.py`、`build_topic_pages.py` 生成，不要手改 |
| 改 data-viz | 根 AGENTS §三 → `apps/data-viz/source/AUTHORING.md` → `content/data-viz/atlas/`（datasets / expressions / lessons / contexts）→ `apps/data-viz/web/`（React/TS + ztd-charts）；`node apps/data-viz/web/scripts/build-content.mjs --check`；`build_all.py --only data-viz,site`；主站 `/charts/` 直达，首页不列入 |
| 改小程序 | `tools/miniprogram/build_data.py` 顶部说明（从已构建页面抽取） |
| 部署 | 根 AGENTS §三 → `README.md` 部署节 → `docs/status.md` 的授权行 |

`README.md`、`tools/README.md`、`docs/*`、各 `AUTHORING.md` 按上表显式 `Read`。

## 首轮陷阱

- `build_all.py --only <app>` 不重建 `build/cloudflare-site`；验证/部署写 `--only <app>,site`。
- 主站首页只列七个应用；data-viz 已装配在 `/charts/`，首页不列入入口，只能直接打开 `https://npesl.pages.dev/charts/`。主站部署默认带上 `charts/`；`/data-viz/*` 301 到 `/charts/*`。
- `verify.py` 现在验证四层：全站链接/资源、可见文本（英式英语 + 禁用文案）、内容 validator、无头浏览器全站巡检与点读。`--fast` 跳过浏览器层。
- 英式英语的存量基线在 `tools/verify/british_baseline.json`；新增命中会失败，修掉内容后用 `--update-baseline` 收紧。旧 `check_bre.py` 只扫 Markdown，不再参与交付门禁。
- `tests\verify_runtime.mjs` 没有 `--help`，会直接开无头 Edge 跑全套并放音频；只单跑 `node tests\verify_runtime.mjs --only <case>`。
- `tools\drill\assemble.py` 默认会重写 `content/drill/questions.json`；改前先 `git status`。
- `apps\collocation\source\build.py` 每次全量重建 sprite，不是增量。
- 部署主站是用户已授权的动作（2026-10-31），自检通过后执行；音频站仅在音频变化时；两个 staging 不合并。data-viz 随主站部署到 `/charts/`，首页不加入口。
- 开工先 `git status --porcelain`；本库常有多个会话并行，只动本任务文件，视觉层/构建产物不要替别人提交。

## 日常命令（cwd = `F:\AIProject\NPESL`）

```powershell
.venv\Scripts\python.exe -I tools\build_all.py --only <app>,site
.venv\Scripts\python.exe -I tools\verify.py
.venv\Scripts\python.exe -I tools\verify.py --fast
node tests\verify_runtime.mjs --only <case>
.venv\Scripts\python.exe -I tools\audit_build.py --label before
.venv\Scripts\python.exe -I tools\audit_build.py --diff before now
npx --yes wrangler@latest pages deploy build\cloudflare-site --project-name npesl --branch main
```

data-viz 直达（首页不列入入口）：`https://npesl.pages.dev/charts/`。本地预览用 `npm --prefix apps\data-viz\web run dev`，地址 `http://127.0.0.1:5173/charts/`。

音频站仅在音频变化时：

```powershell
npx --yes wrangler@latest pages deploy build\cloudflare-audio --project-name npesl-audio --branch main
```

完整分步命令见 `README.md` 的「构建」「部署」；本卡是日常子集，改命令行时两处同一次提交。

## 完成定义

唯一清单在 `AGENTS.md` 第四节，不在本文件重复。核心：改源 → `build_all.py --only <app>,site` → `verify.py` 一次 → 人工过手机宽度/深浅主题/点读/返回 → 部署主站（音频有变才加音频站）→ 一次 commit。构建脚本改动先 `audit_build.py --label before`，改完重建再 `--diff before now`，0 差异或逐文件解释。没跑过的检查不得写成通过。

## 写权限与并发

- 同一文件同一时刻只有一个 writer；按 `apps/<app>/` 与 `content/<app>/` 分区。
- `build_all`、`build_cloudflare_site`、`audit_build`、wrangler 只由协调者串行跑；并行构建会争用 staging 与音频 sprite。
- 一次验证只开一个无头 Edge，跑完关闭；残留用 `node tools\edge.mjs` 清。
- 开工先 `git status --porcelain`；计数、TTS 后端、门禁基线、部署授权只写 `docs/status.md`。

## 易变事实与跨库

- 计数、每应用 TTS 后端、门禁基线、WIP、部署授权只写 `docs/status.md`（带 `last_verified`）；本文件与 AGENTS/README 不写会变的数字。
- 共享内容核是 `docs/shared/content-core.md`，只读、不参与构建；与另一库副本逐字节一致。独立性约束构建、检查、测试、部署与会话运行期；维护窗口内允许 owner 复制库外母本的非可执行文本。功能任务中不跨库读写。
- 跨库需求只产出变更规格（输入/输出/验收/owner），由拥有方实施；不在一个任务里同时改两库。
- `.claude/skills/` 是任务级审核工具，不是规则来源。
