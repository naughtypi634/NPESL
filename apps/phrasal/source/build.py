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
        f'{chips}>'
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

    rows = "\n      ".join(entry_html(entry, audio) for entry in chapter["entries"])
    page = template
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
  .stage { margin:34px 0 4px; font-size:14px; font-weight:600;
    color:var(--muted); letter-spacing:0.04em; }
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

def build_index(themes):
    rows = []
    for number, theme in enumerate(themes, 1):
        name = f"{number:02d}-{slug(theme['title_en'])}"
        rows.append(
            f'<a class="row" href="{name}">'
            f'<span class="title"><span class="en">{html.escape(theme["title_en"])}</span>'
            f'<span class="zh">{html.escape(theme["title_zh"])}</span></span>'
            f'<span class="tag">›</span></a>'
        )
    page = (
        '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        "<title>短语动词 Phrasal Verbs</title>\n"
        f"<style>{INDEX_STYLE}</style>\n</head>\n<body>\n<div class=\"page\">\n"
        "<h1>短语动词</h1>\n"
        '<p class="sub">按主题分类 · 点词条或例句就出声</p>\n'
        f'<div class="list">{"".join(rows)}</div>\n</div>\n</body>\n</html>\n'
    )
    (BASE / "index.html").write_text(page, encoding="utf-8")
    total = sum(len(theme["entries"]) for theme in themes)
    print(f"built index.html ({len(themes)} themes, {total} entries)")


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
        build_index(load_themes())
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
