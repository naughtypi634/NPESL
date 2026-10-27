#!/usr/bin/env python3
"""Snapshot and compare the deploy/build outputs.

Optimization work must be provable: before touching a build script, take a
snapshot of the current output, and after the change diff against it.  A
refactor is only allowed to differ where we can explain every file.

    # 记录基线
    .venv\\Scripts\\python.exe -I tools\\audit_build.py --label before

    # 改完之后比对（非零退出表示有差异）
    .venv\\Scripts\\python.exe -I tools\\audit_build.py --diff before after

    # 只允许某些路径前缀不同（可重复）
    .venv\\Scripts\\python.exe -I tools\\audit_build.py --diff before after \\
        --allow conversation/ --allow drill/index.html

快照存在 build/audit/<label>.json，不进 git。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIT_DIR = ROOT / "build" / "audit"

# 部署产物：主站、音频站、离线包。缺失的目录跳过。
DEFAULT_TARGETS = [
    ROOT / "build" / "cloudflare-site",
    ROOT / "build" / "cloudflare-audio",
    ROOT / "build" / "npesl-offline",
]


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def snapshot(targets: list[Path]) -> dict[str, dict[str, object]]:
    files: dict[str, dict[str, object]] = {}
    for target in targets:
        if not target.exists():
            print(f"跳过（不存在）：{target.relative_to(ROOT)}")
            continue
        base = target.relative_to(ROOT / "build").as_posix()
        for path in sorted(target.rglob("*")):
            if not path.is_file():
                continue
            rel = f"{base}/{path.relative_to(target).as_posix()}"
            files[rel] = {"size": path.stat().st_size, "sha256": digest(path)}
    return files


def allowed(rel: str, prefixes: list[str]) -> bool:
    return any(rel.startswith(p) for p in prefixes)


def diff(old: dict, new: dict, prefixes: list[str]) -> int:
    old_names, new_names = set(old), set(new)
    added = sorted(new_names - old_names)
    removed = sorted(old_names - new_names)
    changed = sorted(
        name for name in old_names & new_names
        if old[name]["sha256"] != new[name]["sha256"]
    )

    if prefixes:
        added = [n for n in added if not allowed(n, prefixes)]
        removed = [n for n in removed if not allowed(n, prefixes)]
        changed = [n for n in changed if not allowed(n, prefixes)]

    def show(title: str, names: list[str]) -> None:
        if not names:
            return
        print(f"\n{title}（{len(names)}）")
        for name in names[:40]:
            print(f"  {name}")
        if len(names) > 40:
            print(f"  … 另有 {len(names) - 40} 个")

    show("新增", added)
    show("删除", removed)
    show("内容改变", changed)

    total = len(added) + len(removed) + len(changed)
    print(f"\n共 {len(new)} 个文件；差异 {total} 个"
          f"（新增 {len(added)} / 删除 {len(removed)} / 改变 {len(changed)}）")
    return 0 if total == 0 else 1


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="快照与比对构建产物")
    parser.add_argument("--label", help="记录当前产物快照到此名字")
    parser.add_argument("--diff", nargs=2, metavar=("OLD", "NEW"),
                        help="比对两份快照")
    parser.add_argument("--allow", action="append", default=[],
                        help="允许差异的路径前缀，可重复")
    parser.add_argument("--target", action="append", default=[],
                        help="额外的产物目录（相对库根），可重复")
    args = parser.parse_args()

    targets = DEFAULT_TARGETS + [ROOT / t for t in args.target]

    if args.label:
        AUDIT_DIR.mkdir(parents=True, exist_ok=True)
        data = snapshot(targets)
        out = AUDIT_DIR / f"{args.label}.json"
        out.write_text(json.dumps(data, indent=0, sort_keys=True), encoding="utf-8")
        print(f"快照：{out.relative_to(ROOT)}（{len(data)} 个文件）")
        return 0

    if args.diff:
        old_label, new_label = args.diff
        if new_label == "now":
            new = snapshot(targets)
        else:
            new_path = AUDIT_DIR / f"{new_label}.json"
            if not new_path.exists():
                print(f"快照不存在：{new_path.relative_to(ROOT)}", file=sys.stderr)
                return 2
            new = json.loads(new_path.read_text(encoding="utf-8"))
        old_path = AUDIT_DIR / f"{old_label}.json"
        if not old_path.exists():
            print(f"快照不存在：{old_path.relative_to(ROOT)}", file=sys.stderr)
            return 2
        old = json.loads(old_path.read_text(encoding="utf-8"))
        return diff(old, new, args.allow)

    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
