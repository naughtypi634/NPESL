#!/usr/bin/env python3
"""Suggest a 1-5 usage-frequency score for every collocation head.

wordfreq is free, offline and covers one to three word phrases.  For longer
chunks we fall back to the most frequent 1-3 word subphrase, then to 3 and flag
it as "fallback" for manual review.  The report is input for the editorial pass;
the build only reads the final `freq` written into content files.

    .venv\\Scripts\\python.exe -I tools\\collocation\\score_frequency.py

Output:
    build/collocation-freq-report.csv
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

from wordfreq import zipf_frequency

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content" / "collocation"
PHRASEBOOK = ROOT / "build" / "phrasebook" / "rows.json"
OUT = ROOT / "build" / "collocation-freq-report.csv"


def load_legacy():
    rows = []
    for path in sorted(CONTENT.glob("*.json")):
        if path.name in {"themes.json", "opposites.json",
                         "frequency-overrides.json"}:
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        entries = doc.get("entries", [])
        for index, entry in enumerate(entries):
            head = " ".join(str(entry.get("head", "")).split())
            if not head:
                continue
            rows.append({
                "source": "legacy",
                "theme": path.stem,
                "kind": entry.get("kind", ""),
                "tier": entry.get("tier"),
                "head": head,
                "zh": entry.get("zh", ""),
                "index": index,
                "count": len(entries),
            })
    return rows


def load_phrasebook():
    if not PHRASEBOOK.exists():
        print(f"缺少 {PHRASEBOOK}，先跑 import_phrasebook.py")
        return []
    doc = json.loads(PHRASEBOOK.read_text(encoding="utf-8"))
    rows = []
    for topic in doc.get("topics", []):
        for row in topic.get("rows", []):
            rows.append({
                "source": "pdf",
                "theme": topic.get("title_en", ""),
                "kind": "chunk",
                "tier": None,
                "head": row.get("head", ""),
                "zh": row.get("zh", ""),
                "index": row.get("position", 0),
                "count": len(topic.get("rows", [])),
            })
    return rows


def best_zipf(head: str):
    head = head.lower().replace("’", "'")
    value = zipf_frequency(head, "en")
    if value > 0:
        return value, "head"
    tokens = head.split()
    if len(tokens) > 3:
        best, best_text = 0.0, ""
        for size in (3, 2, 1):
            for start in range(len(tokens) - size + 1):
                phrase = " ".join(tokens[start:start + size])
                value = zipf_frequency(phrase, "en")
                if value > best:
                    best, best_text = value, phrase
        if best > 0:
            return best, f"sub:{best_text}"
    return 0.0, "fallback"


def bucket_by_rank(rows):
    """场景内排序：现有内容以原顺序为主，wordfreq 和 tier 只做微调。

    wordfreq 衡量的是“英语里总体常见”，会把 bag up / let up 这类场景里不实用
    的词推到第一屏。现有源文件顺序本来就是按词书/教学编排的，所以位置占七成，
    频率两成，tier 一成。PDF 新条目没有原顺序，仍按 wordfreq 排名。
    """
    groups = {}
    for row in rows:
        groups.setdefault((row["source"], row["theme"]), []).append(row)
    for (source, _), items in groups.items():
        zips = [row["zipf"] for row in items]
        zmin, zmax = min(zips), max(zips)
        if source == "legacy":
            for row in items:
                position = 1 - row["index"] / max(1, row["count"] - 1)
                spread = (row["zipf"] - zmin) / (zmax - zmin) if zmax > zmin else 0.5
                tier = row.get("tier")
                tier_score = 1.0 if tier == 1 else 0.0 if tier == 3 else 0.5
                row["score"] = 0.70 * position + 0.20 * spread + 0.10 * tier_score
        else:
            for row in items:
                row["score"] = row["zipf"]
        items.sort(key=lambda row: (-row["score"], row["head"]))
        size = len(items)
        for index, row in enumerate(items):
            share = index / max(1, size)
            if share < 0.15:
                freq = 5
            elif share < 0.40:
                freq = 4
            elif share < 0.65:
                freq = 3
            elif share < 0.85:
                freq = 2
            else:
                freq = 1
            if isinstance(row.get("tier"), int):
                if row["tier"] == 1:
                    freq = max(freq, 4)
                elif row["tier"] == 3:
                    freq = min(freq, 3)
            row["suggested_freq"] = freq


def main() -> int:
    rows = load_legacy() + load_phrasebook()
    if not rows:
        return 1

    for row in rows:
        zipf, method = best_zipf(row["head"])
        row["zipf"] = round(zipf, 2)
        row["method"] = method
    bucket_by_rank(rows)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    rows.sort(key=lambda row: (
        row["source"], row["theme"], -row["suggested_freq"],
        -row["zipf"], row["head"]))
    with OUT.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow([
            "source", "theme", "kind", "tier", "head", "zh",
            "zipf", "method", "suggested_freq",
        ])
        for row in rows:
            writer.writerow([
                row["source"], row["theme"], row["kind"], row.get("tier", ""),
                row["head"], row["zh"], row["zipf"], row["method"],
                row["suggested_freq"],
            ])

    fallback = sum(1 for row in rows if row["method"] == "fallback")
    legacy = sum(1 for row in rows if row["source"] == "legacy")
    pdf = len(rows) - legacy
    print(f"词条 {len(rows)} 条（现有 {legacy}，PDF {pdf}）")
    print(f"无频率回退到 3：{fallback} 条")
    print(f"报告：{OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
