# -*- coding: utf-8 -*-
"""Find a TTS setting that actually produces the reduced /jər/.

Spelling guesses ("yer" -> "you") and voices disagree, so this page lays out
the same phrase across spellings, rates and voices. Pick the one that sounds
like /jər/.

    python -I source/audition_rate.py
"""

import asyncio
import hashlib
import html
import pathlib

import edge_tts

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "audition"
VOICES = {
    "ava": "en-US-AvaNeural",
    "aria": "en-US-AriaNeural",
    "emma": "en-US-EmmaNeural",
    "guy": "en-US-GuyNeural",
    "andrew": "en-US-AndrewNeural",
}

# (group, label, text, voice, rate)
VARIANTS = [
    ("整句 · 原拼写，调语速", "原句 正常速", "Your stop is next, right?", "ava", "+0%"),
    ("整句 · 原拼写，调语速", "原句 +30%", "Your stop is next, right?", "ava", "+30%"),
    ("整句 · 原拼写，调语速", "原句 +60%", "Your stop is next, right?", "ava", "+60%"),
    ("整句 · 原拼写，调语速", "原句 +90%", "Your stop is next, right?", "ava", "+90%"),
    ("整句 · 换拼写", "Yer +20%", "Yer stop is next, right?", "ava", "+20%"),
    ("整句 · 换拼写", "Yur +20%", "Yur stop is next, right?", "ava", "+20%"),
    ("整句 · 换拼写", "Ya +20%", "Ya stop is next, right?", "ava", "+20%"),
    ("整句 · 换拼写", "Yuh +20%", "Yuh stop is next, right?", "ava", "+20%"),
    ("整句 · 换音色（Yer +20%）", "Ava", "Yer stop is next, right?", "ava", "+20%"),
    ("整句 · 换音色（Yer +20%）", "Aria", "Yer stop is next, right?", "aria", "+20%"),
    ("整句 · 换音色（Yer +20%）", "Emma", "Yer stop is next, right?", "emma", "+20%"),
    ("整句 · 换音色（Yer +20%）", "Guy", "Yer stop is next, right?", "guy", "+20%"),
    ("整句 · 换音色（Yer +20%）", "Andrew", "Yer stop is next, right?", "andrew", "+20%"),
    ("单词", "your 正常速", "your", "ava", "+0%"),
    ("单词", "your +40%", "your", "ava", "+40%"),
    ("单词", "yer +20%", "yer", "ava", "+20%"),
    ("单词", "yur +20%", "yur", "ava", "+20%"),
]


def clip(text, voice, rate):
    digest = hashlib.sha1(f"{text}|{voice}|{rate}".encode("utf-8")).hexdigest()[:16]
    return f"{voice}/{digest[:2]}/{digest}.mp3"


async def synth(text, voice, rate, semaphore):
    async with semaphore:
        for _ in range(4):
            try:
                comm = edge_tts.Communicate(text, VOICES[voice], rate=rate)
                data = bytearray()
                async for chunk in comm.stream():
                    if chunk["type"] == "audio":
                        data.extend(chunk["data"])
                if data:
                    return bytes(data)
            except Exception:  # noqa: BLE001 - retry
                await asyncio.sleep(2)
        raise RuntimeError(f"failed: {text} {voice} {rate}")


async def main():
    semaphore = asyncio.Semaphore(3)
    jobs = [
        (clip(text, voice, rate), text, voice, rate)
        for _, _, text, voice, rate in VARIANTS
        if not (OUT / clip(text, voice, rate)).exists()
    ]

    async def one(rel, text, voice, rate):
        path = OUT / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(await synth(text, voice, rate, semaphore))
        print(f"synth {voice} {rate} {text!r}")

    if jobs:
        await asyncio.gather(*(one(*job) for job in jobs))

    groups = {}
    for group, label, text, voice, rate in VARIANTS:
        groups.setdefault(group, []).append((label, clip(text, voice, rate)))

    sections = []
    for group, items in groups.items():
        buttons = "".join(
            f'<button type="button" data-clip="audition/{rel}">{html.escape(label)}</button>'
            for label, rel in items
        )
        sections.append(f'<section><h2>{html.escape(group)}</h2><div class="row">{buttons}</div></section>')

    page = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>发音现象 · /jər/ 试听</title>
<style>
  body {{ margin:0; background:#fff; color:#1d1d1f;
    font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }}
  .page {{ max-width:720px; margin:0 auto; padding:40px 20px 80px; }}
  h1 {{ font-size:24px; margin:0 0 6px; }}
  .note {{ color:#6e6e73; font-size:14px; margin:0 0 24px; }}
  h2 {{ font-size:15px; color:#6e6e73; margin:26px 0 10px; font-weight:600; }}
  .row {{ display:flex; flex-wrap:wrap; gap:8px; }}
  button {{ font:inherit; font-size:15px; padding:8px 14px; border-radius:10px;
    border:1px solid #d2d2d7; background:#fff; cursor:pointer; }}
  button:hover {{ background:#f5f5f7; }}
  button.on {{ background:#0071e3; border-color:#0071e3; color:#fff; }}
</style>
</head>
<body>
<div class="page">
  <h1>哪个读成 /jər/</h1>
  <p class="note">目标是 your 在快速语流里的 /jər/。挨个点，记住哪个对。</p>
  {"".join(sections)}
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
    player.play().catch(function () {{}});
  }});
  player.addEventListener('ended', function () {{
    if (current) {{ current.classList.remove('on'); current = null; }}
  }});
}})();
</script>
</body>
</html>
"""
    (ROOT / "audition-rate.html").write_text(page, encoding="utf-8")
    print(f"wrote {ROOT / 'audition-rate.html'}")


if __name__ == "__main__":
    asyncio.run(main())
