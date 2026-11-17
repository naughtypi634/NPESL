#!/usr/bin/env python3
"""Verify every audio asset referenced by a built site actually exists.

Sprite playback means a page points at one file per voice instead of one per
sentence, so a stale build can reference a file that was never written (or was
cleaned up).  This walks every page in the site and resolves each reference
against the deploy trees.

    python -I tools/check_assets.py build/cloudflare-site
    python -I tools/check_assets.py build/cloudflare-site --audio build/cloudflare-audio

Exit code 0 = every reference resolves.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paths import AUDIO_URL  # noqa: E402

AUDIO_SITE = f"{AUDIO_URL}/audio/"
VOICE_DIRS = {"f": "h2", "m": "c", "female": "h2", "male": "c"}


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

    # 字体已自托管；任何 Google Fonts 残留都说明有页面没重建。
    if "fonts.googleapis.com" in text or "fonts.gstatic.com" in text:
        problems.append(f"{rel_page}: 仍引用 Google Fonts")

    # 短语搭配：data.*.js 里的 spr 表 + 每个词条的 1-based sp 索引
    if rel_page == "collocation/index.html":
        match = re.search(r'<script src="(data\.[0-9a-f]+\.js)"></script>', text)
        if not match:
            problems.append("collocation/index.html: 找不到 data.*.js")
        else:
            data_path = page.parent / match.group(1)
            if not data_path.exists():
                problems.append(f"collocation/index.html: 缺少 {match.group(1)}")
            else:
                raw = data_path.read_text(encoding="utf-8").strip()
                prefix = "window.COLLOCATION_INDEX="
                if raw.startswith(prefix):
                    raw = raw[len(prefix):]
                if raw.endswith(";"):
                    raw = raw[:-1]
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError as exc:
                    problems.append(f"{match.group(1)}: JSON 解析失败（{exc}）")
                    data = {}
                spr = data.get("spr") or []
                for k, row in enumerate(spr, 1):
                    for voice, rel in row.items():
                        if voice in ("f", "m") and rel:
                            want("audio/" + rel, f"collocation chunk {k}")
                for entry in data.get("entries") or []:
                    sp = entry.get("sp", 0)
                    if not sp:
                        continue
                    if not isinstance(sp, int) or not 1 <= sp <= len(spr):
                        problems.append(
                            f"{match.group(1)}: 词条 {entry.get('id')} 的 sp={sp} 越界")
                        continue
                    if any(x is not None for x in entry.get("au") or []):
                        if not (spr[sp - 1].get("f") and spr[sp - 1].get("m")):
                            problems.append(
                                f"{match.group(1)}: 词条 {entry.get('id')} 有音频但 chunk {sp} 缺音色")

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
        if rel_page.startswith(("phenomena/", "collocation/")):
            want("audio/" + rel, "页面自带 sprite")
        else:
            # 对话（含 ESLSE）和音标表都指向独立音频站
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

    # 自托管字体：页面 / theme.css 里引用的 woff2 都必须存在。
    font_refs: set[str] = set()
    theme_css = site / "theme.css"
    if theme_css.exists():
        font_refs.update(re.findall(
            r'/fonts/[A-Za-z0-9._-]+\.woff2', theme_css.read_text(encoding="utf-8")))
    for page in site.rglob("*.html"):
        font_refs.update(re.findall(
            r'/fonts/[A-Za-z0-9._-]+\.woff2', page.read_text(encoding="utf-8")))
    for rel in sorted(font_refs):
        if not (site / rel.lstrip("/")).exists():
            problems.append(f"字体缺少 {rel}")

    # 视觉词汇：词图存在，且子页面都带 loading=lazy。
    for page in sorted(site.glob("visual-vocabulary/*/index.html")):
        text = page.read_text(encoding="utf-8")
        rel_page = page.relative_to(site).as_posix()
        for tag in re.findall(r"<img\b[^>]*>", text):
            if 'src="assets/' in tag and 'loading="lazy"' not in tag:
                problems.append(f"{rel_page}: <img> 没有 loading=lazy")
                break
        for src in re.findall(r'<img\b[^>]*src="([^"]+\.webp)"', text):
            if not (page.parent / src).exists():
                problems.append(f"{rel_page}: 缺少图片 {src}")

    for problem in problems[:40]:
        print("  MISSING", problem)
    if len(problems) > 40:
        print(f"  … 另有 {len(problems) - 40} 条")
    print(f"检查 {pages} 个页面，缺失引用 {len(problems)} 条")
    return 0 if not problems else 1


if __name__ == "__main__":
    raise SystemExit(main())
