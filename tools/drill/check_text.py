#!/usr/bin/env python3
"""Question Drill 补题文字检查：结构、美式拼写、教科书套话、长度。

    python -I tools/drill/check_text.py content/drill/topup/*.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

BRITISH = {
    "colour": "color", "favourite": "favorite", "centre": "center",
    "realise": "realize", "organise": "organize", "travelling": "traveling",
    "travelled": "traveled", "cancelled": "canceled", "programme": "program",
    "litre": "liter", "metre": "meter", "cheque": "check",
    "queue": "line", "film": "movie",
    "petrol": "gas", "autumn": "fall", "rubbish": "trash", "mobile phone": "cell phone",
    "football": "soccer", "chemist": "pharmacy", "takeaway": "takeout",
    "underground": "subway", "return ticket": "round trip",
}

CLICHE = [
    "raining cats and dogs", "over the moon", "piece of cake", "break a leg",
    "how are you doing today", "nice to meet you", "it is my pleasure",
    "every coin has two sides", "as we all know", "last but not least",
    "when in rome", "the more the merrier", "no pain no gain",
]

PUNCT = re.compile(r"[\s，。！？、,.!?;；:：\"'“”‘’…（）()《》【】\-—]+")


def norm(text: str) -> str:
    return PUNCT.sub("", text).lower()


def load_batch(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("items", []) if isinstance(data, dict) else data


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    args = ap.parse_args()

    problems = 0
    total = 0
    for raw in args.paths:
        path = Path(raw)
        items = load_batch(path)
        print(f"\n{path.name}: {len(items)} 题")
        for i, item in enumerate(items, 1):
            total += 1
            tag = f"#{i} {item.get('zh', '?')}"
            answers = item.get("answers", [])
            if len(answers) != 3:
                print(f"  [结构] {tag} 有 {len(answers)} 个说法，应为 3")
                problems += 1
            if not item.get("zh", "").strip():
                print(f"  [结构] {tag} 缺中文题干")
                problems += 1
            if not item.get("scene", "").strip():
                print(f"  [结构] {tag} 缺场景")
                problems += 1
            seen = set()
            for j, a in enumerate(answers, 1):
                en = a.get("en", "").strip()
                if not en:
                    print(f"  [结构] {tag} 第 {j} 个说法是空的")
                    problems += 1
                    continue
                if not a.get("zh", "").strip():
                    print(f"  [结构] {tag} 第 {j} 个说法缺中文")
                    problems += 1
                if not a.get("note", "").strip():
                    print(f"  [结构] {tag} 第 {j} 个说法缺注释")
                    problems += 1
                n = en.lower()
                if n in seen:
                    print(f"  [重复] {tag} 同一题内重复：{en}")
                    problems += 1
                seen.add(n)
                if not en.endswith(("?", ".", "!")):
                    print(f"  [标点] {tag} 缺句末标点：{en}")
                    problems += 1
                if len(re.findall(r"[A-Za-z']+", en)) > 20:
                    print(f"  [长度] {tag} 超过 20 词：{en}")
                    problems += 1
                low = en.lower()
                for brit, us in BRITISH.items():
                    if re.search(rf"\b{re.escape(brit)}\b", low):
                        print(f"  [英式] {tag} {brit} → {us}：{en}")
                        problems += 1
                for phrase in CLICHE:
                    if phrase in low:
                        print(f"  [套话] {tag} 出现 {phrase!r}：{en}")
                        problems += 1

    print(f"\n共 {total} 题；{'通过' if not problems else f'{problems} 处需要处理'}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
