# -*- coding: utf-8 -*-
"""图解词汇内容校验：坐标、框、遮罩、录音、画风与主题归属。

    python -I tools/vv/validate.py

只读 content/visual-vocabulary 与 apps/visual-vocabulary，不联网。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import VV_CONTENT, VISUAL_VOCAB_APP  # noqa: E402

STYLES = ("flat", "clay", "ink")
problems: list[str] = []
no_mask: list[str] = []


def bad(msg: str) -> None:
    problems.append(msg)


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def resolve(path: str, base: Path) -> bool:
    return (base / path).resolve().is_file()


def check_scene(path: Path, slugs: set[str]) -> tuple[str, dict]:
    spec = load(path)
    page = spec["page"]
    base = VISUAL_VOCAB_APP / spec["dir"]

    if not resolve(spec["image"], base):
        bad(f"{page}: 场景图不存在 {spec['image']}")
    if not resolve(spec["thumb"], base):
        bad(f"{page}: 缩略图不存在 {spec['thumb']}")
    if not spec.get("prompt"):
        bad(f"{page}: 缺少生成提示词")

    styles = spec.get("styles", [])
    for style in styles:
        if not resolve(spec.get("images", {}).get(style, ""), base):
            bad(f"{page}: {style} 场景图不存在")
        if not resolve(spec.get("thumbs", {}).get(style, ""), base):
            bad(f"{page}: {style} 缩略图不存在")

    seen: dict[tuple[float, float], str] = {}
    for w in spec["words"]:
        slug = w["slug"]
        if slug not in slugs:
            bad(f"{page}/{slug}: 词卡表里没有这个词")
        if "pt" not in w:
            bad(f"{page}/{slug}: 缺 pt")
            continue
        x, y = w["pt"]
        if not (0 < x < 100 and 0 < y < 100):
            bad(f"{page}/{slug}: pt 越界 {x},{y}")
        key = (round(float(x), 1), round(float(y), 1))
        if key in seen:
            bad(f"{page}: {slug} 与 {seen[key]} 坐标重合 {key}")
        seen[key] = slug

        box = w.get("box")
        if not box or len(box) != 4:
            bad(f"{page}/{slug}: 缺范围框")
        else:
            x0, y0, x1, y1 = [float(v) for v in box]
            if not (0 <= x0 < x1 <= 100 and 0 <= y0 < y1 <= 100):
                bad(f"{page}/{slug}: 范围框越界 {box}")
            elif not (x0 <= x <= x1 and y0 <= y <= y1):
                bad(f"{page}/{slug}: 中心点不在范围内")

        if w.get("mask") and not resolve(w["mask"], base):
            bad(f"{page}/{slug}: 遮罩不存在 {w['mask']}")
        elif not w.get("mask"):
            no_mask.append(f"{page}/{slug}")
        for style, mask in (w.get("masks") or {}).items():
            if style not in styles:
                bad(f"{page}/{slug}: 遮罩画风 {style} 不在 styles 里")
            if not resolve(mask, base):
                bad(f"{page}/{slug}: {style} 遮罩不存在")

        root = w.get("audio_root")
        audio_base = (base / root).resolve() if root else base / "audio"
        for voice in ("h2", "c"):
            name = w.get(f"audio_{voice}", slug)
            if not (audio_base / voice / f"{name}.mp3").is_file():
                bad(f"{page}/{slug}: 缺 {voice} 录音")
    return page, spec


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    topics = load(VV_CONTENT / "topics.json")["topics"]
    sets = {}
    for topic in topics:
        data = load(VV_CONTENT / "sets" / topic["set"])
        sets[topic["id"]] = data
        for sec in data["sections"]:
            for it in sec["items"]:
                img = it.get("img") or f'{it["slug"]}.webp'
                p = VISUAL_VOCAB_APP / data["set"] / data["asset_root"] / img
                if not p.is_file():
                    bad(f'{data["set"]}/{it["slug"]}: 词卡图不存在 {img}')

    all_slugs = {it["slug"] for d in sets.values()
                 for sec in d["sections"] for it in sec["items"]}

    scenes = {p.stem: p for p in (VV_CONTENT / "scenes").glob("*.json")}
    used: dict[str, int] = {}
    for topic in topics:
        for item in topic.get("scenes", []):
            if not isinstance(item, str):
                continue  # 动作页这类非场景入口
            page = item
            if page not in scenes:
                bad(f'{topic["id"]}: 场景 {page} 没有数据文件')
                continue
            used[page] = used.get(page, 0) + 1
            _, spec = check_scene(scenes[page], all_slugs)
            if spec.get("topic") != topic["id"]:
                bad(f"{page}: topic 字段 {spec.get('topic')} 与主题 {topic['id']} 不一致")
    for page in scenes:
        if page not in used:
            bad(f"{page}: 没有出现在任何主题里")

    n_scenes = len(scenes)
    n_words = sum(len(load(p)["words"]) for p in scenes.values())
    if problems:
        for msg in problems:
            print("FAIL", msg)
        print(f"visual-vocabulary: {len(problems)} 个问题")
        return 1
    if no_mask:
        print(f"提示：{len(no_mask)} 个热点没有轮廓图（只能放大白点）")
    print(f"visual-vocabulary: {n_scenes} 个场景 · {n_words} 个热点 · "
          f"{len(sets)} 套词卡，通过")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
