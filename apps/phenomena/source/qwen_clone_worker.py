# -*- coding: utf-8 -*-
"""Synthesize clips with the same cloned voices the Conversation app uses.

Qwen3-TTS Base + x-vector prompt from build/qwen-voicedesign/ref-h2.wav and
ref-c.wav, temperature 0.6 / top_p 0.9 — identical to gen_corpus.py, so the
phenomena clips sound like the conversation pages.

    python qwen_clone_worker.py jobs.json

jobs.json = [{"out": "...mp3", "text": "...", "voice": "h2|c"}, ...]
"""

import json
import os
import pathlib
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

ROOT = pathlib.Path(__file__).resolve().parents[3]
MODEL = os.environ.get(
    "QWEN_BASE_MODEL",
    r"F:\AIProject\tts-lab\models\Qwen3-TTS-12Hz-1.7B-Base")
REFS = {
    "h2": ROOT / "build" / "qwen-voicedesign" / "ref-h2.wav",
    "c": ROOT / "build" / "qwen-voicedesign" / "ref-c.wav",
}
FFMPEG = pathlib.Path(
    r"F:\AIProject\NPESL\build\tts-local\venv\Lib\site-packages"
    r"\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe")
ENCODE = ["-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "48k",
          "-write_xing", "0", "-id3v2_version", "0"]
BATCH = 4


def encode(wav_path, mp3_path):
    mp3_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([str(FFMPEG), "-y", "-loglevel", "error", "-i",
                    str(wav_path)] + ENCODE + [str(mp3_path)], check=True)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    jobs = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    model = Qwen3TTSModel.from_pretrained(
        MODEL, device_map="cuda:0", dtype=torch.bfloat16,
        attn_implementation="sdpa")
    prompts = {
        voice: model.create_voice_clone_prompt(
            ref_audio=str(REFS[voice]), x_vector_only_mode=True)
        for voice in {job["voice"] for job in jobs}
    }
    by_voice = {}
    for job in jobs:
        by_voice.setdefault(job["voice"], {}).setdefault(job["text"], []).append(job)
    total = len(jobs)
    done = 0
    failed = 0

    def render(prompt, texts):
        return model.generate_voice_clone(
            text=texts,
            language=["English"] * len(texts),
            voice_clone_prompt=prompt,
            temperature=0.6, top_p=0.9,
            non_streaming_mode=True)

    with tempfile.TemporaryDirectory() as tmp:
        wav = pathlib.Path(tmp) / "clip.wav"

        def write(audio, sr, outs):
            nonlocal done
            sf.write(wav, np.asarray(audio, dtype=np.float32), sr)
            for job in outs:
                encode(wav, pathlib.Path(job["out"]))
                done += 1

        for voice, texts in by_voice.items():
            items = list(texts.items())
            for start in range(0, len(items), BATCH):
                batch = items[start:start + BATCH]
                try:
                    wavs, sr = render(prompts[voice],
                                      [text for text, _ in batch])
                except Exception as exc:  # noqa: BLE001 - ROCm 偶发 launch failure
                    print(f"qwen-clone: batch failed ({exc}); one by one",
                          flush=True)
                    torch.cuda.empty_cache()
                    for text, outs in batch:
                        try:
                            wavs1, sr = render(prompts[voice], [text])
                        except Exception as inner:  # noqa: BLE001
                            failed += len(outs)
                            print(f"qwen-clone: skip {text[:40]!r}: {inner}",
                                  flush=True)
                            torch.cuda.empty_cache()
                            continue
                        write(wavs1[0], sr, outs)
                    print(f"qwen-clone: {done}/{total}", flush=True)
                    continue
                for (text, outs), audio in zip(batch, wavs):
                    write(audio, sr, outs)
                print(f"qwen-clone: {done}/{total}", flush=True)
    if failed:
        print(f"qwen-clone: {failed} clips failed", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
