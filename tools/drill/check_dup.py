#!/usr/bin/env python3
"""Question Drill 补题查重：三重校验。

1. 归一化后完全相同的题干 / 英文句
2. 字符 bigram（中文）与词集合（英文）相似度
3. 同批次内部互查

    python -I tools/drill/check_dup.py content/drill/topup/airport-01.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT / "content" / "drill" / "questions.json"

PUNCT = re.compile(r"[\s，。！？、,.!?;；:：\"'“”‘’…（）()《》【】\-—]+")


def norm(text: str) -> str:
    return PUNCT.sub("", text).lower()


def bigrams(text: str) -> set[str]:
    t = norm(text)
    return {t[i:i + 2] for i in range(len(t) - 1)} or {t}


def jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z']+", text.lower()) if len(w) > 2}


def load_bank() -> list[dict]:
    if not BANK.exists():
        return []
    return json.loads(BANK.read_text(encoding="utf-8"))


def load_batch(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        return data.get("items", [])
    return data


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+", help="补题 JSON（{chip, items} 或条目数组）")
    ap.add_argument("--zh", type=float, default=0.55, help="中文相似度阈值")
    ap.add_argument("--en", type=float, default=0.65, help="英文相似度阈值")
    args = ap.parse_args()

    bank = load_bank()
    old_zh = [(q["zh"], norm(q["zh"])) for q in bank]
    old_en = [(a["en"], norm(a["en"])) for q in bank for a in q.get("answers", [])]
    seen_zh = {n for _, n in old_zh}
    seen_en = {n for _, n in old_en}

    problems = 0
    for raw in args.paths:
        path = Path(raw)
        items = load_batch(path)
        print(f"\n{path.name}: {len(items)} 题")
        local_zh: list[tuple[str, str]] = []
        local_en: list[tuple[str, str]] = []

        for i, item in enumerate(items, 1):
            zh = item["zh"]
            nz = norm(zh)
            if nz in seen_zh:
                print(f"  [重复题干] #{i} {zh}")
                problems += 1
            else:
                for text, other in old_zh:
                    score = jaccard(bigrams(zh), bigrams(other))
                    if score >= args.zh:
                        print(f"  [题干近似 {score:.2f}] #{i} {zh}  ~  {text}")
                        problems += 1
                        break
                for text, other in local_zh:
                    score = jaccard(bigrams(zh), bigrams(other))
                    if score >= args.zh:
                        print(f"  [批内近似 {score:.2f}] #{i} {zh}  ~  {text}")
                        problems += 1
                        break
            local_zh.append((zh, nz))

            for a in item.get("answers", []):
                en = a["en"]
                ne = norm(en)
                if ne in seen_en:
                    print(f"  [重复英文] #{i} {zh} -> {en}")
                    problems += 1
                else:
                    for text, other in old_en:
                        score = jaccard(words(en), words(text))
                        if score >= args.en:
                            # 对照句只有三四个词时（"Are there any left?"），
                            # 词集合重合不代表同义，只提示人工看一眼。
                            if len(words(text)) <= 4:
                                print(f"  [参考 {score:.2f}] #{i} {zh} -> {en}  ~  {text}")
                            else:
                                print(f"  [英文近似 {score:.2f}] #{i} {zh} -> {en}  ~  {text}")
                                problems += 1
                            break
                    for text, other in local_en:
                        score = jaccard(words(en), words(text))
                        if score >= args.en:
                            if len(words(text)) <= 4:
                                print(f"  [批内参考 {score:.2f}] #{i} {zh} -> {en}  ~  {text}")
                            else:
                                print(f"  [批内英文近似 {score:.2f}] #{i} {zh} -> {en}  ~  {text}")
                                problems += 1
                            break
                local_en.append((en, ne))

        seen_zh.update(nz for _, nz in local_zh)
        seen_en.update(ne for _, ne in local_en)

    print(f"\n{'通过，无重复' if not problems else f'共 {problems} 处需要处理'}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
