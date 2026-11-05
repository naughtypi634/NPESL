#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把三个应用的 sprite 音频传到微信云开发存储。

只传数据文件里引用到的音频，并按内容哈希跳过没变的：改一课后重新构建网页、
重跑 build_data.py，再跑本脚本，只有那一课的 sprite 会上传。

云存储路径：`audio/{ipa,phonics,phenomena}/<文件名>`，与 `miniprogram/data` 里的
引用一一对应。小程序端用 `cloud://<env>.<bucket>/<path>` 的文件 ID 播放。

依赖 CloudBase CLI 的登录态（一次性）：
    npx -p @cloudbase/cli tcb login
上传：
    python -I tools/miniprogram/upload_audio.py            # 增量
    python -I tools/miniprogram/upload_audio.py --all      # 全量重传
    python -I tools/miniprogram/upload_audio.py --dry-run  # 只列要传什么
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths  # noqa: E402

DATA = paths.MINIPROGRAM / "data"
STAGE = paths.BUILD / "miniprogram" / "audio"
MANIFEST = paths.BUILD / "miniprogram" / "audio-manifest.json"
ENV_ID = "cloud1-d3gbg0w7v2cb41afe"

# 数据文件里的 sprite 名 → 仓库里的音频目录
SOURCES = {
    "ipa": paths.IPA_APP / "audio" / "sprites",
    "phonics": paths.PHONICS_APP / "audio",
    "phenomena": paths.PHENOMENA_APP / "audio" / "sprites",
}


def load_module(name: str) -> dict:
    text = (DATA / f"{name}.js").read_text(encoding="utf-8")
    prefix = "module.exports="
    if not text.startswith(prefix):
        raise SystemExit(f"{name}.js: 不是本脚本生成的数据文件")
    return json.loads(text[len(prefix):])


def collect() -> dict[str, set[str]]:
    """各应用实际被数据引用到的 sprite 文件名。"""
    used: dict[str, set[str]] = {k: set() for k in SOURCES}

    for group in load_module("ipa")["groups"]:
        for card in group["cards"]:
            used["ipa"].update(card["sprite"].values())

    for lesson in load_module("phonics")["lessons"]:
        used["phonics"].update(lesson["sprite"].values())

    for chapter in load_module("phenomena")["chapters"]:
        used["phenomena"].update(chapter["sprite"].values())

    return used


def sha1(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="忽略清单，全部重传")
    ap.add_argument("--dry-run", action="store_true", help="只打印计划，不传")
    ap.add_argument("--env-id", default=ENV_ID)
    args = ap.parse_args()

    used = collect()
    manifest = {}
    if MANIFEST.exists() and not args.all:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))

    missing = []
    plan = []
    for app, names in used.items():
        for name in sorted(names):
            src = SOURCES[app] / name
            if not src.exists():
                missing.append(str(src))
                continue
            digest = sha1(src)
            key = f"{app}/{name}"
            if manifest.get(key) != digest:
                plan.append((key, src, digest))

    if missing:
        print("找不到这些音频：")
        for m in missing:
            print("  " + m)
        raise SystemExit(1)

    total_mb = sum(p.stat().st_size for _, p, _ in plan) / 1e6
    print(f"引用音频 {sum(len(v) for v in used.values())} 个，需要上传 {len(plan)} 个（{total_mb:.1f} MB）")
    if not plan:
        print("全部已是最新。")
        return
    if args.dry_run:
        for key, _, _ in plan[:20]:
            print("  " + key)
        if len(plan) > 20:
            print(f"  … 其余 {len(plan) - 20} 个")
        return

    if STAGE.exists():
        shutil.rmtree(STAGE)
    for key, src, _ in plan:
        dst = STAGE / key
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

    cmd = [
        "npx", "--yes", "-p", "@cloudbase/cli", "tcb", "storage", "upload",
        str(STAGE), "audio", "--env-id", args.env_id, "--times", "3",
    ]
    print("上传中…", flush=True)
    proc = subprocess.run(cmd, shell=(sys.platform == "win32"))
    if proc.returncode != 0:
        raise SystemExit("上传失败，清单未更新")

    manifest.update({key: digest for key, _, digest in plan})
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    shutil.rmtree(STAGE, ignore_errors=True)
    print(f"完成：{len(plan)} 个文件已上传。")


if __name__ == "__main__":
    main()
