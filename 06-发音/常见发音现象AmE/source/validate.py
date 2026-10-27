# -*- coding: utf-8 -*-
"""Structural checks for source/content/*.json. Does not touch audio."""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
CONTENT = ROOT / "content"
CATEGORIES = {"弱读", "缩合", "吞音", "变音", "省略"}
MARK_RE = re.compile(r"\[([^|\]]*)\|([^|\]]*)(?:\|([^\]]*))?\]")


def tokens(text):
    text = text.replace("’", "'")
    return [w for w in re.findall(r"[a-z0-9']+", text.lower())]


def plain(text):
    return "".join(tokens(text))


def written_text(display):
    return MARK_RE.sub(r"\1", display)


def expected_tokens(display):
    out = []
    pos = 0
    for match in MARK_RE.finditer(display):
        out += tokens(display[pos:match.start()])
        out += tokens(match.group(2))
        pos = match.end()
    out += tokens(display[pos:])
    return out


def target_forms(lesson):
    forms = []
    for target in lesson.get("targets", []):
        for part in re.split(r"\s*/\s*", target.get("spoken", "")):
            form = plain(part)
            if form:
                forms.append(form)
    return forms


def is_target(form_text, forms):
    """A mark matches when it is a target form, or ends with one.

    Whole-phrase phenomena mark more than the form itself: `[Did you|Didja]`
    carries the subject, and `-in'` is only a suffix.
    """
    text = plain(form_text)
    return any(text == form or (len(form) >= 2 and text.endswith(form)) for form in forms)


def main():
    lessons = []
    for path in sorted(CONTENT.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as error:
            print(f"FAIL {path.name}: {error}")
            return 1
        if isinstance(data, dict):
            data = [data]
        for lesson in data:
            lesson["_file"] = path.name
            lessons.append(lesson)
    lessons.sort(key=lambda lesson: lesson.get("num", 0))

    seen = {}
    problems = 0

    def bad(message):
        nonlocal problems
        print(f"  !! {message}")
        problems += 1

    print(f"{'#':>3} {'lines':>5} {'mark':>4}  target / title")
    for lesson in lessons:
        num = lesson.get("num")
        if num in seen:
            bad(f"duplicate lesson {num} in {lesson['_file']} and {seen[num]}")
        seen[num] = lesson["_file"]

        if lesson.get("category") not in CATEGORIES:
            bad(f"lesson {num}: unknown category {lesson.get('category')!r}")
        for key in ("num", "title_en", "title_zh", "targets", "lines"):
            if key not in lesson:
                bad(f"lesson {num}: missing {key}")
        lines = lesson.get("lines", [])
        marks = sum(len(MARK_RE.findall(line.get("display", ""))) for line in lines)
        forms = target_forms(lesson)
        label = " / ".join(t.get("spoken", "") for t in lesson.get("targets", []))
        print(f"{num:>3} {len(lines):>5} {marks:>4}  {label} / {lesson.get('title_en','')}")

        if not 12 <= len(lines) <= 16:
            bad(f"lesson {num}: {len(lines)} lines (want 12-16)")
        if not forms:
            bad(f"lesson {num}: no target spoken form")
        if marks < 6:
            bad(f"lesson {num}: only {marks} marked forms (want >= 6)")

        for index, line in enumerate(lines, 1):
            where = f"lesson {num} line {index}"
            for key in ("display", "zh"):
                if not str(line.get(key, "")).strip():
                    bad(f"{where}: empty {key}")
            display = line.get("display", "")
            say = (line.get("say") or "").strip()
            if say and expected_tokens(display) != tokens(say):
                bad(f"{where}: say does not match the marks' spoken side")
            if "’" in display:
                bad(f"{where}: curly apostrophe in display")
            if "\n" in display:
                bad(f"{where}: newline in display")
            if "[" in MARK_RE.sub("", display) or "]" in MARK_RE.sub("", display):
                bad(f"{where}: malformed mark syntax in display")
            if "|" in written_text(display):
                bad(f"{where}: stray '|' outside a mark")
            for original, spoken, mark_ipa in MARK_RE.findall(display):
                if not is_target(spoken, forms):
                    bad(f"{where}: mark [{original}|{spoken}] is not a target spoken form")

        for target in lesson.get("targets", []):
            demo = target.get("demo") or {}
            if not str(demo.get("text", "")).strip():
                bad(f"lesson {num}: target {target.get('spoken')!r} needs demo.text")


    print(f"\nlessons: {len(lessons)}, problems: {problems}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
