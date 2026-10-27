# -*- coding: utf-8 -*-
"""Azure AI Speech backend, plus a quick A/B audition page.

Credentials live outside the repo:  ~/.azure-speech/key.txt
    line 1: subscription key
    line 2: region (e.g. southeastasia)

    python -I source/azure_tts.py --audition
"""

import argparse
import html
import pathlib
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "azure-test"
KEY_FILE = pathlib.Path.home() / ".azure-speech" / "key.txt"
FORMAT = "audio-24khz-48kbitrate-mono-mp3"


def credentials():
    lines = [line.strip() for line in KEY_FILE.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(lines) < 2:
        raise SystemExit("key file needs the key on line 1 and the region on line 2")
    return lines[0], lines[1]


def ssml(voice, inner, lang="en-US"):
    return (
        f"<speak version='1.0' xml:lang='{lang}'>"
        f"<voice name='{voice}'>{inner}</voice></speak>"
    )


def synth(ssml_text, key, region):
    request = urllib.request.Request(
        f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
        data=ssml_text.encode("utf-8"),
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": FORMAT,
            "User-Agent": "eslstudio",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def synthesize(inner, voice):
    """Synthesize an SSML inner body (may contain <phoneme>) for one voice."""
    key, region = credentials()
    body = ssml(voice, inner)
    last = None
    for attempt in range(4):
        try:
            return synth(body, key, region)
        except urllib.error.HTTPError as error:
            last = error
            if error.code in (429, 500, 502, 503, 504):
                time.sleep(2 * (attempt + 1))
                continue
            raise
    raise last


VARIANTS = [
    ("ava-plain", "Ava 原句", "en-US-AvaNeural", "<prosody rate='0%'>Your stop is next, right?</prosody>"),
    (
        "ava-phoneme",
        "Ava your→/jər/ 音素",
        "en-US-AvaNeural",
        "<prosody rate='0%'><phoneme alphabet='ipa' ph='jər'>Your</phoneme> stop is next, right?</prosody>",
    ),
    ("aria-plain", "Aria 原句", "en-US-AriaNeural", "<prosody rate='0%'>Your stop is next, right?</prosody>"),
    ("emma-plain", "Emma 原句", "en-US-EmmaNeural", "<prosody rate='0%'>Your stop is next, right?</prosody>"),
    ("guy-plain", "Guy 原句", "en-US-GuyNeural", "<prosody rate='0%'>Your stop is next, right?</prosody>"),
    ("andrew-plain", "Andrew 原句", "en-US-AndrewNeural", "<prosody rate='0%'>Your stop is next, right?</prosody>"),
    ("ava-gonna", "Ava gonna", "en-US-AvaNeural", "<prosody rate='0%'>I'm gonna work late.</prosody>"),
    (
        "ava-whaddaya",
        "Ava whaddaya 音素",
        "en-US-AvaNeural",
        "<prosody rate='0%'><phoneme alphabet='ipa' ph='wʌdəjə'>What do you</phoneme> want for lunch?</prosody>",
    ),
    ("ava-fast", "Ava 原句 +20%", "en-US-AvaNeural", "<prosody rate='+20%'>Your stop is next, right?</prosody>"),
    ("ava-slow", "Ava 原句 -20%", "en-US-AvaNeural", "<prosody rate='-20%'>Your stop is next, right?</prosody>"),
    ("ava-hd", "Ava HD 原句", "en-US-Ava:DragonHDLatestNeural", "<prosody rate='0%'>Your stop is next, right?</prosody>"),
]


def audition():
    key, region = credentials()
    OUT.mkdir(parents=True, exist_ok=True)
    buttons = []
    for slug, label, voice, inner in VARIANTS:
        path = OUT / f"{slug}.mp3"
        try:
            path.write_bytes(synth(ssml(voice, inner), key, region))
            print(f"ok   {slug}")
            buttons.append(f'<button type="button" data-clip="{slug}.mp3">{html.escape(label)}</button>')
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:200]
            print(f"fail {slug}: HTTP {error.code} {detail}")
        except Exception as error:  # noqa: BLE001 - report and continue
            print(f"fail {slug}: {error}")

    page = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Azure 试听</title>
<style>
  body {{ margin:0; background:#fff; color:#1d1d1f;
    font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }}
  .page {{ max-width:720px; margin:0 auto; padding:40px 20px 80px; }}
  h1 {{ font-size:22px; margin:0 0 20px; }}
  .row {{ display:flex; flex-wrap:wrap; gap:8px; }}
  button {{ font:inherit; font-size:15px; padding:9px 14px; border-radius:10px;
    border:1px solid #d2d2d7; background:#fff; cursor:pointer; }}
  button:hover {{ background:#f5f5f7; }}
  button.on {{ background:#0071e3; border-color:#0071e3; color:#fff; }}
</style>
</head>
<body>
<div class="page">
  <h1>Azure 试听</h1>
  <div class="row">{"".join(buttons)}</div>
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
    (OUT / "index.html").write_text(page, encoding="utf-8")
    print(f"wrote {OUT / 'index.html'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--audition", action="store_true")
    args = parser.parse_args()
    if args.audition:
        audition()
    else:
        parser.print_help()
