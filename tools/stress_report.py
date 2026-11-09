#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate B2 logical-stress annotations and write a review page.

    .venv\\Scripts\\python.exe -I tools\\stress_report.py
    .venv\\Scripts\\python.exe -I tools\\stress_report.py --require-all

The review page lives in ``build/prosody-b2-unit1/`` and compares the old
Edge clip with the new Azure clip when both exist.  No network calls.
"""

from __future__ import annotations

import argparse
import html
import importlib.util
import json
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


def marked_html(text: str, indices: tuple) -> str:
    matches = list(pron.WORD_RE.finditer(text))
    wanted = set(indices)
    out: list[str] = []
    cursor = 0
    for index, match in enumerate(matches):
        if index not in wanted:
            continue
        out.append(html.escape(text[cursor:match.start()]))
        out.append('<strong class="stress">'
                   + html.escape(match.group(0)) + "</strong>")
        cursor = match.end()
    out.append(html.escape(text[cursor:]))
    return "".join(out)


def stressed_words(text: str, indices: tuple) -> str:
    matches = list(pron.WORD_RE.finditer(text))
    return " · ".join(
        f"<code>{html.escape(matches[i].group(0))}</code>"
        for i in indices if 0 <= i < len(matches)
    )


def audio_block(text: str, indices: tuple) -> str:
    old_key = build_site.clip_hash(text)
    new_key = build_site.clip_key(text, indices, "azure")
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
    path = ROOT / "content" / "conversation" / level / "content.py"
    spec = importlib.util.spec_from_file_location(f"stress_{level}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.UNITS[unit_no - 1]


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--level", default="B2")
    parser.add_argument("--unit", type=int, default=1)
    parser.add_argument("--require-all", action="store_true",
                        help="未标注的正文/问答句也算错误")
    args = parser.parse_args()

    unit = load_unit(args.level, args.unit)
    fixes = 0
    warnings = 0
    annotated = 0
    rows_html: list[str] = []

    for story in unit["stories"]:
        stress = story.get("stress") or {}
        known = {text for _, text in playable(story)}
        section_of = {text: section for section, text in playable(story)}
        for key in stress:
            if key not in known:
                print(f"FIX  {story['title']}: stress 键不在页面文本里：{key[:60]}…")
                fixes += 1
        for section, text in playable(story):
            indices = tuple(sorted({int(v) for v in stress.get(text, ())}))
            if section in {"body", "comp", "conv"} and not indices:
                if args.require_all:
                    print(f"FIX  {story['title']} [{section}] 未标注：{text[:60]}…")
                    fixes += 1
                else:
                    warnings += 1
            if not indices:
                continue
            annotated += 1
            count = token_count(text)
            if len(indices) > 3:
                print(f"FIX  {story['title']}: 重音超过 3 个：{text[:50]}…")
                fixes += 1
            if len(set(indices)) != len(indices):
                print(f"FIX  {story['title']}: 重音索引重复：{text[:50]}…")
                fixes += 1
            bad = [i for i in indices if i < 0 or i >= count]
            if bad:
                print(f"FIX  {story['title']}: 索引越界 {bad}（共 {count} 个词）：{text[:50]}…")
                fixes += 1
                continue
            rows_html.append(
                f'<article><p class="meta">{html.escape(story["title"])} · '
                f'{section}</p><p class="en">{marked_html(text, indices)}</p>'
                f'<p class="words">重音：{stressed_words(text, indices)}</p>'
                f'{audio_block(text, indices)}</article>'
            )

    page = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>B2 Unit 1 logical stress</title>
<style>
:root {{ --bg:#f7f7f5; --fg:#1c1c1a; --muted:#6d6d66; --rule:#dcdcd6;
  --card:#fff; --accent:#0b6e4f; --accent-soft:#e3f2ec; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#15171a; --fg:#eceae4;
  --muted:#a3a49c; --rule:#33363a; --card:#1d2024; --accent:#6fd6ad;
  --accent-soft:#1f3b32; }} }}
* {{ box-sizing:border-box; }}
body {{ margin:0; padding:28px 16px 64px; background:var(--bg); color:var(--fg);
  font:15px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif; }}
main {{ max-width:820px; margin:0 auto; }}
h1 {{ font-size:21px; margin:0 0 4px; }}
p.lead {{ color:var(--muted); margin:0 0 22px; }}
article {{ background:var(--card); border:1px solid var(--rule);
  border-radius:12px; padding:14px 16px; margin:0 0 12px; }}
p.meta {{ color:var(--muted); font-size:12px; letter-spacing:.04em;
  text-transform:uppercase; margin:0 0 6px; }}
p.en {{ margin:0 0 8px; font-size:16px; }}
.stress {{ color:var(--accent); background:var(--accent-soft);
  border-radius:4px; padding:0 2px; }}
p.words {{ margin:0 0 8px; color:var(--muted); font-size:13px; }}
code {{ font-size:13px; }}
.audio {{ display:flex; flex-wrap:wrap; gap:10px 16px; }}
.audio label {{ display:flex; flex-direction:column; gap:4px;
  font-size:12px; color:var(--muted); }}
audio {{ width:min(280px,100%); height:32px; }}
p.none {{ color:var(--muted); font-size:13px; margin:0; }}
</style></head><body><main>
<h1>B2 Unit 1 · logical stress</h1>
<p class="lead">{len(rows_html)} 句已标注。绿色词为逻辑重音；有音频时可对比旧 Edge 与新 Azure。</p>
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
