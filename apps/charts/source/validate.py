#!/usr/bin/env python3
"""Validate the Business Charts content before it is inlined into the page.

    python -I apps/charts/source/validate.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CONTENT = ROOT / "content" / "charts"
sys.path.insert(0, str(ROOT / "tools"))

import check_bre  # noqa: E402

LEVELS = {"A2", "B1", "B2", "C1"}
RENDERERS = {"line", "area", "bar", "hbar", "table", "pie", "scatter", "combo"}
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
COUNT_RE = re.compile(r"\d+\s*(个|条|种|张)")
CLICHES = [
    "over the moon",
    "raining cats and dogs",
    "piece of cake",
    "once in a blue moon",
    "cost an arm and a leg",
    "break the ice",
    "think outside the box",
    "at the end of the day",
    "last but not least",
    "double-edged sword",
]
FILES = {
    "types": "chart-types.json",
    "labs": "labs.json",
    "vocab": "vocabulary.json",
    "grammar": "grammar.json",
    "errors": "errors.json",
}


class Problems:
    def __init__(self) -> None:
        self.items: list[str] = []

    def add(self, where: str, message: str) -> None:
        self.items.append(f"{where}: {message}")


def load(problems: Problems) -> dict:
    data = {}
    for key, name in FILES.items():
        path = CONTENT / name
        try:
            data[key] = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            problems.add(name, "file is missing")
            data[key] = {}
        except json.JSONDecodeError as exc:
            problems.add(name, f"invalid JSON: {exc}")
            data[key] = {}
    return data


def walk_strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from walk_strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from walk_strings(item)


def check_english(value, where: str, problems: Problems) -> None:
    text = str(value)
    for pattern, replacement, note in check_bre.FIX:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            label = note or replacement
            problems.add(where, f"British spelling '{match.group(0)}' -> {label}")


def check_content(data: dict, problems: Problems) -> None:
    types = data.get("types", {}).get("sections", [])
    if len(types) != 8:
        problems.add("chart-types.json", "expected exactly eight chart sections")
    seen = set()
    for section in types:
        where = f"chart-type {section.get('id', '?')}"
        if section.get("id") in seen:
            problems.add(where, "duplicate id")
        seen.add(section.get("id"))
        if not ID_RE.match(str(section.get("id", ""))):
            problems.add(where, "id is not kebab-case")
        if section.get("renderer") not in RENDERERS:
            problems.add(where, f"unknown renderer {section.get('renderer')!r}")
        if section.get("dataset") not in data.get("labs", {}).get("datasets", {}):
            problems.add(where, "dataset is missing from labs.json")
        for pattern in section.get("patterns", []):
            if pattern.get("level") not in LEVELS:
                problems.add(where, f"bad pattern level {pattern.get('level')!r}")
            if len(str(pattern.get("en", "")).split()) < 4:
                problems.add(where, "pattern example is too short")

    labs = data.get("labs", {})
    datasets = labs.get("datasets", {})
    for key in ("time", "category", "shares", "points"):
        if key not in datasets:
            problems.add("labs.json", f"dataset {key} is missing")
    shares = datasets.get("shares", {}).get("parts", [])
    if shares and sum(float(part.get("value", 0)) for part in shares) != 100:
        problems.add("labs.json", "pie shares must add up to 100")
    for part in shares:
        if not ID_RE.match(str(part.get("id", ""))):
            problems.add("labs.json", f"bad pie part id {part.get('id')!r}")

    vocab = data.get("vocab", {})
    groups = {group.get("id") for group in vocab.get("groups", [])}
    entries = vocab.get("entries", [])
    seen_vocab = set()
    for entry in entries:
        where = f"vocab {entry.get('id', '?')}"
        if entry.get("id") in seen_vocab:
            problems.add(where, "duplicate id")
        seen_vocab.add(entry.get("id"))
        if not ID_RE.match(str(entry.get("id", ""))):
            problems.add(where, "id is not kebab-case")
        if entry.get("group") not in groups:
            problems.add(where, f"unknown group {entry.get('group')!r}")
        if entry.get("level") not in LEVELS:
            problems.add(where, f"bad level {entry.get('level')!r}")
        words = len(str(entry.get("example_en", "")).split())
        if words < 4 or words > 28:
            problems.add(where, f"example has {words} words (expected 4-28)")

    grammar = data.get("grammar", {})
    converter = grammar.get("converter", {})
    for verb in converter.get("verbs", []):
        for key in ("id", "base", "past", "noun", "level", "zh"):
            if not verb.get(key):
                problems.add("grammar.json", f"converter verb missing {key}")
    for adverb in converter.get("adverbs", []):
        for key in ("id", "adverb", "adjective", "level", "zh"):
            if not adverb.get(key):
                problems.add("grammar.json", f"converter adverb missing {key}")
    for pattern in grammar.get("patterns", []):
        if pattern.get("level") not in LEVELS:
            problems.add("grammar.json", f"{pattern.get('id')}: bad level")

    errors = data.get("errors", {}).get("errors", [])
    for error in errors:
        for key in ("id", "level", "wrong_en", "right_en", "why_zh"):
            if not error.get(key):
                problems.add("errors.json", f"{error.get('id', '?')}: missing {key}")

    for path, value in (
        ("content", data),
    ):
        for text in walk_strings(value):
            low = text.lower()
            for cliche in CLICHES:
                if cliche in low:
                    problems.add(path, f"cliched phrase: {cliche}")
            check_english(text, path, problems)

    for section in types:
        for key in ("label_zh", "definition_zh", "best_for_zh", "watch_out_zh", "ielts_tip_zh"):
            if COUNT_RE.search(str(section.get(key, ""))):
                problems.add(f"chart-type {section.get('id')}", f"count/meta text in {key}")
    for group in vocab.get("groups", []):
        if COUNT_RE.search(str(group.get("title_zh", ""))):
            problems.add("vocabulary.json", "count/meta text in a group title")


def check_source_files(problems: Problems) -> None:
    """The page's templates live in JS/CSS, so scan them too."""
    root = ROOT / "apps" / "charts" / "source"
    for path in root.rglob("*"):
        if path.suffix not in {".js", ".css", ".html"}:
            continue
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for pattern, replacement, note in check_bre.FIX:
                match = re.search(pattern, line, flags=re.IGNORECASE)
                if match:
                    label = note or replacement
                    problems.add(
                        f"{path.relative_to(ROOT)}:{lineno}",
                        f"British spelling '{match.group(0)}' -> {label}",
                    )


def main() -> int:
    problems = Problems()
    data = load(problems)
    if not problems.items:
        check_content(data, problems)
    check_source_files(problems)
    if problems.items:
        print(f"FIX = {len(problems.items)}")
        for item in problems.items:
            print(f"  - {item}")
        return 1
    print("OK: content validates")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
