#!/usr/bin/env python3
"""Verify every audio asset referenced by a built site actually exists.

Sprite playback means a page points at one file per voice instead of one per
sentence, so a stale build can reference a file that was never written (or was
cleaned up).  This walks the five apps and resolves each reference against the
deploy trees.

    python -I tools/check_assets.py build/cloudflare-site
    python -I tools/check_assets.py build/npesl-offline
    python -I tools/check_assets.py build/cloudflare-site --audio build/cloudflare-audio

Exit code 0 = every reference resolves.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

AUDIO_SITE = "https://npesl-audio.pages.dev/audio/"
VOICE_DIRS = {"f": "ava", "m": "andrew", "female": "ava", "male": "andrew"}


def load_json_script(text: str, element_id: str) -> dict:
    match = re.search(
        rf'<script id="{element_id}" type="application/json">(.*?)</script>',
        text, re.S)
    if not match:
        return {}
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return {}


def check_page(page: Path, site: Path, audio_site: Path | None) -> list[str]:
    problems: list[str] = []
    text = page.read_text(encoding="utf-8")
    rel_page = page.relative_to(site).as_posix()

    def want(rel: str, note: str) -> None:
        target = (page.parent / rel).resolve()
        if not target.exists():
            problems.append(f"{rel_page}: 缺少 {rel}（{note}）")

    # 自然拼读：audioMap 里是相对 lesson 的 URL
    if "/phonics/lessons/" in f"/{rel_page}":
        for value in load_json_script(text, "audioMap").values():
            if isinstance(value, str) and value.startswith(("../audio/", "audio/")):
                want(value, "lesson audio")

    # 音标表 / 发音现象：sprite 路径写在属性里
    for value in re.findall(r'data-sprite-[fm]="([^"]+)"', text):
        want(value, "ipa sprite")

    # 对话页 / 发音现象：spriteMap + 远程音频站
    sprites = load_json_script(text, "spriteMap")
    for voice, rel in sprites.items():
        if not isinstance(rel, str):
            continue
        if rel_page.startswith("phenomena/"):
            want("audio/" + rel, "phenomena sprite")
        elif rel_page.startswith("conversation/eslse/"):
            # ESLSE 的音频就在页面同级的 audio/<voice>/ 下
            voice_dir = VOICE_DIRS.get(voice, voice)
            target = (page.parent / "audio" / voice_dir / rel).resolve()
            if not target.exists():
                problems.append(
                    f"{rel_page}: 缺少 audio/{voice_dir}/{rel}（eslse sprite）")
        else:
            voice_dir = VOICE_DIRS.get(voice, voice)
            if audio_site is None:
                continue
            target = audio_site / "audio" / voice_dir / rel
            if not target.exists():
                problems.append(f"{rel_page}: 音频站缺少 {voice_dir}/{rel}")

    return problems


def check_drill(site: Path) -> list[str]:
    problems: list[str] = []
    drill = site / "drill"
    banks = sorted(drill.glob("bank.*.js"))
    if not banks:
        return ["drill: 没有 bank.*.js"]
    text = banks[-1].read_text(encoding="utf-8")
    # sp 是 {"f":"<hash>","m":"<hash>"}，用正则提取，避免解析 1MB JSON。
    for block in re.findall(r'"sp":\{"f":"([0-9a-f]+)","m":"([0-9a-f]+)"\}', text):
        for voice, digest in zip(("f", "m"), block):
            target = drill / "audio" / "sprites" / f"{digest}-{voice}.mp3"
            if not target.exists():
                problems.append(f"drill/bank: 缺少 sprites/{digest}-{voice}.mp3")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description="检查构建产物里的音频引用")
    parser.add_argument("site", help="站点根目录，如 build/cloudflare-site")
    parser.add_argument("--audio", help="音频站根目录（默认自动猜 build/cloudflare-audio）")
    args = parser.parse_args()

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    site = Path(args.site).resolve()
    if not site.exists():
        print(f"目录不存在：{site}", file=sys.stderr)
        return 2
    audio_site = Path(args.audio).resolve() if args.audio else None
    if audio_site is None:
        guess = site.parent / "cloudflare-audio"
        audio_site = guess if guess.exists() else None

    problems: list[str] = []
    pages = 0
    for page in sorted(site.rglob("*.html")):
        pages += 1
        problems.extend(check_page(page, site, audio_site))
    if (site / "drill").exists():
        problems.extend(check_drill(site))

    for problem in problems[:40]:
        print("  MISSING", problem)
    if len(problems) > 40:
        print(f"  … 另有 {len(problems) - 40} 条")
    print(f"检查 {pages} 个页面，缺失引用 {len(problems)} 条")
    return 0 if not problems else 1


if __name__ == "__main__":
    raise SystemExit(main())
