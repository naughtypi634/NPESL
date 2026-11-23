# -*- coding: utf-8 -*-
"""把某一画风的人工/代理标定结果写回场景 JSON。

    python -I tools/vv/apply_tagging.py tags.json

tags.json：
{"style": "iso-pixar",
 "scenes": [{"page": "room-study",
             "items": [{"slug": "desk", "pt": [40, 26], "box": [20, 9, 61, 43]}]}]}

`iso-flat` 写进主坐标（pt / box），其它画风写进 pts / boxes。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import VV_CONTENT  # noqa: E402

STYLES = {"iso-flat", "iso-pixar", "iso-illust"}


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 1
    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    style = data["style"]
    if style not in STYLES:
        raise SystemExit(f"未知画风 {style}")

    written = 0
    for scene in data["scenes"]:
        page = scene["page"]
        path = VV_CONTENT / "scenes" / f"{page}.json"
        spec = json.loads(path.read_text(encoding="utf-8"))
        by_slug = {w["slug"]: w for w in spec["words"]}
        for item in scene["items"]:
            w = by_slug.get(item["slug"])
            if not w:
                print(f"跳过 {page}/{item['slug']}（场景里没有这个词）")
                continue
            pt = [round(float(v), 2) for v in item["pt"]]
            box = [round(float(v), 2) for v in item["box"]]
            if style == "iso-flat":
                w["pt"], w["box"] = pt, box
            else:
                w.setdefault("pts", {})[style] = pt
                w.setdefault("boxes", {})[style] = box
            written += 1
        path.write_text(json.dumps(spec, ensure_ascii=False, indent=1) + "\n",
                        encoding="utf-8")
    print(f"{style}: 写入 {written} 个热点")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
