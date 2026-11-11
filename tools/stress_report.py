#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate B2 logical-stress annotations and write a review page.

    .venv\\Scripts\\python.exe -I tools\\stress_report.py
    .venv\\Scripts\\python.exe -I tools\\stress_report.py --require-all

Each annotated line needs one primary stress and at least one secondary
stress.  The review page lives in ``build/prosody-b2-unit1/`` and compares
the old Edge clip with the new Azure clip when both exist.  No network calls.
"""

from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "apps" / "conversation" / "source"
sys.path.insert(0, str(BUILD))
sys.path.insert(0, str(ROOT / "tools"))

import pron  # noqa: E402
import build_site  # noqa: E402

OUT = ROOT / "build" / "prosody-b2-unit1"
CACHE = ROOT / "build" / "tts" / "cs"
VOICE_DIRS = ("ava", "andrew")


def split_sentences(text: str) -> list:
    parts = re.split(r'([.!?]+["\'”’)\]]*)\s+', text.strip())
    out = []
    for i in range(0, len(parts) - 1, 2):
        s = (parts[i] + parts[i + 1]).strip()
        if s:
            out.append(s)
    if len(parts) % 2 == 1 and parts[-1].strip():
        out.append(parts[-1].strip())
    return out


def playable(story: dict) -> list[tuple[str, str]]:
    """(section, text) in page order."""
    rows: list[tuple[str, str]] = [("title", story["title"])]
    rows += [("vocab", word) for word in story["vocab"]]
    for para in story["text"]:
        rows += [("body", sentence) for sentence in split_sentences(para)]
    rows += [("comp", question) for question in story["comp"]]
    rows += [("conv", question) for question in story["conv"]]
    return rows


def token_count(text: str) -> int:
    return len(list(pron.WORD_RE.finditer(text)))


def marked_html(text: str, spec) -> str:
    primary, secondary, rise, fall = spec
    matches = list(pron.WORD_RE.finditer(text))
    out: list[str] = []
    cursor = 0
    for index, match in enumerate(matches):
        if index in fall:
            cls, mark = "primary", "↓"
        elif index in primary:
            cls, mark = "primary", "1"
        elif index in rise:
            cls, mark = "secondary", "↑"
        elif index in secondary:
            cls, mark = "secondary", "2"
        else:
            continue
        out.append(html.escape(text[cursor:match.start()]))
        out.append(f'<span class="{cls}">{html.escape(match.group(0))}'
                   f'<sup>{mark}</sup></span>')
        cursor = match.end()
    out.append(html.escape(text[cursor:]))
    return "".join(out)


def words_line(text: str, spec) -> str:
    primary, secondary, rise, fall = spec
    matches = list(pron.WORD_RE.finditer(text))

    def names(indices):
        return " · ".join(
            f"<code>{html.escape(matches[i].group(0))}</code>"
            for i in indices if 0 <= i < len(matches)
        ) or "—"

    return (f"主重音 1：{names(primary)}　"
            f"次重音 2：{names(secondary)}　"
            f"升调 ↑：{names(rise)}　降调 ↓：{names(fall)}")


def audio_block(text: str, spec) -> str:
    old_key = build_site.clip_hash(text)
    new_key = build_site.clip_key(text, spec, "azure")
    rows = []
    for label, key in (("旧 Edge", old_key), ("新 Azure", new_key)):
        for voice in VOICE_DIRS:
            path = CACHE / voice / key[:2] / f"{key}.mp3"
            if not path.exists():
                continue
            rel = path.relative_to(OUT.parent).as_posix()
            rows.append(
                f'<label>{voice} · {label}'
                f'<audio controls preload="none" src="../{rel}"></audio></label>'
            )
    if not rows:
        return '<p class="none">音频尚未生成</p>'
    return '<div class="audio">' + "".join(rows) + "</div>"


def load_unit(level: str, unit_no: int) -> dict:
    return build_site.load_level(level)[unit_no - 1]


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--level", default="B2")
    parser.add_argument("--unit", type=int, default=1)
    parser.add_argument("--require-all", action="store_true",
                        help="未标注的正文/问答句也算错误")
    args = parser.parse_args()

    global OUT
    OUT = ROOT / "build" / f"prosody-{args.level.lower()}-unit{args.unit}"
    label = f"{args.level} Unit {args.unit}"

    unit = load_unit(args.level, args.unit)
    fixes = 0
    warnings = 0
    annotated = 0
    rows_html: list[str] = []

    for story in unit["stories"]:
        stress = story.get("stress") or {}
        known = {text for _, text in playable(story)}
        for key in stress:
            if key not in known:
                print(f"FIX  {story['title']}: stress 键不在页面文本里：{key[:60]}…")
                fixes += 1
        section_rows = [f'<h2>{html.escape(story["title"])}</h2>']
        context = "".join(
            f'<p>{html.escape(para)}</p>' for para in story["text"]
        )
        section_rows.append(
            '<details class="ctx"><summary>上下文</summary>'
            + context + "</details>"
        )
        for section, text in playable(story):
            spec = build_site.stress_spec(story, text)
            primary, secondary, rise, fall = spec
            if section in {"body", "comp", "conv"} and not primary:
                if args.require_all:
                    print(f"FIX  {story['title']} [{section}] 未标注：{text[:60]}…")
                    fixes += 1
                else:
                    warnings += 1
            if not primary and not secondary and not rise and not fall:
                continue
            annotated += 1
            count = token_count(text)
            if not 1 <= len(primary) <= 3:
                print(f"FIX  {story['title']}: 主重音应为 1–3 个，实际 {len(primary)}：{text[:50]}…")
                fixes += 1
            if len(secondary) > 8:
                print(f"FIX  {story['title']}: 次重音超过 8 个：{text[:50]}…")
                fixes += 1
            if len(rise) > 5 or len(fall) > 3:
                print(f"FIX  {story['title']}: 升降调过多：{text[:50]}…")
                fixes += 1
            if set(primary) & set(secondary):
                print(f"FIX  {story['title']}: 主/次重音重叠：{text[:50]}…")
                fixes += 1
            if set(rise) & set(fall):
                print(f"FIX  {story['title']}: 同一词既升又降：{text[:50]}…")
                fixes += 1
            bad = [i for i in (*primary, *secondary, *rise, *fall)
                   if i < 0 or i >= count]
            if bad:
                print(f"FIX  {story['title']}: 索引越界 {bad}（共 {count} 个词）：{text[:50]}…")
                fixes += 1
                continue
            note = build_site.stress_note(story, text)
            note_html = (f'<p class="note">{html.escape(note)}</p>'
                         if note else "")
            section_rows.append(
                f'<article><p class="meta">{section}</p>'
                f'<p class="en">{marked_html(text, spec)}</p>'
                f'<p class="words">{words_line(text, spec)}</p>'
                f'{note_html}{audio_block(text, spec)}</article>'
            )
        rows_html.append('<section>' + "".join(section_rows) + "</section>")

    page = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{label} logical stress</title>
<style>
:root {{ --bg:#f7f7f5; --fg:#1c1c1a; --muted:#6d6d66; --rule:#dcdcd6;
  --card:#fff; --p:#0b6e4f; --p-soft:#e3f2ec;
  --s:#a05a00; --s-soft:#fff1dc; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#15171a; --fg:#eceae4;
  --muted:#a3a49c; --rule:#33363a; --card:#1d2024; --p:#6fd6ad;
  --p-soft:#1f3b32; --s:#f0b566; --s-soft:#3a2d19; }} }}
* {{ box-sizing:border-box; }}
body {{ margin:0; padding:28px 16px 64px; background:var(--bg); color:var(--fg);
  font:15px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif; }}
main {{ max-width:820px; margin:0 auto; }}
h1 {{ font-size:21px; margin:0 0 4px; }}
h2 {{ font-size:15px; margin:28px 0 10px; color:var(--muted);
  font-weight:600; letter-spacing:.04em; text-transform:uppercase; }}
p.lead {{ color:var(--muted); margin:0 0 22px; }}
details.ctx {{ background:var(--card); border:1px solid var(--rule);
  border-radius:12px; padding:10px 16px; margin:0 0 12px;
  color:var(--muted); font-size:14px; }}
details.ctx summary {{ cursor:pointer; color:var(--fg); }}
details.ctx p {{ margin:10px 0 0; }}
article {{ background:var(--card); border:1px solid var(--rule);
  border-radius:12px; padding:14px 16px; margin:0 0 12px; }}
p.meta {{ color:var(--muted); font-size:12px; letter-spacing:.04em;
  text-transform:uppercase; margin:0 0 6px; }}
p.en {{ margin:0 0 8px; font-size:16px; }}
.primary {{ color:var(--p); background:var(--p-soft); border-radius:4px;
  padding:0 2px; font-weight:650; }}
.secondary {{ color:var(--s); background:var(--s-soft); border-radius:4px;
  padding:0 2px; font-weight:550; }}
sup {{ font-size:9px; margin-left:1px; opacity:.75; }}
p.words {{ margin:0 0 8px; color:var(--muted); font-size:13px; }}
p.note {{ margin:0 0 8px; color:var(--muted); font-size:13px;
  border-left:3px solid var(--rule); padding-left:10px; }}
code {{ font-size:13px; }}
.audio {{ display:flex; flex-wrap:wrap; gap:10px 16px; }}
.audio label {{ display:flex; flex-direction:column; gap:4px;
  font-size:12px; color:var(--muted); }}
audio {{ width:min(280px,100%); height:32px; }}
p.none {{ color:var(--muted); font-size:13px; margin:0; }}
</style></head><body><main>
<h1>{label} · logical stress</h1>
<p class="lead">{len(rows_html)} 篇、{annotated} 句已标注。绿色 1 为主重音，橙色 2 为次重音。</p>
{''.join(rows_html)}
</main></body></html>"""

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "index.html").write_text(page, encoding="utf-8")
    print(f"\n标注 {annotated} 句，未标注 {warnings} 句（正文/问答）")
    print(f"FIX {fixes} · REVIEW {warnings if not args.require_all else 0}")
    print(f"页面：{OUT / 'index.html'}")
    return 1 if fixes else 0


if __name__ == "__main__":
    raise SystemExit(main())
