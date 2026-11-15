#!/usr/bin/env python3
"""Build the Business Charts page as one self-contained HTML file.

    python -I apps/charts/source/build.py          build apps/charts/index.html
    python -I apps/charts/source/build.py --check  validate content only

Source of truth:
    content/charts/*.json          content: types, datasets, phrasing, vocabulary, errors
    apps/charts/source/template.html, style.css, js/*.js
    apps/site/theme.css/.js        inlined so the page opens from file://

The generated apps/charts/index.html is never hand-edited.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

sys.path.insert(0, str(ROOT / "tools"))

from paths import CHARTS_APP, CHARTS_CONTENT, SITE_APP  # noqa: E402
from themes import theme_boot  # noqa: E402
import check_bre  # noqa: E402

OUT = CHARTS_APP / "index.html"

JS_FILES = [
    "01-core.js",
    "02-describe.js",
    "03-charts.js",
    "04-app.js",
]

RENDERER_DATASET = {
    "line": "orders",
    "bar": "sales",
    "table": "sales",
    "pie": "share",
    "process": "steps",
    "combo": "combo",
}
LEVELS = ("basic", "advanced")
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SERIES_COLORS = {f"series-{n}" for n in range(1, 6)}


class Problems:
    def __init__(self) -> None:
        self.items: list[str] = []

    def add(self, where: str, message: str) -> None:
        self.items.append(f"{where}: {message}")


def read_json(name: str):
    return json.loads((CHARTS_CONTENT / name).read_text(encoding="utf-8"))


def load_content() -> dict:
    types = read_json("types.json")
    datasets = read_json("datasets.json")
    datasets.pop("version", None)
    vocab = read_json("vocabulary.json")
    return {
        "levels": types["levels"],
        "types": types["types"],
        "datasets": datasets,
        "describe": read_json("describe.json"),
        "vocabulary": vocab,
        "errors": read_json("errors.json"),
    }


def walk_strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from walk_strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from walk_strings(item)


def check_spelling(data: dict, problems: Problems) -> None:
    for name in ("types", "datasets", "describe", "vocabulary", "errors"):
        for text in walk_strings(data[name]):
            for pattern, replacement, note in check_bre.FIX:
                match = re.search(pattern, text, flags=re.IGNORECASE)
                if match:
                    label = note or replacement
                    problems.add(name, f"British spelling '{match.group(0)}' -> {label}")


def check_types(data: dict, problems: Problems) -> None:
    types = data["types"]
    if len(types) != 6:
        problems.add("types.json", "expected exactly six chart types")
    seen = set()
    sentence_ids = data["describe"]["sentences"]
    group_ids = {g["id"] for g in data["vocabulary"]["groups"]}
    for type_ in types:
        where = f"type {type_.get('id', '?')}"
        if type_.get("id") in seen:
            problems.add(where, "duplicate id")
        seen.add(type_.get("id"))
        if not ID_RE.match(str(type_.get("id", ""))):
            problems.add(where, "id is not kebab-case")
        renderer = type_.get("renderer")
        if renderer not in RENDERER_DATASET:
            problems.add(where, f"unknown renderer {renderer!r}")
        elif type_.get("dataset") != RENDERER_DATASET[renderer]:
            problems.add(where, f"renderer {renderer} needs dataset {RENDERER_DATASET[renderer]}")
        if type_.get("dataset") not in data["datasets"]:
            problems.add(where, "dataset is missing from datasets.json")
        for group in type_.get("vocab_groups", []):
            if group not in group_ids:
                problems.add(where, f"vocab group {group!r} does not exist")
        for sid in type_.get("sentences", []):
            entry = sentence_ids.get(sid)
            if not entry:
                problems.add(where, f"sentence {sid!r} has no phrasing in describe.json")
                continue
            for level in LEVELS:
                phrase = entry.get(level, {})
                if not phrase.get("en") or not phrase.get("zh"):
                    problems.add(where, f"sentence {sid!r} lacks {level} en/zh")
        if not type_.get("sentences"):
            problems.add(where, "no sentences listed")
        for pattern in type_.get("patterns", []):
            if pattern.get("level") not in LEVELS:
                problems.add(where, f"bad pattern level {pattern.get('level')!r}")
            if not pattern.get("en") or not pattern.get("zh"):
                problems.add(where, "pattern needs en and zh")
    orders = [t.get("order") for t in types]
    if sorted(orders) != list(range(1, len(types) + 1)):
        problems.add("types.json", "order values must be 1..n with no gaps")


def check_datasets(data: dict, problems: Problems) -> None:
    ds = data["datasets"]
    for key in ("orders", "sales", "share", "steps", "combo"):
        if key not in ds:
            problems.add("datasets.json", f"dataset {key} is missing")
    if problems.items:
        return

    orders = ds["orders"]
    if len(orders["values"]) != len(orders["periods"]):
        problems.add("datasets.json orders", "values and periods differ in length")
    for v in orders["values"]:
        if not orders["min"] <= v <= orders["max"]:
            problems.add("datasets.json orders", f"value {v} is out of range")

    sales = ds["sales"]
    for series in sales["series"]:
        if len(series["values"]) != len(sales["categories"]):
            problems.add("datasets.json sales", f"series {series['id']} length differs from categories")
        if series.get("color") not in SERIES_COLORS:
            problems.add("datasets.json sales", f"series {series['id']} has no palette color")
        for v in series["values"]:
            if not sales["min"] <= v <= sales["max"]:
                problems.add("datasets.json sales", f"value {v} is out of range")

    share = ds["share"]
    total = sum(p["value"] for p in share["parts"])
    if total != 100:
        problems.add("datasets.json share", f"parts must add up to 100 (got {total})")
    for part in share["parts"]:
        if part["value"] < share["min_share"]:
            problems.add("datasets.json share", f"part {part['id']} is below min_share")
        if not ID_RE.match(part["id"]):
            problems.add("datasets.json share", f"bad part id {part['id']!r}")

    steps = ds["steps"]
    if len(steps["steps"]) < 2:
        problems.add("datasets.json steps", "need at least two steps")
    for step in steps["steps"]:
        if not steps["min"] <= step["minutes"] <= steps["max"]:
            problems.add("datasets.json steps", f"step {step['id']} is out of range")

    combo = ds["combo"]
    n = len(combo["periods"])
    if len(combo["bars"]["values"]) != n or len(combo["line"]["values"]) != n:
        problems.add("datasets.json combo", "bars, line and periods differ in length")
    for v in combo["bars"]["values"]:
        if not combo["bars"]["min"] <= v <= combo["bars"]["max"]:
            problems.add("datasets.json combo", f"bar value {v} is out of range")
    for v in combo["line"]["values"]:
        if not combo["line"]["min"] <= v <= combo["line"]["max"]:
            problems.add("datasets.json combo", f"line value {v} is out of range")


def check_content(data: dict, problems: Problems) -> None:
    check_types(data, problems)
    check_datasets(data, problems)
    check_spelling(data, problems)
    for level in LEVELS:
        if level not in [item["id"] for item in data["levels"]]:
            problems.add("types.json", f"level {level} is missing")


def build(check_only: bool = False) -> int:
    data = load_content()
    problems = Problems()
    check_content(data, problems)
    if problems.items:
        print(f"FIX = {len(problems.items)}")
        for item in problems.items:
            print(f"  - {item}")
        return 1
    if check_only:
        print("OK: content validates")
        return 0

    template = (HERE / "template.html").read_text(encoding="utf-8")
    theme_css = (SITE_APP / "theme.css").read_text(encoding="utf-8")
    theme_js = (SITE_APP / "theme.js").read_text(encoding="utf-8")
    app_css = (HERE / "style.css").read_text(encoding="utf-8")
    app_js = "\n;\n".join((HERE / "js" / name).read_text(encoding="utf-8") for name in JS_FILES)

    payload = {
        "levels": data["levels"],
        "types": data["types"],
        "datasets": data["datasets"],
        "describe": data["describe"],
        "vocabulary": data["vocabulary"],
        "errors": data["errors"],
    }
    payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    payload_json = payload_json.replace("</", "<\\/")
    app_js = app_js.replace("</script", "<\\/script")

    boot = theme_boot()
    # The page must open from file:// without waiting for a font request.
    boot = re.sub(r'<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>', "", boot)

    replacements = {
        "<!--THEME_BOOT-->": boot,
        "<!--THEME_CSS-->": theme_css,
        "<!--APP_CSS-->": app_css,
        "<!--DATA_JSON-->": payload_json,
        "<!--APP_JS-->": app_js + "\n;\n" + theme_js,
    }
    for marker, replacement in replacements.items():
        count = template.count(marker)
        if count != 1:
            print(f"template marker {marker} appears {count} times (expected 1)")
            return 1
        template = template.replace(marker, replacement)

    if "<script src=" in template or '<link rel="stylesheet" href="/theme.css"' in template:
        print("built page unexpectedly references an external file")
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as fh:
        fh.write(template)
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.1f} KB)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Build the Business Charts page")
    ap.add_argument("--check", action="store_true", help="validate content only")
    args = ap.parse_args()
    return build(args.check)


if __name__ == "__main__":
    raise SystemExit(main())
