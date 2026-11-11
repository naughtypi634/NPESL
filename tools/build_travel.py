#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the Travel English location pages.

A location is one place a traveler stands in: the check-in hall, the security
checkpoint, the boarding gate. It owns a background image, tappable items and
tappable people; the dialogue itself still lives in the scene file, so an
encounter is never written twice.

    python -I tools/build_travel.py            # every location
    python -I tools/build_travel.py airport-check-in
"""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "apps" / "travel" / "source"))

import audio_sprite
import azure_speech
import paths

VOICES = {"f": "en-US-AvaNeural", "m": "en-US-AndrewNeural"}
RATE = "+0%"
LEVELS = ["survival", "conversational", "advanced"]


# ---------------------------------------------------------------- audio

def clip_path(text: str, voice: str) -> Path:
    norm = " ".join(text.split())
    digest = hashlib.sha1(f"{norm}|{voice}|{RATE}".encode("utf-8")).hexdigest()[:16]
    return paths.TRAVEL_AUDIO / voice / digest[:2] / f"{digest}.mp3"


def clip(text: str, voice: str) -> bytes:
    path = clip_path(text, voice)
    if not path.exists():
        data = azure_speech.synthesize(text, VOICES[voice], RATE)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    return audio_sprite.check(path.read_bytes())


def sprite(name: str, entries: list[tuple[str, str, str]]) -> dict:
    """entries: (key, text, voice). Returns {spans, file} and writes the sprite."""
    clips = [clip(text, voice) for _, text, voice in entries]
    data, spans = audio_sprite.concat(clips)
    out = paths.TRAVEL_APP / "audio" / "sprites" / f"{name}.mp3"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    return {"file": f"{name}.mp3",
            "holds": {key: [round(a, 3), round(b, 3)]
                      for (key, _, _), (a, b) in zip(entries, spans)}}


# ---------------------------------------------------------------- content

def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_lexicon() -> dict:
    data = load_json(paths.CONTENT / "lexicon" / "entries.json")
    return {e["id"]: e for e in data["entries"]}


def resolve(location: dict, scene: dict, lexicon: dict) -> dict:
    speakers = {s["id"]: s for s in scene["speakers"]}
    encounters = {e["id"]: e for e in scene["encounters"]}
    missing = [e for e in location["encounters"] if e not in encounters]
    if missing:
        raise SystemExit(f"{location['id']}: unknown encounters {missing}")

    items = []
    for item in location["items"]:
        entry = lexicon.get(item["lexicon"])
        if not entry:
            raise SystemExit(f"{location['id']}: unknown lexicon {item['lexicon']}")
        items.append({
            "id": item["id"],
            "x": item["x"], "y": item["y"],
            "hit": item.get("hit", {}),
            "label_en": item.get("label_en") or entry["en"],
            "label_zh": item.get("label_zh") or entry["zh"],
            "word": entry,
            "phrases": item.get("phrases", []),
        })

    characters = []
    for ch in location["characters"]:
        spk = speakers.get(ch["speaker"])
        if not spk:
            raise SystemExit(f"{location['id']}: unknown speaker {ch['speaker']}")
        if ch["encounter"] not in encounters:
            raise SystemExit(f"{location['id']}: unknown encounter {ch['encounter']}")
        characters.append({
            "id": ch["id"], "x": ch["x"], "y": ch["y"],
            "label_en": spk["en"], "label_zh": spk["zh"],
            "encounter": ch["encounter"],
        })

    return {
        "id": location["id"],
        "title_en": location["title_en"],
        "title_zh": location["title_zh"],
        "background": location["background"],
        "canvas": location["canvas"],
        "items": items,
        "characters": characters,
        "encounters": [encounters[e] for e in location["encounters"]],
        "speakers": speakers,
    }


# ---------------------------------------------------------------- audio build

def build_audio(loc: dict) -> dict:
    sprites = {}

    # item words, example sentences and scene phrases
    for voice in ("f", "m"):
        entries = []
        for item in loc["items"]:
            entries.append((f"w:{item['id']}", item["word"]["en"], voice))
            for i, ex in enumerate(item["word"].get("examples", [])):
                entries.append((f"e:{item['id']}:{i}", ex["en"], voice))
            for i, ph in enumerate(item["phrases"]):
                entries.append((f"p:{item['id']}:{i}", ph["en"], voice))
        sprites[f"items-{voice}"] = sprite(f"{loc['id']}-items-{voice}", entries)

    # phrases and dialogue per level
    for level in LEVELS:
        for voice in ("f", "m"):
            entries = [(f"ph:{level}:{i}", ph["en"], voice)
                       for i, ph in enumerate(loc["level_content"][level]["phrases"])]
            sprites[f"phrases-{level}-{voice}"] = sprite(
                f"{loc['id']}-phrases-{level}-{voice}", entries)
        entries = []
        for i, line in enumerate(loc["level_content"][level]["dialogue"]):
            spk = loc["speakers"][line["spk"]]
            entries.append((f"dl:{level}:{i}", line["en"], spk["voice"]))
        sprites[f"dialogue-{level}"] = sprite(
            f"{loc['id']}-dialogue-{level}", entries)

    # listening variants
    for voice in ("f", "m"):
        entries = []
        for enc in loc["encounters"]:
            for li in enc.get("listening", []):
                for i, ask in enumerate(li["asks"]):
                    entries.append((f"l:{enc['id']}:{li['id']}:{i}", ask["en"], voice))
        sprites[f"listen-{voice}"] = sprite(f"{loc['id']}-listen-{voice}", entries)

    return sprites


# ---------------------------------------------------------------- page

def build_page(loc: dict, sprites: dict) -> str:
    template = (Path(__file__).resolve().parent.parent / "apps" / "travel"
                / "source" / "template_location.html").read_text(encoding="utf-8")
    payload = {
        "id": loc["id"],
        "title_en": loc["title_en"],
        "title_zh": loc["title_zh"],
        "background": loc["background"],
        "canvas": loc["canvas"],
        "items": loc["items"],
        "characters": loc["characters"],
        "speakers": {k: {"en": v["en"], "zh": v["zh"], "voice": v["voice"]}
                     for k, v in loc["speakers"].items()},
        "encounters": loc["encounters"],
        "levels": LEVELS,
        "sprites": sprites,
        "audio": f"/travel/audio/sprites/",
    }
    html = template.replace("__DATA__", json.dumps(payload, ensure_ascii=False, indent=1))
    html = html.replace("__TITLE_EN__", loc["title_en"])
    html = html.replace("__TITLE_ZH__", loc["title_zh"])
    html = html.replace("__LOC_ID__", loc["id"])
    return html


def build(location_id: str) -> None:
    scenes = load_json(paths.TRAVEL_CONTENT / "scenes.json")
    lexicon = load_lexicon()
    index = {s["id"]: s for s in scenes["scenes"]}
    loc = load_json(paths.TRAVEL_CONTENT / f"{location_id}.json")
    scene = load_json(paths.TRAVEL_CONTENT / f"{loc['scene']}.json")
    resolved = resolve(loc, scene, lexicon)

    # the level content is shared by every location of the scene
    by_enc = {e["id"]: e for e in resolved["encounters"]}
    merged = {level: {"phrases": [], "dialogue": []} for level in LEVELS}
    for name in loc["encounters"]:
        enc = by_enc[name]
        for level in LEVELS:
            merged[level]["phrases"] += enc["levels"][level]["phrases"]
            merged[level]["dialogue"] += enc["levels"][level]["dialogue"]
    resolved["level_content"] = merged

    bg = paths.TRAVEL_APP / resolved["background"]
    if not bg.exists():
        raise SystemExit(f"missing background: {bg}")

    sprites = build_audio(resolved)
    html = build_page(resolved, sprites)
    out = paths.TRAVEL_APP / f"{location_id}.html"
    out.write_text(html, encoding="utf-8")
    print(f"{out.relative_to(paths.ROOT)}  {out.stat().st_size // 1024} KB")


def build_index() -> None:
    scenes = load_json(paths.TRAVEL_CONTENT / "scenes.json")
    cards = []
    for scene in scenes["scenes"]:
        for lid in scene.get("locations", []):
            path = paths.TRAVEL_CONTENT / f"{lid}.json"
            if not path.exists():
                continue
            loc = load_json(path)
            cards.append(
                f'<a class="card" href="/travel/{lid}.html">'
                f'<strong>{loc["title_en"]}</strong>'
                f'<span>{loc["title_zh"]}</span></a>')
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Travel English</title>
<style>
  :root {{ --bg:#fff; --fg:#1d1d1f; --muted:#66666c; --rule:#e0e0e0;
    --surface:#f5f5f7; --accent:var(--blue,#0066cc); --on-accent:var(--on-blue,#fff);
    --font:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable",
      "Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
    color-scheme:light; }}
  @media (prefers-color-scheme: dark) {{
    :root {{ --bg:#000; --fg:#f5f5f7; --muted:#98989d; --rule:#38383a;
      --surface:#1c1c1e; --accent:var(--blue,#2997ff); color-scheme:dark; }}
  }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--fg); font-family:var(--font); }}
  .page {{ max-width:760px; margin:0 auto; padding:clamp(28px,5vh,56px) 20px 96px; }}
  .crumbs {{ margin:0 0 12px; color:var(--muted); font-size:13px; }}
  .crumbs a {{ color:var(--muted); text-decoration:none; }}
  h1 {{ margin:0 0 22px; font-size:clamp(1.7rem,4.4vw,2.4rem); font-weight:700;
    letter-spacing:-0.03em; }}
  .grid {{ display:grid; gap:10px; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); }}
  .card {{ display:block; padding:18px 20px; border:1px solid var(--rule);
    border-radius:14px; color:var(--fg); text-decoration:none; }}
  .card:hover {{ background:var(--surface); }}
  .card strong {{ display:block; font-size:17px; }}
  .card span {{ display:block; margin-top:3px; color:var(--muted); font-size:14px; }}
</style>
</head>
<body><div class="page">
<p class="crumbs"><a href="/">NPESL</a> / Travel English</p>
<h1>Travel English</h1>
<div class="grid">{''.join(cards)}</div>
</div>
<script src="/theme.js"></script>
</body></html>
"""
    out = paths.TRAVEL_APP / "index.html"
    out.write_text(html, encoding="utf-8")
    print(f"{out.relative_to(paths.ROOT)}  {out.stat().st_size // 1024} KB")


def main(argv: list[str]) -> int:
    scenes = load_json(paths.TRAVEL_CONTENT / "scenes.json")
    wanted = argv[1:] or [lid for s in scenes["scenes"] for lid in s.get("locations", [])
                          if (paths.TRAVEL_CONTENT / f"{lid}.json").exists()]
    for lid in wanted:
        build(lid)
    build_index()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
