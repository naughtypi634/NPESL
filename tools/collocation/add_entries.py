#!/usr/bin/env python3
"""Append a compact phrasebook batch to a collocation theme.

Batch format (build/ is gitignored; keep batches there):

    {
      "theme": "home",
      "theme_meta": { ... },          // only when creating a new theme
      "entries": [
        {"id": "pb-sweep-the-floor", "head": "sweep the floor",
         "zh": "扫地", "freq": 4, "register": "neutral", "chip": "home",
         "en": "...", "ex_zh": "...", "l1": "optional"}
      ]
    }

    .venv\\Scripts\\python.exe -I tools\\collocation\\add_entries.py --file build/batches/home-37.json
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
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    batch = json.loads(Path(args.file).read_text(encoding="utf-8"))
    theme = batch["theme"]
    themes_path = CONTENT / "themes.json"
    themes_doc = json.loads(themes_path.read_text(encoding="utf-8"))
    known = {item["id"] for item in themes_doc["themes"]}
    if theme not in known:
        meta = batch.get("theme_meta")
        if not meta:
            raise SystemExit(f"新主题 {theme} 缺 theme_meta")
        themes_doc["themes"].append({"id": theme, **meta})
        if not args.dry_run:
            themes_path.write_text(
                json.dumps(themes_doc, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8")
        print(f"新增主题 {theme}")

    path = CONTENT / f"{theme}.json"
    if path.exists():
        doc = json.loads(path.read_text(encoding="utf-8"))
    else:
        doc = {"theme": theme, "entries": []}
    seen = {entry["id"] for entry in doc["entries"]}
    added = 0
    for item in batch["entries"]:
        if item["id"] in seen:
            continue
        entry = {
            "id": item["id"],
            "head": item["head"],
            "kind": "chunk",
            "zh": item["zh"],
            "freq": int(item["freq"]),
            "register": item.get("register", "neutral"),
            "chip": item["chip"],
            "senses": [{
                "zh": item.get("sense_zh", item["zh"]),
                "example": {"en": item["en"], "zh": item["ex_zh"]},
            }],
        }
        if item.get("l1"):
            entry["l1_note"] = item["l1"]
        if item.get("confusables"):
            entry["confusables"] = item["confusables"]
        if item.get("variants"):
            entry["variants"] = item["variants"]
        doc["entries"].append(entry)
        seen.add(item["id"])
        added += 1

    if not args.dry_run:
        path.write_text(
            json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8")
    print(f"{theme}: +{added} 条，共 {len(doc['entries'])} 条")
    return 0


if __name__ == "__main__":
    sys.exit(main())
