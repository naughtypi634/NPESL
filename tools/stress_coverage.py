#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Report logical-stress coverage per level/unit/story.

    .venv\\Scripts\\python.exe -I tools\\stress_coverage.py
    .venv\\Scripts\\python.exe -I tools\\stress_coverage.py --level ESLSE
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "conversation" / "source"))
sys.path.insert(0, str(ROOT / "tools"))

import build_site  # noqa: E402


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--level", default=None,
                        help="只查一个级别；默认全部")
    args = parser.parse_args()
    levels = [args.level] if args.level else list(build_site.LEVELS)
    grand_total = grand_done = 0
    for level in levels:
        if level not in build_site.LEVELS:
            print(f"未知级别：{level}")
            return 1
        units = build_site.load_level(level)
        level_total = level_done = 0
        details = []
        for ui, unit in enumerate(units, 1):
            unit_total = unit_done = 0
            for story in unit["stories"]:
                total = done = 0
                # title/vocab are not annotated; body/comp/conv are.
                texts = []
                for para in story["text"]:
                    texts.extend(build_site.split_sentences(para))
                texts.extend(story["comp"])
                texts.extend(story["conv"])
                for text in texts:
                    total += 1
                    if build_site.stress_spec(story, text)[0]:
                        done += 1
                unit_total += total
                unit_done += done
                if done < total:
                    details.append(f"u{ui:02d} {story['title']}: {done}/{total}")
            level_total += unit_total
            level_done += unit_done
        grand_total += level_total
        grand_done += level_done
        print(f"{level:6s} {level_done:5d}/{level_total:5d}")
        for line in details[:12]:
            print("   ", line)
        if len(details) > 12:
            print(f"    … 还有 {len(details) - 12} 篇未完成")
    print(f"\n合计 {grand_done}/{grand_total}")
    return 0 if grand_done == grand_total else 1


if __name__ == "__main__":
    raise SystemExit(main())
