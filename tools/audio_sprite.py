#!/usr/bin/env python3
"""Concatenate the per-clip MP3s into one sprite per page / lesson / question.

Every recording in this repo comes from Edge TTS with the same shape:
MPEG-2 Layer III, 24 kHz, 48 kbps CBR, 144-byte frames of 24 ms, no ID3 tag.
That makes concatenation byte-safe and seek-by-time accurate: the audio bytes
are copied verbatim, nothing is re-encoded.

    data, spans = concat([clip_a, clip_b])
    spans  # [(start, end), (start, end)] in seconds

Callers write `data` to one file and put `spans` into the page, so the player
only ever downloads one file per page instead of dozens of clips.
"""

from __future__ import annotations

import hashlib

FRAME_BYTES = 144
FRAME_SECONDS = 0.024
# 0xFF 0xF3 0x64 0xC4 = MPEG-2 Layer III, 48 kbps, 24 kHz, no padding.
FRAME_HEADER = b"\xff\xf3\x64\xc4"


class AudioFormatError(ValueError):
    """A clip is not the expected uniform MPEG-2 Layer III stream."""


def strip_id3(data: bytes) -> bytes:
    """Drop an ID3v2 tag if a clip carries one (Edge TTS output normally doesn't)."""
    if len(data) >= 10 and data[:3] == b"ID3":
        size = ((data[6] & 0x7F) << 21) | ((data[7] & 0x7F) << 14) \
            | ((data[8] & 0x7F) << 7) | (data[9] & 0x7F)
        return data[10 + size:]
    return data


def check(data: bytes) -> bytes:
    """Validate one clip and return it trimmed to whole frames."""
    data = strip_id3(data)
    if not data:
        return b""
    if not data.startswith(FRAME_HEADER):
        raise AudioFormatError(
            f"unexpected mp3 header {data[:4].hex()} (want {FRAME_HEADER.hex()})")
    if len(data) % FRAME_BYTES:
        raise AudioFormatError(
            f"length {len(data)} is not a multiple of {FRAME_BYTES}")
    return data


def frames(data: bytes) -> int:
    return len(data) // FRAME_BYTES


def duration(data: bytes) -> float:
    return frames(data) * FRAME_SECONDS


def concat(clips: list[bytes]) -> tuple[bytes, list[tuple[float, float]]]:
    """Join clips in order; return the stream and each clip's (start, end)."""
    out = bytearray()
    spans: list[tuple[float, float]] = []
    timestamp = 0.0
    for index, clip in enumerate(clips):
        clean = check(clip)
        if not clean:
            raise AudioFormatError(f"clip {index} is empty")
        length = duration(clean)
        spans.append((timestamp, timestamp + length))
        out += clean
        timestamp += length
    return bytes(out), spans


def name_for(parts: list[str]) -> str:
    """Stable content-addressed sprite name from the ordered clip ids."""
    digest = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()
    return digest[:12]
