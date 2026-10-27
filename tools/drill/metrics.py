#!/usr/bin/env python3
"""Summarize quality flags per batch so review effort can be targeted."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
import sys  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import DRILL_CONTENT  # noqa: E402

WORK = DRILL_CONTENT
WORD = re.compile(r"[a-z']+")
SPECIFIC = (
    "正式", "随意", "客气", "直接", "委婉", "口语", "书面", "强调", "朋友", "同事",
    "陌生", "上级", "客户", "家人", "熟人", "轻松", "抱怨", "建议", "请求", "确认",
    "惊讶", "催促", "礼貌", "语气", "场合", "比", "偏", "适合", "带点", "更",
)
META = ("例句", "答案", "解析", "题目", "练习题", "怎么说", "用英语", "英文", "翻译")


def toks(text: str) -> set[str]:
    return set(WORD.findall(text.lower()))


def jac(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def main() -> int:
    files = sorted((WORK / "raw").glob("batch-*.json"))
    if not files:
        print("no raw batches")
        return 1
    total = 0
    rows = []
    all_flags = []
    for path in files:
        d = json.loads(path.read_text(encoding="utf-8"))
        items = d.get("items", [])
        flags = 0
        details = []
        for i, q in enumerate(items, 1):
            for a in q.get("answers", []):
                if len(a.get("note", "")) < 20:
                    flags += 1
                    details.append(f"短注释 {q.get('zh','')[:12]}")
                if not any(k in a.get("note", "") for k in SPECIFIC):
                    flags += 1
                    details.append(f"笼统 {q.get('zh','')[:12]}")
            ans = q.get("answers", [])
            for x in range(len(ans)):
                for y in range(x + 1, len(ans)):
                    if jac(toks(ans[x].get("en", "")), toks(ans[y].get("en", ""))) >= 0.75:
                        flags += 1
                        details.append(f"英文相近 {q.get('zh','')[:12]}")
            for w in META:
                if w in q.get("zh", "") or w in q.get("scene", ""):
                    flags += 1
                    details.append(f"meta {q.get('zh','')[:12]}")
                    break
        total += len(items)
        rows.append((path.name, len(items), flags, details[:6]))
    rows.sort(key=lambda r: -r[2])
    print(f"raw batches {len(rows)}, items {total}")
    for name, n, flags, details in rows:
        print(f"{name}  items={n}  flags={flags}  " + " | ".join(details))
    print(f"total flags {sum(r[2] for r in rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
