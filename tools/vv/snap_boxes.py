# -*- coding: utf-8 -*-
"""用颜色分割把人工框自动贴合物件（扁平画风专用）。

    python -I tools/vv/snap_boxes.py --style iso-flat [--page room-study] [--dry]

对每个词条：在框内取主色，向外扩展到同色连通块，取该块的包围盒。
只处理 iso-flat（纯色平涂）；其它画风共用这套框。
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import VV_CONTENT  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "build" / "vv-work"

BG = 246          # 背景亮度阈值
COLOR_TOL = 26    # 主色匹配容差（RGB 欧氏距离）
MIN_PIX = 120     # 小于这个面积视为噪点


def load(page: str, style: str) -> np.ndarray:
    im = Image.open(WORK / "style" / style / f"{page}.png").convert("RGB")
    im.thumbnail((900, 900))
    return np.asarray(im).astype(np.int16), im.size


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--style", default="iso-flat")
    ap.add_argument("--page", action="append", default=[])
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    pages = args.page or [p.stem for p in sorted((VV_CONTENT / "scenes").glob("*.json"))]
    for page in pages:
        spec_path = VV_CONTENT / "scenes" / f"{page}.json"
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
        arr, (W, H) = load(page, args.style)
        h, w, _ = arr.shape
        lum = arr.mean(axis=2)
        fg = lum < BG

        changed = 0
        for word in spec["words"]:
            x0, y0, x1, y1 = word["box"]
            bx0, bx1 = int(x0 / 100 * w), int(x1 / 100 * w)
            by0, by1 = int(y0 / 100 * h), int(y1 / 100 * h)
            pad = 4
            bx0, by0 = max(0, bx0 - pad), max(0, by0 - pad)
            bx1, by1 = min(w, bx1 + pad), min(h, by1 + pad)
            region = arr[by0:by1, bx0:bx1]
            mask = fg[by0:by1, bx0:bx1]
            if mask.sum() < MIN_PIX:
                print(f"  {page}/{word['slug']}: 框内没有前景色")
                continue
            pix = region[mask]
            # 取框内前景的中间色
            color = np.median(pix, axis=0)
            dist = np.sqrt(((arr - color) ** 2).sum(axis=2))
            same = (dist < COLOR_TOL) & fg
            # 从框内同色像素出发，取连通块
            seed = np.argwhere(same[by0:by1, bx0:bx1])
            if not len(seed):
                continue
            sy, sx = seed[len(seed) // 2]
            sy += by0
            sx += bx0
            seen = np.zeros_like(same, dtype=bool)
            q = deque([(sy, sx)])
            seen[sy, sx] = True
            ys, xs = [], []
            while q:
                cy, cx = q.popleft()
                ys.append(cy)
                xs.append(cx)
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and same[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if len(ys) < MIN_PIX:
                continue
            nx0, nx1 = min(xs) / w * 100, (max(xs) + 1) / w * 100
            ny0, ny1 = min(ys) / h * 100, (max(ys) + 1) / h * 100
            # 只在改动合理（不超过原框两倍）时采用
            area_old = (x1 - x0) * (y1 - y0)
            area_new = (nx1 - nx0) * (ny1 - ny0)
            if area_new > area_old * 2.5 or area_new < area_old * 0.2:
                continue
            word["box"] = [round(nx0, 2), round(ny0, 2), round(nx1, 2), round(ny1, 2)]
            word["pt"] = [round((nx0 + nx1) / 2, 2), round((ny0 + ny1) / 2, 2)]
            changed += 1
        if not args.dry:
            spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=1) + "\n",
                                 encoding="utf-8")
        print(f"{page}: {changed}/{len(spec['words'])} 贴合")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
