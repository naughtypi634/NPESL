#!/usr/bin/env python3
"""Build every app and the deploy staging trees, in dependency order.

    python -I tools/build_all.py                    # everything
    python -I tools/build_all.py --only phrasal,site
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
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.cli import run_step, utf8_stdout  # noqa: E402

ORDER = ["ipa", "phonics", "phenomena", "phrasal", "conversation", "drill", "site"]


def steps(refresh_ipa_audio: bool) -> dict[str, list[tuple[str, list[str]]]]:
    ipa = ["-I", "tools/build_ipa_site.py"]
    if not refresh_ipa_audio:
        ipa.append("--skip-audio")
    return {
        "ipa": [("IPA 页面", ipa)],
        "phonics": [
            ("自然拼读", ["-I", "-X", "utf8", "apps/phonics/source/build.py"]),
        ],
        "phenomena": [
            ("发音现象", ["-I", "-X", "utf8", "apps/phenomena/source/build.py"]),
        ],
        "phrasal": [
            ("短语动词内容校验", ["-I", "apps/phrasal/source/validate.py"]),
            ("短语动词页面", ["-I", "apps/phrasal/source/build.py"]),
        ],
        "conversation": [
            ("Conversation Starters", ["-I", "tools/conversation/build_site.py"]),
        ],
        "drill": [
            ("Question Drill 语音", ["-I", "tools/drill/make_audio.py"]),
            ("Question Drill 页面", ["-I", "tools/drill/assemble.py"]),
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

    for name in names:
        for label, argv in plan[name]:
            run_step(label, argv)

    print(f"\n完成：{', '.join(names)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
