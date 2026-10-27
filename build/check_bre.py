#!/usr/bin/env python3
"""Check ESL course files for British English (project standard: American English only).

Usage:
    python build/check_bre.py                        # default: every MD/*.md
    python build/check_bre.py MD/25-Citywalk.md      # specific files
    python build/check_bre.py --all                  # every .md in the repo
    python build/check_bre.py --quiet                # per-file counts only
    python build/check_bre.py --strict               # exit 1 when FIX-level hits exist

Levels:
    FIX     confident British usage -> use the American form shown
    REVIEW  ambiguous word (e.g. "flat" as an adjective, "lift" as a verb)
            -> read the line and decide

Rule source: ESL-content.instructions.md ("American English only").
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# 本库没有单一的顶层 MD/：markdown 分散在五个类目下的 MD/ 里，所以默认扫描
# 整个库。SKIP_DIRS 排除了 build/（generated tex 是讲义正文的副本，扫了会
# 重复计数）和 PDF/。
MD_DIR = ROOT
SKIP_DIRS = {".venv", "node_modules", ".git", "build", "PDF"}
# 规则与导航文件不是给学生看的内容，自动扫描时跳过。AGENTS.md 里那份
# 英式→美式对照词表本身就写着 colour / flat / parcel 这些词，扫它会产生 28 条
# 永久假阳性，让 FIX = 0 这道门禁永远过不去。显式点名某个文件时仍然会扫。
META_FILES = {"AGENTS.md", "README.md", "CLAUDE.md"}

# ---------------------------------------------------------------- patterns
# (regex, american replacement, note)  -- confident British usage
FIX = [
    # spelling
    (r"\bcolour(s|ed|ing|ful)?\b", "color", ""),
    (r"\bfavour(s|ed|ing|able|ite|ites)?\b", "favor", ""),
    (r"\bhonour(s|ed|ing|able)?\b", "honor", ""),
    (r"\bbehaviour(s)?\b", "behavior", ""),
    (r"\bneighbour(s|hood|hoods)?\b", "neighbor", ""),
    (r"\bcentre(s)?\b", "center", ""),
    (r"\btheatre(s)?\b", "theater", ""),
    (r"\bmetre(s)?\b", "meter", ""),
    (r"\bkilometre(s)?\b", "kilometer", ""),
    (r"\bcentimetre(s)?\b", "centimeter", ""),
    (r"\blitre(s)?\b", "liter", ""),
    (r"\bprogramme(s)?\b", "program", ""),
    (r"\bdefence\b", "defense", ""),
    (r"\boffence\b", "offense", ""),
    (r"\b(licence|licences)\b", "license", "noun form"),
    (r"\bpractis(e|es|ed|ing)\b", "practice", "verb form"),
    (r"\b(realis|organis|recognis|apologis|specialis|standardi|summari|emphasi|"
     r"categoris|minimis|maximis|criticis)(e|ed|es|ing)\b", "-ize", "e.g. realise -> realize"),
    (r"\banalys(e|ed|es|ing)\b", "analyze", ""),
    (r"\btravell(ed|ing|er|ers)\b", "traveled", ""),
    (r"\bcancell(ed|ing)\b", "canceled", ""),
    (r"\blabell(ed|ing)\b", "labeled", ""),
    (r"\bmodell(ed|ing)\b", "modeled", ""),
    (r"\bjewellery\b", "jewelry", ""),
    (r"\bjudgement\b", "judgment", ""),
    (r"\bgrey(s|er|est)?\b", "gray", ""),
    (r"\baluminium\b", "aluminum", ""),
    (r"\btyre(s)?\b", "tire", ""),
    (r"\bkerb(s)?\b", "curb", ""),
    (r"\bpyjamas\b", "pajamas", ""),
    (r"\bmoustache\b", "mustache", ""),
    (r"\benrol(ed|ing|ment|ments)?\b", "enroll", "BrE single-l spellings; AmE enroll/enrollment keep double l"),
    (r"\bfulfil(l)?\b", "fulfill", ""),
    (r"\bskilful\b", "skillful", ""),
    (r"\bageing\b", "aging", ""),
    (r"\bcheque(s)?\b", "check", ""),
    (r"\bplough(s|ed|ing)?\b", "plow", ""),
    (r"\bmould(s|ed|ing)?\b", "mold", ""),
    (r"\btonne(s)?\b", "ton", ""),
    (r"\bstorey(s)?\b", "story", "floor of a building"),
    (r"\b(learnt|spelt|burnt|dreamt|leant)\b", "-ed",
     "learnt -> learned, spelt -> spelled, burnt -> burned"),
    # vocabulary
    (r"\bqueue(s|d|ing)?\b", "line", "排队 = stand in line"),
    (r"\brubbish\b", "trash", ""),
    (r"\bpavement(s)?\b", "sidewalk", ""),
    (r"\bcar ?park(s)?\b", "parking lot", ""),
    (r"\bzebra crossing(s)?\b", "crosswalk", ""),
    (r"\blorries?\b", "truck", ""),
    (r"\bpetrol\b", "gas", ""),
    (r"\bmobile phone(s)?\b", "cell phone", ""),
    (r"\bcinema(s)?\b", "movie theater", ""),
    (r"\bbiscuit(s)?\b", "cookie", ""),
    (r"\bcrisps\b", "chips", ""),
    (r"\bmaths\b", "math", ""),
    (r"(?<!Mid-)\bautumn\b", "fall", "Mid-Autumn 保留"),
    (r"\bchemist(s)?\b", "pharmacy", "also drugstore"),
    (r"\bpostcode(s)?\b", "zip code", ""),
    (r"\baeroplane(s)?\b", "airplane", ""),
    (r"\bmotorway(s)?\b", "highway", ""),
    (r"\bfortnight(s)?\b", "two weeks", ""),
    (r"\bparcel(s)?\b", "package", ""),
    (r"\bdustbin(s)?\b", "trash can", ""),
    (r"\bnapp(y|ies)\b", "diaper", ""),
    (r"\bpram(s)?\b", "stroller", ""),
    (r"\bcourgette(s)?\b", "zucchini", ""),
    (r"\baubergine(s)?\b", "eggplant", ""),
    (r"\bsellotape\b", "tape", ""),
    (r"\bhoover(s|ed|ing)?\b", "vacuum", ""),
    (r"\bflyover(s)?\b", "overpass", ""),
    # grammar
    (r"\b(have|has|had) got\b(?!\s+to\b)", "have / has / had", "AmE drops 'got' (possession)"),
    (r"\bat the weekend\b", "on the weekend", ""),
    (r"\bdifferent to\b", "different from", ""),
    (r"\bon holiday\b", "on vacation", ""),
    (r"\bin hospital\b", "in the hospital", ""),
    (r"\bput (my|your|his|her|their|the) phone on charge\b",
     "on the charger / charging", "BrE 充电；AmE 用 on the charger 或 charging"),
]

# (regex, american replacement, note) -- ambiguous, needs a human look
REVIEW = [
    (r"\btakeaway(s)?\b", "takeout",
     "外卖用 takeout；要点/收获 = takeaways 保留"),
    (r"\bflat(s)?\b", "apartment", "only when it means 公寓"),
    (r"\blift(s|ed|ing)?\b", "elevator", "only when it means 电梯"),
    (r"\bparcel(s)?\b", "package", "fine in shipping docs"),
    (r"\btube(s)?\b", "subway", "only when it means 地铁"),
    (r"\bunderground\b", "subway", "only when it means 地铁"),
    (r"\bwardrobe(s)?\b", "closet", ""),
    (r"\bcooker(s)?\b", "stove", "BrE 灶台；AmE cooker = 高压锅"),
    (r"\btorch(es)?\b", "flashlight", "BrE 手电筒；AmE torch = 火炬"),
    (r"\bjumper(s)?\b", "sweater", ""),
    (r"\btrainers\b", "sneakers", "BrE 运动鞋"),
    (r"\btin(s)?\b", "can", "only when it means 罐头"),
    (r"\bbin(s)?\b", "trash can", "only when it means 垃圾桶"),
    (r"\btap(s)?\b", "faucet", "only when it means 水龙头"),
    (r"\bjam\b", "jelly", "only when it means 果酱"),
    (r"\bchips\b", "fries", "AmE chips = 薯片"),
    (r"\bfootball\b", "soccer", "AmE football = 橄榄球"),
    (r"\bsurgery\b", "doctor's office", ""),
    (r"\bground floor\b", "first floor", "AmE first floor = 一楼"),
    (r"\bpost (me|it|this)\b", "mail", "only when it means 邮寄"),
    (r"\bholiday(s)?\b", "vacation", "假期用 vacation；公众节日 holiday 保留"),
    (r"\bhave got to\b", "have to", "AmE 口语也说；书面建议改 have to"),
    (r"\bseaside\b", "beach", "AmE 更常说 beach"),
    (r"\bporridge\b", "congee / oatmeal", "粥用 congee（中式）或 oatmeal（燕麦）"),
    (r"\bthe shops?\b", "the store", "only when it means 商店/商家（coffee shop / barber shop 保留）"),
]

COMPILED = [(re.compile(p, re.I), rep, note, "FIX") for p, rep, note in FIX] + [
    (re.compile(p, re.I), rep, note, "REVIEW") for p, rep, note in REVIEW
]


def md_files(paths: list[str], scan_all: bool) -> list[Path]:
    if paths:
        out: list[Path] = []
        for raw in paths:
            p = Path(raw)
            if not p.is_absolute():
                p = ROOT / p
            if p.is_dir():
                out.extend(sorted(p.rglob("*.md")))
            elif p.exists():
                out.append(p)
            else:
                print(f"[skip] not found: {raw}", file=sys.stderr)
        return out
    base = ROOT if scan_all else MD_DIR
    files = sorted(base.rglob("*.md"))
    return [
        f for f in files
        if not any(s in f.as_posix() for s in SKIP_DIRS) and f.name not in META_FILES
    ]


def scan(path: Path) -> list[tuple[int, str, str, str, str]]:
    hits = []
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        for rx, rep, note, level in COMPILED:
            for m in rx.finditer(line):
                hits.append((lineno, m.group(0), rep, note, level))
    return hits


def main() -> int:
    ap = argparse.ArgumentParser(description="Flag British English in ESL course files.")
    ap.add_argument("paths", nargs="*", help="files or folders (default: MD/*.md)")
    ap.add_argument("--all", action="store_true", help="scan every .md in the repo")
    ap.add_argument("--quiet", action="store_true", help="per-file counts only")
    ap.add_argument("--strict", action="store_true", help="exit 1 on FIX-level hits")
    args = ap.parse_args()

    files = md_files(args.paths, args.all)
    tally: dict[str, int] = {}
    n_fix = n_review = 0

    for path in files:
        hits = scan(path)
        if not hits:
            continue
        fix = [h for h in hits if h[4] == "FIX"]
        rev = [h for h in hits if h[4] == "REVIEW"]
        n_fix += len(fix)
        n_review += len(rev)
        rel = path.relative_to(ROOT) if ROOT in path.parents else path
        print(f"\n{rel}  —  FIX {len(fix)}  REVIEW {len(rev)}")
        if args.quiet:
            for _, word, _, _, _ in fix + rev:
                tally[word.lower()] = tally.get(word.lower(), 0) + 1
            continue
        for lineno, word, rep, note, level in fix + rev:
            extra = f"  ({note})" if note else ""
            print(f"  L{lineno:<5} [{level}] {word!r} -> {rep}{extra}")
            tally[word.lower()] = tally.get(word.lower(), 0) + 1

    print(f"\nscanned {len(files)} file(s): FIX {n_fix}, REVIEW {n_review}")
    if tally:
        top = sorted(tally.items(), key=lambda kv: -kv[1])[:15]
        print("top hits: " + ", ".join(f"{w}×{c}" for w, c in top))
    return 1 if (args.strict and n_fix) else 0


if __name__ == "__main__":
    raise SystemExit(main())
