#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fill the Chinese translations for Conversation Starters questions.

Source:  content/conversation/<LEVEL>/content.py
Target:  content/conversation/zh/<level>.json
         Adds "comp" (Comprehension Questions) and "conv" (Conversation
         Starters) arrays next to the existing "title" / "paras".

Only stories whose target arrays are missing or have the wrong length are
sent.  Re-running is safe and resumes after an interrupted run.

    python -I tools/translate_conversation_zh.py
    python -I tools/translate_conversation_zh.py --levels A1,A2 --jobs 4
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CONTENT = ROOT / "content" / "conversation"
LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2", "ESLSE")

ENDPOINT = os.environ.get("ZH_TRANSLATE_URL",
                          "https://api.deepseek.com/anthropic/v1/messages")
MODEL = os.environ.get("ZH_TRANSLATE_MODEL", "deepseek-flash")

SYSTEM = """You translate English conversation-practice questions into natural
Simplified Chinese for adult Chinese learners of American English. Keep the
friendly spoken tone, use 你 rather than 您, and translate meaning rather than
word-for-word. Keep names, numbers, and concrete details. Use Chinese
punctuation. Never merge, split, add, or omit items."""


def load_level(level: str) -> list:
    path = CONTENT / level / "content.py"
    spec = importlib.util.spec_from_file_location(f"cs_{level}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.UNITS


def slugify(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-").lower()


def parse_json_array(text: str) -> list:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start = text.find("[")
    end = text.rfind("]")
    if start < 0 or end <= start:
        raise ValueError("no JSON array in reply")
    data = json.loads(text[start:end + 1])
    if not isinstance(data, list):
        raise ValueError("reply is not an array")
    return data


def translate_batch(questions: list[str], session: requests.Session,
                    timeout: int = 90) -> list[str]:
    user = (
        f"Translate this JSON array of {len(questions)} English questions "
        "into Simplified Chinese. Return ONLY a JSON array with exactly "
        f"{len(questions)} strings in the same order.\n\n"
        + json.dumps(questions, ensure_ascii=False)
    )
    body = {
        "model": MODEL,
        "max_tokens": 4000,
        "temperature": 0.2,
        "system": SYSTEM,
        "messages": [{"role": "user", "content": user}],
    }
    headers = {
        "Authorization": "Bearer " + os.environ["DEEPSEEK_API_KEY"],
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
    }
    last_error = None
    for attempt in range(4):
        try:
            resp = session.post(ENDPOINT, headers=headers, json=body,
                                timeout=timeout)
            if resp.status_code == 429 or resp.status_code >= 500:
                raise RuntimeError(f"HTTP {resp.status_code}")
            resp.raise_for_status()
            payload = resp.json()
            text = "".join(
                block.get("text", "")
                for block in payload.get("content", [])
                if block.get("type") == "text"
            )
            result = parse_json_array(text)
            if len(result) != len(questions):
                raise ValueError(
                    f"expected {len(questions)} items, got {len(result)}")
            clean = []
            for item in result:
                if not isinstance(item, str) or not item.strip():
                    raise ValueError("empty item")
                if not re.search(r"[一-鿿]", item):
                    raise ValueError("item has no Chinese")
                clean.append(item.strip())
            return clean
        except Exception as exc:  # noqa: BLE001 - retry any transient failure
            last_error = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"translation failed: {last_error}")


def write_level(level: str, zh: dict) -> None:
    path = CONTENT / "zh" / f"{level.lower()}.json"
    current = {}
    if path.exists():
        with path.open(encoding="utf-8") as fh:
            current = json.load(fh)
    for key, entry in zh.items():
        current.setdefault(key, {}).update(entry)
    tmp = path.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(current, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    tmp.replace(path)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--levels", default=",".join(LEVELS))
    parser.add_argument("--jobs", type=int, default=6)
    args = parser.parse_args()

    if not os.environ.get("DEEPSEEK_API_KEY"):
        print("缺少 DEEPSEEK_API_KEY")
        return 1

    levels = [x.strip().upper() for x in args.levels.split(",") if x.strip()]
    bad = [x for x in levels if x not in LEVELS]
    if bad:
        print("未知级别：" + ", ".join(bad))
        return 1

    # Build the work list first, so a clean run can skip everything.
    tasks = []  # (level, key, story, field)
    for level in levels:
        path = CONTENT / "zh" / f"{level.lower()}.json"
        old = {}
        if path.exists():
            with path.open(encoding="utf-8") as fh:
                old = json.load(fh)
        for ui, unit in enumerate(load_level(level), 1):
            for si, story in enumerate(unit["stories"], 1):
                key = f"{ui:02d}-{si:02d}-{slugify(story['title'])}"
                entry = old.get(key, {})
                for field in ("comp", "conv"):
                    have = entry.get(field)
                    if not isinstance(have, list) or len(have) != len(story[field]):
                        tasks.append((level, key, story, field, entry))

    if not tasks:
        print("所有题目的中文都已齐全，无需翻译")
        return 0

    print(f"待翻译 {len(tasks)} 组（{len(levels)} 级，每篇 comp + conv）")
    pending: dict[str, dict] = {lv: {} for lv in levels}
    done = 0
    failed = []

    session_holder = threading.local()

    def run(task):
        level, key, story, field, _entry = task
        sess = getattr(session_holder, "s", None)
        if sess is None:
            sess = session_holder.s = requests.Session()
        return task, translate_batch(story[field], sess)

    with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
        futures = [pool.submit(run, task) for task in tasks]
        for fut in as_completed(futures):
            try:
                (level, key, story, field, _entry), result = fut.result()
            except Exception as exc:  # noqa: BLE001
                failed.append(str(exc))
                print(f"  失败：{exc}")
                continue
            pending[level].setdefault(key, {})[field] = result
            done += 1
            # Write periodically so an interrupted run keeps its progress.
            if done % 5 == 0:
                for lv in levels:
                    if pending[lv]:
                        write_level(lv, pending[lv])
                        pending[lv].clear()
            print(f"  [{done}/{len(tasks)}] {level} {key} {field}")

    for lv in levels:
        if pending[lv]:
            write_level(lv, pending[lv])
            pending[lv].clear()

    if failed:
        print(f"有 {len(failed)} 组失败，重跑本脚本会只补缺失的组")
        return 1
    print("翻译完成")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
