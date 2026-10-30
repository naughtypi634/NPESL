#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the Conversation Starters web app.

Source:  content/conversation/<LEVEL>/content.py（10 units × 5 stories）
         content/conversation/zh/<level>.json（逐段中文翻译）
         content/conversation/zh/vocab-<level>.json（逐条词汇中文释义）
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

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import CONVERSATION_CONTENT, CONVERSATION_OUT, TTS_CACHE  # noqa: E402
import audio_sprite  # noqa: E402
from themes import theme_boot  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SRC = CONVERSATION_CONTENT
ZH_SRC = SRC / "zh"
OUT = CONVERSATION_OUT
CACHE = TTS_CACHE
PROGRESS = CACHE / "progress.txt"
FAILED = CACHE / "failed.json"

AUDIO_BASE = "https://npesl-audio.pages.dev/audio/"
# 本地预览时可以换成同源路径（如 /audio/），页面和音频放在同一个测试服务器下。
AUDIO_BASE_OVERRIDE = None
# 所有级别（含 ESLSE）统一走音频站。改用 sprite 后音频站只有 700 个文件，
# 不再受 Cloudflare Pages 20,000 文件上限约束，页面里也只出现一种音频地址。

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


def timing_path(mp3: Path) -> Path:
    """Word-boundary sidecar written next to the cached clip."""
    return mp3.with_suffix(".json")


def timing_ready(mp3: Path) -> bool:
    """True when the sidecar still describes this exact mp3 (size match).

    Edge TTS is not byte-deterministic, so timings are only valid for the
    audio produced by the same request.  The build hashes the bytes again
    before trusting a sidecar; this cheap check only decides whether the
    clip must be synthesized again.
    """
    side = timing_path(mp3)
    if not side.exists():
        return False
    try:
        meta = json.loads(side.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    return meta.get("size") == mp3.stat().st_size


# --------------------------------------------------------------------------
# word timings
# --------------------------------------------------------------------------
def _norm_word(word: str) -> str:
    word = word.lower().replace("’", "'")
    return re.sub(r"^[^a-z0-9']+|[^a-z0-9']+$", "", word)


def _words_match(edge_word: str, token: str) -> bool:
    if edge_word == token:
        return True
    # Edge keeps the number in "7-Eleven" / "30-minute"; WORD_RE only sees the
    # letter part after the hyphen.
    return edge_word.endswith("-" + token) or token.endswith("-" + edge_word)


def align_word_starts(text: str, words: list) -> list | None:
    """Map Edge word boundaries onto WORD_RE tokens.

    ``words`` is ``[[text, start, duration], ...]`` from the TTS sidecar.
    Returns one start time (seconds, relative to the clip) per token, or None
    when the alignment is too weak to drive karaoke.
    """
    tokens = [m.group(0) for m in pron.WORD_RE.finditer(text)]
    if not tokens or not words:
        return None
    starts: list = [None] * len(tokens)
    cursor = 0
    for entry in words:
        if not entry:
            continue
        spoken = _norm_word(str(entry[0]))
        if not spoken:
            continue
        found = None
        for j in range(cursor, min(len(tokens), cursor + 4)):
            if _words_match(spoken, _norm_word(tokens[j])):
                found = j
                break
        if found is None:
            # Numbers and symbols are not WORD_RE tokens; leaving them
            # unhighlighted is better than shifting every later word.
            continue
        try:
            starts[found] = round(float(entry[1]), 3)
        except (TypeError, ValueError, IndexError):
            continue
        cursor = found + 1

    known = sum(1 for value in starts if value is not None)
    if known < max(1, int(len(tokens) * 0.7)):
        return None
    # A token Edge skipped keeps the previous word's onset, so it lights up
    # together with the word before it instead of never lighting up.
    last = 0.0
    for i, value in enumerate(starts):
        if value is None:
            starts[i] = last
        else:
            last = value
    return starts


def load_word_starts(text: str, mp3: Path, audio: bytes) -> list | None:
    """Read the sidecar and verify it belongs to these exact audio bytes."""
    side = timing_path(mp3)
    if not side.exists():
        return None
    try:
        meta = json.loads(side.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if meta.get("text") != text:
        return None
    if meta.get("sha1") != hashlib.sha1(audio).hexdigest():
        return None
    return align_word_starts(text, meta.get("words") or [])


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


def story_sentences(data: dict, levels) -> set:
    """Unique body sentences — the only clips that need word timings."""
    out = set()
    for lv in sorted(levels):
        for unit in data.get(lv, []):
            for story in unit["stories"]:
                for para in story["text"]:
                    out.update(split_sentences(para))
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
            # WordBoundary drives the karaoke highlight in the story body.
            communicate = edge_tts.Communicate(
                text, voice, rate="+0%", boundary="WordBoundary")

            async def stream() -> tuple:
                audio = []
                words = []
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        audio.append(chunk["data"])
                    elif chunk["type"] == "WordBoundary":
                        words.append([
                            chunk["text"],
                            round(chunk["offset"] / 10_000_000, 4),
                            round(chunk["duration"] / 10_000_000, 4),
                        ])
                return b"".join(audio), words

            audio, words = await asyncio.wait_for(stream(), timeout=60)
            if not audio:
                raise RuntimeError("empty audio")
            tmp = target.with_suffix(".part")
            tmp.write_bytes(audio)
            tmp.replace(target)
            # Sidecar holds the boundaries for exactly these bytes; write it
            # after the mp3 so a crash leaves "audio without timings", never
            # stale timings for new audio.
            meta = {
                "v": 1,
                "text": text,
                "voice": voice,
                "size": len(audio),
                "sha1": hashlib.sha1(audio).hexdigest(),
                "words": words,
            }
            side = timing_path(target)
            tmp_side = side.with_name(side.name + ".part")
            tmp_side.write_text(
                json.dumps(meta, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8")
            tmp_side.replace(side)
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


def generate(voices: list, texts: list, jobs: int,
             timed_texts: set | None = None) -> dict:
    """Synthesize missing clips for every requested voice.

    ``timed_texts`` are the body sentences that need word-boundary sidecars.
    Edge TTS audio is not byte-deterministic, so an existing clip without a
    matching sidecar has to be synthesized again: its old boundaries would
    not line up with the audio on disk.
    """
    timed_texts = timed_texts or set()
    CACHE.mkdir(parents=True, exist_ok=True)
    plans = []
    retimed = 0
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
            elif text in timed_texts and not timing_ready(target):
                retimed += 1
                missing.append((text, target))
        plans.append((voice, cache_dir, missing))
    if retimed:
        print(f"逐词时间缺失或过期：{retimed} 条需要重新合成（音色 × 句）")

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
.level .cn { font-weight:500; font-size:13px; color:var(--muted); }
.level[aria-current="page"] .cn { color:inherit; }
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
html[data-theme="dark"], html[data-theme="night"] {
  --pron-link:#6cb6ff;
  --pron-elide:#d0a9e8;
  --pron-change:#ff9f0a;
  --pron-sg:#c7c7cc;
}
html[data-theme="bright"], html[data-theme="sepia"],
html[data-theme="mono"], html[data-theme="mist"] {
  --pron-link:#0071e3;
  --pron-elide:#8e44ad;
  --pron-change:#c93400;
  --pron-sg:#6e6e73;
}
.unit-label {
  margin:0 0 12px; color:var(--muted); font-size:12.5px; font-weight:600;
  letter-spacing:0.06em; text-transform:uppercase;
}
/* 四个板块用同一张卡片：同样的底色、圆角、内边距。 */
.content-card {
  background:var(--surface);
  border-radius:var(--radius);
  padding:20px 24px 22px;
}
/* 板块标题行：左边小标题，右边中英开关。标题行不进卡片，药丸右缘才能和
   返回按钮对称地贴住正文栏边——浮钮必须和它同一条竖线，才能原地接管。 */
.sec-head {
  display:flex; align-items:center; justify-content:space-between;
  gap:16px; margin:36px 0 12px;
}
.sec-head h2 {
  margin:0; min-width:0;
  font-size:13px; font-weight:650; letter-spacing:0.04em;
  color:var(--muted); text-transform:uppercase; line-height:1.3;
}
.sec-head > .zh-toggle { flex:none; }
.vocab { display:grid; grid-template-columns:1fr 1fr; gap:0 28px; }
.vocab ol { margin:0; padding-left:22px; }
.vocab li { padding:3px 0; font-size:15px; line-height:1.45; }
.vocab-zh {
  margin-left:7px; color:var(--muted); font-size:13.5px;
  letter-spacing:0; white-space:normal; overflow-wrap:anywhere;
}
.story {
  font-size:19px; line-height:1.78; letter-spacing:-0.005em;
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
  color:var(--blue); background:var(--blue-tint); border-bottom-color:currentColor;
}
.vocab-s[data-start-f]::after,
.vocab-s[data-start-m]::after {
  content:"▸"; margin-left:5px; font-size:10px;
  color:var(--muted); opacity:.75;
}
.vocab-s:hover::after, .vocab-s.playing::after { color:var(--blue); opacity:1; }
/* 序号用计数器而不是 ::marker：按钮是行内元素，换行后 ::marker 会贴着
   最后一行基线，看起来像序号插进了句子中间。 */
.qlist { margin:0; padding-left:0; list-style:none; counter-reset:q; }
.qlist li {
  display:flex; align-items:baseline; gap:10px;
  padding:7px 0; font-size:17px; line-height:1.55;
  counter-increment:q;
}
.qlist li::before {
  content:counter(q) "."; flex:none; min-width:1.3em;
  color:var(--muted); font-size:15px; font-weight:500;
}
/* Karaoke: the spoken part of the sentence lights up word by word. */
.s .w {
  border-radius:4px;
  -webkit-box-decoration-break:clone; box-decoration-break:clone;
  transition:color .08s linear, background-color .08s linear;
}
.s.ktv.playing {
  background:var(--surface-strong); color:var(--fg); border-bottom-color:transparent;
}
.s.ktv.playing .w.read { color:var(--blue); }
.s.ktv.playing .w.now {
  color:var(--blue); background:var(--blue-tint);
  box-shadow:0 0 0 2px var(--blue-tint);
}
html.zh-hide-vocab .vocab-zh,
html.zh-hide-body .story .zh { display:none; }
.zh-float {
  position:fixed; z-index:80; display:flex;
  top:max(12px, env(safe-area-inset-top, 0px));
  /* 右缘对准板块内药丸，也就是正文栏右缘——和左上角返回按钮对称。
     固定定位的 50% 相对不含滚动条的视口，所以别写成 100vw。 */
  right:calc(
    max(0px, calc(50% - 390px))
    + max(20px, env(safe-area-inset-right, 0px))
  );
  font-family:var(--font);
}
.zh-float[hidden] { display:none; }
.zh-toggle {
  display:inline-flex; align-items:center; justify-content:center; gap:6px;
  min-width:106px; height:35px; padding:0 12px;
  border:1px solid var(--rule); border-radius:999px;
  background:var(--surface); color:var(--fg);
  font:inherit; font-size:13px; font-weight:650;
  cursor:pointer; box-shadow:0 4px 18px rgba(0,0,0,.10);
  transition:background-color .15s ease, color .15s ease;
}
.zh-toggle:hover { background:var(--surface-strong); }
.zh-toggle .zh-icon { color:var(--blue); font-size:12px; font-weight:700; }
.zh-toggle .zh-state { color:var(--muted); font-weight:600; }
.zh-toggle.is-off { color:var(--muted); }
.zh-toggle.is-off .zh-icon { color:var(--muted); }
.zh-toggle:focus-visible { outline:2px solid var(--blue); outline-offset:2px; }
body.has-player .page { padding-bottom:140px; }
/* The floating theme button would sit over the dock / speed menu; it comes
   back as soon as the player is closed. */
body.has-player .npesl-theme {
  opacity:0; visibility:hidden; pointer-events:none;
}
.kplayer {
  position:fixed; left:50%; z-index:60;
  bottom:calc(14px + env(safe-area-inset-bottom, 0px));
  transform:translateX(-50%);
  width:min(720px, calc(100% - 24px));
  display:flex; align-items:center; gap:10px;
  padding:9px 12px; border:1px solid var(--rule); border-radius:20px;
  background:var(--surface); box-shadow:0 18px 48px rgba(0,0,0,.18);
}
.kplayer[hidden] { display:none; }
.kp-toggle {
  flex:none; width:42px; height:42px; padding:0; border:0; border-radius:50%;
  background:var(--blue); color:var(--on-blue); cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center;
  box-shadow:0 3px 10px rgba(0,113,227,.28);
}
.kp-toggle:hover { background:var(--blue-hover); }
.kp-toggle:focus-visible { outline:2px solid var(--blue); outline-offset:2px; }
.kp-toggle svg { width:18px; height:18px; fill:currentColor; }
.kp-pause { display:none; }
.kp-toggle[aria-pressed="true"] .kp-play { display:none; }
.kp-toggle[aria-pressed="true"] .kp-pause { display:block; }
.kp-body { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.kp-range {
  -webkit-appearance:none; appearance:none;
  width:100%; height:20px; margin:0; background:transparent; cursor:pointer;
}
.kp-range::-webkit-slider-runnable-track {
  height:6px; border-radius:3px;
  background:linear-gradient(to right,
    var(--blue) var(--p,0%), var(--surface-strong) var(--p,0%));
}
.kp-range::-webkit-slider-thumb {
  -webkit-appearance:none; width:16px; height:16px; margin-top:-5px;
  border-radius:50%; border:2px solid var(--blue); background:var(--bg);
  box-shadow:0 1px 4px rgba(0,0,0,.28);
}
.kp-range::-moz-range-track {
  height:6px; border-radius:3px; background:var(--surface-strong);
}
.kp-range::-moz-range-progress {
  height:6px; border-radius:3px; background:var(--blue);
}
.kp-range::-moz-range-thumb {
  width:14px; height:14px; border-radius:50%;
  border:2px solid var(--blue); background:var(--bg);
}
.kp-range:focus-visible {
  outline:2px solid var(--blue); outline-offset:4px; border-radius:6px;
}
.kp-time {
  color:var(--muted); font-size:12px; letter-spacing:0;
  font-variant-numeric:tabular-nums;
}
.kp-speed-wrap { position:relative; flex:none; }
.kp-speed {
  display:inline-flex; align-items:center; gap:4px;
  border:1px solid transparent; background:transparent; color:var(--muted);
  font:inherit; font-size:12.5px; font-weight:650; padding:8px 8px;
  border-radius:999px; cursor:pointer; font-variant-numeric:tabular-nums;
}
.kp-speed:hover, .kp-speed[aria-expanded="true"] {
  background:var(--surface-strong); color:var(--fg);
}
.kp-speed:focus-visible { outline:2px solid var(--blue); outline-offset:1px; }
.kp-caret {
  width:11px; height:11px; fill:none; stroke:currentColor;
  stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round;
  opacity:.65;
}
.kp-speed-menu {
  position:absolute; right:0; bottom:calc(100% + 10px); z-index:70;
  min-width:104px; padding:6px;
  border:1px solid var(--rule); border-radius:14px;
  background:var(--bg); box-shadow:0 12px 32px rgba(0,0,0,.18);
}
.kp-speed-menu[hidden] { display:none; }
.kp-speed-menu button {
  display:flex; align-items:center; justify-content:space-between;
  width:100%; padding:11px 12px; border:0; border-radius:9px;
  background:transparent; color:var(--fg); font:inherit;
  font-size:13.5px; font-weight:600; text-align:left; cursor:pointer;
  font-variant-numeric:tabular-nums;
}
.kp-speed-menu button:hover { background:var(--surface); }
.kp-speed-menu button[aria-checked="true"] {
  background:var(--blue-tint); color:var(--blue);
}
.kp-speed-menu button[aria-checked="true"]::after {
  content:"✓"; margin-left:12px; font-size:12px;
}
.kp-speed-menu button:focus-visible {
  outline:2px solid var(--blue); outline-offset:-2px;
}
.kp-close {
  flex:none; width:38px; height:38px; padding:0; border:0; border-radius:50%;
  background:transparent; color:var(--muted); font-size:16px; line-height:1;
  cursor:pointer;
}
.kp-close:hover { background:var(--surface-strong); color:var(--fg); }
.kp-close:focus-visible { outline:2px solid var(--blue); outline-offset:1px; }
@media (max-width:560px) {
  .vocab { grid-template-columns:1fr; gap:0; }
  .vocab .col-r { margin-top:2px; }
  .story { font-size:18px; line-height:1.72; }
  .story .zh { font-size:15px; line-height:1.7; }
  .kplayer { width:calc(100% - 16px); gap:8px; padding:8px 10px; }
  .kp-toggle { width:38px; height:38px; }
  .kp-speed { padding:8px 6px; }
  .kp-close { width:34px; height:34px; }
  /* .zh-float 的 top/right 不覆盖：和返回按钮同一套 12px / 页面边距。 */
  .sec-head { gap:12px; }
  body.has-player .page { padding-bottom:132px; }
}
"""

THEME_HEAD = theme_boot("__PREFIX__theme.css", extra_js=(
    "if(localStorage.getItem('npesl-marks')==='off')"
    "document.documentElement.classList.add('marks-off');"
    "var z=JSON.parse(localStorage.getItem('npesl-zh')||'{}');"
    "if(z.vocab===false)document.documentElement.classList.add('zh-hide-vocab');"
    "if(z.body===false)document.documentElement.classList.add('zh-hide-body');"
))

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
  // ``speed`` is the page-wide default (toolbar slider, saved).  ``activeSpeed``
  // is a one-sentence override made from the player's speed menu; it resets to
  // the default as soon as another sentence starts.
  var activeSpeed = speed;
  player.playbackRate = activeSpeed;
  player.preservesPitch = true;
  var current = null;
  var voice = 'f';
  var playlist = null;
  var statusTimer = null;
  var stickyStatus = false;
  var raf = 0;
  var tickTimer = 0;
  var loadedSrc = null;
  var SOURCES = {};
  var READY = {};
  var SPRITES = {};
  try {
    SPRITES = JSON.parse(document.getElementById('spriteMap').textContent);
  } catch (e) { SPRITES = {}; }
  var WORDMAP = {};
  try {
    var wordNode = document.getElementById('wordMap');
    WORDMAP = wordNode ? JSON.parse(wordNode.textContent) : {};
  } catch (e) { WORDMAP = {}; }
  var dock = document.querySelector('[data-kplayer]');
  var dockToggle = document.querySelector('[data-kp-toggle]');
  var dockRange = document.querySelector('[data-kp-range]');
  var dockTime = document.querySelector('[data-kp-time]');
  var dockSpeed = document.querySelector('[data-kp-speed]');
  var dockSpeedLabel = document.querySelector('[data-kp-speed-label]');
  var speedMenu = document.querySelector('[data-kp-speed-menu]');
  var speedWrap = document.querySelector('.kp-speed-wrap');
  var speedOptions = document.querySelectorAll('[data-kp-rate]');
  var dockClose = document.querySelector('[data-kp-close]');
  var zhFloat = document.querySelector('[data-zh-float]');
  var zhFloatBtn = zhFloat ? zhFloat.querySelector('[data-zh-toggle]') : null;
  var ZH_KEY = 'npesl-zh';
  var zh = { vocab: true, body: true };
  try {
    var savedZh = JSON.parse(localStorage.getItem(ZH_KEY) || '{}');
    if (savedZh.vocab === false) zh.vocab = false;
    if (savedZh.body === false) zh.body = false;
  } catch (e) {}
  var zhActive = null;
  // 每个板块一颗板块内按钮（标题行右端）+ 右上角一颗浮钮，三颗长得一样。
  var zhSections = [
    { key: 'vocab', el: document.querySelector('.vocab-card'),
      btn: document.querySelector('[data-zh-for="vocab"]') },
    { key: 'body', el: document.querySelector('.story'),
      btn: document.querySelector('[data-zh-for="body"]') },
  ];
  var zhSlotTop = null;        // 浮钮顶边的视口 y
  var zhHiddenBtn = null;      // 当前被浮钮顶替、用 visibility 藏起来的板块内按钮
  var spanFrom = 0;
  var spanTo = 0;
  var loadingBtn = null;
  var activeOnEnd = null;
  var ktvStarts = null;
  var ktvWords = null;
  var ktvIndex = -1;
  var seeking = false;
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

  function clearWords() {
    if (ktvWords) {
      for (var i = 0; i < ktvWords.length; i++) {
        if (!ktvWords[i]) continue;
        ktvWords[i].classList.remove('read');
        ktvWords[i].classList.remove('now');
      }
    }
    ktvStarts = null;
    ktvWords = null;
    ktvIndex = -1;
  }

  function closeSpeedMenu() {
    if (!speedMenu) return;
    speedMenu.hidden = true;
    if (dockSpeed) dockSpeed.setAttribute('aria-expanded', 'false');
  }

  function hideDock() {
    closeSpeedMenu();
    if (dock) dock.hidden = true;
    document.body.classList.remove('has-player');
  }

  function stopAudio() {
    try { player.pause(); } catch (e) {}
    stopTick();
    hideStatus();
    clearWords();
    hideDock();
    loadingBtn = null;
    activeOnEnd = null;
    unmark();
  }

  function showStatus(text, sticky) {
    var el = document.querySelector('[data-audio-status]');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    stickyStatus = !!sticky;
    if (statusTimer) clearTimeout(statusTimer);
    if (stickyStatus) { statusTimer = null; return; }
    statusTimer = setTimeout(function () {
      if (stickyStatus) return;
      el.textContent = '';
      el.classList.remove('show');
    }, 4000);
  }

  function hideStatus() {
    var el = document.querySelector('[data-audio-status]');
    stickyStatus = false;
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
    if (!el) return;
    el.textContent = '';
    el.classList.remove('show');
  }

  function speedLabel(value) {
    return String(Math.round(value * 100) / 100).replace(/0$/, '') + '×';
  }

  function clampSpeed(value) {
    var n = Number(value);
    if (!isFinite(n)) n = SPEED_DEFAULT;
    return Math.max(SPEED_MIN, Math.min(SPEED_MAX, Math.round(n * 100) / 100));
  }

  function updateDockSpeed() {
    if (dockSpeedLabel) dockSpeedLabel.textContent = speedLabel(activeSpeed);
    if (dockSpeed) {
      dockSpeed.setAttribute('aria-label', '本句语速，当前 ' + speedLabel(activeSpeed));
    }
    for (var i = 0; i < speedOptions.length; i++) {
      var option = speedOptions[i];
      var value = parseFloat(option.getAttribute('data-kp-rate'));
      option.setAttribute('aria-checked',
        Math.abs(value - activeSpeed) < 0.001 ? 'true' : 'false');
    }
  }

  // Page-wide default: toolbar slider + localStorage + the current sentence.
  function setSpeed(value, save) {
    var n = clampSpeed(value);
    speed = n;
    activeSpeed = n;
    player.playbackRate = n;
    var label = document.querySelector('[data-speed-label]');
    if (label) label.textContent = speedLabel(n);
    updateDockSpeed();
    var input = document.querySelector('[data-speed-input]');
    if (input && Math.abs(parseFloat(input.value) - n) > 0.001) input.value = n;
    if (save) {
      try { localStorage.setItem(SPEED_KEY, String(n)); } catch (e) {}
    }
  }

  // One-sentence override from the player menu: never touches the toolbar,
  // localStorage, or the next sentence.
  function setActiveSpeed(value) {
    activeSpeed = clampSpeed(value);
    player.playbackRate = activeSpeed;
    updateDockSpeed();
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

  function spanFor(btn) {
    var short = voice === 'm' ? 'm' : 'f';
    var start = btn.getAttribute('data-start-' + short);
    var end = btn.getAttribute('data-end-' + short);
    if (start === null || end === null) return null;
    var s = parseFloat(start);
    var e = parseFloat(end);
    return (isFinite(s) && isFinite(e)) ? [s, e] : null;
  }

  function spriteUrlFor(v) {
    var rel = SPRITES[v];
    if (!rel) return null;
    return AUDIO_BASE + VOICE_DIR[v] + '/' + rel;
  }

  function stopTick() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
  }

  // 只有落进 seekable 的位置才跳得动；站点不支持 Range 时它长期只有 [0,0]。
  function seekableEnd() {
    var ranges = player.seekable;
    var end = 0;
    for (var i = 0; i < ranges.length; i++) {
      if (ranges.end(i) > end) end = ranges.end(i);
    }
    return end;
  }

  // 拿不到整包时（本地文件、跨域不让 fetch）只有媒体元素可用：等目标位置变
  // 成可跳的再试，别把用户丢在错误的位置上。
  function waitForData(btn, seek, from, attempt) {
    if (current !== btn) return;
    if (seekableEnd() >= from - 0.01) { seek(); return; }
    if (attempt > 40) { audioFailed(btn); return; }
    showStatus('语音加载中…', true);
    setTimeout(function () { waitForData(btn, seek, from, attempt + 1); }, 250);
  }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function updateToggle() {
    if (!dockToggle) return;
    var playing = !!(current && !player.paused);
    dockToggle.setAttribute('aria-pressed', playing ? 'true' : 'false');
    dockToggle.setAttribute('aria-label', playing ? '暂停' : '播放');
  }

  // Light the words whose onset has passed.  Starts are absolute sprite
  // seconds, so playbackRate never needs to be compensated for.
  function syncWords(now) {
    if (!ktvStarts || !ktvWords) return;
    var n = 0;
    for (var i = 0; i < ktvStarts.length; i++) {
      if (ktvStarts[i] <= now + 0.02) n = i + 1;
      else break;
    }
    if (n === ktvIndex) return;
    for (var j = 0; j < ktvWords.length; j++) {
      var el = ktvWords[j];
      if (!el) continue;
      if (j < n) el.classList.add('read');
      else el.classList.remove('read');
      if (j === n - 1) el.classList.add('now');
      else el.classList.remove('now');
    }
    ktvIndex = n;
  }

  function syncDock() {
    if (!current || !dock || dock.hidden) return;
    var duration = Math.max(spanTo - spanFrom, 0.01);
    var offset = Math.min(Math.max(player.currentTime - spanFrom, 0), duration);
    if (!seeking && dockRange) {
      dockRange.value = offset;
      dockRange.style.setProperty('--p', (offset / duration * 100) + '%');
    }
    if (dockTime) {
      dockTime.textContent = fmtTime(offset) + ' / ' + fmtTime(duration);
    }
    syncWords(spanFrom + offset);
  }

  function prepareDock(btn) {
    var span = spanFor(btn);
    if (!span) return false;
    spanFrom = span[0];
    spanTo = span[1];
    clearWords();
    var wi = btn.getAttribute('data-wi');
    var table = wi !== null ? WORDMAP[voice] : null;
    var starts = table && table[wi] ? table[wi] : null;
    if (starts && starts.length) {
      var words = [];
      var usable = true;
      for (var i = 0; i < starts.length; i++) {
        var el = btn.querySelector('.w[data-i="' + i + '"]');
        if (!el) { usable = false; break; }
        words.push(el);
      }
      if (usable) { ktvStarts = starts; ktvWords = words; }
    }
    ktvIndex = -1;
    if (dock) {
      dock.hidden = false;
      document.body.classList.add('has-player');
    }
    // Keep the sentence above the dock instead of letting it slip underneath
    // on phones, where the fixed bar covers the last ~70px of the viewport.
    var rect = btn.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 110
        && rect.top < window.innerHeight) {
      try {
        btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (e) {
        btn.scrollIntoView();
      }
    }
    var duration = Math.max(spanTo - spanFrom, 0.01);
    if (dockRange) {
      dockRange.min = 0;
      dockRange.max = duration;
      dockRange.step = 0.01;
      dockRange.value = 0;
      dockRange.style.setProperty('--p', '0%');
      dockRange.setAttribute('aria-valuetext',
        fmtTime(0) + ' / ' + fmtTime(duration));
    }
    if (dockTime) dockTime.textContent = fmtTime(0) + ' / ' + fmtTime(duration);
    syncWords(spanFrom);
    updateToggle();
    return true;
  }

  function seekTo(absolute, fromSlider) {
    if (!current) return;
    var duration = Math.max(spanTo - spanFrom, 0.01);
    var clamped = Math.min(Math.max(absolute, spanFrom), spanTo - 0.002);
    try { player.currentTime = clamped; } catch (e) {}
    if (fromSlider && dockRange) {
      var offset = Math.min(Math.max(clamped - spanFrom, 0), duration);
      dockRange.style.setProperty('--p', (offset / duration * 100) + '%');
      if (dockTime) {
        dockTime.textContent = fmtTime(offset) + ' / ' + fmtTime(duration);
      }
    }
    syncWords(clamped);
  }

  function pauseActive() {
    if (!current) return;
    try { player.pause(); } catch (e) {}
    stopTick();
    syncDock();
    updateToggle();
  }

  function resumeActive() {
    if (!current) return;
    if (player.currentTime < spanFrom - 0.05
        || player.currentTime >= spanTo - 0.02) {
      seekTo(spanFrom, false);
    }
    hideStatus();
    player.playbackRate = activeSpeed;
    var started = player.play();
    startTick(current);
    updateToggle();
    if (started && started.catch) {
      started.catch(function (err) {
        if (err && err.name === 'AbortError') return;
        if (current) audioFailed(current);
      });
    }
  }

  function startTick(btn) {
    stopTick();
    var step = function () {
      if (current !== btn) return false;
      if (player.currentTime >= spanTo - 0.008) {
        try { player.pause(); } catch (e) {}
        stopTick();
        syncDock();
        if (ktvStarts && ktvWords) {
          ktvIndex = -1;
          syncWords(spanTo);
        }
        var done = activeOnEnd;
        activeOnEnd = null;
        if (done) {
          done();
        } else if (!btn.classList.contains('ktv')) {
          unmark();
          hideDock();
        }
        updateToggle();
        return false;
      }
      syncDock();
      return true;
    };
    var frame = function () {
      if (!step()) return;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // rAF 会在页面被降频或遮挡时彻底停发（无头浏览器里实测能停 20 秒），
    // 那样句子播到结尾也不停、逐词也不亮。定时器兜底，两条路走同一个 step。
    tickTimer = setInterval(step, 200);
  }

  // 每页一整条音频：先跳到片段起点，等 seek 落地再播，播到终点就停。
  // 连点时 current 会变，旧的回调据此自动作废。
  function startSpan(btn, span) {
    var from = span[0];
    var stopAt = span[1];
    var retries = 0;
    try { player.pause(); } catch (e) {}
    stopTick();
    var play = function () {
      if (current !== btn) return;
      if (player.currentTime < from - 0.15) {
        // seek 没落地：宁可等数据，也不要从整条音频的开头播起。
        if (++retries > 3) { audioFailed(btn); return; }
        waitForData(btn, seek, from, 0);
        return;
      }
      hideStatus();
      player.playbackRate = activeSpeed;
      loadingBtn = null;
      var started = player.play();
      syncDock();
      startTick(btn);
      if (started && started.catch) {
        started.catch(function (err) {
          if (err && err.name === 'AbortError') return;
          if (current === btn) audioFailed(btn);
        });
      }
    };
    var seek = function () {
      if (current !== btn) return;
      if (Math.abs(player.currentTime - from) < 0.02) { play(); return; }
      var done = false;
      var onSeeked = function () {
        if (done) return;
        done = true;
        player.removeEventListener('seeked', onSeeked);
        if (current === btn) play();
      };
      player.addEventListener('seeked', onSeeked);
      try {
        player.currentTime = from;
      } catch (e) {
        player.removeEventListener('seeked', onSeeked);
        done = true;
        waitForData(btn, seek, from, 0);
        return;
      }
      // 个别浏览器 seek 后不派发 seeked，别把用户卡在原地。
      setTimeout(function () {
        if (done) return;
        done = true;
        player.removeEventListener('seeked', onSeeked);
        if (current === btn) play();
      }, 1500);
    };
    if (player.readyState < 1) {
      var onLoaded = function () {
        player.removeEventListener('loadedmetadata', onLoaded);
        seek();
      };
      player.addEventListener('loadedmetadata', onLoaded);
      try { player.load(); } catch (e) {}
    } else {
      seek();
    }
  }

  // Cloudflare Pages 的静态资源不支持 Range 请求（Range 被忽略，永远 200 整包），
  // 媒体元素在没有 Range 时连 seekable 都只有 [0,0]，点正文会被夹回开头播。
  // 所以先把整条 sprite 取进内存换成 blob 地址：seek 永远精确，离线包用
  // file:// 时 fetch 不可用，退回直接给媒体元素。
  function sourceFor(v) {
    if (SOURCES[v]) return SOURCES[v];
    var url = spriteUrlFor(v);
    if (!url) { SOURCES[v] = Promise.resolve(null); return SOURCES[v]; }
    var canFetch = location.protocol !== 'file:' && window.fetch
      && window.Promise && window.URL && URL.createObjectURL;
    if (!canFetch) {
      READY[v] = true;
      SOURCES[v] = Promise.resolve(url);
      return SOURCES[v];
    }
    SOURCES[v] = fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.blob();
    }).then(function (blob) {
      return URL.createObjectURL(blob);
    }).catch(function () {
      return url;
    }).then(function (src) {
      READY[v] = true;
      return src;
    });
    return SOURCES[v];
  }

  function begin(btn, onEnd) {
    var span = spanFor(btn);
    if (!span || !spriteUrlFor(voice)) {
      if (current === btn) {
        stopAudio();
      }
      showStatus('这一句暂无可用语音，请切换音色');
      return;
    }
    spanFrom = span[0];
    spanTo = span[1];
    loadingBtn = btn;
    activeOnEnd = onEnd || null;
    // A new sentence always starts at the page-wide default speed; the menu
    // in the player only overrides the sentence it was opened for.
    activeSpeed = speed;
    player.playbackRate = activeSpeed;
    updateDockSpeed();
    if (btn.classList.contains('ktv')) prepareDock(btn);
    var loading = null;
    if (!READY[voice]) {
      loading = setTimeout(function () { showStatus('语音加载中…', true); }, 300);
    }
    sourceFor(voice).then(function (src) {
      if (loading) clearTimeout(loading);
      if (current !== btn) return;
      if (!src) { audioFailed(btn); return; }
      if (loadedSrc !== src) {
        player.src = src;
        loadedSrc = src;
      }
      startSpan(btn, span);
    });
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
    unmark();
    if (!spanFor(btn)) { audioFailed(btn); return; }
    if (!btn.classList.contains('ktv')) {
      clearWords();
      hideDock();
    }
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
    var list = playlist;
    begin(btn, function () {
      if (playlist !== list) return;
      playItem(list.index + 1);
    });
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
    if (current === btn) {
      // Karaoke sentences pause and resume; short clips keep the old
      // tap-again-to-stop behavior.  While the sprite is still loading there
      // is nothing to pause, so a second tap cancels.
      if (loadingBtn === btn || !btn.classList.contains('ktv') || !dock) {
        stopAudio();
      } else if (player.paused) {
        resumeActive();
      } else {
        pauseActive();
      }
      return;
    }
    stopAudio();
    current = btn;
    btn.classList.add('playing');
    begin(btn, null);
  }

  player.addEventListener('error', function () {
    if (current) audioFailed(current);
  });
  player.addEventListener('play', updateToggle);
  player.addEventListener('pause', updateToggle);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) return;
    if (playlist) stopPlaylist(); else stopAudio();
  });

  function setVoice(next) {
    voice = next === 'm' ? 'm' : 'f';
    stopPlaylist();
    prefetch();
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

  function applyZhClasses() {
    document.documentElement.classList.toggle('zh-hide-vocab', !zh.vocab);
    document.documentElement.classList.toggle('zh-hide-body', !zh.body);
  }

  // The floating button follows the section crossing 35% of the viewport:
  // Key Vocabulary → 词汇, story → 正文, anything else (questions) → hidden.
  function zhSectionAt() {
    var probe = window.innerHeight * 0.35;
    for (var i = 0; i < zhSections.length; i++) {
      var el = zhSections[i].el;
      if (!el) continue;
      var rect = el.getBoundingClientRect();
      if (rect.top <= probe && rect.bottom >= probe) return zhSections[i].key;
    }
    return null;
  }

  function zhPaint(btn, key, on) {
    if (!btn || !key) return;
    var name = key === 'vocab' ? '词汇' : '正文';
    var state = on ? '开' : '关';
    var labelEl = btn.querySelector('[data-zh-label]');
    var stateEl = btn.querySelector('[data-zh-state]');
    // 滚动时每帧都会走到这里，没变就别碰 DOM。
    if (labelEl && labelEl.textContent !== name) labelEl.textContent = name;
    if (stateEl && stateEl.textContent !== state) stateEl.textContent = state;
    var pressed = on ? 'true' : 'false';
    if (btn.getAttribute('aria-pressed') !== pressed) {
      btn.setAttribute('aria-pressed', pressed);
    }
    var aria = name + '中文' + state;
    if (btn.getAttribute('aria-label') !== aria) {
      btn.setAttribute('aria-label', aria);
    }
    btn.classList.toggle('is-off', !on);
  }

  // 三颗按钮状态一致；浮钮只在接管时露脸，露脸前先画好，避免换字闪一下。
  function zhRefresh() {
    for (var i = 0; i < zhSections.length; i++) {
      var sec = zhSections[i];
      zhPaint(sec.btn, sec.key, !!zh[sec.key]);
    }
    if (zhActive) zhPaint(zhFloatBtn, zhActive, !!zh[zhActive]);
  }

  // 浮钮顶边与滚动无关，初始化/改窗口大小时量一次即可。临时露出来量，
  // 免得把 12px 写死——带刘海（safe-area-inset-top）时它不是 12。
  function zhMeasureSlot() {
    if (!zhFloat) return;
    var wasHidden = zhFloat.hidden;
    if (wasHidden) zhFloat.hidden = false;
    var el = zhFloatBtn || zhFloat;
    zhSlotTop = el.getBoundingClientRect().top;
    if (wasHidden) zhFloat.hidden = true;
  }

  function zhShowInline(btn) {
    if (zhHiddenBtn && zhHiddenBtn !== btn) {
      zhHiddenBtn.style.visibility = '';
      zhHiddenBtn = null;
    }
  }

  function updateZhButton() {
    var key = zhSectionAt();
    zhActive = key;
    var sec = null;
    for (var i = 0; i < zhSections.length; i++) {
      if (zhSections[i].key === key) sec = zhSections[i];
    }
    if (!zhFloat || !sec || !sec.btn) {
      zhShowInline(null);
      if (zhFloat) zhFloat.hidden = true;
      return;
    }
    if (zhSlotTop === null) zhMeasureSlot();
    // 板块标题行里的按钮滚到浮钮那颗位置之前，控制权在它手上；一旦顶边
    // 越过浮钮顶边，就用浮钮原地接管——先把板块内按钮藏起来（visibility
    // 不改变布局），两颗按钮的矩形完全重合，所以看起来是原地吸附。
    if (sec.btn.getBoundingClientRect().top > zhSlotTop) {
      zhShowInline(null);
      if (!zhFloat.hidden) zhFloat.hidden = true;
      return;
    }
    zhShowInline(sec.btn);
    zhPaint(zhFloatBtn, key, !!zh[key]);
    zhFloat.hidden = false;
    if (zhHiddenBtn !== sec.btn) {
      if (document.activeElement === sec.btn) sec.btn.blur();
      sec.btn.style.visibility = 'hidden';
      zhHiddenBtn = sec.btn;
    }
  }

  var zhFrame = 0;
  function scheduleZhButton() {
    if (zhFrame) return;
    zhFrame = requestAnimationFrame(function () {
      zhFrame = 0;
      updateZhButton();
    });
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

  function toggleZh(key) {
    if (!key) return;
    zh[key] = !zh[key];
    applyZhClasses();
    try { localStorage.setItem(ZH_KEY, JSON.stringify(zh)); } catch (e) {}
    zhRefresh();
    // 藏/显中文会改变页面高度，板块边界跟着动；下一帧重新判断一次就好。
    scheduleZhButton();
  }

  applyZhClasses();
  zhMeasureSlot();
  zhRefresh();
  updateZhButton();
  for (var zb = 0; zb < zhSections.length; zb++) {
    (function (sec) {
      if (!sec.btn) return;
      sec.btn.addEventListener('click', function () { toggleZh(sec.key); });
    })(zhSections[zb]);
  }
  if (zhFloatBtn) {
    zhFloatBtn.addEventListener('click', function () { toggleZh(zhActive); });
  }
  if (zhFloat) {
    window.addEventListener('scroll', scheduleZhButton, { passive: true });
    // 刷新后浏览器恢复滚动位置时，首帧可能还是 0 处的判断，补一次。
    window.addEventListener('load', scheduleZhButton);
    window.addEventListener('resize', function () {
      zhSlotTop = null;          // 宽度/安全区变了，顶边重新量
      scheduleZhButton();
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

  if (dockToggle) {
    dockToggle.addEventListener('click', function () {
      if (!current) return;
      if (player.paused) resumeActive(); else pauseActive();
    });
  }
  if (dockClose) {
    dockClose.addEventListener('click', function () {
      if (playlist) stopPlaylist(); else stopAudio();
    });
  }
  if (dockSpeed && speedMenu) {
    dockSpeed.addEventListener('click', function (event) {
      event.stopPropagation();
      var open = speedMenu.hidden;
      speedMenu.hidden = !open;
      dockSpeed.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open) return;
      var checked = speedMenu.querySelector('[aria-checked="true"]');
      if (checked) checked.focus();
    });
    for (var si = 0; si < speedOptions.length; si++) {
      speedOptions[si].addEventListener('click', function (event) {
        setActiveSpeed(parseFloat(event.currentTarget.getAttribute('data-kp-rate')));
        closeSpeedMenu();
        dockSpeed.focus();
      });
    }
    document.addEventListener('click', function (event) {
      if (speedMenu.hidden) return;
      if (speedWrap && speedWrap.contains(event.target)) return;
      closeSpeedMenu();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || speedMenu.hidden) return;
      closeSpeedMenu();
      dockSpeed.focus();
    });
  }
  if (dockRange) {
    dockRange.addEventListener('pointerdown', function () { seeking = true; });
    dockRange.addEventListener('input', function () {
      seeking = true;
      seekTo(spanFrom + parseFloat(dockRange.value), true);
    });
    dockRange.addEventListener('change', function () {
      seeking = false;
      seekTo(spanFrom + parseFloat(dockRange.value), true);
    });
    window.addEventListener('pointerup', function () { seeking = false; });
  }

  // 点读是这一页的主动作：页面空闲时先把当前音色的 sprite 取进内存，
  // 点下去就能出声（只在联网时预取；离线包走 file://，媒体元素直接读本地文件）。
  function prefetch() {
    if (navigator.connection && navigator.connection.saveData) return;
    sourceFor(voice);
  }
  if (window.requestIdleCallback) {
    requestIdleCallback(prefetch, { timeout: 2500 });
  } else {
    setTimeout(prefetch, 1500);
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


def head(title: str, prefix: str, css: str, lang: str = "zh-CN",
         audio_base: str = "") -> str:
    theme_head = THEME_HEAD.replace("__PREFIX__", prefix)
    # 音频在独立域名上：提前建连，第一次点读就少一次 DNS+TLS 往返。
    preconnect = ""
    if audio_base.startswith("http"):
        origin = audio_base.split("/audio/")[0]
        preconnect = (f'<link rel="preconnect" href="{origin}" crossorigin>'
                      + chr(10))
    return f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(title)}</title>
<link rel="icon" type="image/png" sizes="512x512" href="{prefix}npesl-icon.png">
<link rel="apple-touch-icon" href="{prefix}apple-touch-icon.png">
{preconnect}{theme_head}
<style>{BASE_CSS}{css}</style>
</head>
<body>
<main class="page">
"""


def tail(prefix: str, audio_base: str = AUDIO_BASE,
         sprites: dict | None = None, words: dict | None = None) -> str:
    sprite_block = ""
    if sprites:
        sprite_block = (
            '<script id="spriteMap" type="application/json">'
            + json.dumps(sprites, separators=(",", ":"))
            + "</script>\n"
        )
    word_block = ""
    if words and any(words.values()):
        word_block = (
            '<script id="wordMap" type="application/json">'
            + json.dumps(words, separators=(",", ":"))
            + "</script>\n"
        )
    return f"""</main>
{sprite_block}{word_block}<script src="{prefix}theme.js" defer></script>
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
            f'<a class="level" href="{prefix}{lv.lower()}/"{current_attr}>'
            f'{lv}<span class="cn">{cn}</span></a>'
        )
    return '<nav class="levels">' + "".join(links) + "</nav>\n"


def level_title(lv: str) -> str:
    en, cn = LEVEL_LABEL[lv]
    if en == lv:
        return en
    return f"{lv} · {en}"


def audio_base_for(level: str) -> str:
    return AUDIO_BASE_OVERRIDE or AUDIO_BASE


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
            f'<a class="row" href="{lv.lower()}/">'
            f'<span class="num">{num}</span>'
            f'<span class="t">{label}</span>'
            '<span class="arrow">›</span></a>'
        )
    body = (
        head("Conversation Starters", "../", "")
        + back("../", "NPESL")
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
                f'<a class="row" href="{slug}">'
                f'<span class="num">{si:02d}</span>'
                f'<span class="t">{html.escape(story["title"])}</span>'
                '<span class="arrow">›</span></a>'
            )
        sections.append(
            f'<section class="unit"><h2>{html.escape(unit["title"])}</h2>'
            '<nav class="stories">' + "".join(rows) + "</nav></section>\n"
        )
    body = (
        head(f"Conversation Starters · {level}", "../../", "",
             audio_base=audio_base_for(level))
        + back("../", "Conversation Starters")
        + f'<h1>{level_title(level)}</h1>\n'
        + level_pills(level, "../")
        + "".join(sections)
        + tail("../../", audio_base_for(level))
    )
    return body


class PageAudio:
    """Serves each playable element its (start, end) inside the page sprite.

    按页面渲染顺序逐个弹出；顺序必须和 build_page_sprite 里拼进去的顺序一致。
    """

    def __init__(self, items: list[dict]):
        self.items = items
        self.index = 0

    def attrs(self, ktv: bool = False) -> tuple:
        """Return (attribute string, whether this element has word timings)."""
        index = self.index
        item = self.items[index] if index < len(self.items) else {}
        self.index += 1
        parts = []
        for voice in VOICES:
            short = voice["short"]
            span = item.get(short)
            if span:
                parts.append(
                    f'data-start-{short}="{span[0]:.3f}" '
                    f'data-end-{short}="{span[1]:.3f}"'
                )
        has_words = bool(ktv and item.get("words"))
        if has_words:
            parts.append(f'data-wi="{index}"')
        return ((" " + " ".join(parts)) if parts else ""), has_words


def page_texts(story: dict) -> list[str]:
    """Playable texts in the order make_story consumes them (= page DOM order)."""
    texts: list[str] = [story["title"]]
    texts.extend(story["vocab"])
    for para in story["text"]:
        texts.extend(split_sentences(para))
    texts.extend(story["comp"])
    texts.extend(story["conv"])
    return texts


def build_page_sprite(level: str, story: dict, audio_maps: dict,
                      out: Path, voices: list) -> tuple[PageAudio, dict, dict]:
    """One sprite per voice for this page.

    Returns the span cursor, the sprite URLs, and absolute word starts in
    sprite time: ``{"f": {"<text index>": [start, ...]}, "m": {...}}``.
    """
    texts = page_texts(story)
    items: list[dict] = [dict() for _ in texts]
    names: dict[str, str] = {}
    wordmap: dict[str, dict] = {voice["short"]: {} for voice in voices}
    dest_root = out / "audio"
    for voice in voices:
        key = voice["key"]
        hashes = audio_maps.get(key, set())
        picks = []
        for index, text in enumerate(texts):
            h = clip_hash(text)
            if h not in hashes:
                continue
            path = CACHE / voice["dir"] / h[:2] / f"{h}.mp3"
            if path.exists():
                picks.append((index, h, path.read_bytes()))
        if not picks:
            continue
        blob, spans = audio_sprite.concat([item[2] for item in picks])
        # Sprite names include the audio digest: re-synthesizing a clip changes
        # its bytes (Edge is not deterministic), so a text-only name would let
        # a long-cached old sprite pair with new span offsets.
        name = audio_sprite.name_for([
            f"{h}:{voice['dir']}:{hashlib.sha1(data).hexdigest()[:10]}"
            for _, h, data in picks
        ])
        rel = f"sprites/{name}.mp3"
        dst = dest_root / voice["dir"] / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(blob)
        names[voice["short"]] = rel
        for (index, h, data), span in zip(picks, spans):
            short = voice["short"]
            items[index][short] = span
            mp3 = CACHE / voice["dir"] / h[:2] / f"{h}.mp3"
            starts = load_word_starts(texts[index], mp3, data)
            if starts:
                absolute = [round(span[0] + value, 3) for value in starts]
                items[index].setdefault("words", {})[short] = absolute
                wordmap[short][str(index)] = absolute
    return PageAudio(items), names, wordmap


def sentence_html(text: str, audio: PageAudio, extra_class: str = "",
                  label: str = "", ktv: bool = False) -> str:
    attrs, has_words = audio.attrs(ktv=ktv)
    marked = pron.annotate(text, thought_groups=False, wrap_words=has_words)
    safe = html.escape(text, quote=True)
    classes = "s" + (f" {extra_class}" if extra_class else "")
    if has_words:
        classes += " ktv"
    aria = label or safe
    return (
        f'<button type="button" class="{classes}"'
        f'{attrs}'
        f' data-text="{safe}" aria-label="{aria}">{marked}</button>'
    )


def zh_button(target: str, label: str) -> str:
    """中 / 词汇|正文 / 开|关 药丸。

    ``target`` 为 ``float``（右上角那颗）或 ``vocab`` / ``body``（板块标题行
    里的两颗）。板块内按钮用 data-zh-for 定位，浮钮沿用 data-zh-toggle。
    """
    hook = " data-zh-toggle" if target == "float" else f' data-zh-for="{target}"'
    return (
        f'<button type="button" class="zh-toggle"{hook} '
        f'aria-pressed="true" aria-label="{label}中文开">'
        '<span class="zh-icon">中</span>'
        f'<span data-zh-label>{label}</span>'
        '<span class="zh-state" data-zh-state>开</span>'
        '</button>'
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
        '<div class="kplayer" data-kplayer role="region" aria-label="句子播放器" hidden>'
        '<button type="button" class="kp-toggle" data-kp-toggle '
        'aria-pressed="false" aria-label="播放">'
        '<svg class="kp-play" viewBox="0 0 24 24" aria-hidden="true">'
        '<path d="M8 5v14l11-7z"/></svg>'
        '<svg class="kp-pause" viewBox="0 0 24 24" aria-hidden="true">'
        '<rect x="7" y="5" width="3.5" height="14" rx="1"/>'
        '<rect x="13.5" y="5" width="3.5" height="14" rx="1"/></svg>'
        '</button>'
        '<div class="kp-body">'
        '<input type="range" class="kp-range" min="0" max="1" step="0.01" '
        'value="0" data-kp-range aria-label="句子进度">'
        '<span class="kp-time" data-kp-time>0:00 / 0:00</span>'
        '</div>'
        '<div class="kp-speed-wrap">'
        '<button type="button" class="kp-speed" data-kp-speed '
        'aria-haspopup="menu" aria-expanded="false" aria-label="语速">'
        '<span data-kp-speed-label>0.9×</span>'
        '<svg class="kp-caret" viewBox="0 0 24 24" aria-hidden="true">'
        '<path d="M6 9l6 6 6-6"/></svg></button>'
        '<div class="kp-speed-menu" data-kp-speed-menu role="menu" '
        'aria-label="选择本句语速" hidden>'
        '<button type="button" role="menuitemradio" aria-checked="false" '
        'data-kp-rate="0.7">0.7×</button>'
        '<button type="button" role="menuitemradio" aria-checked="false" '
        'data-kp-rate="0.8">0.8×</button>'
        '<button type="button" role="menuitemradio" aria-checked="true" '
        'data-kp-rate="0.9">0.9×</button>'
        '<button type="button" role="menuitemradio" aria-checked="false" '
        'data-kp-rate="1.0">1.0×</button>'
        '<button type="button" role="menuitemradio" aria-checked="false" '
        'data-kp-rate="1.1">1.1×</button>'
        '<button type="button" role="menuitemradio" aria-checked="false" '
        'data-kp-rate="1.25">1.25×</button>'
        '<button type="button" role="menuitemradio" aria-checked="false" '
        'data-kp-rate="1.5">1.5×</button>'
        '</div>'
        '</div>'
        '<button type="button" class="kp-close" data-kp-close '
        'aria-label="关闭播放器">✕</button>'
        '</div>\n'
        '<div class="zh-float" data-zh-float hidden>'
        + zh_button("float", "词汇")
        + '</div>\n'
    )


SPEAKER_SVG = (
    '<svg class="spk" viewBox="0 0 24 24" width="17" height="17" fill="none" '
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" '
    'stroke-linejoin="round" aria-hidden="true">'
    '<path d="M4 9v6h4l5 4V5L8 9H4z"/>'
    '<path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>'
)


def make_story(level: str, unit: dict, ui: int, story: dict, si: int,
               audio_maps: dict, zh: dict, vocab_zh: dict,
               out: Path, voices: list) -> str:
    en, cn = LEVEL_LABEL[level]
    key = f"{ui:02d}-{si:02d}-{slugify(story['title'])}"
    audio, sprites, wordmap = build_page_sprite(
        level, story, audio_maps, out, voices)
    zh_entry = zh.get(key, {})
    zh_paras = zh_entry.get("paras", [])
    glosses = vocab_zh.get(key, [])

    # 渲染顺序要和页面 DOM 一致（标题 → 词汇 → 正文 → 问答），
    # 这样 sprite 里的片段顺序就是页面顺序，点标题不用跳到文件末尾。
    title_marked = html.escape(story["title"])
    title_safe = html.escape(story["title"], quote=True)
    title_attrs, _ = audio.attrs()
    title = (
        f'<h1><button type="button" class="s title-s"'
        f'{title_attrs}'
        f' data-text="{title_safe}" aria-label="朗读标题 {title_safe}">'
        f'{title_marked}{SPEAKER_SVG}</button></h1>\n'
    )
    if zh_entry.get("title"):
        title += (
            '<p class="zh-title" lang="zh-CN">'
            + html.escape(zh_entry["title"])
            + "</p>\n"
        )

    vocab_items = []
    for index, term in enumerate(story["vocab"]):
        item = sentence_html(
            term, audio, "vocab-s", label=f"朗读 {html.escape(term, quote=True)}"
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
                + " ".join(sentence_html(s, audio, ktv=True) for s in sents)
                + '</p><p class="zh" lang="zh-CN">'
                + html.escape(zh_para)
                + "</p></div>"
            )
            paragraphs.append(block)
            continue
        blocks = []
        for sent, zh_sent in zip(sents, zh_sents or [""] * len(sents)):
            inner = sentence_html(sent, audio, ktv=True)
            if zh_sent:
                inner += (
                    '<span class="zh" lang="zh-CN">'
                    + html.escape(zh_sent)
                    + "</span>"
                )
            blocks.append('<div class="sent">' + inner + "</div>")
        # 没有中文时上面的循环已经产出同样的结构，不要再渲染一遍
        # （sentence_html 会按顺序消耗 sprite 片段，重复调用会错位）。
        paragraphs.append('<div class="para">' + "".join(blocks) + "</div>")

    def qlist(items):
        return "<ol class=\"qlist\">" + "".join(
            f"<li>{sentence_html(q, audio)}</li>" for q in items
        ) + "</ol>"

    body = (
        head(f"{story['title']} · {level} · Conversation Starters", "../../",
             STORY_CSS, "en", audio_base=audio_base_for(level))
        + back("../", f"{level} {cn}".strip())
        + f'<p class="unit-label">{html.escape(unit["title"])}</p>\n'
        + title
        + toolbar_html()
        + '<div class="sec-head">'
        '<h2>Key Vocabulary &amp; Expressions</h2>'
        + zh_button("vocab", "词汇") + '</div>'
        '<section class="content-card vocab-card">'
        f'<div class="vocab">{vocab}</div></section>\n'
        + '<div class="sec-head"><h2>The Conversation</h2>'
        + zh_button("body", "正文") + '</div>'
        + '<section class="content-card"><div class="story">'
        + "".join(paragraphs) + "</div></section>\n"
        + '<div class="sec-head"><h2>Comprehension Questions</h2></div>'
        '<section class="content-card qs">'
        + qlist(story["comp"]) + "</section>\n"
        + '<div class="sec-head"><h2>Conversation Starters</h2></div>'
        '<section class="content-card qs">'
        + qlist(story["conv"]) + "</section>\n"
        + tail("../../", audio_base_for(level), sprites, wordmap)
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
    parser.add_argument("--audio-base", default=None,
                        help="覆盖页面里的音频地址（本地预览用，如 /audio/）")
    args = parser.parse_args()
    global AUDIO_BASE_OVERRIDE
    AUDIO_BASE_OVERRIDE = args.audio_base

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
        timed = story_sentences(data, active_audio)
        print(f"逐词时间：正文 {len(timed)} 句需要 sidecar")
        generate(voices, audio_texts, args.jobs, timed)

    # 站点目录
    out = Path(args.out).expanduser().resolve()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    # 页面只引用每页一个 sprite，这里不再逐条搬剪辑；sprite 由
    # build_page_sprite 从 TTS 缓存直接拼出来。
    audio_maps = {v["key"]: set() for v in voices}
    for voice in voices:
        cache_dir = CACHE / voice["dir"]
        if cache_dir.exists():
            audio_maps[voice["key"]] = {p.stem for p in cache_dir.rglob("*.mp3")}

    # 页面
    write(out / "index.html", make_index())
    stories = 0
    for lv in page_levels:
        units = data[lv]
        write(out / lv.lower() / "index.html", make_level(lv, units))
        for ui, unit in enumerate(units, 1):
            for si, story in enumerate(unit["stories"], 1):
                slug = f"{ui:02d}-{si:02d}-{slugify(story['title'])}"
                write(out / lv.lower() / f"{slug}.html",
                      make_story(lv, unit, ui, story, si, audio_maps,
                                 zh_data.get(lv, {}), vocab_data.get(lv, {}),
                                 out, voices))
                stories += 1

    sprites = len(list(out.rglob("sprites/*.mp3")))

    pages = 1 + len(page_levels) + stories
    size = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    print(f"页面 {pages} 个（{len(page_levels)} 级 / {stories} 篇）")
    print(f"音频 {sprites} 个 sprite（{'+'.join(v['dir'] for v in voices)}）")
    print(f"输出：{out}，共 {size / 1024 / 1024:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
