#!/usr/bin/env python3
"""Run the delivery checks in one pass.

    python -I tools/verify.py                       # assets + content + smoke
    python -I tools/verify.py --label before        # snapshot deploy output
    python -I tools/verify.py --diff before now     # compare against a snapshot

Every check runs even if an earlier one fails, so one pass shows the whole
picture.  Exit code is 1 if anything failed.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.cli import run_check, utf8_stdout  # noqa: E402
from paths import AUDIO_OUT, SITE_OUT  # noqa: E402


def main() -> int:
    utf8_stdout()
    ap = argparse.ArgumentParser(description="一次跑完交付前自检")
    ap.add_argument("--label", help="拍一份产物快照")
    ap.add_argument("--diff", nargs=2, metavar=("OLD", "NEW"),
                    help="比对两份快照；NEW 可以是 now")
    ap.add_argument("--site", default=str(SITE_OUT),
                    help="check_assets 检查的站点目录")
    ap.add_argument("--audio", default=str(AUDIO_OUT),
                    help="check_assets 使用的音频站目录")
    ap.add_argument("--skip-smoke", action="store_true",
                    help="跳过无头浏览器冒烟")
    args = ap.parse_args()

    checks: list[tuple[str, list[str], str | None]] = []
    if args.label:
        checks.append(("产物快照", ["-I", "tools/audit_build.py",
                                    "--label", args.label], None))
    if args.diff:
        checks.append(("产物比对", ["-I", "tools/audit_build.py", "--diff",
                                    *args.diff], None))
    checks.append(("音频引用", ["-I", "tools/check_assets.py", args.site,
                                "--audio", args.audio], None))
    checks.append(("英式英语检查", ["-I", "tools/check_bre.py",
                                    "apps", "content"], None))
    checks.append(("旅行英语内容", ["-I", "apps/travel/source/validate.py"], None))
    if not args.skip_smoke:
        checks.append(("无头浏览器冒烟", ["tests/smoke.mjs"], "node"))

    failed = []
    for name, argv, program in checks:
        if not run_check(name, argv, program=program):
            failed.append(name)

    print("\n" + "=" * 50)
    if failed:
        print(f"失败 {len(failed)} 项：{', '.join(failed)}")
        return 1
    print(f"全部通过（{len(checks)} 项）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
