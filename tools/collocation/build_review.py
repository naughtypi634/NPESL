#!/usr/bin/env python3
"""Render build/opposites-candidates.json into a readable review sheet."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import BUILD, COLLOCATION_CONTENT  # noqa: E402


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    themes = json.loads((COLLOCATION_CONTENT / "themes.json").read_text(encoding="utf-8"))["themes"]
    order = {t["id"]: i for i, t in enumerate(themes, 1)}
    title = {t["id"]: t["title_zh"] for t in themes}
    en = {t["id"]: t["title_en"] for t in themes}

    entries: dict[str, dict] = {}
    for theme in themes:
        doc = json.loads((COLLOCATION_CONTENT / f"{theme['id']}.json").read_text(encoding="utf-8"))
        for e in doc["entries"]:
            entries[e["id"]] = {
                "head": e["head"],
                "zh": e["zh"],
                "theme": doc["theme"],
                "senses": e["senses"],
            }

    cand = json.loads((BUILD / "opposites-candidates.json").read_text(encoding="utf-8"))
    missing = {m["id"]: m for m in cand["missing"]}

    groups: dict[str, list] = {}
    for a, b, note in cand["pairs"]:
        ta = entries[a]["theme"] if a in entries else missing[a]["theme"]
        groups.setdefault(ta, []).append((a, b, note))

    lines = ["# 短语搭配：反义对偶候选清单", ""]
    existing_covered = {x for p in cand["pairs"] for x in p[:2] if x in entries}
    word_count = sum(len(v) for v in cand.get("word_opposites", {}).values())
    lines.append(
        f"{len(cand['pairs'])} 对，覆盖现有 {len(existing_covered)} 条；"
        f"另有 {len(cand['missing'])} 条待补、{word_count} 条单词反义只显示不跳转。"
        f"当前词库 {len(entries)} 条。"
    )
    lines.append("")
    lines.append(
        "判定标准：两个义项互换后意思直接相反/相对；按义项配对，不按词形。"
        "一条词条可以按义项挂多个反义；反义是单个单词时只作提示，不做跳转。"
    )
    lines.append("")
    for theme in themes:
        if theme["id"] not in groups:
            continue
        lines.append(f"## {order[theme['id']]:02d} {theme['title_zh']} · {theme['title_en']}")
        for a, b, note in groups[theme["id"]]:
            A = entries.get(a) or missing[a]
            B = entries.get(b) or missing[b]
            ma = "" if a in entries else " 〔缺，待补〕"
            mb = "" if b in entries else " 〔缺，待补〕"
            cross = (
                ""
                if A["theme"] == B["theme"]
                else f" 跨页 {order[A['theme']]:02d}↔{order[B['theme']]:02d}"
            )
            lines.append(f"- **{A['head']}**{ma} ↔ **{B['head']}**{mb} — {note}{cross}")
        lines.append("")

    lines.append("## 单词反义（只显示，不跳转）")
    lines.append("")
    word_groups: dict[str, list] = {}
    for eid, items in cand.get("word_opposites", {}).items():
        word_groups.setdefault(entries[eid]["theme"], []).append((eid, items))
    for theme in themes:
        for eid, items in word_groups.get(theme["id"], []):
            e = entries[eid]
            sense_texts = "；".join(
                f"义项{item['sense']}「{e['senses'][item['sense'] - 1]['zh']}」→ {item['word']}（{item['zh']}）"
                for item in items
            )
            lines.append(f"- **{e['head']}**：{sense_texts}")
    lines.append("")

    lines.append("## 缺的一半（待补）")
    lines.append("")
    for m in cand["missing"]:
        partner = entries.get(m["pair_with"], {}).get("head", m["pair_with"])
        lines.append(
            f"- **{m['head']}** `{m['id']}` → 放进 {order[m['theme']]:02d} {title[m['theme']]}，"
            f"与 **{partner}** 配对。{m['reason']}"
        )
    lines.append("")
    lines.append("## 看过但不收的配对（避免硬凑）")
    lines.append("")
    for note in [
        "pick up ↔ see off：pick up 的服务义配 drop off；接机/送行的场景义再配 see off。send off 在本库是寄东西，不参与。",
        "take off ↔ land：起飞义的对应词是单词 land，按单词反义显示；脱掉义配 put on 词条。",
        "turn up ↔ turn down：turn up 是到场，turn down 是拒绝，意思不对立。",
        "stand out ↔ blend in：blend in 在本库是化妆“晕开”，不是社交“融入”；改用 stand out ↔ fit in。",
        "shut down ↔ start up / boot up：两者几乎同义，不并排挂两个，选更常见的 boot up。",
        "warm up ↔ warm down：warm down 是英式，美式说 cool down；这版先不挂。",
        "print off / book in / put by / clear off / strip off / do up：英式或不够日常，改用 print out / sign up for / put aside / pay off，其余不硬凑。",
        "use up ↔ run low on：不是严格对立（一个是用完，一个是快用完），不硬凑。",
    ]:
        lines.append(f"- {note}")
    lines.append("")

    out = BUILD / "opposites-review.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {out} ({len(cand['pairs'])} pairs, {len(cand['missing'])} missing)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
