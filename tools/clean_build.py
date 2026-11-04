#!/usr/bin/env python3
"""清理构建垃圾，不动任何交付内容。

    python -I tools/clean_build.py           # 默认：Edge 临时配置、__pycache__、日志
    python -I tools/clean_build.py --all     # 再加上部署暂存
    python -I tools/clean_build.py --scratch # 清 build/ 顶层的脚本、截图、预览与 PDF 中间件
    python -I tools/clean_build.py --tts     # 连 Conversation 语音缓存一起删（下次构建要重新合成）

产品音频母版、sprites、apps/、content/ 一律不碰。
--scratch 只删 build/ 顶层文件和白名单里的临时目录，素材目录（openpeeps-src、
kitbitz-src、mix-src、tts-local 等）与 tts/ 永远跳过。
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paths import BUILD, ROOT  # noqa: E402

STAGING = [
    "cloudflare-site",
    "cloudflare-audio",
    "audit",
]

# build/ 顶层的临时文件；只匹配文件，目录（tts/、素材目录）不会被 glob 命中。
SCRATCH_GLOBS = ("*.png", "*.mjs", "*.html", "*.json", "*.txt", "*.py", "*.log")
SCRATCH_DIRS = ("ab", "site-shots", "drill-tests")


def size(path: Path) -> int:
    if path.is_file():
        return path.stat().st_size
    return sum(p.stat().st_size for p in path.rglob("*") if p.is_file())


def drop(path: Path) -> int:
    if not path.exists():
        return 0
    freed = size(path)
    if path.is_dir():
        shutil.rmtree(path, ignore_errors=True)
    else:
        path.unlink(missing_ok=True)
    return freed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="连部署暂存一起清")
    ap.add_argument("--scratch", action="store_true",
                    help="清 build/ 顶层的脚本、截图与临时预览")
    ap.add_argument("--tts", action="store_true", help="连 build/tts 语音缓存一起清")
    args = ap.parse_args()

    freed = 0
    removed = 0

    for path in sorted(BUILD.glob("edge-*")):
        freed += drop(path)
        removed += 1
    for base in ("content", "tools", "apps", "tests"):
        for path in sorted((ROOT / base).rglob("__pycache__")):
            freed += drop(path)
            removed += 1
    for pattern in ("*.log", "*.txt", "*.tmp.json", "template-check.js"):
        for path in BUILD.glob(pattern):
            freed += drop(path)
            removed += 1

    if args.all:
        for name in STAGING:
            freed += drop(BUILD / name)
            removed += 1

    if args.scratch:
        for pattern in SCRATCH_GLOBS:
            for path in sorted(BUILD.glob(pattern)):
                if path.is_file():
                    freed += drop(path)
                    removed += 1
        for name in SCRATCH_DIRS:
            path = BUILD / name
            if path.exists():
                freed += drop(path)
                removed += 1

    if args.tts:
        freed += drop(BUILD / "tts")
        removed += 1

    print(f"删除 {removed} 项，释放 {freed / 1024 / 1024 / 1024:.2f} GB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
