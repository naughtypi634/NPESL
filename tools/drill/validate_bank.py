#!/usr/bin/env python3
"""Validate zh-en bank batches against the Basic Question Forms contract.

Every item must be a single clean Chinese question with 2-3 short, single
sentence English question forms (A1-A2). Run before assemble.py.

Usage:
    python tools/drill/validate_bank.py            # all final/batch-*.json
    python tools/drill/validate_bank.py --strict   # exit 1 on any problem
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
import sys  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import DRILL_CONTENT  # noqa: E402

WORK = DRILL_CONTENT
FINAL = WORK / "final"

CAT_COUNTS = {
    "日常起居": 87, "饮食": 100, "出行交通": 71, "工作职场": 124, "购物消费": 143,
    "居住": 73, "健康": 74, "人际社交": 100, "学习": 48, "科技网络": 46,
    "休闲娱乐": 67, "旅行": 96, "城市生活": 50, "服务求助": 49, "观点讨论": 50,
}

ZH_STOP = re.compile(r"[，。！、；：,;:\"'“”‘’（）()《》]")
PUNCT = re.compile(r"[\s，。！？、,.!?;；:：\"'“”‘’…（）()《》]+")
META = ("英语", "英文", "翻译", "例句", "怎么说", "句子", "题目", "答案", "练习")
GENERIC_NOTES = ("更自然", "更地道", "直译", "意译", "都可以", "差不多", "更常用")
WORD = re.compile(r"[a-z']+")


def norm_zh(text: str) -> str:
    return PUNCT.sub("", text).lower().replace("这个", "这").replace("那个", "那")


def tokens(text: str) -> set[str]:
    return set(WORD.findall(text.lower()))


def jaccard(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def load() -> list[tuple[Path, str, list[dict]]]:
    out = []
    for path in sorted(FINAL.glob("batch-*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            print(f"[ERROR] {path.name}: JSON 不合法 — {exc}")
            continue
        items = data.get("items")
        if not isinstance(items, list):
            print(f"[ERROR] {path.name}: 缺少 items 数组")
            continue
        out.append((path, data.get("category", ""), items))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()

    batches = load()
    if not batches:
        print("final/ 下没有 batch-*.json")
        return 1

    counts: dict[str, int] = {}
    problems: list[str] = []
    zh_seen: dict[str, str] = {}
    en_seen: dict[str, str] = {}
    total = 0

    for path, category, items in batches:
        if category not in CAT_COUNTS:
            problems.append(f"{path.name}: 未知大类 {category!r}")
            continue
        counts[category] = counts.get(category, 0) + len(items)
        for idx, q in enumerate(items, 1):
            tag = f"{path.name} #{idx}"
            total += 1
            zh = (q.get("zh") or "").strip()
            scene = (q.get("scene") or "").strip()
            answers = q.get("answers")

            if not zh.endswith(("？", "?")):
                problems.append(f"{tag}: 中文不是问句: {zh}")
            if ZH_STOP.search(zh):
                problems.append(f"{tag}: 中文含从句/标点: {zh}")
            if not 5 <= len(zh) <= 20:
                problems.append(f"{tag}: 中文长度 {len(zh)}: {zh}")
            if any(w in zh for w in META):
                problems.append(f"{tag}: 中文含 meta: {zh}")
            key_zh = norm_zh(zh)
            if key_zh in zh_seen:
                problems.append(f"{tag}: 中文重复（{zh_seen[key_zh]}）: {zh}")
            else:
                zh_seen[key_zh] = tag

            if not 3 <= len(scene) <= 18:
                problems.append(f"{tag}: 场景长度 {len(scene)}: {scene}")
            if any(w in scene for w in META) or "？" in scene:
                problems.append(f"{tag}: 场景不合格: {scene}")

            if not isinstance(answers, list) or not 2 <= len(answers) <= 3:
                problems.append(f"{tag}: 答案条数 {len(answers) if isinstance(answers, list) else '?'}")
                continue

            ens = []
            for a in answers:
                en = (a.get("en") or "").strip()
                note = (a.get("note") or "").strip()
                ens.append(en)
                if not en.endswith("?"):
                    problems.append(f"{tag}: 英文不是问句: {en}")
                if en.count("?") != 1:
                    problems.append(f"{tag}: 英文含多个问号: {en}")
                words = len(en.split())
                if not 2 <= words <= 10:
                    problems.append(f"{tag}: 英文 {words} 词: {en}")
                if not en[:1].isupper():
                    problems.append(f"{tag}: 英文未大写: {en}")
                low = en.lower()
                if low in en_seen:
                    problems.append(f"{tag}: 英文重复（{en_seen[low]}）: {en}")
                else:
                    en_seen[low] = tag
                if not 11 <= len(note) <= 30:
                    problems.append(f"{tag}: 说明 {len(note)} 字: {note}")
                if any(g in note for g in GENERIC_NOTES):
                    problems.append(f"{tag}: 说明空泛: {note}")

            for x in range(len(ens)):
                for y in range(x + 1, len(ens)):
                    if jaccard(tokens(ens[x]), tokens(ens[y])) >= 0.8:
                        problems.append(f"{tag}: 两条英文太近: {ens[x]} / {ens[y]}")

    print(f"读取 {len(batches)} 个批次，共 {total} 题")
    print("分类题数：")
    for cat, want in CAT_COUNTS.items():
        got = counts.get(cat, 0)
        flag = "" if got == want else f"  ← 应为 {want}"
        print(f"  {cat}: {got}{flag}")
    print(f"问题 {len(problems)} 条")
    for p in problems[:80]:
        print(f"  {p}")
    if len(problems) > 80:
        print(f"  ... 另有 {len(problems) - 80} 条")

    ok = not problems and all(counts.get(c) == n for c, n in CAT_COUNTS.items())
    if ok:
        print("\n全部通过")
    if args.strict and not ok:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
