#!/usr/bin/env python3
"""Quality audit for the generated zh-en question bank (build-time only)."""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BANK = ROOT / "build" / "zh-en-bank" / "questions.json"

META_WORDS = ("例句", "答案", "解析", "题目", "练习题", "怎么说", "用英语", "英文", "翻译")
QUESTION_HINT = re.compile(
    r"吗|呢|吧|呗|怎么|什么|哪|谁|几|多少|能不能|可不可以|要不要|是不是|"
    r"有没有|会不会|行不行|好不好|如何|多久|几点"
)
WORD = re.compile(r"[a-z']+")


def tokens(text: str) -> set[str]:
    return set(WORD.findall(text.lower()))


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def main() -> int:
    bank = json.loads(BANK.read_text(encoding="utf-8"))
    issues: list[str] = []
    near_pairs = 0
    similar_answers = 0
    nonquestions = 0
    en_counter: dict[str, int] = {}

    for i, q in enumerate(bank):
        if "？" not in q["zh"] and "?" not in q["zh"] and not QUESTION_HINT.search(q["zh"]):
            nonquestions += 1
            issues.append(f"#{i} 非问句: {q['zh']}")
        if not 2 <= len(q["answers"]) <= 3:
            issues.append(f"#{i} answers={len(q['answers'])}: {q['zh']}")
        if not q.get("scene"):
            issues.append(f"#{i} 无场景: {q['zh']}")
        for w in META_WORDS:
            if w in q["zh"] or w in q["scene"]:
                issues.append(f"#{i} 疑似 meta（{w}）: {q['zh']} / {q['scene']}")
                break
        for a in q["answers"]:
            en_counter[a["en"].strip().lower()] = en_counter.get(a["en"].strip().lower(), 0) + 1
            if len(a["note"]) < 11:
                issues.append(f"#{i} note 过短: {a['en']}")
        notes = [a["note"] for a in q["answers"]]
        if len(set(notes)) != len(notes):
            issues.append(f"#{i} note 重复: {q['zh']}")
        if len(q["answers"]) >= 2:
            pairs = [(x, y) for x in range(len(q["answers"])) for y in range(x + 1, len(q["answers"]))]
            for x, y in pairs:
                score = jaccard(tokens(q["answers"][x]["en"]), tokens(q["answers"][y]["en"]))
                if score >= 0.8:
                    similar_answers += 1
                    issues.append(
                        f"#{i} 英文高度相似 {score:.2f}: {q['answers'][x]['en']} <> {q['answers'][y]['en']}"
                    )

    for i in range(len(bank)):
        for j in range(i + 1, len(bank)):
            a, b = bank[i]["zh"], bank[j]["zh"]
            if abs(len(a) - len(b)) > 6:
                continue
            score = len(set(a) & set(b)) / len(set(a) | set(b))
            if score >= 0.85:
                near_pairs += 1
                if near_pairs <= 30:
                    issues.append(f"中文近似 {score:.2f}: {a} <> {b}")

    cats = Counter(q["cat"] for q in bank)
    dup_en = [(k, v) for k, v in en_counter.items() if v > 1]
    print(f"总题数 {len(bank)}")
    print(f"大类 {len(cats)}: " + ", ".join(f"{k} {v}" for k, v in cats.most_common()))
    print(f"答案条数: {dict(Counter(len(q['answers']) for q in bank))}")
    print(f"非问句 {nonquestions}，重复英文句 {len(dup_en)} 组 / 多出 {sum(v - 1 for _, v in dup_en)} 条")
    for k, v in sorted(dup_en, key=lambda x: -x[1])[:10]:
        print(f"  {v}× {k}")
    print(f"中文近似对 {near_pairs}，英文高度相似对 {similar_answers}，问题 {len(issues)} 条")
    for issue in issues[:80]:
        print(f"  {issue}")
    if len(issues) > 80:
        print(f"  ... 另有 {len(issues) - 80} 条")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
