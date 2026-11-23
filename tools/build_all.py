#!/usr/bin/env python3
"""Build every app and the deploy staging trees, in dependency order.

    python -I tools/build_all.py                    # everything
    python -I tools/build_all.py --only collocation,site
    python -I tools/build_all.py --skip-site        # apps only, no staging
    python -I tools/build_all.py --refresh-ipa-audio

IPA is built with --skip-audio by default: it reuses the tracked recordings
and costs no network.  --refresh-ipa-audio re-records all 300 words with
Azure (needs ~/.azure-speech/key.txt) and is the only network-expensive step.

Every other step only synthesizes what is missing from its local cache.
A fresh clone has no caches for Phonics or Conversation, so the first run
there does hit the network.  See tools/README.md.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.cli import run_step, utf8_stdout  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DV_WEB = ROOT / "apps" / "data-viz" / "web"
PHEN_WEB = ROOT / "apps" / "phenomena" / "web"

ORDER = ["ipa", "phonics", "phenomena", "collocation", "conversation", "drill",
         "visual-vocabulary", "data-viz", "site"]


def npm_exe() -> str:
    exe = shutil.which("npm")
    if exe:
        return exe
    raise SystemExit("找不到 npm：先装 Node.js，再重开终端。")


def ensure_node_deps(app: Path, label: str) -> None:
    if (app / "node_modules").exists():
        return
    run_step(
        label,
        ["ci", "--no-fund", "--no-audit"],
        cwd=app,
        program=npm_exe(),
    )


def ensure_data_viz_deps() -> None:
    ensure_node_deps(DV_WEB, "数据图表英语前端依赖")


def ensure_phenomena_deps() -> None:
    ensure_node_deps(PHEN_WEB, "发音现象前端依赖")


def steps(refresh_ipa_audio: bool) -> dict[str, list[tuple]]:
    ipa = ["-I", "tools/build_ipa_site.py"]
    if not refresh_ipa_audio:
        ipa.append("--skip-audio")
    return {
        "ipa": [("IPA 页面", ipa)],
        "phonics": [
            ("自然拼读", ["-I", "-X", "utf8", "apps/phonics/source/build.py"]),
        ],
        "phenomena": [
            ("发音现象音频与数据", ["-I", "-X", "utf8", "apps/phenomena/source/build.py"]),
            ("发音现象页面", ["--prefix", str(PHEN_WEB), "run", "build"], npm_exe()),
        ],
        "collocation": [
            ("短语搭配内容校验", ["-I", "apps/collocation/source/validate.py"]),
            ("短语搭配页面", ["-I", "apps/collocation/source/build.py"]),
        ],
        "conversation": [
            ("Conversation Starters",
             ["-I", "apps/conversation/source/build_site.py"]),
        ],
        "drill": [
            ("Question Drill 语音", ["-I", "tools/drill/make_audio.py"]),
            ("Question Drill 页面", ["-I", "tools/drill/assemble.py"]),
        ],
        "visual-vocabulary": [
            ("图解词汇场景页", ["-I", "tools/vv/build_pages.py"]),
            ("图解词汇主题页", ["-I", "tools/vv/build_topic_pages.py"]),
            ("图解词汇烹饪动作", ["-I", "tools/vv/build_actions_page.py"]),
        ],
        "data-viz": [
            ("数据图表英语内容与页面", ["--prefix", str(DV_WEB), "run", "build"], npm_exe()),
        ],
        "site": [
            ("站点装配", ["-I", "tools/build_cloudflare_site.py"]),
        ],
    }


def main() -> int:
    utf8_stdout()
    ap = argparse.ArgumentParser(description="按依赖顺序构建全部应用")
    ap.add_argument("--only", default="",
                    help="只构建这些应用，逗号分隔：" + ",".join(ORDER))
    ap.add_argument("--skip-site", action="store_true",
                    help="不装配 build/cloudflare-site 与 cloudflare-audio")
    ap.add_argument("--refresh-ipa-audio", action="store_true",
                    help="用 Azure 重录 IPA 全部 300 个单词（会联网）")
    args = ap.parse_args()

    plan = steps(args.refresh_ipa_audio)
    if args.only:
        names = [n.strip() for n in args.only.split(",") if n.strip()]
        unknown = [n for n in names if n not in plan]
        if unknown:
            print(f"未知应用：{', '.join(unknown)}；可选：{', '.join(ORDER)}",
                  file=sys.stderr)
            return 2
    else:
        names = list(ORDER)
    if args.skip_site:
        names = [n for n in names if n != "site"]
    if not names:
        print("没有要构建的应用（--only 与 --skip-site 的组合为空）")
        return 0

    if "data-viz" in names:
        ensure_data_viz_deps()
    if "phenomena" in names:
        ensure_phenomena_deps()
    for name in names:
        for step in plan[name]:
            label, argv = step[0], step[1]
            program = step[2] if len(step) > 2 else None
            run_step(label, argv, program=program)

    print(f"\n完成：{', '.join(names)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
