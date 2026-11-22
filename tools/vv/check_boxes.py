# -*- coding: utf-8 -*-
"""把热点框画到场景图上，用于核对坐标是否对得上（只出预览图）。

    python -I tools/vv/check_boxes.py --page room-study [--style flat]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import VV_CONTENT, VISUAL_VOCAB_APP  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "build" / "vv-work"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", required=True)
    ap.add_argument("--style", default="", choices=["", "flat", "clay", "ink"])
    ap.add_argument("--grid", action="store_true", help="叠 10% 网格，便于读坐标")
    args = ap.parse_args()

    spec = json.loads((VV_CONTENT / "scenes" / f"{args.page}.json").read_text(encoding="utf-8"))
    src = (WORK / "style" / args.style / f"{args.page}.png") if args.style \
        else (VISUAL_VOCAB_APP / spec["dir"] / spec["image"])
    im = Image.open(src).convert("RGB")
    im.thumbnail((1400, 1400))
    draw = ImageDraw.Draw(im)
    w, h = im.size
    try:
        font = ImageFont.truetype("arial.ttf", 16)
    except OSError:
        font = ImageFont.load_default()
    if args.grid:
        for i in range(1, 10):
            draw.line([(w * i / 10, 0), (w * i / 10, h)], fill=(120, 160, 255), width=1)
            draw.line([(0, h * i / 10), (w, h * i / 10)], fill=(120, 160, 255), width=1)
    for word in spec["words"]:
        x0, y0, x1, y1 = word["box"]
        box = [x0 / 100 * w, y0 / 100 * h, x1 / 100 * w, y1 / 100 * h]
        draw.rectangle(box, outline=(255, 60, 60), width=2)
        draw.text((box[0] + 3, box[1] + 2), word["slug"], fill=(255, 40, 40), font=font)
        px, py = word["pt"]
        r = 4
        draw.ellipse([px / 100 * w - r, py / 100 * h - r,
                      px / 100 * w + r, py / 100 * h + r], fill=(255, 255, 255),
                     outline=(0, 0, 0))
    out = WORK / "qa" / f"{args.page}{'.' + args.style if args.style else ''}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out)
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
