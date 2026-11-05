#!/usr/bin/env python3
"""Extract the phrasebook skeleton (head + Chinese gloss + topic), not examples.

The PDF is gitignored reference material.  This script physically never reads
the italic example column (x >= 300) into any output; examples are rewritten
from scratch during authoring.

    .venv\\Scripts\\python.exe -I tools\\collocation\\import_phrasebook.py

Outputs (build/ is gitignored):
    build/phrasebook/rows.json
    build/phrasebook/aliases.review.csv
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "apps" / "collocation" / "Phrasebook-Complete.pdf"
CONTENT = ROOT / "content" / "collocation"
OUT = ROOT / "build" / "phrasebook"

PART_TITLE_SIZE = 13.4
TOPIC_SIZE = 11.5
TOPIC_ZH_SIZE = 9.5
NUMBER_SIZE = 8.0
HEAD_MAX_X = 210
ZH_MIN_X = 210
ZH_MAX_X = 315
EXAMPLE_MIN_X = 300


def slug(text: str) -> str:
    text = text.lower().replace("’", "'").replace("‘", "'")
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text


def clean(text: str) -> str:
    return " ".join(text.replace("’", "'").replace("‘", "'").split())


def load_heads():
    heads = {}
    if not CONTENT.exists():
        return heads
    for path in sorted(CONTENT.glob("*.json")):
        if path.name in {"themes.json", "opposites.json"}:
            continue
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        for entry in doc.get("entries", []):
            head = clean(str(entry.get("head", ""))).lower()
            if head:
                heads[head] = {
                    "id": entry.get("id", ""),
                    "theme": path.stem,
                    "zh": entry.get("zh", ""),
                    "senses": [
                        str(sense.get("zh", "")).strip()
                        for sense in entry.get("senses", [])
                    ],
                }
    return heads


def collect_spans(page):
    spans = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span.get("text", "").strip()
                if not text:
                    continue
                spans.append({
                    "x": span["bbox"][0],
                    "y": span["bbox"][1],
                    "size": round(span["size"], 1),
                    "font": span.get("font", ""),
                    "text": text,
                })
    return spans


def nearest(items, y, tolerance=5.0):
    best = None
    best_gap = tolerance
    for item in items:
        gap = abs(item["y"] - y)
        if gap < best_gap:
            best, best_gap = item, gap
    return best


def parse():
    doc = pymupdf.open(PDF)
    topics = []
    examples = []
    current_part = None
    current_topic = None

    for page_index, page in enumerate(doc, 1):
        spans = collect_spans(page)
        heading_zh = [
            s for s in spans
            if s["x"] > 450 and abs(s["size"] - TOPIC_ZH_SIZE) < 0.3
        ]
        ordered = sorted(spans, key=lambda s: (s["y"], s["x"]))
        for span in ordered:
            size = round(span["size"], 1)
            if abs(size - PART_TITLE_SIZE) < 0.15:
                current_part = {
                    "title": clean(span["text"]),
                    "page": page_index,
                }
                continue
            if abs(size - TOPIC_SIZE) < 0.15 and span["x"] < 100:
                zh = nearest(heading_zh, span["y"], tolerance=8.0)
                current_topic = {
                    "index": len(topics) + 1,
                    "part": current_part["title"] if current_part else "",
                    "title_en": clean(span["text"]),
                    "title_zh": clean(zh["text"]) if zh else "",
                    "page": page_index,
                    "rows": [],
                }
                topics.append(current_topic)
                continue
            if not (abs(size - NUMBER_SIZE) < 0.35 and span["text"].isdigit()):
                continue
            if current_topic is None:
                continue
            row_y = span["y"]
            head = nearest(
                [s for s in spans
                 if 40 <= s["x"] < HEAD_MAX_X and "Bold" in s["font"]
                 and s["size"] < 11],
                row_y,
            )
            zh = nearest(
                [s for s in spans
                 if ZH_MIN_X <= s["x"] < ZH_MAX_X and "NotoSansSC" in s["font"]],
                row_y,
            )
            example = nearest(
                [s for s in spans
                 if s["x"] >= EXAMPLE_MIN_X and "Italic" in s["font"]],
                row_y,
            )
            if not head or not zh:
                raise SystemExit(
                    f"第 {page_index} 页第 {span['text']} 行缺 head/zh："
                    f"{span['text']} head={head} zh={zh}"
                )
            if example:
                examples.append(clean(example["text"]))
            current_topic["rows"].append({
                "position": int(span["text"]),
                "id": "pb-" + slug(clean(head["text"])),
                "head": clean(head["text"]),
                "zh": clean(zh["text"]),
            })

    return doc, topics, examples


def _bigrams(text: str):
    text = re.sub(r"[^一-鿿]", "", text)
    if len(text) < 2:
        return {text} if text else set()
    return {text[i:i + 2] for i in range(len(text) - 1)}


def _similar(left: str, right: str) -> bool:
    """粗判两个中文释义是否同义；只用于给复核表一个建议。"""
    a, b = _bigrams(left), _bigrams(right)
    if not a or not b:
        return left.strip() == right.strip()
    return len(a & b) / min(len(a), len(b)) >= 0.34


def main() -> int:
    if not PDF.exists():
        print(f"缺少 PDF：{PDF}")
        return 1

    doc, topics, examples = parse()
    rows = [row for topic in topics for row in topic["rows"]]
    problems = []
    if len(topics) != 200:
        problems.append(f"话题 {len(topics)} 个（应为 200）")
    if len(rows) != 2000:
        problems.append(f"词条 {len(rows)} 条（应为 2000）")
    for topic in topics:
        if len(topic["rows"]) != 10:
            problems.append(
                f"话题 {topic['index']} {topic['title_en']} 有 {len(topic['rows'])} 条"
            )
    ids = [row["id"] for row in rows]
    if len(set(ids)) != len(ids):
        problems.append("词条 id 不唯一")
    for row in rows:
        if not row["head"] or not row["zh"]:
            problems.append(f"词条 {row['id']} 缺 head 或 zh")

    heads = load_heads()
    overlap = [row for row in rows if row["head"].lower() in heads]
    if len(overlap) != 57:
        problems.append(f"与现有词条重合 {len(overlap)} 条（应为 57）")

    # 版权护栏：输出里不能出现任何 PDF 例句原文。
    dumped = json.dumps(topics, ensure_ascii=False)
    leaked = [example for example in examples if example and example in dumped]
    if leaked:
        problems.append(f"输出里混入了 {len(leaked)} 条 PDF 例句")

    if problems:
        for item in problems:
            print(f"  !! {item}")
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": {
            "pdf": PDF.name,
            "sha256": hashlib.sha256(PDF.read_bytes()).hexdigest(),
            "pages": doc.page_count,
        },
        "topics": topics,
    }
    (OUT / "rows.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    with (OUT / "aliases.review.csv").open(
            "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow([
            "phrase_id", "phrase_head", "phrase_zh", "topic_index", "topic_en",
            "position", "collocation_id", "collocation_zh",
            "collocation_senses", "suggested_relation", "relation",
            "legacy_sense", "note_zh",
        ])
        for topic in topics:
            for row in topic["rows"]:
                match = heads.get(row["head"].lower())
                if not match:
                    continue
                glosses = [match["zh"]] + match["senses"]
                hit = any(_similar(gloss, row["zh"]) for gloss in glosses if gloss)
                writer.writerow([
                    row["id"], row["head"], row["zh"], topic["index"],
                    topic["title_en"], row["position"], match["id"],
                    match["zh"], " / ".join(match["senses"]),
                    "same-sense" if hit else "different-sense",
                    "", "", "",
                ])

    print(f"话题 {len(topics)} 个，词条 {len(rows)} 条，重合 {len(overlap)} 条")
    print(f"  {OUT / 'rows.json'}")
    print(f"  {OUT / 'aliases.review.csv'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
