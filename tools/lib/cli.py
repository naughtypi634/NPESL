"""Running build steps from a single entry point.

Each app keeps its own CLI; these helpers only make the orchestrators
(build_all.py, verify.py) behave the same way: UTF-8 output, a visible
step banner, and a non-zero exit that names the failing step.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def utf8_stdout() -> None:
    """Force UTF-8 on stdout/stderr so IPA symbols survive a GBK console."""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


def child_env() -> dict[str, str]:
    return dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")


def run_check(name: str, argv: list[str], *, cwd: Path = ROOT,
              program: str | None = None) -> bool:
    """Run one step, print a banner, and return whether it succeeded."""
    print(f"\n=== {name} ===", flush=True)
    cmd = [program or sys.executable, *argv]
    result = subprocess.run(cmd, cwd=cwd, env=child_env())
    print(f"{'PASS' if result.returncode == 0 else 'FAIL'}  {name}", flush=True)
    return result.returncode == 0


def run_step(name: str, argv: list[str], *, cwd: Path = ROOT) -> None:
    """Run a required build step; stop the pipeline if it fails."""
    if not run_check(name, argv, cwd=cwd):
        raise SystemExit(f"\n构建中止：{name} 失败")
