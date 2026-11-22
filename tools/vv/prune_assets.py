# -*- coding: utf-8 -*-
"""删掉场景目录里没有任何页面引用的旧图（换画风后最容易堆积）。

    python -I tools/vv/prune_assets.py            # 只报告
    python -I tools/vv/prune_assets.py --delete   # 真删
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import VISUAL_VOCAB_APP  # noqa: E402

REF = re.compile(r'(?:src|href|data-mask(?:-[a-z]+)?|data-src-[a-z]+)="([^"]+)"')


def referenced() -> set[str]:
    names = set()
    for page in VISUAL_VOCAB_APP.rglob("*.html"):
        text = page.read_text(encoding="utf-8")
        for url in REF.findall(text):
            names.add(url.split("/")[-1])
    return names


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--delete", action="store_true")
    args = ap.parse_args()

    keep = referenced()
    removed = 0
    freed = 0
    for folder in ("scenes", "scenes/masks"):
        base = VISUAL_VOCAB_APP
        for path in base.rglob(f"assets/{folder}/*"):
            if not path.is_file() or path.name in keep:
                continue
            if path.suffix not in (".webp", ".jpg", ".png"):
                continue
            removed += 1
            freed += path.stat().st_size
            print(("删除 " if args.delete else "未引用 ") + str(path.relative_to(base)))
            if args.delete:
                path.unlink()
    print(f"{removed} 个文件，{freed / 1048576:.1f} MB"
          + ("，已删除" if args.delete else "，未删除（加 --delete）"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
