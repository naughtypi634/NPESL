#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate Travel English location files before they are rendered.

    python -I tools/validate_travel.py              # every location
    python -I tools/validate_travel.py airport-check-in

FIX   = the build must not run until this is fixed
REVIEW= read the line and decide
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import paths  # noqa: E402

FORBIDDEN = ["已学", "完成", "进度", "打卡", "标记为", "learned", "completed",
             "progress", "streak", "badge"]
LEVELS = {"survival", "conversational", "advanced"}


class Report:
    def __init__(self) -> None:
        self.fix = []
        self.review = []

    def bad(self, where: str, msg: str) -> None:
        self.fix.append(f"{where}: {msg}")

    def look(self, where: str, msg: str) -> None:
        self.review.append(f"{where}: {msg}")


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def check_location(loc: dict, lexicon: dict, scene: dict, rep: Report) -> None:
    where = loc.get("id", "?")
    for key in ("id", "region", "scene", "render", "title_en", "title_zh",
                "canvas", "background", "encounters", "items", "characters"):
        if key not in loc:
            rep.bad(where, f"missing field {key}")
            return
    if loc["render"] != "diorama":
        rep.bad(where, f"render must be diorama, got {loc['render']}")
    if loc["scene"] != scene["scene"]:
        rep.bad(where, f"scene points at {loc['scene']}, file says {scene['scene']}")

    speakers = {s["id"] for s in scene["speakers"]}
    encounters = {e["id"] for e in scene["encounters"]}
    unknown = [e for e in loc["encounters"] if e not in encounters]
    if unknown:
        rep.bad(where, f"unknown encounters {unknown}")

    canvas = loc["canvas"]
    cw, ch = canvas["w"], canvas["h"]
    if abs(cw / ch - 16 / 10) > 0.01:
        rep.bad(where, f"canvas {cw}x{ch} is not 16:10")
    if max(cw, ch) < 1200:
        rep.bad(where, f"canvas {cw}x{ch} is too small for a full-width scene")

    bg = paths.TRAVEL_APP / loc["background"]
    if not bg.exists():
        rep.bad(where, f"missing background {loc['background']}")
    elif bg.stat().st_size > 400 * 1024:
        rep.bad(where, f"background {bg.stat().st_size // 1024} KB > 400 KB")
    if "bg.webp" not in loc["background"]:
        rep.look(where, "background should be a .webp")

    if not 6 <= len(loc["items"]) <= 12:
        rep.bad(where, f"{len(loc['items'])} items; want 6-12")
    if not 1 <= len(loc["characters"]) <= 3:
        rep.bad(where, f"{len(loc['characters'])} characters; want 1-3")

    ids = [i["id"] for i in loc["items"]]
    if len(ids) != len(set(ids)):
        rep.bad(where, "duplicate item ids")

    points = []
    for item in loc["items"]:
        iw = f"{where}/{item.get('id', '?')}"
        lex = lexicon.get(item.get("lexicon", ""))
        if lex is None:
            rep.bad(iw, f"unknown lexicon {item.get('lexicon')!r}")
        else:
            for field in ("en", "ipa", "pos", "zh", "level"):
                if not lex.get(field):
                    rep.bad(iw, f"lexicon {lex['id']} missing {field}")
            if not lex.get("examples"):
                rep.bad(iw, f"lexicon {lex['id']} has no example")
        if not item.get("phrases"):
            rep.bad(iw, "no phrases")
        for ph in item.get("phrases", []):
            if not ph.get("en") or not ph.get("zh"):
                rep.bad(iw, "phrase needs en and zh")
            if ph["en"].endswith("?") and "？" not in ph["zh"]:
                rep.look(iw, f"question zh should end with ？: {ph['zh']}")
        for field in ("x", "y"):
            if not 0 <= item.get(field, -1) <= 100:
                rep.bad(iw, f"{field} out of 0-100")
        points.append((item["id"], item["x"], item["y"]))

    for person in loc["characters"]:
        cw_ = f"{where}/{person.get('id', '?')}"
        if person.get("speaker") not in speakers:
            rep.bad(cw_, f"unknown speaker {person.get('speaker')!r}")
        if person.get("encounter") not in encounters:
            rep.bad(cw_, f"unknown encounter {person.get('encounter')!r}")
        if person.get("encounter") not in loc["encounters"]:
            rep.bad(cw_, "character points at an encounter this location does not use")
        for field in ("x", "y"):
            if not 0 <= person.get(field, -1) <= 100:
                rep.bad(cw_, f"{field} out of 0-100")
        points.append((person["id"], person["x"], person["y"]))

    # every encounter must be reachable from this page
    used = {p["encounter"] for p in loc["characters"]}
    for name in loc["encounters"]:
        if name not in used:
            rep.bad(where, f"encounter {name} has no hotspot")

    # touches must not overlap on a phone-width canvas
    min_px = 44
    for i, (a, ax, ay) in enumerate(points):
        for b, bx, by in points[i + 1:]:
            dist = math.hypot((ax - bx) / 100 * cw, (ay - by) / 100 * ch)
            if dist < min_px:
                rep.look(where, f"{a} and {b} are {dist:.0f} px apart at full size")

    text = json.dumps(loc, ensure_ascii=False)
    for word in FORBIDDEN:
        if word in text:
            rep.bad(where, f"forbidden wording {word!r}")

    for enc in scene["encounters"]:
        if enc["id"] in loc["encounters"] and set(enc["levels"]) != LEVELS:
            rep.bad(where, f"encounter {enc['id']} must have three levels")


def main(argv: list[str]) -> int:
    scenes = load(paths.TRAVEL_CONTENT / "scenes.json")
    lexicon = {e["id"]: e for e in
               load(paths.CONTENT / "lexicon" / "entries.json")["entries"]}
    rep = Report()
    # Locations are built one slice at a time, so a declared location with no
    # file yet is simply not validated. Naming one explicitly still errors.
    wanted = argv[1:] or [lid for s in scenes["scenes"]
                          for lid in s.get("locations", [])
                          if (paths.TRAVEL_CONTENT / f"{lid}.json").exists()]
    known = {s["id"]: s for s in scenes["scenes"]}
    for lid in wanted:
        path = paths.TRAVEL_CONTENT / f"{lid}.json"
        if not path.exists():
            rep.bad(lid, "location file missing")
            continue
        loc = load(path)
        scene_id = loc.get("scene", "")
        if scene_id not in known:
            rep.bad(lid, f"unknown scene {scene_id!r}")
            continue
        scene = load(paths.TRAVEL_CONTENT / f"{scene_id}.json")
        check_location(loc, lexicon, scene, rep)

    for line in rep.fix:
        print("FIX   ", line)
    for line in rep.review:
        print("REVIEW", line)
    print(f"FIX {len(rep.fix)} REVIEW {len(rep.review)} locations {len(wanted)}")
    return 1 if rep.fix else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
