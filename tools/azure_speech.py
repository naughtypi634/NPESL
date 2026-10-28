#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Azure AI Speech helpers for the Phonics and IPA builds.

Credentials live outside the repo:  ~/.azure-speech/key.txt
    line 1: subscription key
    line 2: region (e.g. southeastasia)

Two entry points:

    synthesize(text, voice, rate)              # REST, audio only
    synthesize_with_words(text, voice, rate)   # Speech SDK, audio + word starts

Both request ``audio-24khz-48kbitrate-mono-mp3`` so the output keeps the
144-byte / 24 ms MP3 frames that ``audio_sprite`` and the lesson pages expect.
The SDK is imported lazily: IPA only needs REST, and not every build machine
has the SDK installed.
"""

from __future__ import annotations

import pathlib
import re
import time
import urllib.error
import urllib.request
from xml.sax.saxutils import escape as xml_escape

KEY_FILE = pathlib.Path.home() / ".azure-speech" / "key.txt"
OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3"
FRAME_BYTES = 144
FRAME_SECONDS = 0.024


def credentials() -> tuple[str, str]:
    lines = [line.strip() for line in KEY_FILE.read_text(encoding="utf-8").splitlines()
             if line.strip()]
    if len(lines) < 2:
        raise SystemExit("key file needs the key on line 1 and the region on line 2")
    return lines[0], lines[1]


def ssml(text: str, voice: str, rate: str = "+0%", lang: str = "en-US") -> str:
    return (
        f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' "
        f"xml:lang='{lang}'><voice name='{voice}'>"
        f"<prosody rate='{rate}'>{xml_escape(text)}</prosody></voice></speak>"
    )


def synthesize(text: str, voice: str, rate: str = "+0%") -> bytes:
    """REST synthesis, no word boundaries. Retries transient failures."""
    key, region = credentials()
    body = ssml(text, voice, rate).encode("utf-8")
    last: Exception | None = None
    for attempt in range(4):
        try:
            request = urllib.request.Request(
                f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
                data=body,
                headers={
                    "Ocp-Apim-Subscription-Key": key,
                    "Content-Type": "application/ssml+xml",
                    "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
                    "User-Agent": "npesl",
                },
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=90) as response:
                audio = response.read()
            if not audio:
                raise RuntimeError("empty audio")
            return audio
        except urllib.error.HTTPError as error:
            last = error
            if error.code not in (429, 500, 502, 503, 504):
                raise
            time.sleep(2 * (attempt + 1))
        except Exception as error:  # noqa: BLE001 - network hiccups
            last = error
            time.sleep(2 * (attempt + 1))
    raise last


def synthesize_with_words(text: str, voice: str, rate: str = "+0%",
                          lang: str = "en-US") -> tuple[bytes, list[dict]]:
    """Speech SDK synthesis with word boundaries.

    Returns ``(audio, words)`` where each word is
    ``{"text": str, "offset": seconds, "duration": seconds}``.  The SDK's
    word event has an empty duration for MP3, so durations are derived from
    the next word's onset (last word: to the end of the clip).
    """
    import azure.cognitiveservices.speech as speechsdk

    key, region = credentials()
    config = speechsdk.SpeechConfig(subscription=key, region=region)
    config.set_speech_synthesis_output_format(
        speechsdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3)
    config.set_property(
        speechsdk.PropertyId.SpeechServiceResponse_RequestWordBoundary, "true")
    synthesizer = speechsdk.SpeechSynthesizer(speech_config=config, audio_config=None)

    starts: list[tuple[str, float]] = []

    def on_word(event: object) -> None:
        # Azure emits boundaries for punctuation too ("." after the last
        # word).  The lesson mapper expects word tokens only.
        if not re.search(r"[A-Za-z0-9]", event.text or ""):
            return
        starts.append((event.text, event.audio_offset / 10_000_000))

    synthesizer.synthesis_word_boundary.connect(on_word)
    result = synthesizer.speak_ssml_async(ssml(text, voice, rate, lang)).get()
    if result.reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
        detail = speechsdk.SpeechSynthesisCancellationDetails.from_result(result)
        raise RuntimeError(f"Azure TTS failed: {detail.reason} {detail.error_details}")
    audio = result.audio_data
    if not audio or not starts:
        raise RuntimeError("Azure TTS returned no audio or no word boundaries")

    total = len(audio) / FRAME_BYTES * FRAME_SECONDS
    words: list[dict] = []
    for index, (word, offset) in enumerate(starts):
        if index + 1 < len(starts):
            end = starts[index + 1][1]
        else:
            # The lesson mapper adds 80 ms after the last word of a chunk;
            # leave that much room so the page span never exceeds the clip.
            end = min(total, max(offset + 0.04, total - 0.08))
        words.append({
            "text": word,
            "offset": round(offset, 4),
            "duration": round(max(0.04, end - offset), 4),
        })
    return audio, words
