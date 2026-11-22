# -*- coding: utf-8 -*-
"""Build the TTS job list for every visual-vocabulary card missing a clip.

The worker is the same one Phenomena uses (Qwen3-TTS Base, cloned h2/c
voices), so the new cards match the existing ones. Existing clips are left
alone; rerunning only fills gaps.

    python -I tools/vv/gen_audio.py --jobs
    python -I tools/vv/gen_audio.py --run
"""

import argparse
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SETS = ROOT / "content" / "visual-vocabulary" / "sets"
JOBS = ROOT / "build" / "vv-work" / "audio-jobs.json"
WORKER = ROOT / "apps" / "phenomena" / "source" / "qwen_clone_worker.py"
PYTHON = pathlib.Path(r"F:\AIProject\tts-lab\.venv\Scripts\python.exe")
VOICES = ("h2", "c")


def jobs():
    out = []
    for path in sorted(SETS.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        app = ROOT / "apps" / "visual-vocabulary" / data["set"]
        for sec in data["sections"]:
            for it in sec["items"]:
                audio = it.get("audio") or it["slug"]
                for voice in VOICES:
                    dest = app / "audio" / voice / f"{audio}.mp3"
                    if dest.exists():
                        continue
                    out.append({"out": str(dest.relative_to(ROOT)),
                                "text": it["en"], "voice": voice})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--jobs", action="store_true")
    args = ap.parse_args()
    todo = jobs()
    JOBS.write_text(json.dumps(todo, ensure_ascii=False, indent=1) + "\n",
                    encoding="utf-8")
    print("missing clips:", len(todo))
    if args.jobs:
        for job in todo[:20]:
            print(job["voice"], job["text"])
        return 0
    if args.run and todo:
        subprocess.run([str(PYTHON), str(WORKER), str(JOBS)], check=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
