# -*- coding: utf-8 -*-
"""Build the phrasal-verb app: one page per theme, one sprite per page.

Source of truth is content/phrasal/ — themes.json plus one <theme>.json per
theme. Clips are content-addressed, so re-running only synthesizes what is
new; pages never reference master clips, only the concatenated sprite.

    python -I apps/phrasal/source/build.py
    python -I apps/phrasal/source/build.py --only getting-around --skip-audio
"""

import argparse
import asyncio
import hashlib
import html
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
CONTENT = ROOT / "content" / "phrasal"
BASE = ROOT / "apps" / "phrasal"
AUDIO_DIR = BASE / "audio"

sys.path.insert(0, str(ROOT / "tools"))
import audio_sprite  # noqa: E402

import edge_tts  # noqa: E402

import azure_speech  # noqa: E402

VOICES = {
    "f": {"tts": "en-US-AvaNeural", "label": "女声"},
    "m": {"tts": "en-US-AndrewNeural", "label": "男声"},
}
RATE = "+0%"

REGISTER_ZH = {"spoken": "口语", "neutral": "中性", "written": "书面"}


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def clip_rel(text, voice, rate=RATE):
    text = " ".join(text.split())
    if not text:
        return ""
    key = f"{text}|{voice}|{rate}"
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
    return f"{voice}/{digest[:2]}/{digest}.mp3"


def load_themes():
    doc = json.loads((CONTENT / "themes.json").read_text(encoding="utf-8"))
    themes = doc["themes"]
    for theme in themes:
        path = CONTENT / f"{theme['id']}.json"
        if path.exists():
            theme["entries"] = json.loads(
                path.read_text(encoding="utf-8")).get("entries", [])
        else:
            theme["entries"] = []
    return themes


def entry_texts(entry):
    """Every spoken string for one entry, in reading order."""
    texts = [entry["head"]]
    for sense in entry.get("senses", []):
        en = (sense.get("example") or {}).get("en", "").strip()
        if en:
            texts.append(en)
    return texts


def chapter_jobs(chapter):
    jobs = []
    for entry in chapter["entries"]:
        for text in entry_texts(entry):
            for voice in VOICES:
                rel = clip_rel(text, voice)
                if rel:
                    jobs.append((rel, text, voice))
    return jobs


async def synthesize(text, voice, semaphore):
    async with semaphore:
        last = None
        for attempt in range(5):
            try:
                communicate = edge_tts.Communicate(text, VOICES[voice]["tts"], rate=RATE)
                audio = bytearray()
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        audio.extend(chunk["data"])
                if not audio:
                    raise RuntimeError("empty audio")
                return bytes(audio)
            except Exception as error:  # noqa: BLE001 - retry then surface
                last = error
                await asyncio.sleep(2 * (attempt + 1))
        raise last


# 本地后端：模型和依赖在各自的 venv 里，构建脚本只负责投喂清单。
SIDECAR = {
    "kokoro": (pathlib.Path(os.environ.get(
        "KOKORO_PYTHON",
        ROOT / "build" / "tts-local" / "venv" / "Scripts" / "python.exe")),
        "kokoro_worker.py"),
    "qwen": (pathlib.Path(os.environ.get(
        "QWEN_PYTHON", r"F:\AIProject\tts-lab\.venv\Scripts\python.exe")),
        "qwen_worker.py"),
}


def sidecar_synth(missing, backend):
    """整批交给本地 venv 一次合成，模型只加载一次。"""
    python, worker = SIDECAR[backend]
    manifest = ROOT / "build" / "tts-local" / f"jobs-{backend}.json"
    manifest.parent.mkdir(parents=True, exist_ok=True)
    payload = [{"out": str(AUDIO_DIR / rel), "text": text, "voice": voice}
               for rel, text, voice in missing]
    manifest.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    worker_path = pathlib.Path(__file__).parent / worker
    subprocess.run([str(python), str(worker_path), str(manifest)], check=True)
    return [rel for rel, _, _ in missing if not (AUDIO_DIR / rel).exists()]


async def ensure_clips(themes, backend="azure"):
    wanted = {}
    for theme in themes:
        for rel, text, voice in chapter_jobs(theme):
            wanted[rel] = (text, voice)
    missing = [(rel, text, voice) for rel, (text, voice) in wanted.items()
               if not (AUDIO_DIR / rel).exists()]
    print(f"audio: {len(wanted)} clips, {len(missing)} to synthesize ({backend})")
    if not missing:
        return []
    if backend in SIDECAR:
        failed = await asyncio.to_thread(sidecar_synth, missing, backend)
        print(f"audio: {'done' if not failed else f'{len(failed)} failed'}")
        return failed
    semaphore = asyncio.Semaphore(8)
    done = 0

    async def one(rel, text, voice):
        nonlocal done
        path = AUDIO_DIR / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        if backend == "azure":
            data = await asyncio.to_thread(
                azure_speech.synthesize, text, VOICES[voice]["tts"], RATE)
        else:
            data = await synthesize(text, voice, semaphore)
        path.write_bytes(data)
        done += 1
        if done % 20 == 0 or done == len(missing):
            print(f"audio: {done}/{len(missing)}", flush=True)

    results = await asyncio.gather(
        *(one(*job) for job in missing), return_exceptions=True)
    failed = [job[0] for job, result in zip(missing, results)
              if isinstance(result, Exception)]
    if failed:
        print(f"audio: {len(failed)} failed: {failed[:5]}")
    else:
        print("audio: done")
    return failed


class ClipPlan:
    """Pass one: record which clips each playable element needs."""

    def __init__(self):
        self.items = []

    def attrs(self, text):
        self.items.append({v: clip_rel(text, v) for v in VOICES})
        return ""


class ClipCursor:
    """Pass two: hand out (start, end) offsets in the same order."""

    def __init__(self, spans):
        self.spans = spans
        self.index = 0

    def attrs(self, text):
        item = self.spans[self.index] if self.index < len(self.spans) else {}
        self.index += 1
        parts = []
        for voice, span in item.items():
            if span:
                parts.append(f'data-start-{voice}="{span[0]:.3f}" '
                             f'data-end-{voice}="{span[1]:.3f}"')
        return " ".join(parts)


def build_sprites(plan):
    spans = [dict() for _ in plan.items]
    urls = {}
    for voice in VOICES:
        picks = []
        for index, item in enumerate(plan.items):
            rel = item.get(voice)
            if not rel:
                continue
            path = AUDIO_DIR / rel
            if path.exists():
                picks.append((index, rel.replace("\\", "/"), path.read_bytes()))
        if not picks:
            continue
        blob, offsets = audio_sprite.concat([chunk for _, _, chunk in picks])
        # 名字带音频摘要：重录同一文本会改变字节，纯文本哈希的名字会让
        # immutable 缓存继续发旧录音。
        name = audio_sprite.name_for([
            f"{rel}:{hashlib.sha1(data).hexdigest()[:10]}"
            for _, rel, data in picks
        ])
        rel = f"sprites/{name}.mp3"
        dst = AUDIO_DIR / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(blob)
        urls[voice] = rel
        for (index, _, _), span in zip(picks, offsets):
            spans[index][voice] = span
    return ClipCursor(spans), urls


def entry_html(entry, audio):
    badges = [f'<span class="badge reg">{REGISTER_ZH[entry["register"]]}</span>']
    if entry.get("separable"):
        badges.append('<span class="badge split">可分</span>')

    head = (
        f'<button class="head say" type="button" {audio.attrs(entry["head"])}>'
        f'<span class="w">{html.escape(entry["head"])}</span>'
        f'<span class="ipa">/{html.escape(entry["ipa"])}/</span>'
        '<span class="play" aria-hidden="true">▶</span></button>'
    )

    senses = []
    for sense in entry.get("senses", []):
        example = sense.get("example") or {}
        en = example.get("en", "")
        senses.append(
            '<div class="sense">'
            f'<p class="sense-zh">{html.escape(sense.get("zh", ""))}</p>'
            f'<button class="ex say" type="button" {audio.attrs(en)}>'
            f'<span class="txt">{html.escape(en)}</span>'
            f'<span class="zh">{html.escape(example.get("zh", ""))}</span></button>'
            '</div>'
        )

    extra = []
    if entry.get("l1_note"):
        extra.append(f'<p class="l1"><b>中文易错</b>{html.escape(entry["l1_note"])}</p>')
    if entry.get("collocations"):
        extra.append('<p class="colloc"><b>搭配</b>'
                     + html.escape(" · ".join(entry["collocations"])) + "</p>")
    if entry.get("confusables"):
        extra.append('<p class="confuse"><b>易混</b>'
                     + html.escape(" · ".join(entry["confusables"])) + "</p>")
    details = ('<div class="note-card">' + "".join(extra) + "</div>") if extra else ""

    chips = f' data-chip="{html.escape(entry["chip"])}"'
    return (
        f'<article class="entry" id="{html.escape(entry["id"])}"'
        f' data-particle="{html.escape(entry["particle"])}"{chips}>'
        f'<header class="entry-head">{head}<span class="badges">{"".join(badges)}</span></header>'
        f'<p class="zh-line">{html.escape(entry["zh"])}</p>'
        f'<div class="senses">{"".join(senses)}</div>'
        f'{details}</article>'
    )


def build_page(chapter, number, total):
    template = (BASE / "source" / "template.html").read_text(encoding="utf-8")
    plan = ClipPlan()
    for entry in chapter["entries"]:
        for text in entry_texts(entry):
            plan.attrs(text)
    audio, sprites = build_sprites(plan)

    categories = {c["id"]: c for c in json.loads(
        (CONTENT / "themes.json").read_text(encoding="utf-8")).get("categories", [])}
    cat = categories.get(chapter.get("category"), {})

    rows = "\n      ".join(entry_html(entry, audio) for entry in chapter["entries"])
    page = template
    page = page.replace("__CATEGORY_ID__", html.escape(chapter.get("category", "")))
    page = page.replace("__CATEGORY_ZH__", html.escape(cat.get("title_zh", "短语动词")))
    page = page.replace("__NUM__", f"{number:02d}")
    page = page.replace("__TITLE_EN__", html.escape(chapter["title_en"]))
    page = page.replace("__TITLE_ZH__", html.escape(chapter["title_zh"]))
    page = page.replace("__INTRO__", html.escape(chapter["intro_zh"]))
    page = page.replace("__COUNT__", str(len(chapter["entries"])))
    page = page.replace("__TOTAL__", str(total))
    page = page.replace("<!--ENTRIES-->", rows)
    page = page.replace(
        "<!--SPRITES-->",
        '<script id="spriteMap" type="application/json">'
        + json.dumps(sprites, separators=(",", ":")) + "</script>",
    )
    name = f"{number:02d}-{slug(chapter['title_en'])}.html"
    out = BASE / name
    out.write_text(page, encoding="utf-8")
    print(f"built {name} ({len(chapter['entries'])} entries, "
          f"{out.stat().st_size / 1024:.0f} KB)")
    return name


INDEX_STYLE = """
  :root {
    --bg:#ffffff; --fg:#1d1d1f; --muted:#6e6e73; --rule:#e5e5ea;
    --surface:#f5f5f7;
    --accent:var(--blue, #0071e3); --tint:var(--blue-tint, #e8f2ff);
    --on-accent:var(--on-blue, #ffffff);
    --font:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable",
      "Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
    color-scheme:light;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#000000; --fg:#f5f5f7; --muted:#98989d; --rule:#2c2c2e;
      --surface:#1c1c1e;
      --accent:var(--blue, #0a84ff); --tint:var(--blue-tint, #0d2a45);
      color-scheme:dark; }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font-family:var(--font);
    -webkit-font-smoothing:antialiased; }
  .page { max-width:760px; margin:0 auto;
    padding:clamp(40px,7vh,72px) 24px 96px; }
  h1 { margin:0; font-size:clamp(2rem,6vw,2.8rem); font-weight:700;
    letter-spacing:-0.03em; line-height:1.08; }
  .sub { margin:10px 0 0; color:var(--muted); font-size:16px; }
  .sub a { color:var(--accent); text-decoration:none; }
  .crumbs { margin:0 0 10px; color:var(--muted); font-size:13px; }
  .crumbs a { color:var(--muted); text-decoration:none; }
  .crumbs a:hover { color:var(--accent); }
  .level1 { display:flex; gap:8px; margin:18px 0 10px; }
  .level1 button { appearance:none; font:inherit; font-size:14px; padding:8px 16px;
    border:1px solid var(--rule); border-radius:999px; background:transparent;
    color:var(--fg); cursor:pointer; }
  .level1 button:hover { background:var(--surface); }
  .level1 button[aria-pressed="true"] { background:var(--accent);
    border-color:var(--accent); color:var(--on-accent); }
  .hint { margin:14px 0 0; color:var(--muted); font-size:14px; }
  .group .theme { margin:24px 0 6px; font-size:16px; font-weight:600; }
  .group .theme a { color:var(--fg); text-decoration:none; }
  .group .theme a:hover { color:var(--accent); }
  .theme-go { float:right; font-size:12px; font-weight:400; color:var(--accent); }
  .chips { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0 0; }
  .chips button, .chips a { appearance:none; display:inline-block;
    font:inherit; font-size:14px; padding:7px 14px; line-height:1.2;
    border:1px solid var(--rule); border-radius:999px; background:transparent;
    color:var(--fg); text-decoration:none; cursor:pointer; }
  .chips button:hover, .chips a:hover { background:var(--surface); }
  .chips button[aria-pressed="true"] { background:var(--accent);
    border-color:var(--accent); color:var(--on-accent); }
  .voice-seg { display:inline-flex; margin:12px 0 0; border:1px solid var(--rule);
    border-radius:999px; overflow:hidden; }
  .voice-seg button { appearance:none; border:0; background:transparent;
    color:var(--fg); font:inherit; font-size:14px; padding:6px 14px; cursor:pointer; }
  .voice-seg button + button { border-left:1px solid var(--rule); }
  .voice-seg button[aria-pressed="true"] { background:var(--accent);
    color:var(--on-accent); }
  .prow { display:flex; align-items:baseline; gap:12px; width:100%;
    text-align:left; font:inherit; color:inherit; background:var(--bg);
    border:1px solid var(--rule); border-radius:14px; padding:12px 14px;
    cursor:pointer; }
  .prow:hover { background:var(--surface); }
  .prow .en { font-size:17px; font-weight:600; min-width:0; }
  .prow .zh { margin-left:auto; max-width:48%; text-align:right; color:var(--muted);
    font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .prow .arw { color:var(--muted); }
  .card { margin:8px 0 16px; padding:16px; border:1px solid var(--rule);
    border-radius:16px; background:var(--surface); }
  .card-head { display:flex; flex-wrap:wrap; align-items:baseline; gap:8px 12px; }
  .card .head { appearance:none; border:0; background:transparent; color:inherit;
    font:inherit; display:inline-flex; align-items:baseline; gap:8px;
    padding:0; cursor:pointer; white-space:normal; }
  .card .head .w { font-size:20px; font-weight:700; }
  .card .head .ipa { color:var(--muted); font-size:13px; }
  .card .head .play, .card .ex .play { font-size:0.65em; color:var(--muted); }
  .card .badges { display:inline-flex; gap:6px; }
  .badge { font-size:12px; padding:2px 8px; border-radius:999px;
    border:1px solid var(--rule); color:var(--muted); }
  .badge.reg { color:var(--accent); border-color:var(--accent); }
  .card .zh-line { margin:8px 0 0; color:var(--muted); font-size:14px; }
  .card .sense { margin-top:10px; }
  .card .sense-zh { margin:0 0 4px; font-size:13px; color:var(--muted); }
  .card .ex { display:block; width:100%; text-align:left; font:inherit;
    color:inherit; background:var(--bg); border:1px solid var(--rule);
    border-radius:12px; padding:10px 12px; cursor:pointer;
    white-space:normal; overflow-wrap:anywhere; }
  .card .ex:hover { background:var(--surface-strong, var(--surface)); }
  .card .ex .txt { display:block; font-size:16px; line-height:1.5; }
  .card .ex .zh { display:block; margin-top:3px; color:var(--muted); font-size:13px; }
  .card .note-card { margin-top:12px; padding:12px 14px; border-radius:12px;
    background:var(--surface-strong, var(--surface)); border:1px solid var(--rule);
    border-left:3px solid var(--accent); }
  .card .note-card p { margin:6px 0 0; font-size:13px; line-height:1.6; }
  .card .note-card p b { display:inline-block; margin-right:6px; font-size:12px;
    color:var(--accent); font-weight:600; }
  .say.on { background:var(--blue-tint, var(--surface)); }
  .back { display:inline-block; margin-bottom:14px; color:var(--muted);
    text-decoration:none; font-size:14px; }
  .back:hover { color:var(--accent); }
  .stage { margin:34px 0 4px; font-size:15px; font-weight:600;
    color:var(--fg); letter-spacing:0.02em; }
  .stage-en { font-weight:400; color:var(--muted); font-size:13px;
    letter-spacing:0.04em; }
  .list { display:flex; flex-direction:column; gap:14px; margin-top:12px; }
  .row { display:flex; align-items:baseline; gap:16px; padding:16px 18px;
    border:1px solid var(--rule); border-radius:var(--radius-card, 24px);
    background:var(--bg); text-decoration:none; color:inherit;
    transition:background-color .15s ease, box-shadow .15s ease,
      transform .15s ease; }
  .row:hover { background:var(--surface); transform:translateY(-1px);
    box-shadow:var(--shadow-card, 0 1px 2px rgba(0, 0, 0, 0.05),
      0 8px 24px rgba(0, 0, 0, 0.06)); }
  .row:active { transform:scale(0.995); }
  .num { width:26px; flex:none; color:var(--muted); font-size:13px;
    font-variant-numeric:tabular-nums; }
  .title { flex:1; min-width:0; }
  .en { display:block; font-size:18px; font-weight:600; letter-spacing:-0.01em; }
  .zh { display:block; margin-top:2px; font-size:15px; color:var(--muted); }
  .tag { flex:none; font-size:14px; color:var(--accent); font-weight:600;
    font-variant-numeric:tabular-nums; }
  @media (max-width:560px) { .tag { display:none; } .row { gap:12px; padding:16px 14px; } }
"""

PARTICLE_ORDER = ["up", "down", "out", "off", "on", "in"]
PARTICLE_EXTRA = ["through", "over", "back", "around", "into", "onto", "away",
                  "along", "by", "for", "with", "at", "ahead", "together",
                  "after", "apart", "across", "forward", "behind", "past",
                  "against", "about", "of", "aside", "under", "round", "from", "to"]
REAL_PARTICLES = set(PARTICLE_ORDER + PARTICLE_EXTRA)


def page_audio(path):
    """从已生成的章节页里取 sprite 地址和每个词条的时间轴。"""
    text = path.read_text(encoding="utf-8")
    match = re.search(r'<script id="spriteMap"[^>]*>(.*?)</script>', text, re.S)
    sprites = json.loads(match.group(1)) if match else {}
    spans = {}
    for block in re.findall(r'<article class="entry"[^>]*>.*?</article>', text, re.S):
        eid = re.search(r'id="([^"]+)"', block).group(1)
        items = []
        for button in re.findall(r'<button class="(?:head|ex) say"[^>]*>', block):
            def num(name):
                found = re.search(rf'data-{name}="([\d.]+)"', button)
                return float(found.group(1)) if found else None
            span = [num("start-f"), num("end-f"), num("start-m"), num("end-m")]
            items.append(span if None not in span else None)
        spans[eid] = items
    return sprites, spans


def index_data(themes):
    """整站数据一次写进 data.js（离线包用 file://，不能靠 fetch）。"""
    doc = json.loads((CONTENT / "themes.json").read_text(encoding="utf-8"))
    categories = doc.get("categories", [])
    numbers = {theme["id"]: index + 1 for index, theme in enumerate(themes)}

    entries = []
    index_of = {}
    theme_rows = {}
    for theme in themes:
        page = f"{numbers[theme['id']]:02d}-{slug(theme['title_en'])}"
        sprites, spans = page_audio(BASE / f"{page}.html")
        rows = []
        for entry in theme["entries"]:
            index_of[(theme["id"], entry["id"])] = len(entries)
            rows.append(len(entries))
            entries.append({
                "h": entry["head"], "zh": entry["zh"], "ipa": entry["ipa"],
                "reg": entry["register"], "sep": entry["separable"],
                "sen": [[s["zh"], s["example"]["en"], s["example"]["zh"]]
                        for s in entry["senses"]],
                "l1": entry.get("l1_note", ""),
                "coll": entry.get("collocations", []),
                "conf": entry.get("confusables", []),
                "sp": sprites, "au": spans.get(entry["id"], []),
            })
        theme_rows[theme["id"]] = rows

    scene = []
    for cat in categories:
        group = [t for t in themes if t.get("category") == cat["id"]]
        if not group:
            continue
        scene.append({
            "id": cat["id"], "zh": cat["title_zh"], "en": cat["title_en"],
            "themes": [{"zh": t["title_zh"], "en": t["title_en"],
                        "rows": theme_rows[t["id"]]} for t in group],
        })

    bucketed: dict[str, list] = {}
    others: list = []
    for theme in themes:
        for entry in theme["entries"]:
            idx = index_of[(theme["id"], entry["id"])]
            if entry["particle"] in REAL_PARTICLES:
                bucketed.setdefault(entry["particle"], []).append(idx)
            else:
                others.append(idx)
    keys = [x for x in PARTICLE_ORDER if x in bucketed]
    keys += [x for x in PARTICLE_EXTRA if x in bucketed]
    particle = [{"p": x, "rows": bucketed[x]} for x in keys]
    if others:
        particle.append({"p": "others", "label": "其他", "rows": others})

    return {"scene": scene, "particle": particle, "entries": entries}


def build_index(themes):
    data = index_data(themes)
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    digest = hashlib.sha1(payload.encode("utf-8")).hexdigest()[:10]
    for old in BASE.glob("data.*.js"):
        if old.name != f"data.{digest}.js":
            old.unlink()
    (BASE / f"data.{digest}.js").write_text(
        "window.PHRASAL_INDEX=" + payload + ";\n", encoding="utf-8")

    page = (
        '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        "<title>短语动词 Phrasal Verbs</title>\n"
        f"<style>{INDEX_STYLE}</style>\n</head>\n<body>\n<div class=\"page\">\n"
        "<h1>短语动词</h1>\n"
        '<div class="level1" role="group" aria-label="浏览方式">'
        '<button type="button" data-mode="scene" aria-pressed="true">场景话题</button>'
        '<button type="button" data-mode="particle" aria-pressed="false">介词</button>'
        '</div>\n'
        '<div class="voice-seg" role="group" aria-label="音色">'
        '<button type="button" data-voice="f" aria-pressed="true">女</button>'
        '<button type="button" data-voice="m" aria-pressed="false">男</button>'
        '</div>\n'
        '<div class="chips" data-chips="scene"></div>\n'
        '<div class="chips" data-chips="particle" hidden></div>\n'
        '<div id="view"></div>\n'
        '</div>\n'
        f'<script src="data.{digest}.js"></script>\n'
        "<script>\n"
        "(function(){\n"
        "var D=window.PHRASAL_INDEX;\n"
        "var view=document.getElementById('view');\n"
        "var rowScene=document.querySelector('[data-chips=\"scene\"]');\n"
        "var rowPart=document.querySelector('[data-chips=\"particle\"]');\n"
        "var modeBtns=document.querySelectorAll('[data-mode]');\n"
        "var state={scene:'all',particle:'all'},mode='scene',open=null;\n"
        "function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}\n"
        "function chip(attr,val,label){return '<button type=\"button\" data-'+attr+'=\"'+val+'\">'+esc(label)+'</button>';}\n"
        "function rowButton(i){\n"
        "  var e=D.entries[i];\n"
        "  return '<button class=\"prow\" type=\"button\" data-i=\"'+i+'\"><span class=\"en\">'+esc(e.h)+'</span><span class=\"zh\">'+esc(e.zh)+'</span><span class=\"arw\">›</span></button>';\n"
        "}\n"
        "function fmt(v){return (v==null?'':v.toFixed(3));}\n"
        "function card(i){\n"
        "  var e=D.entries[i];var out='<div class=\"card\" data-card=\"'+i+'\">';\n"
        "  out+='<div class=\"card-head\"><button class=\"say head\" type=\"button\" data-i=\"'+i+'\" data-k=\"0\"><span class=\"w\">'+esc(e.h)+'</span><span class=\"ipa\">/'+esc(e.ipa)+'/</span><span class=\"play\">▶</span></button><span class=\"badges\"><span class=\"badge reg\">'+(e.reg==='spoken'?'口语':e.reg==='written'?'书面':'中性')+'</span>'+(e.sep?'<span class=\"badge split\">可分</span>':'')+'</span></div>';\n"
        "  out+='<p class=\"zh-line\">'+esc(e.zh)+'</p>';\n"
        "  for(var s=0;s<e.sen.length;s++){\n"
        "    var it=e.sen[s];\n"
        "    out+='<div class=\"sense\"><p class=\"sense-zh\">'+esc(it[0])+'</p><button class=\"say ex\" type=\"button\" data-i=\"'+i+'\" data-k=\"'+(s+1)+'\"><span class=\"txt\">'+esc(it[1])+'</span><span class=\"zh\">'+esc(it[2])+'</span></button></div>';\n"
        "  }\n"
        "  var notes='';\n"
        "  if(e.l1)notes+='<p class=\"l1\"><b>中文易错</b>'+esc(e.l1)+'</p>';\n"
        "  if(e.coll&&e.coll.length)notes+='<p class=\"colloc\"><b>搭配</b>'+esc(e.coll.join(' · '))+'</p>';\n"
        "  if(e.conf&&e.conf.length)notes+='<p class=\"confuse\"><b>易混</b>'+esc(e.conf.join(' · '))+'</p>';\n"
        "  if(notes)out+='<div class=\"note-card\">'+notes+'</div>';\n"
        "  return out+'</div>';\n"
        "}\n"
        "function sceneHtml(){\n"
        "  var out='';\n"
        "  D.scene.forEach(function(g){\n"
        "    out+='<section class=\"group\" data-cat=\"'+g.id+'\">';\n"
        "    g.themes.forEach(function(t){\n"
        "      out+='<h3 class=\"theme\">'+esc(t.zh)+' <span class=\"stage-en\">'+esc(t.en)+'</span></h3>';\n"
        "      out+='<div class=\"list\">'+t.rows.map(rowButton).join('')+'</div>';\n"
        "    });\n"
        "    out+='</section>';\n"
        "  });\n"
        "  return out;\n"
        "}\n"
        "function partHtml(){\n"
        "  var out='';\n"
        "  D.particle.forEach(function(g){\n"
        "    out+='<section class=\"group\" data-particle=\"'+g.p+'\"><h3 class=\"theme\">'+esc(g.label||g.p)+'</h3><div class=\"list\">'+g.rows.map(rowButton).join('')+'</div></section>';\n"
        "  });\n"
        "  return out;\n"
        "}\n"
        "var html={scene:sceneHtml(),particle:partHtml()};\n"
        "function setChips(m){\n"
        "  rowScene.hidden=(m!=='scene');rowPart.hidden=(m==='scene');\n"
        "  for(var i=0;i<modeBtns.length;i++)modeBtns[i].setAttribute('aria-pressed',modeBtns[i].getAttribute('data-mode')===m?'true':'false');\n"
        "  var chips=(m==='scene'?rowScene:rowPart).querySelectorAll('button');\n"
        "  for(var c=0;c<chips.length;c++)chips[c].setAttribute('aria-pressed',chips[c].getAttribute('data-'+m)==='all'&&state[m]==='all'?'true':(chips[c].getAttribute('data-'+m)===state[m]?'true':'false'));\n"
        "}\n"
        "function paint(m,value,scroll){\n"
        "  mode=m;if(value!==undefined)state[m]=value;\n"
        "  view.innerHTML=html[m];open=null;\n"
        "  var attr=(m==='scene'?'cat':'particle');\n"
        "  var groups=view.querySelectorAll('.group');\n"
        "  for(var g=0;g<groups.length;g++)groups[g].style.display=(state[m]==='all'||groups[g].getAttribute('data-'+attr)===state[m])?'':'none';\n"
        "  setChips(m);\n"
        "  if(scroll)view.scrollIntoView({block:'start',behavior:'smooth'});\n"
        "}\n"
        "function toggleCard(btn){\n"
        "  var i=+btn.getAttribute('data-i');\n"
        "  var existing=view.querySelector('.card');\n"
        "  if(open===i){if(existing)existing.remove();open=null;return;}\n"
        "  if(existing)existing.remove();\n"
        "  open=i;btn.insertAdjacentHTML('afterend',card(i));\n"
        "}\n"
        "var KEY_VOICE='pv-voice';var voice='f';\n"
        "try{var sv=localStorage.getItem(KEY_VOICE);if(sv==='f'||sv==='m')voice=sv;}catch(e){}\n"
        "var audio=new Audio();audio.preload='auto';var srcCache={};var stopAt=0,onEl=null;\n"
        "function srcFor(url){\n"
        "  if(srcCache[url])return srcCache[url];\n"
        "  var can=location.protocol!=='file:'&&window.fetch&&window.URL&&URL.createObjectURL;\n"
        "  if(!can){srcCache[url]=Promise.resolve(url);return srcCache[url];}\n"
        "  srcCache[url]=fetch(url).then(function(r){if(!r.ok)throw 0;return r.blob();})\n"
        "    .then(function(b){return URL.createObjectURL(b);}).catch(function(){return url;});\n"
        "  return srcCache[url];\n"
        "}\n"
        "audio.addEventListener('timeupdate',function(){\n"
        "  if(stopAt&&audio.currentTime>=stopAt-0.02){audio.pause();stopAt=0;if(onEl){onEl.classList.remove('on');onEl=null;}}\n"
        "});\n"
        "function playSay(el){\n"
        "  var i=+el.getAttribute('data-i'),k=+el.getAttribute('data-k');\n"
        "  var e=D.entries[i];var span=e.au[k];\n"
        "  if(!span||!e.sp||!e.sp[voice])return;\n"
        "  var s=voice==='f'?span[0]:span[2],en=voice==='f'?span[1]:span[3];\n"
        "  if(s==null||en==null)return;\n"
        "  srcFor('audio/'+e.sp[voice]).then(function(src){\n"
        "    if(audio.src!==src)audio.src=src;\n"
        "    stopAt=en;if(onEl)onEl.classList.remove('on');onEl=el;el.classList.add('on');\n"
        "    var go=function(){try{audio.currentTime=s;}catch(err){}audio.play().catch(function(){});};\n"
        "    if(audio.readyState>0)go();else audio.addEventListener('loadedmetadata',go,{once:true});\n"
        "  });\n"
        "}\n"
        "var voiceBtns=document.querySelectorAll('[data-voice]');\n"
        "function paintVoice(){\n"
        "  for(var v=0;v<voiceBtns.length;v++)voiceBtns[v].setAttribute('aria-pressed',voiceBtns[v].getAttribute('data-voice')===voice?'true':'false');\n"
        "}\n"
        "for(var vv=0;vv<voiceBtns.length;vv++)voiceBtns[vv].addEventListener('click',function(e){voice=e.currentTarget.getAttribute('data-voice');try{localStorage.setItem(KEY_VOICE,voice);}catch(err){}paintVoice();});\n"
        "paintVoice();\n"
        "rowScene.innerHTML=chip('scene','all','全部')+D.scene.map(function(g){return chip('scene',g.id,g.zh);}).join('');\n"
        "rowPart.innerHTML=chip('particle','all','全部')+D.particle.map(function(g){return chip('particle',g.p,g.label||g.p);}).join('');\n"
        "rowScene.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;paint('scene',b.getAttribute('data-scene'),true);});\n"
        "rowPart.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;paint('particle',b.getAttribute('data-particle'),true);});\n"
        "for(var m=0;m<modeBtns.length;m++)modeBtns[m].addEventListener('click',function(e){paint(e.currentTarget.getAttribute('data-mode'),'all',true);});\n"
        "view.addEventListener('click',function(e){\n"
        "  var say=e.target.closest('.say');\n"
        "  if(say){playSay(say);return;}\n"
        "  var b=e.target.closest('.prow');\n"
        "  if(b)toggleCard(b);\n"
        "});\n"
        "paint('scene','all',false);\n"
        "})();\n"
        "</script>\n</body>\n</html>\n"
    )
    (BASE / "index.html").write_text(page, encoding="utf-8")
    total = len(data["entries"])
    print(f"built index.html + data.{digest}.js ({len(themes)} themes, {total} entries)")


async def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="*", help="chapter ids")
    parser.add_argument("--skip-audio", action="store_true")
    parser.add_argument("--index-only", action="store_true")
    parser.add_argument("--tts", choices=["azure", "edge", "kokoro", "qwen"],
                        default="azure",
                        help="合成后端：azure（默认）/ edge / kokoro（本地 ONNX）"
                             " / qwen（本地 Qwen3-TTS，需 tts-lab 环境）")
    args = parser.parse_args()

    themes = load_themes()
    numbers = {theme["id"]: index + 1 for index, theme in enumerate(themes)}
    total = sum(len(theme["entries"]) for theme in themes)

    if args.index_only:
        build_index(themes)
        return 0

    selected = themes
    if args.only:
        unknown = [c for c in args.only if c not in numbers]
        if unknown:
            print(f"未知主题：{', '.join(unknown)}")
            return 1
        selected = [c for c in themes if c["id"] in args.only]

    if not args.only and not args.skip_audio:
        sprites = AUDIO_DIR / "sprites"
        if sprites.exists():
            shutil.rmtree(sprites)

    failed = []
    if not args.skip_audio:
        failed = await ensure_clips(selected, args.tts)

    built = 0
    for theme in selected:
        missing = [rel for rel, text, voice in chapter_jobs(theme)
                   if not (AUDIO_DIR / rel).exists()]
        if missing:
            print(f"skip {theme['id']}: {len(missing)} clips missing")
            continue
        build_page(theme, numbers[theme["id"]], total)
        built += 1

    if not args.only and built == len(selected):
        all_themes = load_themes()
        build_index(all_themes)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
