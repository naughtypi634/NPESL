#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A/B audition for list intonation on the ESLSE Family sentence.

    .venv\\Scripts\\python.exe -I tools\\list_tone_audition.py

Writes build/list-tone-audition/index.html with several ways of shaping the
same list: single-word contour, phrase-level contour, gentler contour,
comma breaks only, and pitch-only.  Clips are cached by SSML body.
"""

from __future__ import annotations

import hashlib
import html
import pathlib
import sys
from xml.sax.saxutils import escape as xml_escape

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "apps" / "conversation" / "source"))

import azure_speech  # noqa: E402
import audio_sprite  # noqa: E402
import build_site  # noqa: E402
import pron  # noqa: E402

OUT = ROOT / "build" / "list-tone-audition"
CACHE = OUT / "clips"
VOICES = (("ava", "en-US-AvaNeural"), ("andrew", "en-US-AndrewNeural"))
TEXT = (
    "Growing up, we spent a lot of time together as a family, whether it was "
    "playing board games, going on hikes, or just sitting around the dinner "
    "table and catching up on our day."
)


def by_phrase(text: str, phrases: list[tuple[int, int, str]]) -> str:
    """Wrap token ranges (inclusive start, exclusive end) with a tag."""
    matches = list(pron.WORD_RE.finditer(text))
    out: list[str] = []
    cursor = 0
    for start, end, opening in phrases:
        a, b = matches[start].start(), matches[end - 1].end()
        out.append(xml_escape(text[cursor:a]))
        out.append(opening + xml_escape(text[a:b]) + "</prosody>")
        cursor = b
    out.append(xml_escape(text[cursor:]))
    return "".join(out)


def comma_breaks(text: str, ms: int = 130) -> str:
    escaped = xml_escape(text)
    return escaped.replace(", ", f",<break time='{ms}ms'/> ")


def build_items():
    spec = build_site.stress_spec(
        build_site.load_level("ESLSE")[0]["stories"][0], TEXT)
    primary_tag = "rate='-12%' pitch='+24%' volume='+9%'"
    secondary_tag = "rate='-5%' pitch='+10%' volume='+3%'"
    gentle_rise = "contour='(0%,+0%) (50%,+6%) (100%,+12%)'"
    gentle_fall = "contour='(0%,+0%) (40%,+10%) (100%,-8%)'"
    phrase_rise = "contour='(0%,+0%) (55%,+7%) (100%,+16%)'"
    phrase_fall = "contour='(0%,+0%) (40%,+10%) (100%,-10%)'"

    matches = list(pron.WORD_RE.finditer(TEXT))

    gentle = []
    cursor = 0
    for index, match in enumerate(matches):
        opening = None
        if index == 11:
            opening = primary_tag
        elif index == 17 or index == 20:
            opening = gentle_rise
        elif index == 27:
            opening = secondary_tag
        elif index == 33:
            opening = gentle_fall
        if not opening:
            continue
        gentle.append(xml_escape(TEXT[cursor:match.start()]))
        gentle.append(f"<prosody {opening}>{xml_escape(match.group(0))}</prosody>")
        cursor = match.end()
    gentle.append(xml_escape(TEXT[cursor:]))

    pitch_only = []
    cursor = 0
    for index, match in enumerate(matches):
        opening = None
        if index == 17 or index == 20:
            opening = "pitch='+12%'"
        elif index == 33:
            opening = "pitch='-8%'"
        if not opening:
            continue
        pitch_only.append(xml_escape(TEXT[cursor:match.start()]))
        pitch_only.append(f"<prosody {opening}>{xml_escape(match.group(0))}</prosody>")
        cursor = match.end()
    pitch_only.append(xml_escape(TEXT[cursor:]))

    return [
        ("Azure 原句（无标记）", xml_escape(TEXT)),
        ("当前 v4（单词 contour +22%，rate -5%）",
         build_site.stress_inner(TEXT, spec)),
        ("轻一点：单词 contour +12%，不改语速", "".join(gentle)),
        ("短语级：board games / on hikes 整段升，our day 降",
         by_phrase(TEXT, [
             (16, 18, f"<prosody {phrase_rise}>"),
             (19, 21, f"<prosody {phrase_rise}>"),
             (32, 34, f"<prosody {phrase_fall}>"),
         ])),
        ("只靠逗号 + 短停顿", comma_breaks(TEXT)),
        ("只加 pitch，不用 contour", "".join(pitch_only)),
    ]


def clip_path(voice: str, key: str) -> pathlib.Path:
    return CACHE / voice / key[:2] / f"{key}.mp3"


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for label, inner in build_items():
        key = hashlib.sha1(inner.encode("utf-8")).hexdigest()[:16]
        players = []
        for short, voice in VOICES:
            path = clip_path(short, key)
            if not path.exists():
                path.parent.mkdir(parents=True, exist_ok=True)
                data = azure_speech.synthesize_ssml(inner, voice)
                audio_sprite.check(data)
                path.write_bytes(data)
            rel = path.relative_to(OUT).as_posix()
            players.append(
                f'<label>{short}<audio controls preload="none" src="{rel}"></audio></label>'
            )
        rows.append(
            f'<article><h2>{html.escape(label)}</h2>'
            f'<div class="audio">{"".join(players)}</div></article>'
        )
        print("OK", label)
    page = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>List intonation audition</title>
<style>
:root {{ --bg:#f7f7f5; --fg:#1c1c1a; --muted:#6d6d66; --rule:#dcdcd6; --card:#fff; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#15171a; --fg:#eceae4;
  --muted:#a3a49c; --rule:#33363a; --card:#1d2024; }} }}
* {{ box-sizing:border-box; }}
body {{ margin:0; padding:28px 16px 56px; background:var(--bg); color:var(--fg);
  font:15px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif; }}
main {{ max-width:760px; margin:0 auto; }}
h1 {{ font-size:20px; margin:0 0 4px; }}
p.lead {{ color:var(--muted); margin:0 0 20px; }}
article {{ background:var(--card); border:1px solid var(--rule);
  border-radius:12px; padding:14px 16px; margin:0 0 12px; }}
h2 {{ font-size:14px; margin:0 0 10px; font-weight:600; }}
.audio {{ display:flex; flex-wrap:wrap; gap:10px 18px; }}
.audio label {{ display:flex; flex-direction:column; gap:4px;
  font-size:12px; color:var(--muted); }}
audio {{ width:min(300px,100%); height:34px; }}
</style></head><body><main>
<h1>List intonation audition</h1>
<p class="lead">同一句，只改并列项的处理方式。先听 games / hikes / day 三处。</p>
{"".join(rows)}
</main></body></html>"""
    (OUT / "index.html").write_text(page, encoding="utf-8")
    print(f"\n页面：{OUT / 'index.html'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
