#!/usr/bin/env python3
"""Content gate for the Data Visualization Playground.

    python -I apps/data-viz/source/validate.py

Exit code 0 = no problems. The build calls validate_all() and refuses to write
anything when there are problems.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import COMPUTERS, compute_view  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
CONTENT = ROOT / "content" / "data-viz"
TOPICS = CONTENT / "topics"
LIBRARY = CONTENT / "library"

TYPES = {"line", "bar", "pie", "scatter", "stacked", "heatmap", "sankey", "slope", "waterfall"}
REGISTERS = {"spoken", "neutral", "written"}
LEVELS = {"a2", "b1", "b2"}
CJKS = re.compile(r"[㐀-鿿　-〿＀-￯]")
SLOT = re.compile(r"\{([a-z_]+)\}")
WORD = re.compile(r"[A-Za-z][A-Za-z'’-]*")

ALLOWED_SLOTS = {
    "subject", "from", "to", "from_period", "to_period", "period", "pct", "pp",
    "delta", "gap", "peak", "peak_period", "share", "share_number", "category",
    "rank", "rank_before", "source", "target", "x", "y", "value", "row", "col",
    "entity", "series_name", "unit", "top_category", "top_value", "x_value",
    "y_value", "direction", "group", "start", "end", "signed", "total", "r",
}

BRITISH = {
    "colour", "colours", "favourite", "realise", "realised", "centre", "centres",
    "metre", "metres", "litre", "theatre", "travelling", "travelled", "cancelled",
    "labelled", "petrol", "motorway", "queue", "queued", "queueing", "mum",
    "rubbish", "lorry", "aeroplane", "aluminium", "programme", "cheque", "grey",
    "postcode", "chemist", "fortnight", "uni", "organisation", "organise",
    "neighbour", "neighbours", "apologise", "apologised", "practise", "practised",
    "towards", "whilst", "amongst", "analyse", "defence", "licence", "modelling",
    "fulfil", "enrol", "judgement", "ageing", "storey", "tonne", "kerb", "tyre",
    "pyjamas", "moustache", "plough", "mould", "spelt", "learnt", "burnt",
    "dreamt", "leant",
}

CAUSAL = re.compile(
    r"\b(cause[sd]?|causing|leads? to|led to|result(s|ed)? in|due to|because of|"
    r"drives?|driven by|affect(s|ed)?|impact(s|ed)?)\b", re.I)


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def words(text: str) -> list[str]:
    return WORD.findall(text)


def check_en(where, text, problems, *, allow_causal=True, max_words=60):
    text = str(text or "").strip()
    if not text:
        problems.append(f"{where}: 空英文")
        return
    if CJKS.search(text):
        problems.append(f"{where}: 英文里有中文")
    low = text.lower()
    hits = sorted({w for w in re.findall(r"[a-z']+", low) if w in BRITISH})
    if hits:
        problems.append(f"{where}: 英式词 {hits}")
    if re.search(r"\bper cent\b", low):
        problems.append(f"{where}: 用 percent，不写 per cent")
    if "%" in text:
        problems.append(f"{where}: 英文句子里写 percent，不写 %")
    if not allow_causal and CAUSAL.search(text):
        problems.append(f"{where}: 出现因果词（{CAUSAL.search(text).group(0)}）")
    if not 1 <= len(words(text)) <= max_words:
        problems.append(f"{where}: 英文 {len(words(text))} 词（上限 {max_words}）")


def check_zh(where, text, problems, *, required=True):
    text = str(text or "").strip()
    if required and not text:
        problems.append(f"{where}: 缺中文")
    if text and CJKS.search(text) is None and re.search(r"[A-Za-z]{4,}", text):
        problems.append(f"{where}: 中文栏里像英文")


def check_slots(where, text, requires, problems):
    found = set(SLOT.findall(text))
    bad = sorted(found - ALLOWED_SLOTS)
    if bad:
        problems.append(f"{where}: 未知槽位 {bad}")
    missing = sorted(found - set(requires))
    if missing:
        problems.append(f"{where}: 槽位不在 requires 里 {missing}")
    if "{" in text.replace("{", "", 0) and re.search(r"\{[^}]*$", text):
        problems.append(f"{where}: 未闭合的槽位")
    return found


def check_view(where, view, library, problems):
    t = view.get("type")
    if t not in TYPES:
        problems.append(f"{where}: 未知图表类型 {t}")
        return
    unit = view.get("unit") or {}
    if not isinstance(unit.get("en"), str) or not unit.get("en"):
        problems.append(f"{where}: unit.en 缺失")
    if not isinstance(unit.get("decimals"), int):
        problems.append(f"{where}: unit.decimals 必须是整数")
    if not view.get("subject"):
        problems.append(f"{where}: 缺 subject")
    if not view.get("overview_zh"):
        problems.append(f"{where}: 缺 overview_zh")
    desc = view.get("descriptions") or {}
    for key in ("a2", "b1", "b2"):
        check_en(f"{where}/descriptions.general.{key}", (desc.get("general") or {}).get(key),
                 problems, max_words=90)
    for key in ("ielts", "business"):
        check_en(f"{where}/descriptions.{key}", desc.get(key), problems, max_words=90)

    if t in ("line", "bar", "stacked"):
        xs = (view.get("x") or {}).get("values") or []
        series = view.get("series") or []
        if not series:
            problems.append(f"{where}: 缺 series")
        if not 2 <= len(xs) <= 30:
            problems.append(f"{where}: x 有 {len(xs)} 个（要 2-30）")
        slots = [s.get("slot") for s in series]
        if len(set(slots)) != len(slots) or any(not isinstance(s, int) or not 1 <= s <= 8 for s in slots):
            problems.append(f"{where}: series slot 必须是 1-8 且唯一")
        for s in series:
            if len(s.get("values") or []) != len(xs):
                problems.append(f"{where}: 系列 {s.get('id')} 长度和 x 不一致")
            for v in s.get("values") or []:
                if not isinstance(v, (int, float)):
                    problems.append(f"{where}: 系列 {s.get('id')} 有非数字")
    elif t == "pie":
        parts = view.get("parts") or []
        if not 3 <= len(parts) <= 6:
            problems.append(f"{where}: 饼图要有 3-6 块（现在 {len(parts)}）")
        total = sum(p.get("value", 0) for p in parts)
        if total <= 0:
            problems.append(f"{where}: 饼图总值为 0")
        elif abs(total - 100) > 1.0:
            problems.append(f"{where}: 饼图合计 {total}，应为 100±1")
        if len({p.get("id") for p in parts}) != len(parts):
            problems.append(f"{where}: 饼图 id 重复")
    elif t == "scatter":
        points = view.get("points") or []
        groups = view.get("groups") or []
        if not 15 <= len(points) <= 60:
            problems.append(f"{where}: 散点要有 15-60 个点（现在 {len(points)}）")
        if len(groups) > 3:
            problems.append(f"{where}: 散点最多 3 组")
        if len({p.get("id") for p in points}) != len(points):
            problems.append(f"{where}: 散点 id 重复")
        for p in points:
            if not isinstance(p.get("x"), (int, float)) or not isinstance(p.get("y"), (int, float)):
                problems.append(f"{where}: 散点 {p.get('id')} x/y 不是数字")
    elif t == "heatmap":
        rows = view.get("rows") or []
        cols = view.get("cols") or []
        cells = view.get("cells") or []
        if not 3 <= len(rows) <= 10 or not 3 <= len(cols) <= 14:
            problems.append(f"{where}: 热力图行列数 {len(rows)}×{len(cols)} 超出范围")
        if len(cells) != len(rows) or any(len(r) != len(cols) for r in cells):
            problems.append(f"{where}: 热力图矩阵不齐")
        for row in cells:
            for v in row:
                if not isinstance(v, (int, float)):
                    problems.append(f"{where}: 热力图有非数字")
    elif t == "sankey":
        nodes = view.get("nodes") or []
        links = view.get("links") or []
        ids = {n.get("id") for n in nodes}
        if not 4 <= len(nodes) <= 16:
            problems.append(f"{where}: 流向图节点 {len(nodes)} 个（要 4-16）")
        if not 3 <= len(links) <= 24:
            problems.append(f"{where}: 流向图连线 {len(links)} 条（要 3-24）")
        cols = {n.get("id"): n.get("column") for n in nodes}
        for link in links:
            s, d = link.get("source"), link.get("target")
            if s not in ids or d not in ids:
                problems.append(f"{where}: 流向图连线指向不存在的节点 {s}->{d}")
            elif s == d:
                problems.append(f"{where}: 流向图不能自连 {s}")
            elif cols.get(d, 0) <= cols.get(s, 0):
                problems.append(f"{where}: 流向图必须从左列流向右列 {s}->{d}")
            if not isinstance(link.get("value"), (int, float)) or link["value"] <= 0:
                problems.append(f"{where}: 流向图数值必须为正")
    elif t == "slope":
        periods = view.get("periods") or []
        entities = view.get("entities") or []
        if not 2 <= len(periods) <= 3:
            problems.append(f"{where}: 斜率图要有 2-3 期")
        if not 2 <= len(entities) <= 8:
            problems.append(f"{where}: 斜率图要有 2-8 个对象")
        for e in entities:
            if len(e.get("values") or []) != len(periods):
                problems.append(f"{where}: 斜率图 {e.get('id')} 数值期数不符")
    elif t == "waterfall":
        steps = view.get("steps") or []
        if not 3 <= len(steps) <= 8:
            problems.append(f"{where}: 瀑布图要有 3-8 步")
        if not isinstance(view.get("start_value"), (int, float)):
            problems.append(f"{where}: 瀑布图缺 start_value")

    computed = compute_view(view)
    for feature in computed.values():
        if feature["kind"] not in library.get("features", {}):
            problems.append(f"{where}: 计算出的 kind {feature['kind']} 在库里没有")
    for authored in view.get("features") or []:
        where_f = f"{where}/feature:{authored.get('id')}"
        kind = authored.get("kind")
        if not kind:
            problems.append(f"{where_f}: 缺 kind")
            continue
        if kind not in library.get("features", {}):
            problems.append(f"{where_f}: 库中没有 kind {kind}")
        marks = authored.get("marks") or []
        if not marks:
            problems.append(f"{where_f}: 缺 marks")
        for mark in marks:
            if mark not in computed:
                problems.append(f"{where_f}: mark 不存在 {mark}")
        for ex in authored.get("examples") or []:
            check_en(f"{where_f}/example", ex.get("en"), problems, max_words=45)
            check_zh(f"{where_f}/example", ex.get("zh"), problems)
        if authored.get("note_zh"):
            check_zh(f"{where_f}/note", authored["note_zh"], problems)
        if authored.get("interpret_zh"):
            check_zh(f"{where_f}/interpret", authored["interpret_zh"], problems)
    count = len(view.get("features") or [])
    if not 3 <= count <= 8:
        problems.append(f"{where}: 作者特征 {count} 条（要 3-8）")

    # Correlation is not causation: scatter copy must hedge.
    if t == "scatter":
        scatter_texts = []
        for ex in view.get("features") or []:
            scatter_texts += [x.get("en", "") for x in ex.get("examples") or []]
        for key in ("a2", "b1", "b2"):
            scatter_texts.append(((desc.get("general") or {}).get(key) or ""))
        scatter_texts += [desc.get("ielts", ""), desc.get("business", "")]
        for text in scatter_texts:
            if CAUSAL.search(text):
                problems.append(f"{where}: 散点文本出现因果词（{CAUSAL.search(text).group(0)}）")


def check_library(type_id, lib, problems):
    where = f"library/{type_id}"
    if lib.get("type") != type_id:
        problems.append(f"{where}: type 字段不匹配")
    features = lib.get("features") or {}
    comparisons = {c.get("id"): c for c in lib.get("comparisons") or []}
    for cid, comp in comparisons.items():
        if not cid:
            problems.append(f"{where}: 比较条目缺 id")
            continue
        for key in ("a", "b", "meaning_zh", "grammar_zh", "collocations_zh", "usage_zh"):
            if not comp.get(key):
                problems.append(f"{where}/{cid}: 缺 {key}")
        for ex in comp.get("examples") or []:
            check_en(f"{where}/{cid}/example", ex.get("en"), problems, max_words=40)
    for kind, entry in features.items():
        kw = f"{where}/{kind}"
        if not entry.get("label_zh"):
            problems.append(f"{kw}: 缺 label_zh")
        requires = entry.get("requires") or []
        if not isinstance(requires, list):
            problems.append(f"{kw}: requires 必须是列表")
        words_list = entry.get("words") or []
        if len(words_list) < 3:
            problems.append(f"{kw}: 词汇少于 3 条")
        regs = [w.get("register") for w in words_list]
        if not {"spoken", "neutral", "written"} <= set(regs):
            problems.append(f"{kw}: 词汇没有覆盖 spoken/neutral/written")
        for w in words_list:
            check_en(f"{kw}/word:{w.get('en')}", w.get("en"), problems, max_words=8)
            check_zh(f"{kw}/word:{w.get('en')}", w.get("zh"), problems)
            if w.get("register") not in REGISTERS:
                problems.append(f"{kw}: register 非法 {w.get('register')}")
        patterns = entry.get("patterns") or []
        if len(patterns) < 1:
            problems.append(f"{kw}: 缺句型")
        if not any(p.get("level") == "a2" for p in patterns):
            problems.append(f"{kw}: 至少一个 A2 句型")
        for p in patterns:
            check_slots(f"{kw}/pattern:{p.get('id')}", p.get("frame", ""), requires, problems)
            check_slots(f"{kw}/pattern:{p.get('id')}", p.get("zh_frame", ""), requires, problems)
            check_en(f"{kw}/pattern:{p.get('id')}", p.get("frame"), problems, max_words=30)
            if p.get("level") not in LEVELS:
                problems.append(f"{kw}: 句型 level 非法")
        for cid in entry.get("compare") or []:
            if cid not in comparisons:
                problems.append(f"{kw}: 比较 id 不存在 {cid}")
        for trap in entry.get("traps") or []:
            check_en(f"{kw}/trap", trap.get("wrong_en"), problems, allow_causal=True, max_words=35)
            check_en(f"{kw}/trap", trap.get("right_en"), problems, allow_causal=True, max_words=35)
            if trap.get("wrong_en") == trap.get("right_en"):
                problems.append(f"{kw}: trap 的 wrong 和 right 相同")
            if "..." in (trap.get("wrong_en", "") + trap.get("right_en", "")):
                problems.append(f"{kw}: trap 里有占位省略号")
            if "{" in (trap.get("wrong_en", "") + trap.get("right_en", "")):
                problems.append(f"{kw}: trap 必须是独立例句，不能带槽位")
            check_zh(f"{kw}/trap", trap.get("why_zh"), problems)
        regs = entry.get("registers") or {}
        for reg in ("general", "ielts", "business"):
            text = regs.get(reg, "")
            check_slots(f"{kw}/registers.{reg}", text, requires, problems)
            check_en(f"{kw}/registers.{reg}", text, problems, max_words=35)


def validate_all(only_topic: str | None = None) -> list[str]:
    problems: list[str] = []
    manifest = load(CONTENT / "manifest.json")
    type_ids = {t["id"] for t in manifest.get("types", [])}
    if type_ids != TYPES:
        problems.append(f"manifest: 类型列表不全 {sorted(type_ids ^ TYPES)}")
    used_types: set[str] = set()
    seen_sentences: dict[str, str] = {}
    topic_ids = []
    entries = ([{"id": only_topic}] if only_topic
               else manifest.get("topics", []))
    for entry in entries:
        slug = entry.get("id")
        topic_ids.append(slug)
        path = TOPICS / f"{slug}.json"
        if not path.exists():
            problems.append(f"topics/{slug}.json 不存在")
            continue
        topic = load(path)
        if topic.get("id") != slug:
            problems.append(f"topics/{slug}: id 不匹配")
        if topic.get("demo") is not True:
            problems.append(f"topics/{slug}: 必须声明 demo: true")
        for key in ("title_en", "title_zh", "blurb_zh", "scene_zh"):
            if not topic.get(key):
                problems.append(f"topics/{slug}: 缺 {key}")
        views = topic.get("views") or []
        if not 1 <= len(views) <= 3:
            problems.append(f"topics/{slug}: views 数量 {len(views)}（要 1-3）")
        for vi, view in enumerate(views):
            where = f"topics/{slug}/{view.get('id') or vi}"
            t = view.get("type")
            used_types.add(t)
            lib_path = LIBRARY / f"{t}.json"
            if not lib_path.exists():
                problems.append(f"{where}: 缺 library/{t}.json")
                continue
            lib = load(lib_path)
            check_view(where, view, lib, problems)
            # Duplicate English sentences across the whole corpus.
            texts = []
            for ex in view.get("features") or []:
                texts += [x.get("en", "") for x in ex.get("examples") or []]
            for key in ("a2", "b1", "b2"):
                texts.append(((view.get("descriptions") or {}).get("general") or {}).get(key, ""))
            for key in ("ielts", "business"):
                texts.append((view.get("descriptions") or {}).get(key, ""))
            for text in texts:
                norm = re.sub(r"\s+", " ", text.lower()).strip()
                if not norm:
                    continue
                if norm in seen_sentences:
                    problems.append(f"{where}: 句子与 {seen_sentences[norm]} 重复")
                else:
                    seen_sentences[norm] = where
    for t in sorted(used_types):
        path = LIBRARY / f"{t}.json"
        if path.exists():
            check_library(t, load(path), problems)
    if len(topic_ids) != len(set(topic_ids)):
        problems.append("manifest: topic id 重复")
    # Coverage is reported by the build, not enforced while content is being written.
    for t in sorted(used_types):
        path = LIBRARY / f"{t}.json"
        if not path.exists():
            problems.append(f"library/{t}.json 不存在")
    return problems


def main() -> int:
    import argparse
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="校验数据图表英语内容")
    ap.add_argument("--topic", help="只校验一个主题文件")
    args = ap.parse_args()
    problems = validate_all(args.topic)
    if problems:
        print(f"发现 {len(problems)} 个问题：")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print("内容校验通过")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
