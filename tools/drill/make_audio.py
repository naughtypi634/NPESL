#!/usr/bin/env python3
"""Synthesize the pronunciation clips for the zh-en practice app.

Every unique English sentence gets one MP3 per voice, next to the deploy copy:

    apps/drill/audio/f/<id>.mp3    en-US-AvaNeural     女声
    apps/drill/audio/m/<id>.mp3    en-US-AndrewNeural  男声

<id> comes from assemble.audio_id(), so the clips and the HTML stay in sync.
Existing files are skipped, which makes the script safe to re-run after adding
questions.

    python -I tools/drill/make_audio.py              # both voices
    python -I tools/drill/make_audio.py --voice f    # 女声 only
    python -I tools/drill/make_audio.py --limit 20   # 先试听 20 条
    python -I tools/drill/make_audio.py --force      # 全部重做

The app falls back to the browser's own speech synthesis when a clip is missing
(for example when the single-file HTML is opened without the audio folder).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent.parent
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import DRILL_APP, DRILL_CONTENT  # noqa: E402

WORK = DRILL_CONTENT
BANK_JSON = WORK / "questions.json"
AUDIO_ROOT = DRILL_APP / "audio"

VOICES = {
    "f": "en-US-AvaNeural",
    "m": "en-US-AndrewNeural",
}

sys.path.insert(0, str(HERE))
from assemble import audio_id  # noqa: E402


def sentences() -> list[tuple[str, str]]:
    bank = json.loads(BANK_JSON.read_text(encoding="utf-8"))
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for q in bank:
        for a in q["answers"]:
            en = a["en"].strip()
            if not en or en in seen:
                continue
            seen.add(en)
            out.append((en, a.get("audio") or audio_id(en)))
    return out


async def synth(text: str, voice: str, tries: int = 4) -> bytes | None:
    for attempt in range(tries):
        try:
            comm = edge_tts.Communicate(text, voice)
            data = b"".join(
                [chunk["data"] async for chunk in comm.stream() if chunk["type"] == "audio"]
            )
            if data:
                return data
        except Exception:  # noqa: BLE001 — network hiccups are expected, retry
            pass
        await asyncio.sleep(0.6 * (attempt + 1))
    return None


async def worker(queue: asyncio.Queue, state: dict, total: int, jobs: int) -> None:
    while True:
        text, aid, key, path = await queue.get()
        try:
            data = await synth(text, VOICES[key])
            if data is None:
                state["failed"].append((key, text))
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                tmp = path.with_suffix(".part")
                tmp.write_bytes(data)
                os.replace(tmp, path)
                state["done"] += 1
                state["bytes"] += len(data)
        finally:
            queue.task_done()
            done = state["done"] + len(state["failed"])
            if done % 50 == 0 or done == total:
                elapsed = time.time() - state["start"]
                rate = done / elapsed if elapsed else 0
                eta = (total - done) / rate / 60 if rate else 0
                pct = done * 100 / total if total else 100
                print(
                    f"  {done}/{total} ({pct:5.1f}%)  "
                    f"{state['bytes'] / 1024 / 1024:5.1f} MB  "
                    f"{rate:.1f} 条/秒  ETA {eta:.0f} 分钟"
                    + (f"  失败 {len(state['failed'])}" if state["failed"] else ""),
                    flush=True,
                )


async def run(keys: list[str], jobs: int, force: bool, limit: int | None) -> int:
    items = sentences()
    queue: asyncio.Queue = asyncio.Queue()
    skipped = 0
    for text, aid in items:
        for key in keys:
            path = AUDIO_ROOT / key / f"{aid}.mp3"
            if path.exists() and not force:
                skipped += 1
                continue
            queue.put_nowait((text, aid, key, path))

    total = queue.qsize()
    print(f"句子 {len(items)} 条 × 音色 {len(keys)} 个 → 需合成 {total} 条，已有 {skipped} 条")
    if not total:
        return 0
    if limit:
        while queue.qsize() > limit:
            queue.get_nowait()
            queue.task_done()
        total = queue.qsize()
        print(f"--limit：只做前 {total} 条")

    state = {"done": 0, "bytes": 0, "failed": [], "start": time.time()}
    tasks = [asyncio.create_task(worker(queue, state, total, jobs)) for _ in range(jobs)]
    await queue.join()
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)

    print(
        f"\n完成 {state['done']} 条，失败 {len(state['failed'])} 条，"
        f"新增 {state['bytes'] / 1024 / 1024:.1f} MB"
    )
    for key, text in state["failed"][:20]:
        print(f"[FAIL] {key}  {text}")
    return 1 if state["failed"] else 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate per-sentence pronunciation clips.")
    ap.add_argument("--voice", choices=["f", "m", "both"], default="both")
    ap.add_argument("--jobs", type=int, default=8, help="并发连接数，默认 8")
    ap.add_argument("--limit", type=int, default=0, help="只合成前 N 条，用于试听")
    ap.add_argument("--force", action="store_true", help="已存在也重做")
    args = ap.parse_args()

    if not BANK_JSON.exists():
        print(f"{BANK_JSON} 不存在，先跑 assemble.py", file=sys.stderr)
        return 1
    keys = ["f", "m"] if args.voice == "both" else [args.voice]
    return asyncio.run(run(keys, args.jobs, args.force, args.limit or None))


if __name__ == "__main__":
    raise SystemExit(main())
