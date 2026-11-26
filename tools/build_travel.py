# -*- coding: utf-8 -*-
"""Build the local Travel scene pages from content/travel/site.json.

    .venv\\Scripts\\python.exe -I tools/build_travel.py

The pages stay in apps/travel/ and are not registered in build_all.py yet.
"""
import argparse
import html
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "content" / "travel" / "site.json"
SCENES = ROOT / "content" / "travel" / "scenes"
TEMPLATE = ROOT / "apps" / "travel" / "source" / "template.html"
HUB_TEMPLATE = ROOT / "apps" / "travel" / "source" / "hub-template.html"
OUTPUT = ROOT / "apps" / "travel"


def escape(value: str) -> str:
    return html.escape(str(value), quote=True)


def dots(items: list[dict]) -> str:
    parts = []
    for item in items:
        x, y = item["pt"]
        parts.append(
            '<button class="tv-dot" type="button" data-item="{id}" '
            'style="left:{x:.2f}%;top:{y:.2f}%" aria-label="{label}" '
            'aria-pressed="false"></button>'.format(
                id=escape(item["id"]), x=x, y=y, label=escape(item["en"])))
    return "\n        ".join(parts)


def validate(scene: dict) -> None:
    asset = ROOT / "apps" / "travel" / scene["scene"]
    if not asset.is_file():
        raise SystemExit("missing scene image: {}".format(asset))
    seen = set()
    steps = {step["id"] for step in scene["steps"]}
    for item in scene["items"]:
        if item["id"] in seen:
            raise SystemExit("{}: duplicate item {}".format(scene["id"], item["id"]))
        seen.add(item["id"])
        if item["step"] not in steps:
            raise SystemExit("{}: unknown step for {}".format(scene["id"], item["id"]))
        x0, y0, x1, y1 = item["box"]
        if not (0 <= x0 < x1 <= 100 and 0 <= y0 < y1 <= 100):
            raise SystemExit("{}: invalid box for {}".format(scene["id"], item["id"]))
        px, py = item["pt"]
        if not (x0 <= px <= x1 and y0 <= py <= y1):
            raise SystemExit("{}: point outside box for {}".format(scene["id"], item["id"]))


def build_scene(site_scene: dict, prev_scene: dict | None, next_scene: dict | None) -> dict:
    scene = json.loads((SCENES / (site_scene["id"] + ".json")).read_text(encoding="utf-8"))
    validate(scene)
    data = json.dumps(scene, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    page = TEMPLATE.read_text(encoding="utf-8")
    replacements = {
        "{{TITLE_EN}}": escape(scene.get("title_en", site_scene["title_en"])),
        "{{TITLE_ZH}}": escape(scene.get("title_zh", site_scene["title_zh"])),
        "{{SCENE}}": escape(scene["scene"]),
        "{{DOTS}}": dots(scene["items"]),
        "{{DATA}}": data,
        "{{PREV_HREF}}": (prev_scene["id"] + ".html") if prev_scene else "",
        "{{PREV_LABEL}}": (prev_scene["title_zh"] if prev_scene else ""),
        "{{NEXT_HREF}}": (next_scene["id"] + ".html") if next_scene else "",
        "{{NEXT_LABEL}}": (next_scene["title_zh"] if next_scene else ""),
    }
    for key, value in replacements.items():
        page = page.replace(key, value)
    (OUTPUT / (site_scene["id"] + ".html")).write_text(page, encoding="utf-8")
    return scene


def build_hub(site: dict) -> None:
    by_stage = {stage["id"]: [] for stage in site["stages"]}
    for scene in site["scenes"]:
        by_stage[scene["stage"]].append(scene)
    parts = []
    for stage in site["stages"]:
        parts.append('<section class="tv-hub-stage">')
        parts.append('<h2>{} <span>{}</span></h2>'.format(
            escape(stage["en"]), escape(stage["zh"])))
        parts.append('<div class="tv-hub-list">')
        for scene in by_stage[stage["id"]]:
            parts.append(
                '<a class="tv-hub-card" href="{id}.html">'
                '<img src="assets/{id}.webp" alt="" loading="lazy" decoding="async">'
                '<span>{en}</span><small>{zh}</small></a>'.format(
                    id=escape(scene["id"]), en=escape(scene["title_en"]),
                    zh=escape(scene["title_zh"])))
        parts.append('</div></section>')
    page = HUB_TEMPLATE.read_text(encoding="utf-8")
    page = page.replace("{{STAGES}}", "\n".join(parts))
    (OUTPUT / "index.html").write_text(page, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="only validate content and assets")
    args = parser.parse_args()

    site = json.loads(SITE.read_text(encoding="utf-8"))
    order = site["scenes"]
    if args.check:
        total = 0
        for index, scene in enumerate(order):
            data = json.loads((SCENES / (scene["id"] + ".json")).read_text(encoding="utf-8"))
            validate(data)
            total += len(data["items"])
        print("content ok: {} scenes, {} items".format(len(order), total))
        return 0

    for index, scene in enumerate(order):
        prev_scene = order[index - 1] if index else None
        next_scene = order[index + 1] if index + 1 < len(order) else None
        build_scene(scene, prev_scene, next_scene)
    build_hub(site)
    print("wrote {} scene pages and index".format(len(order)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
