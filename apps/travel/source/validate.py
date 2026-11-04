#!/usr/bin/env python3
"""Structural and American-English checks for content/travel/*.json.

    python -I apps/travel/source/validate.py
    python -I apps/travel/source/validate.py --only airport

Exit code 0 = no FIX-level problems.  REVIEW items need a human look.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "tools"))

import check_bre  # noqa: E402
from maps import ARCHETYPES, VIEW_H, VIEW_W, render_map  # noqa: E402
from paths import TRAVEL_CONTENT  # noqa: E402

LEVELS = ("survival", "conversational", "advanced")
CJK = re.compile(r"[㐀-鿿　-〿＀-￯]")
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
WORD = re.compile(r"[A-Za-z][A-Za-z'’-]*")
TIME_24 = re.compile(r"\b(1[3-9]|2[0-3]):[0-5]\d\b")
DATE_SLASH = re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b")

CLICHES = (
    "raining cats and dogs", "over the moon", "piece of cake", "break a leg",
    "cost an arm and a leg", "once in a blue moon", "hit the nail on the head",
    "under the weather", "bite the bullet", "last but not least",
    "when in rome", "the more the merrier", "no pain no gain",
)

TRAVEL_BRITISH = [
    (re.compile(r"\breturn ticket(s)?\b", re.I), "round-trip ticket", "FIX"),
    (re.compile(r"\bsingle ticket(s)?\b", re.I), "one-way ticket", "FIX"),
    (re.compile(r"\btoilet(s)?\b", re.I), "restroom", "FIX"),
    (re.compile(r"\bground floor\b", re.I), "first floor", "FIX"),
    (re.compile(r"\btimetable(s)?\b", re.I), "schedule", "FIX"),
    (re.compile(r"\bcoach(es)?\b", re.I), "bus", "FIX"),
    (re.compile(r"\brailway station(s)?\b", re.I), "train station", "FIX"),
    (re.compile(r"\bfortnight(s)?\b", re.I), "two weeks", "FIX"),
    (re.compile(r"\bparacetamol\b", re.I), "acetaminophen / Tylenol", "FIX"),
    (re.compile(r"\bplaster(s)?\b", re.I), "Band-Aid", "FIX"),
    (re.compile(r"\bA&E\b"), "ER", "FIX"),
    (re.compile(r"\bGP\b"), "primary care doctor", "FIX"),
    (re.compile(r"\bbooking(s)?\b", re.I), "reservation", "REVIEW"),
    (re.compile(r"\bholiday(s)?\b", re.I), "vacation", "REVIEW"),
    (re.compile(r"\bthe bill\b", re.I), "the check", "REVIEW"),
]


def words(text: str) -> int:
    return len(WORD.findall(text))


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower()).rstrip(".!?")


class Problems:
    def __init__(self):
        self.fix = 0
        self.review = 0
        self.items: list[str] = []

    def bad(self, message: str) -> None:
        self.fix += 1
        self.items.append(f"FIX  {message}")

    def warn(self, message: str) -> None:
        self.review += 1
        self.items.append(f"REV  {message}")


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def skip_review(text: str, match) -> bool:
    """A few British-word rules are false positives in a travel context."""
    word = match.group(0).lower()
    if word in {"tap", "taps", "tapped", "tapping"}:
        context = text.lower()
        if "tap out" in context or any(token in context for token in
               ("card", "screen", "reader", "phone", "gate", "exit")):
            return True
    return False


def check_text(p: Problems, where: str, text: str, english: bool) -> None:
    if english:
        if CJK.search(text):
            p.bad(f"{where}: 英文里含中文")
        if "£" in text:
            p.bad(f"{where}: 用了 £，改成美元")
        for match in TIME_24.finditer(text):
            tail = text[match.end():match.end() + 6].lower()
            if "a.m" not in tail and "p.m" not in tail:
                p.bad(f"{where}: 24 小时制 {match.group(0)}，改成 12 小时制")
        if DATE_SLASH.search(text):
            p.warn(f"{where}: 日期 {DATE_SLASH.search(text).group(0)}，美式写成 September 12, 2026")
        low = text.lower()
        for phrase in CLICHES:
            if phrase in low:
                p.bad(f"{where}: 陈词滥调 {phrase!r}")
        for rx, rep, level in TRAVEL_BRITISH:
            for match in rx.finditer(text):
                if level == "FIX":
                    p.bad(f"{where}: 英式 {match.group(0)!r} → {rep}")
                else:
                    p.warn(f"{where}: 英式倾向 {match.group(0)!r} → {rep}")
        for rx, rep, note, level in check_bre.COMPILED:
            for match in rx.finditer(text):
                if level == "FIX":
                    p.bad(f"{where}: 英式 {match.group(0)!r} → {rep}" + (f"（{note}）" if note else ""))
                elif not skip_review(text, match):
                    p.warn(f"{where}: 英文歧义 {match.group(0)!r} → {rep}" + (f"（{note}）" if note else ""))
    else:
        if not CJK.search(text):
            p.bad(f"{where}: 中文里没有中文")
        if "£" in text:
            p.bad(f"{where}: 中文里出现 £")


def check_dup(p: Problems, where: str, en: str, kind: str, sid: str,
              seen: dict[str, tuple[str, str, str]]) -> None:
    """Phrases may echo inside their own dialogue; real copy-paste is an error."""
    key = norm(en)
    n = words(en)
    prev = seen.get(key)
    if not prev:
        seen[key] = (where, kind, sid)
        return
    prev_where, prev_kind, prev_scene = prev
    if prev_scene == sid and prev_kind != kind:
        return
    if n > 3:
        p.bad(f"{where}: 英文与 {prev_where} 重复")
    else:
        p.warn(f"{where}: 固定短句重复（{prev_where}）")


def check_scene(p: Problems, scene: dict, doc: dict,
                seen_english: dict[str, tuple[str, str, str]],
                seen_ids: dict[str, str]) -> None:
    sid = scene.get("id", "?")
    for key in ("id", "stage", "title_en", "title_zh", "map"):
        if key not in scene:
            p.bad(f"scene {sid}: 缺字段 {key}")
    if not SLUG.match(str(sid)):
        p.bad(f"scene {sid}: id 必须是 kebab-case")
    if sid in seen_ids:
        p.bad(f"scene {sid}: id 重复（另一处 {seen_ids[sid]}）")
    seen_ids[sid] = sid

    spec = scene.get("map") or {}
    archetype = spec.get("archetype")
    variant = spec.get("variant") or "default"
    if archetype not in ARCHETYPES:
        p.bad(f"scene {sid}: 未知地图原型 {archetype!r}")
        return
    if variant not in ARCHETYPES[archetype]:
        p.bad(f"scene {sid}: {archetype} 没有 variant {variant!r}")
        return
    zones = {z["id"]: z for z in ARCHETYPES[archetype][variant]["zones"]}
    spots = spec.get("hotspots") or []
    if not 3 <= len(spots) <= 5:
        p.bad(f"scene {sid}: 热点 {len(spots)} 个（要 3–5）")

    seen_spots = set()
    positions = []
    for spot in spots:
        hid = spot.get("id", "?")
        if hid in seen_spots:
            p.bad(f"scene {sid}/{hid}: 热点 id 重复")
        seen_spots.add(hid)
        zone = zones.get(spot.get("zone"))
        if zone is None:
            p.bad(f"scene {sid}/{hid}: 未知 zone {spot.get('zone')!r}")
            continue
        x = spot.get("x", zone["x"] + zone["w"] / 2 + spot.get("dx", 0))
        y = spot.get("y", zone["y"] + zone["h"] / 2 + spot.get("dy", 0))
        if not (0 <= x <= VIEW_W and 0 <= y <= VIEW_H):
            p.bad(f"scene {sid}/{hid}: 热点坐标越界 ({x}, {y})")
        positions.append((hid, x, y))
    for i, (a, ax, ay) in enumerate(positions):
        for b, bx, by in positions[i + 1:]:
            if ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5 < 90:
                p.warn(f"scene {sid}: 热点 {a} 与 {b} 相距太近，手机上可能重叠")
    try:
        projected = render_map(scene)["hotspots"]
        for i, a in enumerate(projected):
            for b in projected[i + 1:]:
                if ((a["x3d"] - b["x3d"]) ** 2
                        + (a["y3d"] - b["y3d"]) ** 2) ** 0.5 < 70:
                    p.warn(f"scene {sid}: 3D 视图里热点 {a['id']} 与 "
                           f"{b['id']} 相距太近")
    except Exception:  # noqa: BLE001 - structural errors are reported above
        pass

    path = TRAVEL_CONTENT / f"{sid}.json"
    if not path.exists():
        p.bad(f"scene {sid}: 缺少内容文件 {path.name}")
        return
    content = load(path)
    if content.get("scene") != sid:
        p.bad(f"{sid}.json: scene 字段应为 {sid!r}")
    speakers = content.get("speakers") or []
    speaker_ids = {}
    you_count = 0
    for sp in speakers:
        sp_id = sp.get("id")
        if not sp_id or sp_id in speaker_ids:
            p.bad(f"{sid}: speaker id 缺失或重复 {sp_id!r}")
        speaker_ids[sp_id] = sp
        if sp.get("voice") not in ("f", "m"):
            p.bad(f"{sid}/{sp_id}: voice 必须是 f 或 m")
        if sp.get("role") == "you":
            you_count += 1
        elif sp.get("role") != "staff":
            p.bad(f"{sid}/{sp_id}: role 必须是 staff 或 you")
    if you_count != 1:
        p.bad(f"{sid}: 必须恰好有一个 role=you（现在 {you_count}）")

    encounters = content.get("encounters") or []
    if not 3 <= len(encounters) <= 5:
        p.bad(f"{sid}: encounter {len(encounters)} 个（要 3–5）")
    enc_ids = set()
    for enc in encounters:
        eid = enc.get("id", "?")
        if eid in enc_ids:
            p.bad(f"{sid}/{eid}: encounter id 重复")
        enc_ids.add(eid)
        for key in ("title_en", "title_zh", "levels"):
            if key not in enc:
                p.bad(f"{sid}/{eid}: 缺字段 {key}")
    spot_refs = [spot.get("encounter") for spot in spots]
    for ref in spot_refs:
        if ref not in enc_ids:
            p.bad(f"{sid}: 热点引用了不存在的 encounter {ref!r}")
    for eid in enc_ids:
        if spot_refs.count(eid) != 1:
            p.bad(f"{sid}/{eid}: 必须恰好有一个热点（现在 {spot_refs.count(eid)}）")

    for enc in encounters:
        eid = enc.get("id", "?")
        levels = enc.get("levels") or {}
        if set(levels) != set(LEVELS):
            p.bad(f"{sid}/{eid}: levels 必须是 {LEVELS}")
            continue
        for level in LEVELS:
            data = levels[level]
            phrases = data.get("phrases") or []
            dialogue = data.get("dialogue") or []
            if not 4 <= len(phrases) <= 6:
                p.bad(f"{sid}/{eid}/{level}: 短语 {len(phrases)} 条（要 4–6）")
            if not 6 <= len(dialogue) <= 10:
                p.bad(f"{sid}/{eid}/{level}: 对话 {len(dialogue)} 轮（要 6–10）")
            notes = 0
            for index, item in enumerate(phrases, 1):
                where = f"{sid}/{eid}/{level}/p{index}"
                en = str(item.get("en", "")).strip()
                zh = str(item.get("zh", "")).strip()
                if not en or not zh:
                    p.bad(f"{where}: 缺英文或中文")
                    continue
                if en == zh:
                    p.bad(f"{where}: en 与 zh 相同")
                n = words(en)
                if not 1 <= n <= 18:
                    p.bad(f"{where}: {n} 词（要 1–18）")
                check_text(p, where, en, True)
                check_text(p, where, zh, False)
                check_dup(p, where, en, "p", sid, seen_english)
                if item.get("note"):
                    notes += 1
                    check_text(p, where, str(item["note"]), False)
                    if len(str(item["note"])) > 40:
                        p.bad(f"{where}: note 超过 40 字")
            for index, line in enumerate(dialogue, 1):
                where = f"{sid}/{eid}/{level}/d{index}"
                spk = line.get("spk")
                if spk not in speaker_ids:
                    p.bad(f"{where}: 未知 speaker {spk!r}")
                en = str(line.get("en", "")).strip()
                zh = str(line.get("zh", "")).strip()
                if not en or not zh:
                    p.bad(f"{where}: 缺英文或中文")
                    continue
                if en == zh:
                    p.bad(f"{where}: en 与 zh 相同")
                n = words(en)
                limit = 12 if level == "survival" else 28
                if not 2 <= n <= limit:
                    p.bad(f"{where}: {n} 词（要 2–{limit}）")
                check_text(p, where, en, True)
                check_text(p, where, zh, False)
                check_dup(p, where, en, "d", sid, seen_english)
                if line.get("note"):
                    notes += 1
                    check_text(p, where, str(line["note"]), False)
                    if len(str(line["note"])) > 40:
                        p.bad(f"{where}: note 超过 40 字")
            if notes > 1:
                p.bad(f"{sid}/{eid}/{level}: note 最多一条（现在 {notes}）")
            if not any(line.get("spk") == next(
                    (s["id"] for s in speakers if s.get("role") == "you"), None)
                    for line in dialogue):
                p.bad(f"{sid}/{eid}/{level}: 对话里没有 you 的台词")
            run = 1
            for prev, cur in zip(dialogue, dialogue[1:]):
                run = run + 1 if prev.get("spk") == cur.get("spk") else 1
                if run > 2:
                    p.bad(f"{sid}/{eid}/{level}: 同一角色连续超过 2 轮")
                    break

        listening = enc.get("listening")
        if not isinstance(listening, list) or not 2 <= len(listening) <= 4:
            p.bad(f"{sid}/{eid}: listening 要 2–4 组意图"
                  f"（现在 {len(listening) if isinstance(listening, list) else 0}）")
            continue
        intent_ids = set()
        for index, intent in enumerate(listening, 1):
            where = f"{sid}/{eid}/listen{index}"
            iid = str(intent.get("id", "")).strip()
            if not iid or iid in intent_ids:
                p.bad(f"{where}: 意图 id 缺失或重复 {iid!r}")
            intent_ids.add(iid)
            intent_zh = str(intent.get("intent_zh", "")).strip()
            if not intent_zh:
                p.bad(f"{where}: 缺 intent_zh")
            else:
                check_text(p, where, intent_zh, False)
            asks = intent.get("asks") or []
            if not 3 <= len(asks) <= 5:
                p.bad(f"{where}: 问法 {len(asks)} 条（要 3–5）")
            seen_asks = set()
            ask_text = " ".join(str(a.get("en", "")) for a in asks)
            for ask_index, ask in enumerate(asks, 1):
                aw = f"{where}/ask{ask_index}"
                en = str(ask.get("en", "")).strip()
                zh = str(ask.get("zh", "")).strip()
                if not en or not zh:
                    p.bad(f"{aw}: 缺英文或中文")
                    continue
                if en == zh:
                    p.bad(f"{aw}: en 与 zh 相同")
                n = words(en)
                if not 2 <= n <= 20:
                    p.bad(f"{aw}: {n} 词（要 2–20）")
                check_text(p, aw, en, True)
                check_text(p, aw, zh, False)
                key = norm(en)
                if key in seen_asks:
                    p.bad(f"{aw}: 同一组意图里问法重复")
                seen_asks.add(key)
            reply = intent.get("reply") or {}
            rw = f"{where}/reply"
            ren = str(reply.get("en", "")).strip()
            rzh = str(reply.get("zh", "")).strip()
            if not ren or not rzh:
                p.bad(f"{rw}: 缺英文或中文")
            else:
                n = words(ren)
                if not 1 <= n <= 15:
                    p.bad(f"{rw}: {n} 词（要 1–15）")
                check_text(p, rw, ren, True)
                check_text(p, rw, rzh, False)
            pattern = str(intent.get("pattern", "")).strip()
            if not pattern:
                p.bad(f"{where}: 缺 pattern")
            else:
                check_text(p, f"{where}/pattern", pattern, True)
            keys = intent.get("keys") or []
            if not isinstance(keys, list):
                p.bad(f"{where}: keys 必须是数组")
            else:
                for key_word in keys:
                    if str(key_word).lower() not in ask_text.lower():
                        p.warn(f"{where}: 关键词 {key_word!r} 没在任何问法里出现")
            note = str(intent.get("note", "")).strip()
            if note:
                check_text(p, f"{where}/note", note, False)
                if len(note) > 40:
                    p.bad(f"{where}: note 超过 40 字")


def check_built(p: Problems) -> None:
    app = ROOT / "apps" / "travel"
    if not app.exists():
        return
    forbidden = [
        (re.compile(r"\d+\s*(个场景|条|课|题)"), "计数文案"),
        (re.compile(r"进度"), "进度文案"),
        (re.compile(r"已完成"), "完成标记"),
        (re.compile(r"得分"), "分数文案"),
        (re.compile(r"已学"), "已学标记"),
    ]
    for path in sorted(app.glob("*.html")):
        text = path.read_text(encoding="utf-8")
        for rx, label in forbidden:
            match = rx.search(text)
            if match:
                p.bad(f"{path.name}: 出现{label} {match.group(0)!r}")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="校验 Travel English 内容")
    ap.add_argument("--only", default="", help="只校验这些场景，逗号分隔")
    ap.add_argument("--built", action="store_true", help="同时扫描生成页面里的计数文案")
    args = ap.parse_args()

    p = Problems()
    try:
        doc = load(TRAVEL_CONTENT / "scenes.json")
    except Exception as error:  # noqa: BLE001
        print(f"FAIL scenes.json: {error}")
        return 1
    if doc.get("version") != 1:
        p.bad(f"scenes.json: version 应为 1，实际 {doc.get('version')!r}")
    if doc.get("default_level") not in LEVELS:
        p.bad(f"scenes.json: default_level {doc.get('default_level')!r} 不在 {LEVELS}")

    stages = doc.get("stages") or []
    scenes = doc.get("scenes") or []
    scene_by_id = {s.get("id"): s for s in scenes}
    stage_ids = set()
    stage_scenes = set()
    for stage in stages:
        sid = stage.get("id")
        if not sid or sid in stage_ids:
            p.bad(f"stage id 缺失或重复 {sid!r}")
        stage_ids.add(sid)
        for key in ("title_en", "title_zh", "scenes"):
            if key not in stage:
                p.bad(f"stage {sid}: 缺字段 {key}")
        for scene_id in stage.get("scenes", []):
            if scene_id in stage_scenes:
                p.bad(f"stage {sid}: scene {scene_id!r} 出现在多个 stage")
            stage_scenes.add(scene_id)
            scene = scene_by_id.get(scene_id)
            if not scene:
                p.bad(f"stage {sid}: 引用了不存在的 scene {scene_id!r}")
            elif scene.get("stage") != sid:
                p.bad(f"scene {scene_id}: stage 字段 {scene.get('stage')!r} 与 stage {sid!r} 不一致")
    for scene_id, scene in scene_by_id.items():
        if scene_id not in stage_scenes:
            p.bad(f"scene {scene_id}: 没有出现在任何 stage 的 scenes 里")

    only = {x.strip() for x in args.only.split(",") if x.strip()}
    if only:
        unknown = only - set(scene_by_id)
        for sid in sorted(unknown):
            p.bad(f"--only 未知场景 {sid!r}")

    seen_english: dict[str, str] = {}
    seen_ids: dict[str, str] = {}
    checked = 0
    for scene in scenes:
        sid = scene.get("id")
        if only and sid not in only:
            continue
        check_scene(p, scene, doc, seen_english, seen_ids)
        checked += 1

    if args.built:
        check_built(p)

    for item in p.items:
        print(item)
    print(f"\nFIX {p.fix}  REVIEW {p.review}  scenes {checked}")
    return 1 if p.fix else 0


if __name__ == "__main__":
    raise SystemExit(main())
