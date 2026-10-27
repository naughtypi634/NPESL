#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the Conversation Starters web app.

Source:  05-ConversationStarters/MD/<LEVEL>/content.py（10 units × 5 stories）
         05-ConversationStarters/MD/zh/<level>.json（逐段中文翻译）
         05-ConversationStarters/MD/zh/vocab-<level>.json（逐条词汇中文释义）
Output:  build/conversation-site/  —— 直接作为站点根下的 conversation/ 使用

    conversation/
        index.html                 级别菜单
        a1/index.html              50 篇故事
        a1/01-01-family.html       故事页（标题、词汇、句子可点读，可朗读全文）
        audio/ava/<xx>/<hash>.mp3  女声 Edge 语音
        audio/andrew/<xx>/<hash>.mp3  男声 Edge 语音

页面里的音频地址指向 Cloudflare Pages 的独立音频项目
（https://npesl-audio.pages.dev/audio/），因为主站加上两套语音会超过
Cloudflare Pages 单次部署 20,000 个文件的上限。页面本身仍是相对链接，
离线包会把音频地址改回相对路径。

故事正文按整句点读，句内不再插意群隔断；连读（含 j/w 滑音）、省略、变音
标记由 pron.py 生成。中文翻译逐句排在英文下面，不生成语音。

用法：
    python -I build/conversation_starters/build_site.py                 # 全部页面 + 男女两套语音
    python -I build/conversation_starters/build_site.py --levels A1
    python -I build/conversation_starters/build_site.py --audio-levels A1,A2
    python -I build/conversation_starters/build_site.py --voices female
    python -I build/conversation_starters/build_site.py --no-audio      # 只建页面
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import html
import importlib.util
import json
import re
import shutil
import sys
import time
from pathlib import Path

import edge_tts

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pron  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "05-ConversationStarters" / "MD"
ZH_SRC = SRC / "zh"
OUT = ROOT / "build" / "conversation-site"
CACHE = ROOT / "build" / "tts" / "cs"
PROGRESS = CACHE / "progress.txt"
FAILED = CACHE / "failed.json"

AUDIO_BASE = "https://npesl-audio.pages.dev/audio/"
# ESLSE 的语音和页面放在主站（/conversation/eslse/audio/），否则音频站
# 加上第七级会超过 Cloudflare Pages 单次部署 20,000 个文件的上限。
AUDIO_BASE_BY_LEVEL = {"ESLSE": "audio/"}

LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2", "ESLSE")
LEVEL_LABEL = {
    "A1": ("Beginner", "入门"),
    "A2": ("Elementary", "初级"),
    "B1": ("Intermediate", "中级"),
    "B2": ("Upper Intermediate", "中高级"),
    "C1": ("Advanced", "高级"),
    "C2": ("Proficiency", "精通"),
    "ESLSE": ("ESLSE", ""),
}
VOICES = [
    {"key": "female", "short": "f", "dir": "ava", "tts": "en-US-AvaNeural", "label": "女声"},
    {"key": "male", "short": "m", "dir": "andrew", "tts": "en-US-AndrewNeural", "label": "男声"},
]
VOICE_BY_KEY = {v["key"]: v for v in VOICES}

# --------------------------------------------------------------------------
# content
# --------------------------------------------------------------------------
def split_sentences(text: str) -> list:
    """Split a paragraph into sentences, keeping closing quotes and end marks."""
    parts = re.split(r'([.!?]+["\'”’)\]]*)\s+', text.strip())
    sentences = []
    for i in range(0, len(parts) - 1, 2):
        s = (parts[i] + parts[i + 1]).strip()
        if s:
            sentences.append(s)
    if len(parts) % 2 == 1 and parts[-1].strip():
        sentences.append(parts[-1].strip())
    return sentences


ZH_SENT_RE = re.compile(
    r'[^。！？!?…]*(?:[。！？!?]+|…+)[”’」』）\]]*'
    r'|[^。！？!?…]+[”’」』）\]]*$'
)


def split_zh(text: str) -> list:
    """Split a Chinese paragraph, keeping closing quotes with the sentence."""
    return [s.strip() for s in ZH_SENT_RE.findall(text) if s.strip()]


def load_level(level: str) -> list:
    path = SRC / level / "content.py"
    spec = importlib.util.spec_from_file_location(f"cs_{level}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.UNITS


def load_zh(level: str) -> dict:
    path = ZH_SRC / f"{level.lower()}.json"
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def load_vocab_zh(level: str) -> dict:
    path = ZH_SRC / f"vocab-{level.lower()}.json"
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def slugify(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-").lower()


def clip_hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


def story_texts(story: dict) -> list:
    """Every piece of text on a story page that can be played."""
    texts = [story["title"]]
    texts.extend(story["vocab"])
    texts.extend(s for p in story["text"] for s in split_sentences(p))
    texts.extend(story["comp"])
    texts.extend(story["conv"])
    return texts


def unique_texts(data: dict, levels) -> list:
    seen = set()
    out = []
    for lv in sorted(levels):
        for unit in data.get(lv, []):
            for story in unit["stories"]:
                for text in story_texts(story):
                    h = clip_hash(text)
                    if h not in seen:
                        seen.add(h)
                        out.append(text)
    return out


# --------------------------------------------------------------------------
# audio
# --------------------------------------------------------------------------
def write_progress(**fields) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    fields.setdefault("updated", time.strftime("%Y-%m-%dT%H:%M:%S"))
    line = " ".join(f"{k}={v}" for k, v in fields.items()) + "\n"
    tmp = PROGRESS.with_suffix(".tmp")
    tmp.write_text(line, encoding="utf-8")
    tmp.replace(PROGRESS)


async def synth_one(text: str, voice: str, target: Path) -> dict:
    error = ""
    for attempt in range(1, 4):
        try:
            communicate = edge_tts.Communicate(text, voice, rate="+0%")

            async def stream() -> bytes:
                return b"".join([
                    chunk["data"] async for chunk in communicate.stream()
                    if chunk["type"] == "audio"
                ])

            audio = await asyncio.wait_for(stream(), timeout=45)
            if not audio:
                raise RuntimeError("empty audio")
            tmp = target.with_suffix(".part")
            tmp.write_bytes(audio)
            tmp.replace(target)
            return {"text": text, "target": target, "ok": True, "error": ""}
        except Exception as exc:                     # 网络抖动、限流、超时
            error = str(exc)
            if attempt < 3:
                await asyncio.sleep(2 * attempt)
    return {"text": text, "target": target, "ok": False, "error": error}


async def synth_all(items: list, voice: str, jobs: int, on_batch) -> tuple:
    """items: [text] —— 按批并发；on_batch(done, failed, started) 更新进度。"""
    started = time.time()
    done = 0
    failures = []
    for start in range(0, len(items), jobs):
        batch = items[start:start + jobs]
        results = await asyncio.gather(
            *(synth_one(text, voice, target) for text, target in batch)
        )
        for result in results:
            if result["ok"]:
                done += 1
            else:
                failures.append(result)
        on_batch(done, failures, started)
    return done, failures


def generate(voices: list, texts: list, jobs: int) -> dict:
    """Synthesize missing clips for every requested voice."""
    CACHE.mkdir(parents=True, exist_ok=True)
    plans = []
    for voice in voices:
        cache_dir = CACHE / voice["dir"]
        cache_dir.mkdir(parents=True, exist_ok=True)
        missing = []
        for text in texts:
            h = clip_hash(text)
            target = cache_dir / h[:2] / f"{h}.mp3"
            if not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                missing.append((text, target))
        plans.append((voice, cache_dir, missing))

    overall_total = sum(len(missing) for _, _, missing in plans)
    overall_done = 0
    started_all = time.time()
    all_failures = []

    if overall_total == 0:
        write_progress(state="done", voice="-", done=0, total=0, failed=0,
                       elapsed=0, message="cache-complete")
        print("语音缓存已完整，无需合成")
        return {}

    print(f"Edge TTS：{overall_total} 句待合成（并发 {jobs}）")
    write_progress(state="running", voice="-", done=0, total=overall_total,
                   failed=0, elapsed=0)

    for voice, cache_dir, missing in plans:
        if not missing:
            print(f"  {voice['label']}：0 句待合成")
            continue
        print(f"  {voice['label']}（{voice['tts']}）：{len(missing)} 句")
        base = overall_done
        voice_started = time.time()

        def on_batch(done, failures, started, _voice=voice,
                     _total=len(missing), _base=base,
                     _voice_started=voice_started):
            nonlocal overall_done
            overall_done = _base + done
            write_progress(
                state="running",
                voice=_voice["dir"],
                done=overall_done,
                total=overall_total,
                voice_done=done,
                voice_total=_total,
                failed=len(all_failures) + len(failures),
                elapsed=int(time.time() - _voice_started),
            )

        done, failures = asyncio.run(
            synth_all(missing, voice["tts"], jobs, on_batch)
        )

        # 一次补跑：网络抖动/限流通常会自己恢复
        if failures:
            print(f"  {voice['label']}：{len(failures)} 句失败，补跑一次")
            time.sleep(4)
            retry_items = [(f["text"], f["target"]) for f in failures]
            retry_base = base + done

            def on_retry(done2, failures2, started, _voice=voice,
                         _total=len(missing), _base=retry_base,
                         _voice_started=voice_started):
                nonlocal overall_done
                overall_done = _base + done2
                write_progress(
                    state="running",
                    voice=_voice["dir"],
                    done=overall_done,
                    total=overall_total,
                    voice_done=done + done2,
                    voice_total=_total,
                    failed=len(all_failures) + len(failures2),
                    elapsed=int(time.time() - _voice_started),
                    retry=1,
                )

            done2, failures = asyncio.run(
                synth_all(retry_items, voice["tts"], 2, on_retry)
            )
            done += done2
        overall_done = base + done
        all_failures.extend(failures)

    payload = [
        {"voice": f["target"].relative_to(CACHE).parts[0], "text": f["text"],
         "error": f["error"], "path": str(f["target"].relative_to(CACHE))}
        for f in all_failures
    ]
    FAILED.write_text(json.dumps(payload, ensure_ascii=False, indent=2),
                      encoding="utf-8")
    write_progress(state="done", voice="-", done=overall_done,
                   total=overall_total, failed=len(all_failures),
                   elapsed=int(time.time() - started_all))
    print(f"新合成 {overall_done} 句，失败 {len(all_failures)} 句"
          + (f"（见 {FAILED.relative_to(ROOT)}）" if all_failures else ""))
    return {"done": overall_done, "failed": len(all_failures)}


# --------------------------------------------------------------------------
# html
# --------------------------------------------------------------------------
BASE_CSS = """
:root {
  --bg:#fff; --fg:#1d1d1f; --muted:#6e6e73; --rule:#e5e5ea;
  --surface:#f5f5f7; --surface-strong:#e8e8ed;
  --blue:#0071e3; --blue-hover:#0077ed; --blue-tint:#e8f2ff; --on-blue:#fff;
  --radius:24px;
  --font:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display",
    "Segoe UI Variable","Segoe UI","PingFang SC","Hiragino Sans GB",
    "Microsoft YaHei",sans-serif;
  color-scheme:light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg:#000; --fg:#f5f5f7; --muted:#98989d; --rule:#38383a;
    --surface:#1c1c1e; --surface-strong:#2c2c2e;
    --blue:#2997ff; --blue-hover:#40a9ff; --blue-tint:#102a43; --on-blue:#fff;
  }
}
* { box-sizing:border-box; }
html,body { margin:0; }
body {
  background:var(--bg); color:var(--fg); font-family:var(--font);
  -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
}
.page {
  max-width:780px; margin:0 auto;
  padding-top:clamp(40px,7vw,72px); padding-bottom:96px;
  padding-left:max(20px,env(safe-area-inset-left,0px));
  padding-right:max(20px,env(safe-area-inset-right,0px));
}
h1 {
  margin:0; font-size:clamp(30px,5vw,44px); font-weight:700;
  letter-spacing:-0.03em; line-height:1.08;
}
h2 { margin:0; }
a { color:inherit; }
.eyebrow {
  margin:0 0 10px; color:var(--muted); font-size:13px; font-weight:600;
  letter-spacing:0.06em; text-transform:uppercase;
}
.levels { display:flex; flex-wrap:wrap; gap:8px; margin-top:26px; }
.level {
  display:inline-flex; align-items:baseline; gap:7px;
  padding:9px 16px; border-radius:999px; text-decoration:none;
  background:var(--surface); color:var(--fg); font-size:14px; font-weight:600;
  transition:background-color .15s ease,color .15s ease;
}
.level:hover { background:var(--surface-strong); }
.level[aria-current="page"] { background:var(--blue); color:var(--on-blue); }
.level[aria-current="page"]:hover { background:var(--blue-hover); }
.level .cn { font-weight:500; opacity:.72; font-size:13px; }
.list { margin-top:30px; display:flex; flex-direction:column; gap:16px;
  border-top:0; }
.row {
  display:flex; align-items:center; gap:16px; padding:15px 18px;
  border:1px solid var(--rule); border-radius:var(--radius-card, 24px);
  background:var(--bg); text-decoration:none; color:inherit;
  transition:background-color .15s ease, box-shadow .15s ease,
    transform .15s ease;
}
.row:hover {
  background:var(--surface); transform:translateY(-1px);
  box-shadow:var(--shadow-card, 0 1px 2px rgba(0, 0, 0, 0.05),
    0 8px 24px rgba(0, 0, 0, 0.06));
}
.row:active { transform:scale(0.995); }
.row:hover .t { color:var(--blue); }
.num {
  flex:none; width:34px; color:var(--muted); font-size:14px;
  font-variant-numeric:tabular-nums;
}
.t { flex:1; min-width:0; font-size:18px; font-weight:600; letter-spacing:-0.01em; }
.arrow { flex:none; color:var(--muted); font-size:20px; line-height:1; }
.unit { margin-top:38px; }
.unit:first-of-type { margin-top:30px; }
.unit h2 {
  margin:0 0 4px; color:var(--muted); font-size:13px; font-weight:650;
  letter-spacing:0.06em; text-transform:uppercase;
}
.unit .stories { border-top:0; margin-top:12px; display:flex;
  flex-direction:column; gap:16px; }
"""

STORY_CSS = """
:root {
  --pron-link:#0071e3;
  --pron-elide:#8e44ad;
  --pron-change:#c93400;
  --pron-sg:#6e6e73;
}
@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) {
    --pron-link:#6cb6ff;
    --pron-elide:#d0a9e8;
    --pron-change:#ff9f0a;
    --pron-sg:#c7c7cc;
  }
}
html[data-theme="dark"] {
  --pron-link:#6cb6ff;
  --pron-elide:#d0a9e8;
  --pron-change:#ff9f0a;
  --pron-sg:#c7c7cc;
}
html[data-theme="bright"], html[data-theme="sepia"] {
  --pron-link:#0071e3;
  --pron-elide:#8e44ad;
  --pron-change:#c93400;
  --pron-sg:#6e6e73;
}
.unit-label {
  margin:0 0 12px; color:var(--muted); font-size:12.5px; font-weight:600;
  letter-spacing:0.06em; text-transform:uppercase;
}
.vocab-card {
  margin-top:30px; padding:20px 24px 22px; border-radius:var(--radius);
  background:var(--surface);
}
.vocab-card h2 {
  margin:0 0 12px; font-size:13px; font-weight:650; letter-spacing:0.04em;
  color:var(--muted); text-transform:uppercase;
}
.vocab { display:grid; grid-template-columns:1fr 1fr; gap:0 28px; }
.vocab ol { margin:0; padding-left:22px; }
.vocab li { padding:3px 0; font-size:15px; line-height:1.45; }
.vocab-zh {
  margin-left:7px; color:var(--muted); font-size:13.5px;
  letter-spacing:0; white-space:normal; overflow-wrap:anywhere;
}
.story {
  margin-top:36px; font-size:19px; line-height:1.78; letter-spacing:-0.005em;
}
.story .para { margin:0 0 1.45em; }
.story .sent { margin:0 0 9px; }
.story .sent:last-child { margin-bottom:0; }
.story .en { margin:0; }
.story .zh {
  display:block; margin:3px 0 0; color:var(--muted);
  font-size:15.5px; line-height:1.7; letter-spacing:0; font-weight:400;
}
.zh-title {
  margin:9px 0 0; color:var(--muted); font-size:16px;
  font-weight:500; letter-spacing:0;
}
.s {
  display:inline; font:inherit; color:inherit; background:none; border:0;
  padding:1px 2px; margin:0 -2px; border-radius:5px; cursor:pointer;
  text-align:left; border-bottom:1px dotted transparent;
  white-space:normal; overflow-wrap:break-word; max-width:100%;
  transition:background-color .12s ease,color .12s ease,border-color .12s ease;
}
.s:hover { background:var(--blue-tint); color:var(--blue); border-bottom-color:currentColor; }
.s.playing { background:var(--blue-tint); color:var(--blue); border-bottom-color:currentColor; }
.s:focus-visible { outline:2px solid var(--blue); outline-offset:2px; }
.toolbar {
  display:flex; align-items:center; justify-content:space-between;
  gap:14px; flex-wrap:wrap; margin-top:28px;
}
.seg {
  display:inline-flex; padding:3px; border-radius:999px;
  background:var(--surface);
}
.seg button {
  border:0; background:transparent; color:var(--muted); font:inherit;
  font-size:13.5px; font-weight:600; padding:6px 15px; border-radius:999px;
  cursor:pointer; transition:background-color .15s ease,color .15s ease;
}
.seg button[aria-pressed="true"] { background:var(--bg); color:var(--fg); }
.seg button:focus-visible { outline:2px solid var(--blue); outline-offset:1px; }
.toolbar-right { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.speed {
  display:flex; align-items:center; gap:8px;
  color:var(--muted); font-size:13px; font-weight:600; white-space:nowrap;
}
.speed input[type="range"] {
  width:104px; height:20px; margin:0; accent-color:var(--blue); cursor:pointer;
}
.speed output {
  min-width:36px; color:var(--fg); font-variant-numeric:tabular-nums;
}
.speed-reset {
  border:0; background:transparent; color:var(--blue);
  font:inherit; font-size:12px; font-weight:600; padding:6px 10px;
  border-radius:999px; cursor:pointer;
}
.speed-reset:hover { background:var(--blue-tint); }
.speed-reset:focus-visible { outline:2px solid var(--blue); outline-offset:1px; }
.speed-group { display:flex; align-items:center; gap:6px; }
.play-all {
  display:inline-flex; align-items:center; gap:7px;
  border:1px solid transparent; background:var(--blue); color:var(--on-blue);
  font:inherit; font-size:13.5px; font-weight:650; padding:7px 14px;
  border-radius:999px; cursor:pointer;
  transition:background-color .15s ease,color .15s ease;
}
.play-all:hover { background:var(--blue-hover); }
.play-all:focus-visible { outline:2px solid var(--blue); outline-offset:2px; }
.play-all svg { width:15px; height:15px; fill:currentColor; flex:none; }
.play-all .stop-icon { display:none; }
.play-all[aria-pressed="true"] { background:var(--surface-strong); color:var(--fg); }
.play-all[aria-pressed="true"] .play-icon { display:none; }
.play-all[aria-pressed="true"] .stop-icon { display:inline; }
.marks-toggle {
  border:1px solid var(--rule); background:transparent; color:var(--muted);
  font:inherit; font-size:13px; font-weight:600; padding:7px 14px;
  border-radius:999px; cursor:pointer;
}
.marks-toggle[aria-pressed="true"] { color:var(--fg); border-color:var(--fg); }
.marks-toggle:focus-visible { outline:2px solid var(--blue); outline-offset:2px; }
.marks-key {
  display:flex; flex-wrap:wrap; gap:7px 16px; margin:12px 0 0;
  color:var(--muted); font-size:12.5px; line-height:1.5;
}
.marks-key span { white-space:nowrap; }
.marks-key b { font-weight:650; }
.glide-note { color:var(--pron-link); font-weight:650; font-size:.95em; }
.audio-status {
  display:none; margin:8px 0 0; color:var(--pron-change);
  font-size:13px; font-weight:500;
}
.audio-status.show { display:block; }
.lnk { color:var(--pron-link); font-weight:700; font-size:1.06em; margin:0 1px; }
.glide {
  color:var(--pron-link); font-size:.46em; font-weight:700;
  letter-spacing:0; margin-left:1px; vertical-align:super; line-height:0;
}
.el { color:var(--pron-elide); font-weight:650; }
.chg { border-bottom:2px dotted var(--pron-change); }
.say {
  color:var(--pron-change); font-size:.52em; font-weight:650;
  letter-spacing:0; margin-left:1px; vertical-align:super; line-height:0;
}
.sg {
  color:var(--pron-sg); font-weight:600; margin:0 .3em;
  font-size:1.04em;
}
html.marks-off .marks-key,
html.marks-off .lnk,
html.marks-off .glide,
html.marks-off .sg,
html.marks-off .say { display:none; }
html.marks-off .chg { border-bottom:0; }
html.marks-off .paren { display:none; }
html.marks-off .el { color:inherit; font-weight:inherit; }
.title-s {
  display:inline-flex; align-items:center; gap:10px;
  border:0; border-bottom:0; background:none; color:inherit; font:inherit;
  letter-spacing:inherit; line-height:inherit; padding:0; margin:0;
  border-radius:0; cursor:pointer; text-align:left;
}
.title-s:hover, .title-s.playing { color:var(--blue); background:none; }
.title-s .spk { flex:none; color:var(--muted); }
.title-s:hover .spk { color:var(--blue); }
.vocab-s {
  display:inline; font:inherit; color:inherit; background:none; border:0;
  padding:1px 0; margin:0; cursor:pointer; text-align:left;
  border-bottom:1px dotted transparent; border-radius:3px;
}
.vocab-s:hover, .vocab-s.playing {
  color:var(--blue); background:none; border-bottom-color:currentColor;
}
.vocab-s[data-clip-f]::after,
.vocab-s[data-clip-m]::after {
  content:"▸"; margin-left:5px; font-size:10px;
  color:var(--muted); opacity:.55;
}
.vocab-s:hover::after, .vocab-s.playing::after { color:var(--blue); opacity:1; }
.qs { margin-top:44px; }
.qs h2 { font-size:clamp(20px,3vw,24px); font-weight:650; letter-spacing:-0.02em; }
.qlist { margin:12px 0 0; padding-left:26px; }
.qlist li { padding:7px 0; font-size:17px; line-height:1.55; }
.qlist li::marker { color:var(--muted); font-size:15px; }
@media (max-width:560px) {
  .vocab { grid-template-columns:1fr; gap:0; }
  .vocab .col-r { margin-top:2px; }
  .story { font-size:18px; line-height:1.72; }
  .story .zh { font-size:15px; line-height:1.7; }
}
"""

THEME_HEAD = (
    "<script>try{var t=localStorage.getItem('npesl-theme');"
    "document.documentElement.setAttribute('data-theme',"
    "t&&['auto','bright','dark','sepia'].indexOf(t)>-1?t:'auto');"
    "if(localStorage.getItem('npesl-marks')==='off')"
    "document.documentElement.classList.add('marks-off');}"
    "catch(e){document.documentElement.setAttribute('data-theme','auto');}</script>\n"
    '<link rel="stylesheet" href="__PREFIX__theme.css">'
)

PLAY_JS = """
(function () {
  var AUDIO_BASE = "__AUDIO_BASE__";
  var VOICE_DIR = { f: 'ava', m: 'andrew' };
  var SPEED_KEY = 'npesl-speed';
  var SPEED_MIN = 0.7;
  var SPEED_MAX = 1.5;
  var SPEED_DEFAULT = 0.9;
  var speed = SPEED_DEFAULT;
  try {
    var savedSpeed = parseFloat(localStorage.getItem(SPEED_KEY));
    if (savedSpeed >= SPEED_MIN && savedSpeed <= SPEED_MAX) speed = savedSpeed;
  } catch (e) {}
  var player = new Audio();
  player.playbackRate = speed;
  player.preservesPitch = true;
  var current = null;
  var voice = 'f';
  var playlist = null;
  var statusTimer = null;
  var playAllBtn = document.querySelector('[data-play-all]');
  var playAllLabel = document.querySelector('[data-play-label]');
  var fullItems = (function () {
    var items = [];
    var title = document.querySelector('.title-s');
    if (title) items.push(title);
    var sents = document.querySelectorAll('.story .s');
    for (var i = 0; i < sents.length; i++) items.push(sents[i]);
    return items;
  })();
  try {
    var saved = localStorage.getItem('npesl-voice');
    if (saved === 'f' || saved === 'm') voice = saved;
  } catch (e) {}

  function unmark() {
    if (current) current.classList.remove('playing');
    current = null;
  }

  function stopAudio() {
    try { player.pause(); } catch (e) {}
    unmark();
  }

  function showStatus(text) {
    var el = document.querySelector('[data-audio-status]');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
      el.textContent = '';
      el.classList.remove('show');
    }, 4000);
  }

  function speedLabel(value) {
    return String(Math.round(value * 100) / 100).replace(/0$/, '') + '×';
  }

  function setSpeed(value, save) {
    var n = Number(value);
    if (!isFinite(n)) n = SPEED_DEFAULT;
    n = Math.max(SPEED_MIN, Math.min(SPEED_MAX, Math.round(n * 100) / 100));
    speed = n;
    player.playbackRate = n;
    var label = document.querySelector('[data-speed-label]');
    if (label) label.textContent = speedLabel(n);
    var input = document.querySelector('[data-speed-input]');
    if (input && Math.abs(parseFloat(input.value) - n) > 0.001) input.value = n;
    if (save) {
      try { localStorage.setItem(SPEED_KEY, String(n)); } catch (e) {}
    }
  }

  function setPlayAll(on) {
    if (!playAllBtn) return;
    playAllBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (playAllLabel) playAllLabel.textContent = on ? '停止' : '朗读全文';
  }

  function stopPlaylist() {
    playlist = null;
    setPlayAll(false);
    stopAudio();
  }

  function clipFor(btn) {
    return btn.getAttribute(voice === 'm' ? 'data-clip-m' : 'data-clip-f');
  }

  function audioFailed(btn) {
    if (!current && !playlist) return;
    if (btn && current && current !== btn) return;
    stopPlaylist();
    showStatus('语音加载失败，请重试或切换音色');
  }

  function playItem(index) {
    if (!playlist) return;
    if (index >= playlist.items.length) { stopPlaylist(); return; }
    playlist.index = index;
    var btn = playlist.items[index];
    try { player.pause(); } catch (e) {}
    unmark();
    current = btn;
    btn.classList.add('playing');
    if (index > 0) {
      var rect = btn.getBoundingClientRect();
      if (rect.top < 70 || rect.bottom > window.innerHeight - 24) {
        try {
          btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (e) {
          btn.scrollIntoView();
        }
      }
    }
    var clip = clipFor(btn);
    if (!clip) { audioFailed(btn); return; }
    player.src = AUDIO_BASE + VOICE_DIR[voice] + '/' + clip;
    var playing = player.play();
    if (playing && playing.catch) {
      playing.catch(function () {
        if (current === btn) audioFailed(btn);
      });
    }
  }

  function playAll() {
    if (playlist) { stopPlaylist(); return; }
    if (!fullItems.length) return;
    stopAudio();
    playlist = { items: fullItems, index: -1 };
    setPlayAll(true);
    playItem(0);
  }

  function play(btn) {
    if (playlist) stopPlaylist();
    if (current === btn && !player.paused) {
      stopAudio();
      return;
    }
    stopAudio();
    var clip = clipFor(btn);
    if (!clip) {
      showStatus('这一句暂无可用语音，请切换音色');
      return;
    }
    current = btn;
    btn.classList.add('playing');
    player.src = AUDIO_BASE + VOICE_DIR[voice] + '/' + clip;
    var playing = player.play();
    if (playing && playing.catch) {
      playing.catch(function () {
        if (current === btn) audioFailed(btn);
      });
    }
  }

  player.addEventListener('ended', function () {
    if (playlist) {
      playItem(playlist.index + 1);
    } else {
      unmark();
    }
  });
  player.addEventListener('error', function () {
    if (current) audioFailed(current);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopPlaylist();
  });

  function setVoice(next) {
    voice = next === 'm' ? 'm' : 'f';
    stopPlaylist();
    try { localStorage.setItem('npesl-voice', voice); } catch (e) {}
    var buttons = document.querySelectorAll('[data-voice]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed',
        buttons[i].getAttribute('data-voice') === voice ? 'true' : 'false');
    }
  }

  function setMarks(on) {
    document.documentElement.classList.toggle('marks-off', !on);
    try { localStorage.setItem('npesl-marks', on ? 'on' : 'off'); } catch (e) {}
    var btn = document.querySelector('[data-marks-toggle]');
    if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  var voiceButtons = document.querySelectorAll('[data-voice]');
  for (var i = 0; i < voiceButtons.length; i++) {
    voiceButtons[i].setAttribute('aria-pressed',
      voiceButtons[i].getAttribute('data-voice') === voice ? 'true' : 'false');
    voiceButtons[i].addEventListener('click', function (event) {
      setVoice(event.currentTarget.getAttribute('data-voice'));
    });
  }
  var markButton = document.querySelector('[data-marks-toggle]');
  if (markButton) {
    markButton.setAttribute('aria-pressed',
      document.documentElement.classList.contains('marks-off') ? 'false' : 'true');
    markButton.addEventListener('click', function () {
      setMarks(document.documentElement.classList.contains('marks-off'));
    });
  }
  var speedInput = document.querySelector('[data-speed-input]');
  if (speedInput) {
    speedInput.value = speed;
    speedInput.addEventListener('input', function () {
      setSpeed(parseFloat(speedInput.value), true);
    });
  }
  var speedReset = document.querySelector('[data-speed-reset]');
  if (speedReset) {
    speedReset.addEventListener('click', function () {
      setSpeed(SPEED_DEFAULT, true);
    });
  }
  setSpeed(speed, false);
  if (playAllBtn) {
    setPlayAll(false);
    playAllBtn.addEventListener('click', playAll);
  }

  document.addEventListener('click', function (event) {
    var btn = event.target.closest('.s');
    if (btn) play(btn);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var btn = event.target.closest && event.target.closest('.s');
    if (btn) { event.preventDefault(); play(btn); }
  });
})();

"""


def head(title: str, prefix: str, css: str, lang: str = "zh-CN") -> str:
    theme_head = THEME_HEAD.replace("__PREFIX__", prefix)
    return f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(title)}</title>
<link rel="icon" type="image/png" sizes="512x512" href="{prefix}npesl-icon.png">
<link rel="apple-touch-icon" href="{prefix}apple-touch-icon.png">
{theme_head}
<style>{BASE_CSS}{css}</style>
</head>
<body>
<main class="page">
"""


def tail(prefix: str, audio_base: str = AUDIO_BASE) -> str:
    return f"""</main>
<script src="{prefix}theme.js" defer></script>
<script>{PLAY_JS.replace("__AUDIO_BASE__", audio_base)}</script>
</body>
</html>
"""


def back(href: str, label: str) -> str:
    return (
        f'<a class="npesl-back" href="{href}">'
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        '<path d="M15 5l-7 7 7 7"/></svg>'
        f'{html.escape(label)}</a>\n'
    )


def level_pills(current: str, prefix: str) -> str:
    links = []
    for lv in LEVELS:
        en, cn = LEVEL_LABEL[lv]
        current_attr = ' aria-current="page"' if lv == current else ""
        links.append(
            f'<a class="level" href="{prefix}{lv.lower()}/index.html"{current_attr}>'
            f'{lv}<span class="cn">{cn}</span></a>'
        )
    return '<nav class="levels">' + "".join(links) + "</nav>\n"


def level_title(lv: str) -> str:
    en, cn = LEVEL_LABEL[lv]
    if en == lv:
        return en
    return f"{lv} · {en}"


def audio_base_for(level: str) -> str:
    return AUDIO_BASE_BY_LEVEL.get(level, AUDIO_BASE)


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        fh.write(text)


# --------------------------------------------------------------------------
# pages
# --------------------------------------------------------------------------
def make_index() -> str:
    rows = []
    for lv in LEVELS:
        en, cn = LEVEL_LABEL[lv]
        num = lv if len(lv) <= 2 else ""
        label = f"{en} · {cn}" if cn else en
        rows.append(
            f'<a class="row" href="{lv.lower()}/index.html">'
            f'<span class="num">{num}</span>'
            f'<span class="t">{label}</span>'
            '<span class="arrow">›</span></a>'
        )
    body = (
        head("Conversation Starters", "../", "")
        + back("../index.html", "NPESL")
        + '<h1>Conversation Starters</h1>\n'
        + '<nav class="list">' + "".join(rows) + "</nav>\n"
        + tail("../")
    )
    return body


def make_level(level: str, units: list) -> str:
    en, cn = LEVEL_LABEL[level]
    sections = []
    for ui, unit in enumerate(units, 1):
        rows = []
        for si, story in enumerate(unit["stories"], 1):
            slug = f"{ui:02d}-{si:02d}-{slugify(story['title'])}"
            rows.append(
                f'<a class="row" href="{slug}.html">'
                f'<span class="num">{si:02d}</span>'
                f'<span class="t">{html.escape(story["title"])}</span>'
                '<span class="arrow">›</span></a>'
            )
        sections.append(
            f'<section class="unit"><h2>{html.escape(unit["title"])}</h2>'
            '<nav class="stories">' + "".join(rows) + "</nav></section>\n"
        )
    body = (
        head(f"Conversation Starters · {level}", "../../", "")
        + back("../index.html", "Conversation Starters")
        + f'<h1>{level_title(level)}</h1>\n'
        + level_pills(level, "../")
        + "".join(sections)
        + tail("../../", audio_base_for(level))
    )
    return body


def clip_attrs(text: str, audio_maps: dict) -> str:
    h = clip_hash(text)
    attrs = []
    for voice in VOICES:
        if h in audio_maps.get(voice["key"], set()):
            attrs.append(
                f'data-clip-{voice["short"]}="{h[:2]}/{h}.mp3"'
            )
    return (" " + " ".join(attrs)) if attrs else ""


def sentence_html(text: str, audio_maps: dict, extra_class: str = "",
                  label: str = "") -> str:
    marked = pron.annotate(text, thought_groups=False)
    safe = html.escape(text, quote=True)
    classes = "s" + (f" {extra_class}" if extra_class else "")
    aria = label or safe
    return (
        f'<button type="button" class="{classes}"'
        f'{clip_attrs(text, audio_maps)}'
        f' data-text="{safe}" aria-label="{aria}">{marked}</button>'
    )


def toolbar_html() -> str:
    return (
        '<div class="toolbar">'
        '<div class="seg" role="group" aria-label="读音">'
        '<button type="button" data-voice="f" aria-pressed="true">女声</button>'
        '<button type="button" data-voice="m" aria-pressed="false">男声</button>'
        '</div>'
        '<div class="speed-group">'
        '<label class="speed">语速'
        '<input type="range" min="0.7" max="1.5" step="0.05" value="0.9" '
        'data-speed-input aria-label="语速">'
        '<output data-speed-label>0.9×</output></label>'
        '<button type="button" class="speed-reset" data-speed-reset '
        'aria-label="恢复默认语速">恢复</button>'
        '</div>'
        '<div class="toolbar-right">'
        '<button type="button" class="play-all" data-play-all '
        'aria-pressed="false">'
        '<svg class="play-icon" viewBox="0 0 24 24" aria-hidden="true">'
        '<path d="M8 5v14l11-7z"/></svg>'
        '<svg class="stop-icon" viewBox="0 0 24 24" aria-hidden="true">'
        '<rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>'
        '<span data-play-label>朗读全文</span></button>'
        '<button type="button" class="marks-toggle" data-marks-toggle '
        'aria-pressed="true">标记</button>'
        '</div>'
        '</div>\n'
        '<div class="marks-key" aria-label="发音标记说明">'
        '<span><b class="lnk">‿</b> 连读 '
        '<span class="glide-note">j/w</span></span>'
        '<span><b class="el">(t)</b> 省略</span>'
        '<span><b class="chg">变音</b> <sup class="say">didja</sup></span>'
        '</div>\n'
        '<div class="audio-status" data-audio-status role="status" '
        'aria-live="polite"></div>\n'
    )


SPEAKER_SVG = (
    '<svg class="spk" viewBox="0 0 24 24" width="17" height="17" fill="none" '
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" '
    'stroke-linejoin="round" aria-hidden="true">'
    '<path d="M4 9v6h4l5 4V5L8 9H4z"/>'
    '<path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>'
)


def make_story(level: str, unit: dict, ui: int, story: dict, si: int,
               audio_maps: dict, zh: dict, vocab_zh: dict) -> str:
    en, cn = LEVEL_LABEL[level]
    key = f"{ui:02d}-{si:02d}-{slugify(story['title'])}"
    zh_entry = zh.get(key, {})
    zh_paras = zh_entry.get("paras", [])
    glosses = vocab_zh.get(key, [])

    paragraphs = []
    for idx, para in enumerate(story["text"]):
        sents = split_sentences(para)
        zh_para = zh_paras[idx] if idx < len(zh_paras) else ""
        zh_sents = split_zh(zh_para) if zh_para else []
        if zh_para and len(zh_sents) != len(sents):
            print(f"警告：{level} {key} 第 {idx + 1} 段中英文句数不一致"
                  f"（英 {len(sents)} / 中 {len(zh_sents)}），按整段显示")
            block = (
                '<div class="para"><p class="en">'
                + " ".join(sentence_html(s, audio_maps) for s in sents)
                + '</p><p class="zh" lang="zh-CN">'
                + html.escape(zh_para)
                + "</p></div>"
            )
            paragraphs.append(block)
            continue
        blocks = []
        for sent, zh_sent in zip(sents, zh_sents or [""] * len(sents)):
            inner = sentence_html(sent, audio_maps)
            if zh_sent:
                inner += (
                    '<span class="zh" lang="zh-CN">'
                    + html.escape(zh_sent)
                    + "</span>"
                )
            blocks.append('<div class="sent">' + inner + "</div>")
        if not zh_sents:
            blocks = [
                '<div class="sent">' + sentence_html(sent, audio_maps) + "</div>"
                for sent in sents
            ]
        paragraphs.append('<div class="para">' + "".join(blocks) + "</div>")

    vocab_items = []
    for index, term in enumerate(story["vocab"]):
        item = sentence_html(
            term, audio_maps, "vocab-s", label=f"朗读 {html.escape(term, quote=True)}"
        )
        gloss = glosses[index] if index < len(glosses) else ""
        if gloss:
            item += (
                '<span class="vocab-zh" lang="zh-CN">'
                + html.escape(gloss)
                + "</span>"
            )
        vocab_items.append("<li>" + item + "</li>")
    half = (len(vocab_items) + 1) // 2
    vocab = (
        '<div class="col-l"><ol>' + "".join(vocab_items[:half]) + "</ol></div>"
        '<div class="col-r"><ol start="' + str(half + 1) + '">'
        + "".join(vocab_items[half:]) + "</ol></div>"
    )

    def qlist(items):
        return "<ol class=\"qlist\">" + "".join(
            f"<li>{sentence_html(q, audio_maps)}</li>" for q in items
        ) + "</ol>"

    title_marked = html.escape(story["title"])
    title_safe = html.escape(story["title"], quote=True)
    title = (
        f'<h1><button type="button" class="s title-s"'
        f'{clip_attrs(story["title"], audio_maps)}'
        f' data-text="{title_safe}" aria-label="朗读标题 {title_safe}">'
        f'{title_marked}{SPEAKER_SVG}</button></h1>\n'
    )
    if zh_entry.get("title"):
        title += (
            '<p class="zh-title" lang="zh-CN">'
            + html.escape(zh_entry["title"])
            + "</p>\n"
        )

    body = (
        head(f"{story['title']} · {level} · Conversation Starters", "../../",
             STORY_CSS, "en")
        + back("../index.html", f"{level} {cn}".strip())
        + f'<p class="unit-label">{html.escape(unit["title"])}</p>\n'
        + title
        + toolbar_html()
        + '<section class="vocab-card"><h2>Key Vocabulary &amp; Expressions</h2>'
        f'<div class="vocab">{vocab}</div></section>\n'
        '<section class="story">' + "".join(paragraphs) + "</section>\n"
        '<section class="qs"><h2>Comprehension Questions</h2>'
        + qlist(story["comp"]) + "</section>\n"
        '<section class="qs"><h2>Conversation Starters</h2>'
        + qlist(story["conv"]) + "</section>\n"
        + tail("../../", audio_base_for(level))
    )
    return body


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------
def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--levels", default=",".join(LEVELS),
                        help="建页面的级别，逗号分隔（默认全部）")
    parser.add_argument("--audio-levels", default=",".join(LEVELS),
                        help="生成语音的级别，逗号分隔（默认全部；空字符串=不生成）")
    parser.add_argument("--voices", default="female,male",
                        help="生成语音的音色：female,male（默认两套）")
    parser.add_argument("--jobs", type=int, default=8, help="并发语音请求数")
    parser.add_argument("--no-audio", action="store_true", help="只建页面，不合成")
    parser.add_argument("--out", default=str(OUT),
                        help="输出目录（默认 build/conversation-site）")
    args = parser.parse_args()

    page_levels = [x.strip().upper() for x in args.levels.split(",") if x.strip()]
    audio_levels = set()
    if not args.no_audio and args.audio_levels.strip():
        audio_levels = {x.strip().upper() for x in args.audio_levels.split(",") if x.strip()}
    voice_keys = [x.strip().lower() for x in args.voices.split(",") if x.strip()]
    bad = [x for x in page_levels + sorted(audio_levels) if x not in LEVELS]
    bad += [v for v in voice_keys if v not in VOICE_BY_KEY]
    if bad:
        print(f"未知级别或音色：{', '.join(bad)}")
        return 1
    voices = [VOICE_BY_KEY[k] for k in voice_keys]

    data = {lv: load_level(lv) for lv in page_levels}
    zh_data = {lv: load_zh(lv) for lv in page_levels}
    vocab_data = {lv: load_vocab_zh(lv) for lv in page_levels}
    texts = unique_texts(data, page_levels)
    active_audio = set(page_levels) & audio_levels
    audio_texts = unique_texts(data, active_audio) if active_audio else []

    if audio_texts and not args.no_audio:
        generate(voices, audio_texts, args.jobs)

    # 站点目录
    out = Path(args.out).expanduser().resolve()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    # 只搬站点实际引用的音频。ESLSE 放主站自己的目录，其余进音频站目录。
    audio_maps = {v["key"]: set() for v in voices}
    copied = 0
    for voice in voices:
        cache_dir = CACHE / voice["dir"]
        if not cache_dir.exists():
            continue
        hashes = {p.stem for p in cache_dir.rglob("*.mp3")}
        audio_maps[voice["key"]] = hashes
        for lv in sorted(active_audio):
            dest_root = (out / lv.lower() / "audio"
                         if lv in AUDIO_BASE_BY_LEVEL else out / "audio")
            seen = set()
            for text in unique_texts(data, [lv]):
                h = clip_hash(text)
                if h not in hashes or h in seen:
                    continue
                seen.add(h)
                src = cache_dir / h[:2] / f"{h}.mp3"
                dst = dest_root / voice["dir"] / h[:2] / f"{h}.mp3"
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
                copied += 1

    # 页面
    write(out / "index.html", make_index())
    stories = 0
    for lv in page_levels:
        units = data[lv]
        # 页面是否挂音频，取决于缓存里有没有这条剪辑；
        # 复制/合成哪些级别（audio_levels）不影响页面引用。
        level_maps = audio_maps
        write(out / lv.lower() / "index.html", make_level(lv, units))
        for ui, unit in enumerate(units, 1):
            for si, story in enumerate(unit["stories"], 1):
                slug = f"{ui:02d}-{si:02d}-{slugify(story['title'])}"
                write(out / lv.lower() / f"{slug}.html",
                      make_story(lv, unit, ui, story, si, level_maps,
                                 zh_data.get(lv, {}), vocab_data.get(lv, {})))
                stories += 1

    pages = 1 + len(page_levels) + stories
    size = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    print(f"页面 {pages} 个（{len(page_levels)} 级 / {stories} 篇）")
    print(f"语音 {copied} 条（{'+'.join(v['dir'] for v in voices)}）")
    print(f"输出：{out}，共 {size / 1024 / 1024:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
