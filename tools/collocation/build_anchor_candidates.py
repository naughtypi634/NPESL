#!/usr/bin/env python3
"""Build the anchor-word candidate table for card-level near-synonyms.

Candidates come from three places:
  * the editorial A1-B1 seed list below (the six coverage groups);
  * existing collocation heads that are `be + adjective`;
  * phrasebook rows that are `be/feel/get/look + adjective`.

The table is a review aid.  Frequency comes from wordfreq; whether a concept
can carry three genuinely different alternatives is decided while writing, not
by this script.

    .venv\\Scripts\\python.exe -I tools\\collocation\\build_anchor_candidates.py

Output:
    build/collocation-anchor-candidates.csv
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

from wordfreq import zipf_frequency

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content" / "collocation"
PHRASEBOOK = ROOT / "build" / "phrasebook" / "rows.json"
OUT = ROOT / "build" / "collocation-anchor-candidates.csv"

SEED = {
    "feelings": """
        tired busy happy sad angry scared nervous bored excited disappointed
        annoyed embarrassed surprised confused lonely jealous worried relieved
        satisfied frustrated calm proud grateful guilty hopeful curious shocked
        upset hurt fed-up
    """,
    "body": """
        hungry thirsty full sleepy sick in-pain cold hot warm dizzy sore itchy
    """,
    "people": """
        good bad great terrible pretty ugly handsome cute funny serious smart
        stupid lazy hardworking kind rude polite friendly shy outgoing brave
        weak strong rich poor young old stylish
    """,
    "things": """
        expensive cheap interesting boring useful useless important urgent
        possible impossible true false ready late early free available dangerous
        safe messy neat noisy quiet crowded
    """,
    "degree": """
        fast slow easy difficult quickly slowly really very a-lot often rarely
        maybe probably definitely absolutely totally almost enough
    """,
    "appearance": """
        tall short fat thin big small heavy light
    """,
}

THEME_GUESS = {
    "feelings": "feelings",
    "body": "feeling-off",
    "people": "chatting",
    "things": "shopping",
    "degree": "communication",
    "appearance": "ootd",
}

ADJECTIVE_TAIL = re.compile(
    r"(ed|ing|ful|ous|ive|able|ible|al|y|less|ic|ant|ent|ary|ory|ish|like)$")

DEGREE_ADJECTIVES = {"easy", "difficult", "fast", "slow"}


def normalize(text: str) -> str:
    return " ".join(text.lower().replace("’", "'").split())


def anchor_of(word: str) -> str:
    word = normalize(word).strip("-")
    return word if word.startswith("be ") or " " in word else f"be {word}"


def seed_candidates():
    rows = []
    for group, words in SEED.items():
        for word in words.split():
            text = word.replace("-", " ")
            if group == "degree" and text not in DEGREE_ADJECTIVES:
                anchor = text
            else:
                anchor = anchor_of(text)
            rows.append({
                "anchor": anchor,
                "source": f"seed:{group}",
                "theme": THEME_GUESS[group],
            })
    return rows


def legacy_candidates():
    rows = []
    for path in sorted(CONTENT.glob("*.json")):
        if path.name in {"themes.json", "opposites.json"}:
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        for entry in doc.get("entries", []):
            head = normalize(entry.get("head", ""))
            if head.startswith("be ") and len(head.split()) == 2:
                rows.append({
                    "anchor": head,
                    "source": f"legacy:{path.stem}",
                    "theme": path.stem,
                })
    return rows


def phrasebook_candidates():
    if not PHRASEBOOK.exists():
        return []
    doc = json.loads(PHRASEBOOK.read_text(encoding="utf-8"))
    rows = []
    for topic in doc.get("topics", []):
        for row in topic.get("rows", []):
            head = normalize(row.get("head", ""))
            parts = head.split()
            if len(parts) == 2 and parts[0] in {"be", "feel", "get", "look", "seem", "sound"}:
                word = parts[1]
                if ADJECTIVE_TAIL.search(word) or word in {
                        "good", "bad", "great", "fine", "okay", "sure", "ready"}:
                    rows.append({
                        "anchor": anchor_of(word),
                        "source": f"pdf:{topic.get('title_en', '')}",
                        "theme": THEME_GUESS.get("body", "feelings")
                        if word in {
                            "hungry", "thirsty", "full", "sleepy", "sick",
                            "cold", "hot", "warm", "dizzy", "sore", "itchy"}
                        else "feelings",
                    })
    return rows


def main() -> int:
    rows = seed_candidates() + legacy_candidates() + phrasebook_candidates()
    merged = {}
    for row in rows:
        key = row["anchor"]
        if key not in merged:
            merged[key] = {
                "anchor": key,
                "sources": set(),
                "theme": row["theme"],
            }
        merged[key]["sources"].add(row["source"])

    output = []
    for anchor, item in merged.items():
        base = anchor[3:] if anchor.startswith("be ") else anchor
        zipf = zipf_frequency(base, "en")
        output.append({
            "anchor": anchor,
            "base": base,
            "sources": ";".join(sorted(item["sources"])),
            "suggested_theme": item["theme"],
            "zipf": round(zipf, 2),
            "keep": "",
            "note_zh": "",
        })

    output.sort(key=lambda row: (row["suggested_theme"], -row["zipf"], row["anchor"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "anchor", "base", "sources", "suggested_theme", "zipf",
            "keep", "note_zh"])
        writer.writeheader()
        writer.writerows(output)

    from collections import Counter
    print(f"候选 {len(output)} 个；来源分布 {dict(Counter(row['sources'].split(';')[0].split(':')[0] for row in output))}")
    print(f"  {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
