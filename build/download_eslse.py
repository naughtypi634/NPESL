# -*- coding: utf-8 -*-
"""Mirror the live ESLSE Conversation Starters pages and audio into staging."""

from __future__ import annotations

import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

BASE = "https://npesl.pages.dev/conversation/eslse/"
OUT = Path(__file__).resolve().parent / "conversation-eslse"
UA = {"User-Agent": "Mozilla/5.0 NPESL mirror"}


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    index = fetch(BASE)
    (OUT / "index.html").write_bytes(index)
    html = index.decode("utf-8", "replace")
    links = sorted(set(re.findall(r'href="([0-9]{2}-[0-9]{2}-[^"]+\.html)"', html)))
    print(f"stories {len(links)}")
    clips: set[tuple[str, str]] = set()
    for i, name in enumerate(links, 1):
        data = fetch(BASE + name)
        (OUT / name).write_bytes(data)
        text = data.decode("utf-8", "replace")
        for kind in ("f", "m"):
            for clip in re.findall(rf'data-clip-{kind}="([^"]+\.mp3)"', text):
                clips.add((kind, clip))
        if i % 10 == 0:
            print(f"pages {i}/{len(links)}")
    print(f"clips {len(clips)}")
    jobs = []
    for kind, clip in sorted(clips):
        voice = "ava" if kind == "f" else "andrew"
        url = BASE + f"audio/{voice}/{clip}"
        target = OUT / "audio" / voice / clip
        jobs.append((url, target))
    done = 0
    failed = []
    def one(url: str, target: Path):
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(fetch(url))
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(one, u, t): (u, t) for u, t in jobs}
        for fut in as_completed(futures):
            done += 1
            try:
                fut.result()
            except Exception as exc:  # noqa: BLE001
                failed.append((futures[fut][0], str(exc)))
            if done % 100 == 0:
                print(f"audio {done}/{len(jobs)} failed {len(failed)}")
    print(f"done pages {len(links)} audio {len(jobs) - len(failed)}/{len(jobs)} failed {len(failed)}")
    for f in failed[:10]:
        print("FAIL", f)
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
