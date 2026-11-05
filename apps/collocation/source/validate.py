# -*- coding: utf-8 -*-
"""Structural checks for content/collocation/*.json. Does not touch audio.

    python -I apps/collocation/source/validate.py

Exit code 0 = no problems.
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
CONTENT = ROOT / "content" / "collocation"
CHIPS = ROOT / "content" / "drill" / "chips.json"

LEVELS = {"A2", "B1", "B2", "C1"}
REGISTERS = {"spoken", "neutral", "written"}
REGISTER_ZH = {"spoken": "口语", "neutral": "中性", "written": "书面"}
KINDS = {"phrasal", "prep", "idiom", "chunk"}

# 按 AGENTS.md 的硬规则：一律美式英语。这些词出现在例句里多半是英式残留。
BRITISH = {
    "colour", "colours", "favourite", "realise", "realised", "centre", "centres",
    "metre", "metres", "litre", "theatre", "travelling", "travelled", "cancelled",
    "labelled", "petrol", "motorway", "queue", "queued", "queueing", "mum",
    "rubbish", "lorry", "aeroplane", "aluminium", "programme", "cheque", "grey",
    "postcode", "chemist", "fortnight", "uni", "organisation", "organise",
    "neighbour", "neighbours", "apologise", "apologised", "practise", "practised",
}

CJK = re.compile(r"[㐀-鿿　-〿＀-￯]")
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
IPA_OK = set("ˈˌːəɪʊɛæɑɔʌɝɚθðʃʒŋɡʧʤjwpbtdkgfvszhlmnraeiou ʔ")


def words(text):
    return re.findall(r"[A-Za-z][A-Za-z'’-]*", text)


def check_example(where, en, zh, seen_sentences, bad, low=4, high=30):
    en = str(en or "").strip()
    zh = str(zh or "").strip()
    if not en:
        bad(f"{where}: 缺例句")
        return
    if not zh:
        bad(f"{where}: 缺例句中译")
    if CJK.search(en):
        bad(f"{where}: 英文例句里有中文")
    n = len(words(en))
    if not low <= n <= high:
        bad(f"{where}: 例句 {n} 词（要 {low}-{high}）")
    low_en = en.lower()
    hits = sorted({w for w in re.findall(r"[a-z']+", low_en) if w in BRITISH})
    if hits:
        bad(f"{where}: 英式/英式场景词 {hits}")
    if low_en in seen_sentences:
        bad(f"{where}: 例句与 {seen_sentences[low_en]} 重复")
    seen_sentences[low_en] = where


def check_ipa(where, ipa, bad):
    ipa = str(ipa or "")
    if "/" in ipa:
        bad(f"{where}: ipa 不要带斜杠")
    if "ˈ" not in ipa:
        bad(f"{where}: ipa 缺主重音 ˈ")
    odd = sorted({ch for ch in ipa if ch not in IPA_OK})
    if odd:
        bad(f"{where}: ipa 含非美式音标字符 {odd}")


def check_freq(where, value, bad):
    if not isinstance(value, int) or not 1 <= value <= 5:
        bad(f"{where}: freq 应是 1-5 的整数")


def check_variants(where, entry, seen_sentences, bad):
    """卡片内的近义替换；固定 3 条，差别说明必填。"""
    variants = entry.get("variants")
    if variants is None:
        return
    if not isinstance(variants, list):
        bad(f"{where}: variants 应是数组")
        return
    if len(variants) != 3:
        bad(f"{where}: variants 固定 3 条，实际 {len(variants)}")
    seen_heads = set()
    for index, variant in enumerate(variants, 1):
        vwhere = f"{where}/近义{index}"
        if not isinstance(variant, dict):
            bad(f"{vwhere}: 应是对象")
            continue
        for key in ("head", "ipa", "zh", "register", "freq", "example", "note_zh"):
            if key not in variant:
                bad(f"{vwhere}: 缺字段 {key}")
        head = str(variant.get("head", "")).strip()
        if head:
            if head != head.lower():
                bad(f"{vwhere}: head 用小写")
            if head in seen_heads or head == entry.get("head"):
                bad(f"{vwhere}: head {head!r} 重复")
            seen_heads.add(head)
        if "ipa" in variant:
            check_ipa(vwhere, variant.get("ipa"), bad)
        if variant.get("register") not in REGISTERS:
            bad(f"{vwhere}: register {variant.get('register')!r} 不在 {sorted(REGISTERS)}")
        if "freq" in variant:
            check_freq(vwhere, variant.get("freq"), bad)
        note = str(variant.get("note_zh", "")).strip()
        if not note or note in {"同义", "近义", "同义词", "意思一样"}:
            bad(f"{vwhere}: 缺差别说明 note_zh")
        example = variant.get("example") or {}
        check_example(vwhere, example.get("en", ""), example.get("zh", ""),
                      seen_sentences, bad, low=4, high=15)


def check_uses(where, entry, seen_sentences, bad):
    """名词卡上的动作搭配（如 package: get / sign for / track / pick up）。"""
    uses = entry.get("uses")
    if uses is None:
        return
    if not isinstance(uses, list):
        bad(f"{where}: uses 应是数组")
        return
    if not 2 <= len(uses) <= 8:
        bad(f"{where}: uses 应有 2-8 条，实际 {len(uses)}")
    seen = set()
    for index, use in enumerate(uses, 1):
        uwhere = f"{where}/用法{index}"
        if not isinstance(use, dict):
            bad(f"{uwhere}: 应是对象")
            continue
        for key in ("head", "zh", "example"):
            if key not in use:
                bad(f"{uwhere}: 缺字段 {key}")
        head = str(use.get("head", "")).strip()
        if head:
            if head != head.lower():
                bad(f"{uwhere}: head 用小写")
            if head in seen or head == entry.get("head"):
                bad(f"{uwhere}: head {head!r} 重复")
            seen.add(head)
        if not str(use.get("zh", "")).strip():
            bad(f"{uwhere}: 缺中文")
        example = use.get("example") or {}
        check_example(uwhere, example.get("en", ""), example.get("zh", ""),
                      seen_sentences, bad)


def check_entries(entries, chapter, chips, seen_ids, seen_sentences, bad):
    for entry in entries:
        eid = entry.get("id", "?")
        where = f"{chapter}/{eid}"

        if not SLUG.match(str(eid)):
            bad(f"{where}: id 必须是 kebab-case")
        if eid in seen_ids:
            bad(f"{where}: id 重复（另一处：{seen_ids[eid]}）")
        seen_ids[eid] = where

        kind = entry.get("kind")
        if kind not in KINDS:
            bad(f"{where}: kind {kind!r} 不在 {sorted(KINDS)}")

        if kind == "chunk":
            required = ("head", "kind", "chip", "zh", "senses")
        else:
            required = ("head", "base", "particle", "kind", "ipa",
                        "chip", "register", "separable", "zh", "senses")
        for key in required:
            if key not in entry:
                bad(f"{where}: 缺字段 {key}")
        if any(key not in entry for key in ("head", "senses")):
            continue

        head = entry["head"].strip()
        parts = head.split()
        if kind == "chunk":
            # 单词、be + -ed、整句都合法；允许自然大小写（I'm tired）。
            if not parts:
                bad(f"{where}: head 为空")
        else:
            if len(parts) < 2:
                bad(f"{where}: head {head!r} 至少要两个词")
            else:
                if parts[0].lower() != str(entry.get("base", "")).lower():
                    bad(f"{where}: base 应等于 head 的第一个词")
                particle = str(entry.get("particle", "")).lower()
                if kind == "idiom":
                    if particle and particle not in [p.lower() for p in parts[1:]]:
                        bad(f"{where}: idiom 的 particle 要么留空，要么是 head 里的词")
                elif particle not in [p.lower() for p in parts[1:]]:
                    bad(f"{where}: particle 必须是 head 里 base 之后的一个词")
            if kind in ("prep", "idiom") and entry.get("separable"):
                bad(f"{where}: {kind} 不应标 separable")
            if not isinstance(entry.get("separable"), bool):
                bad(f"{where}: separable 应是 true/false")
            if head != head.lower():
                bad(f"{where}: head 用小写")

        if kind == "chunk":
            if str(entry.get("ipa", "")).strip():
                check_ipa(where, entry.get("ipa"), bad)
        else:
            check_ipa(where, entry.get("ipa", ""), bad)

        if "level" in entry and entry["level"] not in LEVELS:
            bad(f"{where}: level {entry.get('level')!r} 不在 {sorted(LEVELS)}")
        if "register" in entry and entry["register"] not in REGISTERS:
            bad(f"{where}: register {entry.get('register')!r} 不在 {sorted(REGISTERS)}")
        if "tier" in entry and (not isinstance(entry["tier"], int)
                                or not 1 <= entry["tier"] <= 3):
            bad(f"{where}: tier 应是 1/2/3")
        if "freq" in entry:
            check_freq(where, entry["freq"], bad)
        if entry.get("chip") not in chips:
            bad(f"{where}: chip {entry.get('chip')!r} 不在 chips.json")
        if kind != "chunk" and not str(entry.get("l1_note", "")).strip():
            bad(f"{where}: 缺 l1_note（中文易错点）")
        coll = entry.get("collocations") or []
        coll_zh = entry.get("collocations_zh")
        if coll_zh is not None and len(coll_zh) != len(coll):
            bad(f"{where}: collocations_zh 数量 {len(coll_zh)} 与 collocations {len(coll)} 不一致")

        senses = entry.get("senses") or []
        if not senses:
            bad(f"{where}: senses 为空")
        for index, sense in enumerate(senses, 1):
            if not str(sense.get("zh", "")).strip():
                bad(f"{where}: sense {index} 缺中文义项")
            example = sense.get("example") or {}
            check_example(f"{where}: sense {index}",
                          example.get("en", ""), example.get("zh", ""),
                          seen_sentences, bad)

        check_variants(where, entry, seen_sentences, bad)
        check_uses(where, entry, seen_sentences, bad)


def check_opposites(seen_ids, sense_counts, bad):
    """Validate content/collocation/opposites.json against the loaded entries."""
    path = CONTENT / "opposites.json"
    if not path.exists():
        bad("opposites.json 不存在")
        return 0, 0
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except Exception as error:  # noqa: BLE001 - surface and continue
        bad(f"opposites.json 解析失败：{error}")
        return 0, 0
    if doc.get("version") != 1:
        bad(f"opposites.json: version 应为 1，实际 {doc.get('version')!r}")

    pairs = doc.get("pairs")
    if not isinstance(pairs, list):
        bad("opposites.json: pairs 应是数组")
        pairs = []
    seen_pairs = set()
    for index, pair in enumerate(pairs, 1):
        where = f"opposites.json 第 {index} 对"
        if (not isinstance(pair, list) or len(pair) != 2
                or not all(isinstance(item, str) for item in pair)):
            bad(f"{where}: 应是两个 id 的数组")
            continue
        left, right = pair
        for entry_id in (left, right):
            if entry_id not in seen_ids:
                bad(f"{where}: id {entry_id!r} 不存在")
        if left == right:
            bad(f"{where}: 不能自己配自己")
        key = frozenset((left, right))
        if key in seen_pairs:
            bad(f"{where}: {left} ↔ {right} 重复（含反向重复）")
        seen_pairs.add(key)

    word_map = doc.get("word_opposites") or {}
    if not isinstance(word_map, dict):
        bad("opposites.json: word_opposites 应是对象")
        word_map = {}
    word_count = 0
    for entry_id, items in word_map.items():
        if entry_id not in seen_ids:
            bad(f"word_opposites: id {entry_id!r} 不存在")
            continue
        if not isinstance(items, list) or not items:
            bad(f"word_opposites/{entry_id}: 应是非空数组")
            continue
        for item in items:
            if not isinstance(item, dict):
                bad(f"word_opposites/{entry_id}: 每一项应是对象")
                continue
            word = str(item.get("word", "")).strip()
            zh = str(item.get("zh", "")).strip()
            sense = item.get("sense")
            if not word:
                bad(f"word_opposites/{entry_id}: 缺 word")
            elif word != word.lower() or not re.fullmatch(r"[a-z][a-z' -]*", word):
                bad(f"word_opposites/{entry_id}: word {word!r} 应是小写英文单词")
            if not zh:
                bad(f"word_opposites/{entry_id}: 缺中文释义")
            if not isinstance(sense, int) or not 1 <= sense <= sense_counts.get(entry_id, 0):
                bad(f"word_opposites/{entry_id}: sense {sense!r} 超出义项范围")
            word_count += 1
    return len(pairs), word_count


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    problems = 0

    def bad(message):
        nonlocal problems
        print(f"  !! {message}")
        problems += 1

    try:
        themes = json.loads((CONTENT / "themes.json").read_text(encoding="utf-8"))
    except Exception as error:  # noqa: BLE001 - surface and stop
        print(f"FAIL themes.json: {error}")
        return 1

    chips_doc = json.loads(CHIPS.read_text(encoding="utf-8"))
    chips = set(chips_doc["chips"])

    PER_THEME = 30
    seen_themes = set()
    seen_ids = {}
    seen_sentences = {}
    sense_counts = {}
    total = 0
    short = []

    for theme in themes.get("themes", []):
        tid = theme.get("id")
        if tid in seen_themes:
            bad(f"主题 {tid!r} 重复")
        seen_themes.add(tid)
        for key in ("title_en", "title_zh", "intro_zh", "chips"):
            if key not in theme:
                bad(f"主题 {tid}: 缺字段 {key}")
        for chip in theme.get("chips", []):
            if chip not in chips:
                bad(f"主题 {tid}: chip {chip!r} 不在 chips.json")

        path = CONTENT / f"{tid}.json"
        if not path.exists():
            bad(f"主题 {tid}: 缺少内容文件 {path.name}")
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("theme") != tid:
            bad(f"{path.name}: theme 字段应写 {tid!r}")
        entries = data.get("entries", [])
        if not entries:
            bad(f"{path.name}: entries 为空")
        total += len(entries)
        for entry in entries:
            sense_counts[entry.get("id")] = len(entry.get("senses") or [])
        check_entries(entries, tid, chips, seen_ids, seen_sentences, bad)
        mark = "" if len(entries) >= PER_THEME else f"  ← 还差 {PER_THEME - len(entries)}"
        if len(entries) < PER_THEME:
            short.append(tid)
        print(f"{tid:<16} {len(entries):>3} 条  {theme.get('title_zh', '')}{mark}")

    pairs_count, words_count = check_opposites(seen_ids, sense_counts, bad)
    print(f"\n主题 {len(seen_themes)} 个，词条 {total} 条，"
          f"反义 {pairs_count} 对 + 单词反义 {words_count} 条，问题 {problems} 条")
    if short:
        print(f"少于 {PER_THEME} 条的主题：{', '.join(short)}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
