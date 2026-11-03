# -*- coding: utf-8 -*-
"""Structural checks for content/phrasal/*.json. Does not touch audio.

    python -I apps/phrasal/source/validate.py

Exit code 0 = no problems.
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
CONTENT = ROOT / "content" / "phrasal"
CHIPS = ROOT / "content" / "drill" / "chips.json"

LEVELS = {"A2", "B1", "B2", "C1"}
REGISTERS = {"spoken", "neutral", "written"}
REGISTER_ZH = {"spoken": "口语", "neutral": "中性", "written": "书面"}
KINDS = {"phrasal", "prep", "idiom"}

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


def check_entries(entries, chapter, chips, seen_ids, seen_sentences, bad):
    for entry in entries:
        eid = entry.get("id", "?")
        where = f"{chapter}/{eid}"

        if not SLUG.match(str(eid)):
            bad(f"{where}: id 必须是 kebab-case")
        if eid in seen_ids:
            bad(f"{where}: id 重复（另一处：{seen_ids[eid]}）")
        seen_ids[eid] = where

        for key in ("head", "base", "particle", "kind", "ipa",
                    "chip", "register", "separable", "zh", "senses"):
            if key not in entry:
                bad(f"{where}: 缺字段 {key}")
        if any(key not in entry for key in ("head", "senses")):
            continue

        kind = entry.get("kind")
        if kind not in KINDS:
            bad(f"{where}: kind {kind!r} 不在 {sorted(KINDS)}")
        head = entry["head"].strip()
        parts = head.split()
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
        if head != head.lower():
            bad(f"{where}: head 用小写")

        ipa = str(entry.get("ipa", ""))
        if "/" in ipa:
            bad(f"{where}: ipa 不要带斜杠")
        if "ˈ" not in ipa:
            bad(f"{where}: ipa 缺主重音 ˈ")
        odd = sorted({ch for ch in ipa if ch not in IPA_OK})
        if odd:
            bad(f"{where}: ipa 含非美式音标字符 {odd}")

        if "level" in entry and entry["level"] not in LEVELS:
            bad(f"{where}: level {entry.get('level')!r} 不在 {sorted(LEVELS)}")
        if entry.get("register") not in REGISTERS:
            bad(f"{where}: register {entry.get('register')!r} 不在 {sorted(REGISTERS)}")
        if "tier" in entry and (not isinstance(entry["tier"], int)
                                or not 1 <= entry["tier"] <= 3):
            bad(f"{where}: tier 应是 1/2/3")
        if entry.get("chip") not in chips:
            bad(f"{where}: chip {entry.get('chip')!r} 不在 chips.json")
        if not isinstance(entry.get("separable"), bool):
            bad(f"{where}: separable 应是 true/false")
        if not str(entry.get("l1_note", "")).strip():
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
            en = str(example.get("en", "")).strip()
            zh = str(example.get("zh", "")).strip()
            if not en:
                bad(f"{where}: sense {index} 缺例句")
                continue
            if not zh:
                bad(f"{where}: sense {index} 缺例句中译")
            if CJK.search(en):
                bad(f"{where}: sense {index} 英文例句里有中文")
            n = len(words(en))
            if not 4 <= n <= 30:
                bad(f"{where}: sense {index} 例句 {n} 词（要 4-30）")
            low = en.lower()
            hits = sorted({w for w in re.findall(r"[a-z']+", low) if w in BRITISH})
            if hits:
                bad(f"{where}: sense {index} 英式/英式场景词 {hits}")
            if low in seen_sentences:
                bad(f"{where}: 例句与 {seen_sentences[low]} 重复")
            seen_sentences[low] = where


def check_opposites(seen_ids, sense_counts, bad):
    """Validate content/phrasal/opposites.json against the loaded entries."""
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
