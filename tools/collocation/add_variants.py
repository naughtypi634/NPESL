#!/usr/bin/env python3
"""Attach `variants` (card-level near-synonyms) to existing entries.

    {
      "items": [
        {"id": "be-tired", "variants": [ ... ]},
        {"id": "im-so-happy", "variants": [ ... ]}
      ]
    }

    .venv\\Scripts\\python.exe -I tools\\collocation\\add_variants.py --file build/batches/variants-a.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content" / "collocation"
SKIP = {"themes.json", "opposites.json", "frequency-overrides.json"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    args = parser.parse_args()

    batch = json.loads(Path(args.file).read_text(encoding="utf-8"))
    targets = {item["id"]: item["variants"] for item in batch.get("items", [])}
    found = set()
    for path in sorted(CONTENT.glob("*.json")):
        if path.name in SKIP:
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        changed = False
        for entry in doc.get("entries", []):
            if entry.get("id") in targets:
                entry["variants"] = targets[entry["id"]]
                found.add(entry["id"])
                changed = True
        if changed:
            path.write_text(
                json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8")
    missing = sorted(set(targets) - found)
    if missing:
        print(f"未找到：{missing}")
        return 1
    print(f"variants 已写入 {len(found)} 条")
    return 0


if __name__ == "__main__":
    sys.exit(main())
