#!/usr/bin/env python3
"""Write the Question Drill bank used by the WeChat mini program.

Reads build/zh-en-bank/questions.json (the same bank the single-file web app
uses) and emits a compact CommonJS module. The audio ids in the bank are the
names of the clips under 06-发音/Question Drill/audio/{f,m}/, which the mini program fetches from
cloud storage at play time.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SRC = ROOT / "build" / "zh-en-bank" / "questions.json"

# 小程序目录可能整体挪位置，先认已知位置，再退回全库唯一匹配。
MINI_CANDIDATES = [
    ROOT / "06-发音" / "自然拼读阅读训练-成人A1" / "miniprogram",
]


def find_miniprogram() -> Path:
    for path in MINI_CANDIDATES:
        if (path / "project.config.json").exists():
            return path
    hits = [
        p.parent
        for p in ROOT.glob("*/**/miniprogram/project.config.json")
        if p.parts[1] not in {"build", "design", ".venv", ".git"}
    ]
    if len(hits) == 1:
        return hits[0]
    raise SystemExit(f"找不到唯一的小程序目录（找到 {len(hits)} 个），请检查路径")


def main() -> int:
    out = find_miniprogram() / "data" / "bank.js"
    bank = json.loads(SRC.read_text(encoding="utf-8"))
    if len(bank) < 1000:
        raise SystemExit(f"题量不足 1000（当前 {len(bank)}）")

    payload = json.dumps(bank, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("module.exports = " + payload + ";\n", encoding="utf-8", newline="\n")

    answers = sum(len(q["answers"]) for q in bank)
    print(
        f"已写入 {out.relative_to(ROOT)}  "
        f"({out.stat().st_size / 1024:.0f} KB, {len(bank)} 题 / {answers} 句)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
