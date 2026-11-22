# -*- coding: utf-8 -*-
"""生成图解词汇的场景页（场景图 + 白色热点 + 词条 + 卡片视图）。

    python -I tools/vv/build_pages.py [--check]

内容源：content/visual-vocabulary/scenes/*.json
产物：  apps/visual-vocabulary/<dir>/<page>.html

只写 HTML，不动图片。场景图、遮罩、缩略图由 tools/vv/gen_*.py 生成。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import VV_CONTENT, VISUAL_VOCAB_APP  # noqa: E402


_HASH_CACHE: dict[str, str] = {}


def file_version(path: Path) -> str:
    """给没有内容哈希的图片加 ?v=，避免浏览器拿旧缓存。"""
    key = str(path)
    if key not in _HASH_CACHE:
        _HASH_CACHE[key] = hashlib.sha1(path.read_bytes()).hexdigest()[:8] if path.exists() else "0"
    return _HASH_CACHE[key]


def asset_version() -> str:
    """共用 css/js 的内容哈希，写进 URL 让浏览器换新。"""
    digest = hashlib.sha1()
    for name in ("vv.css", "vv.js"):
        p = VISUAL_VOCAB_APP / name
        if p.exists():
            digest.update(p.read_bytes())
    return digest.hexdigest()[:10]

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} {title_zh}</title>
<link rel="preload" as="image" href="{img}" fetchpriority="high">
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
@media (max-width: 680px) {{
  body {{ padding: 0 14px 48px; }}
  header {{ padding-top: 22px; align-items: flex-start; }}
}}
</style>
<link rel="stylesheet" href="../vv.css?v={v}">
</head>
<body>
<nav class="vv-topics" aria-label="主题">{bar}</nav>
<header>
  <h1>{title} <span>{title_zh}</span></h1>
  <div class="vv-tools">
    <div class="seg" role="group" aria-label="视图"><button type="button" data-vv-view="scene" aria-pressed="true">场景</button><button type="button" data-vv-view="cards" aria-pressed="false">卡片</button></div>
    <div class="seg" role="group" aria-label="音色"><span class="voice-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8a5 5 0 0 1 0 8"/></svg></span><button type="button" data-voice="h2" aria-pressed="true">女声</button><button type="button" data-voice="c" aria-pressed="false">男声</button></div>
  </div>
</header>
<main class="page">
<div class="vv-scene-card">
  <div class="vv-scene" data-vv-scene>
    <div class="vv-stage">
      <img class="vv-scene-img" alt="" width="{w}" height="{h}" src="{img}" loading="lazy" fetchpriority="high" decoding="async">
      <span class="vv-lift" data-vv-lift aria-hidden="true"></span>
{dots}
    </div>
  </div>

  <div class="vv-readout">
    <span class="vv-en" data-vv-en hidden></span>
    <span class="vv-zh" data-vv-zh hidden></span>
    <span class="vv-hint" data-vv-hint>指到或点一下物品</span>
    <button class="vv-btn vv-replay" type="button" data-vv-replay hidden>再听一次</button>
  </div>
</div>

<div class="vv-words">
{chips}
</div>

<div class="vv-cards">
{cards}
</div>
</main>
<nav class="vv-pager" aria-label="同主题导航">
  <a class="vv-pager-prev" href="{prev_href}">{prev_label}</a>
  <a class="vv-pager-home" href="{home_href}">{home_label}</a>
  <a class="vv-pager-next" href="{next_href}">{next_label}</a>
</nav>
<script src="../vv.js?v={v}" defer></script>
</body>
</html>
"""

DOT = '      <span class="vv-dot" data-vv-dot="{slug}" style="left:{cx}%;top:{cy}%"></span>'
CHIP = ('  <button type="button" data-vv-word="{slug}" data-en="{en}" data-zh="{zh}" '
        'data-x="{cx}" data-y="{cy}"{box}{mask}{audio} aria-pressed="false">{en}</button>')
CARD = ('  <button type="button" class="vv-card" data-vv-word="{slug}"'
        '{audio}><img loading="lazy" decoding="async" alt="" '
        'src="{img}"><span class="en">{en}</span>'
        '<span class="zh">{zh}</span></button>')

W, H = 2400, 1500

def audio_attrs(word: dict) -> str:
    root = word.get("audio_root")
    if root:
        return f' data-audio-root="{root}"'
    h2 = word.get("audio_h2", word["slug"])
    c = word.get("audio_c", word["slug"])
    return f' data-audio-h2="{h2}" data-audio-c="{c}"'


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def topic_index() -> tuple[list[dict], dict[str, tuple[dict, int]]]:
    topics = load_json(VV_CONTENT / "topics.json")["topics"]
    where: dict[str, tuple[dict, int]] = {}
    for t in topics:
        for i, item in enumerate(t.get("scenes", [])):
            page = item if isinstance(item, str) else item["file"].split(".")[0]
            where[page] = (t, i)
    return topics, where


def scene_label(topic: dict, index: int) -> tuple[str, str]:
    item = topic["scenes"][index]
    if isinstance(item, str):
        spec = load_json(VV_CONTENT / "scenes" / f"{item}.json")
        return f'{item}.html', f'{spec["title"]} {spec["title_zh"]}'
    return item["file"], f'{item["en"]} {item["zh"]}'


def topic_bar(topics: list[dict], active: str) -> str:
    out = []
    for t in topics:
        cur = ' aria-current="page"' if t["id"] == active else ""
        out.append(f'<a href="../{t["href"]}"{cur}>{t["zh"]}</a>')
    return "".join(out)


def render(spec: dict, topics: list[dict], where: dict) -> str:
    dots, chips, cards = [], [], []
    for w in spec["words"]:
        cx, cy = w["pt"]
        cx, cy = round(float(cx), 2), round(float(cy), 2)
        dots.append(DOT.format(slug=w["slug"], cx=cx, cy=cy))

        mask = ""
        if w.get("mask"):
            mask_path = VISUAL_VOCAB_APP / spec["dir"] / w["mask"]
            mask = f' data-mask="{w["mask"]}?v={file_version(mask_path)}"'

        box = ""
        if w.get("box"):
            x0, y0, x1, y1 = (round(float(v), 2) for v in w["box"])
            box = f' data-box="{x0},{y0},{x1},{y1}"'

        audio = audio_attrs(w)
        chips.append(CHIP.format(slug=w["slug"], en=w["en"], zh=w["zh"],
                                 cx=cx, cy=cy, box=box, mask=mask,
                                 audio=audio))

        img = w.get("img") or f'assets/{spec["dir"]}/color/{w["slug"]}.webp'
        cards.append(CARD.format(slug=w["slug"], img=img, en=w["en"],
                                 zh=w["zh"], audio=audio))

    topic, index = where[spec["page"]]
    prev_href = prev_label = ""
    if index > 0:
        href, label = scene_label(topic, index - 1)
        prev_href, prev_label = href, f"‹ {label}"
    next_href = next_label = ""
    if index + 1 < len(topic.get("scenes", [])):
        href, label = scene_label(topic, index + 1)
        next_href, next_label = href, f"{label} ›"
    topic_href = topic["href"].split("/")[-1]

    srcset = ""
    for style, path in (spec.get("images") or {}).items():
        srcset += f' data-src-{style}="{path}"'

    styles = spec.get("styles") or []
    default_img = (spec.get("images") or {}).get(styles[0], spec["image"]) if styles \
        else spec["image"]

    return PAGE.format(
        title=spec["title"], title_zh=spec["title_zh"], img=spec["image"],
        w=W, h=H, v=asset_version(),
        bar=topic_bar(topics, topic["id"]),
        dots="\n".join(dots), chips="\n".join(chips), cards="\n".join(cards),
        prev_href=prev_href, prev_label=prev_label,
        next_href=next_href, next_label=next_label,
        home_href=topic_href, home_label=topic["zh"],
    )


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只报告过期页面")
    args = ap.parse_args()

    stale = 0
    topics, where = topic_index()
    for path in sorted((VV_CONTENT / "scenes").glob("*.json")):
        spec = json.loads(path.read_text(encoding="utf-8"))
        html = render(spec, topics, where)
        dest = VISUAL_VOCAB_APP / spec["dir"] / f'{spec["page"]}.html'
        old = dest.read_text(encoding="utf-8") if dest.exists() else None
        if old == html:
            continue
        stale += 1
        if args.check:
            print("过期", dest.relative_to(VISUAL_VOCAB_APP))
        else:
            dest.write_text(html, encoding="utf-8", newline="")
            print("写入", dest.relative_to(VISUAL_VOCAB_APP))

    if args.check:
        print(f"过期页面 {stale} 个")
        return 1 if stale else 0
    print(f"更新 {stale} 个页面")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
