# -*- coding: utf-8 -*-
"""Build the adult A1 phonics reading series.

Each lesson is one continuous recording per voice. Sentence and chunk playback
are time slices of that recording, so every button keeps the story's own
prosody.
"""

import argparse
import asyncio
import base64
import hashlib
import html
import json
import pathlib
import re
import sys

import edge_tts

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent.parent.parent / "tools"))
import azure_speech  # noqa: E402

ROOT = pathlib.Path(__file__).parent
BASE = ROOT.parent
LESSONS_DIR = BASE / "lessons"
AUDIO_DIR = ROOT / "audio"
# 网页版把两条音轨写成独立文件，页面只引用 URL；文件名带内容哈希，
# 配合 /phonics/audio/* 的 immutable 缓存头，内容变了文件名就变。
LESSON_AUDIO_DIR = BASE / "audio"
RATE = "-5%"
VOICES = [
    {"key": "f", "tts": "en-US-AvaMultilingualNeural", "label": "女声"},
    {"key": "m", "tts": "en-US-AndrewMultilingualNeural", "label": "男声"},
]
VOICE_BY_KEY = {v["key"]: v for v in VOICES}
VOICE_KEYS = [v["key"] for v in VOICES]


def tokens(text):
    text = text.replace("’", "'")
    return [re.sub(r"[^a-z0-9']", "", w.lower()) for w in re.findall(r"[A-Za-z0-9']+", text)]


def plain(text):
    return "".join(tokens(text))


def strip_marks(display):
    return display.replace("[", "").replace("]", "")


def slug(ipa):
    return re.sub(
        r"[^0-9A-Za-zÀ-ɏɐ-˿̀-ͯͰ-ϿḀ-ỿ-]",
        "",
        ipa.replace("/", ""),
    )


def lesson_text(lesson):
    return " ".join(sentence["say"] for sentence in lesson["sentences"])


def load_lessons(only=None):
    lessons = []
    for path in sorted((ROOT / "content").glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data = [data]
        lessons.extend(data)
    numbers = [lesson["num"] for lesson in lessons]
    if len(numbers) != len(set(numbers)):
        raise ValueError("duplicate lesson number in content/")
    for lesson in lessons:
        for key in ("num", "ipa", "patterns", "title_en", "title_zh", "sentences"):
            if key not in lesson:
                raise ValueError(f"lesson {lesson.get('num')}: missing {key}")
        if not 7 <= len(lesson["sentences"]) <= 13:
            raise ValueError(f"lesson {lesson['num']}: {len(lesson['sentences'])} sentences")
        for sentence in lesson["sentences"]:
            if not 1 <= len(sentence["chunks"]) <= 3:
                raise ValueError(f"lesson {lesson['num']}: bad chunk count")
            joined = "".join(plain(c["say"]) for c in sentence["chunks"])
            if joined != plain(sentence["say"]):
                raise ValueError(f"lesson {lesson['num']}: chunks do not rebuild {sentence['say']!r}")
            for chunk in sentence["chunks"]:
                if plain(strip_marks(chunk["display"])) != plain(chunk["say"]):
                    raise ValueError(
                        f"lesson {lesson['num']}: display mismatch {chunk['display']!r} / {chunk['say']!r}"
                    )
                if not chunk["zh"].strip():
                    raise ValueError(f"lesson {lesson['num']}: empty zh")
    lessons.sort(key=lambda lesson: lesson["num"])
    if only:
        lessons = [lesson for lesson in lessons if lesson["num"] in only]
    return lessons


def audio_paths(num, voice):
    folder = AUDIO_DIR / f"{num:02d}"
    return folder / f"story-{voice}.mp3", folder / f"story-{voice}.json"


def audio_is_fresh(lesson, voice):
    key = VOICE_BY_KEY[voice]
    mp3, meta = audio_paths(lesson["num"], voice)
    if not mp3.exists() or not meta.exists():
        return False
    try:
        saved = json.loads(meta.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return False
    return (
        saved.get("text") == lesson_text(lesson)
        and saved.get("voice") == key["tts"]
        and saved.get("rate") == RATE
        and bool(saved.get("words"))
    )


async def synthesize(text, voice, semaphore, backend="edge"):
    tts = VOICE_BY_KEY[voice]["tts"]
    async with semaphore:
        last = None
        for attempt in range(5):
            try:
                if backend == "azure":
                    audio, words = await asyncio.to_thread(
                        azure_speech.synthesize_with_words, text, tts, RATE
                    )
                    if not audio or not words:
                        raise RuntimeError("empty audio")
                    return audio, words
                communicate = edge_tts.Communicate(
                    text, tts, rate=RATE, boundary="WordBoundary"
                )
                audio = bytearray()
                words = []
                async for event in communicate.stream():
                    if event["type"] == "audio":
                        audio.extend(event["data"])
                    elif event["type"] == "WordBoundary":
                        words.append(
                            {
                                "offset": event["offset"] / 10_000_000,
                                "duration": event["duration"] / 10_000_000,
                                "text": event["text"],
                            }
                        )
                if not audio or not words:
                    raise RuntimeError("empty audio")
                return bytes(audio), words
            except Exception as error:
                last = error
                await asyncio.sleep(2 * (attempt + 1))
        raise last


async def ensure_audio(lessons, voices, backend="edge", force=False):
    semaphore = asyncio.Semaphore(3)
    jobs = [
        (lesson, voice)
        for voice in voices
        for lesson in lessons
        if force or not audio_is_fresh(lesson, voice)
    ]
    if not jobs:
        print("audio: all cached")
        return []
    print(f"audio: synthesizing {len(jobs)} stories ({', '.join(voices)}, {backend})")
    done = 0

    async def one(lesson, voice):
        nonlocal done
        mp3, meta = audio_paths(lesson["num"], voice)
        mp3.parent.mkdir(parents=True, exist_ok=True)
        text = lesson_text(lesson)
        audio, words = await synthesize(text, voice, semaphore, backend)
        mp3.write_bytes(audio)
        meta.write_text(
            json.dumps(
                {
                    "text": text,
                    "voice": VOICE_BY_KEY[voice]["tts"],
                    "rate": RATE,
                    "backend": backend,
                    "words": words,
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        done += 1
        print(f"audio: {done}/{len(jobs)} lesson {lesson['num']} {voice}")

    results = await asyncio.gather(
        *(one(lesson, voice) for lesson, voice in jobs), return_exceptions=True
    )
    failed = [
        job for job, result in zip(jobs, results) if isinstance(result, Exception)
    ]
    if failed:
        print(
            f"audio: {len(failed)} recordings failed: "
            f"{[(lesson['num'], voice) for lesson, voice in failed]}"
        )
    else:
        print("audio: done")
    return failed


def expand_words(words):
    """Edge sometimes returns a multi-word boundary ("The street"); split it."""
    out = []
    for word in words:
        parts = tokens(word["text"])
        if len(parts) <= 1:
            out.append(word)
            continue
        step = word["duration"] / len(parts)
        for index, part in enumerate(parts):
            out.append(
                {
                    "offset": word["offset"] + index * step,
                    "duration": step,
                    "text": part,
                }
            )
    return out


def map_lesson(lesson, words):
    words = expand_words(words)
    cursor = 0
    items = []
    for sentence_index, sentence in enumerate(lesson["sentences"]):
        for chunk_index, chunk in enumerate(sentence["chunks"]):
            wanted = tokens(chunk["say"])
            found = None
            for index in range(cursor, len(words)):
                got = re.sub(
                    r"[^a-z0-9']", "", words[index]["text"].lower().replace("’", "'")
                )
                if got == wanted[0]:
                    found = index
                    break
            if found is None:
                raise ValueError(f"lesson {lesson['num']}: cannot find {wanted[0]!r}")
            for offset, token in enumerate(wanted):
                got = re.sub(
                    r"[^a-z0-9']",
                    "",
                    words[found + offset]["text"].lower().replace("’", "'"),
                )
                if got != token:
                    raise ValueError(f"lesson {lesson['num']}: expected {token!r}, got {got!r}")
            items.append(
                {
                    "sentence": sentence_index,
                    "chunk": chunk_index,
                    "start": words[found]["offset"],
                    "word_end": words[found + len(wanted) - 1]["offset"]
                    + words[found + len(wanted) - 1]["duration"],
                }
            )
            cursor = found + len(wanted)
    for index, item in enumerate(items):
        end = item["word_end"] + 0.08
        if index + 1 < len(items):
            end = min(end, items[index + 1]["start"] - 0.005)
        item["end"] = max(end, item["start"] + 0.1)
        del item["word_end"]
        item["start"] = round(item["start"], 3)
        item["end"] = round(item["end"], 3)
    sentences = []
    for sentence_index in range(len(lesson["sentences"])):
        own = [item for item in items if item["sentence"] == sentence_index]
        sentences.append({"start": own[0]["start"], "end": own[-1]["end"]})
    return items, sentences


def display_html(display):
    parts = re.split(r"(\[[^\]]*\])", display)
    out = []
    for part in parts:
        if part.startswith("[") and part.endswith("]"):
            out.append(f'<span class="sound">{html.escape(part[1:-1])}</span>')
        else:
            out.append(html.escape(part))
    return "".join(out)


SPEAKER = (
    '<button class="speaker" type="button" aria-label="播放整句">'
    '<svg viewBox="0 0 24 24" aria-hidden="true">'
    '<path d="M8 5.5v13L18.5 12z"/></svg></button>'
)


def build_lesson(lesson):
    template = (ROOT / "template.html").read_text(encoding="utf-8")
    timings = {}
    audio_map = {}
    for voice in VOICE_KEYS:
        mp3, meta_path = audio_paths(lesson["num"], voice)
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        items, sentence_spans = map_lesson(lesson, meta["words"])
        timings[voice] = (
            {(item["sentence"], item["chunk"]): item for item in items},
            sentence_spans,
        )
        data = mp3.read_bytes()
        digest = hashlib.sha1(data).hexdigest()[:8]
        name = f"{lesson['num']:02d}-{digest}-{voice}.mp3"
        LESSON_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
        (LESSON_AUDIO_DIR / name).write_bytes(data)
        for stale in LESSON_AUDIO_DIR.glob(f"{lesson['num']:02d}-*-{voice}.mp3"):
            if stale.name != name:
                stale.unlink()
        audio_map[voice] = f"../audio/{name}"

    rows = []
    for sentence_index, sentence in enumerate(lesson["sentences"]):
        chunks = []
        for chunk_index, chunk in enumerate(sentence["chunks"]):
            span = {
                voice: timings[voice][0][(sentence_index, chunk_index)]
                for voice in VOICE_KEYS
            }
            chunk_marks = " ".join(
                f'data-start-{voice}="{span[voice]["start"]:.3f}" '
                f'data-end-{voice}="{span[voice]["end"]:.3f}"'
                for voice in VOICE_KEYS
            )
            chunks.append(
                '<div class="row">'
                f'<button class="chunk" type="button" {chunk_marks}>'
                f'{display_html(chunk["display"])}</button>'
                f'<p class="zh">{html.escape(chunk["zh"])}</p>'
                "</div>"
            )
        sentence_span = {
            voice: timings[voice][1][sentence_index] for voice in VOICE_KEYS
        }
        sentence_marks = " ".join(
            f'data-start-{voice}="{sentence_span[voice]["start"]:.3f}" '
            f'data-end-{voice}="{sentence_span[voice]["end"]:.3f}"'
            for voice in VOICE_KEYS
        )
        rows.append(
            f'<section class="sentence" {sentence_marks}>'
            f"{SPEAKER}"
            f'<div class="rows">{"".join(chunks)}</div>'
            "</section>"
        )
    page = template.replace("<!--SENTENCES-->", "\n    ".join(rows))
    page = page.replace("__TARGET__", html.escape(lesson["ipa"]))
    page = page.replace("__PATTERNS__", html.escape(lesson["patterns"]))
    page = page.replace("__TITLE_EN__", html.escape(lesson["title_en"]))
    page = page.replace("__TITLE_ZH__", html.escape(lesson["title_zh"]))
    page = page.replace("__AUDIO_MAP__", json.dumps(audio_map, separators=(",", ":")))
    LESSONS_DIR.mkdir(parents=True, exist_ok=True)
    out = LESSONS_DIR / f"{lesson['num']:02d}-{slug(lesson['ipa'])}.html"
    out.write_text(page, encoding="utf-8")
    print(f"built {out.name} ({out.stat().st_size / 1024:.0f} KB)")
    return out


INDEX_STYLE = """
  :root {
    --bg:#ffffff; --fg:#1d1d1f; --muted:#6e6e73; --rule:#e5e5ea;
    --surface:#f5f5f7; --blue:#0071e3; --blue-tint:#e8f2ff;
    --font-ipa:"Lucida Sans Unicode","Arial Unicode MS","Charis SIL","Doulos SIL","Segoe UI",sans-serif;
    --font:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display",
      "Segoe UI Variable","Segoe UI","PingFang SC","Hiragino Sans GB",
      "Microsoft YaHei",sans-serif;
    color-scheme:light;
  }
  body { margin:0; background:var(--bg); color:var(--fg); font-family:var(--font);
    -webkit-font-smoothing:antialiased; }
  .page { box-sizing:border-box; max-width:820px; margin:0 auto;
    padding-left:max(24px,env(safe-area-inset-left,0px));
    padding-right:max(24px,env(safe-area-inset-right,0px));
    padding-block:clamp(48px,8vh,80px) 96px; }
  h1 { margin:0; font-size:clamp(2.2rem,6vw,3.2rem); font-weight:700;
    letter-spacing:-0.03em; line-height:1.06; }
  .sub { margin:10px 0 0; color:var(--muted); font-size:16px; letter-spacing:0.02em; }
  h2 { margin:44px 0 6px; font-size:15px; font-weight:600; color:var(--muted);
    letter-spacing:0.12em; }
  .list { display:flex; flex-direction:column; gap:16px; border-top:0; }
  .row { display:flex; align-items:baseline; gap:16px; padding:16px 18px;
    border:1px solid var(--rule); border-radius:var(--radius-card, 24px);
    background:var(--bg); text-decoration:none; color:inherit;
    transition:background-color .15s ease, box-shadow .15s ease,
      transform .15s ease; }
  .row:hover { background:var(--surface); transform:translateY(-1px);
    box-shadow:var(--shadow-card, 0 1px 2px rgba(0, 0, 0, 0.05),
      0 8px 24px rgba(0, 0, 0, 0.06)); }
  .row:active { transform:scale(0.995); }
  .num { width:24px; flex:none; color:var(--muted); font-size:13px;
    font-variant-numeric:tabular-nums; }
  .ipa { font-family:var(--font-ipa); flex:none; min-width:62px; padding:3px 9px; border-radius:12px;
    background:var(--blue-tint); color:var(--blue); font-size:15px;
    font-weight:600; font-variant-numeric:tabular-nums; }
  .title { flex:1; min-width:0; }
  .en { display:block; font-size:18px; font-weight:600; letter-spacing:-0.01em; }
  .zh { display:block; margin-top:2px; font-size:15px; color:var(--muted); }
  .patterns { flex:none; max-width:290px; color:var(--muted); font-size:13px;
    text-align:right; }
  .arrow { flex:none; color:var(--muted); font-size:16px; }
  @media (max-width:640px) {
    .patterns { display:none; }
    .row { gap:12px; padding:18px 14px; }
    .ipa { min-width:54px; font-size:15px; }
    .en { font-size:19px; }
    .zh { font-size:15px; }
  }
"""


def build_index(lessons):
    groups = [
        ("元音", [lesson for lesson in lessons if lesson["num"] <= 20]),
        ("辅音", [lesson for lesson in lessons if lesson["num"] > 20]),
    ]
    sections = []
    for heading, items in groups:
        if not items:
            continue
        rows = []
        for lesson in items:
            href = f"lessons/{lesson['num']:02d}-{slug(lesson['ipa'])}"
            rows.append(
                f'<a class="row" href="{href}">'
                f'<span class="num">{lesson["num"]:02d}</span>'
                f'<span class="ipa">{html.escape(lesson["ipa"])}</span>'
                f'<span class="title"><span class="en">{html.escape(lesson["title_en"])}</span>'
                f'<span class="zh">{html.escape(lesson["title_zh"])}</span></span>'
                f'<span class="patterns">{html.escape(lesson["patterns"])}</span>'
                f'<span class="arrow">›</span></a>'
            )
        sections.append(f'<h2>{heading}</h2><div class="list">{"".join(rows)}</div>')
    page = (
        "<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n"
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, '
        'viewport-fit=cover">\n'
        "<title>自然拼读阅读训练</title>\n"
        '<meta name="claude:viewport-fit-sides" content="cover">\n'
        f"<style>{INDEX_STYLE}</style>\n</head>\n<body>\n"
        '<div class="page"><h1>自然拼读阅读训练</h1>'
        f'{"".join(sections)}</div>\n</body>\n</html>\n'
    )
    (BASE / "index.html").write_text(page, encoding="utf-8")
    print(f"built index.html ({len(lessons)} lessons)")


async def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", type=int, nargs="*", help="lesson numbers")
    parser.add_argument("--skip-audio", action="store_true")
    parser.add_argument("--index-only", action="store_true")
    parser.add_argument(
        "--voices", default=",".join(VOICE_KEYS),
        help="要合成的音色：f,m（默认两套；页面始终内嵌两套）",
    )
    parser.add_argument(
        "--tts", choices=("edge", "azure"), default="azure",
        help="语音后端：azure（默认，F0）或 edge（回退，免费）",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="忽略缓存，重新合成选中的课程",
    )
    args = parser.parse_args()

    voices = [x.strip() for x in args.voices.split(",") if x.strip()]
    bad = [x for x in voices if x not in VOICE_BY_KEY]
    if bad:
        print(f"未知音色：{', '.join(bad)}")
        return 1

    lessons = load_lessons(set(args.only) if args.only else None)
    if args.index_only:
        all_lessons = load_lessons()
        build_index(all_lessons)
        return 0
    failed = []
    if not args.skip_audio:
        failed = await ensure_audio(
            lessons, voices, backend=args.tts, force=args.force)
    built = 0
    for lesson in lessons:
        if all(audio_is_fresh(lesson, voice) for voice in VOICE_KEYS):
            build_lesson(lesson)
            built += 1
        else:
            print(f"skip lesson {lesson['num']}: missing audio")
    if not args.only:
        if built == len(lessons):
            build_index(lessons)
        else:
            print(f"index skipped: {len(lessons) - built} lessons missing audio")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
