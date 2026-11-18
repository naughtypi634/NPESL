"""Visible-text checks: American English and forbidden meta/count labels.

The old gate scanned Markdown only, which meant the deployed pages could be
full of British spellings while it reported PASS.  This module extracts what a
reader actually sees from each built page and checks that text.

Existing British hits are kept in a baseline so a new occurrence fails the
gate while legacy debt stays visible.  Fixing content tightens the baseline
with --update-baseline.
"""

from __future__ import annotations

import html
import json
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from .rules import FIX, REVIEW

TAG_RE = re.compile(r"<[^>]+>")
HEAD_RE = re.compile(r"<head\b.*?</head>", re.S | re.I)
RAW_RE = re.compile(r"<(script|style|svg|math|template)\b.*?</\1>", re.S | re.I)
COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
WORD_RE = re.compile(r"[A-Za-z][A-Za-z'’-]*")
FORBIDDEN = [
    re.compile(r"\d+\s*(?:个主题|种图表|条表达|条词条|条搭配)"),
    re.compile(r"·\s*\d+\s*条"),
    re.compile(r"已学|打卡|学习进度|完成度|标记已学"),
]

FIX_RULES = [(re.compile(p, re.I), rep, note) for p, rep, note in FIX]
REVIEW_RULES = [(re.compile(p, re.I), rep, note) for p, rep, note in REVIEW]
BASELINE_PATH = Path(__file__).resolve().parent / "british_baseline.json"


def visible_text(source: str) -> str:
    text = HEAD_RE.sub(" ", source)
    text = COMMENT_RE.sub(" ", text)
    text = RAW_RE.sub(" ", text)
    text = TAG_RE.sub(" ", text)
    return html.unescape(text)


def scan(site: Path, baseline: dict[str, int] | None = None) -> "ContentReport":
    report = ContentReport()
    if not site.is_dir():
        report.fail("站点目录不存在")
        return report
    hits: Counter[str] = Counter()
    review: Counter[str] = Counter()
    for page in sorted(site.rglob("*.html")):
        rel = page.relative_to(site).as_posix()
        text = visible_text(page.read_text(encoding="utf-8", errors="replace"))
        report.words += len(WORD_RE.findall(text))
        for rx, _rep, _note in FIX_RULES:
            for match in rx.finditer(text):
                key = f"{rel}|{match.group(0).lower()}"
                hits[key] += 1
        for rx, _rep, _note in REVIEW_RULES:
            for match in rx.finditer(text):
                review[match.group(0).lower()] += 1
        for pattern in FORBIDDEN:
            for match in pattern.finditer(text):
                around = text[max(0, match.start() - 24):match.end() + 16]
                report.forbidden.append((rel, match.group(0), " ".join(around.split())))
    report.fix_hits = hits
    report.review_hits = review
    report.baseline = baseline or {}
    report.new_hits = _new_hits(hits, report.baseline)
    report.debt = sum(report.baseline.values())
    report.current_total = sum(hits.values())
    return report


def _new_hits(hits: Counter[str], baseline: dict[str, int]) -> list[tuple[str, str, int, int]]:
    fresh: list[tuple[str, str, int, int]] = []
    for key, count in hits.items():
        allowed = int(baseline.get(key, 0))
        if count > allowed:
            page, word = key.rsplit("|", 1)
            fresh.append((page, word, count, allowed))
    return sorted(fresh, key=lambda x: (-(x[2] - x[3]), x[0], x[1]))


def load_baseline(path: Path = BASELINE_PATH) -> dict[str, int]:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    counts = data.get("counts") if isinstance(data, dict) else None
    return {str(k): int(v) for k, v in (counts or {}).items()}


def save_baseline(report: "ContentReport", path: Path = BASELINE_PATH) -> None:
    data = {
        "note": "存量英式英语基线。新增命中会让 verify 失败；修掉内容后用 --update-baseline 收紧。",
        "counts": dict(sorted(report.fix_hits.items())),
    }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


@dataclass
class ContentReport:
    words: int = 0
    fix_hits: Counter[str] = field(default_factory=Counter)
    review_hits: Counter[str] = field(default_factory=Counter)
    baseline: dict[str, int] = field(default_factory=dict)
    new_hits: list[tuple[str, str, int, int]] = field(default_factory=list)
    debt: int = 0
    current_total: int = 0
    forbidden: list[tuple[str, str, str]] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)

    def fail(self, message: str) -> None:
        self.problems.append(message)

    @property
    def new_total(self) -> int:
        return sum(count - allowed for _page, _word, count, allowed in self.new_hits)

    @property
    def ok(self) -> bool:
        return not self.problems and not self.forbidden and self.new_total == 0

    def by_page(self) -> Counter[str]:
        pages: Counter[str] = Counter()
        for key, count in self.fix_hits.items():
            pages[key.rsplit("|", 1)[0]] += count
        return pages
