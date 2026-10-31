# -*- coding: utf-8 -*-
"""Synthesize clips with a local Qwen3-TTS model (ROCm build).

Runs in the user's tts-lab venv, which has torch+ROCm and qwen-tts installed.
Paths are overridable so the lab can move without touching this file:

    QWEN_TTS_MODEL  model dir (default F:/AIProject/tts-lab/models/Qwen3-TTS-12Hz-1.7B-CustomVoice)
    FFMPEG          ffmpeg binary (default: imageio-ffmpeg, then PATH)

    python qwen_worker.py jobs.json

jobs.json = [{"out": "...mp3", "text": "...", "voice": "f|m"}, ...]
Each clip is written as MPEG-2 Layer III, 24 kHz, 48 kbps CBR — the shape
tools/audio_sprite.py concatenates.
"""

import json
import os
import pathlib
import subprocess
import sys
import tempfile

import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

MODEL = os.environ.get(
    "QWEN_TTS_MODEL",
    r"F:\AIProject\tts-lab\models\Qwen3-TTS-12Hz-1.7B-CustomVoice")
SPEAKERS = {"f": "vivian", "m": "aiden"}

# 语气要求：正常、自然、别夸张，断句按标点走。男女同一套。
INSTRUCT = (
    "Read the sentence as a native American English speaker in an everyday "
    "conversational voice. Keep the tone calm, neutral and natural: not "
    "dramatic, not sharp, not low or heavy. Use an ordinary speaking pitch "
    "and a moderate, steady pace. Pause briefly and logically where the "
    "punctuation calls for it, and end each sentence with a clear, gentle stop."
)

ENCODE = ["-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "48k",
          "-write_xing", "0", "-id3v2_version", "0"]


def ffmpeg_path() -> str:
    override = os.environ.get("FFMPEG")
    if override:
        return override
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001 - fall through
        pass
    root = pathlib.Path(__file__).resolve().parents[3]
    local = root / "build" / "tts-local" / "venv" / "Lib" / "site-packages" \
        / "imageio_ffmpeg" / "binaries" / "ffmpeg-win-x86_64-v7.1.exe"
    return str(local) if local.exists() else "ffmpeg"


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    jobs = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    model = Qwen3TTSModel.from_pretrained(
        MODEL, device_map="cuda:0", dtype=torch.bfloat16,
        attn_implementation="sdpa")
    ffmpeg = ffmpeg_path()
    done = 0
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = pathlib.Path(tmp) / "clip.wav"
        for job in jobs:
            out = pathlib.Path(job["out"])
            out.parent.mkdir(parents=True, exist_ok=True)
            wavs, sr = model.generate_custom_voice(
                text=job["text"], language="English",
                speaker=SPEAKERS[job["voice"]], instruct=INSTRUCT)
            sf.write(wav_path, wavs[0], sr)
            subprocess.run(
                [ffmpeg, "-y", "-loglevel", "error", "-i", str(wav_path)]
                + ENCODE + [str(out)], check=True)
            done += 1
            if done % 10 == 0 or done == len(jobs):
                print(f"qwen: {done}/{len(jobs)}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
