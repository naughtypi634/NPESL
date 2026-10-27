# -*- coding: utf-8 -*-
"""Audition reduced-speech spellings before they go into content.

Edge TTS guesses at made-up spellings: "yer" comes out as "you", which teaches
nothing. This script synthesizes every candidate spelling for a sound and
writes a small click-to-play page, so the spelling can be chosen by ear.

    python -I source/audition.py
    python -I source/audition.py --voice m
"""

import argparse
import asyncio
import hashlib
import html
import pathlib
import sys

import edge_tts

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "audition"
RATE = "+20%"
VOICES = {"f": "en-US-AvaNeural", "m": "en-US-AndrewNeural"}

# (label, written form to compare against, candidate spellings)
GROUPS = [
    ("your / you're  /jər/", "your", ["yer", "yur", "yuh", "ya", "yir", "yer-"]),
    ("what do you  /wʌdəjə/", "what do you", ["whaddaya", "wuddaya", "wuddya", "whadda ya", "what d'ya"]),
    ("going to  /ɡɔnə/", "going to", ["gonna", "gunna", "gonna-"]),
    ("want to  /wɑnə/", "want to", ["wanna", "wunna"]),
    ("have to  /hæftə/", "have to", ["hafta", "havta", "haf da"]),
    ("got to  /ɡɑtə/", "got to", ["gotta", "gotta-"]),
]


def clip(text, voice):
    digest = hashlib.sha1(f"{text}|{voice}|{RATE}".encode("utf-8")).hexdigest()[:16]
    return f"{voice}/{digest[:2]}/{digest}.mp3"


async def synth(text, voice, semaphore):
    async with semaphore:
        for attempt in range(4):
            try:
                comm = edge_tts.Communicate(text, VOICES[voice], rate=RATE)
                data = bytearray()
                async for chunk in comm.stream():
                    if chunk["type"] == "audio":
                        data.extend(chunk["data"])
                if data:
                    return bytes(data)
            except Exception:  # noqa: BLE001 - retry
                await asyncio.sleep(2)
        raise RuntimeError(f"failed: {text}")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", default="f", choices=sorted(VOICES))
    args = parser.parse_args()
    voice = args.voice

    semaphore = asyncio.Semaphore(3)
    jobs = []
    for _, written, candidates in GROUPS:
        for text in [written, *candidates]:
            rel = clip(text, voice)
            if not (OUT / rel).exists():
                jobs.append((rel, text))

    async def one(rel, text):
        path = OUT / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(await synth(text, voice, semaphore))
        print(f"synth {text!r}")

    if jobs:
        await asyncio.gather(*(one(rel, text) for rel, text in jobs))

    rows = []
    for label, written, candidates in GROUPS:
        buttons = [
            f'<button class="w" type="button" data-clip="audition/{clip(written, voice)}">{html.escape(written)}</button>'
        ]
        buttons += [
            f'<button type="button" data-clip="audition/{clip(text, voice)}">{html.escape(text)}</button>'
            for text in candidates
        ]
        rows.append(
            '<section class="group">'
            f'<h2>{html.escape(label)}</h2>'
            f'<div class="row">{"".join(buttons)}</div>'
            "</section>"
        )

    page = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>发音现象 · 读音拼写试听</title>
<style>
  body {{ margin:0; background:#fff; color:#1d1d1f;
    font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }}
  .page {{ max-width:720px; margin:0 auto; padding:40px 20px 80px; }}
  h1 {{ font-size:24px; margin:0 0 6px; }}
  .note {{ color:#6e6e73; font-size:14px; margin:0 0 28px; }}
  h2 {{ font-size:15px; color:#6e6e73; margin:26px 0 10px; font-weight:600; }}
  .row {{ display:flex; flex-wrap:wrap; gap:8px; }}
  button {{ font:inherit; font-size:15px; padding:8px 14px; border-radius:10px;
    border:1px solid #d2d2d7; background:#fff; cursor:pointer; }}
  button:hover {{ background:#f5f5f7; }}
  button.w {{ color:#6e6e73; border-style:dashed; }}
  button.on {{ background:#0071e3; border-color:#0071e3; color:#fff; }}
</style>
</head>
<body>
<div class="page">
  <h1>读音拼写试听</h1>
  <p class="note">虚线框是原词。点每个拼写，听它是不是那个音。</p>
  {"".join(rows)}
</div>
<script>
(function () {{
  var player = new Audio();
  var current = null;
  document.addEventListener('click', function (event) {{
    var btn = event.target.closest('button[data-clip]');
    if (!btn) return;
    if (current === btn) {{ player.pause(); btn.classList.remove('on'); current = null; return; }}
    if (current) current.classList.remove('on');
    current = btn;
    btn.classList.add('on');
    player.src = btn.getAttribute('data-clip');
    player.play().catch(function () {{ btn.textContent += ' (失败)'; }});
  }});
  player.addEventListener('ended', function () {{
    if (current) {{ current.classList.remove('on'); current = null; }}
  }});
}})();
</script>
</body>
</html>
"""
    (ROOT / "audition.html").write_text(page, encoding="utf-8")
    print(f"wrote {ROOT / 'audition.html'}")


if __name__ == "__main__":
    asyncio.run(main())
