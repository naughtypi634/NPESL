"""Run the content validators that already exist in the repo.

build_all.py runs collocation and data-viz during a build; phonics and
phenomena have validators that were never wired into the delivery gate.  The
new verify runs all of them so content structure is checked even when someone
built an app directly.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PYTHON = sys.executable
NODE = shutil.which("node")


@dataclass
class ValidatorResult:
    name: str
    ok: bool
    summary: str
    output: str = ""


def _run(name: str, argv: list[str], cwd: Path = ROOT) -> ValidatorResult:
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    try:
        proc = subprocess.run(
            argv, cwd=cwd, env=env, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=300)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return ValidatorResult(name, False, f"无法运行: {exc}")
    output = (proc.stdout + proc.stderr).strip()
    lines = [ln.strip() for ln in output.splitlines() if ln.strip()]
    summary = lines[-1] if lines else ""
    for line in reversed(lines):
        if any(word in line for word in ("problems", "问题", "通过", "lessons:", "content ok:")):
            summary = line
            break
    return ValidatorResult(name, proc.returncode == 0, summary[:200], output)


def run_all(with_data_viz: bool = False) -> list[ValidatorResult]:
    checks = [
        ("collocation", [PYTHON, "-I", "-X", "utf8",
                         "apps/collocation/source/validate.py"]),
        ("phonics", [PYTHON, "-I", "-X", "utf8",
                     "apps/phonics/source/validate.py"]),
        ("phenomena", [PYTHON, "-I", "-X", "utf8",
                       "apps/phenomena/source/validate.py"]),
    ]
    results = [_run(name, argv) for name, argv in checks]
    if with_data_viz:
        if NODE:
            results.append(_run("data-viz", [
                NODE, "apps/data-viz/web/scripts/build-content.mjs", "--check",
            ]))
        else:
            results.append(ValidatorResult("data-viz", False, "找不到 node，无法校验 data-viz 内容"))
    return results
