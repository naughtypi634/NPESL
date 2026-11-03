#!/usr/bin/env python3
"""Dump 短语搭配 entries for the opposite-pair audit.

Outputs (gitignored):
    build/opposites-review/<NN>-<theme>.md   per-theme readable sheet
    build/opposites-review/all.tsv           every entry on one line

Usage:
    .venv\\Scripts\\python.exe -I tools\\phrasal\\report_opposites.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import BUILD, PHRASAL_CONTENT  # noqa: E402


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    themes_doc = json.loads((PHRASAL_CONTENT / "themes.json").read_text(encoding="utf-8"))
    themes = themes_doc["themes"]
    out_dir = BUILD / "opposites-review"
    out_dir.mkdir(parents=True, exist_ok=True)

    all_lines = ["theme\ttheme_zh\tid\thead\tkind\tzh\tsenses"]
    total = 0
    for number, theme in enumerate(themes, 1):
        doc = json.loads((PHRASAL_CONTENT / f"{theme['id']}.json").read_text(encoding="utf-8"))
        entries = doc["entries"]
        total += len(entries)
        lines = [
            f"# {number:02d} {theme['title_zh']} · {theme['title_en']}",
            "",
            f"{len(entries)} 条",
            "",
        ]
        for entry in entries:
            senses = "；".join(
                f"{s.get('zh', '')}（{s.get('en', '')}）" for s in entry.get("senses", [])
            )
            lines.append(f"- **{entry['head']}** `{entry['id']}` [{entry.get('kind')}] — {entry['zh']}")
            lines.append(f"  - {senses}")
            all_lines.append(
                "\t".join(
                    [
                        theme["id"],
                        theme["title_zh"],
                        entry["id"],
                        entry["head"],
                        entry.get("kind", ""),
                        entry["zh"],
                        senses,
                    ]
                )
            )
        (out_dir / f"{number:02d}-{theme['id']}.md").write_text(
            "\n".join(lines) + "\n", encoding="utf-8"
        )
    (out_dir / "all.tsv").write_text("\n".join(all_lines) + "\n", encoding="utf-8")
    print(f"wrote {len(themes)} theme sheets + all.tsv ({total} entries) to {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
