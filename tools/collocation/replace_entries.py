#!/usr/bin/env python3
"""Replace a phrasebook entry in place (same id, new head/sense).

    {
      "theme": "errands",
      "items": [
        {"id": "abide-by", "head": "play by the rules", "zh": "按规矩来",
         "freq": 4, "register": "neutral", "chip": "errands",
         "en": "...", "ex_zh": "..."}
      ]
    }

Entries become `chunk` unless `"kind"` is given.  Old phrasal fields
(base/particle/separable/ipa) are removed so the card does not show stale
metadata.

    .venv\\Scripts\\python.exe -I tools\\collocation\\replace_entries.py --file build/batches/errands-fix.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content" / "collocation"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    args = parser.parse_args()

    batch = json.loads(Path(args.file).read_text(encoding="utf-8"))
    theme = batch["theme"]
    items = {item["id"]: item for item in batch["items"]}
    path = CONTENT / f"{theme}.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    found = set()
    for entry in doc.get("entries", []):
        item = items.get(entry.get("id"))
        if not item:
            continue
        found.add(entry["id"])
        entry["head"] = item["head"]
        entry["kind"] = item.get("kind", "chunk")
        entry["zh"] = item["zh"]
        entry["freq"] = int(item.get("freq", 3))
        entry["register"] = item.get("register", "neutral")
        entry["chip"] = item["chip"]
        for key in ("base", "particle", "separable", "ipa"):
            entry.pop(key, None)
        entry["senses"] = [{
            "zh": item.get("sense_zh", item["zh"]),
            "example": {"en": item["en"], "zh": item["ex_zh"]},
        }]
        if item.get("l1"):
            entry["l1_note"] = item["l1"]
        else:
            entry.pop("l1_note", None)
        entry["confusables"] = []
        entry["collocations"] = []
        entry["collocations_zh"] = []
    missing = sorted(set(items) - found)
    if missing:
        print(f"未找到：{missing}")
        return 1
    path.write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{theme}: 替换 {len(found)} 条")
    return 0


if __name__ == "__main__":
    sys.exit(main())
