#!/usr/bin/env python3
"""清理 Question Drill 里题库已不再引用的音频母版和 sprite。

只删 questions.json 里没有引用的文件；引用的一个不动。
音频 id 是英文句子的 sha1 前 12 位，和 assemble.audio_id 一致。

    python -I tools/drill/prune_audio.py          # 只统计
    python -I tools/drill/prune_audio.py --write  # 删除孤儿文件
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT / "content" / "drill" / "questions.json"
AUDIO = ROOT / "apps" / "drill" / "audio"


def audio_id(text: str) -> str:
    norm = " ".join(text.split()).lower()
    return hashlib.sha1(norm.encode("utf-8")).hexdigest()[:12]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    bank = json.loads(BANK.read_text(encoding="utf-8"))
    ref_audio = set()
    ref_sprites = set()
    for q in bank:
        for a in q.get("answers", []):
            ref_audio.add(a.get("audio") or audio_id(a["en"]))
        for voice, name in (q.get("sp") or {}).items():
            ref_sprites.add(f"{name}-{voice}.mp3")

    total = 0
    for voice in ("f", "m"):
        folder = AUDIO / voice
        orphan = [p for p in folder.glob("*.mp3") if p.stem not in ref_audio]
        size = sum(p.stat().st_size for p in orphan)
        print(f"{voice}: {len(list(folder.glob('*.mp3')))} 条，孤儿 {len(orphan)} 条，{size / 1024 / 1024:.1f} MB")
        total += len(orphan)
        if args.write:
            for p in orphan:
                p.unlink()

    sprites = AUDIO / "sprites"
    orphan_sprites = [p for p in sprites.glob("*.mp3") if p.name not in ref_sprites]
    size = sum(p.stat().st_size for p in orphan_sprites)
    print(f"sprites: {len(list(sprites.glob('*.mp3')))} 条，孤儿 {len(orphan_sprites)} 条，{size / 1024 / 1024:.1f} MB")
    total += len(orphan_sprites)
    if args.write:
        for p in orphan_sprites:
            p.unlink()

    print(f"{'已删除' if args.write else '可删除'} {total} 条")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
