# -*- coding: utf-8 -*-
"""给每个场景 × 画风生成带 10% 网格的标注用图。

    python -I tools/vv/make_grids.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import VV_CONTENT  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "build" / "vv-work"
OUT = WORK / "qa" / "tags"
STYLES = ["iso-flat", "iso-pixar", "iso-illust"]


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    n = 0
    for spec_path in sorted((VV_CONTENT / "scenes").glob("*.json")):
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
        page = spec["page"]
        for style in STYLES:
            src = WORK / "style" / style / f"{page}.png"
            if not src.exists():
                continue
            im = Image.open(src).convert("RGB")
            d = ImageDraw.Draw(im)
            w, h = im.size
            for i in range(1, 10):
                d.line([(w * i / 10, 0), (w * i / 10, h)], fill=(90, 140, 255), width=2)
                d.line([(0, h * i / 10), (w, h * i / 10)], fill=(90, 140, 255), width=2)
            im.save(OUT / f"{page}.{style}.png")
            n += 1
    print(f"{n} grids -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
