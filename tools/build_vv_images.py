#!/usr/bin/env python3
"""Build 480 px WebP derivatives for the Visual Vocabulary deploy tree.

The source illustrations stay at 640×640 (and are tracked in git); the
deployed copies are resized to 480 so a 210 CSS px card gets a ~2.3×
image on a 2× screen without shipping the full 640 file.  The deploy
path is unchanged, so `data-color` / `data-bw` on my-home keeps working.

Derivatives live in `build/vv-images-480/` (gitignored) and are keyed by
source mtime+size.  `build_cloudflare_site.py` calls `ensure_derivatives()`
and `overlay_derivatives()` automatically; this file can also be run on
its own to prewarm the cache:

    .venv\\Scripts\\python.exe -I tools\\build_vv_images.py
    .venv\\Scripts\\python.exe -I tools\\build_vv_images.py --force
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paths import BUILD, VISUAL_VOCAB_APP  # noqa: E402

TARGET = 480
QUALITY = 88
# WebP method 6 比 4 慢约 60 倍，文件只小 0.7%；构建用 4。
METHOD = 4
CACHE = BUILD / "vv-images-480"
MANIFEST = CACHE / "manifest.json"
MANIFEST_VERSION = 1

IMG_RE = re.compile(r"<img\b(?![^>]*\bloading=)", re.IGNORECASE)


def source_images() -> list[Path]:
    """只要 640×640 的词卡图；场景大图（assets/scenes）自己带尺寸，不进这条管线。"""
    return sorted(p for p in VISUAL_VOCAB_APP.rglob("*.webp")
                  if "assets/scenes" not in p.as_posix())


def _render(src: Path, dst: Path) -> None:
    try:
        from PIL import Image, ImageOps
    except ImportError as exc:  # pragma: no cover - depends on environment
        raise SystemExit(
            "缺少 Pillow。先运行：\n"
            "  .venv\\Scripts\\python.exe -m pip install -r requirements.txt"
        ) from exc

    with src.open("rb") as fh:
        head = fh.read(16)
    lossless = head[12:16] == b"VP8L"

    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGBA" if "A" in im.mode or "transparency" in im.info
                            else "RGB")
        im.thumbnail((TARGET, TARGET), Image.Resampling.LANCZOS)
        dst.parent.mkdir(parents=True, exist_ok=True)
        if lossless:
            im.save(dst, "WEBP", lossless=True, method=METHOD)
        else:
            im.save(dst, "WEBP", quality=QUALITY, method=METHOD)


def _load_manifest() -> dict:
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if data.get("version") != MANIFEST_VERSION:
        return {}
    if data.get("size") != TARGET or data.get("quality") != QUALITY:
        return {}
    return data.get("files", {})


def ensure_derivatives(force: bool = False) -> tuple[int, int]:
    """Generate missing/stale derivatives.  Returns (built, skipped)."""
    sources = source_images()
    if not sources:
        return 0, 0

    if force and CACHE.exists():
        shutil.rmtree(CACHE)
    CACHE.mkdir(parents=True, exist_ok=True)

    previous = {} if force else _load_manifest()
    files: dict[str, dict[str, int]] = {}
    built = skipped = 0
    for src in sources:
        rel = src.relative_to(VISUAL_VOCAB_APP).as_posix()
        stat = src.stat()
        out = CACHE / rel
        old = previous.get(rel)
        fresh = (
            old is not None
            and out.exists()
            and old.get("mtime_ns") == stat.st_mtime_ns
            and old.get("size") == stat.st_size
        )
        if fresh:
            skipped += 1
        else:
            _render(src, out)
            built += 1
        files[rel] = {"mtime_ns": stat.st_mtime_ns, "size": stat.st_size}

    MANIFEST.write_text(
        json.dumps({
            "version": MANIFEST_VERSION,
            "size": TARGET,
            "quality": QUALITY,
            "files": files,
        }, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return built, skipped


def overlay_derivatives(vv_out: Path) -> int:
    """Copy cached 480 px files over the deploy tree (same relative paths)."""
    sources = source_images()
    missing = []
    copied = 0
    for src in sources:
        rel = src.relative_to(VISUAL_VOCAB_APP).as_posix()
        derivative = CACHE / rel
        target = vv_out / rel
        if not derivative.exists():
            missing.append(rel)
            continue
        if not target.exists():
            missing.append(rel)
            continue
        shutil.copy2(derivative, target)
        copied += 1
    if missing:
        raise SystemExit(
            "Visual Vocabulary 480px 缓存不完整（缺 "
            f"{len(missing)} 个，例如 {missing[0]}）。先运行：\n"
            "  .venv\\Scripts\\python.exe -I tools\\build_vv_images.py"
        )
    return copied


def inject_lazy_attrs(vv_out: Path) -> int:
    """Add loading=lazy/decoding=async to the 8 word-set pages."""
    changed = 0
    for page in sorted(vv_out.glob("*/index.html")):
        text = page.read_text(encoding="utf-8")
        new, count = IMG_RE.subn('<img loading="lazy" decoding="async"', text)
        if count:
            page.write_text(new, encoding="utf-8", newline="")
            changed += count
    return changed


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="生成 Visual Vocabulary 480px WebP")
    parser.add_argument("--force", action="store_true", help="全部重新生成")
    parser.add_argument("--check", action="store_true", help="只检查缓存")
    args = parser.parse_args()

    sources = source_images()
    if args.check:
        missing = [
            p.relative_to(VISUAL_VOCAB_APP).as_posix()
            for p in sources
            if not (CACHE / p.relative_to(VISUAL_VOCAB_APP)).exists()
        ]
        print(f"源图 {len(sources)} 个，缓存缺失 {len(missing)} 个")
        return 1 if missing else 0

    built, skipped = ensure_derivatives(force=args.force)
    print(f"480px 图片：生成 {built}，复用 {skipped}（{CACHE}）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
