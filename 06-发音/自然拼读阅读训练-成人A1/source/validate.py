# -*- coding: utf-8 -*-
"""Report structural issues in content/*.json without touching audio."""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent


def tokens(text):
    text = text.replace("’", "'")
    return [re.sub(r"[^a-z0-9']", "", w.lower()) for w in re.findall(r"[A-Za-z0-9']+", text)]


def plain(text):
    return "".join(tokens(text))


def main():
    lessons = []
    for path in sorted((ROOT / "content").glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as error:
            print(f"FAIL {path.name}: {error}")
            continue
        if isinstance(data, dict):
            data = [data]
        for lesson in data:
            lesson["_file"] = path.name
            lessons.append(lesson)
    lessons.sort(key=lambda lesson: lesson.get("num", 0))

    seen = {}
    problems = 0
    print(f"{'#':>3} {'ipa':<7} {'sent':>4} {'chunk':>5} {'mark':>4}  title")
    for lesson in lessons:
        num = lesson.get("num")
        if num in seen:
            print(f"  !! duplicate lesson {num} in {lesson['_file']} and {seen[num]}")
            problems += 1
        seen[num] = lesson["_file"]
        sentences = lesson.get("sentences", [])
        chunks = sum(len(s.get("chunks", [])) for s in sentences)
        marks = sum(
            chunk["display"].count("[")
            for sentence in sentences
            for chunk in sentence.get("chunks", [])
        )
        print(f"{num:>3} {lesson.get('ipa',''):<7} {len(sentences):>4} {chunks:>5} {marks:>4}  {lesson.get('title_en','')}")
        if not 7 <= len(sentences) <= 13:
            print(f"  !! lesson {num}: {len(sentences)} sentences")
            problems += 1
        for sentence in sentences:
            if not 1 <= len(sentence.get("chunks", [])) <= 3:
                print(f"  !! lesson {num}: bad chunk count")
                problems += 1
            joined = "".join(plain(c.get("say", "")) for c in sentence["chunks"])
            if joined != plain(sentence.get("say", "")):
                print(f"  !! lesson {num}: chunks rebuild mismatch: {sentence.get('say')!r}")
                problems += 1
            for chunk in sentence["chunks"]:
                display = chunk.get("display", "")
                if plain(display.replace("[", "").replace("]", "")) != plain(chunk.get("say", "")):
                    print(f"  !! lesson {num}: display mismatch {display!r}")
                    problems += 1
                if not chunk.get("zh", "").strip():
                    print(f"  !! lesson {num}: empty zh")
                    problems += 1

    missing = sorted(set(range(1, 49)) - set(seen))
    if missing:
        print(f"missing lessons: {missing}")
    print(f"\nlessons: {len(lessons)}, problems: {problems}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
