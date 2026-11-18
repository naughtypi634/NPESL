#!/usr/bin/env python3
"""Verify the built site as a reader experiences it.

    python -I tools/verify.py
    python -I tools/verify.py --fast              # skip the browser layer
    python -I tools/verify.py --update-baseline   # accept current known debt

Four layers, all against the current build/cloudflare-site:

  1. 全站引用    every page's links, images, fonts, audio references and
                 VV word audio resolve in the deploy trees.
  2. 可见内容    the visible English text of every built page is scanned for
                 British spellings and forbidden meta/count labels.  Known
                 legacy hits live in tools/verify/british_baseline.json;
                 anything above that baseline fails.
  3. 内容校验    collocation / phonics / phenomena (/ data-viz) validators.
  4. 运行时      one headless Edge opens every page at phone width (console
                 errors, failed requests, blank pages, horizontal overflow)
                 and drives playback in every app from the local audio tree.

Exit code 0 = every hard check passed.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.cli import utf8_stdout  # noqa: E402
from paths import AUDIO_OUT, SITE_OUT  # noqa: E402
from verify.content import (  # noqa: E402
    ContentReport, load_baseline, save_baseline, scan,
)
from verify.site import audit  # noqa: E402
from verify.validators import run_all  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = ROOT / "tests" / "verify_runtime.mjs"


def _level_summary(report: ContentReport) -> str:
    pages = report.by_page()
    top = ", ".join(f"{page} {count}" for page, count in pages.most_common(4))
    return top or "无"


def main() -> int:
    utf8_stdout()
    ap = argparse.ArgumentParser(description="按读者实际体验验证构建产物")
    ap.add_argument("--site", default=str(SITE_OUT))
    ap.add_argument("--audio", default=str(AUDIO_OUT))
    ap.add_argument("--fast", action="store_true", help="跳过无头浏览器运行时检查")
    ap.add_argument("--skip-pages", action="store_true", help="只跑点读，不全站巡检")
    ap.add_argument("--only", help="只跑一个点读用例，如 phonics")
    ap.add_argument("--update-baseline", action="store_true",
                    help="把当前英式英语命中写成基线（显式接受存量）")
    ap.add_argument("--strict-content", action="store_true",
                    help="存量英式英语也算失败")
    ap.add_argument("--with-data-viz", action="store_true",
                    help="额外校验 data-viz 内容（默认不装配、不部署）")
    ap.add_argument("--label", help="给部署产物拍一份 audit_build 快照")
    ap.add_argument("--diff", nargs=2, metavar=("OLD", "NEW"),
                    help="比对两份 audit_build 快照；NEW 可以是 now")
    args = ap.parse_args()

    site = Path(args.site)
    audio = Path(args.audio)
    failures: list[str] = []

    if args.label or args.diff:
        print("\n=== 产物快照 ===")
        audit_argv = [sys.executable, "-I", "tools/audit_build.py"]
        if args.label:
            audit_argv += ["--label", args.label]
        if args.diff:
            audit_argv += ["--diff", *args.diff]
        proc = subprocess.run(audit_argv, cwd=ROOT)
        mark = "PASS" if proc.returncode == 0 else "FAIL"
        print(f"  {mark} audit_build")
        if proc.returncode != 0:
            failures.append("产物快照/比对")

    print("\n=== 1/4 全站引用与链接 ===")
    site_report = audit(site, audio)
    print(f"  {site_report.pages} 页 · {site_report.links} 个链接 · "
          f"{site_report.assets} 个资源 · {site_report.audio_refs} 条音频引用 · "
          f"{site_report.images} 张 VV 图片 · {site_report.fonts} 个字体")
    if site_report.failures:
        failures.append(f"全站引用 {len(site_report.failures)} 项")
        for problem in site_report.failures[:20]:
            print(f"  FAIL {problem.where} · {problem.kind} · {problem.detail}")
        if len(site_report.failures) > 20:
            print(f"  … 另有 {len(site_report.failures) - 20} 项")
    else:
        print("  PASS 链接、图片、字体、音频引用全部落在部署树内")
    if site_report.warnings:
        print(f"  WARN {len(site_report.warnings)} 条外链提示")
        for problem in site_report.warnings[:5]:
            print(f"       {problem.where} · {problem.detail}")

    print("\n=== 2/4 可见内容 ===")
    baseline = load_baseline()
    content_report = scan(site, baseline)
    if args.update_baseline:
        save_baseline(content_report)
        content_report.baseline = dict(content_report.fix_hits)
        content_report.new_hits = []
        content_report.debt = content_report.current_total
        print(f"  已写入基线：{content_report.current_total} 处存量英式英语")
    print(f"  {content_report.words} 个可见英文词")
    print(f"  英式英语：当前 {content_report.current_total} · "
          f"基线 {content_report.debt} · 新增 {content_report.new_total}")
    if content_report.current_total:
        print(f"  存量分布：{_level_summary(content_report)}")
    if content_report.new_hits:
        for page, word, count, allowed in content_report.new_hits[:15]:
            print(f"  FAIL {page} · {word} · 出现 {count} 次（基线 {allowed}）")
        if len(content_report.new_hits) > 15:
            print(f"  … 另有 {len(content_report.new_hits) - 15} 条新增")
    if content_report.forbidden:
        failures.append(f"禁用标签 {len(content_report.forbidden)} 项")
        for page, match, around in content_report.forbidden[:10]:
            print(f"  FAIL {page} · 禁用文案「{match}」 · …{around}…")
    else:
        print("  禁用标签：0")
    if content_report.problems:
        failures.extend(content_report.problems)
        for problem in content_report.problems:
            print(f"  FAIL {problem}")
    if content_report.new_total:
        failures.append(f"新增英式英语 {content_report.new_total} 处")
    if args.strict_content and content_report.current_total:
        failures.append(f"英式英语存量 {content_report.current_total} 处（--strict-content）")

    print("\n=== 3/4 内容校验 ===")
    validators = run_all(with_data_viz=args.with_data_viz)
    for result in validators:
        mark = "PASS" if result.ok else "FAIL"
        print(f"  {mark} {result.name:<12} {result.summary}")
        if not result.ok:
            failures.append(f"内容校验 {result.name}")
            tail = result.output.splitlines()[-8:]
            for line in tail:
                print(f"       {line}")

    print("\n=== 4/4 运行时 ===")
    if args.fast:
        print("  已跳过（--fast）")
    else:
        node_argv = ["node", str(RUNTIME), "--dir", str(site), "--audio", str(audio)]
        if args.skip_pages:
            node_argv.append("--skip-pages")
        if args.only:
            node_argv += ["--only", args.only]
        sys.stdout.flush()
        proc = subprocess.run(node_argv, cwd=ROOT)
        if proc.returncode != 0:
            failures.append("运行时")

    print("\n" + "=" * 64)
    if failures:
        print(f"FAIL  {len(failures)} 项：{', '.join(failures)}")
        return 1
    print("PASS  全部硬性检查通过")
    if content_report.current_total:
        print(f"      英式英语存量 {content_report.current_total} 处（已记入基线，不阻断）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
