#!/usr/bin/env python3
"""清理构建垃圾，不动任何交付内容。

    python -I tools/clean_build.py           # 默认：Edge 临时配置、__pycache__、日志
    python -I tools/clean_build.py --all     # 再加上部署暂存、离线包、zip
    python -I tools/clean_build.py --tts     # 连 Conversation 语音缓存一起删（下次构建要重新合成）

产品音频母版、sprites、apps/、content/ 一律不碰。
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"

STAGING = [
    "cloudflare-site",
    "cloudflare-audio",
    "npesl-offline",
    "conversation-site",
    "conversation-eslse",
    "audit",
]


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
    ap.add_argument("--all", action="store_true", help="连部署暂存和离线包一起清")
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
        for path in BUILD.glob("NPESL-offline-*.zip"):
            freed += drop(path)
            removed += 1

    if args.tts:
        freed += drop(BUILD / "tts")
        removed += 1

    print(f"删除 {removed} 项，释放 {freed / 1024 / 1024 / 1024:.2f} GB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
