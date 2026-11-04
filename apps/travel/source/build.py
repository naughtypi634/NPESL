#!/usr/bin/env python3
"""Build the Travel English app.

    python -I apps/travel/source/build.py
    python -I apps/travel/source/build.py --only airport --skip-audio
    python -I apps/travel/source/build.py --index-only

Source of truth is content/travel/ — scenes.json plus one <scene>.json per
scene.  Audio masters are content-addressed; each scene/level gets three
sprites (phrase female, phrase male, dialogue), and each scene gets two
listening sprites (how-they-might-ask, female/male).  Maps render both a 2D
architectural plan and a 3D isometric model from the same layout data.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import html
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CONTENT = ROOT / "content" / "travel"
BASE = ROOT / "apps" / "travel"
AUDIO = BASE / "audio"

sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(HERE))

import audio_sprite  # noqa: E402
import azure_speech  # noqa: E402
import edge_tts  # noqa: E402
from maps import render_map  # noqa: E402

LEVELS = ("survival", "conversational", "advanced")
VOICES = {"f": "en-US-AvaNeural", "m": "en-US-AndrewNeural"}
RATE = "+0%"
PLAY_SVG = ('<svg viewBox="0 0 24 24" width="8" height="8" fill="currentColor" '
            'aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
            '<span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>')
PLAY_ICON = ('<svg class="play-icon" viewBox="0 0 24 24" aria-hidden="true">'
             '<path d="M8 5v14l11-7z"/></svg>')
STOP_ICON = ('<svg class="stop-icon" viewBox="0 0 24 24" aria-hidden="true">'
             '<rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>')

ICONS = {
    "terminal": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
                'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
                '<path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/>'
                '<path d="M9 21v-6h6v6"/><path d="M9 11h.01M15 11h.01"/></svg>',
    "cabin": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
             'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
             '<path d="M3 12l18-7-7 18-2.5-7.5L3 12z"/></svg>',
    "passport": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
                'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
                '<rect x="5" y="3" width="14" height="18" rx="2"/>'
                '<circle cx="12" cy="9.5" r="2.5"/><path d="M9 16h6"/></svg>',
    "metro": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
             'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
             '<rect x="5" y="3" width="14" height="14" rx="4"/>'
             '<path d="M5 10h14"/><circle cx="9" cy="14" r="1.1"/>'
             '<circle cx="15" cy="14" r="1.1"/><path d="M8 21l2-4M16 21l-2-4"/></svg>',
    "train": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
             'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
             '<rect x="3" y="6" width="18" height="10" rx="3"/>'
             '<path d="M3 11h18"/><circle cx="7" cy="16" r="1.4"/>'
             '<circle cx="17" cy="16" r="1.4"/><path d="M8 19l-2 2M16 19l2 2"/></svg>',
    "taxi": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
            '<path d="M4 15l1.6-5.2A2 2 0 0 1 7.5 8h9a2 2 0 0 1 1.9 1.8L20 15"/>'
            '<rect x="3" y="14" width="18" height="4" rx="2"/>'
            '<circle cx="7" cy="18" r="1.4"/><circle cx="17" cy="18" r="1.4"/>'
            '<path d="M10 8V6h4v2"/></svg>',
    "key": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
           'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
           '<circle cx="8" cy="8" r="3.5"/><path d="M10.5 10.5L20 20"/>'
           '<path d="M16 16l2-2M18 18l2-2"/></svg>',
    "steering": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
                'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
                '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/>'
                '<path d="M12 14v6M5.2 8.6C7.2 7.6 9.5 7 12 7s4.8.6 6.8 1.6"/></svg>',
    "station": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
               'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
               '<rect x="5" y="3" width="14" height="13" rx="3"/>'
               '<path d="M8 20l2-4M16 20l-2-4M5 10h14"/></svg>',
    "street": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
              'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
              '<path d="M4 15l1.6-5.2A2 2 0 0 1 7.5 8h9a2 2 0 0 1 1.9 1.8L20 15"/>'
              '<rect x="3" y="14" width="18" height="4" rx="2"/>'
              '<circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/></svg>',
    "retail": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
              'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
              '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    "dining": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
              'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
              '<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10"/>'
              '<path d="M17 3c-2 2-2 6 0 8v10"/></svg>',
    "lobby": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
             'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
             '<path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6"/>'
             '<path d="M3 18h18M6 10V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3"/></svg>',
    "room": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
            '<rect x="5" y="3" width="14" height="18" rx="2"/>'
            '<path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01"/>'
            '<path d="M10 21v-3h4v3"/></svg>',
    "clinic": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
              'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
              '<path d="M12 4v16M4 12h16"/></svg>',
    "office": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
              'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
              '<rect x="3" y="7" width="18" height="13" rx="2"/>'
              '<path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18"/></svg>',
    "attraction": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
                  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
                  '<rect x="3" y="7" width="18" height="13" rx="2"/>'
                  '<circle cx="12" cy="13" r="3"/><path d="M8 7l1.5-2h5L16 7"/></svg>',
    "coffee": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
              'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
              '<path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z"/>'
              '<path d="M17 10h2a3 3 0 0 1 0 6h-2M7 4v2M11 3v3"/></svg>',
    "pill": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
            '<rect x="3.5" y="8" width="17" height="8" rx="4" transform="rotate(-45 12 12)"/>'
            '<path d="M9 9l6 6"/></svg>',
    "shield": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
              'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
              '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/>'
              '<path d="M9 12l2 2 4-4"/></svg>',
    "cocktail": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
                'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
                '<path d="M4 4h16l-8 9-8-9zM12 13v7M8 21h8"/></svg>',
    "chat": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
            '<path d="M4 5h16v11H9l-5 4V5z"/><path d="M8 9h8M8 12h5"/></svg>',
    "card": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
            '<rect x="3" y="5" width="18" height="14" rx="2"/>'
            '<path d="M3 10h18M7 15h4"/></svg>',
    "signal": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
              'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
              '<path d="M5 19v-3M10 19v-6M15 19v-9M20 19V7"/></svg>',
    "pin": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
           'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
           '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/>'
           '<circle cx="12" cy="10" r="2.5"/></svg>',
}

SCENE_ICONS = {
    "airport": "terminal", "on-the-plane": "cabin", "arrival": "passport",
    "subway": "metro", "trains": "train", "taxi": "taxi",
    "car-rental": "key", "driving": "steering", "directions": "pin",
    "hotel": "lobby", "rental-stay": "room", "restaurant": "dining",
    "cafe": "coffee", "shopping": "retail", "pharmacy": "pill",
    "doctor": "clinic", "police": "shield", "sights": "attraction",
    "nightlife": "cocktail", "small-talk": "chat", "money": "card",
    "connectivity": "signal", "business": "office",
}


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def clip_rel(text: str, voice: str, rate: str = RATE) -> str:
    text = " ".join(text.split())
    digest = hashlib.sha1(f"{text}|{voice}|{rate}".encode("utf-8")).hexdigest()[:16]
    return f"{voice}/{digest[:2]}/{digest}.mp3"


def scene_number(scenes: list[dict]) -> dict[str, int]:
    return {scene["id"]: index + 1 for index, scene in enumerate(scenes)}


def page_name(scene: dict, numbers: dict[str, int]) -> str:
    return f"{numbers[scene['id']]:02d}-{slugify(scene['id'])}.html"


def speaker_voice(content: dict, speaker_id: str) -> str:
    for speaker in content.get("speakers", []):
        if speaker.get("id") == speaker_id:
            return speaker.get("voice", "f")
    raise ValueError(f"{content.get('scene')}: unknown speaker {speaker_id!r}")


def text_jobs(content: dict) -> dict[tuple[str, str], str]:
    jobs: dict[tuple[str, str], str] = {}
    for enc in content.get("encounters", []):
        for level in LEVELS:
            data = enc["levels"][level]
            for phrase in data.get("phrases", []):
                for voice in ("f", "m"):
                    jobs[(phrase["en"], voice)] = clip_rel(phrase["en"], voice)
            for line in data.get("dialogue", []):
                voice = speaker_voice(content, line["spk"])
                jobs[(line["en"], voice)] = clip_rel(line["en"], voice)
        for intent in enc.get("listening", []):
            for item in [*intent["asks"], intent["reply"]]:
                for voice in ("f", "m"):
                    jobs[(item["en"], voice)] = clip_rel(item["en"], voice)
    return jobs


async def edge_synth(text: str, voice: str, semaphore) -> bytes:
    async with semaphore:
        last = None
        for attempt in range(5):
            try:
                communicate = edge_tts.Communicate(text, VOICES[voice], rate=RATE)
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


async def ensure_clips(jobs: dict[tuple[str, str], str], backend: str) -> None:
    missing = [(text, voice, rel) for (text, voice), rel in jobs.items()
               if not (AUDIO / rel).exists()]
    print(f"audio: {len(jobs)} clips, {len(missing)} to synthesize ({backend})")
    if not missing:
        return
    semaphore = asyncio.Semaphore(5)
    done = 0

    async def one(text: str, voice: str, rel: str) -> str | None:
        nonlocal done
        path = AUDIO / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            if backend == "azure":
                data = await asyncio.to_thread(
                    azure_speech.synthesize, text, VOICES[voice], RATE)
            else:
                data = await edge_synth(text, voice, semaphore)
            path.write_bytes(data)
            return None
        except Exception as error:  # noqa: BLE001 - retry in the next pass
            return f"{rel}: {error}"
        finally:
            done += 1
            if done % 20 == 0 or done == len(missing):
                print(f"audio: {done}/{len(missing)}", flush=True)

    pending = missing
    for attempt in range(5):
        failures = await asyncio.gather(*(one(*job) for job in pending))
        failed = [job for job, error in zip(pending, failures) if error]
        if not failed:
            print("audio: done")
            return
        print(f"audio: {len(failed)} failed, retrying ({attempt + 1}/5)", flush=True)
        print(f"audio: first error: {next(e for e in failures if e)}", flush=True)
        pending = failed
        await asyncio.sleep(5 * (attempt + 1))
    raise RuntimeError(f"audio failed: {len(pending)} clips; first: {pending[0]}")


def concat_sprite(picks: list[tuple[str, Path]]) -> tuple[str, list[tuple[float, float]]]:
    missing = [rel for rel, path in picks if not path.exists()]
    if missing:
        raise RuntimeError(f"missing clips: {missing[:3]}")
    blob, spans = audio_sprite.concat([path.read_bytes() for _, path in picks])
    name = audio_sprite.name_for([
        f"{rel}:{hashlib.sha1(path.read_bytes()).hexdigest()[:10]}"
        for rel, path in picks
    ])
    rel = f"sprites/{name}.mp3"
    dst = AUDIO / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(blob)
    return rel, spans


def build_level_audio(content: dict, level: str) -> dict:
    encounters = content["encounters"]
    phrase_items = []
    for enc in encounters:
        for index, phrase in enumerate(enc["levels"][level]["phrases"]):
            phrase_items.append((enc["id"], index, phrase["en"]))
    dialogue_items = []
    for enc in encounters:
        for index, line in enumerate(enc["levels"][level]["dialogue"]):
            dialogue_items.append((enc["id"], index, line["en"],
                                   speaker_voice(content, line["spk"])))

    sprites: dict[str, str] = {}
    spans: dict[tuple[str, str, int], object] = {}

    for voice in ("f", "m"):
        picks = [(clip_rel(text, voice), AUDIO / clip_rel(text, voice))
                 for _, _, text in phrase_items]
        rel, offsets = concat_sprite(picks)
        sprites[f"{level}-p-{voice}"] = rel
        for (eid, index, _), span in zip(phrase_items, offsets):
            spans.setdefault((eid, "p", index), {})[voice] = span

    picks = [(clip_rel(text, voice), AUDIO / clip_rel(text, voice))
             for _, _, text, voice in dialogue_items]
    rel, offsets = concat_sprite(picks)
    sprites[f"{level}-d"] = rel
    for (eid, index, _, _), span in zip(dialogue_items, offsets):
        spans[(eid, "d", index)] = span
    return {"sprites": sprites, "spans": spans}


def build_listening_audio(content: dict) -> dict:
    """One sprite per voice for all "how they might ask" lines in a scene."""
    items = []
    for enc in content["encounters"]:
        for intent in enc.get("listening", []):
            for index, ask in enumerate(intent["asks"]):
                items.append((enc["id"], intent["id"], "ask", index, ask["en"]))
            items.append((enc["id"], intent["id"], "reply", 0,
                          intent["reply"]["en"]))

    sprites: dict[str, str] = {}
    spans: dict[tuple[str, str, str, int], dict[str, tuple[float, float]]] = {}
    if not items:
        return {"sprites": sprites, "spans": spans}

    for voice in ("f", "m"):
        picks = [(clip_rel(text, voice), AUDIO / clip_rel(text, voice))
                 for _, _, _, _, text in items]
        rel, offsets = concat_sprite(picks)
        sprites[f"listen-{voice}"] = rel
        for (eid, iid, kind, index, _), span in zip(items, offsets):
            spans.setdefault((eid, iid, kind, index), {})[voice] = span
    return {"sprites": sprites, "spans": spans}



def esc(text: str) -> str:
    return html.escape(str(text), quote=True)


def span_attrs(span: dict | None) -> str:
    attrs = ""
    for voice in ("f", "m"):
        value = (span or {}).get(voice)
        if value:
            attrs += f' data-start-{voice}="{value[0]:.3f}"' \
                     f' data-end-{voice}="{value[1]:.3f}"'
    return attrs


def mark_keys(text: str, keys: list[str]) -> str:
    for key in keys or []:
        match = re.search(re.escape(key), text, re.I)
        if match:
            return (esc(text[:match.start()])
                    + f'<mark class="key">{esc(match.group(0))}</mark>'
                    + esc(text[match.end():]))
    return esc(text)


def render_hotspots(hotspots: list[dict]) -> str:
    out = []
    for index, spot in enumerate(hotspots, 1):
        out.append(
            f'<button class="hotspot" type="button" '
            f'style="--x2d:{spot["left"]}%;--y2d:{spot["top"]}%;'
            f'--x3d:{spot.get("left3d", spot["left"])}%;'
            f'--y3d:{spot.get("top3d", spot["top"])}%" '
            f'data-hotspot="{esc(spot["id"])}" data-zone="{esc(spot["zone"])}" '
            f'data-encounter="{esc(spot["encounter"])}" '
            f'aria-pressed="{"true" if index == 1 else "false"}" '
            f'aria-controls="panel-{esc(spot["encounter"])}">'
            f'<span class="hs-num">{index}</span>'
            f'<span class="hs-text"><span class="hs-en">'
            f'{esc(spot.get("short_en", ""))}</span>'
            f'<span class="hs-zh">{esc(spot.get("short_zh", ""))}</span></span>'
            f'</button>'
        )
    return "\n      ".join(out)


def render_listening(enc: dict, spans: dict) -> str:
    intents = enc.get("listening") or []
    if not intents:
        return ""
    out = ['<section class="listening"><h2>对方可能这样问</h2>'
           '<div class="intents">']
    for intent in intents:
        out.append('<article class="intent">')
        out.append(f'<h3>{esc(intent["intent_zh"])}</h3>')
        out.append('<div class="asks">')
        for index, ask in enumerate(intent["asks"]):
            attrs = span_attrs(spans.get(
                (enc["id"], intent["id"], "ask", index)))
            out.append(
                f'<button class="ask" type="button" data-sprite="listen"{attrs}>'
                f'<span class="en">{mark_keys(ask["en"], intent.get("keys", []))}</span>'
                f'<span class="zh">{esc(ask["zh"])}</span>'
                f'<span class="play" aria-hidden="true">{PLAY_SVG}</span></button>'
            )
        out.append('</div>')
        reply = intent["reply"]
        attrs = span_attrs(spans.get((enc["id"], intent["id"], "reply", 0)))
        out.append(
            f'<button class="reply" type="button" data-sprite="listen"{attrs}>'
            f'<span class="reply-tag">答</span>'
            f'<span class="reply-body"><span class="en">{esc(reply["en"])}</span>'
            f'<span class="zh">{esc(reply["zh"])}</span></span>'
            f'<span class="play" aria-hidden="true">{PLAY_SVG}</span></button>'
        )
        out.append(f'<p class="pattern"><span class="plabel">句型</span>'
                   f'{esc(intent["pattern"])}</p>')
        if intent.get("note"):
            out.append(f'<p class="listen-note">{esc(intent["note"])}</p>')
        out.append('</article>')
    out.append('</div></section>')
    return "".join(out)


def render_encounters(content: dict, level_audio: dict, default_level: str,
                      listen_audio: dict | None = None) -> str:
    speakers = {sp["id"]: sp for sp in content.get("speakers", [])}
    listen_spans = (listen_audio or {}).get("spans", {})
    out = []
    for enc_index, enc in enumerate(content["encounters"]):
        hidden = "" if enc_index == 0 else " hidden"
        out.append(
            f'<section class="encounter" id="panel-{esc(enc["id"])}" '
            f'data-encounter="{esc(enc["id"])}"{hidden}>'
            f'<header class="encounter-head"><h2>{esc(enc["title_en"])}'
            f'<span class="zh">{esc(enc["title_zh"])}</span></h2></header>'
        )

        # 说：这个场景里你会说的话
        for level in LEVELS:
            panel_hidden = "" if level == default_level else " hidden"
            spans = level_audio.get(level, {}).get("spans", {})
            data = enc["levels"][level]
            out.append(
                f'<div class="level-panel phrases-panel" data-level="{level}"'
                f'{panel_hidden}><div class="phrases">'
            )
            for index, phrase in enumerate(data["phrases"]):
                attrs = span_attrs(spans.get((enc["id"], "p", index)))
                note = (f'<span class="note">{esc(phrase["note"])}</span>'
                        if phrase.get("note") else "")
                out.append(
                    f'<button class="phrase" type="button" data-part="p"{attrs}>'
                    f'<span class="en">{esc(phrase["en"])}</span>'
                    f'<span class="zh">{esc(phrase["zh"])}</span>{note}'
                    f'<span class="play" aria-hidden="true">{PLAY_SVG}</span></button>'
                )
            out.append('</div></div>')

        # 听：对方可能这样说（与难度无关，只渲染一次）
        out.append(render_listening(enc, listen_spans))

        # 对话
        for level in LEVELS:
            panel_hidden = "" if level == default_level else " hidden"
            spans = level_audio.get(level, {}).get("spans", {})
            data = enc["levels"][level]
            out.append(
                f'<div class="level-panel dialogue-panel" data-level="{level}"'
                f'{panel_hidden}><div class="dialogue">'
            )
            out.append('<div class="dialogue-tools">'
                       '<button class="play-all" type="button" '
                       f'data-play-dialogue aria-pressed="false">{PLAY_ICON}{STOP_ICON}'
                       '<span data-play-label>播放对话</span></button>'
                       '<button class="pill speed" type="button" '
                       'data-speed>0.9×</button></div><div class="turns">')
            for index, line in enumerate(data["dialogue"]):
                span = spans.get((enc["id"], "d", index))
                attrs = ""
                if span:
                    attrs = f' data-start="{span[0]:.3f}" data-end="{span[1]:.3f}"'
                speaker = speakers.get(line["spk"], {})
                role = speaker.get("role", "staff")
                who = speaker.get("en", line["spk"])
                out.append(
                    f'<div class="line" data-role="{role}" '
                    f'data-spk="{esc(line["spk"])}">'
                    f'<span class="who">{esc(who)}</span>'
                    f'<button class="say" type="button" data-part="d"{attrs}>'
                    f'<span class="en">{esc(line["en"])}</span>'
                    f'<span class="zh">{esc(line["zh"])}</span></button></div>'
                )
            out.append('</div></div></div>')
        out.append('</section>')
    return "\n\n  ".join(out)


def build_scene(scene: dict, scenes_doc: dict, numbers: dict[str, int],
                backend: str, skip_audio: bool, allow_missing: bool) -> None:
    sid = scene["id"]
    content = load_json(CONTENT / f"{sid}.json")
    map_data = render_map(scene)

    level_audio: dict[str, dict] = {}
    listen_audio: dict = {"sprites": {}, "spans": {}}
    if not skip_audio:
        for level in LEVELS:
            try:
                level_audio[level] = build_level_audio(content, level)
            except RuntimeError as error:
                if allow_missing:
                    print(f"warn {sid}/{level}: {error}")
                    level_audio[level] = {"sprites": {}, "spans": {}}
                else:
                    raise
        try:
            listen_audio = build_listening_audio(content)
        except RuntimeError as error:
            if allow_missing:
                print(f"warn {sid}/listening: {error}")
            else:
                raise

    sprite_map: dict[str, str] = {}
    for level, audio in level_audio.items():
        sprite_map.update(audio.get("sprites", {}))
    sprite_map.update(listen_audio.get("sprites", {}))

    default_level = scenes_doc.get("default_level", "survival")
    stage = next((s for s in scenes_doc["stages"] if s["id"] == scene["stage"]), {})
    template = (HERE / "template.html").read_text(encoding="utf-8")
    title = f'{scene["title_en"]} · 旅行英语'
    replacements = {
        "<!--TITLE-->": esc(title),
        "<!--DEFAULT_LEVEL-->": esc(default_level),
        "<!--STAGE-->": esc(f'{stage.get("title_zh", "")} · {stage.get("title_en", "")}'),
        "<!--TITLE_EN-->": esc(scene["title_en"]),
        "<!--TITLE_ZH-->": esc(scene["title_zh"]),
        "<!--MAP_SVG_2D-->": map_data["svg2d"],
        "<!--MAP_SVG_3D-->": map_data["svg3d"],
        "<!--HOTSPOTS-->": render_hotspots(map_data["hotspots"]),
        "<!--ENCOUNTERS-->": render_encounters(content, level_audio,
                                               default_level, listen_audio),
        "<!--SPRITES-->": json.dumps(sprite_map, ensure_ascii=False,
                                     separators=(",", ":")).replace("</", "<\\/"),
    }
    for marker, value in replacements.items():
        if marker not in template:
            raise SystemExit(f"template missing {marker}")
        template = template.replace(marker, value)
    out = BASE / page_name(scene, numbers)
    out.write_text(template, encoding="utf-8")
    print(f"built {out.name} ({len(map_data['hotspots'])} hotspots, "
          f"{len(sprite_map)} sprites)")


def build_index(scenes_doc: dict, numbers: dict[str, int]) -> None:
    stages_html = []
    for stage in scenes_doc["stages"]:
        cards = []
        for sid in stage["scenes"]:
            scene = next((s for s in scenes_doc["scenes"] if s["id"] == sid), None)
            if not scene or not (CONTENT / f"{sid}.json").exists():
                continue
            icon_key = SCENE_ICONS.get(sid) or scene.get("map", {}).get("archetype")
            icon = ICONS.get(icon_key, ICONS["terminal"])
            cards.append(
                f'<a class="card scene-card" href="{page_name(scene, numbers)}">'
                f'<span class="scene-icon" aria-hidden="true">{icon}</span>'
                f'<span class="scene-title"><span class="en">{esc(scene["title_en"])}</span>'
                f'<span class="zh">{esc(scene["title_zh"])}</span></span>'
                f'<span class="arrow">›</span></a>'
            )
        if not cards:
            continue
        stages_html.append(
            f'<section class="stage-group"><h2 class="stage-head">'
            f'{esc(stage["title_zh"])}<span class="stage-en">'
            f'{esc(stage["title_en"])}</span></h2><div class="scene-list">'
            + "\n".join(cards) + '</div></section>'
        )
    template = (HERE / "index_template.html").read_text(encoding="utf-8")
    template = template.replace("<!--SCENES-->", "\n\n  ".join(stages_html))
    out = BASE / "index.html"
    out.write_text(template, encoding="utf-8")
    print(f"built index.html ({len(stages_html)} stages)")


async def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Build Travel English pages")
    parser.add_argument("--only", nargs="*", help="scene ids to build")
    parser.add_argument("--skip-audio", action="store_true",
                        help="render pages without rebuilding sprites")
    parser.add_argument("--index-only", action="store_true")
    parser.add_argument("--tts", choices=["azure", "edge"], default="azure")
    parser.add_argument("--allow-missing-audio", action="store_true",
                        help="development only: render pages with partial audio")
    args = parser.parse_args()

    scenes_doc = load_json(CONTENT / "scenes.json")
    scenes = scenes_doc["scenes"]
    numbers = scene_number(scenes)

    if args.index_only:
        build_index(scenes_doc, numbers)
        return 0

    selected = scenes
    if args.only:
        unknown = [sid for sid in args.only if sid not in {s["id"] for s in scenes}]
        if unknown:
            print(f"unknown scene: {', '.join(unknown)}", file=sys.stderr)
            return 2
        wanted = set(args.only)
        selected = [s for s in scenes if s["id"] in wanted]

    if not args.skip_audio:
        all_jobs: dict[tuple[str, str], str] = {}
        for scene in selected:
            all_jobs.update(text_jobs(load_json(CONTENT / f"{scene['id']}.json")))
        await ensure_clips(all_jobs, args.tts)

    for scene in selected:
        build_scene(scene, scenes_doc, numbers, args.tts,
                    args.skip_audio, args.allow_missing_audio)

    if not args.only:
        build_index(scenes_doc, numbers)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
