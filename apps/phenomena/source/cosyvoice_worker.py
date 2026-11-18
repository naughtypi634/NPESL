# -*- coding: utf-8 -*-
"""Synthesize phenomena clips with CosyVoice 3 (Fun-CosyVoice3-0.5B).

Runs in the CosyVoice venv (F:\\AIProject\\CosyVoice\\.venv), which borrows
the ROCm torch from tts-lab.  The same h2 / c reference clips used by the
Qwen pipeline are registered as zero-shot speakers, so the trial keeps the
existing voices.

    python cosyvoice_worker.py jobs.json

jobs.json = [{"out": "...mp3", "text": "...", "voice": "h2|c"}, ...]

torchaudio in that venv is a stub: load / Resample / kaldi.fbank are replaced
below with soundfile + scipy + the vendored torchaudio kaldi implementation.
"""

import json
import os
import pathlib
import subprocess
import sys
import tempfile
import types

import numpy as np
import soundfile as sf

ROOT = pathlib.Path(__file__).resolve().parents[3]
COSYVOICE_ROOT = pathlib.Path(
    os.environ.get("COSYVOICE_ROOT", r"F:\AIProject\CosyVoice"))
MODEL = os.environ.get(
    "COSYVOICE_MODEL",
    str(COSYVOICE_ROOT / "pretrained_models" / "Fun-CosyVoice3-0.5B"))
REFS = {
    "h2": ROOT / "build" / "qwen-voicedesign" / "ref-h2.wav",
    "c": ROOT / "build" / "qwen-voicedesign" / "ref-c.wav",
}
REF_TEXT = (
    "My name is Henry, and I come from a loving and tight-knit family. "
    "I was born and raised in a small town, and I have two siblings: a younger "
    "brother and an older sister."
)
PROMPT_PREFIX = "You are a helpful assistant.<|endofprompt|>"
FFMPEG = pathlib.Path(
    r"F:\AIProject\NPESL\build\tts-local\venv\Lib\site-packages"
    r"\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe")
ENCODE = ["-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "48k",
          "-write_xing", "0", "-id3v2_version", "0"]


def patch_torchaudio():
    """Give the stub the three real functions CosyVoice actually calls."""
    import scipy.signal
    import torch
    import torchaudio
    import torchaudio.compliance.kaldi as kaldi

    def load(path, backend=None):
        data, sample_rate = sf.read(str(path), dtype="float32", always_2d=True)
        return torch.from_numpy(data.T.copy()), sample_rate

    class Resample(torch.nn.Module):
        def __init__(self, orig_freq, new_freq, **kwargs):
            super().__init__()
            from fractions import Fraction
            frac = Fraction(int(new_freq), int(orig_freq)).limit_denominator(1000)
            self.up, self.down = frac.numerator, frac.denominator

        def forward(self, waveform):
            out = scipy.signal.resample_poly(
                waveform.numpy(), self.up, self.down, axis=-1)
            return torch.from_numpy(np.ascontiguousarray(out, dtype=np.float32))

    class Spectrogram(torch.nn.Module):
        """Only the hifigan discriminator imports this; training never runs here."""

        def __init__(self, n_fft=400, win_length=None, hop_length=None, pad=0,
                     window_fn=torch.hann_window, power=2.0, normalized=False,
                     wkwargs=None, center=True, pad_mode="reflect",
                     onesided=True):
            super().__init__()
            self.n_fft = n_fft
            self.win_length = win_length or n_fft
            self.hop_length = hop_length or self.win_length // 2
            self.pad = pad
            self.window_fn = window_fn
            self.power = power
            self.normalized = normalized
            self.wkwargs = wkwargs or {}
            self.center = center
            self.pad_mode = pad_mode
            self.onesided = onesided

        def forward(self, waveform):
            if self.pad:
                waveform = torch.nn.functional.pad(
                    waveform, (self.pad, self.pad))
            spec = torch.stft(
                waveform, self.n_fft, self.hop_length, self.win_length,
                self.window_fn(self.win_length, **self.wkwargs),
                center=self.center, pad_mode=self.pad_mode,
                normalized=self.normalized, onesided=self.onesided,
                return_complex=True).abs()
            return spec ** self.power

    sys.path.insert(0, str(COSYVOICE_ROOT / "compat"))
    import kaldi as kaldi_impl  # vendored torchaudio/compliance/kaldi.py

    transforms = types.ModuleType("torchaudio.transforms")
    transforms.Resample = Resample
    transforms.Spectrogram = Spectrogram
    sys.modules["torchaudio.transforms"] = transforms
    torchaudio.transforms = transforms
    torchaudio.load = load
    kaldi.fbank = kaldi_impl.fbank
    kaldi.get_mel_banks = kaldi_impl.get_mel_banks


def patch_onnxruntime():
    """ROCm torch reports CUDA available, but the CPU onnxruntime has no CUDA EP."""
    import onnxruntime

    original = onnxruntime.InferenceSession
    available = set(onnxruntime.get_available_providers())

    def session(*args, **kwargs):
        providers = kwargs.get("providers")
        if providers:
            kwargs["providers"] = [p for p in providers if p in available]
            if not kwargs["providers"]:
                kwargs["providers"] = ["CPUExecutionProvider"]
        return original(*args, **kwargs)

    onnxruntime.InferenceSession = session


def trim_lead(audio, sample_rate):
    """Drop leading silence and the short burst CosyVoice puts before speech.

    The h2 voice starts every clip with a ~150 ms burst around -25 dB (it reads
    as a stray syllable), then pauses before the real sentence.  Only trim the
    burst when it is short, quiet and followed by a real silence gap, so a
    genuine short first word is never cut.
    """
    win = int(0.01 * sample_rate)
    frames = len(audio) // win
    if frames < 20:
        return audio
    db = np.array([
        20 * np.log10(np.sqrt((audio[i * win:(i + 1) * win] ** 2).mean()) + 1e-9)
        for i in range(frames)
    ])
    start = next((i for i in range(frames) if db[i] > -50), None)
    if start is None:
        return audio
    end = start
    while end < frames and db[end] > -50:
        end += 1
    quiet = end
    while quiet < frames and db[quiet] < -50:
        quiet += 1
    burst = end - start
    silence = quiet - end
    peak = float(db[start:end].max()) if burst else -100.0
    if burst <= 25 and silence >= 15 and peak < -20 and quiet < frames:
        return audio[max(0, quiet - 3) * win:]
    if start > 3:
        return audio[(start - 3) * win:]
    return audio


def encode(wav_path, mp3_path):
    mp3_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([str(FFMPEG), "-y", "-loglevel", "error", "-i",
                    str(wav_path)] + ENCODE + [str(mp3_path)], check=True)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    jobs = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))

    patch_torchaudio()
    patch_onnxruntime()
    sys.path.insert(0, str(COSYVOICE_ROOT))
    sys.path.insert(0, str(COSYVOICE_ROOT / "third_party" / "Matcha-TTS"))
    from cosyvoice.cli.cosyvoice import AutoModel

    model = AutoModel(model_dir=MODEL)
    mode = os.environ.get("COSYVOICE_MODE", "zero_shot")
    voices = sorted({job["voice"] for job in jobs})
    for voice in voices:
        model.add_zero_shot_spk(PROMPT_PREFIX + REF_TEXT, str(REFS[voice]), voice)

    total = len(jobs)
    done = failed = 0
    with tempfile.TemporaryDirectory() as tmp:
        wav = pathlib.Path(tmp) / "clip.wav"
        for job in jobs:
            try:
                if mode == "cross_lingual":
                    chunks = list(model.inference_cross_lingual(
                        PROMPT_PREFIX + job["text"], "",
                        zero_shot_spk_id=job["voice"], stream=False,
                        text_frontend=False))
                else:
                    chunks = list(model.inference_zero_shot(
                        job["text"], "", "", zero_shot_spk_id=job["voice"],
                        stream=False, text_frontend=False))
                audio = np.concatenate(
                    [c["tts_speech"].squeeze(0).numpy().astype(np.float32)
                     for c in chunks])
                audio = trim_lead(audio, model.sample_rate)
                sf.write(wav, audio, model.sample_rate)
                encode(wav, pathlib.Path(job["out"]))
                done += 1
            except Exception as exc:  # noqa: BLE001 - keep going per clip
                failed += 1
                print(f"cosyvoice: skip {job['text'][:40]!r}: {exc}", flush=True)
            if done % 10 == 0 or done + failed == total:
                print(f"cosyvoice: {done}/{total}", flush=True)
    if failed:
        print(f"cosyvoice: {failed} clips failed", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
