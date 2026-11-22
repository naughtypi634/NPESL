# -*- coding: utf-8 -*-
"""生成图解词汇的主题页与首页（场景缩略图 + 词卡 + 主题切换条）。

    python -I tools/vv/build_topic_pages.py [--check]

内容源：content/visual-vocabulary/topics.json、sets/*.json、scenes/*.json
产物：  apps/visual-vocabulary/index.html 与各主题落地页
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import VV_CONTENT, VISUAL_VOCAB_APP  # noqa: E402


_HASH_CACHE: dict[str, str] = {}


def file_version(path: Path) -> str:
    key = str(path)
    if key not in _HASH_CACHE:
        _HASH_CACHE[key] = hashlib.sha1(path.read_bytes()).hexdigest()[:8] if path.exists() else "0"
    return _HASH_CACHE[key]


def asset_version() -> str:
    digest = hashlib.sha1()
    for name in ("vv.css", "vv.js"):
        p = VISUAL_VOCAB_APP / name
        if p.exists():
            digest.update(p.read_bytes())
    return digest.hexdigest()[:10]

TOOLS = """  <div class="vv-tools">
    <div class="seg" role="group" aria-label="音色"><span class="voice-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8a5 5 0 0 1 0 8"/></svg></span><button type="button" data-voice="h2" aria-pressed="true">女声</button><button type="button" data-voice="c" aria-pressed="false">男声</button></div>
    <span class="vv-status" data-vv-status hidden></span>
    <button class="vv-btn" type="button" data-vv-quiz aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2" y="14" width="5" height="7" rx="2"/><rect x="17" y="14" width="5" height="7" rx="2"/></svg><span class="vv-label">听音找图</span></button>
  </div>"""

CSS = """* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background-color: var(--bg);
  color: var(--fg);
  font-family: var(--font);
  font-size: 15px;
  line-height: 1.5;
  padding: 0 20px 64px;
}
.vv-topics { max-width: 1180px; margin: 0 auto; padding: 18px 0 0;
  display: flex; flex-wrap: wrap; gap: 6px; }
.vv-topics a {
  font-size: 13px; font-weight: 600; color: var(--muted); text-decoration: none;
  border: 1px solid var(--rule); border-radius: 999px; padding: 6px 12px;
}
.vv-topics a:hover { color: var(--fg); border-color: var(--muted); }
.vv-topics a[aria-current="page"] {
  background: var(--blue); border-color: var(--blue); color: var(--on-blue);
}
header {
  flex-wrap: wrap; max-width: 1180px; margin: 0 auto; padding: 26px 0 22px;
  display: flex; align-items: flex-end; justify-content: space-between; gap: 20px;
}
h1 { margin: 0; font-size: clamp(28px, 5vw, 44px); letter-spacing: -.5px; }
h1 span { font-size: .52em; color: var(--muted); font-weight: 500; margin-left: 10px; letter-spacing: 0; }
main { max-width: 1180px; margin: 0 auto; }
section { margin-top: 38px; }
h2 { font-size: 17px; margin: 0 0 14px; display: flex; align-items: baseline; gap: 10px; }
h2 span { color: var(--muted); font-size: 13px; font-weight: 400; }
h2.grp { margin: 54px 0 24px; padding-top: 24px; border-top: 1px solid var(--rule);
  font-size: 22px; letter-spacing: -.2px; }
h2.grp:first-of-type { margin-top: 0; padding-top: 0; border-top: 0; }
h2.grp span { font-size: 13px; color: var(--muted); font-weight: 400; }
h2.grp + section { margin-top: 0; }
section h3 { font-size: 17px; margin: 0 0 14px; display: flex; align-items: baseline; gap: 10px; }
section h3 span { color: var(--muted); font-size: 13px; font-weight: 400; }
.grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
.card {
  position: relative; display: flex; flex-direction: column; align-items: center;
  border-radius: var(--radius-card);
  padding: 12px 10px 11px; cursor: pointer; text-align: center;
  transition: transform .15s ease;
}
.card:hover { transform: translateY(-2px); }
.card:focus-visible,
html[data-theme] .card:focus-visible {
  outline: 2px solid var(--blue); outline-offset: 2px;
}
.card.playing { outline: 2px solid var(--blue); outline-offset: 2px; }
.card img { width: 100%; aspect-ratio: 1 / 1; object-fit: contain; display: block;
  border-radius: var(--radius-control); }
.en { margin-top: 7px; font-weight: 700; font-size: 14px; line-height: 1.25; }
.zh { color: var(--muted); font-size: 12px; margin-top: 1px; }
.scenes-head { max-width: 1180px; margin: 0 auto 12px; font-size: 13px; font-weight: 600;
  letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.scenes-grid { max-width: 1180px; margin: 0 auto 26px; display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; }
.scenes-grid a { display: flex; flex-direction: column; overflow: hidden; border-radius: var(--radius-card);
  background: var(--pane); box-shadow: var(--shadow-card); color: inherit; text-decoration: none;
  transition: transform .15s ease; }
.scenes-grid a:hover { transform: translateY(-2px); }
.scenes-grid a:focus-visible { outline: 2px solid var(--focus-line); outline-offset: 3px; }
.scenes-grid img { width: 100%; aspect-ratio: 8 / 5; object-fit: cover; display: block; }
.scenes-grid span { padding: 10px 12px 12px; font-weight: 600; font-size: 14px; }
.scenes-grid span em { display: block; font-style: normal; font-weight: 400; font-size: 12px; color: var(--muted); }
.vv-foot { max-width: 1180px; margin: 56px auto 0; padding-top: 18px;
  border-top: 1px solid var(--rule); }
.vv-foot a { color: var(--muted); font-size: 14px; text-decoration: none; }
.vv-foot a:hover { color: var(--fg); }
@media (max-width: 900px) { .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (max-width: 680px) {
  body { padding: 0 14px 48px; }
  header { padding-top: 20px; align-items: flex-start; }
  .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .card { border-radius: var(--radius-control); padding: 8px 6px 9px; }
  .en { font-size: 12px; }
  h2.grp { margin-top: 40px; padding-top: 18px; font-size: 20px; }
  .scenes-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
}
@media (max-width: 460px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

@media print {
  body { padding: 0; }
  header, .vv-topics, .vv-foot { display: none; }
  .scenes-grid { display: none; }
  .grid { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px; }
  .card { border: 0; padding: 2px; break-inside: avoid; background: #fff; }
  section { margin-top: 16px; break-inside: avoid; }
  h2.grp { margin: 18px 0 8px; padding-top: 10px; font-size: 14px; break-after: avoid; }
}"""

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
{css}
</style>
<link rel="stylesheet" href="{up}vv.css?v={v}">
</head>
<body>
<nav class="vv-topics" aria-label="主题">{bar}</nav>
<header>
  <h1>{h1_en} <span>{h1_zh}</span></h1>
{tools}
</header>
<main class="page">
{scenes}{body}
</main>
<footer class="vv-foot"><a href="{up}">‹ 全部主题</a></footer>
<script src="{up}vv.js?v={v}" defer></script>
</body>
</html>
"""

ROOT_PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visual Vocabulary 图解词汇</title>
<style>
* {{ box-sizing: border-box; }}
body {{ margin: 0; background-color: var(--bg); color: var(--fg);
  font-family: var(--font); -webkit-font-smoothing: antialiased; }}
.page {{ max-width: 760px; margin: 0 auto; padding: clamp(40px, 8vh, 88px) max(20px, env(safe-area-inset-left, 0px)) 96px;
  padding-right: max(20px, env(safe-area-inset-right, 0px)); }}
h1 {{ margin: 0; font-size: clamp(28px, 6vw, 38px); font-weight: 700;
  letter-spacing: -.03em; line-height: 1.1; }}
h1 span {{ font-size: .6em; color: var(--muted); font-weight: 500; }}
.cards {{ margin-top: 28px; display: flex; flex-direction: column; gap: 10px; }}
.card {{ display: flex; align-items: center; gap: 16px; padding: 16px 18px;
  border-radius: var(--radius-card); color: inherit; text-decoration: none;
  transition: transform .15s ease; }}
.card:hover {{ transform: translateY(-1px); }}
.card:focus-visible {{ outline: 2px solid var(--focus-line); outline-offset: 3px; }}
.glyph {{ display: flex; align-items: center; justify-content: center; flex: none;
  width: 42px; height: 42px; border-radius: var(--radius-control);
  background: var(--blue-tint); color: var(--blue); font-size: 17px; font-weight: 700; }}
.title {{ font-size: 17px; font-weight: 600; letter-spacing: -.01em; }}
.title span {{ display: block; font-size: 12px; font-weight: 400; color: var(--muted); }}
.arrow {{ margin-left: auto; color: var(--muted); font-size: 20px; line-height: 1; }}
@media (max-width: 420px) {{ .card {{ gap: 12px; padding: 14px; }} }}
</style>
</head>
<body>
<main class="page">
  <h1>Visual Vocabulary <span>图解词汇</span></h1>
  <nav class="cards">
{cards}  </nav>
</main>
</body>
</html>
"""

ROOT_CARD = ('    <a class="card" href="{href}"><span class="glyph">{glyph}</span>'
             '<span class="title">{en}<span>{zh}</span></span>'
             '<span class="arrow">›</span></a>\n')


def esc(t: str) -> str:
    return html.escape(t, quote=True)


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def topic_bar(topics: list[dict], up: str, active: str) -> str:
    out = []
    for t in topics:
        cur = ' aria-current="page"' if t["id"] == active else ""
        out.append(f'<a href="{esc(up + t["href"])}"{cur}>{esc(t["zh"])}</a>')
    return "".join(out)


STYLES = [("iso-flat", "扁平"), ("iso-pixar", "皮克斯"), ("iso-illust", "插画")]


def topic_styles(topic: dict) -> list[str]:
    common: list[str] | None = None
    for item in topic.get("scenes", []):
        if not isinstance(item, str):
            continue
        spec = load(VV_CONTENT / "scenes" / f"{item}.json")
        styles = set(spec.get("styles", []))
        common = styles if common is None else (common & styles)
    return [s for s, _ in STYLES if s in (common or set())]


def tools_block(topic: dict) -> str:
    styles = topic_styles(topic)
    if len(styles) < 2:
        return TOOLS
    btns = "".join(
        f'<button type="button" data-vv-style="{s}" aria-pressed="false">{label}</button>'
        for s, label in STYLES if s in styles)
    seg = '    <div class="seg" role="group" aria-label="画风">' + btns + "</div>" + chr(10)
    return TOOLS.replace('  <div class="vv-tools">' + chr(10),
                         '  <div class="vv-tools">' + chr(10) + seg, 1)


def scene_tiles(topic: dict, up: str) -> str:
    tiles = []
    for item in topic.get("scenes", []):
        if isinstance(item, str):
            spec = load(VV_CONTENT / "scenes" / f"{item}.json")
            href = f'{item}.html'
            img = spec["thumb"]
            ver = file_version(VISUAL_VOCAB_APP / spec["dir"] / spec["thumb"])
            img = f"{img}?v={ver}"
            en, zh = spec["title"], spec["title_zh"]
            extra = ""
            for style, path in (spec.get("thumbs") or {}).items():
                extra += f' data-src-{style}="{esc(path)}"'

        else:
            href, img = item["file"], item["img"]
            en, zh = item["en"], item["zh"]
            extra = ""
        tiles.append(
            f'<a href="{esc(href)}"><img loading="lazy" decoding="async" alt="" '
            f'src="{esc(img)}"{extra}><span>{esc(en)}<em>{esc(zh)}</em></span></a>')
    if not tiles:
        return ""
    return ('<h2 class="scenes-head">Scenes</h2>'
            f'<nav class="scenes-grid">{"".join(tiles)}</nav>')


def card_body(data: dict, up: str, topic_id: str = "") -> str:
    root = data["asset_root"]
    groups = {g["id"]: g for g in data.get("groups", [])}
    chunks = []
    active = None
    closed: set[str] = set()
    for sec in data["sections"]:
        group_id = sec.get("group")
        if group_id:
            if group_id not in groups:
                raise ValueError(f"{data['set']}/{sec['id']}: unknown group")
            if group_id != active:
                if active:
                    closed.add(active)
                if group_id in closed:
                    raise ValueError(f"{data['set']}: group {group_id} not contiguous")
                g = groups[group_id]
                chunks.append(f'<h2 class="grp" id="g-{group_id}">{esc(g["zh"])} '
                              f'<span>{esc(g["en"])}</span></h2>')
            active = group_id
            heading = "h3"
        else:
            if groups:
                raise ValueError(f"{data['set']}/{sec['id']}: missing group")
            heading = "h2"
        chunks.append(f'<section id="{esc(sec["id"])}">')
        # 与主题同名的那一组不再重复标题（页面大标题已经说了）
        if sec["id"] != topic_id:
            chunks.append(f'<{heading}>{esc(sec["zh"])} '
                          f'<span>{esc(sec["en"])}</span></{heading}>')
        chunks.append('<div class="grid">')
        for it in sec["items"]:
            slug = esc(it["slug"])
            audio = esc(it.get("audio") or it["slug"])
            img = esc(it.get("img") or (it["slug"] + ".webp"))
            chunks.append(
                f'<div class="card" tabindex="0" role="button" data-slug="{slug}" '
                f'data-audio-h2="{audio}" data-audio-c="{audio}" '
                f'aria-label="{esc(it["en"])}"><img loading="lazy" decoding="async" '
                f'alt="" src="{esc(root)}/{img}"><div class="en">{esc(it["en"])}</div>'
                f'<div class="zh">{esc(it["zh"])}</div></div>')
        chunks.append('</div></section>')
    return "".join(chunks)


def render_topic(topic: dict, topics: list[dict]) -> tuple[Path, str]:
    data = load(VV_CONTENT / "sets" / topic["set"])
    page = topic["href"].split("/")[-1]
    dest = VISUAL_VOCAB_APP / topic["href"].split("/")[0] / page
    out = PAGE.format(
        title=f'{topic["en"]} {topic["zh"]}',
        css=CSS,
        up="../",
        bar=topic_bar(topics, "../", topic["id"]),
        h1_en=esc(topic["en"]), h1_zh=esc(topic["zh"]),
        tools=tools_block(topic), v=asset_version(),
        scenes=scene_tiles(topic, "../"),
        body=card_body(data, "../", topic["id"]),
    )
    return dest, out


def render_root(topics: list[dict]) -> tuple[Path, str]:
    cards = "".join(
        ROOT_CARD.format(href=esc(t["href"]), glyph=esc(t["glyph"]),
                         en=esc(t["en"]), zh=esc(t["zh"]))
        for t in topics)
    return VISUAL_VOCAB_APP / "index.html", ROOT_PAGE.format(cards=cards)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只报告过期页面")
    args = ap.parse_args()

    topics = load(VV_CONTENT / "topics.json")["topics"]
    stale = 0
    pairs = [render_root(topics)] + [render_topic(t, topics) for t in topics]
    for dest, out in pairs:
        old = dest.read_text(encoding="utf-8") if dest.exists() else None
        if old == out:
            continue
        stale += 1
        if args.check:
            print("过期", dest.relative_to(VISUAL_VOCAB_APP))
        else:
            dest.write_text(out, encoding="utf-8", newline="")
            print("写入", dest.relative_to(VISUAL_VOCAB_APP))
    if args.check:
        print(f"过期页面 {stale} 个")
        return 1 if stale else 0
    print(f"更新 {stale} 个页面")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
