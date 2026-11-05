#!/usr/bin/env python3
"""Write suggested `freq` values into existing collocation theme files.

Manual values already present are kept.  The report comes from
tools/collocation/score_frequency.py.

    .venv\\Scripts\\python.exe -I tools/collocation/apply_frequency.py           # dry run
    .venv\\Scripts\\python.exe -I tools/collocation/apply_frequency.py --write   # apply
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content" / "collocation"
REPORT = ROOT / "build" / "collocation-freq-report.csv"


def load_report():
    scores = {}
    if not REPORT.exists():
        raise SystemExit(f"缺少 {REPORT}，先跑 score_frequency.py")
    with REPORT.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if row["source"] != "legacy":
                continue
            key = (row["theme"], " ".join(row["head"].split()).lower())
            scores[key] = int(row["suggested_freq"])
    return scores


def insert_freq(entry, value):
    """Put freq after kind (or after head) without disturbing other keys."""
    if "freq" in entry:
        entry["freq"] = value
        return True
    ordered = {}
    placed = False
    for key, item in entry.items():
        ordered[key] = item
        if key == "kind":
            ordered["freq"] = value
            placed = True
    if not placed:
        ordered["freq"] = value
    entry.clear()
    entry.update(ordered)
    return True


def load_overrides():
    path = CONTENT / "frequency-overrides.json"
    if not path.exists():
        return {}
    doc = json.loads(path.read_text(encoding="utf-8"))
    return {key: int(value) for key, value in doc.items()
            if isinstance(value, int) and 1 <= value <= 5}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--force", action="store_true",
                        help="覆盖已有 freq（默认保留手动值）")
    parser.add_argument("--only", help="只处理一个主题 id")
    args = parser.parse_args()

    scores = load_report()
    overrides = load_overrides()
    changed = 0
    missing = 0
    for path in sorted(CONTENT.glob("*.json")):
        if path.name in {"themes.json", "opposites.json",
                         "frequency-overrides.json"}:
            continue
        theme = path.stem
        if args.only and theme != args.only:
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        touched = 0
        for entry in doc.get("entries", []):
            head = " ".join(str(entry.get("head", "")).split()).lower()
            value = scores.get((theme, head))
            override = overrides.get(entry.get("id"))
            if override is not None:
                value = override
            elif "freq" in entry and not args.force:
                continue
            elif value is None:
                missing += 1
                value = 3
            insert_freq(entry, value)
            touched += 1
        changed += touched
        if touched and args.write:
            path.write_text(
                json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8")
        print(f"{theme:<16} +{touched}")

    print(f"\n{'已写入' if args.write else '将写入'} {changed} 条；"
          f"报告缺失按 3 处理 {missing} 条")
    return 0


if __name__ == "__main__":
    sys.exit(main())
