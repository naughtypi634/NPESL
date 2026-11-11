#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A/B audition for curated prosody (Edge vs Azure SSML).

Writes a small click-to-play page under ``build/prosody-audition/`` so the
engine/parameters can be chosen by ear before any content is migrated.

    .venv\\Scripts\\python.exe -I tools\\prosody_audition.py
    .venv\\Scripts\\python.exe -I tools\\prosody_audition.py --voice m

Every variant is cached by its SSML body, so re-running only synthesizes new
ones.  Edge variants are cached by text + voice + rate.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import html
import pathlib
import re
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import azure_speech  # noqa: E402
import audio_sprite  # noqa: E402

import edge_tts  # noqa: E402

OUT = ROOT / "build" / "prosody-audition"
CACHE = OUT / "clips"
VOICES = {
    "f": ("en-US-AvaNeural", "Ava 女声"),
    "m": ("en-US-AndrewNeural", "Andrew 男声"),
    # Azure documents word-level <emphasis> support for Guy/Davis/Jane only.
    "g": ("en-US-GuyNeural", "Guy 男声（支持 emphasis）"),
    "j": ("en-US-JaneNeural", "Jane 女声（支持 emphasis）"),
}
RATE = "+0%"

# Each sentence: key, display text, and variants.  A variant is
# (label, engine, inner-or-text).  For "edge", the payload is plain text.
SENTENCES = [
    {
        "key": "try-on",
        "text": "Try it on in the fitting room.",
        "variants": [
            ("Edge 原句", "edge", "Try it on in the fitting room."),
            ("Edge 加逗号（合成文本用）", "edge",
             "Try it on, in the fitting room."),
            ("Azure 原句", "azure", "Try it on in the fitting room."),
            ("Azure 加逗号", "azure", "Try it on, in the fitting room."),
            ("Azure on 后停 240ms（词边界会合并）", "azure",
             "Try it on<break time='240ms'/> in the fitting room."),
            ("Azure on 后停 + fitting 慢一点", "azure",
             "Try it on<break time='240ms'/> in the "
             "<prosody rate='-12%'>fitting</prosody> room."),
        ],
    },
    {
        "key": "let-him",
        "text": "Let him do it.",
        "variants": [
            ("Edge 原句", "edge", "Let him do it."),
            ("Azure 原句", "azure", "Let him do it."),
            ("Azure 重读 him：rate 慢 + pitch 高 + volume 高", "azure",
             "Let <prosody rate='-20%' pitch='+25%' volume='+10%'>him</prosody> do it."),
            ("Azure 重读 do：rate 慢 + pitch 高 + volume 高", "azure",
             "Let him <prosody rate='-20%' pitch='+25%' volume='+10%'>do</prosody> it."),
            ("Azure emphasis moderate：him (emphasis)", "azure",
             "Let <emphasis level='moderate'>him</emphasis> do it."),
            ("Azure emphasis strong：him (emphasis)", "azure",
             "Let <emphasis level='strong'>him</emphasis> do it."),
            ("Azure 诊断：him 极慢 -50%", "azure",
             "Let <prosody rate='-50%'>him</prosody> do it."),
            ("Azure 诊断：整句 -30%", "azure",
             "<prosody rate='-30%'>Let him do it.</prosody>"),
            ("Azure contour：him 峰（按词时间）", "azure_contour",
             ("Let him do it.", "him", 35, None)),
            ("Azure contour：do 峰（按词时间）", "azure_contour",
             ("Let him do it.", "do", 35, None)),
            ("Azure contour：him 峰 + him 慢 20%", "azure_contour",
             ("Let him do it.", "him", 35, -20)),
            ("Azure contour：do 峰 + do 慢 20%", "azure_contour",
             ("Let him do it.", "do", 35, -20)),
            ("Azure contour：him 峰 +50 宽 12%（男声专项）", "azure_contour",
             ("Let him do it.", "him", 50, None, 12)),
            ("Azure contour：him 峰 +50 + 慢 35%（男声专项）", "azure_contour",
             ("Let him do it.", "him", 50, -35, 12)),
            ("Azure contour：do 峰 +50 宽 12%", "azure_contour",
             ("Let him do it.", "do", 50, None, 12)),
            ("Azure contour：do 峰 +50 + 慢 35%", "azure_contour",
             ("Let him do it.", "do", 50, -35, 12)),
            ("Azure contour：do 峰 +50 + 慢 50%", "azure_contour",
             ("Let him do it.", "do", 50, -50, 12)),
            ("Azure 诊断：do 极慢 -50%", "azure",
             "Let him <prosody rate='-50%'>do</prosody> it."),
            ("Azure 逗号 + do contour +50", "azure_contour",
             ("Let him, do it.", "do", 50, None, 12)),
            ("Edge 强语境：Don't just talk. Do it.", "edge",
             "Don't just talk about it. Do it."),
            ("Azure 强语境：Don't just talk. Do it.", "azure",
             "Don't just talk about it. Do it."),
            ("Edge 强语境：not just plan it. Do it.", "edge",
             "Let him do it. Not just plan it."),
            ("Azure 强语境：not just plan it. Do it.", "azure",
             "Let him do it. Not just plan it."),
            ("Edge 强语境：actually do it.", "edge",
             "Let him do it. Actually do it."),
            ("Azure 强语境：actually do it.", "azure",
             "Let him do it. Actually do it."),
            ("Edge 语境引出 him", "edge", "Let him do it, not her."),
            ("Edge 语境引出 do", "edge",
             "Let him do it, not just talk about it."),
            ("Edge 标点引出 him", "edge", "Let HIM do it."),
            ("Edge 标点引出 do", "edge", "Let him DO it."),
            ("Edge 对比情境引出 him", "edge", "Should I do it? No, let HIM do it."),
            ("Edge 对比情境引出 do", "edge", "Let him DO it, not just talk about it."),
            ("Azure emphasis 强调 do (Guy)", "azure",
             "Let him <emphasis level='strong'>do</emphasis> it."),
        ],
    },
    {
        "key": "best",
        "text": "But my husband is my best friend.",
        "variants": [
            ("Edge 原句", "edge", "But my husband is my best friend."),
            ("Azure 原句", "azure", "But my husband is my best friend."),
            ("Azure 重读 best", "azure",
             "But my husband is my <prosody rate='-12%'>best</prosody> friend."),
            ("Azure 重读 best + 轻读 friend", "azure",
             "But my husband is my <prosody rate='-12%'>best</prosody> "
             "<prosody rate='+6%' volume='-4%'>friend</prosody>."),
            ("Azure 诊断：best 极慢 -50%", "azure",
             "But my husband is my <prosody rate='-50%'>best</prosody> friend."),
            ("Azure emphasis strong：best (emphasis)", "azure",
             "But my husband is my <emphasis level='strong'>best</emphasis> friend."),
            ("Azure contour：best 峰（按词时间）", "azure_contour",
             ("But my husband is my best friend.", "best", 30, None)),
            ("Azure contour：best 峰 + best 慢 25%", "azure_contour",
             ("But my husband is my best friend.", "best", 30, -25)),
            ("Azure contour：best 峰 + best 慢 20%", "azure_contour",
             ("But my husband is my best friend.", "best", 30, -20)),
            ("Azure contour：best 峰 + best 慢 35%", "azure_contour",
             ("But my husband is my best friend.", "best", 30, -35)),
        ],
    },
    {
        "key": "favorite",
        "text": "My favorite part was the art: big paintings, full of color.",
        "variants": [
            ("Edge 原句", "edge",
             "My favorite part was the art: big paintings, full of color."),
            ("Azure 原句", "azure",
             "My favorite part was the art: big paintings, full of color."),
            ("Azure 冒号后停 + favorite rate 慢/pitch 高/volume 高", "azure",
             "My <prosody rate='-24%' pitch='+25%' volume='+10%'>favorite</prosody> "
             "part was the <prosody rate='-20%' pitch='+25%' volume='+10%'>art</prosody>:"
             "<break time='260ms'/> big paintings, full of color."),
            ("Azure emphasis strong：favorite + art (emphasis)", "azure",
             "My <emphasis level='strong'>favorite</emphasis> part was the "
             "<emphasis level='strong'>art</emphasis>:<break time='260ms'/> "
             "big paintings, full of color."),
            ("Azure 诊断：favorite 极慢 -50%", "azure",
             "My <prosody rate='-50%'>favorite</prosody> part was the art: "
             "big paintings, full of color."),
            ("Azure contour：favorite 峰（按词时间）", "azure_contour",
             ("My favorite part was the art: big paintings, full of color.",
              "favorite", 25, None)),
            ("Azure contour：art 峰（按词时间）", "azure_contour",
             ("My favorite part was the art: big paintings, full of color.",
              "art", 25, None)),
            ("Azure contour：favorite 峰 + 慢 20%", "azure_contour",
             ("My favorite part was the art: big paintings, full of color.",
              "favorite", 25, -20)),
            ("Edge 大写词：FAVORITE / ART", "edge",
             "My FAVORITE part was the ART: big paintings, full of color."),
            ("Azure 大幅 prosody：favorite + art (Andrew/Ava)", "azure",
             "My <prosody rate='-35%' pitch='+50%' volume='+20%'>favorite</prosody> "
             "part was the <prosody rate='-35%' pitch='+50%' volume='+20%'>art</prosody>:"
             "<break time='260ms'/> big paintings, full of color."),
        ],
    },
]


def digest(*parts: str) -> str:
    return hashlib.sha1("\0".join(parts).encode("utf-8")).hexdigest()[:16]


def clip_path(engine: str, voice: str, key: str) -> pathlib.Path:
    return CACHE / engine / voice / key[:2] / f"{key}.mp3"


async def synth_edge(text: str, voice: str, target: pathlib.Path) -> bytes:
    if target.exists():
        return target.read_bytes()
    target.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            comm = edge_tts.Communicate(text, voice, rate=RATE)
            data = bytearray()
            async for chunk in comm.stream():
                if chunk["type"] == "audio":
                    data.extend(chunk["data"])
            if not data:
                raise RuntimeError("empty audio")
            target.write_bytes(bytes(data))
            return bytes(data)
        except Exception:
            if attempt == 2:
                raise
            await asyncio.sleep(2 * (attempt + 1))
    raise RuntimeError("unreachable")


def synth_azure(inner: str, voice: str, target: pathlib.Path) -> bytes:
    if target.exists():
        return target.read_bytes()
    target.parent.mkdir(parents=True, exist_ok=True)
    data = azure_speech.synthesize_ssml(inner, voice, RATE)
    target.write_bytes(data)
    return data


_TIMING_CACHE: dict[tuple[str, str], tuple[float, list[dict]]] = {}


def word_timings(voice: str, text: str) -> tuple[float, list[dict]]:
    key = (voice, text)
    if key not in _TIMING_CACHE:
        audio, words = azure_speech.synthesize_ssml_with_words(text, voice, RATE)
        total = len(audio) / 144 * 0.024
        _TIMING_CACHE[key] = (total, words)
    return _TIMING_CACHE[key]


def contour_inner(text: str, voice: str, target: str, peak: int,
                  rate: int | None = None, width: float = 6.0) -> str:
    """Build a contour whose peak spans the target word's real time range.

    The position comes from a plain Azure render of the same voice, so it
    follows the voice's own pacing instead of a guessed percentage.
    """
    total, words = word_timings(voice, text)
    hit = None
    for word in words:
        bare = word["text"].strip(".,!?;:").lower()
        if bare == target.lower():
            hit = word
            break
    if not hit:
        raise ValueError(f"target {target!r} not in {text!r}")
    start = max(0.0, hit["offset"] / total * 100)
    end = min(100.0, (hit["offset"] + hit["duration"]) / total * 100)
    lead = max(0.0, start - width)
    tail = min(100.0, end + width)
    points: list[tuple[float, int]] = [(0.0, 0)]
    if lead > 0.5:
        points.append((lead, 0))
    points.append((start, peak))
    if end > start + 0.5:
        points.append((end, peak))
    if tail < 99.5:
        points.append((tail, 0))
    points.append((100.0, -10))
    # Strictly increasing percentages: Azure rejects duplicates.
    clean: list[tuple[float, int]] = []
    for pct, value in points:
        while clean and pct <= clean[-1][0]:
            pct = clean[-1][0] + 0.5
        if pct > 100.0:
            break
        clean.append((pct, value))
    contour = " ".join(f"({pct:.1f}%,{value:+d}%)" for pct, value in clean)
    if rate is None:
        inner = f"<prosody contour='{contour}'>{html.escape(text)}</prosody>"
    else:
        escaped = html.escape(text)
        marked = re.sub(
            rf"\b{re.escape(target)}\b",
            f"<prosody rate='{rate}%'>{html.escape(target)}</prosody>",
            escaped, count=1, flags=re.IGNORECASE)
        inner = f"<prosody contour='{contour}'>{marked}</prosody>"
    return inner


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--voice", default="f,m,g", help="f,m,g（默认 Ava、Andrew、Guy）")
    args = parser.parse_args()
    voices = [v.strip() for v in args.voice.split(",") if v.strip()]
    bad = [v for v in voices if v not in VOICES]
    if bad:
        print(f"未知音色：{', '.join(bad)}")
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    rows: list[tuple[str, str, str, pathlib.Path, str]] = []
    started = time.time()
    for voice_key in voices:
        voice, voice_label = VOICES[voice_key]
        for sentence in SENTENCES:
            for label, engine, payload in sentence["variants"]:
                # Word-level <emphasis> is documented only for Azure
                # Guy/Davis/Jane.
                if "emphasis" in label and voice_key not in {"g", "j"}:
                    continue
                # Guy/Jane are control voices for the emphasis capability;
                # keep their audition focused on Azure variants.
                if voice_key in {"g", "j"} and (
                        engine != "azure" or sentence["key"] == "try-on"):
                    continue
                if engine == "edge":
                    key = digest("edge", payload, voice, RATE)
                    target = clip_path("edge", voice, key)
                    data = asyncio.run(synth_edge(payload, voice, target))
                    detail = f"{len(data):,} bytes"
                elif engine == "azure_contour":
                    if len(payload) == 5:
                        text, word, peak, rate, width = payload
                    else:
                        text, word, peak, rate = payload
                        width = 6.0
                    inner = contour_inner(text, voice, word, peak, rate, width)
                    key = digest("azure_contour", inner, voice, RATE)
                    target = clip_path("azure_contour", voice, key)
                    data = synth_azure(inner, voice, target)
                    detail = f"{len(data):,} bytes"
                else:
                    key = digest("azure", payload, voice, RATE)
                    target = clip_path("azure", voice, key)
                    data = synth_azure(payload, voice, target)
                    detail = f"{len(data):,} bytes"
                try:
                    audio_sprite.check(data)
                    sprite_ok = "sprite OK"
                except audio_sprite.AudioFormatError as exc:
                    sprite_ok = f"SPRITE FAIL: {exc}"
                rows.append((
                    voice_label,
                    sentence["text"],
                    f"{label} · {detail} · {sprite_ok}",
                    target,
                    sentence["key"],
                ))
                print(f"{voice_label} · {sentence['key']} · {label} · {sprite_ok}")

    by_sentence: dict[str, list[tuple[str, str, pathlib.Path]]] = {}
    for voice_label, text, label, target, key in rows:
        by_sentence.setdefault(f"{voice_label} · {text}", []).append(
            (label, key, target))

    body = []
    for heading, items in by_sentence.items():
        body.append(f"<section><h2>{html.escape(heading)}</h2>")
        for label, key, target in items:
            rel = target.relative_to(OUT).as_posix()
            body.append(
                f'<div class="row"><span class="label">{html.escape(label)}</span>'
                f'<audio controls preload="none" src="{html.escape(rel)}"></audio>'
                "</div>")
        body.append("</section>")

    page = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prosody audition</title>
<style>
:root {{ color-scheme: light dark; --bg:#f7f7f5; --fg:#1c1c1a; --muted:#6b6b66;
  --rule:#dcdcd6; --card:#fff; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#161614; --fg:#ececea;
  --muted:#a1a19a; --rule:#33332f; --card:#1e1e1b; }} }}
* {{ box-sizing:border-box; }}
body {{ margin:0; padding:24px 16px 64px; background:var(--bg); color:var(--fg);
  font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif; }}
main {{ max-width:760px; margin:0 auto; }}
h1 {{ font-size:20px; margin:0 0 6px; }}
p.lead {{ color:var(--muted); margin:0 0 24px; }}
section {{ background:var(--card); border:1px solid var(--rule); border-radius:12px;
  padding:14px 16px; margin:0 0 14px; }}
h2 {{ font-size:15px; margin:0 0 10px; font-weight:600; }}
.row {{ display:flex; flex-wrap:wrap; align-items:center; gap:10px;
  padding:7px 0; border-top:1px solid var(--rule); }}
.row:first-of-type {{ border-top:0; }}
.label {{ flex:1 1 260px; min-width:0; }}
audio {{ width:min(320px,100%); height:34px; }}
</style></head><body><main>
<h1>Prosody audition</h1>
<p class="lead">同一句对比 Edge / Azure / SSML 参数。先听音色是否一致，再听停顿和重音是否自然。</p>
{''.join(body)}
</main></body></html>"""
    (OUT / "index.html").write_text(page, encoding="utf-8")
    print(f"\n页面：{OUT / 'index.html'}")
    print(f"用时 {time.time() - started:.1f}s，{len(rows)} 个片段")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
