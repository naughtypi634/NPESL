# -*- coding: utf-8 -*-
"""把重画好的场景图导出成网页用的 WebP + 缩略图，并更新 content JSON 里的路径。

    python -I tools/vv/build_images.py --all
    python -I tools/vv/build_images.py content/visual-vocabulary/scenes/room-study.json

原图默认取 build/vv-work/out/<zone>/up.png，可用 --source 指定。
导出后文件名带内容哈希，缓存自动失效。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paths import VV_CONTENT, VISUAL_VOCAB_APP  # noqa: E402

OUT_W, OUT_H = 2400, 1500
SMALL_W = 960
SALT = b"scenes-v3"  # 换了导出管线才改，文件名会跟着变
WORK = Path(__file__).resolve().parents[2] / "build" / "vv-work"


def export(spec: dict, source: Path, style: str = "") -> None:
    scene_dir = VISUAL_VOCAB_APP / spec["dir"] / "assets" / "scenes"
    scene_dir.mkdir(parents=True, exist_ok=True)
    page = spec["page"]
    tag = f".{style}" if style else ""

    with Image.open(source) as im:
        rgb = im.convert("RGB")
        big = rgb.resize((OUT_W, OUT_H), Image.LANCZOS)

    quality = 84 if style else 88
    names = {}
    tmp = scene_dir / f"{page}.tmp.webp"
    big.save(tmp, "WEBP", quality=quality, method=6)
    digest = hashlib.sha1(tmp.read_bytes() + SALT).hexdigest()[:8]
    name = f"{page}{tag}.{digest}.webp"
    tmp.replace(scene_dir / name)
    names[""] = name

    thumb = big.copy()
    thumb.thumbnail((SMALL_W, int(OUT_H * SMALL_W / OUT_W)), Image.LANCZOS)
    thumb_name = f"thumb-{spec['zone']}{tag}.jpg"
    thumb.save(scene_dir / thumb_name, "JPEG", quality=86,
               optimize=True, progressive=True)

    if style:
        spec.setdefault("images", {})[style] = f"assets/scenes/{names['']}"
        spec.setdefault("thumbs", {})[style] = f"assets/scenes/{thumb_name}"
        styles = [s for s in ("flat", "clay", "ink") if s in spec["images"]]
        spec["styles"] = styles
        print(f"  {page} [{style}]: {names['']}")
    else:
        small = rgb.resize((SMALL_W, int(OUT_H * SMALL_W / OUT_W)), Image.LANCZOS)
        tmp960 = scene_dir / f"{page}.tmp960.webp"
        small.save(tmp960, "WEBP", quality=88, method=6)
        digest960 = hashlib.sha1(tmp960.read_bytes() + SALT).hexdigest()[:8]
        name960 = f"{page}.960.{digest960}.webp"
        tmp960.replace(scene_dir / name960)
        spec["image"] = f"assets/scenes/{names['']}"
        spec["image_960"] = f"assets/scenes/{name960}"
        spec["thumb"] = f"assets/scenes/{thumb_name}"
        print(f"  {page}: {names['']}")


def photo_source(spec: dict) -> Path | None:
    """写实原图：out/<zone>/up.png → seed*.png → v3 seed → 现有导出。"""
    zone = spec["zone"]
    roots = [WORK / "out", Path(__file__).resolve().parents[2] / "build" / "vv-scene" / "out"]
    for root in roots:
        for folder in (root / zone, root / "v2" / zone, root / "v3" / zone):
            up = folder / "up.png"
            if up.exists():
                return up
            seeds = sorted(folder.glob("seed*.png"))
            if seeds:
                return seeds[0]
    current = VISUAL_VOCAB_APP / spec["dir"] / spec.get("image", "")
    return current if spec.get("image") and current.exists() else None


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("specs", nargs="*", help="content JSON 路径")
    ap.add_argument("--all", action="store_true", help="导出全部场景")
    ap.add_argument("--source", help="原图路径（默认 build/vv-work/out/<zone>/up.png）")
    ap.add_argument("--style", default="", choices=["", "flat", "clay", "ink", "pixar", "iso-flat", "iso-pixar", "iso-illust"],
                    help="导出某种画风（原图取 build/vv-work/style/<style>/）")
    args = ap.parse_args()

    if args.all:
        paths = sorted((VV_CONTENT / "scenes").glob("*.json"))
    else:
        paths = [Path(p) for p in args.specs]
    if not paths:
        ap.error("给出 spec 路径或 --all")

    for path in paths:
        spec = json.loads(path.read_text(encoding="utf-8"))
        if args.style:
            source = Path(args.source) if args.source else (
                WORK / "style" / args.style / f'{spec["page"]}.png')
        elif args.source:
            source = Path(args.source)
        else:
            source = photo_source(spec)
        if source is None or not source.exists():
            print(f"跳过 {spec['page']}：没有原图")
            continue
        export(spec, source, args.style)
        path.write_text(json.dumps(spec, ensure_ascii=False, indent=1) + "\n",
                        encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
