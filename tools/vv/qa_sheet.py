# -*- coding: utf-8 -*-
"""把某一画风下的热点框拼成一张对照图，快速检查坐标是否还压得住物件。

    python -I tools/vv/qa_sheet.py --style flat [--topic kitchen]
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
TILE_W = 760


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--style", required=True, choices=["flat", "clay", "ink", "pixar", "iso-flat", "iso-pixar", "iso-illust"])
    ap.add_argument("--topic", default="")
    ap.add_argument("--cols", type=int, default=2)
    args = ap.parse_args()

    topics = json.loads((VV_CONTENT / "topics.json").read_text(encoding="utf-8"))["topics"]
    pages = []
    for t in topics:
        if args.topic and t["id"] != args.topic:
            continue
        for item in t.get("scenes", []):
            if isinstance(item, str):
                pages.append(item)

    tiles = []
    for page in pages:
        src = WORK / "style" / args.style / f"{page}.png"
        if not src.exists():
            continue
        spec = json.loads((VV_CONTENT / "scenes" / f"{page}.json").read_text(encoding="utf-8"))
        im = Image.open(src).convert("RGB")
        im = im.resize((TILE_W, int(im.height * TILE_W / im.width)), Image.LANCZOS)
        draw = ImageDraw.Draw(im)
        w, h = im.size
        for word in spec["words"]:
            x0, y0, x1, y1 = word["box"]
            draw.rectangle([x0 / 100 * w, y0 / 100 * h,
                            x1 / 100 * w, y1 / 100 * h],
                           outline=(255, 40, 40), width=2)
            draw.text((x0 / 100 * w + 2, y0 / 100 * h + 1), word["slug"],
                      fill=(255, 255, 0))
        draw.text((6, 6), page, fill=(255, 255, 255))
        tiles.append(im)

    if not tiles:
        print("没有图")
        return 1

    cols = args.cols
    rows = (len(tiles) + cols - 1) // cols
    tw, th = tiles[0].size
    sheet = Image.new("RGB", (tw * cols, th * rows), (20, 20, 20))
    for i, tile in enumerate(tiles):
        sheet.paste(tile, ((i % cols) * tw, (i // cols) * th))
    out = WORK / "qa" / f"sheet-{args.style}{'-' + args.topic if args.topic else ''}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(out, len(tiles), "tiles")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
