# -*- coding: utf-8 -*-
"""Synthesize clips with a local Kokoro ONNX model.

Runs in a sidecar venv (kokoro-onnx + soundfile + imageio-ffmpeg), not the repo
venv, because onnxruntime is only needed for this optional backend.

    python kokoro_worker.py jobs.json

jobs.json = [{"out": "...mp3", "text": "...", "voice": "f|m"}, ...]

Each clip is written as MPEG-2 Layer III, 24 kHz, 48 kbps CBR, no ID3 — the
exact shape tools/audio_sprite.py concatenates (144-byte frames).
"""

import json
import pathlib
import subprocess
import sys
import tempfile

import imageio_ffmpeg
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = pathlib.Path(__file__).resolve().parents[3]
MODELS = ROOT / "build" / "tts-local"
VOICES = {"f": "af_heart", "m": "am_michael"}

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
ENCODE = [
    "-ac", "1", "-ar", "24000",
    "-c:a", "libmp3lame", "-b:a", "48k",
    "-write_xing", "0", "-id3v2_version", "0",
]


def encode(wav: pathlib.Path, mp3: pathlib.Path) -> None:
    subprocess.run(
        [FFMPEG, "-y", "-loglevel", "error", "-i", str(wav)] + ENCODE + [str(mp3)],
        check=True,
    )


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    jobs = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    kokoro = Kokoro(str(MODELS / "kokoro-v1.0.onnx"),
                    str(MODELS / "voices-v1.0.bin"))
    done = 0
    with tempfile.TemporaryDirectory() as tmp:
        wav = pathlib.Path(tmp) / "clip.wav"
        for job in jobs:
            out = pathlib.Path(job["out"])
            out.parent.mkdir(parents=True, exist_ok=True)
            samples, rate = kokoro.create(
                job["text"], voice=VOICES[job["voice"]], speed=1.0, lang="en-us")
            sf.write(wav, samples, rate)
            encode(wav, out)
            done += 1
            if done % 20 == 0 or done == len(jobs):
                print(f"kokoro: {done}/{len(jobs)}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
