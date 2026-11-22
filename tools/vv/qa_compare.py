# -*- coding: utf-8 -*-
"""把一个场景的三种画风并排画上同一套热点框，检查坐标是否通用。

    python -I tools/vv/qa_compare.py --page kitchen-cleaning
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import VV_CONTENT  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "build" / "vv-work"
STYLES = ["iso-flat", "iso-pixar", "iso-illust"]
TW = 680


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", required=True)
    args = ap.parse_args()
    spec = json.loads((VV_CONTENT / "scenes" / f"{args.page}.json").read_text(encoding="utf-8"))

    tiles = []
    for style in STYLES:
        src = WORK / "style" / style / f"{args.page}.png"
        if not src.exists():
            continue
        im = Image.open(src).convert("RGB")
        im = im.resize((TW, int(im.height * TW / im.width)), Image.LANCZOS)
        d = ImageDraw.Draw(im)
        w, h = im.size
        try:
            font = ImageFont.truetype("arial.ttf", 14)
        except OSError:
            font = ImageFont.load_default()
        for word in spec["words"]:
            x0, y0, x1, y1 = word["box"]
            d.rectangle([x0 / 100 * w, y0 / 100 * h, x1 / 100 * w, y1 / 100 * h],
                        outline=(255, 40, 40), width=2)
            d.text((x0 / 100 * w + 2, y0 / 100 * h + 1), word["slug"],
                   fill=(255, 40, 40), font=font)
        d.text((8, 6), style, fill=(0, 160, 255), font=font)
        tiles.append(im)

    if not tiles:
        print("没有图")
        return 1
    W = sum(t.width for t in tiles)
    H = max(t.height for t in tiles)
    sheet = Image.new("RGB", (W, H), (18, 18, 18))
    x = 0
    for t in tiles:
        sheet.paste(t, (x, 0))
        x += t.width
    out = WORK / "qa" / f"{args.page}.compare.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
