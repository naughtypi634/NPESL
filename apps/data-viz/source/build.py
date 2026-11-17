#!/usr/bin/env python3
"""Build the Data Visualization Playground.

    python -I -X utf8 apps/data-viz/source/build.py
    python -I -X utf8 apps/data-viz/source/build.py --explain online-shopping/share

Reads content/data-viz, validates it, computes every feature, and writes:
    apps/data-viz/index.html
    apps/data-viz/data.gallery.<hash>.js
    apps/data-viz/lang/<type>.<hash>.js
    apps/data-viz/topics/<slug>.<hash>.js
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import compute_view, merge_authored  # noqa: E402
from validate import validate_all  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
CONTENT = ROOT / "content" / "data-viz"
APP = ROOT / "apps" / "data-viz"
LIBRARY = CONTENT / "library"
TOPICS = CONTENT / "topics"
JS_DIR = APP / "js"
JS_ORDER = ["01-core.js", "02-renderers.js", "03-panel.js", "04-app.js"]


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def compact(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def digest(payload: str) -> str:
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:10]


def fill(template: str, slots: dict) -> str:
    return re.sub(r"\{([a-z_]+)\}", lambda m: str(slots.get(m.group(1), m.group(0))), template)


def ship_view(view: dict) -> dict:
    computed = compute_view(view)
    index = merge_authored(view, computed)
    features = []
    seen = set()
    for feature in index.values():
        key = feature.get("id") or compact(feature.get("marks")) + feature["kind"]
        if key in seen:
            continue
        seen.add(key)
        item = {
            "kind": feature["kind"],
            "marks": feature["marks"],
            "slots": feature["slots"],
            "auto": feature.get("auto", True),
        }
        if feature.get("id"):
            item["id"] = feature["id"]
        for key2 in ("examples", "note_zh", "interpret_zh"):
            if feature.get(key2):
                item[key2] = feature[key2]
        features.append(item)
    data = {k: v for k, v in view.items()
            if k not in {"features", "overview_zh", "descriptions", "label_zh",
                         "label_en", "subject", "subtitle_en", "unit", "type", "id"}}
    shipped = {
        "id": view["id"],
        "type": view["type"],
        "label_zh": view.get("label_zh", ""),
        "label_en": view.get("label_en", ""),
        "subject": view.get("subject", ""),
        "subtitle_en": view.get("subtitle_en", ""),
        "unit": view.get("unit", {}),
        "data": data,
        "features": features,
        "overview_zh": view.get("overview_zh", ""),
        "descriptions": view.get("descriptions", {}),
    }
    return shipped


def build_manifest_data(manifest: dict, topics: dict[str, dict], bundles: dict) -> dict:
    cards = []
    for entry in sorted(manifest["topics"], key=lambda t: t.get("order", 0)):
        slug = entry["id"]
        topic = topics[slug]
        primary = topic["views"][0]
        cards.append({
            "id": slug,
            "order": entry.get("order", 0),
            "title_en": topic["title_en"],
            "title_zh": topic["title_zh"],
            "blurb_zh": topic["blurb_zh"],
            "types": [v["type"] for v in topic["views"]],
            "default_view": primary["id"],
            "primary": {
                "type": primary["type"],
                "subject": primary.get("subject", ""),
                "unit": primary.get("unit", {}),
                "data": {k: v for k, v in primary.items()
                         if k in {"x", "series", "parts", "points", "groups",
                                  "rows", "cols", "cells", "nodes", "links",
                                  "columns", "periods", "entities", "steps",
                                  "start_value", "start", "end", "mode",
                                  "period_label"}},
            },
        })
    return {"version": manifest.get("version", 1),
            "types": manifest["types"], "topics": cards, "bundles": bundles}


def explain(slug: str, view_id: str | None) -> int:
    topic = load(TOPICS / f"{slug}.json")
    views = topic["views"]
    view = next((v for v in views if v["id"] == view_id), None) if view_id else views[0]
    if not view:
        print(f"没有这个视图：{slug}/{view_id}")
        return 2
    lib = load(LIBRARY / f"{view['type']}.json")
    index = merge_authored(view, compute_view(view))
    print(f"{slug}/{view['id']} · {view['type']} · {view.get('subject', '')}")
    seen = set()
    for mark, feature in index.items():
        key = feature.get("id") or mark
        if key in seen:
            continue
        seen.add(key)
        kind = feature["kind"]
        entry = lib["features"].get(kind, {})
        print(f"\n[{kind}] marks={','.join(feature['marks'])}")
        if feature.get("examples"):
            for ex in feature["examples"]:
                print(f"  例：{ex['en']}")
        for pat in entry.get("patterns", [])[:2]:
            print(f"  {pat['level']}: {fill(pat['frame'], feature['slots'])}")
        regs = entry.get("registers", {})
        for reg in ("general", "ielts", "business"):
            if regs.get(reg):
                print(f"  {reg}: {fill(regs[reg], feature['slots'])}")
    return 0


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="构建数据图表英语")
    ap.add_argument("--explain", nargs="?", const="", metavar="SLUG/VIEW",
                    help="打印某视图的计算特征与填充句子")
    args = ap.parse_args()
    if args.explain:
        parts = args.explain.split("/", 1)
        return explain(parts[0], parts[1] if len(parts) > 1 else None)

    problems = validate_all()
    if problems:
        print(f"内容校验失败（{len(problems)} 项），未写入任何文件：")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    manifest = load(CONTENT / "manifest.json")
    topics = {entry["id"]: load(TOPICS / f"{entry['id']}.json")
              for entry in manifest["topics"]}
    libraries = {}
    for entry in manifest["topics"]:
        for view in topics[entry["id"]]["views"]:
            libraries.setdefault(view["type"], load(LIBRARY / f"{view['type']}.json"))

    lang_dir = APP / "lang"
    topic_dir = APP / "topics"
    lang_dir.mkdir(exist_ok=True)
    topic_dir.mkdir(exist_ok=True)
    keep_lang: set[str] = set()
    lang_urls: dict[str, str] = {}
    for type_id, lib in libraries.items():
        text = compact(lib)
        h = digest(text)
        name = f"{type_id}.{h}.js"
        keep_lang.add(name)
        lang_urls[type_id] = "lang/" + name
        (lang_dir / name).write_text(
            f'window.DV_LANG=window.DV_LANG||{{}};window.DV_LANG["{type_id}"]={text};\n',
            encoding="utf-8")
    for old in lang_dir.glob("*.js"):
        if old.name not in keep_lang:
            old.unlink()

    keep_topics: set[str] = set()
    topic_urls: dict[str, str] = {}
    order = {entry["id"]: entry.get("order", 0) for entry in manifest["topics"]}
    for slug, topic in topics.items():
        shipped = {
            "id": slug,
            "order": order.get(slug, 0),
            "title_en": topic["title_en"],
            "title_zh": topic["title_zh"],
            "blurb_zh": topic["blurb_zh"],
            "scene_zh": topic["scene_zh"],
            "views": [ship_view(v) for v in topic["views"]],
        }
        text = compact(shipped)
        h = digest(text)
        name = f"{slug}.{h}.js"
        keep_topics.add(name)
        topic_urls[slug] = "topics/" + name
        (topic_dir / name).write_text(
            f'window.DV_TOPICS=window.DV_TOPICS||{{}};window.DV_TOPICS["{slug}"]={text};\n',
            encoding="utf-8")
    for old in topic_dir.glob("*.js"):
        if old.name not in keep_topics:
            old.unlink()

    gallery = build_manifest_data(manifest, topics,
                                  {"lang": lang_urls, "topics": topic_urls})
    payload = compact(gallery)
    digest_gallery = digest(payload)
    for old in APP.glob("data.gallery.*.js"):
        if old.name != f"data.gallery.{digest_gallery}.js":
            old.unlink()
    (APP / f"data.gallery.{digest_gallery}.js").write_text(
        "window.DV_GALLERY=" + payload + ";\n", encoding="utf-8")

    css = (APP / "style.css").read_text(encoding="utf-8")
    js = "\n".join((JS_DIR / name).read_text(encoding="utf-8") for name in JS_ORDER)
    noscript = "".join(
        f"<li><b lang=\"en\">{t['title_en']}</b> · {t['title_zh']}</li>"
        for t in sorted(topics.values(), key=lambda t: order.get(t["id"], 0)))
    page = (
        '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        "<title>数据图表英语 · Data Visualization Playground</title>\n"
        f"<style>{css}</style>\n</head>\n<body class=\"dv-app\">\n"
        '<main class="page">\n<div id="app" class="dv-shell">\n'
        '<div class="dv-boot">载入中…</div>\n</div>\n</main>\n'
        f"<noscript><section class=\"dv-noscript\"><h2>主题</h2>"
        f"<p>这个页面需要 JavaScript 才能看图表。</p><ul>{noscript}</ul></section></noscript>\n"
        f'<script src="data.gallery.{digest_gallery}.js"></script>\n'
        f"<script>{js}</script>\n</body>\n</html>\n"
    )
    (APP / "index.html").write_text(page, encoding="utf-8")

    print(f"主题 {len(topics)} 个，视图 {sum(len(t['views']) for t in topics.values())} 个")
    print(f"语言包 {len(libraries)} 个：{', '.join(sorted(libraries))}")
    print(f"gallery={digest_gallery}  html={len(page) // 1024} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
