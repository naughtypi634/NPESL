#!/usr/bin/env python3
"""Compare raw vs reviewed vs final batch files to see what review changed."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
import sys  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import DRILL_CONTENT  # noqa: E402

WORK = DRILL_CONTENT


def load(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def sig(item: dict) -> tuple:
    return (
        item.get("zh", ""),
        item.get("scene", ""),
        tuple((a.get("en", ""), a.get("note", "")) for a in item.get("answers", [])),
    )


def main() -> int:
    ids = [p.stem.replace("batch-", "") for p in sorted((WORK / "raw").glob("batch-*.json"))]
    total_changed = 0
    for bid in ids:
        raw = load(WORK / "raw" / f"batch-{bid}.json")
        reviewed = load(WORK / "reviewed" / f"batch-{bid}.json")
        final = load(WORK / "final" / f"batch-{bid}.json")
        later = final or reviewed
        if not raw or not later:
            print(f"{bid}: raw={bool(raw)} reviewed={bool(reviewed)} final={bool(final)}")
            continue
        raws = [sig(x) for x in raw.get("items", [])]
        lates = [sig(x) for x in later.get("items", [])]
        changed = sum(1 for a, b in zip(raws, lates) if a != b)
        added = len(lates) - len(raws)
        total_changed += changed
        print(f"{bid}: items {len(raws)} -> {len(lates)} ({added:+d}), changed {changed}")
        if changed and "--show" in sys.argv:
            for a, b in zip(raws, lates):
                if a != b:
                    print("  RAW:", json.dumps(a, ensure_ascii=False)[:220])
                    print("  NEW:", json.dumps(b, ensure_ascii=False)[:220])
                    break
    print(f"total changed {total_changed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
