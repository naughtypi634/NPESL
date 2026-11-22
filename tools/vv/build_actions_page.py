# -*- coding: utf-8 -*-
"""烹饪动作卡片页：分三组（加热 / 刀工 / 备料），图 + 英文 + 中文，点一下出声。

    python -I tools/vv/build_actions_page.py

内容源：content/visual-vocabulary/actions.json
原图：  build/vv-work/out/actions/<slug>.png（由 tools/vv/gen_actions.py 生成）
产物：  apps/visual-vocabulary/home/assets/actions/*.jpg + kitchen-actions.html
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import VV_CONTENT, VISUAL_VOCAB_APP  # noqa: E402

APP = VISUAL_VOCAB_APP / "home"
ASSETS = APP / "assets" / "actions"
RAW = Path(__file__).resolve().parents[2] / "build" / "vv-work" / "out" / "actions"

SECTIONS = [("heat", "加热方式 Heat"), ("cut", "刀工 Cutting"),
            ("prep", "备料与收尾 Prep")]

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cooking 烹饪动作</title>
<style>
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; }}
body {{
  background-color: var(--bg);
  color: var(--fg);
  font-family: var(--font);
  font-size: 15px;
  line-height: 1.5;
  padding: 0 20px 64px;
}}
header {{
  flex-wrap: wrap;
  max-width: 1180px; margin: 0 auto; padding: 34px 0 22px;
  display: flex; align-items: flex-end; justify-content: space-between; gap: 20px;
}}
h1 {{ margin: 0; font-size: clamp(28px, 5vw, 44px); letter-spacing: -.5px; }}
h1 span {{ font-size: .52em; color: var(--muted); font-weight: 500; margin-left: 10px; letter-spacing: 0; }}
main {{ max-width: 1180px; margin: 0 auto; }}
.vv-topics {{ max-width: 1180px; margin: 0 auto; padding: 18px 0 0;
  display: flex; flex-wrap: wrap; gap: 6px; }}
.vv-topics a {{
  font-size: 13px; font-weight: 600; color: var(--muted); text-decoration: none;
  border: 1px solid var(--rule); border-radius: 999px; padding: 6px 12px;
}}
.vv-topics a:hover {{ color: var(--fg); border-color: var(--muted); }}
.vv-topics a[aria-current="page"] {{
  background: var(--blue); border-color: var(--blue); color: var(--on-blue);
}}
h2 {{
  font-size: 13px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase;
  color: var(--muted); margin: 30px 0 14px;
}}
h2:first-of-type {{ margin-top: 0; }}
@media (max-width: 680px) {{
  body {{ padding: 0 14px 48px; }}
  header {{ padding-top: 22px; align-items: flex-start; }}
  h2 {{ margin: 24px 0 10px; }}
}}
</style>
<link rel="stylesheet" href="../vv.css?v={v}">
</head>
<body class="vv-cards-view">
<nav class="vv-topics" aria-label="主题">{bar}</nav>
<header>
  <h1>Cooking <span>烹饪动作</span></h1>
  <div class="vv-tools">
    <div class="seg" role="group" aria-label="音色"><span class="voice-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8a5 5 0 0 1 0 8"/></svg></span><button type="button" data-voice="h2" aria-pressed="true">女声</button><button type="button" data-voice="c" aria-pressed="false">男声</button></div>
  </div>
</header>
<main class="page">
{sections}
</main>
<nav class="vv-pager" aria-label="主题导航">
  <a class="vv-pager-prev" href="kitchen.html">‹ Kitchen 厨房</a>
  <a class="vv-pager-home" href="../">全部主题</a>
  <a class="vv-pager-next" href="rooms.html">Rooms 房间 ›</a>
</nav>
<script src="../vv.js?v={v}" defer></script>
</body>
</html>
"""

CARD = ('  <button type="button" class="vv-card" data-vv-word="{slug}" '
        'data-audio-h2="{slug}" data-audio-c="{slug}">'
        '<img loading="lazy" decoding="async" alt="" src="assets/actions/{file}">'
        '<span class="en">{en}</span><span class="zh">{zh}</span></button>')


def asset_version() -> str:
    digest = hashlib.sha1()
    for name in ("vv.css", "vv.js"):
        p = VISUAL_VOCAB_APP / name
        if p.exists():
            digest.update(p.read_bytes())
    return digest.hexdigest()[:10]


def topic_bar() -> str:
    topics = json.loads((VV_CONTENT / "topics.json").read_text(encoding="utf-8"))["topics"]
    out = []
    for t in topics:
        cur = ' aria-current="page"' if t["id"] == "kitchen" else ""
        out.append(f'<a href="../{t["href"]}"{cur}>{t["zh"]}</a>')
    return "".join(out)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="重写已有的动作图")
    args = ap.parse_args()

    items = json.loads((VV_CONTENT / "actions.json").read_text(encoding="utf-8"))
    ASSETS.mkdir(parents=True, exist_ok=True)
    buckets = {key: [] for key, _ in SECTIONS}
    missing = []
    for it in items:
        dest = ASSETS / f"{it['slug']}.jpg"
        if args.force or not dest.exists():
            src = RAW / f"{it['slug']}.png"
            if not src.exists():
                missing.append(it["slug"])
                continue
            with Image.open(src) as im:
                im.convert("RGB").resize((512, 512), Image.LANCZOS).save(
                    dest, "JPEG", quality=84, optimize=True, progressive=True)
        buckets.setdefault(it.get("section", "prep"), []).append(
            CARD.format(slug=it["slug"], en=it["en"], zh=it["zh"],
                        file=f"{it['slug']}.jpg"))
    if missing:
        print("缺图（先跑 gen_actions.py）:", ", ".join(missing))

    blocks = []
    for key, title in SECTIONS:
        cards = buckets.get(key, [])
        if not cards:
            continue
        blocks.append(f'<h2>{title}</h2>')
        blocks.append('<div class="vv-cards">')
        blocks.extend(cards)
        blocks.append('</div>')

    (APP / "kitchen-actions.html").write_text(
        PAGE.format(sections="\n".join(blocks), bar=topic_bar(),
                    v=asset_version()),
        encoding="utf-8", newline="")
    print("kitchen-actions.html:", sum(len(v) for v in buckets.values()), "个动作")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
