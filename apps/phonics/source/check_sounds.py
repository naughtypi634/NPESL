# -*- coding: utf-8 -*-
"""Check every bracketed word against CMUdict for the lesson's target sound."""

import json
import pathlib
import re
import sys

import cmudict

ROOT = pathlib.Path(__file__).parent
CMU = cmudict.dict()

TARGETS = {
    "/i/": {"phones": ["IY"]},
    "/ɪ/": {"phones": ["IH"]},
    "/e/": {"phones": ["EH"]},
    "/æ/": {"phones": ["AE"]},
    "/ɝ/": {"phones": ["ER"], "stressed": True},
    "/ə/": {"phones": ["AH", "IH", "ER"], "unstressed": True},
    "/ʌ/": {"phones": ["AH"], "stressed": True},
    "/ɑ/": {"phones": ["AA"]},
    "/ɔ/": {"phones": ["AO"]},
    "/ɑr/": {"seq": ["AA", "R"]},
    "/u/": {"phones": ["UW"]},
    "/ʊ/": {"phones": ["UH"]},
    "/eɪ/": {"phones": ["EY"]},
    "/aɪ/": {"phones": ["AY"]},
    "/ɔɪ/": {"phones": ["OY"]},
    "/oʊ/": {"phones": ["OW"]},
    "/aʊ/": {"phones": ["AW"]},
    "/ɪr/": {"seq": [["IH", "R"], ["IY", "R"]]},
    "/er/": {"seq": ["EH", "R"]},
    "/ɔr/": {"seq": ["AO", "R"]},
    "/p/": {"phones": ["P"]},
    "/b/": {"phones": ["B"]},
    "/t/": {"phones": ["T"]},
    "/d/": {"phones": ["D"]},
    "/k/": {"phones": ["K"]},
    "/g/": {"phones": ["G"]},
    "/f/": {"phones": ["F"]},
    "/v/": {"phones": ["V"]},
    "/θ/": {"phones": ["TH"]},
    "/ð/": {"phones": ["DH"]},
    "/s/": {"phones": ["S"]},
    "/z/": {"phones": ["Z"]},
    "/ʃ/": {"phones": ["SH"]},
    "/ʒ/": {"phones": ["ZH"]},
    "/r/": {"phones": ["R"]},
    "/h/": {"phones": ["HH"]},
    "/tʃ/": {"phones": ["CH"]},
    "/dʒ/": {"phones": ["JH"]},
    "/tr/": {"seq": ["T", "R"]},
    "/dr/": {"seq": ["D", "R"]},
    "/ts/": {"seq": ["T", "S"]},
    "/dz/": {"seq": ["D", "Z"]},
    "/m/": {"phones": ["M"]},
    "/n/": {"phones": ["N"]},
    "/ŋ/": {"phones": ["NG"]},
    "/l/": {"phones": ["L"]},
    "/w/": {"phones": ["W"]},
    "/j/": {"phones": ["Y"]},
}

WORD_WITH_MARK = re.compile(r"[A-Za-z'\[\]]+")


def split_phones(entry):
    phones = []
    for phone in entry:
        match = re.match(r"([A-Z]+)([0-2])?", phone)
        if match:
            phones.append((match.group(1), match.group(2)))
    return phones


def has_sound(entries, target):
    for entry in entries:
        phones = split_phones(entry)
        if "seq" in target:
            bare = [p for p, _ in phones]
            sequences = target["seq"]
            if sequences and isinstance(sequences[0], str):
                sequences = [sequences]
            for seq in sequences:
                for start in range(len(bare) - len(seq) + 1):
                    if bare[start : start + len(seq)] == seq:
                        return True
            continue
        for phone, stress in phones:
            if phone not in target["phones"]:
                continue
            if target.get("stressed") and stress == "0":
                continue
            if target.get("unstressed") and stress not in (None, "0"):
                continue
            return True
    return False


def main():
    lessons = []
    for path in sorted((ROOT / "content").glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data = [data]
        lessons.extend(data)
    lessons.sort(key=lambda lesson: lesson["num"])

    bad = 0
    checked = 0
    for lesson in lessons:
        target = TARGETS.get(lesson["ipa"])
        if not target:
            print(f"?? lesson {lesson['num']}: unknown ipa {lesson['ipa']}")
            bad += 1
            continue
        for sentence in lesson["sentences"]:
            for chunk in sentence["chunks"]:
                for raw in WORD_WITH_MARK.findall(chunk["display"]):
                    if "[" not in raw:
                        continue
                    word = raw.replace("[", "").replace("]", "").strip("'").lower()
                    if not word:
                        continue
                    entries = CMU.get(word)
                    if not entries:
                        print(f"?? lesson {lesson['num']}: {word!r} not in CMUdict ({chunk['display']!r})")
                        continue
                    checked += 1
                    if not has_sound(entries, target):
                        print(
                            f"!! lesson {lesson['num']} {lesson['ipa']}: {word!r} lacks target "
                            f"({chunk['display']!r}) -> {entries[0]}"
                        )
                        bad += 1
    print(f"\nchecked {checked} marked words, {bad} problems")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
