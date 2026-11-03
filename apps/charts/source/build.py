#!/usr/bin/env python3
"""Build the Business Charts page as one self-contained HTML file.

    python -I apps/charts/source/build.py
    python -I apps/charts/source/build.py --check

Source of truth:
    content/charts/*.json          content
    apps/charts/source/*.html/.css content shell and styles
    apps/charts/source/js/*.js     classic scripts, concatenated in order
    apps/site/theme.css/.js        inlined so the page works from file://

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

sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "tools"))

import validate  # noqa: E402
from paths import CHARTS_APP, CHARTS_CONTENT, SITE_APP  # noqa: E402
from themes import theme_boot  # noqa: E402

CONTENT = CHARTS_CONTENT
SITE = SITE_APP
OUT = CHARTS_APP / "index.html"

JS_FILES = [
    "00-namespace.js",
    "05-svg.js",
    "07-motion.js",
    "10-format.js",
    "15-scale.js",
    "20-drag.js",
    "25-stats.js",
    "30-desc-core.js",
    "31-desc-time.js",
    "32-desc-category.js",
    "33-desc-pie.js",
    "39-render-common.js",
    "40-render-line.js",
    "42-render-bar.js",
    "43-render-pie.js",
    "46-render-table.js",
    "50-lab.js",
    "60-ui.js",
    "90-init.js",
]

JSON_FILES = {
    "types": "chart-types.json",
    "labs": "labs.json",
    "vocab": "vocabulary.json",
    "grammar": "grammar.json",
    "errors": "errors.json",
}


def load_json() -> dict:
    data = {}
    for key, name in JSON_FILES.items():
        data[key] = json.loads((CONTENT / name).read_text(encoding="utf-8"))
    return data


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def build(check_only: bool = False) -> int:
    problems = validate.Problems()
    data = validate.load(problems)
    if not problems.items:
        validate.check_content(data, problems)
    if problems.items:
        print(f"FIX = {len(problems.items)}")
        for item in problems.items:
            print(f"  - {item}")
        return 1
    if check_only:
        print("OK: content validates")
        return 0

    template = read(HERE / "template.html")
    theme_css = read(SITE / "theme.css")
    theme_js = read(SITE / "theme.js")
    app_css = read(HERE / "style.css")
    app_js = "\n;\n".join(read(HERE / "js" / name) for name in JS_FILES)

    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("</", "<\\/")
    app_js = app_js.replace("</script", "<\\/script")

    boot = theme_boot()
    # This page must open from file:// without waiting for a font request.
    boot = re.sub(r'<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>', '', boot)

    replacements = {
        "<!--THEME_BOOT-->": boot,
        "<!--THEME_CSS-->": theme_css,
        "<!--APP_CSS-->": app_css,
        "<!--DATA_JSON-->": payload,
        "<!--APP_JS-->": app_js + "\n;\n" + theme_js,
    }

    for marker, replacement in replacements.items():
        count = template.count(marker)
        if count != 1:
            print(f"template marker {marker} appears {count} times (expected 1)")
            return 1
        template = template.replace(marker, replacement)

    if "<!-- npesl-theme-inline -->" not in template:
        print("template is missing the npesl-theme-inline marker")
        return 1
    if "<script src=" in template or "<link rel=\"stylesheet\" href=\"/theme.css\"" in template:
        print("built page unexpectedly references an external theme file")
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
