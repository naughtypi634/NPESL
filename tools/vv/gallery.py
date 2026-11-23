# -*- coding: utf-8 -*-
"""三画风逐场景对照图：每个主题一张，行=场景，列=等距扁平 / 皮克斯 / 插画。

    python -I tools/vv/gallery.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import VV_CONTENT  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "build" / "vv-work"
OUT = WORK / "qa"
STYLES = [("iso-flat", "等距扁平"), ("iso-pixar", "等距皮克斯3D"), ("iso-illust", "等距插画")]
TW = 460
LABEL_H = 30


def font(size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", size)
    except OSError:
        return ImageFont.load_default()


def main() -> int:
    topics = json.loads((VV_CONTENT / "topics.json").read_text(encoding="utf-8"))["topics"]
    OUT.mkdir(parents=True, exist_ok=True)
    f = font(16)
    for topic in topics:
        pages = [x for x in topic.get("scenes", []) if isinstance(x, str)]
        rows = []
        for page in pages:
            tiles = []
            for style, _ in STYLES:
                src = WORK / "style" / style / f"{page}.png"
                if not src.exists():
                    tiles.append(None)
                    continue
                im = Image.open(src).convert("RGB")
                im = im.resize((TW, int(im.height * TW / im.width)), Image.LANCZOS)
                tiles.append(im)
            if any(tiles):
                rows.append((page, tiles))
        if not rows:
            continue
        h = max(t.height for _, ts in rows for t in ts if t) + LABEL_H
        W = TW * len(STYLES)
        sheet = Image.new("RGB", (W, h * len(rows)), (16, 16, 16))
        d = ImageDraw.Draw(sheet)
        for ri, (page, tiles) in enumerate(rows):
            y = ri * h
            d.text((8, y + 6), page, fill=(255, 220, 120), font=f)
            for ci, t in enumerate(tiles):
                x = ci * TW
                if t:
                    sheet.paste(t, (x, y + LABEL_H))
                if ri == 0:
                    d.text((x + 8, y + 6), STYLES[ci][1], fill=(120, 200, 255), font=f)
        dest = OUT / f"gallery-{topic['id']}.jpg"
        sheet.save(dest, "JPEG", quality=88, optimize=True)
        print(dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
